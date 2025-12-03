import React from 'react';
import { TrendingUp, Zap } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function NetWorthCard({ totalAssets, totalLiabilities, btcHoldings, btcPrice }) {
  const netWorth = totalAssets - totalLiabilities;
  const btcValue = btcHoldings * btcPrice;
  const btcPercentage = totalAssets > 0 ? (btcValue / totalAssets) * 100 : 0;

  return (
    <div className="relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute -top-20 -right-20 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-orange-500/5 rounded-full blur-3xl" />
      
      <div className="relative card-premium rounded-2xl p-8 lg:p-10 glow-orange">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot" />
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Total Net Worth</p>
            </div>
            <h1 className="text-5xl lg:text-6xl font-bold tracking-tight brand-gradient-text">
              ${netWorth.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </h1>
            <div className="flex items-center gap-6 mt-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-zinc-400">Assets</span>
                <span className="text-sm font-semibold text-zinc-200">${totalAssets.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-sm text-zinc-400">Debt</span>
                <span className="text-sm font-semibold text-zinc-200">${totalLiabilities.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start lg:items-end gap-4">
            <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
              <Zap className="w-5 h-5 text-orange-400" />
              <div>
                <p className="text-2xl font-bold text-orange-400">{btcHoldings.toFixed(8)}</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Bitcoin Stack</p>
              </div>
            </div>
            <p className="text-sm text-zinc-500">
              <span className="text-orange-400 font-semibold">{btcPercentage.toFixed(1)}%</span> allocation to Bitcoin
            </p>
          </div>
        </div>

        {/* BTC Allocation Bar */}
        <div className="mt-8">
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full brand-gradient rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${btcPercentage}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}