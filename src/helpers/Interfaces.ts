import { S3Location } from '@aws-sdk/client-elastic-beanstalk';

/**
 * Properties consumed to create an Application Version from an existing S3
 * artifact.
 */
export interface CreateAppVersionProps {
  /**
   * Location of the existing S3 artifact to deploy to beanstalk environments.
   */
  readonly artifact: S3Location;
  /**
   * Name of Beanstalk Application where the App Version will be housed.
   */
  readonly ebApp: string;
  /**
   * AWS region in which the beanstalk environments lives
   */
  readonly ebRegion: string;
  /**
   * Descriptive text applied to the new Application Version. Should be human
   * readable.
   */
  readonly ebVersionDescription: string;
  /**
   * Identifier for the Application Version.
   */
  readonly ebVersionLabel: string;
  /**
   * If a Beanstalk Application Version with the same ebVersionLabel already
   * exists, do we error or continue?
   *
   * @default false
   */
  readonly errorIfExists?: boolean;
}

/**
 * Properties consumed to deploy an existing Application Version to an existing
 * Beanstalk Environment. Uses properties from its parent to easily reference
 * the App Version by label.
 */
export interface DeployProps extends CreateAppVersionProps {
  /**
   * Beanstalk environment to deploy to.
   */
  readonly ebEnv: string;
}

/**
 * Defines the structure for the composition of elastic beanstalk groups.
 */
export interface IBeanstalkGroups extends Record<string, DeployProps[]> {}
