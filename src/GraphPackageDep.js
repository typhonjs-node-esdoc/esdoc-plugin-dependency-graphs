import fs            from 'fs-extra';
import path          from 'path';
import _             from 'underscore';

// Stores the path to generated graphs.
let docGraphPath;

const packageLinksAll = [];
const packageLinksDev = [];
const packageLinksMain = [];

const packageLinkMapAll = new Map();
const packageLinkMapDev = new Map();
const packageLinkMapMain = new Map();

const packageNodesAll = [];
const packageNodesDev = [];
const packageNodesMain = [];

const packageNodeMapAll = new Map();
const packageNodeMapDev = new Map();
const packageNodeMapMain = new Map();

export default class GraphPackageDep
{
   constructor(options)
   {
      this.options = options;
   }

   onHandleConfig(ev)
   {
      docGraphPath = `${ev.data.config.destination}${path.sep}graphs${path.sep}`;
   }

   /**
    * The search data file must have JSPM package paths replaced with normalized versions.
    */
   onComplete()
   {
      s_CREATE_GRAPH_JSPM_PACKAGES(this.options);
   }
}

const s_CREATE_GRAPH_JSPM_PACKAGES = (options) =>
{
   const { jspmDevPackageMap, jspmPackageMap, rootPackageName, topLevelPackages } = global['$$esdoc_plugin_jspm'];

   const docGraphPackagePath = `${docGraphPath}jspm_packages${path.sep}`;

   // Ensure graphs directory exists.
   fs.ensureDirSync(docGraphPackagePath);

   const d3Graph = fs.readFileSync('./template/html/d3-graph.js', 'utf8');
   const styleCSS = fs.readFileSync('./template/html/style.css', 'utf8');
   const indexHTML = fs.readFileSync('./template/html/index.html', 'utf8');
   const tableSorter = fs.readFileSync('./template/html/jquery-tablesorter.js', 'utf8');

   // Parse top level packages
   for (const key in topLevelPackages)
   {
      const value = topLevelPackages[key];
      const objectID = s_SANITIZE_CSS(value);

      const packageData = s_PARSE_PACKAGE(value, key);

      if (packageData.type !== 'npm' && packageData.type !== 'github') { continue; }

      if (typeof jspmPackageMap[key] === 'undefined' && typeof jspmDevPackageMap[key] === 'undefined')
      {
         throw new Error(`esdoc-plugin-dependency-graphs: unknown top level package: ${key}`);
      }

      let index = packageNodesAll.length;
      let object = { id: objectID, minLevel: 0, packageScope: 'all', packageData, fixed: false, index };

      if (!packageNodeMapAll.has(objectID))
      {
         if (options.verbose)
         {
            console.log(
             `esdoc-plugin-dependency-graphs: s_CREATE_GRAPH_JSPM_PACKAGES - adding top level (all) node: `
             + `${JSON.stringify(object)}`);
         }
         packageNodesAll.push(object);
         packageNodeMapAll.set(objectID, object);
      }

      if (typeof jspmPackageMap[key] !== 'undefined')
      {
         index = packageNodesMain.length;
         object = { id: objectID, minLevel: 0, packageScope: 'main', packageData, fixed: false, index };

         if (!packageNodeMapMain.has(objectID))
         {
            if (options.verbose)
            {
               console.log('esdoc-plugin-dependency-graphs: s_CREATE_GRAPH_JSPM_PACKAGES - adding top level (dev) node: ' + JSON.stringify(object));
            }

            packageNodesMain.push(object);
            packageNodeMapMain.set(objectID, object);
         }
      }

      if (typeof jspmDevPackageMap[key] !== 'undefined')
      {
         index = packageNodesDev.length;
         object = { id: objectID, minLevel: 0, packageScope: 'dev', packageData, fixed: false, index };

         if (!packageNodeMapDev.has(objectID))
         {
            if (options.verbose)
            {
               console.log('esdoc-plugin-dependency-graphs: s_CREATE_GRAPH_JSPM_PACKAGES - adding top level (main) node: ' + JSON.stringify(object));
            }

            packageNodesDev.push(object);
            packageNodeMapDev.set(objectID, object);
         }
      }
   }

   if (options.verbose)
   {
      console.log(
       'esdoc-plugin-dependency-graphs: s_CREATE_GRAPH_JSPM_PACKAGES --- parsing top level all dependencies');
   }

   // Recursively parse all dependencies
   s_DEPTH_TRAVERSAL_NODES(_.clone(packageNodesAll), packageNodesAll, packageNodeMapAll, packageLinksAll,
    packageLinkMapAll, 'all', 1, options);

   if (options.verbose)
   {
      console.log(
       'esdoc-plugin-dependency-graphs: s_CREATE_GRAPH_JSPM_PACKAGES --- parsing top level dev dependencies');
   }

   // Recursively parse dev dependencies
   s_DEPTH_TRAVERSAL_NODES(_.clone(packageNodesDev), packageNodesDev, packageNodeMapDev, packageLinksDev,
    packageLinkMapDev, 'dev', 1, options);

   if (options.verbose)
   {
      console.log(
       'esdoc-plugin-dependency-graphs: s_CREATE_GRAPH_JSPM_PACKAGES --- parsing top level main dependencies');
   }

   // Recursively parse main dependencies
   s_DEPTH_TRAVERSAL_NODES(_.clone(packageNodesMain), packageNodesMain, packageNodeMapMain, packageLinksMain,
    packageLinkMapMain, 'main', 1, options);

   // Determine max package level for `all` category.
   let maxPackageLevel = 0;
   packageNodesAll.forEach((node) => { if (node.minLevel > maxPackageLevel) { maxPackageLevel = node.minLevel; } });
   packageLinksAll.forEach((link) => { if (link.minLevel > maxPackageLevel) { maxPackageLevel = link.minLevel; } });

   const graphPackageDataAll =
   {
      maxLevel: maxPackageLevel,
      directed: true,
      multigraph: false,
      graph: [],
      nodes: packageNodesAll,
      links: packageLinksAll
   };

   // Determine max package level for `dev` category.
   maxPackageLevel = 0;
   packageNodesDev.forEach((node) => { if (node.minLevel > maxPackageLevel) { maxPackageLevel = node.minLevel; } });
   packageLinksDev.forEach((link) => { if (link.minLevel > maxPackageLevel) { maxPackageLevel = link.minLevel; } });

   const graphPackageDataDev =
   {
      maxLevel: maxPackageLevel,
      directed: true,
      multigraph: false,
      graph: [],
      nodes: packageNodesDev,
      links: packageLinksDev
   };

   // Determine max package level for `main` category.
   maxPackageLevel = 0;
   packageNodesMain.forEach((node) => { if (node.minLevel > maxPackageLevel) { maxPackageLevel = node.minLevel; } });
   packageLinksMain.forEach((link) => { if (link.minLevel > maxPackageLevel) { maxPackageLevel = link.minLevel; } });

   const graphPackageDataMain =
   {
      maxLevel: maxPackageLevel,
      directed: true,
      multigraph: false,
      graph: [],
      nodes: packageNodesMain,
      links: packageLinksMain
   };

   const data =
   {
      css: styleCSS,
      packageDataAll: JSON.stringify(graphPackageDataAll),
      packageDataDev: JSON.stringify(graphPackageDataDev),
      packageDataMain: JSON.stringify(graphPackageDataMain),
      js: tableSorter,
      js2: d3Graph,
      maxPackageLevel: graphPackageDataAll.maxLevel,
      title: rootPackageName
   };

   fs.writeFileSync(`${docGraphPackagePath}index.html`, _.template(indexHTML)(data));
};

/**
 * Provides a recursive function traversing package dependencies.
 *
 * @param {Array<string>}  packageDeps - Array of packages to traverse.
 * @param {number}         depth - Current category depth.
 */
const s_DEPTH_TRAVERSAL_NODES = (packageDeps, packageNodes, packageNodeMap, packageLinks, packageLinkMap, packageScope,
 depth, options) =>
{
   const { childPackageMap } = global['$$esdoc_plugin_jspm'];

   const nextLevelPackages = [];

   for (let cntr = 0; cntr < packageDeps.length; cntr++)
   {
      const packageDep = packageDeps[cntr];

      if (options.verbose)
      {
         console.log(`esdoc-plugin-dependency-graphs: s_DEPTH_TRAVERSAL_NODES - depth: ${depth}; packageDep.index: `
          + `${packageDep.index}; dep: ${JSON.stringify(packageDep)}`);
      }

      const childDepMap = childPackageMap[packageDep.packageData.package];

      if (typeof childDepMap === 'undefined')
      {
         continue;
      }

      // Parse top level packages
      for (const key in childDepMap)
      {
         const value = childDepMap[key];

         const packageData = s_PARSE_PACKAGE(value, key);

         if (packageData.type !== 'npm' && packageData.type !== 'github') { continue; }

         const index = packageNodes.length;
         const objectID = s_SANITIZE_CSS(value);


         const newNode = { id: objectID, minLevel: depth, packageScope, packageData, fixed: false, index };

         if (!packageNodeMap.has(objectID))
         {
            nextLevelPackages.push(newNode);

            if (options.verbose)
            {
               console.log('esdoc-plugin-dependency-graphs: s_DEPTH_TRAVERSAL_NODES - depth: ' + depth + '; adding node: ' + JSON.stringify(newNode));
            }

            packageNodes.push(newNode);
            packageNodeMap.set(objectID, newNode);

            packageLinks.push({ source: packageDep.index, target: index, minLevel: depth });
         }
         else
         {
            // Update min level if current depth is greater than stored depth
            const existingNode = packageNodeMap.get(objectID);

            if (existingNode && newNode.minLevel < existingNode.minLevel)
            {
               existingNode.minLevel = newNode.minLevel;

               if (options.verbose)
               {
                  console.log('esdoc-plugin-dependency-graphs: s_DEPTH_TRAVERSAL_NODES - depth: ' + depth + '; updating min level: ' + JSON.stringify(existingNode));
               }
            }

            packageLinks.push({ source: packageDep.index, target: existingNode.index, minLevel: depth });
         }
      }
   }

   if (nextLevelPackages.length > 0)
   {
      if (options.verbose)
      {
         console.log('esdoc-plugin-dependency-graphs: s_DEPTH_TRAVERSAL_NODES - depth: ' + depth + '; nextLevelPackages: ' + JSON.stringify(nextLevelPackages));
      }

      s_DEPTH_TRAVERSAL_NODES(nextLevelPackages, packageNodes, packageNodeMap, packageLinks, packageLinkMap,
       packageScope, depth + 1, options);
   }
};

const s_PARSE_PACKAGE = (value, key) =>
{
   let values = value.split(/(.*):(.*)@(.*)/);

   const result =
   {
      type: values[1],
      name: values[2],
      fullName: values[2],
      version: values[3],
      package: value,
      isAliased: false
   };

   switch (result.type)
   {
      case 'github':
         result.link = `https://github.com/${result.name}`;

         values = result.name.split(/(.*)\/(.*)/);

         result.owner = values[1];
         result.name = values[2];
         result.fullName = values[2];
         break;

      case 'npm':
         result.link = `https://www.npmjs.com/package/${result.name}`;
         break;

      default:
         throw new Error(`s_PARSE_PACKAGE error, unknown package: ${value}`);
   }

   if (typeof key === 'string' && result.name !== key)
   {
      result.name = key;
      result.isAliased = true;
   }

   return result;
};

/**
 * Replaces semver and other special characters with `-`.
 *
 * @param {string}   prefix - String prefix.
 * @param {object}   object - Node object
 * @returns {string}
 */
const s_SANITIZE_CSS = (value) =>
{
   return value.replace(/(\.|\/|:|@|\^|>=|>|<=|<|~|\*)/gi, '-');
};