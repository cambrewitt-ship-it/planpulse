'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  TOUR_SLIDES_FLAT,
  CLIENT_ID_PLACEHOLDER,
  getTourTargetSelector,
} from '@/lib/product-tour/tour-content';
import { markTourSeen } from '@/lib/product-tour/tour-storage';
import TourSlideContent from './TourSlideContent';

// Bounding box spanning every matched element, so a single `data-tour-id` shared
// across several nodes (e.g. a search bar plus a handful of cards) spotlights all of them at once.
function getUnionRect(elements: HTMLElement[]): DOMRect {
  const rects = elements.map((el) => el.getBoundingClientRect());
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

interface ProductTourSpotlightProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CALLOUT_WIDTH = 360;
const MEDIA_CALLOUT_WIDTH = CALLOUT_WIDTH * 2;
const SPOTLIGHT_PADDING = 8;
const POLL_INTERVAL_MS = 150;
const POLL_TIMEOUT_MS = 3000;

export default function ProductTourSpotlight({ open, onOpenChange }: ProductTourSpotlightProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [targetFound, setTargetFound] = useState<boolean | null>(null); // null = resolving

  const clientIdRef = useRef<string | null>(null); // set once a lookup succeeds; failures are never cached

  // Reset to slide 1 every time the tour is (re)opened — adjusted during render
  // (not an effect) per React's guidance for resetting state on a prop change.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setCurrentIndex(0);
  }

  const current = TOUR_SLIDES_FLAT[currentIndex];
  const totalSlides = TOUR_SLIDES_FLAT.length;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalSlides - 1;

  const handleClose = () => {
    markTourSeen();
    onOpenChange(false);
  };

  const handleFinish = () => {
    handleClose();
    router.push('/agency');
  };

  // Resolve + navigate + locate the current step's target element.
  useEffect(() => {
    if (!open || !current) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    async function resolveClientId(): Promise<string | null> {
      // Only ever cache a *successful* lookup. Caching a failure (a 401 from
      // the session not being hydrated yet, a network blip, etc.) would
      // permanently short-circuit this to null for the rest of the page's
      // lifetime — silently breaking every client-dashboard step of the tour
      // with no retry and no visible error.
      if (clientIdRef.current) return clientIdRef.current;
      try {
        const res = await fetch('/api/agency/clients');
        if (!res.ok) return null;
        const data = await res.json();
        const id = data?.clients?.[0]?.id ?? null;
        if (id) clientIdRef.current = id;
        return id;
      } catch {
        return null;
      }
    }

    async function run() {
      setTargetFound(null);
      setTargetRect(null);

      if (current.slide.media) {
        // Static screenshot/video slide — no live page to navigate to or spotlight.
        setTargetFound(true);
        return;
      }

      let route = current.section.route;
      if (route.includes(CLIENT_ID_PLACEHOLDER)) {
        const id = await resolveClientId();
        if (cancelled) return;
        if (!id) {
          setTargetFound(false); // no clients yet — fall back to a descriptive card, no navigation
          return;
        }
        route = route.replace(CLIENT_ID_PLACEHOLDER, id);
      }

      if (pathname !== route) {
        router.push(route);
        return; // effect re-runs once `pathname` updates
      }

      const selector = getTourTargetSelector(current.slide.id);
      const deadline = Date.now() + POLL_TIMEOUT_MS;

      const poll = () => {
        if (cancelled) return;
        const els = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
        if (els.length > 0) {
          els[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            if (cancelled) return;
            setTargetRect(getUnionRect(els));
            setTargetFound(true);
          }, 350);
          return;
        }
        if (Date.now() > deadline) {
          setTargetFound(false);
          return;
        }
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
      };
      poll();
    }

    run();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [open, currentIndex, pathname, current, router]);

  // Keep the spotlight aligned to its target on resize.
  useEffect(() => {
    if (!open || !targetFound || !current || current.slide.media) return;
    const reposition = () => {
      const els = Array.from(document.querySelectorAll(getTourTargetSelector(current.slide.id))) as HTMLElement[];
      if (els.length > 0) setTargetRect(getUnionRect(els));
    };
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [open, targetFound, current]);

  // Lock background scroll while the tour is open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Escape closes the tour.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        markTourSeen();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  if (!open || !current || typeof document === 'undefined') return null;

  const calloutStyle = computeCalloutStyle(
    targetFound ? targetRect : null,
    current.slide.media ? MEDIA_CALLOUT_WIDTH : CALLOUT_WIDTH
  );

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} role="presentation">
      {/* Backdrop — also serves as the spotlight cutout when a target is found */}
      {targetFound && targetRect ? (
        <div
          onClick={handleClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
          }}
        >
          <div
            style={{
              position: 'fixed',
              top: targetRect.top - SPOTLIGHT_PADDING,
              left: targetRect.left - SPOTLIGHT_PADDING,
              width: targetRect.width + SPOTLIGHT_PADDING * 2,
              height: targetRect.height + SPOTLIGHT_PADDING * 2,
              borderRadius: 12,
              boxShadow: '0 0 0 9999px rgba(28,25,23,0.68)',
              border: `2px solid ${current.section.accentColor}`,
              pointerEvents: 'none',
              transition: 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease',
            }}
          />
        </div>
      ) : (
        <div
          onClick={handleClose}
          style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(28,25,23,0.68)' }}
        />
      )}

      {/* Callout */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Product tour"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...calloutStyle,
          zIndex: 9999,
          background: '#FDFCF8',
          border: '1px solid rgba(232,228,220,0.9)',
          borderRadius: 18,
          boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
          padding: 20,
        }}
      >
        <p
          className="text-xs text-center mb-2"
          style={{ color: '#8A8578', fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          Step {currentIndex + 1} of {totalSlides}
        </p>
        <Progress value={((currentIndex + 1) / totalSlides) * 100} className="mb-1" />

        {targetFound === null ? (
          <div className="py-8 text-center text-sm" style={{ color: '#8A8578' }}>
            Loading…
          </div>
        ) : (
          <TourSlideContent slide={current.slide} accentColor={current.section.accentColor} variant="modal" />
        )}

        <div className="flex items-center justify-between mt-3">
          <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isFirst}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            >
              Prev
            </Button>
            {isLast ? (
              <Button type="button" size="sm" onClick={handleFinish}>
                Finish
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={() => setCurrentIndex((i) => Math.min(totalSlides - 1, i + 1))}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Generous upper-bound estimate of the callout's rendered height, used only to
// decide whether "below" or "above" the target has more room. The callout's
// actual max height is always clamped to available viewport space (with its
// own scrollbar as a fallback), so a spotlighted target that spans most of
// the viewport (e.g. a full-height panel) can never push the callout off-screen.
const ESTIMATED_CALLOUT_HEIGHT = 420;

function computeCalloutStyle(rect: DOMRect | null, calloutWidth: number = CALLOUT_WIDTH): CSSProperties {
  const margin = 16;

  if (!rect || typeof window === 'undefined') {
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: calloutWidth,
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: 'calc(100vh - 32px)',
      overflowY: 'auto',
    };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(calloutWidth, vw - margin * 2);

  // Always keep the callout's top edge within the viewport, leaving at least
  // ~160px below it for content even in the worst case.
  const clampTop = (desiredTop: number) =>
    Math.min(Math.max(desiredTop, margin), Math.max(margin, vh - margin - 160));

  // Prefer placing the callout beside the target (right, then left) so it
  // doesn't cover a target that's tall relative to the viewport — falling
  // back to above/below only when there's no horizontal room.
  const spaceRight = vw - rect.right;
  const spaceLeft = rect.left;
  const sideTop = clampTop(rect.top);

  if (spaceRight >= width + margin) {
    return {
      position: 'fixed',
      top: sideTop,
      left: rect.right + margin,
      width,
      maxHeight: `calc(100vh - ${sideTop + margin}px)`,
      overflowY: 'auto',
    };
  }

  if (spaceLeft >= width + margin) {
    return {
      position: 'fixed',
      top: sideTop,
      left: rect.left - margin - width,
      width,
      maxHeight: `calc(100vh - ${sideTop + margin}px)`,
      overflowY: 'auto',
    };
  }

  const left = Math.min(Math.max(rect.left, margin), vw - width - margin);

  const spaceBelow = vh - rect.bottom;
  const desiredTop = spaceBelow >= rect.top
    ? rect.bottom + margin
    : rect.top - margin - ESTIMATED_CALLOUT_HEIGHT;

  const top = clampTop(desiredTop);

  return {
    position: 'fixed',
    top,
    left,
    width,
    maxHeight: `calc(100vh - ${top + margin}px)`,
    overflowY: 'auto',
  };
}
