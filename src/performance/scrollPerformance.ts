import { Platform } from 'react-native';

/**
 * Shared list defaults for every long selector/list in Trainer Collection.
 * This is the project-wide standard: new long options must use virtualization
 * so drag/scroll performance does not regress on Android.
 */
export const VIRTUAL_LIST_PERF_PROPS = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 8,
  updateCellsBatchingPeriod: 50,
  windowSize: 5,
  removeClippedSubviews: Platform.OS === 'android',
  keyboardShouldPersistTaps: 'handled' as const,
  scrollEventThrottle: 32,
} as const;

/**
 * Safe defaults for ordinary ScrollViews. Heavy/high-cardinality choices should
 * still use FlatList + VIRTUAL_LIST_PERF_PROPS instead of mapping every item.
 */
export const SMOOTH_SCROLL_VIEW_PROPS = {
  keyboardShouldPersistTaps: 'handled' as const,
  nestedScrollEnabled: true,
  scrollEventThrottle: 32,
  showsVerticalScrollIndicator: false,
} as const;
