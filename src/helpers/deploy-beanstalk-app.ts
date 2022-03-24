/* eslint-disable no-console */
import {
  DescribeEnvironmentHealthCommand,
  DescribeEnvironmentHealthCommandOutput,
  ElasticBeanstalkClient,
  UpdateEnvironmentCommand,
} from '@aws-sdk/client-elastic-beanstalk';
import { DeployProps } from './Interfaces';

const AWS_CLIENT_REQUEST_MAX_ATTEMPTS = 3;
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
 * @param props DeployProps
 */
async function waitForBeanstalkHealthiness(
  client: ElasticBeanstalkClient,
  props: DeployProps,
  dryRun?: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(`DRY RUN: Would have waited for beanstalk environment ${props.ebEnv} to become healthy.`);
    return;
  }
  let getHealthResp: DescribeEnvironmentHealthCommandOutput;
  console.log(`Waiting for beanstalk environment '${props.ebEnv}' to become healthy...`);
  for (let attempt = 1; attempt <= AWS_EB_HEALTH_CHECK_ATTEMPTS; attempt++) {
    getHealthResp = await client.send(
      new DescribeEnvironmentHealthCommand({
        AttributeNames: AWS_EB_HEALTH_CHECK_ATTRS_TO_GET,
        EnvironmentName: props.ebEnv,
      }),
    );

    // Check beanstalk health
    if (!(getHealthResp.Status && getHealthResp.HealthStatus)) {
      throw new Error(`Beanstalk status for '${props.ebEnv}' could not be retrieved. Cannot proceed safely.`);
    }
    const isInHealthyState = !AWS_EB_HEALTH_CHECK_UNHEALTHY_STATES.includes(getHealthResp.HealthStatus);
    if (getHealthResp.Status === 'Updating') {
      console.log(
        `Beanstalk environment '${props.ebEnv}' current health is ${getHealthResp.HealthStatus}, in updating state...`,
      );
    } else if (getHealthResp.Status === 'Ready' && !isInHealthyState) {
      console.log(`Beanstalk environment '${props.ebEnv}' ready, but getting healthy...`);
    } else if (getHealthResp.Status === 'Ready' && isInHealthyState) {
      console.log(`Beanstalk environment '${props.ebEnv}' is ready and healthy.`);
      return;
    }

    console.debug(getHealthResp);
    if (attempt != AWS_EB_HEALTH_CHECK_ATTEMPTS) await sleep(AWS_EB_HEALTH_CHECK_TIME_BETWEEN_ATTEMPTS_MS);
  }
  throw new Error(`Beanstalk '${props.ebEnv}' did not reach a healthy state: ${JSON.stringify(getHealthResp!)}`);
}

/**
 * Issues a deployment of a beanstalk application version to a single
 * beanstalk environment.
 *
 * @param client The EB client configured to operate against resources.
 * @param props DeployProps
 */
async function deployApplicationVersion(
  client: ElasticBeanstalkClient,
  props: DeployProps,
  dryRun?: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(
      `DRY RUN: Would have deployed app version ${props.ebVersionLabel} to beanstalk environment ${props.ebEnv}`,
    );
    return;
  }

  console.log(`Initiating deployment of version ${props.ebVersionLabel} to environment ${props.ebEnv}...`);
  const resp = await client.send(
    new UpdateEnvironmentCommand({
      ApplicationName: props.ebApp,
      EnvironmentName: props.ebEnv,
      VersionLabel: props.ebVersionLabel,
    }),
  );

  // Verify deployment initiated successfully
  const statusCode = resp.$metadata.httpStatusCode;
  if (statusCode && statusCode >= 200 && statusCode < 300) {
    console.log(`Deployment of app version '${props.ebVersionLabel}' triggered for '${props.ebEnv}'.`);
  } else {
    throw new Error(
      `Triggered deployment of app version '${props.ebVersionLabel}' failed for '${props.ebEnv}'. Response metadata: ${resp.$metadata}`,
    );
  }
}

/**
 * Main entrypoint of the deploy process. Creates a Beanstalk application
 * version if needed, and then issues a deployment if the environment is ready
 * for one. Verifies the deployment completes successfully.
 *
 * @param props  Set of properties required to deploy to a Beanstalk environment.
 * @param dryRun If true, only described what will happen as a no-op.
 */
export async function deploy(props: DeployProps, dryRun = false): Promise<void> {
  try {
    // Init the AWS client
    const client = new ElasticBeanstalkClient({
      maxAttempts: AWS_CLIENT_REQUEST_MAX_ATTEMPTS,
      region: props.ebRegion,
    });

    // Deploy
    await waitForBeanstalkHealthiness(client, props, dryRun); // Verify env is ready to receive deployment
    await deployApplicationVersion(client, props, dryRun); // Initiate deployment
    await waitForBeanstalkHealthiness(client, props, dryRun); // Verify env reaches healthy state after deployment
  } catch (e) {
    throw new Error(`Beanstalk ${props.ebEnv} failed deployment. ${e}`);
  }
}
