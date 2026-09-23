import { Platform, StyleSheet, View } from 'react-native';

// @expo/ui/swift-ui is iOS-only: it has no Android entry point, so it may only
// be required on iOS. Requiring it at module scope would break the Android bundle.
let SwiftUISlider: any = null;
let disabledModifier: any = null;

if (Platform.OS === 'ios') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const swiftUi = require('@expo/ui/swift-ui');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const modifiers = require('@expo/ui/swift-ui/modifiers');
  SwiftUISlider = swiftUi.Slider;
  disabledModifier = modifiers.disabled;
}

// @expo/ui/jetpack-compose is Android-only for the same reason.
let ComposeSlider: any = null;

if (Platform.OS === 'android') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ComposeSlider = require('@expo/ui/jetpack-compose').Slider;
}

export interface NativeSliderControlProps {
  disabled?: boolean;
  max: number;
  min: number;
  onSlidingComplete?: () => void;
  onValueChange: (value: number) => void;
  step?: number;
  value: number;
}

// Material3 sliders have no intrinsic width; the Fabric view takes the size Yoga
// gives it, so the trailing slot has to state one explicitly.
const ANDROID_SLIDER_WIDTH = 140;
const ANDROID_SLIDER_HEIGHT = 44;

export function NativeSliderControl({
  disabled = false,
  onSlidingComplete,
  value,
  min,
  max,
  step,
  onValueChange,
}: NativeSliderControlProps) {
  if (Platform.OS === 'ios' && SwiftUISlider) {
    return (
      <SwiftUISlider
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={onValueChange}
        {...(disabled ? { modifiers: [disabledModifier(true)] } : {})}
        onEditingChanged={(isEditing: boolean) => {
          if (!isEditing) setTimeout(() => onSlidingComplete?.(), 0);
        }}
      />
    );
  }

  if (!ComposeSlider) return null;

  // `step` is the increment size, while Material3's `steps` counts the discrete
  // stops *between* min and max. Material3 also reports raw drag positions, so
  // the value is snapped back onto the grid before it reaches the caller.
  const stepSize = step !== undefined && step > 0 ? step : null;
  const steps = stepSize === null
    ? 0
    : Math.max(0, Math.round((max - min) / stepSize) - 1);

  return (
    <View style={styles.androidSlider}>
      <ComposeSlider
        enabled={!disabled}
        max={max}
        min={min}
        onValueChange={(nextValue: number) => {
          onValueChange(
            stepSize === null
              ? nextValue
              : Math.round((nextValue - min) / stepSize) * stepSize + min,
          );
        }}
        // Material3's onValueChangeFinished is the exact counterpart of the
        // SwiftUI slider's onEditingChanged(false): it fires when the finger is
        // lifted, not after a quiet period mid-drag.
        onValueChangeFinished={() => onSlidingComplete?.()}
        steps={steps}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  androidSlider: {
    height: ANDROID_SLIDER_HEIGHT,
    justifyContent: 'center',
    width: ANDROID_SLIDER_WIDTH,
  },
});
