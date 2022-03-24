import { S3Location } from '@aws-sdk/client-elastic-beanstalk';

/**
 * Properties consumed to deploy an Application Version to an existing
 * Beanstalk Environment.
 */
export interface IBeanstalkEnvironment {
  /**
   * Name of Beanstalk Application where the App Version will be housed.
   */
  readonly app: string;
  /**
   * Beanstalk environment to deploy to.
   */
  readonly name: string;
}

/**
 * The set of Beanstalk Environments to deploy to. Must live in the same
 * account and region, but can belong to any Application.
 */
export interface IBeanstalkGroup {
  /**
   * The details used to create an Application Version per unique Beanstalk
   * Application in environments.
   */
  readonly versionProps: IAppVersionProps;
  /**
   * List of Beanstalk Environments to deploy to.
   */
  readonly environments: IBeanstalkEnvironment[];
  /**
   * The name of the group. Solely used for human readable output.
   */
  readonly name: string;
  /**
   * The AWS region in which the environments live.
   */
  readonly region: string;
}

/**
 * Properties required to create an Application Version.
 */
export interface IAppVersionProps {
  readonly artifact: S3Location;
  readonly label: string;
  readonly description: string;
  /**
   * If a Beanstalk Application Version with the same label already
   * exists, do we error or continue?
   */
  readonly errorIfExists: boolean;
}
