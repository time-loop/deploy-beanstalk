export class DBAsyncError extends Error {
  private readonly _errors: Error[];

  constructor(msg: string, errors: Error[]) {
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, DBAsyncError.prototype);
    this._errors = errors;
  }

  public get errors(): Error[] {
    return this._errors;
  }
}

export class DBCreateApplicationVersionError extends Error {
  constructor(appName: string, versionLabel: string, error: Error) {
    const msg = `Beanstalk app version ${versionLabel} failed creation for app ${appName}. ${error}`;
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, DBCreateApplicationVersionError.prototype);
  }
}

export class DBDeployApplicationVersionError extends Error {
  constructor(envName: string, versionLabel: string, error: Error) {
    const msg = `Deployment of app version ${versionLabel} failed on environment ${envName}. ${error}`;
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, DBDeployApplicationVersionError.prototype);
  }
}

export class DBHealthinessCheckError extends Error {
  constructor(msg: string) {
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, DBHealthinessCheckError.prototype);
  }
}
