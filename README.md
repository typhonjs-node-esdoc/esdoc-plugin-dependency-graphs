![esdoc-plugin-dependency-graphs](https://i.imgur.com/2aVv3Q2.png)

[![NPM](https://img.shields.io/npm/v/esdoc-plugin-enhanced-navigation.svg?label=npm)](https://www.npmjs.com/package/esdoc-plugin-enhanced-navigation)
[![Code Style](https://img.shields.io/badge/code%20style-allman-yellowgreen.svg?style=flat)](https://en.wikipedia.org/wiki/Indent_style#Allman_style)
[![License](https://img.shields.io/badge/license-MPLv2-yellowgreen.svg?style=flat)](https://github.com/typhonjs-node-esdoc/esdoc-plugin-enhanced-navigation/blob/master/LICENSE)
[![Gitter](https://img.shields.io/gitter/room/typhonjs/TyphonJS.svg)](https://gitter.im/typhonjs/TyphonJS)

[![Build Status](https://travis-ci.org/typhonjs-node-esdoc/esdoc-plugin-enhanced-navigation.svg?branch=master)](https://travis-ci.org/typhonjs-node-esdoc/esdoc-plugin-enhanced-navigation)
[![Coverage](https://img.shields.io/codecov/c/github/typhonjs-node-esdoc/esdoc-plugin-enhanced-navigation.svg)](https://codecov.io/github/typhonjs-node-esdoc/esdoc-plugin-enhanced-navigation)
[![Dependency Status](https://www.versioneye.com/user/projects/5727e02aa0ca350034be631d/badge.svg?style=flat)](https://www.versioneye.com/user/projects/5727e02aa0ca350034be631d)

A plugin for [ESDoc](https://esdoc.org) that adds [D3](https://d3js.org/) interactive dependency graphs for packages and source code managed by JSPM / SystemJS and soon NPM. A context menu is available that opens associated Github / NPM links.

Please note that this plugin is in heavy development and currently only JSPM package dependency graphs are available. You must use [esdoc-plugin-jspm](https://www.npmjs.com/package/esdoc-plugin-jspm) version 0.6.6 or higher for this plugin to work. 

Installation steps:
- Install `esdoc` in `devDependencies` in `package.json`.
- Install `esdoc-plugin-dependency-graphs` in `devDependencies` in `package.json`.
- Install [esdoc-plugin-jspm](https://www.npmjs.com/package/esdoc-plugin-jspm) if using JSPM / SystemJS in `devDependencies` in `package.json`.
- Create an `.esdocrc` or `esdoc.json` configuration file adding the plugin.
- Optionally add an `.esdocrc` or `esdoc.json` configuration file in all JSPM managed packages to link.
- Run ESdoc then profit!

For more information view the [ESDoc tutorial](https://esdoc.org/tutorial.html) and [ESDoc Config](https://esdoc.org/config.html) documentation.

It should be noted that all TyphonJS repos now are standardizing on `.esdocrc` for the ESDoc configuration file. Both `.esdocrc` and `esdoc.json` are supported by the `esdoc-plugin-jspm` and forthcoming `esdoc-plugin-npm` plugin. 

As an alternate and the preferred all inclusive installation process please see [typhonjs-npm-build-test](https://www.npmjs.com/package/typhonjs-npm-build-test) for a NPM package which contains several dependencies for building / testing ES6 NPM modules including ESDoc generation with the following plugins including [esdoc-plugin-jspm](https://www.npmjs.com/package/esdoc-plugin-jspm), [esdoc-plugin-extends-replace](https://www.npmjs.com/package/esdoc-plugin-extends-replace). 
Please note that the next release of `typhonjs-npm-build-test` will include `esdoc-plugin-dependency-graphs` and presently it is not included. When `esdoc-plugin-dependency-graphs` reaches `0.1.0` it will be included in `typhonjs-npm-build-test` version `0.2.0`.

Additionally [typhonjs-core-gulptasks](https://www.npmjs.com/package/typhonjs-core-gulptasks) provides a NPM package which contains several pre-defined Gulp tasks for working with JSPM / SystemJS, ESLint and ESDoc generation. 

For the latest significant changes please see the [CHANGELOG](https://github.com/typhonjs-node-esdoc/esdoc-plugin-dependency-graphs/blob/master/CHANGELOG.md).

If installing and working directly with `esdoc-plugin-dependency-graphs` the following is an example integration including JSPM support via `esdoc-plugin-jspm` for `package.json`:
```
{
  ...

  "devDependencies": {
    "esdoc": "^0.4.0",
    "esdoc-plugin-dependency-graphs": "^0.0.1",  
    "esdoc-plugin-jspm": "^0.6.0", 
    "jspm": "^0.16.0"
  },
  "scripts": {
    "esdoc": "esdoc -c .esdocrc"
  },
  "jspm": {
    "main": "<main entry point>",
    "dependencies": {
      ...
    },
     "devDependencies": {
      ...
    }
  }
}
```

And the `.esdocrc` or `esdoc.json` configuration file:

```
{
   "title": "<title>",
   "source": "src",
   "destination": "docs",
   "plugins": 
   [ 
      { "name": "esdoc-plugin-jspm" },  
      { "name": "esdoc-plugin-dependency-graphs" }
   ]
}
```

------

Given the NPM script defined in `package.json` then simply run `npm run esdoc`.

------

Below is a demo image of the JSPM dependency graph generated for the `backbone-parse-es6` Github package loaded via JSPM. While not pictured a context click on graph nodes opens a context menu which will provide links to Github or NPM depending on the code being managed. For the context menu links to work for NPM packages you must include the [repository field](https://docs.npmjs.com/files/package.json#repository) in `package.json`. JSPM currently supports packages from Github and NPM; Github packages are colored orange and NPM packages are colored light red. Aliased JSPM packages where the assigned name does not match the package name the package / folder is red. In the overflow menu options you may show a table view of all packages and show / hide aliased packages names. 

![esdoc-plugin-dependency-graphs demo](https://i.imgur.com/hmPBTVE.png)
