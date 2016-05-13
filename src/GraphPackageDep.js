import fs            from 'fs-extra';
import path          from 'path';
import _             from 'underscore';

// Stores the path to generated graphs.
let docGraphPath;

const packageLinksAll = [];
const packageLinksDev = [];
const packageLinksMain = [];

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

   const d3Graph = fs.readFileSync(path.resolve(__dirname, '../template/html/d3-graph.js'), 'utf8');
   const styleCSS = fs.readFileSync(path.resolve(__dirname, '../template/html/style.css'), 'utf8');
   const indexHTML = fs.readFileSync(path.resolve(__dirname, '../template/html/index.html'), 'utf8');
   const tableSorter = fs.readFileSync(path.resolve(__dirname, '../template/html/jquery-tablesorter.js'), 'utf8');

   let currentDepth = 0;

   if (rootPackageName)
   {
      const packageData =
      {
//         type: values[1],
         name: rootPackageName,
         fullName: rootPackageName,
//         fullPackage: value,
         version: 'master',
         isAliased: false
      };

      let index = packageNodesAll.length;
      const objectID = `root-${rootPackageName}-master`;

      let object = { id: objectID, minLevel: currentDepth, packageScope: 'all', packageData, fixed: false, index };
      packageNodesAll.push(object);
      packageNodeMapAll.set(objectID, object);

      index = packageNodesMain.length;
      object = { id: objectID, minLevel: currentDepth, packageScope: 'main', packageData, fixed: false, index };
      packageNodesMain.push(object);
      packageNodeMapMain.set(objectID, object);

      index = packageNodesDev.length;
      object = { id: objectID, minLevel: currentDepth, packageScope: 'dev', packageData, fixed: false, index };
      packageNodesDev.push(object);
      packageNodeMapDev.set(objectID, object);

      currentDepth++;
   }

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
      let object = { id: objectID, minLevel: currentDepth, packageScope: 'all', packageData, fixed: false, index };

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

         // If currentDepth is greater than 0 then there is a top level root node, so add a link.
         if (currentDepth > 0) { packageLinksAll.push({ source: 0, target: index, minLevel: currentDepth }); }
      }

      if (typeof jspmPackageMap[key] !== 'undefined')
      {
         index = packageNodesMain.length;
         object = { id: objectID, minLevel: currentDepth, packageScope: 'main', packageData, fixed: false, index };

         if (!packageNodeMapMain.has(objectID))
         {
            if (options.verbose)
            {
               console.log(
                `esdoc-plugin-dependency-graphs: s_CREATE_GRAPH_JSPM_PACKAGES - adding top level (dev) node: `
                 + `${JSON.stringify(object)}`);
            }

            packageNodesMain.push(object);
            packageNodeMapMain.set(objectID, object);

            // If currentDepth is greater than 0 then there is a top level root node, so add a link.
            if (currentDepth > 0) { packageLinksMain.push({ source: 0, target: index, minLevel: currentDepth }); }
         }
      }

      if (typeof jspmDevPackageMap[key] !== 'undefined')
      {
         index = packageNodesDev.length;
         object = { id: objectID, minLevel: currentDepth, packageScope: 'dev', packageData, fixed: false, index };

         if (!packageNodeMapDev.has(objectID))
         {
            if (options.verbose)
            {
               console.log(
                `esdoc-plugin-dependency-graphs: s_CREATE_GRAPH_JSPM_PACKAGES - adding top level (main) node: `
                + `${JSON.stringify(object)}`);
            }

            packageNodesDev.push(object);
            packageNodeMapDev.set(objectID, object);

            // If currentDepth is greater than 0 then there is a top level root node, so add a link.
            if (currentDepth > 0) { packageLinksDev.push({ source: 0, target: index, minLevel: currentDepth }); }
         }
      }
   }

   if (options.verbose)
   {
      console.log(
       'esdoc-plugin-dependency-graphs: s_CREATE_GRAPH_JSPM_PACKAGES --- parsing top level all dependencies');
   }

   currentDepth++;

   // Recursively parse all dependencies
   s_DEPTH_TRAVERSAL_NODES(_.clone(packageNodesAll), packageNodesAll, packageNodeMapAll, packageLinksAll, 'all',
    currentDepth, options);

   if (options.verbose)
   {
      console.log(
       'esdoc-plugin-dependency-graphs: s_CREATE_GRAPH_JSPM_PACKAGES --- parsing top level dev dependencies');
   }

   // Recursively parse dev dependencies
   s_DEPTH_TRAVERSAL_NODES(_.clone(packageNodesDev), packageNodesDev, packageNodeMapDev, packageLinksDev, 'dev',
    currentDepth, options);

   if (options.verbose)
   {
      console.log(
       'esdoc-plugin-dependency-graphs: s_CREATE_GRAPH_JSPM_PACKAGES --- parsing top level main dependencies');
   }

   // Recursively parse main dependencies
   s_DEPTH_TRAVERSAL_NODES(_.clone(packageNodesMain), packageNodesMain, packageNodeMapMain, packageLinksMain, 'main',
    currentDepth, options);

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

 // Provides a recursive function traversing package dependencies.
const s_DEPTH_TRAVERSAL_NODES = (packageDeps, packageNodes, packageNodeMap, packageLinks, packageScope, depth,
                                 options) =>
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

      const childDepMap = childPackageMap[packageDep.packageData.fullPackage];

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
               console.log(
                `esdoc-plugin-dependency-graphs: s_DEPTH_TRAVERSAL_NODES - depth: ' + depth + '; adding node: `
                 + `${JSON.stringify(newNode)}`);
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
                  console.log(
                   `esdoc-plugin-dependency-graphs: s_DEPTH_TRAVERSAL_NODES - depth: ${depth}; updating min level: `
                    + `${JSON.stringify(existingNode)}`);
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
         console.log(`esdoc-plugin-dependency-graphs: s_DEPTH_TRAVERSAL_NODES - depth: ${depth}; nextLevelPackages: `
          + `${JSON.stringify(nextLevelPackages)}`);
      }

      s_DEPTH_TRAVERSAL_NODES(nextLevelPackages, packageNodes, packageNodeMap, packageLinks, packageScope, depth + 1,
       options);
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
      fullPackage: value,
      version: values[3],
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
 * @param {string}   value - Value to sanitize.
 * @returns {string}
 */
const s_SANITIZE_CSS = (value) =>
{
   return value.replace(/(\.|\/|:|@|\^|>=|>|<=|<|~|\*)/gi, '-');
};