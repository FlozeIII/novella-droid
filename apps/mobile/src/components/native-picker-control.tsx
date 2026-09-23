import { Platform, StyleSheet, View } from 'react-native';
import { Picker as UniversalPicker } from '@expo/ui';

// @expo/ui/swift-ui is iOS-only: it has no Android entry point, so it may only
// be required on iOS. Requiring it at module scope would break the Android bundle.
let SwiftUIPicker: any = null;
let SwiftUIText: any = null;
let pickerModifiers: any = null;

if (Platform.OS === 'ios') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const swiftUi = require('@expo/ui/swift-ui');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const modifiers = require('@expo/ui/swift-ui/modifiers');
  SwiftUIPicker = swiftUi.Picker;
  SwiftUIText = swiftUi.Text;
  pickerModifiers = modifiers;
}

export interface NativePickerOption<T extends string | number> {
  label: string;
  value: T;
}

export interface NativePickerControlProps<T extends string | number> {
  enabled?: boolean;
  onValueChange: (value: T) => void;
  options: readonly NativePickerOption<T>[];
  selectedValue: T;
}

const PICKER_MIN_WIDTH = 96;

export function NativePickerControl<T extends string | number>({
  enabled = true,
  onValueChange,
  options,
  selectedValue,
}: NativePickerControlProps<T>) {
  if (Platform.OS === 'ios' && SwiftUIPicker) {
    const {
      pickerStyle,
      frame,
      layoutPriority,
      disabled: disabledMod,
      tag,
      lineLimit,
      fixedSize,
    } = pickerModifiers;

    return (
      <SwiftUIPicker
        modifiers={[
          pickerStyle('menu'),
          frame({ minWidth: PICKER_MIN_WIDTH }),
          layoutPriority(1),
          ...(enabled ? [] : [disabledMod(true)]),
        ]}
        onSelectionChange={(value: T) => onValueChange(value)}
        selection={selectedValue}
      >
        {options.map((option) => (
          <SwiftUIText
            key={String(option.value)}
            modifiers={[tag(option.value), lineLimit(1), fixedSize({ horizontal: true })]}
          >
            {option.label}
          </SwiftUIText>
        ))}
      </SwiftUIPicker>
    );
  }

  if (Platform.OS !== 'android') return null;

  // The universal Picker renders a Material 3 dropdown menu here, which the row
  // dispatches to directly. Its anchor is a TextField with no intrinsic width,
  // so the container has to state one.
  return (
    <View style={styles.androidPicker}>
      <UniversalPicker
        enabled={enabled}
        onValueChange={(value: T) => onValueChange(value)}
        selectedValue={selectedValue}
      >
        {options.map((option) => (
          <UniversalPicker.Item
            key={String(option.value)}
            label={option.label}
            value={option.value}
          />
        ))}
      </UniversalPicker>
    </View>
  );
}

const styles = StyleSheet.create({
  androidPicker: {
    height: 44,
    justifyContent: 'center',
    width: 148,
  },
});
