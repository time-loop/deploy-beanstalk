/* eslint-disable no-console */
import { ElasticBeanstalkClient, UpdateEnvironmentCommand } from '@aws-sdk/client-elastic-beanstalk';
import log from 'loglevel';
import { DBDeployApplicationVersionError } from './Errors';
import { IAppVersionProps, IBeanstalkEnvironment } from './Interfaces';

interface IDeployProps {
  client: ElasticBeanstalkClient;
  force: boolean;
  env: IBeanstalkEnvironment;
  version: IAppVersionProps;
}

/**
 * Issues a deployment of a beanstalk application version to a single
 * beanstalk environment.
 */
async function deployApplicationVersion(props: IDeployProps): Promise<void> {
  if (!props.force) {
    log.info(
      `DRY RUN: Would have deployed app version ${props.version.label} to beanstalk environment ${props.env.name}`,
    );
    return;
  }

  log.info(`Initiating deployment of version ${props.version.label} to environment ${props.env.name}...`);
  const resp = await props.client.send(
    new UpdateEnvironmentCommand({
      ApplicationName: props.env.app,
      EnvironmentName: props.env.name,
      VersionLabel: props.version.label,
    }),
  );

  // Verify deployment initiated successfully
  const statusCode = resp.$metadata.httpStatusCode;
  if (statusCode && statusCode >= 200 && statusCode < 300) {
    log.info(`Deployment of app version '${props.version.label}' triggered for '${props.env.name}'.`);
  } else {
    throw new Error(
      `Triggered deployment of app version '${props.version.label}' failed for '${
        props.env.name
      }'. Response metadata: ${JSON.stringify(resp.$metadata, undefined, 2)}`,
    );
  }
}

/**
 * Main entrypoint of the deploy process. Creates a Beanstalk application
 * version if needed, and then issues a deployment if the environment is ready
 * for one. Verifies the deployment completes successfully.
 */
export async function deploy(props: IDeployProps): Promise<void> {
  try {
    await deployApplicationVersion(props); // Initiate deployment
  } catch (e) {
    throw new DBDeployApplicationVersionError(props.env.name, props.version.label, e as Error);
  }
}
