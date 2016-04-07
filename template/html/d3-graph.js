(function()
{
   'use strict';
   /* eslint-disable */

   var circleRadius = 6;
   var minScaleExtent = 0.2, maxScaleExtent = 5;
   var graph, layout, zoom, nodes, links;
   var selectedContextNode, selectedDragNode;
   var linkedByIndex = {};
   var graphWidth, graphHeight;
   var data;

   var appOptions =
   {
      currentLevel: 0,
      currentScope: 'all', // Stores package / source scope: main, dev, all
      maxDepthSticky: true,
      showFullNames: false,
      showTableView: false,
      unfreezeOnResize: true
   };

   var appMenuToggleOptions = ['maxDepthSticky', 'showFullNames', 'showTableView', 'unfreezeOnResize'];

   var dataPackageMap =
   {
      'all': getPackageDataAll(),
      'dev': getPackageDataDev(),
      'main': getPackageDataMain()
   };

   var svgElementMap =
   {
      circle: [],
      g: [],
      path: [],
      text: []
   };

   function cerialize(text)
   {
      var svgxml = (new XMLSerializer()).serializeToString(d3.select('svg').node());
      console.log('!!! serialize data -- text: ' + text);
      console.log('!!! svg: ' + svgxml);
      if (data)
      {
         console.log('!!! data.links: ' + JSON.stringify(data.links));
         console.log('!!! data.nodes: ' + JSON.stringify(data.nodes));
      }
   }

   function bootstrap()
   {
      // Controllers
      $('.control-zoom button').on('click', onControlZoomClicked);
      $('.control-level input').on('change', onControlLevelChanged);
      $('.control-deps input').on('click', onControlDepsClicked);
      $('.control-links input').on('click', onControlLinksClicked);
      $('.control-menu li').on('click', onControlMenuClicked);

      $('#contextpopup li[data-action]').on('click', onNodeContextMenuClick);

      appOptions.currentLevel = parseInt($('.control-level input').val());
      appOptions.currentScope = $('.control-deps input:radio[name=dep]:checked').val();

      zoom = d3.behavior.zoom();

      zoom.scaleExtent([minScaleExtent, maxScaleExtent]);
      zoom.on('zoom', onZoomChanged);

      graphWidth = window.innerWidth;
      graphHeight = window.innerHeight;

      // Setup layout
      layout = d3.layout.force()
       .gravity(.05)
       .charge(-300)
       .linkDistance(80)
       .size([graphWidth, graphHeight])
       .on('tick', onTick);

      // Setup drag callbacks for nodes. If a node is clicked and dragged it becomes fixed.
      layout.drag()
       .on('dragstart', function(targetNode)
       {
          d3.event.sourceEvent.stopPropagation();
          d3.select(this).classed('dragging', true).classed('fixed', targetNode.fixed = true);
          detectAllNodesFixed();
       })
       .on('drag', function(targetNode)
       {
          d3.select(this).attr('cx', targetNode.x = d3.event.x).attr('cy', targetNode.y = d3.event.y);
       })
       .on('dragend', function()
       {
          d3.select(this).classed('dragging', false);
       });

      // Setup graph
      d3.select('.graph')
       .append('svg')
       .attr('transform', 'rotate(0)')
       .on('contextmenu', function() { d3.event.preventDefault(); })
       .attr('pointer-events', 'all')
       .call(zoom).on('dblclick.zoom', null);

      // Markers Def
      d3.select('.graph svg')
       .append('defs').selectAll('marker')
       .data(['regular'])
       .enter().append('marker')
       .attr('id', String)
       .attr('viewBox', '0 -5 10 10')
       .attr('refX', 15)
       .attr('refY', -1.5)
       .attr('markerWidth', 6)
       .attr('markerHeight', 6)
       .attr('orient', 'auto')
       .append('path')
       .attr('d', 'M0,-5L10,0L0,5');

      // Top level SVGGElement for dragging / centering graph
      graph = d3.select('.graph svg')
       .append(getSVG('g'))
       .attr('width', graphWidth)
       .attr('height', graphHeight)
       .attr('transform', 'translate(' + zoom.translate() + ')' + ' scale(' + zoom.scale() + ')');

      $('#nodeTable').tablesorter({ sortMultiSortKey: '' });

      updateAll();

      // Center graph w/ zoom fit w/ 1 second transition applied after 4 seconds delay for debounce.
      centerGraph(zoomFit, 1000, 4000);

      d3.select(window).on('resize', onResize);
   }

   /**
    * Centers the graph.
    *
    * @param {number|function}   newScale
    * @param {number|function}   duration
    * @param {number}            delay
    */
   function centerGraph(newScale, duration, delay)
   {
      if (typeof delay === 'function') { delay = delay.call(this); }

      delay = typeof delay === 'number' ? delay : 0;

      setTimeout(function()
      {
         if (typeof newScale === 'function') { newScale = newScale.call(this); }
         if (typeof duration === 'function') { duration = duration.call(this); }

         newScale = typeof newScale === 'number' ? newScale : zoom.scale();
         duration = typeof duration === 'number' ? duration : 200;

         if (typeof newScale !== 'number') { throw new TypeError("centerGraph error: 'newScale' is not a 'number'."); }
         if (typeof duration !== 'number') { throw new TypeError("centerGraph error: 'duration' is not a 'number'."); }

         var bounds = graph.node().getBBox();

         var centerSVGX = (graphWidth * newScale / 2);
         var centerSVGY = (graphHeight * newScale / 2);

         var centerGraphX = (bounds.x * newScale) + (bounds.width * newScale / 2);
         var centerGraphY = (bounds.y * newScale) + (bounds.height * newScale / 2);

         // Translate
         var centerTranslate =
         [
            (graphWidth / 2) - centerSVGX + (centerSVGX - centerGraphX),
            (graphHeight / 2) - centerSVGY + (centerSVGY - centerGraphY)
         ];

         // Store values
         zoom
          .translate(centerTranslate)
          .scale(newScale);

         // Render transition
         graph.transition()
          .duration(duration)
          .attr('transform', 'translate(' + zoom.translate() + ')' + ' scale(' + zoom.scale() + ')');
      }, delay);
   }

   function detectAllNodesFixed()
   {
      if (data)
      {
         var currentNodesFixed = data.allNodesFixed;
         var allNodesFixed = true;
         data.nodes.forEach(function(node) { if (!node.fixed) { allNodesFixed = false; } });
         data.allNodesFixed = allNodesFixed;
         if (currentNodesFixed !== allNodesFixed) { updateMenuUI(); } // Update freeze / unfreeze menu option.
      }
   }

   function fadeRelatedNodes(targetNode, selected, nodes, links)
   {
      var opacity = selected ? 0.1 : 1;

      var elm = findElementByNode('circle', targetNode);

      // Highlight circle
      elm.classed('selected', opacity < 1);

      // Clean
      $('path.link').removeAttr('data-show');

      nodes.style('stroke-opacity', function(otherNode)
      {
         var thisOpacity = isConnected(targetNode, otherNode) ? 1 : opacity;

         this.setAttribute('fill-opacity', thisOpacity);
         this.setAttribute('stroke-opacity', thisOpacity);

         // Depending on opacity add or remove 'dimmed' class.
         this.classList[thisOpacity === 1 ? 'remove' : 'add']('dimmed');

         return thisOpacity;
      });

      links.style('stroke-opacity', function(otherNode)
      {
         if (otherNode.source === targetNode)
         {
            // Highlight target / sources of the link
            var elmNodes = graph.selectAll('.' + formatClassName('node', otherNode.target));
            elmNodes.attr('fill-opacity', 1);
            elmNodes.attr('stroke-opacity', 1);

            elmNodes.classed('dimmed', false);

            // Highlight arrows
            var elmCurrentLink = $('path.link[data-source=' + otherNode.source.index + ']');
            elmCurrentLink.attr('data-show', true);
            elmCurrentLink.attr('marker-end', 'url(#regular)');

            return 1;
         }
         else
         {
            return opacity;
         }
      });

      // Modify all links that have not had 'data-show' added above.
      var elmAllLinks = $('path.link:not([data-show])');
      elmAllLinks.attr('marker-end', opacity === 1 ? 'url(#regular)' : '');
   }

   function findElementByNode(prefix, node)
   {
      var selector = '.' + formatClassName(prefix, node);
      return graph.select(selector);
   }

   /**
    * Replaces semver and other special characters with `-`.
    *
    * @param {string}   prefix - String prefix.
    * @param {object}   object - Node object
    * @returns {string}
    */
   function formatClassName(prefix, object)
   {
      return prefix + '-' + object.id;
   }

   // Pass in the element and its pre-transform coords
   function getElementCoords(element, coords)
   {
      var ctm = element.getCTM(),
       xn = ctm.e + coords.x * ctm.a,
       yn = ctm.f + coords.y * ctm.d;
      return { x: xn, y: yn };
   }

   /**
    * Gets a recycled SVG element from the pool, `svgElementMap`, or creates a new element for the given type. Any
    * data specified by D3 will be copied to the element. Returns a function which is evaluated by D3.
    *
    * @param {string}   elementType - SVG element: `circle`, `g`, `path`, or `text`.
    * @returns {*}
    */
   function getSVG(elementType)
   {
      var returnVal;
      var svgElement;
      var cached;

      switch (elementType)
      {
         case 'circle':
         case 'g':
         case 'path':
         case 'text':
            returnVal = function(data)
            {
               svgElement = svgElementMap[elementType].pop();

               cached = svgElement != null;

               svgElement = svgElement != null ? svgElement : document.createElementNS('http://www.w3.org/2000/svg',
                elementType);

               // Copy data to SVG element.
               if (typeof data === 'object') { for (var key in data) { svgElement.setAttribute(key, data[key]); } }

               return svgElement;
            };
            break;

         default:
            throw new TypeError('getSVG error: unknown elementType.');
      }

      return returnVal;
   }

   /**
    * Hides the node context menu if visible and removes any node highlighting. If an event is supplied it is checked
    * against any existing context menu and is ignored if the context menu is within the parent hierarchy.
    *
    * @param {object|undefined}  event - Optional event
    */
   function hideNodeContextMenu(event)
   {
      // Provide an early out if there is no selected context node.
      if (typeof selectedContextNode === 'undefined') { return; }

      var contextMenuButton = $('#context-menu');
      var popupmenu = $('#contextpopup .mdl-menu__container');

      // If an event is defined then make sure it isn't targeting the context menu.
      if (event)
      {
         event.preventDefault();

         // Picked element is not the menu
         if (!$(event.target).parents('#contextpopup').length > 0)
         {
            // Hide menu if currently visible
            if (popupmenu.hasClass('is-visible')) { contextMenuButton.click(); }

            fadeRelatedNodes(selectedContextNode, false, nodes, links);
            selectedContextNode = undefined;
         }
      }
      else // No event defined so always close context menu and remove node highlighting.
      {
         // Hide menu if currently visible
         if (popupmenu.hasClass('is-visible')) { contextMenuButton.click(); }

         fadeRelatedNodes(selectedContextNode, false, nodes, links);
         selectedContextNode = undefined;
      }
   }

   function isConnected(a, b)
   {
      return a.index === b.index || linkedByIndex[a.index + ',' + b.index];
   }

   /**
    * Returns whether there is a currently selected node (drag or context).
    *
    * @returns {boolean}
    */
   function isNodeSelected()
   {
      return typeof selectedDragNode !== 'undefined' || typeof selectedContextNode !== 'undefined';
   }

   function onControlDepsClicked()
   {
      // Do nothing if scope has not changed
      if (this.value === appOptions.currentScope) { return; }

      // If max depth is set to sticky and current level is equal max level of old scope then set max level for
      // the new scope.
      if (appOptions.maxDepthSticky && appOptions.currentLevel === dataPackageMap[appOptions.currentScope].maxLevel)
      {
         appOptions.currentLevel = dataPackageMap[this.value].maxLevel
      }

      appOptions.currentScope = this.value;

      var maxLevel = dataPackageMap[appOptions.currentScope].maxLevel;

      // Adjust current level if it is greater than max level for current scope.
      if (appOptions.currentLevel > maxLevel) { appOptions.currentLevel = maxLevel; }

      // Update control level UI based on current and max level for given scope.
      $('.control-level input').attr({ max: maxLevel });
      $('.control-level input').val(appOptions.currentLevel);
      $('.control-level label').html(appOptions.currentLevel);

      // Load graph data
      updateAll({ redrawOnly: true });

      // Center graph w/ zoom fit w/ 1 second transition applied after a potential 2 seconds delay for debounce.
      centerGraph(zoomFit, 1000, data.allNodesFixed ? 0 : 2000);
   }

   function onControlLevelChanged()
   {
      appOptions.currentLevel = parseInt(this.value);

      $('.control-level input').val(appOptions.currentLevel);
      $('.control-level label').html(appOptions.currentLevel);

      updateAll({ redrawOnly: true });

      // Center graph w/ zoom fit w/ 1 second transition applied after a potential 2 seconds delay for debounce.
      centerGraph(zoomFit, 1000, data.allNodesFixed ? 0 : 2000);
   }

   function onControlLinksClicked()
   {
      reverseGraphLinks();

      renderGraph({ redrawOnly: true });
   }

   function onControlMenuClicked()
   {
      switch ($(this).data('action'))
      {
         case 'toggleFreezeAllNodes':
            setNodesFixed(!data.allNodesFixed);
            break;

         case 'unfreezeOnResize':
            appOptions.unfreezeOnResize = !appOptions.unfreezeOnResize;
            break;

         case 'showFullNames':
            appOptions.showFullNames = !appOptions.showFullNames;
            updateAll({ redrawOnly: true });
            break;

         case 'showTableView':
            appOptions.showTableView = !appOptions.showTableView;
            $('.control-table').toggleClass('hidden', !appOptions.showTableView);
            updateTableUIExtent();
            break;

         case 'maxDepthSticky':
            appOptions.maxDepthSticky = !appOptions.maxDepthSticky;
            break;
      }

      // Defer updating menu UI until menu is hidden.
      setTimeout(updateMenuUI, 200);
   }

   function onControlTableRowContextClick(node, event)
   {
      event.preventDefault(); // Prevents default browser context menu from showing.
      onNodeContextClick(node, { x: event.pageX, y: event.pageY });
   }

   function onControlTableRowMouseOver(nodes, links, node, enter)
   {
      // Hide the node context menu if currently showing when a new table row / node is moused over.
      if (node !== selectedContextNode) { hideNodeContextMenu(event); }

      onNodeMouseOverOut(nodes, links, enter, node);
   }

   function onControlZoomClicked()
   {
      var newScale = 1;
      var scalePercentile = 0.20;

      // Add or subtract scale percentile from current scale value.
      switch ($(this).data('action'))
      {
         case 'zoom_in':
            newScale = Math.max(Math.min(zoom.scale() * (1 + scalePercentile), maxScaleExtent), minScaleExtent);
            break;

         case 'zoom_out':
            newScale = Math.max(zoom.scale() * (1 - scalePercentile), minScaleExtent);
            break;

         case 'zoom_all_out':
            newScale = zoomFit();
            break;
      }

      centerGraph(newScale);
   }

   function onNodeContextMenuClick()
   {
      // When a context menu is selected remove node highlighting.
      hideNodeContextMenu();

      switch ($(this).data('action'))
      {
         case 'openSCMLink':
            var link = $(this).data('extra');

            if (typeof link === 'string')
            {
               window.open(link, '_blank', 'location=yes,menubar=yes,scrollbars=yes,status=yes');
            }
            break;
      }
   }

   /**
    * Shows the node context menu
    *
    * @param {object}   targetNode - The target node.

    * @param {object}   coords - Object containing x / y position for context menu; if not provided Node position
    *                            determines coords.
    */
   function onNodeContextClick(targetNode, coords)
   {
      // Hides any existing node context menu.
      hideNodeContextMenu();

      if (typeof coords !== 'object')
      {
         coords = getElementCoords(this, { x: this.getAttribute('cx'), y: this.getAttribute('cy') });
      }

      var popupmenu = $('#contextpopup .mdl-menu__container');

      popupmenu.find('li').each(function( index )
      {
         switch (index)
         {
            case 0:
               $(this).text('Open on ' + targetNode.packageData.type);
               $(this).data('extra', targetNode.packageData.link);
               break;

            case 1:
               $(this).text('Fullname: ' + targetNode.packageData.fullName);
               break;

            case 2:
               $(this).text('Version: ' + targetNode.packageData.version);
               break;
         }
      });

      // Wrapping in a 100ms timeout allows MDL to draw animation when showing a context menu after one has been hidden.
      setTimeout(function()
      {
         // Assign new selected context node and highlight related nodes.
         selectedContextNode = targetNode;
         fadeRelatedNodes(selectedContextNode, true, nodes, links);

         var contextMenuButton = $("#context-menu");
         contextMenuButton.click();

         setTimeout(function()
         {
            popupmenu.parent().css({ position: 'relative' });
            popupmenu.css({ left: coords.x, top: coords.y, position:'absolute' });
         }, 0);
      }, 100);
   }

   function onNodeMouseDown(nodes, links, targetNode)
   {
      hideNodeContextMenu();

      // Only select / drag nodes with left clicked otherwise stop propagation of event.
      if (d3.event.button === 0)
      {
         selectedDragNode = targetNode;

         // Select / highlight related nodes or remove attributes based on enter state.
         fadeRelatedNodes(targetNode, true, nodes, links);
      }
      else
      {
         d3.event.stopPropagation();
      }
   }

   function onNodeMouseOverOut(nodes, links, enter, targetNode)
   {
      // If there is an existing selected node then exit early.
      if (isNodeSelected()) { return; }

      // Select / highlight related nodes or remove attributes based on enter state.
      fadeRelatedNodes(targetNode, enter, nodes, links);
   }

   function onResize()
   {
      graphWidth = window.innerWidth;
      graphHeight = window.innerHeight;

      graph.attr('width', graphWidth).attr('height', graphHeight);

      layout.size([graphWidth, graphHeight]).resume();

      updateMenuUI();

      updateTableUIExtent();

      centerGraph(zoomFit, 1000, data.allNodesFixed ? 0 : 2000);
   }

   function onTick()
   {
      nodes.attr('cx', function(node) { return node.x; })
       .attr('cy', function(node) { return node.y; })
       .attr('transform', function(node) { return 'translate(' + node.x + ',' + node.y + ')'; });

      // Pull data from data.nodes array.
      links.attr('d', function(link)
      {
         var sourceX = data.nodes[link.source.index].x;
         var sourceY = data.nodes[link.source.index].y;
         var targetX = data.nodes[link.target.index].x;
         var targetY = data.nodes[link.target.index].y;

         var dx = targetX - sourceX,
          dy = targetY - sourceY,
          dr = Math.sqrt(dx * dx + dy * dy);
         return 'M' + sourceX + ',' + sourceY + 'A' + dr + ',' + dr + ' 0 0,1 ' + targetX + ',' + targetY;
      });
   }

   function onZoomChanged()
   {
      var newScale = Math.max(d3.event.scale, minScaleExtent);

      zoom.scale(newScale);

      graph.attr('transform', 'translate(' + d3.event.translate + ')' + ' scale(' + newScale + ')');
   }

   /**
    * Recycles all SVG elements above the top level SVGGElement defining the graph.
    */
   function recycleGraph()
   {
      var childNodes = graph.selectAll('g > *').remove();

      if (!Array.isArray(childNodes) && !Array.isArray(childNodes['0'])) { return; }

      // Get the child nodes group from selection.
      childNodes = childNodes['0'];

      for (var cntr = 0; cntr < childNodes.length; cntr++)
      {
         var childNode = childNodes[cntr];

         if (childNode instanceof SVGPathElement) { svgElementMap['path'].push(childNode); }
         else if (childNode instanceof SVGCircleElement) { svgElementMap['circle'].push(childNode); }
         else if (childNode instanceof SVGTextElement) { svgElementMap['text'].push(childNode); }
         else if (childNode instanceof SVGGElement)
         {
            childNode.removeAttribute('transform');  // Must remove current transform.
            svgElementMap['g'].push(childNode);
         }
      }
   }

   function renderGraph(options)
   {
      options = typeof options === 'object' ? options : {};
      options.redrawOnly = typeof options.redrawOnly === 'boolean' ? options.redrawOnly : false;

      // Recycle all SVG elements above the first SVGGElement.
      recycleGraph();

      // Lines
      // Note: on second render link.source / target will be an object instead of a number.
      links = graph.append(getSVG('g')).selectAll('line')
       .data(data.links)
       .enter().append(getSVG('path'))
       .attr('class', 'link')
       .attr('marker-end', function() { return 'url(#regular)'; })
       .attr('data-source', function(link)
       {
          return typeof link.source === 'number' ? link.source : link.source.index;
       })
       .attr('data-target', function(link)
       {
          return typeof link.target === 'number' ? link.target : link.target.index;
       });

      // Nodes
      nodes = graph.append(getSVG('g')).selectAll('node')
       .data(data.nodes)
       .enter().append(getSVG('g'))
       .call(layout.drag)
       .attr('class', 'node');

      // Circles
      nodes.attr('class', function(node) { return formatClassName('node', node); });
      nodes.append(getSVG('circle'))
       .attr('id', function(node) { return formatClassName('id', node); })
       .attr('class', function(node) { return formatClassName('circle', node) + ' ' + node.packageData.type; })
       .attr('r', circleRadius)
       .on('contextmenu', onNodeContextClick)
       .on('mousedown', onNodeMouseDown.bind(this, nodes, links))
       .on('mouseover', onNodeMouseOverOut.bind(this, nodes, links, true))
       .on('mouseout', onNodeMouseOverOut.bind(this, nodes, links, false))
       .on('dblclick.zoom', function(node) // Centers view on node.
       {
          d3.event.stopPropagation();

          var dcx = (window.innerWidth / 2 - node.x * zoom.scale());
          var dcy = (window.innerHeight / 2 - node.y * zoom.scale());

          zoom.translate([dcx, dcy]);

          graph.transition()
           .duration(500)
           .attr('transform', 'translate('+ dcx + ',' + dcy  + ')scale(' + zoom.scale() + ')');
       });

      // A copy of the text with a thick white stroke for legibility.
      nodes.append(getSVG('text'))
       .attr('x', 15)
       .attr('y', '.31em')
       .attr('class', function(node) { return 'shadow ' + formatClassName('text', node); })
       .text(function(node)
       {
          return (appOptions.showFullNames ? node.packageData.fullName : node.packageData.name) +
           ' (' + node.minLevel +')';
       });

      nodes.append(getSVG('text'))
       .attr('class', function(node)
       {
          return node.packageData.isAliased ? 'isAliased ' : '' + formatClassName('text', node);
       })
       .attr('x', 15)
       .attr('y', '.31em')
       .text(function(node)
       {
          return (appOptions.showFullNames ? node.packageData.fullName : node.packageData.name) +
           ' (' + node.minLevel +')';
       });

      // Set the force layout nodes / links and start the bounce.
      layout.nodes(data.nodes);
      layout.links(data.links);
      layout.start();

      linkedByIndex = {};

      // Build linked index
      data.links.forEach(function(node) { linkedByIndex[node.source.index + ',' + node.target.index] = true; });

      // Set a low alpha to provide minimal bounce when just redrawing.
      if (options.redrawOnly) { layout.alpha(0.01); }
   }

   /**
    * Reverses all graph links.
    */
   function reverseGraphLinks()
   {
      for (var key in dataPackageMap)
      {
         var graphData = dataPackageMap[key];

         graphData.links.forEach(function(link)
         {
            var linkSource = link.source;
            link.source = link.target;
            link.target = linkSource;
         });
      }
   }

   function setNodesFixed(fixed)
   {
      // Resets any fixed node state.
      if (nodes) { nodes.each(function(node) { d3.select(this).classed('fixed', node.fixed = fixed); }); }

      // Copy existing sim data to any package scope that contains the same node ID.
      for (var key in dataPackageMap) { dataPackageMap[key].nodes.forEach(function(node) { node.fixed = fixed; }); }

      if (data) { data.allNodesFixed = fixed; }
   }

   /**
    * Helper function that simply defers to the standard update / render process.
    *
    * @param renderOptions
    */
   function updateAll(renderOptions)
   {
      // Load graph data
      updateGraphData();

      renderGraph(renderOptions);

      updateMenuUI();

      updateTableUI();
   }

   function updateGraphData()
   {
      // Copy existing data / node parameters to new filtered data;
      if (data)
      {
         var existingNodeSimMap = {};

         // Collect existing simulation data.
         data.nodes.forEach(function(node)
         {
            existingNodeSimMap[node.id] =
            {
               weight: node.weight,
               x: node.x,
               y: node.y,
               px: node.px,
               py: node.py,
               fixed: node.fixed ? node.fixed : false
            };
         });

         // Copy existing sim data to any package scope that contains the same node ID.
         for (var mapKey in dataPackageMap)
         {
            var graphData = dataPackageMap[mapKey];

            graphData.nodes.forEach(function(node)
            {
               if (existingNodeSimMap[node.id])
               {
                  for (var key in existingNodeSimMap[node.id]) { node[key] = existingNodeSimMap[node.id][key]; }
               }
            });
         }
      }

      var allNodesFixed = true;

      // Set new data
      data =
      {
         directed: dataPackageMap[appOptions.currentScope].directed,
         multigraph: dataPackageMap[appOptions.currentScope].multigraph,
         graph: dataPackageMap[appOptions.currentScope].graph,
         links: dataPackageMap[appOptions.currentScope].links.filter(function(link)
         {
            return link.minLevel <= appOptions.currentLevel;
         }),
         nodes: dataPackageMap[appOptions.currentScope].nodes.filter(function(node)
         {
            if (typeof node.fixed === 'undefined' || node.fixed === false) { allNodesFixed = false; }
            return node.minLevel <= appOptions.currentLevel;
         })
      };

      data.allNodesFixed = allNodesFixed;
   }

   function updateMenuUI()
   {
      if (data)
      {
         $('.control-menu li[data-action=toggleFreezeAllNodes]').html(data.allNodesFixed ?
          'Unfreeze nodes' : 'Freeze nodes');
      }

      appMenuToggleOptions.forEach(function(key)
      {
         var icon = appOptions[key] ? 'check_box' : 'check_box_outline_blank';
         $('.control-menu li[data-action=' + key + '] i').html(icon);
      });
   }

   function updateTableUI()
   {
      var table = $('.control-table tbody');

      table.off('mouseenter', 'tr', onControlTableRowMouseOver);
      table.off('mouseleave', 'tr', onControlTableRowMouseOver);
      table.off('contextmenu', 'tr', onControlTableRowContextClick);

      table.empty();

      if (data)
      {
         data.nodes.forEach(function(node)
         {
            var nd = node.packageData;
            var name = appOptions.showFullNames ? nd.fullName : nd.name;
            var isAliased = nd.isAliased ? ' isAliased' : '';

            var tr = $(
             '<tr>' +
                '<td class="mdl-data-table__cell--non-numeric' + isAliased + '">' + name + '</td>' +
                '<td class="mdl-data-table__cell--non-numeric">' + nd.type + '</td>' +
                '<td class="mdl-data-table__cell--non-numeric">' + nd.version + '</td>' +
                '<td class="mdl-data-table__cell--non-numeric">' + node.minLevel + '</td>' +
             '</tr>');

            table.append(tr);

            tr.on('mouseenter', onControlTableRowMouseOver.bind(this, nodes, links, node, true));
            tr.on('mouseleave', onControlTableRowMouseOver.bind(this, nodes, links, node, false));
            tr.on('contextmenu', onControlTableRowContextClick.bind(this, node));
         });

         // Removes sort order for any header and signals update for new data
         $('#nodeTable th').removeClass('headerSortDown');
         $('#nodeTable th').removeClass('headerSortUp');
         $('#nodeTable').trigger('update');

         updateTableUIExtent();
      }
   }

   /**
    * Updates the node table max-height enabling scrolling as necessary.
    */
   function updateTableUIExtent()
   {
      var tableDiv = $('.control-table-inner');
      var nodeTable = $('#nodeTable');

      var tableHeight = nodeTable.height();

      var offset = tableDiv.offset();
      var maxTableHeight = window.innerHeight - offset.top - 20;

      tableDiv.css('max-height', maxTableHeight);
      nodeTable.css('margin-right', tableHeight > maxTableHeight ? '10px' : '0px');
   }

   function zoomFit()
   {
      var bounds = graph.node().getBBox();
      var parent = graph.node().parentElement;
      var fullWidth = parent.clientWidth, fullHeight = parent.clientHeight;
      var width = bounds.width, height = bounds.height;

      if (width === 0 || height === 0) { return 1; } // nothing to fit

      var scale = 0.75 / Math.max(width / fullWidth, height / fullHeight);

      scale = Math.max(Math.min(scale, maxScaleExtent), minScaleExtent);

      return scale;
   }

   // Prevent default browser context menu from being triggered.
   $(document).bind('contextmenu', function(event) { event.preventDefault(); });

   // Properly handle closing context menu when document mouse down clicked
   // This works when a node context click occurs because the new context menu is shown with a small timeout.
   $(document).bind('mousedown', hideNodeContextMenu);

   /**
    * This function removes the selected drag node highlighting if document mouse up event occurs outside the window
    * bounds the distance between the document mouse up value is greater than the radius of the current location
    * of the circle SVG element.
    */
   $(document).bind('mouseup', function(event)
   {
      if (typeof selectedDragNode !== 'undefined')
      {
         var pageX = event.pageX;
         var pageY = event.pageY;

         // Detect a drag / mouse up outside window bounds and automatically reset.
         if (pageX < 0 || pageY < 0 || pageX > window.innerWidth || pageY > window.innerHeight)
         {
            fadeRelatedNodes(selectedDragNode, false, nodes, links);
            selectedDragNode = undefined;
            return;
         }

         // Otherwise verify if the mouse up distance is greater than the SVGCircleElement location.

         var elm = findElementByNode('circle', selectedDragNode);

         var dragNode = elm.node();

         var coords = getElementCoords(dragNode, { x: dragNode.getAttribute('cx'), y: dragNode.getAttribute('cy') });

         var a = pageX - coords.x;
         var b = pageY - coords.y;

         var distance = Math.sqrt(a * a + b * b);

         // Remove node highlight and related nodes
         if (distance > circleRadius) { fadeRelatedNodes(selectedDragNode, false, nodes, links); }

         selectedDragNode = undefined;
      }
   });

   bootstrap();
})();