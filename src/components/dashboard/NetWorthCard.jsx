import React from 'react';
import { TrendingUp, Zap } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function NetWorthCard({ totalAssets, totalLiabilities, btcHoldings, btcPrice, transactions = [] }) {
  const netWorth = totalAssets - totalLiabilities;
  const btcValue = btcHoldings * btcPrice;
  const btcPercentage = totalAssets > 0 ? (btcValue / totalAssets) * 100 : 0;

  // Calculate annualized return using Modified Dietz method (time-weighted)
  const calculateAnnualizedReturn = () => {
    const buyTxs = transactions.filter(t => t.type === 'buy' && t.asset_ticker === 'BTC');
    if (buyTxs.length === 0) return null;

    // Sort by date
    const sortedTxs = [...buyTxs].sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstDate = new Date(sortedTxs[0].date);
    const today = new Date();
    const totalDays = (today - firstDate) / (1000 * 60 * 60 * 24);
    
    if (totalDays < 1) return null;

    // Total invested (cost basis)
    const totalInvested = buyTxs.reduce((sum, t) => sum + (t.quantity * t.price_per_unit), 0);
    
    // Current value
    const currentValue = btcHoldings * btcPrice;
    
    if (totalInvested <= 0) return null;

    // Simple return
    const totalReturn = (currentValue - totalInvested) / totalInvested;
    
    // Annualize: (1 + total_return) ^ (365 / days) - 1
    const years = totalDays / 365;
    const annualizedReturn = years >= 1 
      ? (Math.pow(1 + totalReturn, 1 / years) - 1) * 100
      : totalReturn * 100; // For < 1 year, just show actual return

    return { annualizedReturn, years, totalReturn: totalReturn * 100 };
  };

  const returnData = calculateAnnualizedReturn();

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
            {returnData && (
              <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                <TrendingUp className={cn("w-4 h-4", returnData.annualizedReturn >= 0 ? "text-emerald-400" : "text-rose-400")} />
                <div className="text-right">
                  <p className={cn("text-lg font-bold", returnData.annualizedReturn >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {returnData.annualizedReturn >= 0 ? '+' : ''}{returnData.annualizedReturn.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    {returnData.years >= 1 ? 'Annualized' : 'Return'} ({returnData.years.toFixed(1)}y)
                  </p>
                </div>
              </div>
            )}
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