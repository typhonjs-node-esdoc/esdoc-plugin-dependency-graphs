/**
 * esdoc-plugin-jspm-dependency-graph -- In development / creates a package dependency graph w/ D3 for JSPM / SystemJS
 */

import fs               from 'fs-extra';
import path             from 'path';

import GraphPackageDep  from './GraphPackageDep.js';

let graphPackageDep;

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
   graphPackageDep.onHandleConfig(ev);
}

/**
 * The generated HTML also includes the full JSPM path, so various RegExp substitutions are run to transform the
 * full paths to the normalized JSPM package paths.
 *
 * @param {object}   ev - Event from ESDoc containing data field
 */
export function onHandleHTML(ev)
{
//   console.log('!! onHandleHTML - fileName: ' + ev.data.fileName);
//   console.log('!! onHandleHTML - keys: ' + JSON.stringify(Object.keys(ev.data)));
}

/**
 * The search data file must have JSPM package paths replaced with normalized versions.
 */
export function onComplete()
{
}