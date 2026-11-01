const path = require('node:path');
const { version } = require('./package.json');

const updateInstaller = path.join(
  __dirname,
  'dist',
  `Fenrid-${version}-x64-update.exe`,
);

module.exports = {
  appId: 'com.fenrid.desktop.setup',
  productName: 'Fenrid Setup',
  electronVersion: '45.2.1',
  extraMetadata: { version },
  directories: {
    app: 'installer-app',
    output: 'dist/custom-setup',
  },
  files: ['main.js', 'preload.js', 'index.html', 'package.json'],
  extraResources: [
    {
      from: updateInstaller,
      to: 'fenrid-update-installer.exe',
    },
    {
      from: path.join(__dirname, 'assets', 'fenrid-logo.png'),
      to: 'fenrid-logo.png',
    },
  ],
  win: {
    target: 'portable',
    icon: 'assets/fenrid.ico',
    artifactName: 'Fenrid-${version}-x64-custom-setup.${ext}',
  },
};
