import { Color } from 'expo-router';
import { Platform } from 'react-native';
import { useMemo } from 'react';

import type { AppColors } from '@/theme/app-colors';
import type { AppColorScheme } from '@/theme/theme-mode';

const androidLightColors: AppColors = {
  accent: '#FF6B81',
  background: '#F2F2F7',
  card: '#FFFFFF',
  error: '#FF3B30',
  label: '#000000',
  onPrimaryContainer: '#FFFFFF',
  primaryContainer: '#FF6B81',
  secondaryLabel: '#8E8E93',
  separator: '#C6C6C8',
  surface: '#FFFFFF',
  surfaceContainerHighest: '#E5E5EA',
};

const androidDarkColors: AppColors = {
  accent: '#FF6B81',
  background: '#000000',
  card: '#1C1C1E',
  error: '#FF453A',
  label: '#FFFFFF',
  onPrimaryContainer: '#FFFFFF',
  primaryContainer: '#FF6B81',
  secondaryLabel: '#8E8E93',
  separator: '#38383A',
  surface: '#1C1C1E',
  surfaceContainerHighest: '#2C2C2E',
};

export function usePlatformAppColors(options: { colorScheme: AppColorScheme }): AppColors {
  return useMemo(() => {
    if (Platform.OS === 'ios') {
      return {
        accent: Color.ios.systemPink,
        background: Color.ios.systemGroupedBackground,
        card: Color.ios.secondarySystemGroupedBackground,
        error: Color.ios.systemRed,
        label: Color.ios.label,
        onPrimaryContainer: '#FFFFFF',
        primaryContainer: Color.ios.systemPink,
        secondaryLabel: Color.ios.secondaryLabel,
        separator: Color.ios.separator,
        surface: Color.ios.systemBackground,
        // systemGray5 (not tertiarySystemGroupedBackground) so placeholder/skeleton
        // surfaces stay one step darker than the grouped page background in light
        // mode instead of blending into it.
        surfaceContainerHighest: Color.ios.systemGray5,
      };
    }

    // Android: use Material-inspired static palette.
    return options.colorScheme === 'dark' ? androidDarkColors : androidLightColors;
  }, [options.colorScheme]);
}
