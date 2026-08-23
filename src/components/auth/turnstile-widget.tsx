'use client';

import { useEffect, useId, useRef } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
          'error-callback': () => void;
        }
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

// Bot protection for the signup/login forms. Renders nothing if no site key
// is configured (e.g. local dev before Turnstile is set up).
export function TurnstileWidget({ onVerify }: { onVerify: (token: string | null) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerId = useId();
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !window.turnstile) return;
    const container = document.getElementById(containerId);
    if (!container || widgetIdRef.current) return;

    widgetIdRef.current = window.turnstile.render(container, {
      sitekey: siteKey,
      callback: (token: string) => onVerify(token),
      'expired-callback': () => onVerify(null),
      'error-callback': () => onVerify(null),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, containerId]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (!window.turnstile || widgetIdRef.current) return;
          const container = document.getElementById(containerId);
          if (!container) return;
          widgetIdRef.current = window.turnstile.render(container, {
            sitekey: siteKey,
            callback: (token: string) => onVerify(token),
            'expired-callback': () => onVerify(null),
            'error-callback': () => onVerify(null),
          });
        }}
      />
      <div id={containerId} />
    </>
  );
}
