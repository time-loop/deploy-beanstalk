/* eslint-disable no-console */
import {
  DescribeEnvironmentHealthCommand,
  DescribeEnvironmentHealthCommandOutput,
  ElasticBeanstalkClient,
  UpdateEnvironmentCommand,
} from '@aws-sdk/client-elastic-beanstalk';
import { DBDeployApplicationVersionError } from './Errors';
import { IAppVersionProps, IBeanstalkEnvironment } from './Interfaces';

const AWS_EB_HEALTH_CHECK_ATTEMPTS = 30;
const AWS_EB_HEALTH_CHECK_ATTRS_TO_GET = ['Status', 'HealthStatus', 'InstancesHealth'];
const AWS_EB_HEALTH_CHECK_TIME_BETWEEN_ATTEMPTS_MS = 60000;
const AWS_EB_HEALTH_CHECK_UNHEALTHY_STATES = ['Severe', 'Degraded', 'Warning'];

interface IDeployProps {
  client: ElasticBeanstalkClient;
  dryRun?: boolean;
  env: IBeanstalkEnvironment;
  version: IAppVersionProps;
}

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
 */
async function waitForBeanstalkHealthiness(props: IDeployProps): Promise<void> {
  if (props.dryRun) {
    console.log(`DRY RUN: Would have waited for beanstalk environment ${props.env.name} to become healthy.`);
    return;
  }
  let getHealthResp: DescribeEnvironmentHealthCommandOutput;
  console.log(`Waiting for beanstalk environment '${props.env.name}' to become healthy...`);
  for (let attempt = 1; attempt <= AWS_EB_HEALTH_CHECK_ATTEMPTS; attempt++) {
    getHealthResp = await props.client.send(
      new DescribeEnvironmentHealthCommand({
        AttributeNames: AWS_EB_HEALTH_CHECK_ATTRS_TO_GET,
        EnvironmentName: props.env.name,
      }),
    );

    // Check beanstalk health
    if (!(getHealthResp.Status && getHealthResp.HealthStatus)) {
      throw new Error(`Beanstalk status for '${props.env.name}' could not be retrieved. Cannot proceed safely.`);
    }
    const isInHealthyState = !AWS_EB_HEALTH_CHECK_UNHEALTHY_STATES.includes(getHealthResp.HealthStatus);
    if (getHealthResp.Status === 'Updating') {
      console.log(
        `Beanstalk environment '${props.env.name}' current health is ${getHealthResp.HealthStatus}, in updating state...`,
      );
    } else if (getHealthResp.Status === 'Ready' && !isInHealthyState) {
      console.log(`Beanstalk environment '${props.env.name}' ready, but getting healthy...`);
    } else if (getHealthResp.Status === 'Ready' && isInHealthyState) {
      console.log(`Beanstalk environment '${props.env.name}' is ready and healthy.`);
      return;
    }

    console.debug(getHealthResp);
    if (attempt != AWS_EB_HEALTH_CHECK_ATTEMPTS) await sleep(AWS_EB_HEALTH_CHECK_TIME_BETWEEN_ATTEMPTS_MS);
  }
  throw new Error(`Beanstalk '${props.env.name}' did not reach a healthy state: ${JSON.stringify(getHealthResp!)}`);
}

/**
 * Issues a deployment of a beanstalk application version to a single
 * beanstalk environment.
 */
async function deployApplicationVersion(props: IDeployProps): Promise<void> {
  if (props.dryRun) {
    console.log(
      `DRY RUN: Would have deployed app version ${props.version.label} to beanstalk environment ${props.env.name}`,
    );
    return;
  }

  console.log(`Initiating deployment of version ${props.version.label} to environment ${props.env.name}...`);
  const resp = await props.client.send(
    new UpdateEnvironmentCommand({
      ApplicationName: props.env.app,
      EnvironmentName: props.env.name,
      VersionLabel: props.version.label,
    }),
  );

  // Verify deployment initiated successfully
  const statusCode = resp.$metadata.httpStatusCode;
  if (statusCode && statusCode >= 200 && statusCode < 300) {
    console.log(`Deployment of app version '${props.version.label}' triggered for '${props.env.name}'.`);
  } else {
    throw new Error(
      `Triggered deployment of app version '${props.version.label}' failed for '${
        props.env.name
      }'. Response metadata: ${JSON.stringify(resp.$metadata, undefined, 2)}`,
    );
  }
}

/**
 * Main entrypoint of the deploy process. Creates a Beanstalk application
 * version if needed, and then issues a deployment if the environment is ready
 * for one. Verifies the deployment completes successfully.
 */
export async function deploy(props: IDeployProps): Promise<void> {
  try {
    await waitForBeanstalkHealthiness(props); // Verify env is ready to receive deployment
    await deployApplicationVersion(props); // Initiate deployment
    await waitForBeanstalkHealthiness(props); // Verify env reaches healthy state after deployment
  } catch (e) {
    throw new DBDeployApplicationVersionError(props.env.name, props.version.label, e as Error);
  }
}
