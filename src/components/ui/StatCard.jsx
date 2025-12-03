import React from 'react';
import { cn } from "@/lib/utils";

export default function StatCard({ 
  label, 
  value, 
  subValue, 
  icon: Icon, 
  trend, 
  trendValue,
  className 
}) {
  return (
    <div className={cn("card-glass rounded-xl p-5", className)}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
        {Icon && (
          <div className="p-2 rounded-lg bg-zinc-800/50">
            <Icon className="w-4 h-4 text-zinc-400" />
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-zinc-100">{value}</p>
      {subValue && (
        <p className="text-sm text-zinc-500 mt-1">{subValue}</p>
      )}
      {trend !== undefined && (
        <div className={cn(
          "flex items-center gap-1 mt-2 text-sm font-medium",
          trend >= 0 ? "text-emerald-400" : "text-rose-400"
        )}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trendValue || trend)}%
        </div>
      )}
    </div>
  );
}