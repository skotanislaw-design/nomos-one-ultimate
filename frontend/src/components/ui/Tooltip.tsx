import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  title: string;
  description: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function Tooltip({ title, description, children, icon, className = '' }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top - 10 });
  }, [show]);

  return (
    <div className="relative inline-block">
      <div
        ref={ref}
        onClick={() => setShow(!show)}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className={`cursor-help inline-flex items-center gap-1 ${className}`}
      >
        {children}
        {icon || <HelpCircle size={14} className="text-[#5a7a9a] hover:text-[#8aa0b8] transition-colors" />}
      </div>

      {show && (
        <div
          ref={tooltipRef}
          className="fixed z-50 max-w-xs bg-[#0d2035] border border-[#1a3a5c] rounded-lg shadow-lg p-3"
          style={{
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="text-xs font-bold text-[#C6A75E] mb-1">{title}</p>
          <p className="text-xs text-[#8aa0b8] leading-relaxed">{description}</p>
          <div className="absolute w-2 h-2 bg-[#0d2035] border-r border-b border-[#1a3a5c] transform rotate-45"
            style={{ left: '50%', bottom: '-5px', marginLeft: '-4px' }} />
        </div>
      )}
    </div>
  );
}
