/* eslint-disable no-console */
import {
  DescribeEnvironmentsCommand,
  DescribeEnvironmentsCommandOutput,
  ElasticBeanstalkClient,
  EnvironmentDescription,
} from '@aws-sdk/client-elastic-beanstalk';
import chalk from 'chalk';
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

/**
 * Waits for ms number of miliseconds before resolving. Helper to give
 * beanstalk environments some breathing room while deploying.
 *
 * @param ms Number of miliseconds to sleep.
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function groupEnvsByApp(envs: IBeanstalkEnvironment[]): IEnvironmentsByApp {
  return envs.reduce((previousValue: IEnvironmentsByApp, obj) => {
    const app = obj.app;
    previousValue[app] ? previousValue[app].push(obj) : (previousValue[app] = [obj]);
    return previousValue;
  }, {});
}

function numHealthyEnvironments(envs: EnvironmentDescription[], expectedVersionLabel?: string): number {
  let healthyCount = 0;
  envs.forEach((env) => {
    if (!(env.Status && env.HealthStatus)) {
      throw new Error(`Beanstalk status for '${env.EnvironmentName}' could not be retrieved. Cannot proceed safely.`);
    }
    const isInHealthyState = !AWS_EB_HEALTH_CHECK_UNHEALTHY_STATES.includes(env.HealthStatus);
    if (env.Status === 'Ready' && isInHealthyState) {
      if (!expectedVersionLabel) {
        ++healthyCount;
        log.info(`Beanstalk environment '${env.EnvironmentName}' is ready and healthy!`);
        return;
      }
      if (env.VersionLabel === expectedVersionLabel) {
        ++healthyCount;
        log.info(`Beanstalk environment '${env.EnvironmentName}' is ready and healthy!`);
      } else {
        log.error(
          chalk.red(
            `Beanstalk environment '${env.EnvironmentName}' is ready but not the expected version '${expectedVersionLabel}'`,
          ),
        );
      }
    } else {
      log.info(chalk.yellow(`Beanstalk environment is '${env.Status}' and '${env.HealthStatus}'...`));
    }
    log.debug(`Response for env ${env.EnvironmentName}: ${JSON.stringify(env)}`);
  });
  return healthyCount;
}

async function isGroupHealthy(props: IHealthCheckPropsPrivate): Promise<boolean> {
  const expectedHealthyCount = props.group.environments.length;
  let actualHealthyCount = 0;

  const beansToDescribe = groupEnvsByApp(props.group.environments);
  let resp: DescribeEnvironmentsCommandOutput;
  // For each Application Version
  for (const key in beansToDescribe) {
    if (beansToDescribe.hasOwnProperty(key)) {
      // If dry-run, pretend all are healthy
      if (!props.force) {
        log.info(`DRY RUN: Would have waited for beanstalks in app '${key}' to become healthy.`);
        actualHealthyCount = expectedHealthyCount;
        continue;
      }

      const envs = beansToDescribe[key];
      const envNames = envs.map((env) => env.name);
      resp = await props.client.send(
        new DescribeEnvironmentsCommand({
          ApplicationName: key,
          EnvironmentNames: envNames,
        }),
      );
      if (!resp.Environments) {
        throw new Error(`Failed to check status for Environments in App ${key}`);
      }
      actualHealthyCount += numHealthyEnvironments(
        resp.Environments,
        props.checkVersion ? props.group.versionProps.label : undefined,
      );
    }
  }
  return actualHealthyCount === expectedHealthyCount;
}

export async function waitForGroupHealthiness(props: IHealthCheckPropsPrivate): Promise<void> {
  for (let attempt = 1; attempt <= props.attempts; attempt++) {
    log.info(`Checking beanstalks health... Attempt ${attempt} of ${props.attempts}`);
    try {
      const isHealthy = await isGroupHealthy(props);
      if (isHealthy) {
        log.info(`All beanstalks in group '${props.group.name}' are healthy!`);
        return;
      }
    } catch (err) {
      throw new DBHealthinessCheckError(`Error checking group health: ${err}`);
    }
    await sleep(props.timeBetweenAttemptsMs);
  }
  throw new DBHealthinessCheckError(`Beanstalks are not healthy after ${props.attempts} attempt(s).`);
}
