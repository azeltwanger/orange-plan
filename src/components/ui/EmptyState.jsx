import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Empty state component with icon, message, and action button
 * @param {React.Component} icon - Lucide icon component
 * @param {string} title - Main heading
 * @param {string} description - Supporting text
 * @param {string} actionText - Button text
 * @param {function} onAction - Button click handler
 * @param {string} className - Additional classes
 */
export default function EmptyState({ icon: Icon, title, description, actionText, onAction, className }) {
  return (
    <div className={cn("card-premium rounded-2xl p-12 lg:p-16 text-center border border-zinc-800/50 animate-in fade-in-0 duration-300", className)}>
      <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-2xl bg-zinc-800/50 mx-auto flex items-center justify-center mb-6">
        <Icon className="w-8 h-8 lg:w-10 lg:h-10 text-zinc-500" aria-hidden="true" />
      </div>
      <h3 className="text-xl font-semibold mb-2 text-zinc-200">{title}</h3>
      {description && <p className="text-zinc-500 mb-6 max-w-sm mx-auto">{description}</p>}
      {actionText && onAction && (
        <Button 
          onClick={onAction} 
          className="brand-gradient text-white font-semibold shadow-lg shadow-orange-500/20 transition-transform active:scale-[0.98] hover:shadow-xl"
        >
          {actionText}
        </Button>
      )}
    </div>
  );
}