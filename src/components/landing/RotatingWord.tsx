'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export function RotatingWord({
  words,
  intervalMs = 2400,
  className,
  color = '#4A7C59',
}: {
  words: string[];
  intervalMs?: number;
  className?: string;
  color?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (words.length < 2) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % words.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [words.length, intervalMs]);

  return (
    <span
      className={className}
      style={{ display: 'inline-grid', verticalAlign: 'bottom', color }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={words[index]}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ gridArea: '1 / 1' }}
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
