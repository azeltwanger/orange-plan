import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * User-friendly error message component
 * @param {string} message - Error message to display
 * @param {function} onRetry - Optional retry callback
 * @param {string} className - Additional classes
 */
export default function ErrorMessage({ message = "Something went wrong", onRetry, className }) {
  return (
    <div className={cn("card-premium rounded-2xl p-8 border border-rose-500/20 bg-rose-500/5 text-center", className)}>
      <div className="w-16 h-16 rounded-2xl bg-rose-500/10 mx-auto flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-rose-400" />
      </div>
      <p className="text-zinc-300 mb-4">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="bg-transparent border-rose-500/50 text-rose-400 hover:bg-rose-500/10">
          Try Again
        </Button>
      )}
    </div>
  );
}