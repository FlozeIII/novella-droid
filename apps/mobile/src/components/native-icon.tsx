import { Platform, StyleSheet, View } from 'react-native';

import { useNativeIconSet } from '@/components/native-icon-set-context';
import { tablerNativeIcons } from '@/components/tabler-native-icon-map';
import type { NativeIconName } from '@/components/native-icon-types';

// SF Symbols are iOS-only. On Android we always use Tabler icons.
const canUseSfSymbols = Platform.OS === 'ios';

let Image: any = null;
let accessibilityLabel: any = null;
let RNHostView: any = null;

if (canUseSfSymbols) {
  // Lazy-require iOS-only modules so Android builds don't try to resolve them.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const expoUi = require('@expo/ui');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const swiftUi = require('@expo/ui/swift-ui');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const modifiers = require('@expo/ui/swift-ui/modifiers');
  Image = swiftUi.Image;
  accessibilityLabel = modifiers.accessibilityLabel;
  RNHostView = expoUi.RNHostView;
}

type SystemName = string;

// SF Symbols are used for platform-native surfaces on iOS. Second-level settings
// explicitly select the shared Tabler set so every row uses one visual style.
const icons: Partial<Record<NativeIconName, SystemName>> = {
  account: 'person.crop.circle',
  announcement: 'megaphone.fill',
  appearance: 'paintpalette',
  badgeAi: 'cpu.fill',
  badgeEdit: 'pencil.line',
  badgeFilter1: '1.circle.fill',
  badgeFilter2: '2.circle.fill',
  badgeFilter3: '3.circle.fill',
  badgeFilter4: '4.circle.fill',
  badgeFilter5: '5.circle.fill',
  badgeFilter6: '6.circle.fill',
  badgeHistory: 'text.book.closed.fill',
  badgeJapanese: 'book.closed.fill',
  badgeLevel: 'circle.hexagongrid.fill',
  badgeReply: 'arrowshape.turn.up.left.fill',
  badgeTranslate: 'character.book.closed.fill',
  books: 'books.vertical',
  cache: 'internaldrive',
  chevronRight: 'chevron.right',
  clock: 'clock',
  community: 'person.3',
  content: 'rectangle.3.group',
  discover: 'sparkles',
  error: 'exclamationmark.triangle.fill',
  info: 'info.circle',
  progress: 'arrow.triangle.2.circlepath',
  reader: 'book.pages',
  search: 'magnifyingglass',
  settings: 'gearshape',
  shop: 'bag.fill',
  sideload: 'arrow.down.app',
  website: 'globe',
};

export type { NativeIconName } from '@/components/native-icon-types';

export function NativeIcon({
  accessibilityLabel: label,
  color,
  name,
  size = 22,
}: {
  accessibilityLabel?: string;
  color: string;
  name: NativeIconName;
  size?: number;
}) {
  const iconSet = useNativeIconSet();
  const systemName = canUseSfSymbols && iconSet === 'platform' ? icons[name] : undefined;

  if (!systemName) {
    const IconComponent = tablerNativeIcons[name];
    const content = (
      <View style={styles.iconSlot}>
        <IconComponent
          color={color}
          size={size}
          strokeWidth={2}
          {...(label ? { accessibilityLabel: label, accessible: true } : {})}
        />
      </View>
    );

    if (canUseSfSymbols && RNHostView) {
      return <RNHostView matchContents>{content}</RNHostView>;
    }
    return content;
  }

  return (
    <Image
      color={color}
      size={size}
      systemName={systemName}
      {...(label ? { modifiers: [accessibilityLabel(label)] } : {})}
    />
  );
}

const styles = StyleSheet.create({
  iconSlot: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
});
