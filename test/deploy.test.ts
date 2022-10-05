import {
  CreateApplicationVersionCommand,
  DescribeApplicationVersionsCommand,
  DescribeEnvironmentsCommand,
  ElasticBeanstalkClient,
  UpdateEnvironmentCommand,
} from '@aws-sdk/client-elastic-beanstalk';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DBError,
  DBCreateApplicationVersionError,
  DBHealthinessCheckError,
  deployToGroup,
  IBeanstalkGroup,
  IDeployToGroupProps,
  DBTriggerDeployError,
  DBGroupDeployTriggerError,
  LogLevel,
} from '../src/index';

const ebMock = mockClient(ElasticBeanstalkClient);

const COMMON_DEPLOY_PROPS = {
  force: true,
  logLevel: 'silent' as LogLevel,
  preDeployHealthCheckProps: {
    attempts: 1,
    timeBetweenAttemptsMs: 0,
  },
  postDeployHealthCheckProps: {
    attempts: 3,
    timeBetweenAttemptsMs: 0,
  },
};

// Must reset client prior to each test
// https://aws.amazon.com/blogs/developer/mocking-modular-aws-sdk-for-javascript-v3-in-unit-tests/
beforeEach(() => ebMock.reset());

describe('Deployment to beanstalks in different apps', () => {
  // Define a single beanstalk group with two different environment and applications.
  const TEST_BEANSTALK_GROUP: IBeanstalkGroup = {
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

  const deployProps: IDeployToGroupProps = {
    ...COMMON_DEPLOY_PROPS,
    group: TEST_BEANSTALK_GROUP,
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

  test('with dry run only runs checks', async () => {
    expect(await deployToGroup({ ...deployProps, force: false })).not.toThrowError;
    const noCalls = 0;
    const expectedDescribeAppVersionCalls = 2; // One per unique Application Version
    const expectedDescibeEnvironmentsCommandCalls = 4; // Pre and post health check per unique Application
    expect(ebMock.commandCalls(CreateApplicationVersionCommand)).toHaveLength(noCalls);
    expect(ebMock.commandCalls(DescribeApplicationVersionsCommand)).toHaveLength(expectedDescribeAppVersionCalls);
    expect(ebMock.commandCalls(DescribeEnvironmentsCommand)).toHaveLength(expectedDescibeEnvironmentsCommandCalls);
    expect(ebMock.commandCalls(UpdateEnvironmentCommand)).toHaveLength(noCalls);
  });

  test('succeeds when AWS client does', async () => {
    expect(await deployToGroup(deployProps)).not.toThrowError;
  });

  test('throws errors when versions already exists', async () => {
    ebMock.on(DescribeApplicationVersionsCommand).resolves({
      ApplicationVersions: [{}],
    });

    expect.assertions(3);
    const expectedErrCount = 2;
    try {
      await deployToGroup(deployProps);
    } catch (e) {
      expect(e).toBeInstanceOf(DBError);
      const errs = (e as DBError).errors;
      expect(errs).toHaveLength(expectedErrCount);
      expect(errs.filter((err) => err instanceof DBCreateApplicationVersionError)).toHaveLength(expectedErrCount);
    }
  });

  test('throws errors when one deployment fails to trigger', async () => {
    ebMock
      .on(UpdateEnvironmentCommand, {
        ApplicationName: TEST_BEANSTALK_GROUP.environments[0].app,
        EnvironmentName: TEST_BEANSTALK_GROUP.environments[0].name,
        VersionLabel: TEST_BEANSTALK_GROUP.versionProps.label,
      })
      .resolves({
        $metadata: {
          httpStatusCode: 400,
        },
      });

    ebMock
      .on(DescribeEnvironmentsCommand, {
        ApplicationName: TEST_BEANSTALK_GROUP.environments[0].app,
        EnvironmentNames: [TEST_BEANSTALK_GROUP.environments[0].name],
      })
      .resolves({
        Environments: [
          {
            EnvironmentName: TEST_BEANSTALK_GROUP.environments[0].name,
            HealthStatus: 'Ok',
            Status: 'Ready',
            VersionLabel: 'OLD_VERSION',
          },
        ],
      });

    expect.hasAssertions();
    const expectedErrCount = 2;
    try {
      await deployToGroup(deployProps);
    } catch (e) {
      expect(e).toBeInstanceOf(DBError);
      const errs = (e as DBError).errors;
      expect(errs).toHaveLength(expectedErrCount);
      const triggerFailureErrs = errs.filter(
        (err) => err instanceof DBGroupDeployTriggerError,
      ) as DBGroupDeployTriggerError[];
      expect(triggerFailureErrs).toHaveLength(1);
      expect(triggerFailureErrs[0].errors.filter((err) => err instanceof DBTriggerDeployError)).toHaveLength(1);
      const healthCheckErrs = errs.filter((err) => err instanceof DBHealthinessCheckError);
      expect(healthCheckErrs).toHaveLength(1);
      // If multiple envs failed, this length would be higher
      expect((healthCheckErrs[0] as DBError).errors).toHaveLength(1);
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
            VersionLabel: 'OLD_VERSION',
          },
        ],
      });

    expect.hasAssertions();
    const expectedErrs = 1;
    try {
      await deployToGroup(deployProps);
    } catch (e) {
      expect(e).toBeInstanceOf(DBError);
      const healthinessErrs = (e as DBError).errors.filter(
        (err) => err instanceof DBHealthinessCheckError,
      ) as DBHealthinessCheckError[];
      expect(healthinessErrs).toHaveLength(expectedErrs);
      expect(healthinessErrs[0].errors).toHaveLength(expectedErrs);
    }
  });

  test('succeeds to become healthy after one retry attempt', async () => {
    ebMock
      .on(DescribeEnvironmentsCommand, {
        ApplicationName: TEST_BEANSTALK_GROUP.environments[1].app,
        EnvironmentNames: [TEST_BEANSTALK_GROUP.environments[1].name],
      })
      // Initial health check prior to deployment succeeds
      .resolvesOnce({
        Environments: [
          {
            EnvironmentName: TEST_BEANSTALK_GROUP.environments[1].name,
            HealthStatus: 'Ok',
            Status: 'Ready',
            VersionLabel: 'OLD_VERSION',
          },
        ],
      })
      // Initial health check after deployment fails
      .resolvesOnce({
        Environments: [
          {
            EnvironmentName: TEST_BEANSTALK_GROUP.environments[1].name,
            HealthStatus: 'Degraded',
            Status: 'Updating',
            VersionLabel: 'OLD_VERSION',
          },
        ],
      })
      // Second health check after deployment succeeds
      .resolves({
        Environments: [
          {
            EnvironmentName: TEST_BEANSTALK_GROUP.environments[1].name,
            HealthStatus: 'Ok',
            Status: 'Ready',
            VersionLabel: TEST_BEANSTALK_GROUP.versionProps.label,
          },
        ],
      });

    expect(await deployToGroup(deployProps)).not.toThrowError;
    // 2 pre-deploy checks (one per Application), 4 post-deploy checks (one retry)
    const expectedCalls = 6;
    expect(ebMock.commandCalls(DescribeEnvironmentsCommand)).toHaveLength(expectedCalls);
  });

  test('with custom unhealthyStatuses succeeds to become healthy after one retry attempt', async () => {
    ebMock
      .on(DescribeEnvironmentsCommand, {
        ApplicationName: TEST_BEANSTALK_GROUP.environments[1].app,
        EnvironmentNames: [TEST_BEANSTALK_GROUP.environments[1].name],
      })
      // Initial health check prior to deployment succeeds
      .resolvesOnce({
        Environments: [
          {
            EnvironmentName: TEST_BEANSTALK_GROUP.environments[1].name,
            HealthStatus: 'Ok',
            Status: 'Ready',
            VersionLabel: 'OLD_VERSION',
          },
        ],
      })
      // Initial health check after deployment fails
      .resolvesOnce({
        Environments: [
          {
            EnvironmentName: TEST_BEANSTALK_GROUP.environments[1].name,
            HealthStatus: 'Degraded',
            Status: 'Updating',
            VersionLabel: 'OLD_VERSION',
          },
        ],
      })
      // Second health check after deployment succeeds
      .resolves({
        Environments: [
          {
            EnvironmentName: TEST_BEANSTALK_GROUP.environments[1].name,
            HealthStatus: 'Warning',
            Status: 'Ready',
            VersionLabel: TEST_BEANSTALK_GROUP.versionProps.label,
          },
        ],
      });

    expect(
      await deployToGroup({
        ...deployProps,
        postDeployHealthCheckProps: {
          attempts: 3,
          timeBetweenAttemptsMs: 0,
          unhealthyStatuses: ['Severe'],
        },
      }),
    ).not.toThrowError;
    // 2 pre-deploy checks (one per Application), 4 post-deploy checks (one retry)
    const expectedCalls = 6;
    expect(ebMock.commandCalls(DescribeEnvironmentsCommand)).toHaveLength(expectedCalls);
  });
});

describe('Deployment with a non-existent Beanstalk', () => {
  // Define a group where a single Environment does not exist
  const TEST_BEANSTALK_GROUP: IBeanstalkGroup = {
    environments: ['AnotherTestEnvironment', 'NonExistentEnvironment'].map((env) => {
      return {
        app: 'AnotherClickUpTestApp',
        name: env,
      };
    }),
    versionProps: {
      artifact: {
        S3Bucket: 'test-bucket-clickup',
        S3Key: 'testDir/clickupTestArtifact.zip',
      },
      label: 'TestLabel',
      description: 'Test desc',
      errorIfExists: true,
    },
    name: 'AnotherTestBeanstalkGroup',
    region: 'us-west-2',
  };

  const deployProps: IDeployToGroupProps = {
    ...COMMON_DEPLOY_PROPS,
    group: TEST_BEANSTALK_GROUP,
  };

  // Defines mock functions for AWS EB Client
  beforeEach(() => {
    ebMock.on(CreateApplicationVersionCommand).resolves({
      $metadata: {
        httpStatusCode: 200,
      },
    });
    ebMock.on(DescribeApplicationVersionsCommand).resolves({
      ApplicationVersions: [],
    });
    ebMock
      .on(DescribeEnvironmentsCommand, {
        ApplicationName: TEST_BEANSTALK_GROUP.environments[0].app,
        EnvironmentNames: TEST_BEANSTALK_GROUP.environments.map((env) => env.name),
      })
      .resolves({
        // Only returns Environment that exists
        Environments: [
          {
            EnvironmentName: TEST_BEANSTALK_GROUP.environments[0].name,
            HealthStatus: 'Ok',
            Status: 'Ready',
            VersionLabel: 'OLD_VERSION',
          },
        ],
      });
  });

  test('with dry-run still throws an error', async () => {
    try {
      await deployToGroup({ ...deployProps, force: false });
    } catch (e) {
      expect(e).toBeInstanceOf(DBHealthinessCheckError);
      expect((e as DBHealthinessCheckError).errors).toHaveLength(1);
    }
  });

  test('throws an error', async () => {
    try {
      await deployToGroup(deployProps);
    } catch (e) {
      expect(e).toBeInstanceOf(DBHealthinessCheckError);
      expect((e as DBHealthinessCheckError).errors).toHaveLength(1);
    }
  });
});
