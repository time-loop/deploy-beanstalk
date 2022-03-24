# deploy-beanstalk

[![codecov](https://codecov.io/gh/time-loop/deploy-beanstalk/branch/main/graph/badge.svg?token=oLuqCIiUqO)](https://codecov.io/gh/time-loop/deploy-beanstalk)

Historically we have used [Travis CI deployment providers](https://docs.travis-ci.com/user/deployment-v2#supported-providers) to initiate deployments to our beanstalk environments living out in AWS. The goal for our next iteration is to phase out the built-in deployment providers in favor of custom deploy scripts.

## Why?

- **Decoupling from Travis**
  - We want the possibility of switching over to any CI tool (GitHub actions, GitLab CI, etc.), and in order to do that, we need portable scripts that can be run Anywhere™.
  - CI scripts can be written in any language such that engineers can easily read and improve upon the CI scripts. I recommend TypeScript.
  - Consequently, we can easily introduce tests to our CI scripts.
- **Parallel deployments**
  - With [Travis CI Beanstalk provider](https://docs.travis-ci.com/user/deployment-v2/providers/elasticbeanstalk/) we could only issue serial deployments to a single beanstalk environment at a time. With custom scripts, we can utilize language functionality (like TypeScript async functions, Golang goroutines, etc.) to allow for parallel deployments to multiple beanstalks at once...in whatever batched fashion we so desire.
  - Allows us to easily deploy to a single region at first before moving onto the rest of the world.
- **Build once, deploy many**
  - Worse than serial deployments is not being able to deploy at all. The Travis Beanstalk provider creates a new Beanstalk Application Version per beanstalk environment, leading to ClickUp hitting AWS service limits like [TooManyApplicationVersions errors](https://stackoverflow.com/questions/9589531/how-to-avoid-a-toomanyapplicationversion-exception-on-aws-elastic-beanstalk). This entirely blocks deploys. With custom scripts, we get more control over how we build/deploy, and can therefore limit how many Application Versions are created (should be no more than one per Beanstalk Application per "release").

## Usage

The first new custom script is `tools/ci/deploy/deploy.ts`, which handles asynchronous+simultaneous deployments to a group of beanstalk environments. It does this by creating an Application Version (one per Beanstalk Application only) from an artifact in S3 followed by issuing deployments of that Application Version to each respective beanstalk environment as configured in `tools/ci/deploy/helpers/beanstalk-groups.ts`. An example invocation of this script from Travis looks like:

TODO: Include example invocation here

TODO: And add more...
