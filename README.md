# CI Deploy Process

Historically we have used [Travis CI deployment providers](https://docs.travis-ci.com/user/deployment-v2#supported-providers) to initiate deployments to our beanstalk environments living out in AWS. The goal for our next iteration is to continue using Travis CI, but phase out the built-in deployment providers in favor of custom deploy scripts.

## Why?

-   **Decoupling from Travis**
    -   We want the possibility of switching over to any CI tool (GitHub actions, GitLab CI, etc.), and in order to do that, we need portable scripts that can be run Anywhere™.
    -   CI scripts can be written in any language such that engineers can easily read and improve upon the CI scripts. I recommend TypeScript.
    -   Consequently, we can easily introduce tests to our CI scripts.
-   **Parallel deployments**
    -   With [Travis CI Beanstalk provider](https://docs.travis-ci.com/user/deployment-v2/providers/elasticbeanstalk/) we could only issue serial deployments to a single beanstalk environment at a time. With custom scripts, we can utilize language functionality (like TypeScript async functions, Golang goroutines, etc.) to allow for parallel deployments to multiple beanstalks at once...in whatever batched fashion we so desire.
    -   Allows us to easily deploy to a single region at first before moving onto the rest of the world.
-   **Build once, deploy many**
    -   Worse than serial deployments is not being able to deploy at all. The Travis Beanstalk provider creates a new Beanstalk Application Version per beanstalk environment, leading to ClickUp hitting AWS service limits like [TooManyApplicationVersions errors](https://stackoverflow.com/questions/9589531/how-to-avoid-a-toomanyapplicationversion-exception-on-aws-elastic-beanstalk). This entirely blocks deploys. With custom scripts, we get more control over how we build/deploy, and can therefore limit how many Application Versions are created (should be no more than one per Beanstalk Application per "release").

## How?

As mentioned earlier, we are phasing out the Travis built-in Beanstalk deployment provider in favor of custom scripts. To do so, changes are being made to the following stages.

### Build Stage

The build stage is nearly the same as it always has been, with the exception of now uploading the artifacts to S3 buckets spread across multiple regions/accounts.

This allows us to reuse the same build artifacts multiple times, and have an auditable history of builds.

For now, the implementation uses the [Travis S3 Deployment provider](https://docs.travis-ci.com/user/deployment-v2/providers/s3/) since it was the quickest happy-path approach. In the future, we do want this to be handled with a custom script, something along the lines of `tools/ci/build/build.ts`. This is easily attainable...but...baby steps.

### Deploy Stage

The first new custom script is `tools/ci/deploy/deploy.ts`, which handles asynchronous+simultaneous deployments to a group of beanstalk environments. It does this by creating an Application Version (one per Beanstalk Application only) from an artifact in S3 followed by issuing deployments of that Application Version to each respective beanstalk environment as configured in `tools/ci/deploy/helpers/beanstalk-groups.ts`. An example invocation of this script from Travis looks like:

```bash
# Deploys the build artifact constructed by the current Travis build to each
# beanstalk environment set in the `test` group of beanstalks in
# tools/ci/deploy/helpers/beanstalk-groups.ts
AWS_ACCESS_KEY_ID=$TRAVISCI_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$TRAVISCI_SECRET_ACCESS_KEY \
npm run cicd:deploy -- \
    --ebGroup=X \
    --ebAppVersionGitsha="${TRAVIS_COMMIT}" \
    --ebAppVersionDescription="${TRAVIS_COMMIT_MESSAGE}"
```

To start cutting over from the Travis Beanstalk provider list to the custom script:

1. Add beanstalk environments to group X in `tools/ci/deploy/helpers/beanstalk-groups.ts` (create a new group if needed)
2. Remove them from the Travis Beanstalk provider deploy list in `.travis.yml`
3. Call `npm run cicd:deploy` in a new `deploy:` list entry in `.travis.yml` with `ebGroup=X` like so:

    ```yaml
    # Deploys build artifact version to `X` group of beanstalk environments (add --force to avoid dry-run)
    # (AWS creds might be different depending on CU account)
    deploy:
        ... # Existing deployment entry
        # New entry starts here:
        - <<: *_ebCommonDeployConfig
          script: >-
              AWS_ACCESS_KEY_ID=$TRAVISCI_ACCESS_KEY_ID
              AWS_SECRET_ACCESS_KEY=$TRAVISCI_SECRET_ACCESS_KEY
              npm run cicd:deploy -- --ebGroup=X --ebAppVersionGitsha="${TRAVIS_COMMIT}" --ebAppVersionDescription="${TRAVIS_COMMIT_MESSAGE}"
    ```

Instead of explicitly defining all the beanstalks we want to deploy to in `beanstalk-groups.ts`, it would be absolutely lovely to query Beanstalk Applications and return all environments within. But this wouldn't allow for a slow cutover to vet the script, so...we'll get there eventually. Phase two!
