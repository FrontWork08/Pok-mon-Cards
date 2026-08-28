export function goBackOrHome(
  router: {
    back: () => void;
    replace: (href: any) => void;
    canGoBack?: () => boolean;
  },
  fallback: any = '/(tabs)',
) {
  try {
    if (typeof router.canGoBack === 'function' && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // Fall through to a deterministic route.
  }
  router.replace(fallback);
}
