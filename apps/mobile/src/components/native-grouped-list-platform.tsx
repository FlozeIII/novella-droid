import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isValidElement, type PropsWithChildren, type ReactNode } from 'react';

import { NativeIcon } from '@/components/native-icon';
import type { NativeGroupedListProps, NativeGroupedListRowProps } from '@/components/native-grouped-list';
import { useAppTheme } from '@/theme/app-theme';

const isIOS = Platform.OS === 'ios';

// Lazy-require iOS-only SwiftUI modules.
let Host: any = null;
let RNHostView: any = null;
let SwiftUI: any = null;
let modifiers: any = null;

if (isIOS) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const expoUi = require('@expo/ui');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const swiftUi = require('@expo/ui/swift-ui');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const swiftModifiers = require('@expo/ui/swift-ui/modifiers');
  Host = expoUi.Host;
  RNHostView = expoUi.RNHostView;
  SwiftUI = swiftUi;
  modifiers = swiftModifiers;
}

export function NativeGroupedListPlatform({
  children,
  testID,
}: NativeGroupedListProps) {
  const { colors } = useAppTheme();

  if (isIOS && Host && SwiftUI) {
    return (
      <Host seedColor={colors.accent} style={{ flex: 1, width: '100%' }}>
        <SwiftUI.List
          modifiers={[modifiers.listStyle('insetGrouped')]}
          {...(testID ? { testID } : {})}
        >
          {children}
        </SwiftUI.List>
      </Host>
    );
  }

  // Android fallback: ScrollView-based grouped list
  return (
    <ScrollView
      style={[styles.androidListContainer, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.androidListContent}
      {...(testID ? { testID } : {})}
    >
      {children}
    </ScrollView>
  );
}

export function NativeGroupedListSectionPlatform({ children, title }: PropsWithChildren<{ title: string }>) {
  const { colors } = useAppTheme();

  if (isIOS && SwiftUI) {
    return <SwiftUI.Section title={title}>{children}</SwiftUI.Section>;
  }

  return (
    <View style={styles.androidSection}>
      <Text style={[styles.androidSectionHeader, { color: colors.secondaryLabel }]}>
        {title.toUpperCase()}
      </Text>
      <View style={[styles.androidSectionCard, { backgroundColor: colors.card }]}>
        {children}
      </View>
    </View>
  );
}

export function NativeGroupedListRowPlatform({
  description,
  disabled,
  icon,
  onPress,
  title,
  trailing,
}: NativeGroupedListRowProps) {
  const { colors } = useAppTheme();

  if (isIOS && SwiftUI && modifiers) {
    const modList = [modifiers.buttonStyle('plain'), ...(disabled ? [modifiers.disabled(true)] : [])];
    const buttonProps = onPress ? { onPress } : {};
    return (
      <SwiftUI.Button {...buttonProps} modifiers={modList}>
        <SwiftUI.HStack
          alignment="top"
          modifiers={[modifiers.contentShape(modifiers.shapes.rectangle())]}
          spacing={12}
        >
          <SwiftUI.HStack spacing={0} modifiers={[modifiers.frame({ width: 28, height: 28 })]}>
            <NativeIcon color={colors.accent as string} name={icon} />
          </SwiftUI.HStack>
          <SwiftUI.VStack alignment="leading" spacing={2}>
            <SwiftUI.Text modifiers={[modifiers.font({ textStyle: 'body' })]}>{title}</SwiftUI.Text>
            {description ? (
              <SwiftUI.Text
                modifiers={[
                  modifiers.font({ textStyle: 'subheadline' }),
                  modifiers.foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                ]}
              >
                {description}
              </SwiftUI.Text>
            ) : null}
          </SwiftUI.VStack>
          <SwiftUI.Spacer />
          {trailing ? renderAccessory(trailing) : null}
        </SwiftUI.HStack>
      </SwiftUI.Button>
    );
  }

  // Android fallback
  const content = (
    <View style={styles.androidRow}>
      <View style={styles.androidRowIcon}>
        <NativeIcon color={colors.accent as string} name={icon} size={22} />
      </View>
      <View style={styles.androidRowText}>
        <Text style={[styles.androidRowTitle, { color: colors.label, fontSize: 16 }]}>
          {title}
        </Text>
        {description ? (
          <Text style={[styles.androidRowDescription, { color: colors.secondaryLabel }]} numberOfLines={0}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={styles.androidRowTrailing}>
        {trailing ? renderAccessoryAndroid(trailing, colors.label as string) : null}
      </View>
    </View>
  );

  if (onPress && !disabled) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [
        styles.androidRowPressable,
        pressed && { opacity: 0.6 },
      ]}>
        {content}
      </Pressable>
    );
  }

  return <View style={styles.androidRowPressable}>{content}</View>;
}

function renderAccessory(accessory: ReactNode) {
  if (isValidElement(accessory) && RNHostView) {
    return <RNHostView matchContents>{accessory}</RNHostView>;
  }
  if (SwiftUI) {
    return <SwiftUI.Text>{String(accessory)}</SwiftUI.Text>;
  }
  return null;
}

function renderAccessoryAndroid(accessory: ReactNode, color: string) {
  if (isValidElement(accessory)) {
    return accessory;
  }
  return <Text style={[styles.androidAccessoryText, { color }]}>{String(accessory)}</Text>;
}

const styles = StyleSheet.create({
  androidListContainer: {
    flex: 1,
  },
  androidListContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  androidSection: {
    marginBottom: 20,
  },
  androidSectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 12,
  },
  androidSectionCard: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  androidRowPressable: {
    width: '100%',
  },
  androidRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  androidRowIcon: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    marginRight: 12,
    width: 28,
  },
  androidRowText: {
    flex: 1,
    justifyContent: 'center',
  },
  androidRowTitle: {
    fontWeight: '400',
  },
  androidRowDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  androidRowTrailing: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 8,
  },
  androidAccessoryText: {
    fontSize: 14,
    opacity: 0.6,
  },
});
