const build = require('./package.json').build;

const repository = process.env.GITHUB_REPOSITORY;

if (repository) {
  const [owner, repo, extra] = repository.split('/');
  if (!owner || !repo || extra) {
    throw new Error('GITHUB_REPOSITORY must use the owner/repository format.');
  }

  build.publish = [
    {
      provider: 'github',
      owner,
      repo,
      releaseType: 'release',
    },
  ];
}

module.exports = build;
