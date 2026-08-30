import { useEffect } from 'react';
import { Platform } from 'react-native';

export function WebPwaBootstrap() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const nav = (globalThis as any).navigator;
    if (!nav?.serviceWorker || !(globalThis as any).isSecureContext) return;

    let disposed = false;
    nav.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration: any) => {
        if (disposed) return;
        registration.update().catch(() => null);
      })
      .catch((error: unknown) => {
        console.warn('Trainer Collection PWA registration failed:', error);
      });

    return () => {
      disposed = true;
    };
  }, []);

  return null;
}
