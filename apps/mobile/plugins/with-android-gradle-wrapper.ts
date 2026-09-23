/// <reference types="node" />

import { withDangerousMod } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';
import fs from 'node:fs';
import path from 'node:path';

// Deliberately pinned below the version Expo's template ships (9.3.1) and routed
// through a reachable mirror. Gradle 9.x fails this project's build — the 8.13
// builds warn that the AGP/React Native plugins use features removed in 9.0 —
// so the pin is load-bearing, not incidental. Bump only with a full build.
const gradleVersion = '8.13';
const distributionUrl = `https\\://mirrors.cloud.tencent.com/gradle/gradle-${gradleVersion}-bin.zip`;

/**
 * Pin the Gradle distribution to a mirror-reachable, build-verified version.
 *
 * Expo's template points the wrapper at services.gradle.org (GFW-blocked) and at
 * a Gradle major version this project cannot build with, so both the host and the
 * version are rewritten here rather than only the host.
 */
const withAndroidGradleWrapper: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      if (cfg.modRequest.introspect) {
        return cfg;
      }

      const wrapperPath = path.join(
        cfg.modRequest.platformProjectRoot,
        'gradle',
        'wrapper',
        'gradle-wrapper.properties',
      );
      const contents = await fs.promises.readFile(wrapperPath, 'utf8');

      const rewritten = contents.replace(
        /^distributionUrl=.*$/m,
        `distributionUrl=${distributionUrl}`,
      );
      if (rewritten === contents) {
        return cfg;
      }

      await fs.promises.writeFile(wrapperPath, rewritten);
      return cfg;
    },
  ]);

export default withAndroidGradleWrapper;
