'use client';

import Image from 'next/image';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const titleFont: React.CSSProperties = {
  fontFamily: "'DM Sans', system-ui, sans-serif",
  fontWeight: 900,
  letterSpacing: '-0.03em',
};

type ImageSpec = { src: string; alt: string; width: number; height: number; scale?: number };

type Slide =
  | { id: string; title: string; kind: 'single'; image: ImageSpec }
  | { id: string; title: string; kind: 'overlap'; back: ImageSpec; front: ImageSpec };

const SLIDES: Slide[] = [
  {
    id: 'todo',
    title: "Streamline your team's to do list",
    kind: 'single',
    image: { src: '/to-do-list.png', alt: 'Action points and to-do list', width: 1500, height: 838 },
  },
  {
    id: 'analytics',
    title: "Your client's performance — displayed in a live portal",
    kind: 'overlap',
    back: { src: '/ga4-graph.png', alt: 'GA4 engagement breakdown', width: 2216, height: 1118 },
    front: { src: '/funnel.png', alt: 'Conversion funnel', width: 2114, height: 1218 },
  },
  {
    id: 'timeline',
    title: 'See every campaign on one shared timeline',
    kind: 'single',
    image: { src: '/timeline.png', alt: 'Campaign timeline', width: 1450, height: 1030 },
  },
  {
    id: 'media-plan',
    title: 'Connect your media plan & track activity',
    kind: 'single',
    image: { src: '/media-plan.png', alt: 'Media plan grid', width: 2622, height: 956, scale: 1 },
  },
  {
    id: 'performance',
    title: 'All your performance data, in real time',
    kind: 'single',
    image: { src: '/performance.png', alt: 'Performance dashboard', width: 1858, height: 798 },
  },
];

const INTERVAL_MS = 3600;
const DEFAULT_SINGLE_SCALE = 1;

export default function HeroWalkthroughSlideshow() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const slide = SLIDES[index];
  const imageScale = slide.kind === 'single' ? (slide.image.scale ?? DEFAULT_SINGLE_SCALE) : 1;

  return (
    <div
      className="relative w-full h-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <style>{`
        @keyframes heroSlideProgress {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>

      <div className="absolute top-0 left-0 right-0 h-[3px] z-20" style={{ background: 'rgba(28,25,23,0.08)' }}>
        <div
          key={slide.id}
          onAnimationEnd={() => setIndex((i) => (i + 1) % SLIDES.length)}
          className="h-full w-full"
          style={{
            background: '#1D4ED8',
            transformOrigin: 'left',
            animation: `heroSlideProgress ${INTERVAL_MS}ms linear forwards`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={slide.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 flex flex-col p-6 md:p-10"
        >
          <h3
            className="text-xl md:text-3xl lg:text-[2.25rem] leading-[1.05] mb-4 md:mb-6 shrink-0 text-center"
            style={{ color: '#1C1917', ...titleFont }}
          >
            {slide.title}
          </h3>

          <div className="relative flex-1 min-h-0 flex items-center justify-center">
            {slide.kind === 'single' ? (
              <div
                className="flex items-center justify-center"
                style={{ width: `${imageScale * 100}%`, height: `${imageScale * 100}%` }}
              >
                <Image
                  src={slide.image.src}
                  alt={slide.image.alt}
                  width={slide.image.width}
                  height={slide.image.height}
                  className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg"
                  style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.10)' }}
                  priority={index === 0}
                />
              </div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center">
                <div className="relative" style={{ width: '100%', height: '100%' }}>
                  <div
                    className="absolute rounded-lg overflow-hidden"
                    style={{
                      top: '4%',
                      left: '2%',
                      width: '58%',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.10)',
                      border: '1px solid rgba(232,228,220,0.7)',
                    }}
                  >
                    <Image
                      src={slide.back.src}
                      alt={slide.back.alt}
                      width={slide.back.width}
                      height={slide.back.height}
                      className="w-full h-auto"
                    />
                  </div>
                  <div
                    className="absolute rounded-lg overflow-hidden"
                    style={{
                      bottom: '4%',
                      right: '4%',
                      width: '46%',
                      boxShadow: '0 14px 34px rgba(0,0,0,0.18)',
                      border: '1px solid rgba(232,228,220,0.9)',
                    }}
                  >
                    <Image
                      src={slide.front.src}
                      alt={slide.front.alt}
                      width={slide.front.width}
                      height={slide.front.height}
                      className="w-full h-auto"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => setIndex(i)}
            className="rounded-full transition-all"
            style={{
              width: i === index ? 16 : 6,
              height: 6,
              background: i === index ? '#1D4ED8' : '#E8E4DC',
            }}
          />
        ))}
      </div>
    </div>
  );
}
