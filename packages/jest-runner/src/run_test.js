/**
 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {EnvironmentClass} from 'types/Environment';
import type {GlobalConfig, Path, ProjectConfig} from 'types/Config';
import type {Resolver} from 'types/Resolve';
import type {TestFramework} from 'types/TestRunner';
import type {TestResult} from 'types/TestResult';
import type RuntimeClass from 'jest-runtime';

import fs from 'fs';
import {
  BufferedConsole,
  Console,
  NullConsole,
  getConsoleOutput,
  setGlobal,
} from 'jest-util';
import jasmine2 from 'jest-jasmine2';
import {getTestEnvironment} from 'jest-config';
import * as docblock from 'jest-docblock';

// The default jest-runner is required because it is the default test runner
// and required implicitly through the `testRunner` ProjectConfig option.
jasmine2;

export default (async function runTest(
  path: Path,
  globalConfig: GlobalConfig,
  config: ProjectConfig,
  resolver: Resolver,
) {
  let testSource;

  try {
    testSource = fs.readFileSync(path, 'utf8');
  } catch (e) {
    return Promise.reject(e);
  }

  const parsedDocblock = docblock.parse(docblock.extract(testSource));
  const customEnvironment = parsedDocblock['jest-environment'];
  let testEnvironment = config.testEnvironment;

  if (customEnvironment) {
    testEnvironment = getTestEnvironment(
      Object.assign({}, config, {
        testEnvironment: customEnvironment,
      }),
    );
  }

  /* $FlowFixMe */
  const TestEnvironment = (require(testEnvironment): EnvironmentClass);
  /* $FlowFixMe */
  const testFramework = (require(config.testRunner): TestFramework);
  /* $FlowFixMe */
  const Runtime = (require(config.moduleLoader || 'jest-runtime'): Class<
    RuntimeClass,
  >);

  const environment = new TestEnvironment(config);
  const consoleOut = globalConfig.useStderr ? process.stderr : process.stdout;
  const consoleFormatter = (type, message) =>
    getConsoleOutput(
      config.cwd,
      !!globalConfig.verbose,
      // 4 = the console call is buried 4 stack frames deep
      BufferedConsole.write([], type, message, 4),
    );

  let testConsole;
  if (globalConfig.silent) {
    testConsole = new NullConsole(consoleOut, process.stderr, consoleFormatter);
  } else {
    if (globalConfig.verbose) {
      testConsole = new Console(consoleOut, process.stderr, consoleFormatter);
    } else {
      testConsole = new BufferedConsole();
    }
  }

  const cacheFS = {[path]: testSource};
  setGlobal(environment.global, 'console', testConsole);
  const runtime = new Runtime(config, environment, resolver, cacheFS, {
    collectCoverage: globalConfig.collectCoverage,
    collectCoverageFrom: globalConfig.collectCoverageFrom,
    collectCoverageOnlyFrom: globalConfig.collectCoverageOnlyFrom,
    mapCoverage: globalConfig.mapCoverage,
    mapCoverageOnlyFrom: globalConfig.mapCoverageOnlyFrom,
  });
  const start = Date.now();
  await environment.setup();
  try {
    const result: TestResult = await testFramework(
      globalConfig,
      config,
      environment,
      runtime,
      path,
    );
    const testCount =
      result.numPassingTests + result.numFailingTests + result.numPendingTests;
    result.perfStats = {end: Date.now(), start};
    result.testFilePath = path;
    result.coverage = runtime.getAllCoverageInfo();
    result.sourceMaps = runtime.getSourceMapInfo();
    result.console = testConsole.getBuffer();
    result.skipped = testCount === result.numPendingTests;
    result.displayName = config.displayName;
    if (globalConfig.logHeapUsage) {
      if (global.gc) {
        global.gc();
      }
      result.memoryUsage = process.memoryUsage().heapUsed;
    }
    // Delay the resolution to allow log messages to be output.
    return new Promise(resolve => setImmediate(() => resolve(result)));
  } finally {
    await environment.teardown();
  }
});
