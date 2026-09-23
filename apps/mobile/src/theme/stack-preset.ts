import { Platform } from 'react-native';
import Stack from 'expo-router/stack';
import { useMemo } from 'react';

import { useAppTheme } from '@/theme/app-theme';

type StackScreenOptions = React.ComponentProps<typeof Stack>['screenOptions'];

// expo-glass-effect is iOS-only. On Android we use a solid header.
const hasLiquidGlass = Platform.OS === 'ios'
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? require('expo-glass-effect').isLiquidGlassAvailable()
  : false;

export function useSystemScreenStackPreset(): StackScreenOptions {
  const { colors } = useAppTheme();

  return useMemo(() => ({
    contentStyle: { backgroundColor: colors.background },
    headerBackButtonDisplayMode: 'minimal',
    headerBlurEffect: Platform.OS === 'ios'
      ? hasLiquidGlass ? undefined : 'systemMaterial'
      : undefined,
    headerLargeTitleShadowVisible: false,
    headerShadowVisible: false,
    headerTintColor: colors.accent,
    headerTitleStyle: { color: colors.label as string },
    headerTransparent: hasLiquidGlass,
  }), [colors]);
}
