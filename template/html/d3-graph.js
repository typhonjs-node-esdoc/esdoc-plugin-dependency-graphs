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
      showTableView: false,
      unfreezeOnResize: true
   };

   var appMenuToggleOptions = ['maxDepthSticky', 'showTableView', 'unfreezeOnResize'];

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
      updateMenuUI();

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
       .on('dragstart', function(d)
       {
          d3.event.sourceEvent.stopPropagation();
          d3.select(this).classed('dragging', true).classed('fixed', d.fixed = true);
       })
       .on('drag', function(d)
       {
          d3.select(this).attr('cx', d.x = d3.event.x).attr('cy', d.y = d3.event.y);
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

      // Load graph data
      updateGraphData();

      renderGraph();

      updateTableUI();

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

         // Translate
         var centerTranslate =
         [
            (graphWidth / 2) - (graphWidth * newScale / 2),
            (graphHeight / 2) - (graphHeight * newScale / 2)
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

   function fadeRelatedNodes(d, selected, nodes, links)
   {
      var opacity = selected ? 0.1 : 1;

      var elm = findElementByNode('circle', d);

      // Highlight circle
      elm.classed('selected', opacity < 1);

      // Clean
      $('path.link').removeAttr('data-show');

      nodes.style('stroke-opacity', function(o)
      {
         var thisOpacity = isConnected(d, o) ? 1 : opacity;

         this.setAttribute('fill-opacity', thisOpacity);
         this.setAttribute('stroke-opacity', thisOpacity);

         // Depending on opacity add or remove 'dimmed' class.
         this.classList[thisOpacity === 1 ? 'remove' : 'add']('dimmed');

         return thisOpacity;
      });

      links.style('stroke-opacity', function(o)
      {
         if (o.source === d)
         {
            // Highlight target/sources of the link
            var elmNodes = graph.selectAll('.' + formatClassName('node', o.target));
            elmNodes.attr('fill-opacity', 1);
            elmNodes.attr('stroke-opacity', 1);

            elmNodes.classed('dimmed', false);

            // Highlight arrows
            var elmCurrentLink = $('path.link[data-source=' + o.source.index + ']');
            elmCurrentLink.attr('data-show', true);
            elmCurrentLink.attr('marker-end', 'url(#regular)');

            return 1;
         }
         else
         {
            var elmAllLinks = $('path.link:not([data-show])');

            elmAllLinks.attr('marker-end', opacity === 1 ? 'url(#regular)' : '');

            return opacity;
         }
      });
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

      // Update control level UI based on current and max level for given package scope.
      $('.control-level input').attr({ max: maxLevel });
      $('.control-level input').val(appOptions.currentLevel);
      $('.control-level label').html(appOptions.currentLevel);

      // Load graph data
      updateGraphData();

      renderGraph();

      updateTableUI();

      // Center graph w/ zoom fit w/ 1 second transition applied after 4 seconds delay for debounce.
      centerGraph(zoomFit, 1000, data.allNodesFixed ? 0 : 4000);
   }

   function onControlLevelChanged()
   {
      appOptions.currentLevel = parseInt(this.value);

      $('.control-level input').val(appOptions.currentLevel);
      $('.control-level label').html(appOptions.currentLevel);

      // Load graph data
      updateGraphData();

      renderGraph({ redrawOnly: true });

      updateTableUI();

      // Center graph w/ zoom fit w/ 200 millisecond transition applied after half second delay for debounce.
      centerGraph(zoomFit, 200, data.allNodesFixed ? 0 : 500);
   }

   function onControlLinksClicked()
   {
      reverseGraphLinks();

      renderGraph({ redrawOnly: true });

      updateTableUI();
   }

   function onControlMenuClicked()
   {
      switch ($(this).data('action'))
      {
         case 'freezeAllNodes':
            setNodesFixed(true);
            break;

         case 'unfreezeAllNodes':
            setNodesFixed(false);
            break;

         case 'unfreezeOnResize':
            appOptions.unfreezeOnResize = !appOptions.unfreezeOnResize;
            break;

         case 'showTableView':
            appOptions.showTableView = !appOptions.showTableView;
            $('.control-table').toggleClass('hidden', !appOptions.showTableView);
            break;

         case 'maxDepthSticky':
            appOptions.maxDepthSticky = !appOptions.maxDepthSticky;
            break;
      }

      updateMenuUI();
   }

   function onControlTableRowContextClick(node, e)
   {
      onNodeContextClick(node, { x: e.pageX, y: e.pageY });
   }

   function onControlTableRowMouseOver(nodes, links, node, enter)
   {
console.log('!! onControlTableRowMouseOver - node name: ' + node.packageData.name +'; enter: ' +enter);
      if (typeof selectedContextNode !== 'undefined' && selectedContextNode !== node)
      {
         var contextMenuButton = $('#context-menu');
         var popupmenu = $('#contextpopup .mdl-menu__container');

         // Picked element is not the menu
         if (!$(event.target).parents('#contextpopup').length > 0)
         {
            // Hide menu if currently visible
            if (popupmenu.hasClass('is-visible')) { contextMenuButton.click(); }

            fadeRelatedNodes(selectedContextNode, false, nodes, links);
            selectedContextNode = undefined;
         }
      }

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
      if (selectedContextNode)
      {
         fadeRelatedNodes(selectedContextNode, false, nodes, links);
         selectedContextNode = undefined;
      }

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
    * @param {object}   d - A node.

    * @param {object}   coords - Object containing x / y position for context menu; if not provided Node position
    *                            determines coords.
    */
   function onNodeContextClick(d, coords)
   {
      // Only accessed if onNodeContextClick called from D3.
      if (d3.event) { d3.event.preventDefault(); }

      var contextMenuButton = $("#context-menu");

      var popupmenu = $('#contextpopup .mdl-menu__container');

      // Hide menu if currently visible
      if (popupmenu.hasClass('is-visible')) { contextMenuButton.click(); }

      if (typeof coords !== 'object')
      {
         coords = getElementCoords(this, { x: this.getAttribute('cx'), y: this.getAttribute('cy') });
      }

      popupmenu.find('li').each(function( index )
      {
         switch (index)
         {
            case 0:
               $(this).text('Open on ' + d.packageData.type);
               $(this).data('extra', d.packageData.link);
               break;

            case 1:
               $(this).text('Fullname: ' + d.packageData.fullName);
               break;

            case 2:
               $(this).text('Version: ' + d.packageData.version);
               break;
         }
      });

      if (selectedContextNode) { fadeRelatedNodes(selectedContextNode, false, nodes, links); }

      selectedContextNode = d;
      fadeRelatedNodes(selectedContextNode, true, nodes, links);

      // Wrapping in a 100ms timeout allows MDL to draw animation when showing a context menu after one has been hidden.
      setTimeout(function()
      {
         contextMenuButton.click();

         setTimeout(function()
         {
            popupmenu.parent().css({ position: 'relative' });
            popupmenu.css({ left: coords.x, top: coords.y, position:'absolute' });
         }, 0);
      }, 100);
   }

   function onNodeMouseDown(nodes, links, d)
   {
      if (typeof selectedContextNode !== 'undefined')
      {
         var contextMenuButton = $('#context-menu');
         var popupmenu = $('#contextpopup .mdl-menu__container');

         // Hide menu if currently visible
         if (popupmenu.hasClass('is-visible')) { contextMenuButton.click(); }

         fadeRelatedNodes(selectedContextNode, false, nodes, links);
         selectedContextNode = undefined;
      }

      if (d3.event.button === 0)
      {
         selectedDragNode = d;

         // Select / highlight related nodes or remove attributes based on enter state.
         fadeRelatedNodes(d, true, nodes, links);
      }
      else
      {
         d3.event.stopPropagation();
      }
   }

   function onNodeMouseOverOut(nodes, links, enter, d)
   {
console.log('!! onNodeMouseOverOut - enter: ' + enter + '; d.name: ' + d.packageData.name +'; isNodeSelected: ' + isNodeSelected() +'; selectedDragNode: ' + selectedDragNode +'; selectedContextNode: ' + selectedContextNode);

      // If there is an existing selected node then exit early.
      if (isNodeSelected()) { return; }

      // Select / highlight related nodes or remove attributes based on enter state.
      fadeRelatedNodes(d, enter, nodes, links);
   }

   function onResize()
   {
      graphWidth = window.innerWidth;
      graphHeight = window.innerHeight;

      graph.attr('width', graphWidth).attr('height', graphHeight);

      layout.size([graphWidth, graphHeight]).resume();

      // Potentially resets any fixed node state.
      if (appOptions.unfreezeOnResize) { setNodesFixed(false); }

      centerGraph(zoomFit());
   }

   function onTick()
   {
      nodes.attr('cx', function(d) { return d.x; })
       .attr('cy', function(d) { return d.y; })
       .attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });

      // Pull data from data.nodes array.
      links.attr('d', function(d)
      {
         var sourceX = data.nodes[d.source.index].x;
         var sourceY = data.nodes[d.source.index].y;
         var targetX = data.nodes[d.target.index].x;
         var targetY = data.nodes[d.target.index].y;

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

//TODO SN
      selectedDragNode = undefined;

      // Recycle all SVG elements above the first SVGGElement.
      recycleGraph();

      // Lines
      links = graph.append(getSVG('g')).selectAll('line')
       .data(data.links)
       .enter().append(getSVG('path'))
       .attr('class', 'link')
       .attr('data-target', function(o) { return o.target; })
       .attr('data-source', function(o) { return o.source; })
       .attr('marker-end', function() { return 'url(#regular)'; });

      // Nodes
      nodes = graph.append(getSVG('g')).selectAll('node')
       .data(data.nodes)
       .enter().append(getSVG('g'))
       .call(layout.drag)
       .attr('class', 'node');

      // Circles
      nodes.attr('class', function(d) { return formatClassName('node', d); });
      nodes.append(getSVG('circle'))
       .attr('id', function(d) { return formatClassName('id', d); })
       .attr('class', function(d) { return formatClassName('circle', d) + ' ' + d.packageData.type; })
       .attr('r', circleRadius)
       .on('contextmenu', onNodeContextClick)
       .on('mousedown', onNodeMouseDown.bind(this, nodes, links))
       .on('mouseover', onNodeMouseOverOut.bind(this, nodes, links, true))
       .on('mouseout', onNodeMouseOverOut.bind(this, nodes, links, false))
       .on('dblclick.zoom', function(d) // Centers view on node.
       {
          d3.event.stopPropagation();

          var dcx = (window.innerWidth / 2 - d.x * zoom.scale());
          var dcy = (window.innerHeight / 2 - d.y * zoom.scale());

          zoom.translate([dcx, dcy]);

          graph.transition()
           .duration(500)
           .attr('transform', 'translate('+ dcx + ',' + dcy  + ')scale(' + zoom.scale() + ')');
       });

      // A copy of the text with a thick white stroke for legibility.
      nodes.append(getSVG('text'))
       .attr('x', 15)
       .attr('y', '.31em')
       .attr('class', function(d) { return 'shadow ' + formatClassName('text', d); })
       .text(function(d) { return d.packageData.name + ' (' + d.minLevel +')'; });

      nodes.append(getSVG('text'))
       .attr('class', function(d) { return d.packageData.isAliased ? 'isAliased ' : '' + formatClassName('text', d); })
       .attr('x', 15)
       .attr('y', '.31em')
       .text(function(d) { return d.packageData.name + ' (' + d.minLevel +')'; });

      // Set the force layout nodes / links and start the bounce.
      layout.nodes(data.nodes);
      layout.links(data.links);
      layout.start();

      linkedByIndex = {};

      // Build linked index
      data.links.forEach(function(d) { linkedByIndex[d.source.index + ',' + d.target.index] = true; });

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
      if (nodes) { nodes.each(function(d) { d3.select(this).classed('fixed', d.fixed = fixed); }); }

      // Copy existing sim data to any package scope that contains the same node ID.
      for (var key in dataPackageMap) { dataPackageMap[key].nodes.forEach(function(node) { node.fixed = fixed; }); }

      if (data) { data.allNodesFixed = fixed; }
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
            { weight: node.weight, x: node.x, y: node.y, px: node.px, py: node.py, fixed: node.fixed ? node.fixed : 0 };
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
            var pd = node.packageData;

            var tr = $(
             '<tr>' +
                '<td class="mdl-data-table__cell--non-numeric">' + pd.name + '</td>' +
                '<td class="mdl-data-table__cell--non-numeric">' + pd.type + '</td>' +
                '<td class="mdl-data-table__cell--non-numeric">' + pd.version + '</td>' +
                '<td class="mdl-data-table__cell--non-numeric">' + node.minLevel + '</td>' +
             '</tr>');

            table.append(tr);

            tr.on('mouseenter', onControlTableRowMouseOver.bind(this, nodes, links, node, true));
            tr.on('mouseleave', onControlTableRowMouseOver.bind(this, nodes, links, node, false));
            tr.on('contextmenu', onControlTableRowContextClick.bind(this, node));
         });
      }
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

   /**
    * This function removes the selected node highlighting if a node is currently selected and the distance between
    * the document mouse up value is greater than the radius of the current location of the circle SVG element.
    */
   $(document).bind('mousedown', function(event)
   {
      if (typeof selectedContextNode !== 'undefined')
      {
         var contextMenuButton = $('#context-menu');
         var popupmenu = $('#contextpopup .mdl-menu__container');

         // Picked element is not the menu
         if (!$(event.target).parents('#contextpopup').length > 0)
         {
            // Hide menu if currently visible
            if (popupmenu.hasClass('is-visible')) { contextMenuButton.click(); }

            fadeRelatedNodes(selectedContextNode, false, nodes, links);
            selectedContextNode = undefined;
         }
      }
   });

   /**
    * This function removes the selected node highlighting if a node is currently selected and the distance between
    * the document mouse up value is greater than the radius of the current location of the circle SVG element.
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

         var elmAttr = elm["0"]["0"];

         var coords = getElementCoords(elmAttr, { x: elmAttr.getAttribute('cx'), y: elmAttr.getAttribute('cy') });

         var a = pageX - coords.x;
         var b = pageY - coords.y;

         var distance = Math.sqrt(a * a + b * b);

console.log('!!!! document mouse up - page x: ' + pageX +'; page y: ' + pageY +'; elm coords x: ' + coords.x +'; y: ' + coords.y +'; distance: ' + distance);

         // Remove highlight circle and related nodes
         if (distance > circleRadius) { fadeRelatedNodes(selectedDragNode, false, nodes, links); }

         selectedDragNode = undefined;
      }
   });

   // Properly handle closing context menu when document context clicked
   $(document).bind('contextmenu', function(event)
   {
      event.preventDefault();

      var contextMenuButton = $('#context-menu');
      var popupmenu = $('#contextpopup .mdl-menu__container');

      // Picked element is not the menu
      if (!$(event.target).parents('#contextpopup').length > 0)
      {
         // Hide menu if currently visible
         if (popupmenu.hasClass('is-visible'))
         {
            contextMenuButton.click();

            if (selectedContextNode)
            {
               fadeRelatedNodes(selectedContextNode, false, nodes, links);
               selectedContextNode = undefined;
            }
         }
      }
   });

   bootstrap();
})();