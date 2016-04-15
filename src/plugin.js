/**
 * esdoc-plugin-jspm-dependency-graph -- In development / creates a package dependency graph w/ D3 for JSPM / SystemJS
 */

import fs               from 'fs-extra';
import path             from 'path';
import { taffy }        from 'taffydb';

import GraphPackageDep  from './GraphPackageDep.js';
import GraphSourceDep   from './GraphSourceDep.js';

import GraphDocBuilder  from './GraphDocBuilder.js';

let graphPackageDep, graphSourceDep;

let config, tags;

// ESDoc plugin callbacks -------------------------------------------------------------------------------------------

/**
 * onStart
 *
 * @param {object}   ev - Event from ESDoc containing data field.
 */
export function onStart(ev)
{
   // Stores sanitized option map.
   const options = typeof ev.data.option === 'object' ? ev.data.option : {};

   // Stores option that if true silences logging output.
   options.verbose = typeof options.verbose === 'boolean' ? options.verbose : false;

   graphPackageDep = new GraphPackageDep(options);
   graphSourceDep = new GraphSourceDep(options);
}

/**
 * Prepares additional config parameters for ESDoc. An all inclusive source root of "." is supplied, so an
 * "includes" array is constructed with all source roots for the local project and all associated jspm packages.
 *
 * Also all RegExp instances are created and stored for later usage.
 *
 * @param {object}   ev - Event from ESDoc containing data field.
 */
export function onHandleConfig(ev)
{
   config = ev.data.config;

   graphPackageDep.onHandleConfig(ev);
   graphSourceDep.onHandleConfig(ev);
}

/**
 * The generated HTML also includes the full JSPM path, so various RegExp substitutions are run to transform the
 * full paths to the normalized JSPM package paths.
 *
 * @param {object}   ev - Event from ESDoc containing data field
 */
export function onHandleHTML(ev)
{
   //console.log('!! onHandleHTML - fileName: ' + ev.data.fileName);
   //console.log('!! onHandleHTML - keys: ' + JSON.stringify(Object.keys(ev.data)));
}

export function onHandleTag(ev)
{
   tags = ev.data.tag;
//   console.log('!!! onHandleTag - ev.data.tag: ' + JSON.stringify(ev.data.tag));

//
}

/**
 * The search data file must have JSPM package paths replaced with normalized versions.
 */
export function onComplete()
{
   graphPackageDep.onComplete();

   try
   {
      graphSourceDep.onComplete();

      let data = taffy(tags);
      new GraphDocBuilder(data, config).exec(s_WRITE_HTML);

   } catch (err)
   {
      console.log('!! plugin - onComplete - err: ' + err);
      throw err;
   }
}

const s_WRITE_HTML = (html, fileName) =>
{
//   log(fileName);
//   html = onHandleHTML(html, fileName);
   const filePath = path.resolve(config.destination, fileName);
   fs.outputFileSync(filePath, html, { encoding: 'utf8' });
};