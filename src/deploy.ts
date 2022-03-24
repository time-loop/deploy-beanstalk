/* eslint-disable no-console */
import { ElasticBeanstalkClient } from '@aws-sdk/client-elastic-beanstalk';
import chalk from 'chalk';
import { create } from './helpers/create-app-version';
import { deploy } from './helpers/deploy-app-version-to-env';
import { IBeanstalkGroup } from './helpers/Interfaces';

const AWS_CLIENT_REQUEST_MAX_ATTEMPTS = 3;

/**
 * Helper function to verify that async processes succeeded.
 * @param results - The async promises to check for fullfillment
 */
function verifyPromisesSettled(results: PromiseSettledResult<void>[]) {
  let success = true;
  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.error(chalk.red(`${result.reason}`));
      success = false;
    }
  });
  if (!success) throw new Error('At least one async process failed as indicated above.');
}

/**
 * Each Beanstalk Environment listed in group belongs to a Beanstalk
 * Application. For each of those unique Applications, we must create an App
 * Version to use for deployments.
 *
 * @param group
 * @param force
 */
async function createAppVersionsForGroup(client: ElasticBeanstalkClient, group: IBeanstalkGroup, force: boolean) {
  const appsWithCreatedVersions: string[] = [];
  const appVersionPromises: Promise<void>[] = [];
  console.log(`Creating application versions for beanstalk group ${group.name}`);
  group.environments.forEach((env) => {
    if (!appsWithCreatedVersions.includes(env.app)) {
      appVersionPromises.push(create(client, group.versionProps, env.app, !force));
      appsWithCreatedVersions.push(env.app);
    }
  });
  const versionCreationResults = await Promise.allSettled(appVersionPromises);
  verifyPromisesSettled(versionCreationResults);
  console.log(chalk.green('All needed application versions exist. Proceeding to deploy them...'));
}

/**
 * For each Beanstalk Environment in group, deploys the respective Application
 * Version.
 *
 * @param group
 * @param force
 */
async function deployAppVersionsToGroup(client: ElasticBeanstalkClient, group: IBeanstalkGroup, force: boolean) {
  console.log(`Asynchronously kicking off deployment to the ${group.name} group of beanstalks.`);
  const deploymentResults = await Promise.allSettled(
    group.environments.map((env) => deploy(client, env, group.versionProps, !force)),
  );
  verifyPromisesSettled(deploymentResults);
  console.log(chalk.green('Successfully deployed to beanstalk group ') + chalk.blue(group.name));
}

/**
 * Iterates over a group of Beanstalk Environments, creates Application
 * Versions for their respective Beanstalk Applications, and then deploys
 * those versions to the Beanstalk Environments all asynchronously.
 *
 * @param group - The list of Beanstalk Environment to deploy to.
 * @param force - If false, will perform a no-op describing what would occur.
 *                Defaults to false.
 */
export async function deployToGroup(group: IBeanstalkGroup, force: boolean = false) {
  try {
    console.log(chalk.green('Beginning deploy process for beanstalk group ') + chalk.blue(group.name));
    const client = new ElasticBeanstalkClient({
      maxAttempts: AWS_CLIENT_REQUEST_MAX_ATTEMPTS,
      region: group.region,
    });
    await createAppVersionsForGroup(client, group, force);
    await deployAppVersionsToGroup(client, group, force);
  } catch (e) {
    // TODO: This should throw an error since this is a library.
    const colorizedErrMsg =
      chalk.red('Deploy to beanstalk group ') + chalk.blue(group.name) + chalk.red(` failed: ${e}`);
    console.error(colorizedErrMsg);
    process.exit(1);
  }
}
