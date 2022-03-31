/* eslint-disable no-console */
import {
  CreateApplicationVersionCommand,
  DescribeApplicationVersionsCommand,
  ElasticBeanstalkClient,
} from '@aws-sdk/client-elastic-beanstalk';
import log from 'loglevel';
import { DBCreateApplicationVersionError } from './Errors';
import { IAppVersionProps } from './Interfaces';

interface ICreateProps {
  appName: string;
  client: ElasticBeanstalkClient;
  dryRun?: boolean;
  version: IAppVersionProps;
}

async function checkApplicationVersionExists(props: ICreateProps): Promise<boolean> {
  const getExistingVersionsCmd = new DescribeApplicationVersionsCommand({
    ApplicationName: props.appName,
    VersionLabels: [props.version.label],
  });
  const getExistingVersionsResp = await props.client.send(getExistingVersionsCmd);
  return getExistingVersionsResp.ApplicationVersions ? getExistingVersionsResp.ApplicationVersions.length > 0 : false;
}

async function createApplicationVersion(props: ICreateProps): Promise<void> {
  if (props.dryRun) {
    log.info(`DRY RUN: Would have created application version ${props.version.label} for app ${props.appName}`);
    return;
  }

  const createVersionCmd = new CreateApplicationVersionCommand({
    ApplicationName: props.appName,
    AutoCreateApplication: false,
    Description: props.version.description,
    SourceBundle: props.version.artifact,
    VersionLabel: props.version.label,
  });

  log.info(`Creating version ${props.version.label} for beanstalk application ${props.appName}`);
  const resp = await props.client.send(createVersionCmd);

  // Verify OK response
  const statusCode = resp.$metadata.httpStatusCode;
  if (statusCode && statusCode >= 200 && statusCode < 300) {
    log.info(`New application version labeled '${props.version.label}' created for app ${props.appName}.`);
  } else {
    throw new Error(`Create application version failed for app ${props.appName}. Response metadata: ${resp.$metadata}`);
  }
}

/**
 * Main entrypoint of the deploy process. Creates a Beanstalk application
 * version if needed, and then issues a deployment if the environment is ready
 * for one. Verifies the deployment completes successfully.
 */
export async function create(props: ICreateProps): Promise<void> {
  try {
    // Create application version if needed
    if (await checkApplicationVersionExists(props)) {
      if (props.version.errorIfExists ?? false) {
        throw new Error(`Failed to create new application version ${props.version.label}, it already exists.`);
      }
      log.info(
        `Not creating new application version ${props.version.label} for app ${props.appName} since it already exists.`,
      );
    } else {
      await createApplicationVersion(props);
    }
  } catch (e) {
    throw new DBCreateApplicationVersionError(props.appName, props.version.label, e as Error);
  }
}
