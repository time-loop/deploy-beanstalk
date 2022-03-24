/* eslint-disable no-console */

/**
 * This file enumerates all the groupings of beanstalks which can be deployed
 * to via the deploy-beanstalk.ts script. These beanstalks are exposed via
 * the beanstalkGroups object.
 */

import { S3Location } from '@aws-sdk/client-elastic-beanstalk';
import Config from './config';
import { DeployProps } from './Interfaces';

/* START default constants */
const DEFAULT_VERSION_LABEL = `travis-ebv2-${Config.ebAppVersionGitsha}`;
const DEFAULT_DEPLOY_CONFIG = {
  ebVersionLabel: DEFAULT_VERSION_LABEL,
  ebVersionDescription: Config.ebAppVersionDescription,
};

const DEFAULT_DEPLOY_CONFIG_FRANKFURT = {
  ...DEFAULT_DEPLOY_CONFIG,
  artifact: getS3Location('eu-central-1'),
  ebRegion: 'eu-central-1',
};

const DEFAULT_DEPLOY_CONFIG_OREGON = {
  ...DEFAULT_DEPLOY_CONFIG,
  artifact: getS3Location('us-west-2'),
  ebRegion: 'us-west-2',
};
/* END default constants */

// TODO: Test group of beanstalks for demonstration. Example only.
const test: DeployProps[] = [
  {
    ...DEFAULT_DEPLOY_CONFIG_FRANKFURT,
    ebApp: 'clickup-staging',
    ebEnv: 'clickup-staging-jglo-test',
  },
  {
    ...DEFAULT_DEPLOY_CONFIG_OREGON,
    ebApp: 'clickup',
    ebEnv: 'clickup-prod-testing',
  },
];

// List of all the beanstalks to deploy
export const beanstalkGroups: Record<string, DeployProps[]> = {
  test,
  // TODO:
  // prodOr,
  // prodIn,
  // stagingOr,
  // stagingEu,
  // ...
};

/**
 * Helper to dictate where the build artifact to deploy lives
 *
 * @param awsRegion ex: us-west-2, us-east-1
 * @param label Beanstalk Application Version to deploy
 * @returns The artifact object for use by deploy script
 */
function getS3Location(awsRegion: string, label: string = DEFAULT_VERSION_LABEL): S3Location {
  return {
    S3Bucket: `elasticbeanstalk-${awsRegion}-514308641592`,
    S3Key: `clickup/${label}.zip`,
  };
}
