/* Der Standardtest von @iobroker/testing: prueft package.json und
   io-package.json gegen das, was ioBroker erwartet - Pflichtfelder,
   gleiche Version in beiden, gueltiges JSON, Changelog-Eintrag zur
   aktuellen Version. */

const path = require('node:path');
const { tests } = require('@iobroker/testing');

tests.packageFiles(path.join(__dirname, '..'));
