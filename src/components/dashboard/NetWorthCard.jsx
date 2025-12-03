import React from 'react';
import { TrendingUp, TrendingDown, Bitcoin } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function NetWorthCard({ totalAssets, totalLiabilities, btcHoldings, btcPrice }) {
  const netWorth = totalAssets - totalLiabilities;
  const btcValue = btcHoldings * btcPrice;
  const btcPercentage = totalAssets > 0 ? (btcValue / totalAssets) * 100 : 0;

  return (
    <div className="card-glass rounded-2xl p-6 lg:p-8 glow-amber">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div>
          <p className="text-sm text-zinc-400 mb-2 uppercase tracking-wider">Total Net Worth</p>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">
            ${netWorth.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </h1>
          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-sm text-zinc-400">Assets: ${totalAssets.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-rose-400" />
              <span className="text-sm text-zinc-400">Liabilities: ${totalLiabilities.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start lg:items-end gap-3">
          <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20">
            <Bitcoin className="w-5 h-5 text-amber-400" />
            <span className="text-amber-400 font-semibold">{btcHoldings.toFixed(4)} BTC</span>
          </div>
          <p className="text-sm text-zinc-500">
            {btcPercentage.toFixed(1)}% of portfolio in Bitcoin
          </p>
        </div>
      </div>

      {/* BTC Allocation Bar */}
      <div className="mt-6">
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className="h-full accent-gradient rounded-full transition-all duration-500"
            style={{ width: `${btcPercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}