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

### Importing

```typescript
import { deployToGroup, IBeanstalkGroup } from '@time-loop/deploy-beanstalk';
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
    const dryRyn = false;
    await deployToGroup(group, !dryRun);
} catch (e) {
    console.error(`Deploy to beanstalk group ${group.name} failed: ${e}`);
    process.exit(1);
}
```
