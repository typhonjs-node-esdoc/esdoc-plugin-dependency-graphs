import fs            from 'fs-extra';
import path          from 'path';
import _             from 'underscore';

// Stores the path to generated graphs.
let docGraphPath;

export default class GraphPackageDep
{
   onHandleConfig(ev)
   {
      docGraphPath = `${ev.data.config.destination}${path.sep}graphs${path.sep}`;
   }

   /**
    * The search data file must have JSPM package paths replaced with normalized versions.
    */
   onComplete()
   {
      const docGraphPackagePath = `${docGraphPath}jspm_packages${path.sep}`;

      // Ensure graphs directory exists.
      fs.ensureDirSync(docGraphPackagePath);

      const d3Graph = fs.readFileSync(path.resolve(__dirname, '../template/html/d3-graph.js'), 'utf8');
      const styleCSS = fs.readFileSync(path.resolve(__dirname, '../template/html/style.css'), 'utf8');
      const indexHTML = fs.readFileSync(path.resolve(__dirname, '../template/html/index.html'), 'utf8');
      const tableSorter = fs.readFileSync(path.resolve(__dirname, '../template/html/jquery-tablesorter.js'), 'utf8');

      const { packageGraphAll, packageGraphDev, packageGraphMain, rootPackageName } = global.$$esdoc_plugin_jspm;

      const graphPackageDataAll =
      {
         maxLevel: packageGraphAll.maxLevel,
         directed: true,
         multigraph: false,
         graph: [],
         nodes: packageGraphAll.nodes,
         links: packageGraphAll.links
      };

      const graphPackageDataDev =
      {
         maxLevel: packageGraphDev.maxLevel,
         directed: true,
         multigraph: false,
         graph: [],
         nodes: packageGraphDev.nodes,
         links: packageGraphDev.links
      };

      const graphPackageDataMain =
      {
         maxLevel: packageGraphMain.maxLevel,
         directed: true,
         multigraph: false,
         graph: [],
         nodes: packageGraphMain.nodes,
         links: packageGraphMain.links
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
   }
}