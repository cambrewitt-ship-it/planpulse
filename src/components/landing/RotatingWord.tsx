'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export function RotatingWord({
  words,
  intervalMs = 3000,
  className,
  color = '#4A7C59',
  gradient,
}: {
  words: string[];
  intervalMs?: number;
  className?: string;
  color?: string;
  gradient?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (words.length < 2) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % words.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [words.length, intervalMs]);

  const textStyle: React.CSSProperties = gradient
    ? {
        backgroundImage: gradient,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }
    : { color };

  return (
    <span
      className={className}
      style={{ display: 'inline-grid', verticalAlign: 'bottom', lineHeight: 1.2, paddingBottom: '0.1em' }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={words[index]}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ gridArea: '1 / 1', ...textStyle }}
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
