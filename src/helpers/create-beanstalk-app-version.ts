/* eslint-disable no-console */
import {
  CreateApplicationVersionCommand,
  DescribeApplicationVersionsCommand,
  ElasticBeanstalkClient,
} from '@aws-sdk/client-elastic-beanstalk';
import { CreateAppVersionProps } from './Interfaces';

const AWS_CLIENT_REQUEST_MAX_ATTEMPTS = 3;

async function checkApplicationVersionExists(
  client: ElasticBeanstalkClient,
  props: CreateAppVersionProps,
): Promise<boolean> {
  const getExistingVersionsCmd = new DescribeApplicationVersionsCommand({
    ApplicationName: props.ebApp,
    VersionLabels: [props.ebVersionLabel],
  });
  const getExistingVersionsResp = await client.send(getExistingVersionsCmd);
  return getExistingVersionsResp.ApplicationVersions ? getExistingVersionsResp.ApplicationVersions.length > 0 : false;
}

async function createApplicationVersion(
  client: ElasticBeanstalkClient,
  props: CreateAppVersionProps,
  dryRun?: boolean,
): Promise<void> {
  const createVersionCmd = new CreateApplicationVersionCommand({
    ApplicationName: props.ebApp,
    AutoCreateApplication: false,
    Description: props.ebVersionDescription,
    SourceBundle: props.artifact,
    VersionLabel: props.ebVersionLabel,
  });
  if (dryRun) {
    console.log(`DRY RUN: Would have created application version ${props.ebVersionLabel} for app ${props.ebApp}`);
    return;
  }

  console.log(`Creating version ${props.ebVersionLabel} for beanstalk application ${props.ebApp}`);
  const resp = await client.send(createVersionCmd);

  // Verify OK response
  const statusCode = resp.$metadata.httpStatusCode;
  if (statusCode && statusCode >= 200 && statusCode < 300) {
    console.log(`New application version labeled '${props.ebVersionLabel}' created for app ${props.ebApp}.`);
  } else {
    throw new Error(`Create application version failed for app ${props.ebApp}. Response metadata: ${resp.$metadata}`);
  }
}

/**
 * Main entrypoint of the deploy process. Creates a Beanstalk application
 * version if needed, and then issues a deployment if the environment is ready
 * for one. Verifies the deployment completes successfully.
 *
 * @param props Set of properties required to deploy to a Beanstalk environment.
 */
export async function create(props: CreateAppVersionProps, dryRun = false): Promise<void> {
  try {
    // Init the AWS client
    const client = new ElasticBeanstalkClient({
      maxAttempts: AWS_CLIENT_REQUEST_MAX_ATTEMPTS,
      region: props.ebRegion,
    });

    // Create application version if needed
    if (await checkApplicationVersionExists(client, props)) {
      if (props.errorIfExists ?? false) {
        throw new Error(`Failed to create new application version ${props.ebVersionLabel}, it already exists.`);
      }
      console.log(
        `Not creating new application version ${props.ebVersionLabel} for app ${props.ebApp} since it already exists.`,
      );
    } else {
      await createApplicationVersion(client, props, dryRun);
    }
  } catch (e) {
    throw new Error(`Beanstalk app version ${props.ebVersionLabel} failed creation. ${e}`);
  }
}
