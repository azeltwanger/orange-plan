import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Animated skeleton loading state
 * @param {number} rows - Number of skeleton rows
 * @param {string} className - Additional classes
 */
export default function LoadingSkeleton({ rows = 3, className }) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card-premium rounded-xl p-6 animate-pulse border border-zinc-800/50">
          <div className="h-6 bg-zinc-700 rounded w-3/4 mb-3" />
          <div className="h-4 bg-zinc-800 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}