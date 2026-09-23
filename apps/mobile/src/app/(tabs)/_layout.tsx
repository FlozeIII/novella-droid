import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { NativeIcon } from '@/components/native-icon';
import { useProfile } from '@/hooks/use-profile';
import { useAppTheme } from '@/theme/app-theme';

// NativeTabs is iOS-only (SwiftUI UITabBar). On Android we fall back to
// expo-router's cross-platform Tabs with Tabler icons.

function AndroidTabs() {
  const { colors } = useAppTheme();
  const { t } = useTranslation('navigation');
  const { profile } = useProfile();
  const unreadNotifications = profile?.unreadNotificationCount ?? 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent as string,
        tabBarInactiveTintColor: colors.secondaryLabel as string,
        tabBarStyle: {
          backgroundColor: colors.surface as string,
          borderTopColor: colors.separator as string,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="(discover)"
        options={{
          tabBarLabel: t('tabs.discover'),
          tabBarIcon: ({ color, size }) => (
            <NativeIcon color={color as string} name="discover" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(shelf)"
        options={{
          tabBarLabel: t('tabs.shelf'),
          tabBarIcon: ({ color, size }) => (
            <NativeIcon color={color as string} name="reader" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(history)"
        options={{
          tabBarLabel: t('tabs.history'),
          tabBarIcon: ({ color, size }) => (
            <NativeIcon color={color as string} name="clock" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(community)"
        options={{
          tabBarLabel: t('tabs.community'),
          // `exactOptionalPropertyTypes` rejects an explicit `undefined` for the
          // optional `tabBarBadge`, so omit the key entirely when there is no badge.
          ...(unreadNotifications > 0
            ? { tabBarBadge: unreadNotifications > 99 ? '99+' : String(unreadNotifications) }
            : {}),
          tabBarIcon: ({ color, size }) => (
            <NativeIcon color={color as string} name="community" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(search)"
        options={{
          tabBarLabel: t('tabs.search'),
          tabBarIcon: ({ color, size }) => (
            <NativeIcon color={color as string} name="search" size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

function IOSTabs() {
  // Lazy-require iOS-only module
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NativeTabs } = require('expo-router/unstable-native-tabs');
  const { useTranslation } = require('react-i18next');
  const { useProfile } = require('@/hooks/use-profile');
  const { useAppTheme } = require('@/theme/app-theme');

  const { colors } = useAppTheme();
  const { t } = useTranslation('navigation');
  const { profile } = useProfile();
  const unreadNotifications = profile?.unreadNotificationCount ?? 0;

  return (
    <NativeTabs
      iconColor={{ default: colors.secondaryLabel, selected: colors.accent }}
      tintColor={colors.accent}
    >
      <NativeTabs.Trigger name="(discover)">
        <NativeTabs.Trigger.Icon sf="safari.fill" />
        <NativeTabs.Trigger.Label>{t('tabs.discover')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(shelf)">
        <NativeTabs.Trigger.Icon sf="book.closed.fill" />
        <NativeTabs.Trigger.Label>{t('tabs.shelf')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(history)">
        <NativeTabs.Trigger.Icon sf="clock.fill" />
        <NativeTabs.Trigger.Label>{t('tabs.history')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(community)">
        <NativeTabs.Trigger.Icon sf="text.bubble.fill" />
        <NativeTabs.Trigger.Label>{t('tabs.community')}</NativeTabs.Trigger.Label>
        {unreadNotifications > 0 ? (
          <NativeTabs.Trigger.Badge>
            {unreadNotifications > 99 ? '99+' : String(unreadNotifications)}
          </NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(search)">
        <NativeTabs.Trigger.Icon sf="magnifyingglass" />
        <NativeTabs.Trigger.Label>{t('tabs.search')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

export default function TabsLayout() {
  if (Platform.OS === 'ios') {
    return <IOSTabs />;
  }
  return <AndroidTabs />;
}
