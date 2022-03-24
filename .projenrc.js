const { clickupTs } = require('@time-loop/clickup-projen');
const project = new clickupTs.ClickUpTypeScriptProject({
  defaultReleaseBranch: 'main',
  devDeps: ['@time-loop/clickup-projen', 'ts-node'],
  name: 'deploy-beanstalk',

  /* Runtime dependencies of this module. */
  deps: ['@aws-sdk/client-elastic-beanstalk@^3.54.1', 'chalk@^4.1.2', 'yargs-parser@^21.0.1'],
  tsconfig: {
    compilerOptions: {
      lib: ['es2020'],
    },
    'ts-node': {
      compilerOptions: {
        module: 'commonjs',
      },
    },
  },
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();
