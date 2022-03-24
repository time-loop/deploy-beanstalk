import {
  DescribeApplicationVersionsCommand,
  //DescribeEnvironmentHealthCommand,
  ElasticBeanstalkClient,
  //UpdateEnvironmentCommand,
} from '@aws-sdk/client-elastic-beanstalk';
import { mockClient } from 'aws-sdk-client-mock';
import { IBeanstalkGroup, deployToGroup } from '../src/index';

const ebMock = mockClient(ElasticBeanstalkClient);

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
    errorIfExists: false,
  },
  name: 'TestBeanstalkGroup',
  region: 'us-west-2',
};

// Silence all log output for tests
global.console = {
  ...global.console,
  log: jest.fn(),
  debug: jest.fn(),
};

// Must reset client prior to each test
// https://aws.amazon.com/blogs/developer/mocking-modular-aws-sdk-for-javascript-v3-in-unit-tests/
beforeEach(() => ebMock.reset());

describe('Deployment', () => {
  // TODO: Make this much more robust. Test that it makes no calls to AWS besides DescribeApplicationVersionsCommand
  test('with dry run does not error', async () => {
    ebMock.on(DescribeApplicationVersionsCommand).resolves({
      ApplicationVersions: [{}],
    });
    await deployToGroup(TEST_BEANSTALK_GROUP);
  });
});
