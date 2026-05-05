// useFullscreen — small hook around the Fullscreen API. Returns the current
// state and a toggle. Cleanly handles browser variations (webkitFullscreenElement
// for older Safari) and the case where the API is unavailable (file://, some
// embedded webviews) — in which case toggle is a no-op.

import { useCallback, useEffect, useState } from 'react';

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
}
interface FullscreenElement extends Element {
  webkitRequestFullscreen?: () => Promise<void>;
}

function getFullscreenElement(): Element | null {
  const d = document as FullscreenDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

function isFullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as FullscreenElement;
  return Boolean(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function useFullscreen(): {
  isFullscreen: boolean;
  supported: boolean;
  toggle: () => void;
} {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => !!getFullscreenElement());
  const supported = isFullscreenSupported();

  useEffect(() => {
    function onChange() { setIsFullscreen(!!getFullscreenElement()); }
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const toggle = useCallback(() => {
    if (!supported) return;
    const cur = getFullscreenElement();
    if (cur) {
      const d = document as FullscreenDocument;
      const exit = d.exitFullscreen?.bind(d) ?? d.webkitExitFullscreen?.bind(d);
      void exit?.();
    } else {
      const el = document.documentElement as FullscreenElement;
      const enter = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
      void enter?.();
    }
  }, [supported]);

  return { isFullscreen, supported, toggle };
}
