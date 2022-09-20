import { ElasticBeanstalkClient } from '@aws-sdk/client-elastic-beanstalk';
import chalk from 'chalk';
import loglevel from 'loglevel';
import { create } from './helpers/create-app-version';
import { deploy } from './helpers/deploy-app-version-to-env';
import { DBError, DBGroupDeployTriggerError, DBHealthinessCheckError } from './helpers/Errors';
import { waitForGroupHealthiness } from './helpers/healthiness';
import { IDeployToGroupProps, IHealthCheckProps, Logger } from './helpers/Interfaces';

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
async function createAppVersionsForGroup(client: ElasticBeanstalkClient, props: IDeployToGroupProps, log: Logger) {
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
          log,
        }),
      );
      appsWithCreatedVersions.push(env.app);
    }
  });
  const versionCreationResults = await Promise.allSettled(appVersionPromises);
  verifyPromisesSettled(versionCreationResults);
  log.info(chalk.green('All needed application versions exist.'));
}

async function preDeployHealthcheck(client: ElasticBeanstalkClient, props: IDeployToGroupProps, log: Logger) {
  try {
    log.info(chalk.blue('Verifying environments are ready to receive deployment before initiating...'));
    await waitForGroupHealthiness({
      client,
      group: props.group,
      force: props.force ?? DEFAULT_FORCE,
      checkVersion: false,
      log,
      ...(props.preDeployHealthCheckProps ?? DEFAULT_HEALTH_CHECK_PROPS),
    });
  } catch (e) {
    if (e instanceof DBHealthinessCheckError) {
      e.message = `preDeployHealthcheck(): ${e.message}`;
    }
    throw e;
  }
}

async function postDeployHealthcheck(client: ElasticBeanstalkClient, props: IDeployToGroupProps, log: Logger) {
  log.info(chalk.blue('Verifying environments successfully receive the deployment...this could take a while.'));
  try {
    await waitForGroupHealthiness({
      client,
      group: props.group,
      force: props.force ?? DEFAULT_FORCE,
      checkVersion: true,
      log,
      ...(props.postDeployHealthCheckProps ?? DEFAULT_HEALTH_CHECK_PROPS),
    });
  } catch (e) {
    if (e instanceof DBHealthinessCheckError) {
      e.message = `postDeployHealthcheck(): ${e.message}`;
    }
    throw e;
  }

  log.info(
    chalk.green('Successfully deployed version ') +
      chalk.blue(props.group.versionProps.label) +
      chalk.green(' to beanstalk group ') +
      chalk.blue(props.group.name),
  );
}

/**
 * For each Beanstalk Environment in the group, deploys the respective
 * Application Version.
 */
async function deployAppVersionsToGroup(client: ElasticBeanstalkClient, props: IDeployToGroupProps, log: Logger) {
  log.info(`Asynchronously kicking off deployment to the ${props.group.name} group of beanstalks.`);
  const triggerErr = new DBGroupDeployTriggerError('deployAppVersionsToGroup: ', []);
  const force = props.force ?? DEFAULT_FORCE;
  await Promise.all(
    props.group.environments.map(async (env) => {
      try {
        await deploy({
          client,
          force,
          env,
          log,
          version: props.group.versionProps,
        });
      } catch (e) {
        triggerErr.errors.push(e as Error);
        // If an env fails to trigger deploy, note it but continue to check others.
        log.error(chalk.red(e));
      }
    }),
  );
  if (triggerErr.errors.length !== 0) throw triggerErr;
}

/**
 * Initializes the Beanstalk Client, creates the needed Application Versions,
 * and verifies the Beanstalk Environments in the group are ready to receive
 * the deployment.
 */
async function preDeploySteps(props: IDeployToGroupProps, log: Logger): Promise<ElasticBeanstalkClient> {
  try {
    const client = new ElasticBeanstalkClient({
      maxAttempts: AWS_CLIENT_REQUEST_MAX_ATTEMPTS_DEFAULT,
      region: props.group.region,
    });
    await createAppVersionsForGroup(client, props, log);
    await preDeployHealthcheck(client, props, log);
    return client;
  } catch (e) {
    log.error(chalk.red(e));
    if (e instanceof DBError) {
      e.errors.forEach((err) => log.error(chalk.red(err)));
    }
    log.error(chalk.red('Could not trigger deployment to beanstalk group ') + chalk.blue(props.group.name));
    throw e;
  }
}

/**
 * Triggers the deployment of the newly created Application Version to each
 * Beanstalk Environment in the group, then verifies they reach a healthy state
 * and successfully land the expected version.
 */
async function deploySteps(client: ElasticBeanstalkClient, props: IDeployToGroupProps, log: Logger) {
  let deployErrs: DBError = new DBError('deploySteps(): ', []);
  try {
    await deployAppVersionsToGroup(client, props, log);
  } catch (e) {
    // We still want to see status of Beanstalks who did have deploy triggered
    deployErrs.errors.push(e as Error);
  }

  try {
    await postDeployHealthcheck(client, props, log);
  } catch (e) {
    log.error(chalk.red(e));
    if (e instanceof DBError) {
      e.errors.forEach((err) => log.error(chalk.red(err)));
    }
    log.error(chalk.red('Deployment to beanstalk group ') + chalk.blue(props.group.name) + chalk.red(' failed.'));
    deployErrs.errors.push(e as Error);
  }

  if (deployErrs.errors.length !== 0) throw deployErrs;
}

/**
 * Iterates over a group of Beanstalk Environments, creates Application
 * Versions for their respective Beanstalk Applications, and then deploys
 * those versions to the Beanstalk Environments and verifies their health.
 */
export async function deployToGroup(props: IDeployToGroupProps, log: Logger = loglevel) {
  const group = props.group;
  log.setLevel(props.logLevel ?? 'info');
  log.info(chalk.green('Beginning deploy process for beanstalk group ') + chalk.blue(group.name));

  await deploySteps(await preDeploySteps(props, log), props, log);
}
