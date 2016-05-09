/**
 * 000Init -- Bootstraps the testing process by generating the documentation. Any previous coverage (./coverage) and
 * docs (./test/fixture/docs) are deleted before docs are generated.
 */

import fs         from 'fs-extra';
import ESDoc      from '../../node_modules/esdoc/out/src/ESDoc.js';
import publisher  from '../../node_modules/esdoc/out/src/Publisher/publish.js';

const config =
{
   source: './test/fixture/src',
   destination: './test/fixture/docs',
   plugins:
   [
      { name: 'esdoc-plugin-jspm', option: { silent: true } },
      {
         name: 'esdoc-plugin-extends-replace',
         option:
         {
            replace:
            {
               'backbone~[B|b]ackbone\\.Collection': 'backbone-parse-es6@[\\s\\S]+\/src\/ParseCollection',
               'backbone~[B|b]ackbone\\.Events': 'typhonjs-core-backbone-events@[\\s\\S]+\/src\/TyphonEvents',
               'backbone~[B|b]ackbone\\.History': 'backbone-es6@[\\s\\S]+\/src\/History',
               'backbone~[B|b]ackbone\\.Model': 'backbone-parse-es6@[\\s\\S]+\/src\/ParseModel',
               'backbone~[B|b]ackbone\\.Router': 'backbone-es6@[\\s\\S]+\/src\/Router',
               'backbone~[B|b]ackbone\\.View': 'backbone-es6@[\\s\\S]+\/src\/View'
            }
         }
      },
      { name: './src/plugin.js', option: { verbose: false } }
   ],

   manual: { changelog: ['./CHANGELOG.md'] }
};

fs.emptyDirSync(config.destination);

ESDoc.generate(config, publisher);