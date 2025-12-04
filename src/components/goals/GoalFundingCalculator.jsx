import React, { useMemo } from 'react';
import { Calculator, TrendingUp, Calendar } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function GoalFundingCalculator({ 
  targetAmount, 
  currentAmount, 
  targetDate, 
  fundingSources = [],
  userSettings = {}
}) {
  const calculation = useMemo(() => {
    if (!targetAmount || !targetDate) return null;
    
    const remaining = (targetAmount || 0) - (currentAmount || 0);
    if (remaining <= 0) return { needed: 0, monthsRemaining: 0, monthlySaving: 0, message: 'Goal achieved!' };
    
    const today = new Date();
    const target = new Date(targetDate);
    const monthsRemaining = Math.max(1, Math.ceil((target - today) / (1000 * 60 * 60 * 24 * 30)));
    
    // Calculate weighted average return from funding sources
    let weightedReturn = 0;
    if (fundingSources && fundingSources.length > 0) {
      const totalPercent = fundingSources.reduce((sum, s) => sum + (s.percentage || 0), 0);
      if (totalPercent > 0) {
        weightedReturn = fundingSources.reduce((sum, s) => {
          const returnRate = s.expected_return ?? getDefaultReturn(s.asset_type, userSettings);
          return sum + ((s.percentage || 0) / totalPercent) * returnRate;
        }, 0);
      }
    }
    
    // Calculate monthly saving needed with compound growth
    // PMT = FV * (r/12) / ((1 + r/12)^n - 1)
    const monthlyRate = (weightedReturn / 100) / 12;
    let monthlySaving;
    
    if (monthlyRate > 0) {
      const factor = Math.pow(1 + monthlyRate, monthsRemaining) - 1;
      monthlySaving = remaining * monthlyRate / factor;
    } else {
      monthlySaving = remaining / monthsRemaining;
    }
    
    // Also calculate without returns for comparison
    const monthlySavingNoReturns = remaining / monthsRemaining;
    const savingsFromReturns = monthlySavingNoReturns - monthlySaving;
    
    return {
      needed: remaining,
      monthsRemaining,
      yearsRemaining: (monthsRemaining / 12).toFixed(1),
      monthlySaving: Math.max(0, monthlySaving),
      monthlySavingNoReturns,
      savingsFromReturns: Math.max(0, savingsFromReturns),
      weightedReturn,
      projectedGrowth: weightedReturn > 0 ? (monthlySaving * monthsRemaining * (weightedReturn / 100) * (monthsRemaining / 24)) : 0
    };
  }, [targetAmount, currentAmount, targetDate, fundingSources, userSettings]);

  if (!calculation) {
    return (
      <div className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/50">
        <p className="text-sm text-zinc-500 text-center">
          Add a target date to see monthly saving needed
        </p>
      </div>
    );
  }

  if (calculation.needed <= 0) {
    return (
      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <div className="flex items-center gap-2 text-emerald-400">
          <TrendingUp className="w-5 h-5" />
          <span className="font-semibold">Goal Achieved! 🎉</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-4 h-4 text-orange-400" />
        <span className="text-sm font-medium text-orange-400">Saving Calculator</span>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-zinc-500">Remaining</p>
          <p className="text-lg font-bold text-zinc-200">
            ${calculation.needed.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Time Left</p>
          <p className="text-lg font-bold text-zinc-200">
            {calculation.yearsRemaining > 1 
              ? `${calculation.yearsRemaining} yrs` 
              : `${calculation.monthsRemaining} mo`}
          </p>
        </div>
      </div>
      
      <div className="mt-4 p-3 rounded-lg bg-orange-500/10">
        <p className="text-xs text-zinc-400 mb-1">Monthly saving needed</p>
        <p className="text-2xl font-bold text-orange-400">
          ${calculation.monthlySaving.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          <span className="text-sm font-normal text-zinc-500">/mo</span>
        </p>
        
        {calculation.weightedReturn > 0 && calculation.savingsFromReturns > 0 && (
          <p className="text-xs text-emerald-400 mt-1">
            Saves ${calculation.savingsFromReturns.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo vs. no returns ({calculation.weightedReturn.toFixed(1)}% avg return)
          </p>
        )}
      </div>
    </div>
  );
}

function getDefaultReturn(assetType, userSettings) {
  const type = (assetType || '').toLowerCase();
  if (type === 'btc' || type === 'bitcoin' || type === 'crypto') {
    return userSettings.btc_cagr_assumption || 25;
  }
  if (type === 'stocks' || type === 'etf' || type === 'stock') {
    return userSettings.stocks_cagr || 7;
  }
  if (type === 'bonds' || type === 'bond') {
    return userSettings.bonds_cagr || 3;
  }
  if (type === 'real_estate' || type === 'real estate') {
    return userSettings.real_estate_cagr || 4;
  }
  // Cash/savings
  return 2;
}