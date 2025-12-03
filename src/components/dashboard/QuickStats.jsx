import React from 'react';
import { ArrowUpRight, ArrowDownRight, Wallet, PiggyBank, AlertTriangle, Shield } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function QuickStats({ 
  monthlyIncome, 
  monthlyExpenses, 
  dcaProgress, 
  liabilityRatio,
  securityScore 
}) {
  const surplus = monthlyIncome - monthlyExpenses;

  const stats = [
    {
      label: 'Monthly Income',
      value: `$${monthlyIncome.toLocaleString()}`,
      icon: ArrowUpRight,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-400/10',
    },
    {
      label: 'Monthly Expenses',
      value: `$${monthlyExpenses.toLocaleString()}`,
      icon: ArrowDownRight,
      color: 'text-rose-400',
      bgColor: 'bg-rose-400/10',
    },
    {
      label: 'Monthly Surplus',
      value: `$${Math.abs(surplus).toLocaleString()}`,
      icon: surplus >= 0 ? PiggyBank : AlertTriangle,
      color: surplus >= 0 ? 'text-amber-400' : 'text-rose-400',
      bgColor: surplus >= 0 ? 'bg-amber-400/10' : 'bg-rose-400/10',
      prefix: surplus < 0 ? '-' : '+',
    },
    {
      label: 'Security Score',
      value: `${securityScore}/10`,
      icon: Shield,
      color: securityScore >= 7 ? 'text-emerald-400' : securityScore >= 4 ? 'text-amber-400' : 'text-rose-400',
      bgColor: securityScore >= 7 ? 'bg-emerald-400/10' : securityScore >= 4 ? 'bg-amber-400/10' : 'bg-rose-400/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <div key={index} className="card-glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">{stat.label}</span>
            <div className={cn("p-1.5 rounded-lg", stat.bgColor)}>
              <stat.icon className={cn("w-4 h-4", stat.color)} />
            </div>
          </div>
          <p className={cn("text-xl font-bold", stat.color)}>
            {stat.prefix}{stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}