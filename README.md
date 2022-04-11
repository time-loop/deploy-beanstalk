# deploy-beanstalk

[![codecov](https://codecov.io/gh/time-loop/deploy-beanstalk/branch/main/graph/badge.svg?token=oLuqCIiUqO)](https://codecov.io/gh/time-loop/deploy-beanstalk)

`deploy-beanstalk` is a TypeScript library for deploying an artifact living in S3 to a group of AWS Elastic Beanstalk Environments.

## Why?

- **CI Tool Decoupling**
  - The possibility of switching over to any CI tool (GitHub actions, GitLab CI, etc.) is attractive. To prep for that, we need portable scripts that can be run Anywhere™.
  - CI scripts can be written in any language such that engineers can easily read and improve upon them.
  - Consequently, we can easily introduce tests to our CI scripts.
- **Parallel deployments**
  - We can utilize language functionality (like TypeScript async functions, Golang goroutines, etc.) to allow for parallel deployments to multiple beanstalks at once...in whatever batched fashion we so desire.
- **Build once, deploy many**
  - The [TooManyApplicationVersions error](https://stackoverflow.com/questions/9589531/how-to-avoid-a-toomanyapplicationversion-exception-on-aws-elastic-beanstalk) is a nuisance and should be avoided. Indeed, it's a sign of bad build/deploy design which can potentially block deploys entirely. With `deploy-beanstalk`, no more than one Application Version is created per unique Beanstalk Application in the selected group, regardless of Environment count.

## Usage

`tools/ci/deploy/deploy.ts` handles asynchronous+simultaneous deployments to a group of beanstalk environments. It does this by creating an Application Version (one per Beanstalk Application only) from an artifact in S3 followed by issuing deployments of that Application Version to each respective beanstalk environment in the group.

### Installation

To install the package in a project (especially locally), you'll first need to setup a GitHub PAT since this package is hosted in GitHub Packages. General instructions to do so can be [found here](https://docs.github.com/en/enterprise-server@3.4/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token).

> ***NOTE:*** If you are working with a GitHub Workflow, the provided `GITHUB_TOKEN` might Just Work for you as this is a public package. However, if you also need to access packages that are private to your org, you might consider adding an `ALL_PACKAGE_READ_TOKEN` org secret followed by populating your .npmrc appropriately.

Once created with at least `read:package` access, in your project follow these steps under [Installing a Package](https://itnext.io/setting-up-github-packages-for-npm-2bc9f8e4b11e) where `@yourcompany` is `@time-loop`.

Then, install with `npm` in your project like so:

```bash
# --save-dev is optional, depending on whether this is used in the main app or
# a complementary tool like for CI/CD pipelines.
npm install [--save-dev] @time-loop/deploy-beanstalk
```

### Importing

```typescript
import { 
  deployToGroup, // function to call which deploys to a group
  IBeanstalkGroup, // Allows us to dictate beanstalk environments to deploy to
  IDeployToGroupProps // Rest of the configuration needed to deploy
} from '@time-loop/deploy-beanstalk';
```

### Grouping

An example configuration for a group of beanstalk environments and the artifact to deploy to them:

```typescript
const group: IBeanstalkGroup = {
  environments: [
    {
      app: 'ClickupExampleAppOne',
      name: 'ExampleEnvironmentOne',
    },
    {
      app: 'ClickupExampleAppTwo',
      name: 'ExampleEnvironmentTwo',
    },
  ],
  versionProps: {
    artifact: {
      S3Bucket: 'example-bucket-clickup',
      S3Key: 'exampleDir/clickupExampleArtifact.zip',
    },
    label: 'ExampleLabel',
    description: 'Example desc',
    errorIfExists: true,
  },
  name: 'ExampleBeanstalkGroup',
  region: 'us-west-2',
};
```

### Deploying

```typescript
try {
    ...
    const props: IDeployToGroupProps = {
    group,
    force: true,
    // Allows 5 mins to verify health prior to deploy
    preDeployHealthCheckProps: {
      attempts: 5,
      timeBetweenAttemptsMs: 60000,
    },
    // Allows 20 mins after deploy to verify health
    postDeployHealthCheckProps: {
      attempts: 20,
      timeBetweenAttemptsMs: 60000,
    },
  };
    await deployToGroup(props);
} catch (e) {
    console.error(e);
    process.exit(1);
}
```
