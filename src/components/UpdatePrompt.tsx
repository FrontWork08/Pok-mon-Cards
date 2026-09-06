import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';

const FOREGROUND_CHECK_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Background OTA bootstrap.
 *
 * Important: this component intentionally renders no modal. Updates are checked
 * and downloaded silently so an APK-upgrade gate can never prevent a newer OTA
 * bundle for the same runtime from being received.
 */
export function UpdatePrompt() {
  const checkingRef = useRef(false);
  const reloadingRef = useRef(false);
  const lastCheckRef = useRef(0);
  const firstBootRef = useRef(true);

  const canUseUpdates = Platform.OS !== 'web' && !__DEV__ && Updates.isEnabled;

  useEffect(() => {
    if (!canUseUpdates) return;

    let disposed = false;

    const checkAndFetch = async (reloadWhenFetched: boolean) => {
      if (checkingRef.current || reloadingRef.current) return;

      const now = Date.now();
      if (!reloadWhenFetched && now - lastCheckRef.current < FOREGROUND_CHECK_COOLDOWN_MS) return;

      checkingRef.current = true;
      lastCheckRef.current = now;

      try {
        const result = await Updates.checkForUpdateAsync();
        if (disposed || (!result.isAvailable && !result.isRollBackToEmbedded)) return;

        const fetched = await Updates.fetchUpdateAsync();
        if (disposed) return;

        if (
          reloadWhenFetched
          && (fetched.isNew || fetched.isRollBackToEmbedded)
          && AppState.currentState === 'active'
        ) {
          reloadingRef.current = true;
          await Updates.reloadAsync();
        }
      } catch (error) {
        // OTA must never block app startup. The embedded/cached bundle remains
        // usable and a future launch/foreground check will retry automatically.
        console.warn('Background OTA update failed:', error);
      } finally {
        checkingRef.current = false;
      }
    };

    // Run before normal overlays have time to become the user's next action.
    const bootstrapTimer = setTimeout(() => {
      void checkAndFetch(true);
      firstBootRef.current = false;
    }, 250);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      void checkAndFetch(firstBootRef.current);
      firstBootRef.current = false;
    });

    return () => {
      disposed = true;
      clearTimeout(bootstrapTimer);
      subscription.remove();
    };
  }, [canUseUpdates]);

  return null;
}
