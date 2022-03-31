/* eslint-disable no-console */
import { ElasticBeanstalkClient } from '@aws-sdk/client-elastic-beanstalk';
import chalk from 'chalk';
import log from 'loglevel';
import { create } from './helpers/create-app-version';
import { deploy } from './helpers/deploy-app-version-to-env';
import { DBAsyncError } from './helpers/Errors';
import { IBeanstalkGroup, IDeployToGroupProps } from './helpers/Interfaces';

const AWS_CLIENT_REQUEST_MAX_ATTEMPTS_DEFAULT = 10;

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
  if (errs.length > 0) throw new DBAsyncError('At least one async process failed as indicated above.', errs);
}

/**
 * Each Beanstalk Environment listed in group belongs to a Beanstalk
 * Application. For each of those unique Applications, we must create an App
 * Version to use for deployments.
 */
async function createAppVersionsForGroup(client: ElasticBeanstalkClient, group: IBeanstalkGroup, force: boolean) {
  const appsWithCreatedVersions: string[] = [];
  const appVersionPromises: Promise<void>[] = [];
  log.info(`Creating application versions for beanstalk group ${group.name}`);
  group.environments.forEach((env) => {
    if (!appsWithCreatedVersions.includes(env.app)) {
      appVersionPromises.push(
        create({
          client,
          version: group.versionProps,
          appName: env.app,
          dryRun: !force,
        }),
      );
      appsWithCreatedVersions.push(env.app);
    }
  });
  const versionCreationResults = await Promise.allSettled(appVersionPromises);
  verifyPromisesSettled(versionCreationResults);
  log.info(chalk.green('All needed application versions exist. Proceeding to deploy them...'));
}

/**
 * For each Beanstalk Environment in group, deploys the respective Application
 * Version.
 */
async function deployAppVersionsToGroup(client: ElasticBeanstalkClient, group: IBeanstalkGroup, force: boolean) {
  log.info(`Asynchronously kicking off deployment to the ${group.name} group of beanstalks.`);
  const deploymentResults = await Promise.allSettled(
    group.environments.map((env) =>
      deploy({
        client,
        dryRun: !force,
        env,
        version: group.versionProps,
      }),
    ),
  );
  verifyPromisesSettled(deploymentResults);
  log.info(chalk.green('Successfully deployed to beanstalk group ') + chalk.blue(group.name));
}

/**
 * Iterates over a group of Beanstalk Environments, creates Application
 * Versions for their respective Beanstalk Applications, and then deploys
 * those versions to the Beanstalk Environments all asynchronously.
 */
export async function deployToGroup(props: IDeployToGroupProps) {
  try {
    log.setLevel(props.logLevel ?? log.levels.INFO);
    log.info(chalk.green('Beginning deploy process for beanstalk group ') + chalk.blue(props.group.name));
    const client = new ElasticBeanstalkClient({
      maxAttempts: AWS_CLIENT_REQUEST_MAX_ATTEMPTS_DEFAULT,
      region: props.group.region,
    });
    const force = props.force ?? false;
    await createAppVersionsForGroup(client, props.group, force);
    await deployAppVersionsToGroup(client, props.group, force);
  } catch (e) {
    if (e instanceof DBAsyncError) {
      e.errors.forEach((err) => log.error(chalk.red(err)));
    } else {
      log.error(chalk.red(e));
    }
    log.error(chalk.red('Deploy to beanstalk group ') + chalk.blue(props.group.name) + chalk.red(' failed.'));
    throw e;
  }
}
