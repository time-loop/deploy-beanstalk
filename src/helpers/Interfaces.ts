import { S3Location, EnvironmentHealthStatus } from '@aws-sdk/client-elastic-beanstalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

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

export interface IHealthCheckProps {
  /**
   * Whole number of times to attempt to check the healthiness of the group.
   * @default 5
   */
  readonly attempts: number;
  /**
   * Number of miliseconds to wait between attempts.
   * @default 60000
   */
  readonly timeBetweenAttemptsMs: number;
  /**
   * Which statuses qualify a beanstalk environment as unhealthy.
   * @default ['Severe', 'Degraded', 'Warning']
   */
  readonly unhealthyStatuses?: EnvironmentHealthStatus[];
}

/**
 * Everything required to deploy to a group of Beanstalk Environments.
 */
export interface IDeployToGroupProps {
  /**
   * The list of Beanstalk Environment to deploy to.
   */
  readonly group: IBeanstalkGroup;
  /**
   * If false, will perform a no-op describing what would occur. Defaults to false.
   */
  readonly force?: boolean;
  /**
   * Every level below the specified log level is silenced. Defaults to INFO.
   */
  readonly logLevel?: LogLevel;
  /**
   * Configuration for health checks prior to the deployment.
   */
  readonly preDeployHealthCheckProps?: IHealthCheckProps;
  /**
   * Configuration for health checks after the deployment.
   */
  readonly postDeployHealthCheckProps?: IHealthCheckProps;
  /**
   * AWS Access Key Id, if not present taken from i.e. ENV variable
   */
  readonly accessKeyId?: string;
  /**
   * AWS Secret Access Key, if not present taken from i.e. ENV variable
   */
  readonly secretAccessKey?: string;
}

export interface Logger {
  debug: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  setLevel: (level: LogLevel) => void;
}
