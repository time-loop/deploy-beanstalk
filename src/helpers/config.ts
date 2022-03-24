/* eslint-disable @typescript-eslint/no-empty-interface */
/* eslint-disable no-console */
import chalk from 'chalk';
import parser from 'yargs-parser';

/**
 * Defines all the required process arguments for the deploy process. Class is
 * used so we can keep the list of required arguments DRY across the file.
 */
class RequiredArgs {
  /**
   * Refers to the list of beanstalk environments to deploy to as defined in
   * tools/ci/deploy/helpers/beanstalk-groups.ts.
   *
   * Ex: stagingUs
   */
  readonly ebGroup: string = '';

  /**
   * Refers to the gitsha of the commit used for the build/deploy.
   */
  readonly ebAppVersionGitsha: string = '';

  /**
   * The commit message to use as description for the Application Version.
   */
  readonly ebAppVersionDescription: string = '';
}

/**
 * Defines all the optional process arguments for the deploy process. Class is
 * used so we can keep the list of optional arguments DRY across the file.
 */
class OptionalArgs {
  /**
   * If false, performs a no-op dry run where only lookups are executed.
   * @default false
   */
  readonly force?: boolean = false;
}

/**
 * Exposed interface for the required process arguments
 */
interface IRequiredArgs extends RequiredArgs {}

/**
 * Exposed interface for the optional process arguments
 */
interface IOptionalArgs extends OptionalArgs {}

/**
 * Exposed interface for all used process arguments
 */
interface IConfig extends IRequiredArgs, IOptionalArgs {}

/**
 * Parses and validates that any required process arguments are set.
 *
 * @param argv - K/V pair object containing passed process arguments.
 * @returns The set of required process arguments and their values.
 */
function getRequiredArgs(argv: parser.Arguments): IRequiredArgs {
  // Array of required process arguments (to stay DRY)
  const requiredArgNames = Object.keys(new RequiredArgs()) as Array<keyof IRequiredArgs>;

  // Parse and set values for required process arguments
  const parsedRequiredArgs = {};
  let missingCount = 0;
  requiredArgNames.forEach((key) => {
    if (!(key in argv)) {
      console.error(chalk.red('Flag ') + chalk.white(`--${key}`) + chalk.red(' is required.'));
      missingCount++;
    } else {
      Object.defineProperty(parsedRequiredArgs, key, {
        value: argv[key],
        enumerable: true,
      });
    }
  });
  if (missingCount > 0) process.exit(missingCount);

  return parsedRequiredArgs as IRequiredArgs;
}

/**
 * Parses the list of optional arguments for any passed values.
 *
 * @param argv - K/V pair object containing passed process arguments.
 * @returns The set of optional process arguments and their values.
 */
function getOptionalArgs(argv: parser.Arguments): IOptionalArgs {
  // Array of optional process arguments (to stay DRY)
  const optionalArgs = new OptionalArgs();
  const optionalArgsDefault = Object.entries(optionalArgs);

  // Parse and set values for optional process arguments
  optionalArgsDefault.forEach(([key, value]) => {
    const passedVal = argv[key];
    let typedVal: typeof value;
    if (passedVal) {
      // Convert to proper type in-case string is passed (supports number, boolean)
      // TODO: Figure out better way to do this while maintaining DRYness
      try {
        typedVal = JSON.parse(passedVal);
      } catch (e) {
        typedVal = passedVal;
      }
      Object.defineProperty(optionalArgs, key, {
        value: typedVal,
        enumerable: true,
      });
    }
  });

  return optionalArgs;
}

/**
 * Creates an exposed IConfig object for usage throughout deployment.
 *
 * @param required - K/V pair object containing required process args with values.
 * @param optional - K/V pair object containing optional process args with values.
 * @returns The final set of parsed process arguments and their values.
 */
function getConfig(required: IRequiredArgs, optional: IOptionalArgs): IConfig {
  return {
    ...required,
    ...optional,
  };
}

// Obtain all relevant command-line arguments
const NUM_USELESS_ARGS = 2;
const argv = parser(process.argv.slice(NUM_USELESS_ARGS));

// Obtain the parsed configuration
const config = getConfig(getRequiredArgs(argv), getOptionalArgs(argv));

/**
 * The parsed process arguments values.
 */
export default config;
