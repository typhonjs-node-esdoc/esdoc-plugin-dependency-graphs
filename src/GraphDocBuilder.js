'use strict';

import cheerio from 'cheerio';
import fs from 'fs-extra';
import path from 'path';

import IceCap from 'ice-cap';
import DocBuilder from 'esdoc/out/src/Publisher/Builder/DocBuilder.js';

/**
 * Graph Output Builder class.
 */
export default class GraphDocBuilder extends DocBuilder
{
   /**
    * execute building output.
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
      $('html').attr('style', 'height: 100%');
      $('body').attr('style', 'height: 100%');
      $('.content').attr('style', 'padding: 0; height: 100%; position: relative;');
      ice = new IceCap($.html());

      for (let item of graphConfig)
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
    * Get graph config based.
    *
    * @returns {Array<{}>} built graph config.
    * @private
    */
   _getGraphConfig()
   {
      const graphConfig = [];

      graphConfig.push(
      {
         label: 'JSPM Packages',
         graph_path: 'graphs/jspm_packages/index.html',
         fileName: 'graphs/jspm_packages.html'
      });

      return graphConfig;
   }

   /**
    * build manual navigation.
    * @param {ManualConfigItem[]} graphConfig - target manual config.
    * @return {IceCap} built navigation
    * @private
    */
   _buildGraphNav(graphConfig)
   {
      const ice = new IceCap(this._readTemplate('graphIndex.html'));

      ice.loop('manual', graphConfig, (i, item, ice)=>
      {
         const toc = [];

         //const fileName = this._getManualOutputFileName(item);
         //const html = this._convertMDToHTML(item);
         //const $root = cheerio.load(html).root();
         //const isHRise = $root.find('h1').length === 0;
         //
         //$root.find('h1,h2,h3,h4,h5').each((i, el)=>
         //{
         //   const $el = cheerio(el);
         //   const label = $el.text();
         //   const link = `${fileName}#${$el.attr('id')}`;
         //   let indent;
         //   if (isHRise)
         //   {
         //      const tagName = `h${parseInt(el.tagName.charAt(1), 10) - 1}`;
         //      indent = `indent-${tagName}`;
         //   }
         //   else
         //   {
         //      indent = `indent-${el.tagName.toLowerCase()}`;
         //   }
         //   toc.push({label, link, indent});
         //});

         ice.attr('manual', 'data-toc-name', item.label.toLowerCase());
         ice.text('title', item.label);
         ice.attr('title', 'href', item.fileName);
         ice.loop('manualNav', toc, (i, item, ice)=>
         {
            ice.attr('manualNav', 'class', item.indent);
            ice.text('link', item.label);
            ice.attr('link', 'href', item.link);
         });
      });

      return ice;
   }

   /**
    * build manual navigation.
    * @param {ManualConfigItem[]} graphConfig - target manual config.
    * @return {IceCap} built navigation
    * @private
    */
   _removeFooter(ice)
   {
      const $ = cheerio.load(ice.html);
      $('.footer').remove();
      return $.html();
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
         const filePath = path.resolve(__dirname, `./template/${fileName}`);
         return fs.readFileSync(filePath, { encoding: 'utf-8' });
      }
      catch (err) { /* ... */ }

      return super._readTemplate(fileName);
   }

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
      return `<iframe src="${item.graph_path}" frameBorder="0" style="display: block; width: 100%; height: 100%" />`;
   }
}