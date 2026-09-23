import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useEffect, useRef } from 'react';

import {
  NativeGroupedListRow,
  NativeGroupedListSection,
} from '@/components/native-grouped-list';
import {
  createDebouncedCommit,
  type DebouncedCommit,
} from '@/services/debounced-commit';
import { useAppTheme } from '@/theme/app-theme';

// @expo/ui/swift-ui has no Android entry point, so it may only be required on
// iOS. Requiring it at module scope would break the Android bundle.
const isIOS = Platform.OS === 'ios';

let SwiftUIColorPicker: any = null;

if (isIOS) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SwiftUIColorPicker = require('@expo/ui/swift-ui').ColorPicker;
}

/**
 * Android stand-in for the iOS system colour picker. iOS accepts any colour;
 * Android offers a fixed palette until a full picker is ported.
 */
const ANDROID_BACKGROUND_SWATCHES = ['#FFFFFF', '#F2F2F7', '#F5ECD9', '#1C1C1E', '#000000'];

export interface ReaderBackgroundColorSettingsProps {
  backgroundColor: string;
  description: string;
  onValueChange: (value: string) => void;
  sectionTitle: string;
  title: string;
}

const COLOR_PICKER_COMMIT_DELAY_MS = 180;

export function ReaderBackgroundColorSettings({
  backgroundColor,
  description,
  onValueChange,
  sectionTitle,
  title,
}: ReaderBackgroundColorSettingsProps) {
  const { colors } = useAppTheme();
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;
  const commitRef = useRef<DebouncedCommit<string> | null>(null);
  if (commitRef.current === null) {
    commitRef.current = createDebouncedCommit(
      (value) => onValueChangeRef.current(value),
      COLOR_PICKER_COMMIT_DELAY_MS,
    );
  }

  useEffect(() => () => {
    commitRef.current?.dispose();
    commitRef.current = null;
  }, []);

  // The native ColorPicker keeps the live drag selection in SwiftUI state;
  // only the settled value enters the React/settings tree.
  const trailing = isIOS && SwiftUIColorPicker ? (
    <SwiftUIColorPicker
      onSelectionChange={(value: string) => commitRef.current?.schedule(value)}
      selection={backgroundColor}
      supportsOpacity={false}
    />
  ) : (
    <View style={styles.swatches}>
      {ANDROID_BACKGROUND_SWATCHES.map((swatch) => {
        const isSelected = swatch.toUpperCase() === backgroundColor.toUpperCase();
        return (
          <Pressable
            accessibilityRole="button"
            key={swatch}
            onPress={() => commitRef.current?.schedule(swatch)}
            style={[
              styles.swatch,
              { backgroundColor: swatch, borderColor: colors.separator },
              isSelected && { borderColor: colors.accent, borderWidth: 2 },
            ]}
          />
        );
      })}
    </View>
  );

  return (
    <NativeGroupedListSection title={sectionTitle}>
      <NativeGroupedListRow
        description={description}
        icon="coverColor"
        title={title}
        trailing={trailing}
      />
    </NativeGroupedListSection>
  );
}

const styles = StyleSheet.create({
  swatches: {
    flexDirection: 'row',
    gap: 8,
  },
  swatch: {
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    width: 30,
  },
});
