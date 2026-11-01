const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');

const setupPath = path.join(
  __dirname,
  '..',
  'dist',
  'custom-setup',
  `Fenrid-${version}-x64-custom-setup.exe`,
);
const releasePath = path.join(
  __dirname,
  '..',
  'dist',
  `Fenrid-${version}-x64.exe`,
);
const updatePath = path.join(
  __dirname,
  '..',
  'dist',
  `Fenrid-${version}-x64-update.exe`,
);

for (const file of [setupPath, updatePath]) {
  if (!fs.existsSync(file)) {
    throw new Error(`The custom Fenrid setup is missing a required file: ${file}`);
  }
}

fs.copyFileSync(setupPath, releasePath);
console.info(`Prepared the custom Fenrid setup executable at ${releasePath}.`);
