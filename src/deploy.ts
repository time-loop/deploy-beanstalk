/* eslint-disable no-console */
import { ElasticBeanstalkClient } from '@aws-sdk/client-elastic-beanstalk';
import chalk from 'chalk';
import log from 'loglevel';
import { create } from './helpers/create-app-version';
import { deploy } from './helpers/deploy-app-version-to-env';
import { DBError } from './helpers/Errors';
import { waitForGroupHealthiness } from './helpers/healthiness';
import { IDeployToGroupProps, IHealthCheckProps } from './helpers/Interfaces';

const AWS_CLIENT_REQUEST_MAX_ATTEMPTS_DEFAULT = 10;
const DEFAULT_FORCE = false;
const DEFAULT_HEALTH_CHECK_PROPS: IHealthCheckProps = {
  attempts: 5,
  timeBetweenAttemptsMs: 60000,
};

/**
 * Helper function to verify that async processes succeeded.
 * @param results - The async promises to check for fullfillment
 */
function verifyPromisesSettled(results: PromiseSettledResult<void>[]) {
  const errs: Error[] = [];
  results.forEach((result) => {
    if (result.status === 'rejected') {
      errs.push(result.reason);
    }
  });
  if (errs.length > 0) throw new DBError('At least one async process failed as indicated above.', errs);
}

/**
 * Each Beanstalk Environment listed in group belongs to a Beanstalk
 * Application. For each of those unique Applications, we must create an App
 * Version to use for deployments.
 */
async function createAppVersionsForGroup(client: ElasticBeanstalkClient, props: IDeployToGroupProps) {
  const appsWithCreatedVersions: string[] = [];
  const appVersionPromises: Promise<void>[] = [];
  log.info(`Creating application versions for beanstalk group ${props.group.name}`);
  props.group.environments.forEach((env) => {
    if (!appsWithCreatedVersions.includes(env.app)) {
      appVersionPromises.push(
        create({
          client,
          version: props.group.versionProps,
          appName: env.app,
          dryRun: !props.force,
        }),
      );
      appsWithCreatedVersions.push(env.app);
    }
  });
  const versionCreationResults = await Promise.allSettled(appVersionPromises);
  verifyPromisesSettled(versionCreationResults);
  log.info(chalk.green('All needed application versions exist.'));
}

/**
 * For each Beanstalk Environment in group, deploys the respective Application
 * Version and then waits to verify their healthiness.
 */
async function deployAppVersionsToGroup(client: ElasticBeanstalkClient, props: IDeployToGroupProps) {
  log.info(`Asynchronously kicking off deployment to the ${props.group.name} group of beanstalks.`);
  const triggerErr = new DBError('deployAppVersionsToGroup: ', []);
  const force = props.force ?? DEFAULT_FORCE;
  await Promise.all(
    props.group.environments.map(async (env) => {
      try {
        await deploy({
          client,
          force,
          env,
          version: props.group.versionProps,
        });
      } catch (e) {
        triggerErr.errors.push(e as Error);
        // If an env fails to trigger deploy, note it but continue to check others.
        log.error(chalk.red(e));
      }
    }),
  );
  try {
    // Verify the group successfully receives the deployment.
    await waitForGroupHealthiness({
      client,
      group: props.group,
      force,
      checkVersion: true,
      ...(props.postDeployHealthCheckProps ?? DEFAULT_HEALTH_CHECK_PROPS),
    });
    log.info(
      chalk.green('Successfully deployed version ') +
        chalk.blue(props.group.versionProps.label) +
        chalk.green(' to beanstalk group ') +
        chalk.blue(props.group.name),
    );
  } catch (e) {
    if (triggerErr.errors.length === 0) throw e;
    triggerErr.errors.push(e as Error);
    throw triggerErr;
  }
}

/**
 * Iterates over a group of Beanstalk Environments, creates Application
 * Versions for their respective Beanstalk Applications, and then deploys
 * those versions to the Beanstalk Environments and verifies their health.
 */
export async function deployToGroup(props: IDeployToGroupProps) {
  const group = props.group;
  const force = props.force ?? DEFAULT_FORCE;
  try {
    log.setLevel(props.logLevel ?? log.levels.INFO);
    log.info(chalk.green('Beginning deploy process for beanstalk group ') + chalk.blue(group.name));
    const client = new ElasticBeanstalkClient({
      maxAttempts: AWS_CLIENT_REQUEST_MAX_ATTEMPTS_DEFAULT,
      region: group.region,
    });
    await createAppVersionsForGroup(client, props);
    log.info(chalk.blue('Verifying environments are ready to receive deployment before initiating...'));
    await waitForGroupHealthiness({
      client,
      group,
      force,
      checkVersion: false,
      ...(props.preDeployHealthCheckProps ?? DEFAULT_HEALTH_CHECK_PROPS),
    });
    await deployAppVersionsToGroup(client, props);
  } catch (e) {
    if (e instanceof DBError) {
      e.errors.forEach((err) => log.error(chalk.red(err)));
    } else {
      log.error(chalk.red(e));
    }
    log.error(chalk.red('Deploy to beanstalk group ') + chalk.blue(group.name) + chalk.red(' failed.'));
    throw e;
  }
}
