import { withAppBuildGradle } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';

const releaseSigningConfig = [
  '        release {',
  "            storeFile file('../../.keystore/release.keystore')",
  "            storePassword System.getenv('NOVELLA_KEYSTORE_PASSWORD')",
  "            keyAlias 'novella'",
  "            keyPassword System.getenv('NOVELLA_KEYSTORE_PASSWORD')",
  '        }',
].join('\n');

// The release buildType in the Expo template defaults to `signingConfigs.debug`;
// the `def enableShrinkResources` line right after it disambiguates it from the
// debug buildType's identical signingConfig line.
const releaseBuildTypeDebugSigning =
  '            signingConfig signingConfigs.debug\n            def enableShrinkResources';
const releaseBuildTypeReleaseSigning =
  '            signingConfig signingConfigs.release\n            def enableShrinkResources';

// Every codegen target's object directory is 192 chars under this workspace, so
// CMake only has 58 chars left for an object name -- one short of the 59 that
// its "<md5>/<filename>" hashed form needs. At 256 the hash kicks in and object
// paths stay short; at CMake's Windows default (250) it silently gives up and
// emits full node_modules paths, which ninja rejects past 260 chars. Lowering it
// (e.g. to 128) makes things worse: CMake refuses to shorten when the directory
// already exceeds the limit. Tuned to this workspace's depth -- a substantially
// deeper checkout would need revisiting.
const cmakeObjectPathMaxBlock = [
  '',
  '        // Raise CMake\'s object-path limit above its Windows default (250).',
  '        // The object directory for the codegen targets is 192 chars, leaving',
  '        // only 58 chars for an object name, but the hashed form ("<md5>/<file>")',
  '        // needs 59. At 256 the hashing kicks in, so codegen-generated C++ under',
  '        // node_modules/ (react-native-safe-area-context, react-native-enriched-html)',
  '        // gets short object paths instead of exceeding Windows\' 260-char MAX_PATH',
  '        // (which makes ninja fail with "Filename longer than 260 characters").',
  '        externalNativeBuild {',
  '            cmake {',
  '                arguments "-DCMAKE_OBJECT_PATH_MAX=256"',
  '            }',
  '        }',
].join('\n');

// Readium Kotlin Toolkit requires Java 8+ desugaring to build at all.
const compileOptionsBlock = [
  '    compileOptions {',
  '        coreLibraryDesugaringEnabled true',
  '        sourceCompatibility JavaVersion.VERSION_17',
  '        targetCompatibility JavaVersion.VERSION_17',
  '    }',
].join('\n');

const coreLibraryDesugaringDependency = [
  '',
  '',
  '    // Core library desugaring (required by Readium Kotlin Toolkit)',
  '    coreLibraryDesugaring "com.android.tools:desugar_jdk_libs:2.1.2"',
].join('\n');

// Stale once a real signing config exists, so the template's advice is dropped.
const templateKeystoreCaution = [
  '            // Caution! In production, you need to generate your own keystore file.',
  '            // see https://reactnative.dev/docs/signed-apk-android.',
  '',
].join('\n');

const defaultConfigEndAnchor = '    }\n    signingConfigs {';
const androidBlockEndAnchor = '    }\n}\n\n// Apply static values';
const reactAndroidDependency = '    implementation("com.facebook.react:react-android")';

function findBlockEnd(contents: string, openBraceIndex: number): number {
  let depth = 0;
  for (let i = openBraceIndex; i < contents.length; i += 1) {
    const ch = contents.charAt(i);
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Apply the android/app/build.gradle hand-edits that the Expo template does not
 * generate: release signing (with the keystore password read from
 * NOVELLA_KEYSTORE_PASSWORD at Gradle build time, so no secret is ever
 * committed), the CMake object-path cap that keeps codegen sources under
 * Windows' MAX_PATH, and the Java desugaring that Readium Kotlin Toolkit needs.
 *
 * Each injection is skipped when its marker is already present.
 */
const withAndroidAppBuildGradle: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (!contents.includes('CMAKE_OBJECT_PATH_MAX')) {
      contents = contents.replace(
        defaultConfigEndAnchor,
        `${cmakeObjectPathMaxBlock}\n${defaultConfigEndAnchor}`,
      );
    }

    if (!contents.includes('coreLibraryDesugaringEnabled')) {
      contents = contents.replace(
        androidBlockEndAnchor,
        `    }\n${compileOptionsBlock}\n}\n\n// Apply static values`,
      );
    }

    if (!contents.includes('desugar_jdk_libs')) {
      contents = contents.replace(
        reactAndroidDependency,
        `${reactAndroidDependency}${coreLibraryDesugaringDependency}`,
      );
    }

    const signingConfigsStart = contents.indexOf('signingConfigs {');
    if (signingConfigsStart === -1) {
      throw new Error('Could not find signingConfigs block in android/app/build.gradle');
    }
    const signingConfigsOpen = contents.indexOf('{', signingConfigsStart);
    const signingConfigsEnd = findBlockEnd(contents, signingConfigsOpen);
    if (signingConfigsEnd === -1) {
      throw new Error('Could not find the end of the signingConfigs block in android/app/build.gradle');
    }
    const signingConfigsBody = contents.slice(signingConfigsOpen + 1, signingConfigsEnd);
    if (!signingConfigsBody.includes('release {')) {
      const closingBraceLineStart = contents.lastIndexOf('\n', signingConfigsEnd - 1);
      const closingBraceIndent = contents.slice(closingBraceLineStart, signingConfigsEnd);
      contents =
        contents.slice(0, closingBraceLineStart) +
        '\n' +
        releaseSigningConfig +
        closingBraceIndent +
        contents.slice(signingConfigsEnd);
    }

    contents = contents.replace(templateKeystoreCaution, '');
    contents = contents.replace(releaseBuildTypeDebugSigning, releaseBuildTypeReleaseSigning);

    cfg.modResults.contents = contents;
    return cfg;
  });

export default withAndroidAppBuildGradle;
