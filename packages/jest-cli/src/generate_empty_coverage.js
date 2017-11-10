/**
 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {GlobalConfig, ProjectConfig, Path} from 'types/Config';

import {createInstrumenter} from 'istanbul-lib-instrument';
import Runtime from 'jest-runtime';

export type CoverageWorkerResult = {|
  coverage: any,
  sourceMapPath: ?string,
|};

export default function(
  source: string,
  filename: Path,
  globalConfig: GlobalConfig,
  config: ProjectConfig,
): ?CoverageWorkerResult {
  const coverageOptions = {
    collectCoverage: globalConfig.collectCoverage,
    collectCoverageFrom: globalConfig.collectCoverageFrom,
    collectCoverageOnlyFrom: globalConfig.collectCoverageOnlyFrom,
    mapCoverage: globalConfig.mapCoverage,
    mapCoverageOnlyFrom: globalConfig.mapCoverageOnlyFrom,
  };
  if (Runtime.shouldInstrument(filename, coverageOptions, config)) {
    // Transform file without instrumentation first, to make sure produced
    // source code is ES6 (no flowtypes etc.) and can be instrumented
    const scriptTransformer = new Runtime.ScriptTransformer(config);
    const mapCoverage = scriptTransformer.shouldMapCoverage(
      filename,
      coverageOptions.mapCoverage,
      coverageOptions.mapCoverageOnlyFrom,
    );
    const transformResult = scriptTransformer.transformSource(
      filename,
      source,
      false,
      mapCoverage,
    );
    const instrumenter = createInstrumenter();
    instrumenter.instrumentSync(transformResult.code, filename);
    return {
      coverage: instrumenter.fileCoverage,
      sourceMapPath: transformResult.sourceMapPath,
    };
  } else {
    return null;
  }
}
