import { Platform, StyleSheet, View } from 'react-native';
import { Text } from '@expo/ui';

import { NativeIcon } from '@/components/native-icon';
import { useAppTheme } from '@/theme/app-theme';

// @expo/ui/swift-ui has no Android entry point, so it may only be required on
// iOS. Requiring it at module scope would break the Android bundle.
const isIOS = Platform.OS === 'ios';

let SwiftUIHStack: any = null;
let SwiftUIImage: any = null;

if (isIOS) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const swiftUi = require('@expo/ui/swift-ui');
  SwiftUIHStack = swiftUi.HStack;
  SwiftUIImage = swiftUi.Image;
}

export function DisclosureIcon() {
  const { colors } = useAppTheme();
  return <NativeIcon color={colors.secondaryLabel as string} name="chevronRight" size={20} />;
}

export function NativeListValue({
  children,
  disclosure = false,
}: {
  children: string;
  disclosure?: boolean;
}) {
  const { colors } = useAppTheme();
  const value = (
    <Text textStyle={{ color: colors.secondaryLabel as string, fontSize: 14 }}>
      {children}
    </Text>
  );
  if (!disclosure) return value;

  if (isIOS && SwiftUIHStack && SwiftUIImage) {
    return (
      <SwiftUIHStack spacing={4}>
        {value}
        <SwiftUIImage color={colors.secondaryLabel as string} size={14} systemName="chevron.right" />
      </SwiftUIHStack>
    );
  }

  // The row accessory slot is a plain RN view tree on Android, so the chevron is
  // drawn with NativeIcon, which already resolves to a Tabler icon there.
  return (
    <View style={styles.disclosureContainer}>
      {value}
      <NativeIcon color={colors.secondaryLabel as string} name="chevronRight" size={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  disclosureContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
});
