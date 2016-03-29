import fs         from 'fs-extra';
import path       from 'path';
import _          from 'underscore';

import JSPMParser from 'typhonjs-config-jspm-parse';

import jspm       from 'jspm';   // Note: this could be dangerous for NPM < 3.0.

let packagePath = './package.json';

// Stores the path to generated graphs.
let docGraphPath;

// Stores the root package name.
let rootPackageName;

// Stores values from `jspm.dependencies` from `package.json`.
let jspmPackageMap;

// Stores values from `jspm.devDependencies` from `package.json`.
let jspmDevPackageMap;

let uniqueDeps;
let uniqueDevDeps;
let uniqueSharedDep;
let uniqueDepsAll;

let childPackageMap;
let topLevelPackages;

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
      if (ev.data.config.package)
      {
         packagePath = ev.data.config.package;
      }

      docGraphPath = `${ev.data.config.destination}${path.sep}graphs${path.sep}`;

      // Get package.json as ESDoc will prepend the name of the module found in the package.json
      try
      {
         const packageJSON = fs.readFileSync(packagePath, 'utf-8');
         const packageObj = JSON.parse(packageJSON);

         rootPackageName = packageObj.name;

         jspmPackageMap = JSPMParser.getPackageJSPMDependencies(packageObj, jspmPackageMap, !this.options.verbose,
          'esdoc-plugin-jspm-dependency-graph');

         jspmDevPackageMap = JSPMParser.getPackageJSPMDevDependencies(packageObj, jspmDevPackageMap,
          !this.options.verbose, 'esdoc-plugin-jspm-dependency-graph');
      }
      catch (err)
      {
         throw new Error(`Could not locate 'package.json' in package path '${packagePath}'.`);
      }

      // Filter package maps so that they only include NPM / GitHub packages.
      jspmPackageMap = s_FILTER_PACKAGE_MAP(jspmPackageMap);
      jspmDevPackageMap = s_FILTER_PACKAGE_MAP(jspmDevPackageMap);

      const rootPath = ev.data.config.hasOwnProperty('jspmRootPath') ? ev.data.config.jspmRootPath :
       JSPMParser.getRootPath();

      // ESDoc uses the root directory name if no package.json with a package name exists.
      const rootDir = rootPath.split(path.sep).pop();

      rootPackageName = rootPackageName || rootDir;

      // Set the package path to the local root where config.js is located.
      jspm.setPackagePath(rootPath);

      // Create SystemJS Loader
      const System = new jspm.Loader();

      const packageResolver = JSPMParser.getPackageResolver(System);

      uniqueDeps = packageResolver.getUniqueDependencyList(Object.keys(jspmPackageMap));
      uniqueDevDeps = packageResolver.getUniqueDependencyList(Object.keys(jspmDevPackageMap));
      uniqueSharedDep = _.intersection(uniqueDeps, uniqueDevDeps);
      uniqueDepsAll = packageResolver.getUniqueDependencyList();

      topLevelPackages = s_FILTER_PACKAGE_MAP(packageResolver.topLevelPackages);
      childPackageMap = packageResolver.childPackageMap;

      s_CREATE_GRAPH_JSPM_PACKAGES(this.options);
   }
}

const s_CREATE_GRAPH_JSPM_PACKAGES = (options) =>
{
   const docGraphPackagePath = `${docGraphPath}jspm_packages${path.sep}`;

   // Ensure graphs directory exists.
   fs.ensureDirSync(docGraphPackagePath);

   const d3Graph = fs.readFileSync('./template/html/d3-graph.js', 'utf8');
   const styleCSS = fs.readFileSync('./template/html/style.css', 'utf8');
   const indexHTML = fs.readFileSync('./template/html/index.html', 'utf8');

   // Parse top level packages
   for (const key in topLevelPackages)
   {
      const value = topLevelPackages[key];
      const objectID = s_SANITIZE_CSS(value);

      let packageType;

      if (value.startsWith('npm:')) { packageType = 'npm'; }
      else if (value.startsWith('github:')) { packageType = 'github'; }
      else { continue; }

      if (typeof jspmPackageMap[key] === 'undefined' && typeof jspmDevPackageMap[key] === 'undefined')
      {
         throw new Error(`esdoc-plugin-jspm-dependency-graph: unknown top level package: ${key}`);
      }

      let index = packageNodesAll.length;
      let object = { id: objectID, name: key, fullName: value, minLevel: 0, packageScope: 'all', packageType, index };

      if (!packageNodeMapAll.has(objectID))
      {
         if (options.verbose)
         {
            console.log(
             `esdoc-plugin-jspm-dependency-graph: s_CREATE_GRAPH_JSPM_PACKAGES - adding top level (all) node: `
             + `${JSON.stringify(object)}`);
         }
         packageNodesAll.push(object);
         packageNodeMapAll.set(objectID, object);
      }

      if (typeof jspmPackageMap[key] !== 'undefined')
      {
         index = packageNodesMain.length;
         object = { id: objectID, name: key, fullName: value, minLevel: 0, packageScope: 'main', packageType, index };

         if (!packageNodeMapMain.has(objectID))
         {
            if (options.verbose)
            {
               console.log('esdoc-plugin-jspm-dependency-graph: s_CREATE_GRAPH_JSPM_PACKAGES - adding top level (dev) node: ' + JSON.stringify(object));
            }

            packageNodesMain.push(object);
            packageNodeMapMain.set(objectID, object);
         }
      }

      if (typeof jspmDevPackageMap[key] !== 'undefined')
      {
         index = packageNodesDev.length;
         object = { id: objectID, name: key, fullName: value, minLevel: 0, packageScope: 'dev', packageType, index };

         if (!packageNodeMapDev.has(objectID))
         {
            if (options.verbose)
            {
               console.log('esdoc-plugin-jspm-dependency-graph: s_CREATE_GRAPH_JSPM_PACKAGES - adding top level (main) node: ' + JSON.stringify(object));
            }

            packageNodesDev.push(object);
            packageNodeMapDev.set(objectID, object);
         }
      }
   }

   if (options.verbose)
   {
      console.log(
       'esdoc-plugin-jspm-dependency-graph: s_CREATE_GRAPH_JSPM_PACKAGES --- parsing top level all dependencies');
   }

   // Recursively parse all dependencies
   s_DEPTH_TRAVERSAL_NODES(_.clone(packageNodesAll), packageNodesAll, packageNodeMapAll, packageLinksAll,
    packageLinkMapAll, 'all', 1, options);

   if (options.verbose)
   {
      console.log(
       'esdoc-plugin-jspm-dependency-graph: s_CREATE_GRAPH_JSPM_PACKAGES --- parsing top level dev dependencies');
   }

   // Recursively parse dev dependencies
   s_DEPTH_TRAVERSAL_NODES(_.clone(packageNodesDev), packageNodesDev, packageNodeMapDev, packageLinksDev,
    packageLinkMapDev, 'dev', 1, options);

   if (options.verbose)
   {
      console.log(
       'esdoc-plugin-jspm-dependency-graph: s_CREATE_GRAPH_JSPM_PACKAGES --- parsing top level main dependencies');
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
      js: d3Graph,
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
   const nextLevelPackages = [];

   for (let cntr = 0; cntr < packageDeps.length; cntr++)
   {
      const packageDep = packageDeps[cntr];

      if (options.verbose)
      {
         console.log(`esdoc-plugin-jspm-dependency-graph: s_DEPTH_TRAVERSAL_NODES - depth: ${depth}; packageDep.index: `
          + `${packageDep.index}; dep: ${JSON.stringify(packageDep)}`);
      }

      const childDepMap = childPackageMap[packageDep.fullName];

      if (typeof childDepMap === 'undefined')
      {
         continue;
      }

      // Parse top level packages
      for (const key in childDepMap)
      {
         let packageType;
         const value = childDepMap[key];

         if (value.startsWith('npm:')) { packageType = 'npm'; }
         else if (value.startsWith('github:')) { packageType = 'github'; }
         else { continue; }

         const index = packageNodes.length;
         const objectID = s_SANITIZE_CSS(value);

         const newNode =
         { id: objectID, name: key, fullName: value, minLevel: depth, packageScope, packageType, index };

         if (!packageNodeMap.has(objectID))
         {
            nextLevelPackages.push(newNode);

            if (options.verbose)
            {
               console.log('esdoc-plugin-jspm-dependency-graph: s_DEPTH_TRAVERSAL_NODES - depth: ' + depth + '; adding node: ' + JSON.stringify(newNode));
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
                  console.log('esdoc-plugin-jspm-dependency-graph: s_DEPTH_TRAVERSAL_NODES - depth: ' + depth + '; updating min level: ' + JSON.stringify(existingNode));
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
         console.log('esdoc-plugin-jspm-dependency-graph: s_DEPTH_TRAVERSAL_NODES - depth: ' + depth + '; nextLevelPackages: ' + JSON.stringify(nextLevelPackages));
      }

      s_DEPTH_TRAVERSAL_NODES(nextLevelPackages, packageNodes, packageNodeMap, packageLinks, packageLinkMap,
       packageScope, depth + 1, options);
   }
};

/**
 * Filters a package map copying over to output only NPM or GitHub packages.
 *
 * @param {object}   packageMap - Package map to filter.
 * @param {object}   output - An optional output map.
 * @returns {{}}
 */
const s_FILTER_PACKAGE_MAP = (packageMap, output = {}) =>
{
   for (const key in packageMap)
   {
      const value = packageMap[key];
      if (value.startsWith('npm:') || value.startsWith('github:')) { output[key] = value; }
   }

   return output;
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