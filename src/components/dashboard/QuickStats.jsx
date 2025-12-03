import React from 'react';
import { ArrowUpRight, ArrowDownRight, Wallet, PiggyBank, AlertTriangle, Shield, TrendingUp } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function QuickStats({ 
  monthlyIncome, 
  monthlyExpenses, 
  dcaProgress, 
  liabilityRatio,
  securityScore 
}) {
  const surplus = monthlyIncome - monthlyExpenses;
  const savingsRate = monthlyIncome > 0 ? (surplus / monthlyIncome) * 100 : 0;

  const stats = [
    {
      label: 'Monthly Inflow',
      value: `$${monthlyIncome.toLocaleString()}`,
      icon: ArrowUpRight,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-400/10',
      borderColor: 'border-emerald-400/20',
    },
    {
      label: 'Monthly Outflow',
      value: `$${monthlyExpenses.toLocaleString()}`,
      icon: ArrowDownRight,
      color: 'text-rose-400',
      bgColor: 'bg-rose-400/10',
      borderColor: 'border-rose-400/20',
    },
    {
      label: 'Stacking Power',
      value: `$${Math.abs(surplus).toLocaleString()}`,
      subtext: surplus >= 0 ? `${savingsRate.toFixed(0)}% rate` : 'Deficit',
      icon: surplus >= 0 ? TrendingUp : AlertTriangle,
      color: surplus >= 0 ? 'text-orange-400' : 'text-rose-400',
      bgColor: surplus >= 0 ? 'bg-orange-400/10' : 'bg-rose-400/10',
      borderColor: surplus >= 0 ? 'border-orange-400/20' : 'border-rose-400/20',
      prefix: surplus >= 0 ? '+' : '-',
    },
    {
      label: 'Security Score',
      value: `${securityScore}/10`,
      subtext: securityScore >= 7 ? 'Excellent' : securityScore >= 4 ? 'Review needed' : 'At risk',
      icon: Shield,
      color: securityScore >= 7 ? 'text-emerald-400' : securityScore >= 4 ? 'text-amber-400' : 'text-rose-400',
      bgColor: securityScore >= 7 ? 'bg-emerald-400/10' : securityScore >= 4 ? 'bg-amber-400/10' : 'bg-rose-400/10',
      borderColor: securityScore >= 7 ? 'border-emerald-400/20' : securityScore >= 4 ? 'border-amber-400/20' : 'border-rose-400/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <div key={index} className={cn(
          "card-premium rounded-xl p-5 border transition-all duration-300 hover:scale-[1.02]",
          stat.borderColor
        )}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">{stat.label}</span>
            <div className={cn("p-2 rounded-lg", stat.bgColor)}>
              <stat.icon className={cn("w-4 h-4", stat.color)} />
            </div>
          </div>
          <p className={cn("text-2xl font-bold", stat.color)}>
            {stat.prefix}{stat.value}
          </p>
          {stat.subtext && (
            <p className="text-xs text-zinc-500 mt-1">{stat.subtext}</p>
          )}
        </div>
      ))}
    </div>
  );
}