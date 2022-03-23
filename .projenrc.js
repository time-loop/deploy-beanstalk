const { clickupTs } = require('@time-loop/clickup-projen');
const project = new clickupTs.ClickUpTypeScriptProject({
  defaultReleaseBranch: 'main',
  devDeps: ['@time-loop/clickup-projen'],
  name: 'deploy-beanstalk',

  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();
