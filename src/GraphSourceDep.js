import fs         from 'fs-extra';
import path       from 'path';
import _          from 'underscore';

// Stores the path to generated ast.
let astPath;

// Stores the path to generated graphs.
let docGraphPath;

// Stores the root package name.
let rootPackageName;

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

export default class GraphSourceDep
{
   constructor(options)
   {
      this.options = options;
   }

   onHandleConfig(ev)
   {
      astPath = `${ev.data.config.destination}${path.sep}ast${path.sep}source`;
      docGraphPath = `${ev.data.config.destination}${path.sep}graphs${path.sep}`;
   }

   onComplete()
   {
//      const parsedFiles = s_PARSE_AST_FILES(s_PARSE_FILE_LIST(s_READDIR_TRAVERSE(astPath)));
//      console.log('!! GSP - onComplete - parsedFiles: ' + JSON.stringify(parsedFiles));
   }
}

const s_PARSE_AST_FILES = (fileEntries) =>
{
   fileEntries.forEach((entry) =>
   {
      const ast = fs.readJsonSync(entry.astFilePath);

      entry.ast = { imports: [], exports: [] };

      if (Array.isArray(ast.body))
      {
         ast.body.forEach((astEntry) =>
         {
            switch (astEntry.type)
            {
               case 'ExportDefaultDeclaration':
                  break;

               case 'ImportDeclaration':
                  entry.ast.imports.push(
                  {
                     type: astEntry.specifiers[0].type,
                     name: astEntry.specifiers[0].local.name,
                     filePath: astEntry.source.value
                  });
                  break;
            }
         });
      }
   });

   return fileEntries;
};

const s_PARSE_FILE_LIST = (fileList) =>
{
   const parsedFiles = [];

   const astPathSep = `${astPath}${path.sep}`;

   const githubPath = `jspm_packages${path.sep}github`;
   const npmPath = `jspm_packages${path.sep}npm`;
   const jspmPath = `jspm_packages`;

   const pathSep = path.sep === '/' ? '\/' : path.sep;

   const jspmGithubRegex = new RegExp(
    `jspm_packages${pathSep}([^${pathSep}]*)${pathSep}([^${pathSep}]*)${pathSep}([^${pathSep}]*)${pathSep}(.*)`);

   const jspmNPMRegex = new RegExp(`jspm_packages${pathSep}([^${pathSep}]*)${pathSep}(.*)`);

   fileList.forEach((filePath) =>
   {
      const entry = { astFilePath: filePath };

      // Remove ast path
      let relFilePath = filePath.replace(astPathSep, '');
      let lastIndex = relFilePath.lastIndexOf('.');

      relFilePath = lastIndex > 0 ? relFilePath.slice(0, lastIndex) : relFilePath;

      entry.relFilePath = relFilePath;

      lastIndex = relFilePath.lastIndexOf(path.sep);
      entry.relFileDir = lastIndex > 0 ? relFilePath.slice(0, lastIndex) : relFilePath;

      entry.jspmManaged = relFilePath.startsWith(jspmPath);

      if (relFilePath.startsWith(githubPath)) { entry.scm = 'github'; }
      else if (relFilePath.startsWith(npmPath)) { entry.scm = 'npm'; }
      else { entry.scm = 'none'; }

      let match, match2;

      switch (entry.scm)
      {
         case 'github':
            match = relFilePath.match(jspmGithubRegex);
            match2 = match[3].split('@');

            entry.jspmPath = `github:${match[2]}/${match[3]}`;
            entry.scmLink = `https://github.com/${match[2]}/${match2[0]}`;
            entry.scmVersion = match2[1];

            // Determine file name and extension.
            lastIndex = match[4].lastIndexOf(path.sep);
            match2 = (lastIndex > -1 && match[4].length >= lastIndex + 1 ? match[4].slice(lastIndex + 1) :
             match[4]).split('.');

            entry.fileName = match2[0];
            entry.fileExtension = match2[1];
            break;

         case 'npm':
            match = relFilePath.match(jspmNPMRegex);
            match2 = match[2].split('@');
            entry.jspmPath = `npm:${match[2]}`;
            entry.scmLink = `https://www.npmjs.com/package/${match2[0]}`;
            entry.scmVersion = match2[1];

            // Determine file name and extension.
            lastIndex = match[3].lastIndexOf(path.sep);
            match2 = (lastIndex > -1 && match[3].length >= lastIndex + 1 ? match[3].slice(lastIndex + 1) :
             match[3]).split('.');

            entry.fileName = match2[0];
            entry.fileExtension = match2[1];
            break;

         default:
            // Determine file name and extension.
            lastIndex = relFilePath.lastIndexOf(path.sep);
            match2 = (lastIndex > -1 && relFilePath.length >= lastIndex + 1 ? relFilePath.slice(lastIndex + 1) :
             relFilePath).split('.');

            entry.fileName = match2[0];
            entry.fileExtension = match2[1];
      }

      parsedFiles.push(entry);
   });

   return parsedFiles;
};


const s_CREATE_GRAPH_JSPM_PACKAGES = (options) =>
{
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

/**
 * Recursively creates a file list from a given directory.
 *
 * @param {string}   dir - A directory path.
 * @param {Array}    filelist - An array of files.
 * @returns {*|Array}
 */
const s_READDIR_TRAVERSE = (dir, filelist) =>
{
   const files = fs.readdirSync(dir);

   filelist = filelist || [];

   files.forEach((file) =>
   {
      if (fs.statSync(`${dir}${path.sep}${file}`).isDirectory())
      {
         filelist = s_READDIR_TRAVERSE(`${dir}${path.sep}${file}`, filelist);
      }
      else
      {
         filelist.push(`${dir}${path.sep}${file}`);
      }
   });

   return filelist;
};