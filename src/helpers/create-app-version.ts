/* eslint-disable no-console */
import {
  CreateApplicationVersionCommand,
  DescribeApplicationVersionsCommand,
  ElasticBeanstalkClient,
} from '@aws-sdk/client-elastic-beanstalk';
import { DBCreateApplicationVersionError } from './Errors';
import { IAppVersionProps } from './Interfaces';

async function checkApplicationVersionExists(
  client: ElasticBeanstalkClient,
  version: IAppVersionProps,
  appName: string,
): Promise<boolean> {
  const getExistingVersionsCmd = new DescribeApplicationVersionsCommand({
    ApplicationName: appName,
    VersionLabels: [version.label],
  });
  const getExistingVersionsResp = await client.send(getExistingVersionsCmd);
  return getExistingVersionsResp.ApplicationVersions ? getExistingVersionsResp.ApplicationVersions.length > 0 : false;
}

async function createApplicationVersion(
  client: ElasticBeanstalkClient,
  version: IAppVersionProps,
  appName: string,
  dryRun?: boolean,
): Promise<void> {
  const createVersionCmd = new CreateApplicationVersionCommand({
    ApplicationName: appName,
    AutoCreateApplication: false,
    Description: version.description,
    SourceBundle: version.artifact,
    VersionLabel: version.label,
  });
  if (dryRun) {
    console.log(`DRY RUN: Would have created application version ${version.label} for app ${appName}`);
    return;
  }

  console.log(`Creating version ${version.label} for beanstalk application ${appName}`);
  const resp = await client.send(createVersionCmd);

  // Verify OK response
  const statusCode = resp.$metadata.httpStatusCode;
  if (statusCode && statusCode >= 200 && statusCode < 300) {
    console.log(`New application version labeled '${version.label}' created for app ${appName}.`);
  } else {
    throw new Error(`Create application version failed for app ${appName}. Response metadata: ${resp.$metadata}`);
  }
}

/**
 * Main entrypoint of the deploy process. Creates a Beanstalk application
 * version if needed, and then issues a deployment if the environment is ready
 * for one. Verifies the deployment completes successfully.
 *
 * @param version - Set of properties required to create the Application Version.
 * @param appName - The name of the Beanstalk Application where the App Version
 *                  will be deployed.
 */
export async function create(
  client: ElasticBeanstalkClient,
  version: IAppVersionProps,
  appName: string,
  dryRun = false,
): Promise<void> {
  try {
    // Create application version if needed
    if (await checkApplicationVersionExists(client, version, appName)) {
      if (version.errorIfExists ?? false) {
        throw new Error(`Failed to create new application version ${version.label}, it already exists.`);
      }
      console.log(`Not creating new application version ${version.label} for app ${appName} since it already exists.`);
    } else {
      await createApplicationVersion(client, version, appName, dryRun);
    }
  } catch (e) {
    throw new DBCreateApplicationVersionError(appName, version.label, e as Error);
  }
}
