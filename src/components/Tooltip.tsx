'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export default function Tooltip({ children, content, position = 'bottom' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      let top = 0;
      let left = 0;

      switch (position) {
        case 'top':
          top = -tooltipRect.height - 8;
          left = (triggerRect.width - tooltipRect.width) / 2;
          break;
        case 'bottom':
          top = triggerRect.height + 8;
          left = (triggerRect.width - tooltipRect.width) / 2;
          break;
        case 'left':
          top = (triggerRect.height - tooltipRect.height) / 2;
          left = -tooltipRect.width - 8;
          break;
        case 'right':
          top = (triggerRect.height - tooltipRect.height) / 2;
          left = triggerRect.width + 8;
          break;
      }

      setCoords({ top, left });
    }
  }, [isVisible, position]);

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          ref={tooltipRef}
          className="absolute z-50 px-2.5 py-1.5 text-xs font-medium text-white bg-zinc-800 dark:bg-zinc-700 rounded-lg shadow-lg whitespace-nowrap pointer-events-none"
          style={{ top: coords.top, left: coords.left }}
        >
          {content}
          <div
            className={`absolute w-2 h-2 bg-zinc-800 dark:bg-zinc-700 rotate-45 ${
              position === 'bottom' ? '-top-1 left-1/2 -translate-x-1/2' :
              position === 'top' ? '-bottom-1 left-1/2 -translate-x-1/2' :
              position === 'left' ? 'top-1/2 -right-1 -translate-y-1/2' :
              'top-1/2 -left-1 -translate-y-1/2'
            }`}
          />
        </div>
      )}
    </div>
  );
}
