
import React from 'react';

export const LoadingSkeleton = () => (
  <div className="min-h-screen bg-zinc-900 p-6">
    <div className="animate-pulse space-y-6">
      <div className="h-8 bg-zinc-800 rounded w-1/3"></div>
      <div className="h-64 bg-zinc-800 rounded"></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="h-32 bg-zinc-800 rounded"></div>
        <div className="h-32 bg-zinc-800 rounded"></div>
        <div className="h-32 bg-zinc-800 rounded"></div>
        <div className="h-32 bg-zinc-800 rounded"></div>
      </div>
      <div className="h-96 bg-zinc-800 rounded"></div>
    </div>
  </div>
);
