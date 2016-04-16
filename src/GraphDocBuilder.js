'use strict';

import cheerio    from 'cheerio';
import fs         from 'fs-extra';
import path       from 'path';

import IceCap     from 'ice-cap';
import DocBuilder from 'esdoc/out/src/Publisher/Builder/DocBuilder.js';

/**
 * Graph Output Builder class.
 */
export default class GraphDocBuilder extends DocBuilder
{
   /**
    * Simply wraps the actual graph in an iframe.
    *
    * @param {object} item - target graph config item.
    *
    * @return {string} built graph.
    * @private
    */
   _buildGraph(item)
   {
      return `<iframe src="${item.graphPath}" frameBorder="0" style="display: block; width: 100%; height: 100%;" />`;
   }

   /**
    * Creates the left hand navigation list for the various graphs supported.
    *
    * @param {Array<{fileName: string, graphPath: string, label: string, safeLabel: string}>}   graphConfig -
    * target manual config.
    *
    * @return {object} IceCap instance
    * @private
    */
   _buildGraphNav(graphConfig)
   {
      const ice = new IceCap(this._readTemplate('graphIndex.html'));

      ice.loop('manual', graphConfig, (i, item, ice) =>
      {
         ice.attr('manual', 'data-toc-name', item.safeLabel);
         ice.text('title', item.label);
         ice.attr('title', 'href', item.fileName);
      });

      return ice;
   }

   /**
    * Execute building output.
    *
    * @param {function(html: string, filePath: string)} callback - is called each manual.
    */
   exec(callback)
   {
      const graphConfig = this._getGraphConfig();

      let ice = this._buildLayoutDoc();

      ice.autoDrop = false;

      ice.attr('rootContainer', 'class', ' manual-root');

      {
         const fileName = 'graphs/index.html';
         const baseUrl = this._getBaseUrl(fileName);
         ice.load('nav', this._buildGraphNav(graphConfig), IceCap.MODE_WRITE);
         ice.text('title', 'Graphs', IceCap.MODE_WRITE);
         ice.attr('baseUrl', 'href', baseUrl, IceCap.MODE_WRITE);
         callback(ice.html, fileName);
      }

      // To get the iFrame holding the graph styles to display with no padding and 100% height the following needs
      // to be overridden: 'html', 'body', '.content'. This is a bit of a hack as a new IceCap instance is created.
      const $ = cheerio.load(ice.html);
      $('html').attr('style', 'height: calc(100% - 40px)');
      $('body').attr('style', 'height: 100%');
      $('.content').attr('style', 'padding: 0; height: 100%; position: relative;');
      ice = new IceCap($.html());

      for (const item of graphConfig)
      {
         const fileName = item.fileName;
         const baseUrl = this._getBaseUrl(fileName);
         ice.load('content', this._buildGraph(item), IceCap.MODE_WRITE);
         ice.load('nav', this._buildGraphNav(graphConfig), IceCap.MODE_WRITE);
         ice.text('title', item.label, IceCap.MODE_WRITE);
         ice.attr('baseUrl', 'href', baseUrl, IceCap.MODE_WRITE);
         callback(this._removeFooter(ice), fileName);
      }
   }

   /**
    * Get graph config for all entries for HTML page generation.
    *
    * @returns {Array<{}>} built graph config.
    * @private
    */
   _getGraphConfig()
   {
      const graphConfig = [];

      graphConfig.push(
      {
         fileName: 'graphs/jspm_packages.html',
         graphPath: 'graphs/jspm_packages/index.html',
         label: 'JSPM Packages',
         safeLabel: 'jspm_packages'
      });

      return graphConfig;
   }

   /**
    * Attempts to first read local html template before deferring to ESDoc for loading templates.
    *
    * @param {string} fileName - template file name.
    *
    * @return {string} html of template.
    * @private
    */
   _readTemplate(fileName)
   {
      try
      {
         const filePath = path.resolve(__dirname, `../template/esdoc/${fileName}`);
         return fs.readFileSync(filePath, { encoding: 'utf-8' });
      }
      catch (err) { /* ... */ }

      return super._readTemplate(fileName);
   }

   /**
    * Removes the footer from ESDoc layout template which is useful for full screen graphs.
    *
    * @param {object} ice - An instance of IceCap
    *
    * @return {string}
    * @private
    */
   _removeFooter(ice)
   {
      const $ = cheerio.load(ice.html);
      $('.footer').remove();
      return $.html();
   }
}