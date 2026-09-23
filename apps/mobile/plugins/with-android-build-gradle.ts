import { withProjectBuildGradle } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';

// Aliyun mirrors, prepended before `google()` so dependency resolution never
// has to cross the GFW. The buildscript and allprojects repositories blocks get
// different mirror sets: only buildscript needs the gradle-plugin mirror, and
// only allprojects needs the jcenter mirror.
const buildscriptMirrors = [
  "    maven { url 'https://maven.aliyun.com/repository/google' }",
  "    maven { url 'https://maven.aliyun.com/repository/public' }",
  "    maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }",
].join('\n');

const allprojectsMirrors = [
  "    maven { url 'https://maven.aliyun.com/repository/google' }",
  "    maven { url 'https://maven.aliyun.com/repository/public' }",
  "    maven { url 'https://maven.aliyun.com/repository/jcenter' }",
].join('\n');

const buildscriptRepositories = '    google()\n    mavenCentral()\n  }\n  dependencies {';
const allprojectsRepositories = "    google()\n    mavenCentral()\n    maven { url 'https://www.jitpack.io' }";

/**
 * Point Android dependency resolution at Aliyun mirrors so a fresh checkout
 * behind the GFW can resolve without stalling on Google/Maven Central.
 *
 * This deliberately does NOT reproduce the `gradle.projectsEvaluated { ... }`
 * block that used to sit at the end of this file. That block set
 * `cmake { buildType "Debug" }` to dodge Windows MAX_PATH, but AGP 8.12 removed
 * `buildType` from ExternalNativeCmakeOptions (verified with javap against
 * gradle-8.12.0.jar), so the call threw MissingMethodException into the block's
 * empty catch and never did anything. The real fix is the CMake object-path
 * limit set in with-android-app-build-gradle.ts.
 */
const withAndroidBuildGradle: ConfigPlugin = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (!contents.includes('maven.aliyun.com/repository/gradle-plugin')) {
      contents = contents.replace(
        buildscriptRepositories,
        `${buildscriptMirrors}\n${buildscriptRepositories}`,
      );
    }

    if (!contents.includes('maven.aliyun.com/repository/jcenter')) {
      contents = contents.replace(
        allprojectsRepositories,
        `${allprojectsMirrors}\n${allprojectsRepositories}`,
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });

export default withAndroidBuildGradle;
