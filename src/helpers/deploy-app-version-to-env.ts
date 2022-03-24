/* eslint-disable no-console */
import {
  DescribeEnvironmentHealthCommand,
  DescribeEnvironmentHealthCommandOutput,
  ElasticBeanstalkClient,
  UpdateEnvironmentCommand,
} from '@aws-sdk/client-elastic-beanstalk';
import { IAppVersionProps, IBeanstalkEnvironment } from './Interfaces';

const AWS_EB_HEALTH_CHECK_ATTEMPTS = 20;
const AWS_EB_HEALTH_CHECK_ATTRS_TO_GET = ['Status', 'HealthStatus', 'InstancesHealth'];
const AWS_EB_HEALTH_CHECK_TIME_BETWEEN_ATTEMPTS_MS = 60000;
const AWS_EB_HEALTH_CHECK_UNHEALTHY_STATES = ['Severe', 'Degraded', 'Warning'];

/**
 * Waits for ms number of miliseconds before resolving. Helper to give
 * beanstalk environments some breathing room while deploying.
 *
 * @param ms Number of miliseconds to sleep.
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * If the beanstalk environment is in a non-terminal state, waits for it to
 * reach a healthy state and then returns. Errors if timeout threshold is met.
 *
 * @param env DeployProps
 */
async function waitForBeanstalkHealthiness(
  client: ElasticBeanstalkClient,
  env: IBeanstalkEnvironment,
  dryRun?: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(`DRY RUN: Would have waited for beanstalk environment ${env.name} to become healthy.`);
    return;
  }
  let getHealthResp: DescribeEnvironmentHealthCommandOutput;
  console.log(`Waiting for beanstalk environment '${env.name}' to become healthy...`);
  for (let attempt = 1; attempt <= AWS_EB_HEALTH_CHECK_ATTEMPTS; attempt++) {
    getHealthResp = await client.send(
      new DescribeEnvironmentHealthCommand({
        AttributeNames: AWS_EB_HEALTH_CHECK_ATTRS_TO_GET,
        EnvironmentName: env.name,
      }),
    );

    // Check beanstalk health
    if (!(getHealthResp.Status && getHealthResp.HealthStatus)) {
      throw new Error(`Beanstalk status for '${env.name}' could not be retrieved. Cannot proceed safely.`);
    }
    const isInHealthyState = !AWS_EB_HEALTH_CHECK_UNHEALTHY_STATES.includes(getHealthResp.HealthStatus);
    if (getHealthResp.Status === 'Updating') {
      console.log(
        `Beanstalk environment '${env.name}' current health is ${getHealthResp.HealthStatus}, in updating state...`,
      );
    } else if (getHealthResp.Status === 'Ready' && !isInHealthyState) {
      console.log(`Beanstalk environment '${env.name}' ready, but getting healthy...`);
    } else if (getHealthResp.Status === 'Ready' && isInHealthyState) {
      console.log(`Beanstalk environment '${env.name}' is ready and healthy.`);
      return;
    }

    console.debug(getHealthResp);
    if (attempt != AWS_EB_HEALTH_CHECK_ATTEMPTS) await sleep(AWS_EB_HEALTH_CHECK_TIME_BETWEEN_ATTEMPTS_MS);
  }
  throw new Error(`Beanstalk '${env.name}' did not reach a healthy state: ${JSON.stringify(getHealthResp!)}`);
}

/**
 * Issues a deployment of a beanstalk application version to a single
 * beanstalk environment.
 *
 * @param client The EB client configured to operate against resources.
 * @param env DeployProps
 */
async function deployApplicationVersion(
  client: ElasticBeanstalkClient,
  env: IBeanstalkEnvironment,
  version: IAppVersionProps,
  dryRun?: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(`DRY RUN: Would have deployed app version ${version.label} to beanstalk environment ${env.name}`);
    return;
  }

  console.log(`Initiating deployment of version ${version.label} to environment ${env.name}...`);
  const resp = await client.send(
    new UpdateEnvironmentCommand({
      ApplicationName: env.app,
      EnvironmentName: env.name,
      VersionLabel: version.label,
    }),
  );

  // Verify deployment initiated successfully
  const statusCode = resp.$metadata.httpStatusCode;
  if (statusCode && statusCode >= 200 && statusCode < 300) {
    console.log(`Deployment of app version '${version.label}' triggered for '${env.name}'.`);
  } else {
    throw new Error(
      `Triggered deployment of app version '${version.label}' failed for '${env.name}'. Response metadata: ${resp.$metadata}`,
    );
  }
}

/**
 * Main entrypoint of the deploy process. Creates a Beanstalk application
 * version if needed, and then issues a deployment if the environment is ready
 * for one. Verifies the deployment completes successfully.
 *
 * @param env  Set of properties required to deploy to a Beanstalk environment.
 * @param dryRun If true, only described what will happen as a no-op.
 */
export async function deploy(
  client: ElasticBeanstalkClient,
  env: IBeanstalkEnvironment,
  version: IAppVersionProps,
  dryRun = false,
): Promise<void> {
  try {
    // Deploy
    await waitForBeanstalkHealthiness(client, env, dryRun); // Verify env is ready to receive deployment
    await deployApplicationVersion(client, env, version, dryRun); // Initiate deployment
    await waitForBeanstalkHealthiness(client, env, dryRun); // Verify env reaches healthy state after deployment
  } catch (e) {
    throw new Error(`Beanstalk ${env.name} failed deployment. ${e}`);
  }
}
