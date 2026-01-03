import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Centered loading spinner with optional text
 * @param {string} text - Optional loading message
 * @param {string} className - Additional classes
 */
export default function LoadingSpinner({ text, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 animate-in fade-in duration-300", className)}>
      <Loader2 className="w-8 h-8 text-orange-400 animate-spin mb-3" />
      {text && <p className="text-sm text-zinc-500">{text}</p>}
    </div>
  );
}