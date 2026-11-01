const fs = require('node:fs');
const path = require('node:path');

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;

if (!repository) {
  throw new Error('GITHUB_REPOSITORY is required to prepare a release.');
}

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) {
    throw new Error(`Unsupported release version: ${value}`);
  }

  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }

  return 0;
}

async function main() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases/latest`,
    { headers },
  );

  let latestVersion = null;
  if (response.status !== 404) {
    if (!response.ok) {
      throw new Error(`Could not read the latest GitHub release (${response.status}).`);
    }

    const release = await response.json();
    latestVersion = parseVersion(release.tag_name);
  }

  const packagePath = path.join(__dirname, '..', 'package.json');
  const lockPath = path.join(__dirname, '..', 'package-lock.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const currentVersion = parseVersion(packageJson.version);

  if (!latestVersion) {
    latestVersion = currentVersion;
  } else if (compareVersions(currentVersion, latestVersion) <= 0) {
    latestVersion = [...latestVersion];
    latestVersion[2] += 1;
  } else {
    latestVersion = currentVersion;
  }

  if (!packageLock.packages || !packageLock.packages['']) {
    throw new Error('The npm lockfile is missing its root package entry.');
  }

  const version = latestVersion.join('.');
  packageJson.version = version;
  packageLock.version = version;
  packageLock.packages[''].version = version;

  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  fs.writeFileSync(lockPath, `${JSON.stringify(packageLock, null, 2)}\n`);
  console.info(`Prepared Fenrid release ${version}.`);
}

main().catch((error) => {
  console.error('Could not prepare the Fenrid release:', error);
  process.exitCode = 1;
});
