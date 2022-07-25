/**
 * Houses multiple errors. Since we handle a group of multiple beanstalk
 * environments, we want to track errors for each one (and each type)
 * individually.
 */
export class DBError extends Error {
  private readonly _errors: Error[];

  constructor(msg: string, errors: Error[]) {
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, DBError.prototype);
    this._errors = errors;
  }

  public get errors(): Error[] {
    return this._errors;
  }
}

/**
 * Represents a single Application Version creation error, i.e., should be
 * thrown when a single Application Version could not be created.
 */
export class DBCreateApplicationVersionError extends Error {
  constructor(appName: string, versionLabel: string, error: Error) {
    const msg = `Beanstalk app version ${versionLabel} failed creation for app ${appName}. ${error}`;
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, DBCreateApplicationVersionError.prototype);
  }
}

/**
 * Represents a single triggered deployment failure, i.e., should be thrown
 * when one Beanstalk Environment fails to have a deployment triggered.
 */
export class DBTriggerDeployError extends Error {
  constructor(envName: string, versionLabel: string, error: Error) {
    const msg = `Deployment of app version '${versionLabel}' failed on environment '${envName}'. ${error}`;
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, DBTriggerDeployError.prototype);
  }
}

/**
 * Multiple beanstalk environments could fail to have their deploy triggered.
 * Hence the extension of DBError.
 */
export class DBGroupDeployTriggerError extends DBError {
  constructor(msg: string, errors: Error[]) {
    super(msg, errors);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, DBGroupDeployTriggerError.prototype);
  }
}

/**
 * Multiple beanstalk environments could fail to achieve a healthy state.
 * Hence the extension of DBError.
 */
export class DBHealthinessCheckError extends DBError {
  constructor(msg: string, errors: Error[]) {
    super(msg, errors);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, DBHealthinessCheckError.prototype);
  }
}
