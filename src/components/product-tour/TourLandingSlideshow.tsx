'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TOUR_SECTIONS, TOUR_SLIDES_FLAT, getSectionFirstFlatIndex } from '@/lib/product-tour/tour-content';
import TourSlideContent from './TourSlideContent';

export default function TourLandingSlideshow() {
  const [activeIndex, setActiveIndex] = useState(0);

  const current = TOUR_SLIDES_FLAT[activeIndex];
  const totalSlides = TOUR_SLIDES_FLAT.length;
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === totalSlides - 1;

  return (
    <div className={`mx-auto transition-[max-width] duration-200 ${current.slide.media ? 'max-w-6xl' : 'max-w-xl'}`}>
      <div
        className="p-6 md:p-8 rounded-[18px]"
        style={{
          background: '#FDFCF8',
          border: '1px solid rgba(232,228,220,0.7)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)',
        }}
      >
        <div className="flex items-center justify-center gap-2 flex-wrap mb-4">
          {TOUR_SECTIONS.map((section) => {
            const active = section.id === current.section.id;
            return (
              <Button
                key={section.id}
                type="button"
                variant={active ? 'default' : 'outline'}
                size="sm"
                style={
                  active
                    ? { background: section.accentColor, borderColor: section.accentColor }
                    : { borderColor: section.accentColor, color: section.accentColor }
                }
                onClick={() => setActiveIndex(getSectionFirstFlatIndex(section.id))}
              >
                {section.label}
              </Button>
            );
          })}
        </div>

        <p
          className="text-xs text-center mb-2"
          style={{ color: '#8A8578', fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          Step {activeIndex + 1} of {totalSlides} — {current.section.label}
        </p>

        <TourSlideContent slide={current.slide} accentColor={current.section.accentColor} variant="landing" />

        <div className="flex items-center justify-center gap-3 mt-4">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Previous slide"
            disabled={isFirst}
            onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1.5 flex-wrap justify-center max-w-xs">
            {TOUR_SLIDES_FLAT.map((entry, i) => (
              <button
                key={entry.slide.id}
                type="button"
                aria-label={`Go to slide ${i + 1}: ${entry.slide.title}`}
                onClick={() => setActiveIndex(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === activeIndex ? 16 : 6,
                  height: 6,
                  background: i === activeIndex ? entry.section.accentColor : '#E8E4DC',
                  marginLeft: entry.slideIndexInSection === 0 && i !== 0 ? 6 : 0,
                }}
              />
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Next slide"
            disabled={isLast}
            onClick={() => setActiveIndex((i) => Math.min(totalSlides - 1, i + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="text-center mt-6">
        <Link href="/auth/signup">
          <Button variant="outline" size="lg" className="text-base px-8 py-5 h-auto">
            Get started free
          </Button>
        </Link>
      </div>
    </div>
  );
}
