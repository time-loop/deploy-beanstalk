import {
  CreateApplicationVersionCommand,
  DescribeApplicationVersionsCommand,
  DescribeEnvironmentHealthCommand,
  ElasticBeanstalkClient,
  UpdateEnvironmentCommand,
} from '@aws-sdk/client-elastic-beanstalk';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DBAsyncError,
  DBCreateApplicationVersionError,
  DBDeployApplicationVersionError,
  deployToGroup,
  IBeanstalkGroup,
} from '../src/index';

const ebMock = mockClient(ElasticBeanstalkClient);

const FORCE_DEPLOYMENT = true;
let TEST_BEANSTALK_GROUP: IBeanstalkGroup;

// Silence all log output for tests
global.console = {
  ...global.console,
  log: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
};

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

  // Defines mock functions for AWS EB Client
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
    ebMock.on(DescribeEnvironmentHealthCommand).resolves({
      HealthStatus: 'Ok',
      Status: 'Ready',
    });
  });

  test('succeeds when AWS client does', async () => {
    expect(await deployToGroup(TEST_BEANSTALK_GROUP, FORCE_DEPLOYMENT)).not.toThrowError;
  });

  test('throws error when version already exists', async () => {
    ebMock.on(DescribeApplicationVersionsCommand).resolves({
      ApplicationVersions: [{}],
    });

    expect.assertions(3);
    const expectedErrCount = 2;
    try {
      await deployToGroup(TEST_BEANSTALK_GROUP, FORCE_DEPLOYMENT);
    } catch (e) {
      expect(e).toBeInstanceOf(DBAsyncError);
      const errs = (e as DBAsyncError).errors;
      expect(errs).toHaveLength(expectedErrCount);
      expect(errs.filter((err) => err instanceof DBCreateApplicationVersionError)).toHaveLength(expectedErrCount);
    }
  });

  test('throws one error when one environment fails deployment', async () => {
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

    expect.assertions(3);
    const expectedErrCount = 1;
    try {
      await deployToGroup(TEST_BEANSTALK_GROUP, FORCE_DEPLOYMENT);
    } catch (e) {
      expect(e).toBeInstanceOf(DBAsyncError);
      const errs = (e as DBAsyncError).errors;
      expect(errs).toHaveLength(expectedErrCount);
      expect(errs.filter((err) => err instanceof DBDeployApplicationVersionError)).toHaveLength(expectedErrCount);
    }
  });
});
