/**
 * esdoc-plugin-jspm-dependency-graph -- In development / creates a package dependency graph w/ D3 for JSPM / SystemJS.
 */

'use strict';

import cheerio          from 'cheerio';
import fs               from 'fs-extra';
import path             from 'path';
import { taffy }        from 'taffydb';

import GraphPackageDep  from './GraphPackageDep.js';
import GraphSourceDep   from './GraphSourceDep.js';

import GraphDocBuilder  from './GraphDocBuilder.js';

// Stores instances of GraphPackageDep and GraphSourceDep which generates the graphs.
let graphPackageDep, graphSourceDep;

// Must store ESDoc configuration file and tags to use later with GraphDocBuilder.
let config, tags;

// ESDoc plugin callbacks -------------------------------------------------------------------------------------------

/**
 * Sanitizes optional parameters and initializes the graph generators.
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
 * Stores the ESDoc configuration file for later use with GraphDocBuilder and starts the graph generators.
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
 * Process all HTML files adding a `Graphs` link to the top header navigation bar.
 *
 * @param {object}   ev - Event from ESDoc containing data field
 */
export function onHandleHTML(ev)
{
   if (ev.data.fileName.endsWith('.html'))
   {
      const $ = cheerio.load(ev.data.html, { decodeEntities: false });
      $('<a href="graphs/jspm_packages.html">Graphs</a>').insertAfter('a[href="identifiers.html"]');
      ev.data.html = $.html();
   }
}

/**
 * Must save tags to eventually feed GraphDocBuilder with taffydb converted data.
 *
 * @param {object}   ev - Event from ESDoc containing data field
 */
export function onHandleTag(ev)
{
   tags = ev.data.tag;
}

/**
 * Completes graph generation and then builds the HTML index pages.
 */
export function onComplete()
{
   graphPackageDep.onComplete();

   try
   {
      graphSourceDep.onComplete();

      new GraphDocBuilder(taffy(tags), config).exec(s_WRITE_HTML);
   }
   catch (err)
   {
      console.log(`!! plugin - onComplete - err: ${err}`);
      throw err;
   }
}

/**
 * Provides a callback for GraphDocBuilder to export HTML files delegating to the local `onHandleHTML` function.
 *
 * @param {string}   html - HTML to save.
 * @param {string}   fileName - name for file output.
 */
const s_WRITE_HTML = (html, fileName) =>
{
   // Must match plugin event data format.
   const ev = { data: { html, fileName } };

   onHandleHTML(ev);

   const filePath = path.resolve(config.destination, fileName);
   fs.outputFileSync(filePath, ev.data.html, { encoding: 'utf8' });
};