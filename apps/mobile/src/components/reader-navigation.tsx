import { Platform, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { NativeIcon } from '@/components/native-icon';
import type { ReaderNavigationProps } from '@/components/reader-navigation.types';

// expo-glass-effect is iOS-only. On Android we use a translucent solid view.
const hasLiquidGlass = Platform.OS === 'ios'
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? require('expo-glass-effect').isLiquidGlassAvailable()
  : false;

const ANDROID_HEADER_HIT_SLOP = 10;
const READER_NAVIGATION_ITEM_HEIGHT = 44;
const READER_NAVIGATION_MAX_TITLE_WIDTH = 180;
// Reserve the native back button, both right toolbar buttons, and a
// conservative center gap. The outer title view must have an explicit width;
// maxWidth on a child GlassView does not constrain UINavigationItem.titleView's
// intrinsic measurement on iOS 26.
const READER_NAVIGATION_TITLE_SIDE_RESERVATION = 242;

export function ReaderNavigation({
  forceLightAppearance,
  foregroundColor,
  onOpenChapters,
  onOpenSettings,
  statusBarStyle,
  title,
  chromeHidden,
}: ReaderNavigationProps) {
  const { t } = useTranslation('reader');

  // Stack.Toolbar renders SwiftUI toolbar items and is iOS-only. On Android the
  // same two actions are installed as native header buttons (see headerRight
  // below) instead of being dropped, so the reader keeps its chapter-list and
  // settings entry points on both platforms.
  const toolbarContent = Platform.OS === 'ios' ? (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button
        accessibilityLabel={t('accessibility.chapterList')}
        hidden={chromeHidden}
        icon="list.bullet"
        onPress={onOpenChapters}
        tintColor={foregroundColor}
      />
      <Stack.Toolbar.Button
        accessibilityLabel={t('accessibility.readerSettings')}
        hidden={chromeHidden}
        icon="gearshape"
        onPress={onOpenSettings}
        tintColor={foregroundColor}
      />
    </Stack.Toolbar>
  ) : null;

  // The Android header hides together with the chrome, so the buttons need no
  // separate visibility flag.
  const androidHeaderRight = useCallback(
    () => (
      <View style={styles.headerButtons}>
        <Pressable
          accessibilityLabel={t('accessibility.chapterList')}
          accessibilityRole="button"
          hitSlop={ANDROID_HEADER_HIT_SLOP}
          onPress={onOpenChapters}
        >
          <NativeIcon color={foregroundColor} name="readingMode" size={22} />
        </Pressable>
        <Pressable
          accessibilityLabel={t('accessibility.readerSettings')}
          accessibilityRole="button"
          hitSlop={ANDROID_HEADER_HIT_SLOP}
          onPress={onOpenSettings}
        >
          <NativeIcon color={foregroundColor} name="settings" size={22} />
        </Pressable>
      </View>
    ),
    [foregroundColor, onOpenChapters, onOpenSettings, t],
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerLargeTitle: false,
          headerShadowVisible: false,
          ...(Platform.OS === 'ios' ? {
            scrollEdgeEffects: {
              bottom: 'hidden',
              left: 'hidden',
              right: 'hidden',
              top: 'soft',
            },
          } : {}),
          headerTintColor: foregroundColor,
          headerTitle: () => (
            <ReaderHeaderTitle
              forceLightAppearance={forceLightAppearance ?? false}
              foregroundColor={foregroundColor}
              statusBarStyle={statusBarStyle}
              title={title}
            />
          ),
          headerTitleStyle: { color: foregroundColor },
          headerShown: !chromeHidden,
          ...(Platform.OS === 'android' ? { headerRight: androidHeaderRight } : {}),
          gestureEnabled: false,
          ...(forceLightAppearance && Platform.OS === 'ios'
            ? {
                unstable_nativeProps: {
                  headerConfig: { experimental_userInterfaceStyle: 'light' },
                },
              }
            : {}),
          title,
        }}
      />
      <StatusBar
        animated
        barStyle={statusBarStyle}
        hidden={chromeHidden}
        showHideTransition="fade"
      />
      {!chromeHidden ? toolbarContent : null}
    </>
  );
}

type ReaderHeaderTitleProps = Pick<
  ReaderNavigationProps,
  'forceLightAppearance' | 'foregroundColor' | 'statusBarStyle' | 'title'
>;

function ReaderHeaderTitle({
  forceLightAppearance,
  foregroundColor,
  statusBarStyle,
  title,
}: ReaderHeaderTitleProps) {
  const { width: windowWidth } = useWindowDimensions();
  const titleWidth = Math.max(
    READER_NAVIGATION_ITEM_HEIGHT,
    Math.min(
      READER_NAVIGATION_MAX_TITLE_WIDTH,
      windowWidth - READER_NAVIGATION_TITLE_SIDE_RESERVATION,
    ),
  );
  const colorScheme = forceLightAppearance || statusBarStyle === 'dark-content'
    ? 'light'
    : 'dark';
  const fallbackBackgroundColor = statusBarStyle === 'light-content'
    ? 'rgba(255,255,255,0.16)'
    : 'rgba(0,0,0,0.08)';

  if (Platform.OS === 'ios') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GlassView } = require('expo-glass-effect');
    return (
      <View style={[styles.titleContainer, { width: titleWidth }]}>
        <GlassView
          colorScheme={colorScheme}
          glassEffectStyle="regular"
          style={[
            styles.titleGlass,
            !hasLiquidGlass && { backgroundColor: fallbackBackgroundColor },
          ]}
        >
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            style={[styles.titleText, { color: foregroundColor }]}
          >
            {title}
          </Text>
        </GlassView>
      </View>
    );
  }

  // Android fallback: solid rounded pill background
  return (
    <View style={[styles.titleContainer, { width: titleWidth }]}>
      <View
        style={[
          styles.titleGlass,
          { backgroundColor: fallbackBackgroundColor },
        ]}
      >
        <Text
          ellipsizeMode="tail"
          numberOfLines={1}
          style={[styles.titleText, { color: foregroundColor }]}
        >
          {title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerButtons: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18,
  },
  titleContainer: {
    height: READER_NAVIGATION_ITEM_HEIGHT,
    overflow: 'hidden',
  },
  titleGlass: {
    alignItems: 'center',
    borderRadius: READER_NAVIGATION_ITEM_HEIGHT / 2,
    height: READER_NAVIGATION_ITEM_HEIGHT,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 12,
    width: '100%',
  },
  titleText: {
    alignSelf: 'stretch',
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
});
