'use client';

import type { TourSlide } from '@/lib/product-tour/tour-content';

interface TourSlideContentProps {
  slide: TourSlide;
  accentColor: string;
  variant?: 'modal' | 'landing';
}

export default function TourSlideContent({ slide, accentColor, variant = 'modal' }: TourSlideContentProps) {
  const Icon = slide.icon;
  const badgeSize = variant === 'modal' ? 56 : 44;
  const iconSize = variant === 'modal' ? 26 : 20;
  const sideLayout = slide.media?.layout === 'side';

  const textBlock = (
    <>
      <h3
        className="text-lg font-semibold whitespace-pre-line"
        style={{ color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        {slide.title}
      </h3>
      <p
        className="text-sm leading-relaxed max-w-sm"
        style={{ color: '#8A8578', fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        {slide.description}
      </p>
    </>
  );

  const mediaBlock = slide.media && (
    <div
      className={`overflow-hidden rounded-lg ${slide.media.size === 'sm' ? 'w-full max-w-[280px] mx-auto' : 'w-full'}`}
      style={{ border: '1px solid rgba(232,228,220,0.9)' }}
    >
      {slide.media.type === 'video' ? (
        <video
          key={slide.media.src}
          src={slide.media.src}
          className="block w-full h-auto"
          autoPlay
          loop
          muted
          playsInline
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slide.media.src}
          alt={slide.title.replace(/\n/g, ' ')}
          className="block w-full h-auto"
        />
      )}
    </div>
  );

  if (sideLayout) {
    return (
      <div className="flex flex-col md:flex-row items-center gap-6 py-2">
        <div className="flex flex-col items-center md:items-start text-center md:text-left gap-3 md:w-2/5 shrink-0">
          {textBlock}
        </div>
        <div className="md:w-3/5">{mediaBlock}</div>
      </div>
    );
  }

  return (
    <div className="text-center flex flex-col items-center gap-3 py-2">
      {!slide.media && (
        <div
          className="rounded-lg flex items-center justify-center"
          style={{
            width: badgeSize,
            height: badgeSize,
            background: `${accentColor}1F`,
          }}
        >
          <Icon style={{ width: iconSize, height: iconSize, color: accentColor }} />
        </div>
      )}
      {textBlock}
      {mediaBlock}
    </div>
  );
}
