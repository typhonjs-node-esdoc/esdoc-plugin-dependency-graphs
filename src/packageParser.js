import fs         from 'fs-extra';
import path       from 'path';
import _          from 'underscore';

import JSPMParser from 'typhonjs-config-jspm-parse';

import jspm       from 'jspm';   // Note: this could be dangerous for NPM < 3.0.

let packagePath = './package.json';

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

/**
 * Parses the JSPM / SystemJS runtime for package information returning a version with all package data, all packages
 * with valid ESDoc config files and the root package name from `package.json` or the actual root directory name.
 *
 * @param {object}   config - ESDoc configuration.
 * @param {object}   options - Optional parameters from plugin instance.
 *
 * @returns {{allPackageData: Array, allPackageDataESDoc: Array, rootPackageName: (*|T)}}
 */
export default function packageParser(config, options)
{
   if (config.package)
   {
      packagePath = config.package;
   }

   // Get package.json as ESDoc will prepend the name of the module found in the package.json
   try
   {
      const packageJSON = fs.readFileSync(packagePath, 'utf-8');
      const packageObj = JSON.parse(packageJSON);

      rootPackageName = packageObj.name;

      jspmPackageMap = JSPMParser.getPackageJSPMDependencies(packageObj, jspmPackageMap, !options.verbose,
       'esdoc-plugin-dependency-graphs');

      jspmDevPackageMap = JSPMParser.getPackageJSPMDevDependencies(packageObj, jspmDevPackageMap,
       !options.verbose, 'esdoc-plugin-dependency-graphs');
   }
   catch (err)
   {
      throw new Error(`Could not locate 'package.json' in package path '${packagePath}'.`);
   }

   // Filter package maps so that they only include NPM / GitHub packages.
   jspmPackageMap = s_FILTER_PACKAGE_MAP(jspmPackageMap);
   jspmDevPackageMap = s_FILTER_PACKAGE_MAP(jspmDevPackageMap);

   const rootPath = config.hasOwnProperty('jspmRootPath') ? config.jspmRootPath :
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

   global['$$esdoc_plugin_jspm'] =
   {
      childPackageMap,
      jspmDevPackageMap,
      jspmPackageMap,
      rootPackageName,
      topLevelPackages,
      uniqueDevDeps,
      uniqueDeps,
      uniqueDepsAll,
      uniqueSharedDep
   };

   return global['$$esdoc_plugin_jspm'];
}


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