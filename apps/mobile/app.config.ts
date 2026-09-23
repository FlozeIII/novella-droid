import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const buildNumber = process.env.APP_BUILD_NUMBER;

/**
 * The version to report when git cannot supply one.
 *
 * This module is evaluated as CommonJS with `__dirname` bound to its own directory
 * (see @expo/require-utils' `loadModuleSync`), so package.json is reachable beside it.
 *
 * `0.0.0` is deliberately not the fallback: the backend reads the version out of the
 * `User-Agent` that `getBackendUserAgent()` builds, and rejects clients below its
 * minimum with "当前客户端版本过低", which fails login outright. A checkout without git
 * (this port has no repository) must therefore still report a real version.
 */
function resolvePackageVersion(): string {
  try {
    const { version } = JSON.parse(
      readFileSync(join(__dirname, 'package.json'), 'utf8'),
    ) as { version?: unknown };
    // The backend compares semver; anything else is no better than no version.
    return typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version.trim())
      ? version.trim()
      : '0.0.0';
  } catch {
    // Unreadable package.json must not throw: a config error fails the whole build,
    // which is worse than reporting a version the backend will reject.
    return '0.0.0';
  }
}

function resolveLocalCompatibilityVersion(): string {
  let repositoryRoot: string;
  try {
    repositoryRoot = execFileSync(
      'git',
      ['rev-parse', '--show-toplevel'],
      { encoding: 'utf8' },
    ).trim();
  } catch {
    // Git not available (e.g. downloaded as ZIP) — fall back to package.json version.
    return resolvePackageVersion();
  }

  const latestTag = execFileSync(
    'git',
    ['tag', '--merged', 'HEAD', '--sort=-version:refname'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )
    .split(/\r?\n/)
    .find((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
  if (!latestTag) {
    // A checkout with no reachable release tag is in the same position as a ZIP.
    return resolvePackageVersion();
  }
  return latestTag.slice(1);
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Novella Droid',
  slug: 'novella',
  // CI release tags override this; local and untagged builds use the newest
  // stable release tag reachable from the current commit.
  version: process.env.APP_VERSION || resolveLocalCompatibilityVersion(),
  orientation: 'portrait',
  platforms: ['ios', 'android'],
  scheme: 'novella',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  locales: {
    'zh-CN': './locales/zh-CN.json',
    'zh-TW': './locales/zh-TW.json',
  },
  plugins: [
    [
      'expo-localization',
      {
        supportedLocales: {
          ios: ['zh-CN', 'zh-TW'],
          android: ['zh-CN', 'zh-TW'],
        },
      },
    ],
    'expo-router',
    // iOS-only: tint the splash logo from an asset catalog color.
    // Android uses expo-splash-screen's image directly; this mod is skipped.
    './plugins/with-ios-splash-logo',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        dark: {
          backgroundColor: '#000000',
        },
        image: './assets/splash-logo-on-light.png',
        imageWidth: 200,
        resizeMode: 'contain',
        android: {
          image: './assets/splash-logo-on-light.png',
          resizeMode: 'contain',
          backgroundColor: '#FFFFFF',
          dark: {
            backgroundColor: '#000000',
          },
        },
      },
    ],
    // iOS-only: mark the Expo Dev Launcher strip phase always-out-of-date.
    // Android does not have an equivalent build phase, so this is skipped.
    './plugins/with-expo-dev-launcher-build-phase',
    'expo-dev-client',
    [
      'expo-build-properties',
      {
        ios: {
          // ccache 加速 iOS 原生 C++ 编译（CI 缓存 ~/Library/Caches/ccache）。
          ccacheEnabled: true,
          // SDK 57 默认值，显式固定防止漂移。
          usePrecompiledModules: true,
          buildReactNativeFromSource: false,
          extraPods: [
            { name: 'Minizip', modular_headers: true },
            {
              name: 'ReadiumShared',
              version: '~> 3.11.0',
              source: 'https://github.com/readium/podspecs',
            },
            {
              name: 'ReadiumStreamer',
              version: '~> 3.11.0',
              source: 'https://github.com/readium/podspecs',
            },
            {
              name: 'ReadiumNavigator',
              version: '~> 3.11.0',
              source: 'https://github.com/readium/podspecs',
            },
          ],
        },
        android: {
          // Android 原生编译配置，后续可根据需要开启 NDK ccache 等。
          // Readium Android (readium-kotlin-toolkit) 通过本地 Expo Module
          // 的 build.gradle 依赖引入，无需在此声明 extraMavenRepositories。
          // 与 gradle.properties 实测可构建的 SDK 版本对齐。
          compileSdkVersion: 36,
          // targetSdk 34 刻意低于 compileSdk 36（原因未留档，勿随意调高）。
          targetSdkVersion: 34,
          buildToolsVersion: '36.1.0',
        },
      },
    ],
    // Android-only: reproduce the hand-edits that previously lived only in the
    // gitignored android/ directory, so `expo prebuild --clean` restores them.
    './plugins/with-android-gradle-wrapper',
    './plugins/with-android-build-gradle',
    './plugins/with-android-app-build-gradle',
    './plugins/with-android-gradle-properties',
    'expo-sharing',
  ],
  extra: {
    // 后台只认 User-Agent 里的名字与版本，且会拒掉版本过低的客户端。这两个是钉死的
    // 「后台兼容身份」，与本改版自己的 name/version 解耦——本改版改名或使用自己的
    // 版本号，都不会让后台看到一个陌生或过时的客户端。
    // backendVersion 必须跟随上游 celia-sh/Novella 的 release 线手动更新（上游当前最新 v2.5.0）。
    backendName: 'Novella',
    backendVersion: '2.4.0',
    // 运行时经 Constants.expoConfig.extra 读取，设置页展示构建渠道与标签。
    buildChannel: process.env.APP_BUILD_CHANNEL ?? 'local',
    buildLabel: process.env.APP_BUILD_LABEL ?? '',
  },
  ios: {
    // 与 android.package 保持一致（见上方包名说明）。
    bundleIdentifier: 'sh.celia.novella.droid',
    // 发布流程注入 BUILD_NUMBER（git rev-list --count，单调递增）；未注入时回退为 1。
    buildNumber: buildNumber ?? '1',
    supportsTablet: true,
    // Icon Composer (iOS 26 Liquid Glass) 图标,覆盖顶层 icon。
    icon: './assets/Novella.icon',
    infoPlist: {
      CFBundleAllowMixedLocalizations: true,
      // Expo StatusBar / RCTStatusBarManager owns app-wide and route-local
      // status-bar appearance. react-native-pretty-toast cannot toggle the
      // bar through its overlay controller in this configuration.
      UIViewControllerBasedStatusBarAppearance: false,
      NSPhotoLibraryAddUsageDescription: '允许 Novella 将图片保存到你的照片图库。',
    },
  },
  android: {
    // 与上游 celia-sh/Novella 的包名区分：本仓库是其 Android 移植修改版，
    // 用它自己的包名发布，避免与上游身份混淆或将来撞车。
    package: 'sh.celia.novella.droid',
    // 发布流程注入 versionCode（git rev-list --count，单调递增）；未注入时回退为 1。
    versionCode: Number(buildNumber ?? '1'),
    // adaptive icon 前景/背景，用现有 splash logo 作为前景图。
    adaptiveIcon: {
      foregroundImage: './assets/splash-logo-on-light.png',
      backgroundColor: '#FFFFFF',
    },
    // Android 14+ edge-to-edge / 16KB 页面对齐等由 RN 0.86 默认开启。
    permissions: [
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
});
