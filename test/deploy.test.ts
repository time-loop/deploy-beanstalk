import {
  CreateApplicationVersionCommand,
  DescribeApplicationVersionsCommand,
  DescribeEnvironmentsCommand,
  ElasticBeanstalkClient,
  UpdateEnvironmentCommand,
} from '@aws-sdk/client-elastic-beanstalk';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DBAsyncError,
  DBCreateApplicationVersionError,
  DBHealthinessCheckError,
  deployToGroup,
  IBeanstalkGroup,
  IDeployToGroupProps,
} from '../src/index';

const ebMock = mockClient(ElasticBeanstalkClient);

const FORCE_DEPLOYMENT = true;
let TEST_BEANSTALK_GROUP: IBeanstalkGroup;

// Must reset client prior to each test
// https://aws.amazon.com/blogs/developer/mocking-modular-aws-sdk-for-javascript-v3-in-unit-tests/
beforeEach(() => ebMock.reset());

describe('Deployment to beanstalks in different apps', () => {
  // Define a single beanstalk group with two different environment and applications.
  TEST_BEANSTALK_GROUP = {
    environments: [
      {
        app: 'ClickupTestAppOne',
        name: 'TestEnvironmentOne',
      },
      {
        app: 'ClickupTestAppTwo',
        name: 'TestEnvironmentTwo',
      },
    ],
    versionProps: {
      artifact: {
        S3Bucket: 'test-bucket-clickup',
        S3Key: 'testDir/clickupTestArtifact.zip',
      },
      label: 'TestLabel',
      description: 'Test desc',
      errorIfExists: true,
    },
    name: 'TestBeanstalkGroup',
    region: 'us-west-2',
  };

  const commonDeployProps: IDeployToGroupProps = {
    group: TEST_BEANSTALK_GROUP,
    force: FORCE_DEPLOYMENT,
    logLevel: 'INFO', // TODO: Before committing, make this SILENT
    preDeployHealthCheckProps: {
      attempts: 1,
      timeBetweenAttemptsMs: 500,
    },
    postDeployHealthCheckProps: {
      attempts: 1,
      timeBetweenAttemptsMs: 500,
    },
  };

  // Defines mock functions for AWS EB Client, mocking successful deployment
  beforeEach(() => {
    ebMock.on(CreateApplicationVersionCommand).resolves({
      $metadata: {
        httpStatusCode: 200,
      },
    });
    ebMock.on(UpdateEnvironmentCommand).resolves({
      $metadata: {
        httpStatusCode: 200,
      },
    });
    ebMock.on(DescribeApplicationVersionsCommand).resolves({
      ApplicationVersions: [],
    });
    TEST_BEANSTALK_GROUP.environments.forEach((env) => {
      ebMock
        .on(DescribeEnvironmentsCommand, {
          ApplicationName: env.app,
          EnvironmentNames: [env.name],
        })
        .resolvesOnce({
          Environments: [
            {
              EnvironmentName: env.name,
              HealthStatus: 'Ok',
              Status: 'Ready',
              VersionLabel: 'OLD_VERSION',
            },
          ],
        })
        .resolves({
          Environments: [
            {
              EnvironmentName: env.name,
              HealthStatus: 'Ok',
              Status: 'Ready',
              VersionLabel: TEST_BEANSTALK_GROUP.versionProps.label,
            },
          ],
        });
    });
  });

  test('succeeds when AWS client does', async () => {
    expect(await deployToGroup(commonDeployProps)).not.toThrowError;
  });

  test('throws error when version already exists', async () => {
    ebMock.on(DescribeApplicationVersionsCommand).resolves({
      ApplicationVersions: [{}],
    });

    expect.assertions(3);
    const expectedErrCount = 2;
    try {
      await deployToGroup(commonDeployProps);
    } catch (e) {
      expect(e).toBeInstanceOf(DBAsyncError);
      const errs = (e as DBAsyncError).errors;
      expect(errs).toHaveLength(expectedErrCount);
      expect(errs.filter((err) => err instanceof DBCreateApplicationVersionError)).toHaveLength(expectedErrCount);
    }
  });

  test('throws one error when one environment fails deployment', async () => {
    ebMock
      .on(DescribeEnvironmentsCommand, {
        ApplicationName: TEST_BEANSTALK_GROUP.environments[1].app,
        EnvironmentNames: [TEST_BEANSTALK_GROUP.environments[1].name],
      })
      .resolves({
        Environments: [
          {
            EnvironmentName: TEST_BEANSTALK_GROUP.environments[1].name,
            HealthStatus: 'Ok',
            Status: 'Ready',
            VersionLabel: 'DID_NOT_RECEIEVE_NEW_VERSION',
          },
        ],
      });

    expect.assertions(1);
    try {
      await deployToGroup(commonDeployProps);
    } catch (e) {
      expect(e).toBeInstanceOf(DBHealthinessCheckError);
    }
  });
});
