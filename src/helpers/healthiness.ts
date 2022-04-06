/* eslint-disable no-console */
import {
  DescribeEnvironmentsCommand,
  DescribeEnvironmentsCommandOutput,
  ElasticBeanstalkClient,
  EnvironmentDescription,
} from '@aws-sdk/client-elastic-beanstalk';
import log from 'loglevel';
import { DBHealthinessCheckError } from './Errors';
import { IBeanstalkEnvironment, IBeanstalkGroup, IHealthCheckProps } from './Interfaces';

const AWS_EB_HEALTH_CHECK_UNHEALTHY_STATES = ['Severe', 'Degraded', 'Warning'];

interface IEnvironmentsByApp {
  [app: string]: IBeanstalkEnvironment[];
}

interface IHealthCheckPropsPrivate extends IHealthCheckProps {
  /**
   * Whether or not to check that the version is the expected version.
   */
  checkVersion: boolean;
  client: ElasticBeanstalkClient;
  force: boolean;
  group: IBeanstalkGroup;
}

interface IBeanstalkHealthStatuses {
  healthy: { envDesc: EnvironmentDescription; msg: string }[];
  unhealthy: { envDesc: EnvironmentDescription; msg: string }[];
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
 * Returns a map of app names to environments.
 *
 * @param envs The group of beanstalk environments to organize.
 * @returns The IBeanstalkEnvironment objects organized by application name.
 */
function groupEnvsByApp(envs: IBeanstalkEnvironment[]): IEnvironmentsByApp {
  return envs.reduce((previousValue: IEnvironmentsByApp, obj) => {
    const app = obj.app;
    previousValue[app] ? previousValue[app].push(obj) : (previousValue[app] = [obj]);
    return previousValue;
  }, {});
}

/**
 * Parses subset of DescribeEnvironmentsCommand response to organize
 * beanstalk environments based on whether they're healthy or not.
 *
 * @param envs The list of environments to check the status of.
 * @param expectedVersionLabel If set, only count environments that match this
 *                             version as healthy.
 * @returns The environments organized by status.
 */
function getEnvironmentsHealth(
  envs: EnvironmentDescription[],
  expectedVersionLabel?: string,
): IBeanstalkHealthStatuses {
  return envs.reduce(
    (previousValue: IBeanstalkHealthStatuses, envDesc) => {
      if (!(envDesc.Status && envDesc.HealthStatus)) {
        throw new Error(
          `Beanstalk status for '${envDesc.EnvironmentName}' could not be retrieved. Cannot proceed safely.`,
        );
      }
      const isInHealthyState = !AWS_EB_HEALTH_CHECK_UNHEALTHY_STATES.includes(envDesc.HealthStatus);
      if (envDesc.Status === 'Ready' && isInHealthyState) {
        if (!expectedVersionLabel) {
          previousValue.healthy.push({
            envDesc,
            msg: `Beanstalk environment '${envDesc.EnvironmentName}' is ready and healthy!`,
          });
        } else if (envDesc.VersionLabel === expectedVersionLabel) {
          previousValue.healthy.push({
            envDesc,
            msg: `Beanstalk environment '${envDesc.EnvironmentName}' is ready, healthy, and with expected version ${expectedVersionLabel}!`,
          });
        } else {
          previousValue.unhealthy.push({
            envDesc,
            msg: `Beanstalk environment '${envDesc.EnvironmentName}' is ready but not the expected version '${expectedVersionLabel}'`,
          });
        }
      } else {
        previousValue.unhealthy.push({
          envDesc,
          msg: `Beanstalk environment is '${envDesc.Status}' and '${envDesc.HealthStatus}'...`,
        });
      }
      return previousValue;
    },
    { healthy: [], unhealthy: [] },
  );
}

/**
 * Checks the status of each Beanstalk Environment in the group.
 *
 * @param props The properties used to check the healthiness of the group.
 * @returns The statuses of each environment organized by status.
 */
async function getGroupHealth(props: IHealthCheckPropsPrivate): Promise<IBeanstalkHealthStatuses> {
  const beansToDescribe = groupEnvsByApp(props.group.environments);
  let resp: DescribeEnvironmentsCommandOutput;
  let statuses: IBeanstalkHealthStatuses = { healthy: [], unhealthy: [] };
  // For each Application Version
  for (const key in beansToDescribe) {
    if (beansToDescribe.hasOwnProperty(key)) {
      if (!props.force) {
        log.info(`DRY RUN: Would have waited for beanstalks in app '${key}' to become healthy.`);
        continue;
      }

      const envs = beansToDescribe[key];
      resp = await props.client.send(
        new DescribeEnvironmentsCommand({
          ApplicationName: key,
          EnvironmentNames: envs.map((env) => env.name),
        }),
      );
      if (!resp.Environments) {
        throw new Error(`Failed to check status for Environments in App '${key}'`);
      }

      const partitioned = getEnvironmentsHealth(
        resp.Environments,
        props.checkVersion ? props.group.versionProps.label : undefined,
      );
      statuses.healthy = [...statuses.healthy, ...partitioned.healthy];
      statuses.unhealthy = [...statuses.unhealthy, ...partitioned.unhealthy];
    }
  }
  return statuses;
}

/**
 * Checks the healthiness of a group of environments and waits a given duration
 * for them to become healthy. Errors if they do not reach healthiness within
 * the duration.
 *
 * @param props The properties used to check the healthiness of the group.
 */
export async function waitForGroupHealthiness(props: IHealthCheckPropsPrivate): Promise<void> {
  for (let attempt = 1; attempt <= props.attempts; attempt++) {
    log.info(`Checking beanstalks health... Attempt ${attempt} of ${props.attempts}`);
    let statuses: IBeanstalkHealthStatuses;
    try {
      statuses = await getGroupHealth(props);
    } catch (err) {
      throw new DBHealthinessCheckError(`Could not check group health.`, [err as Error]);
    }
    const isLastAttempt = attempt === props.attempts;
    const allAreHealthy = statuses.healthy.length === props.group.environments.length;
    if (isLastAttempt && !allAreHealthy) {
      // Log healthy beanstalk statuses
      statuses.healthy.forEach((envStatus) => log.info(envStatus.msg));
      const errs = statuses.unhealthy.map((envStatus) => new Error(envStatus.msg));
      throw new DBHealthinessCheckError(`Beanstalks are not healthy after ${props.attempts} attempt(s).`, errs);
    }

    // If we're not on the last attempt, log all statuses
    [statuses.healthy, statuses.unhealthy].forEach((statusSet) => {
      statusSet.forEach((envStatus) => log.info(envStatus.msg));
    });
    if (allAreHealthy) {
      log.info(`All beanstalks in group '${props.group.name}' are healthy!`);
      return;
    }

    await sleep(props.timeBetweenAttemptsMs);
  }
  throw new DBHealthinessCheckError('Unexpected error checking group health.', [
    new Error('Reached end of for loop...should never.'),
  ]);
}
