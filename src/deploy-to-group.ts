/* eslint-disable no-console */
import chalk from 'chalk';
import { beanstalkGroups } from './helpers/beanstalk-groups';
import Config from './helpers/config';
import { create } from './helpers/create-beanstalk-app-version';
import { deploy } from './helpers/deploy-beanstalk-app';
import { DeployProps } from './helpers/Interfaces';

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
 * Each Beanstalk Environment listed in the beanstalksToDeploy group belongs
 * to a Beanstalk Application. For each of those unique Applications, we must
 * create an App Version to use for deployments.
 *
 * @param beanstalksToDeploy
 */
async function createAppVersionsForGroup(beanstalksToDeploy: DeployProps[]) {
  const appsWithCreatedVersions: string[] = [];
  const appVersionPromises: Promise<void>[] = [];
  console.log(`Creating application versions for beanstalk group ${Config.ebGroup}`);
  beanstalksToDeploy.forEach((config) => {
    if (!appsWithCreatedVersions.includes(config.ebApp)) {
      appVersionPromises.push(create(config, !Config.force));
      appsWithCreatedVersions.push(config.ebApp);
    }
  });
  const versionCreationResults = await Promise.allSettled(appVersionPromises);
  verifyPromisesSettled(versionCreationResults);
  console.log(chalk.green('All needed application versions exist. Proceeding to deploy them...'));
}

/**
 * For each Beanstalk Environment in beanstalksToDeploy, deploys the respective
 * Application Version.
 *
 * @param beanstalksToDeploy
 */
async function deployAppVersionsToGroup(beanstalksToDeploy: DeployProps[]) {
  console.log(`Asynchronously kicking off deployment to the ${Config.ebGroup} group of beanstalks.`);
  const deploymentResults = await Promise.allSettled(beanstalksToDeploy.map((env) => deploy(env, !Config.force)));
  verifyPromisesSettled(deploymentResults);
  console.log(chalk.green('Successfully deployed to beanstalk group ') + chalk.blue(Config.ebGroup));
}

export async function deployToGroup() {
  console.log(`Parsed configuration: \n${chalk.blue(JSON.stringify(Config, undefined, 2))}\n`);
  try {
    const beanstalksToDeploy = beanstalkGroups[Config.ebGroup];
    if (!beanstalksToDeploy) {
      throw new Error(`Beanstalk group ${Config.ebGroup} not found.`);
    }
    console.log(chalk.green('Beginning deploy process for beanstalk group ') + chalk.blue(Config.ebGroup));
    await createAppVersionsForGroup(beanstalksToDeploy);
    await deployAppVersionsToGroup(beanstalksToDeploy);
  } catch (e) {
    const colorizedErrMsg =
      chalk.red('Deploy to beanstalk group ') + chalk.blue(Config.ebGroup) + chalk.red(` failed: ${e}`);
    console.error(colorizedErrMsg);
    process.exit(1);
  }
}

// Main execution is here
void (async () => {
  console.log(`Parsed configuration: \n${chalk.blue(JSON.stringify(Config, undefined, 2))}\n`);
  try {
    const beanstalksToDeploy = beanstalkGroups[Config.ebGroup];
    if (!beanstalksToDeploy) {
      throw new Error(`Beanstalk group ${Config.ebGroup} not found.`);
    }
    console.log(chalk.green('Beginning deploy process for beanstalk group ') + chalk.blue(Config.ebGroup));
    await createAppVersionsForGroup(beanstalksToDeploy);
    await deployAppVersionsToGroup(beanstalksToDeploy);
  } catch (e) {
    const colorizedErrMsg =
      chalk.red('Deploy to beanstalk group ') + chalk.blue(Config.ebGroup) + chalk.red(` failed: ${e}`);
    console.error(colorizedErrMsg);
    process.exit(1);
  }
})();
