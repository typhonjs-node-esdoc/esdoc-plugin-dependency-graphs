/**
 * 000Init -- Bootstraps the testing process by generating the documentation. Any previous coverage (./coverage) and
 * docs (./test/fixture/docs) are deleted before docs are generated.
 */

import fs         from 'fs-extra';
import ESDoc      from '../../node_modules/esdoc/out/src/ESDoc.js';
import publisher  from '../../node_modules/esdoc/out/src/Publisher/publish.js';

const config =
{
   source: './test/fixture',
   destination: './test/fixture/docs',
   plugins:
   [
//      { name: 'esdoc-plugin-jspm' },
      {
         name: './src/plugin.js',
         option: { verbose: false }
      }
   ],
   manual:
   {
      changelog: ["./CHANGELOG.md"]
   }
};

fs.emptyDirSync(config.destination);

ESDoc.generate(config, publisher);