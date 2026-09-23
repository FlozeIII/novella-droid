import { AndroidConfig, withGradleProperties } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';

// Expo's template hardcodes newArchEnabled=true and no app.config field controls
// it any more (it is absent from ExpoConfig and from @expo/prebuild-config), so
// it is set here. New Architecture must stay off for this app: its native
// modules use the legacy ViewManager API rather than Fabric codegen.
const overrides: [name: string, value: string][] = [
  ['newArchEnabled', 'false'],
  // Build only arm64-v8a instead of the four ABIs Expo ships, cutting native
  // compile time for the single target device this port runs on.
  ['reactNativeArchitectures', 'arm64-v8a'],
];

/**
 * Apply the gradle.properties overrides that the Expo template and
 * expo-build-properties cannot express, so a clean prebuild reproduces them.
 */
const withAndroidGradleProperties: ConfigPlugin = (config) =>
  withGradleProperties(config, (cfg) => {
    cfg.modResults = overrides.reduce(
      (properties, [name, value]) =>
        AndroidConfig.BuildProperties.updateAndroidBuildProperty(properties, name, value),
      cfg.modResults,
    );
    return cfg;
  });

export default withAndroidGradleProperties;
