import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown, Calendar, Bitcoin, DollarSign } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function Performance() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('1Y');

  // Fetch live BTC price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        const data = await response.json();
        setBtcPrice(data.bitcoin.usd);
        setPriceLoading(false);
      } catch (err) {
        setBtcPrice(97000);
        setPriceLoading(false);
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  const currentPrice = btcPrice || 97000;

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list(),
  });

  // Calculate totals
  const btcHoldings = holdings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity, 0);
  const totalCostBasis = holdings.reduce((sum, h) => sum + (h.cost_basis_total || 0), 0);
  const currentValue = holdings.reduce((sum, h) => {
    if (h.ticker === 'BTC') return sum + (h.quantity * currentPrice);
    return sum + (h.quantity * (h.current_price || 0));
  }, 0);
  
  const totalGainLoss = currentValue - totalCostBasis;
  const totalGainLossPercent = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

  // Generate mock chart data
  const generateChartData = () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.map((month, i) => ({
      name: month,
      portfolio: Math.round(currentValue * (0.5 + (i / 12) * 0.6 + Math.random() * 0.1)),
      btc: Math.round(currentPrice * (0.6 + (i / 12) * 0.5 + Math.random() * 0.1)),
    }));
  };

  const chartData = generateChartData();

  const stats = [
    {
      label: 'Total Portfolio Value',
      value: `$${currentValue.toLocaleString()}`,
      icon: DollarSign,
      color: 'text-emerald-400',
    },
    {
      label: 'Total Cost Basis',
      value: `$${totalCostBasis.toLocaleString()}`,
      icon: DollarSign,
      color: 'text-zinc-400',
    },
    {
      label: 'Total Gain/Loss',
      value: `$${Math.abs(totalGainLoss).toLocaleString()}`,
      prefix: totalGainLoss >= 0 ? '+' : '-',
      icon: totalGainLoss >= 0 ? TrendingUp : TrendingDown,
      color: totalGainLoss >= 0 ? 'text-emerald-400' : 'text-rose-400',
    },
    {
      label: 'Return %',
      value: `${Math.abs(totalGainLossPercent).toFixed(2)}%`,
      prefix: totalGainLossPercent >= 0 ? '+' : '-',
      icon: totalGainLossPercent >= 0 ? TrendingUp : TrendingDown,
      color: totalGainLossPercent >= 0 ? 'text-emerald-400' : 'text-rose-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Performance</h1>
          <p className="text-zinc-500 mt-1">Track your portfolio growth</p>
        </div>
        <Select value={timeframe} onValueChange={setTimeframe}>
          <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            <SelectItem value="1M">1 Month</SelectItem>
            <SelectItem value="3M">3 Months</SelectItem>
            <SelectItem value="6M">6 Months</SelectItem>
            <SelectItem value="1Y">1 Year</SelectItem>
            <SelectItem value="ALL">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="card-glass rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">{stat.label}</span>
              <div className={cn("p-1.5 rounded-lg", stat.color.replace('text-', 'bg-') + '/10')}>
                <stat.icon className={cn("w-4 h-4", stat.color)} />
              </div>
            </div>
            <p className={cn("text-xl lg:text-2xl font-bold", stat.color)}>
              {stat.prefix}{stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Portfolio Chart */}
      <div className="card-glass rounded-2xl p-6">
        <h3 className="font-semibold mb-6">Portfolio Value Over Time</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F7931A" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#F7931A" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '12px',
                }}
                labelStyle={{ color: '#a1a1aa' }}
                itemStyle={{ color: '#F7931A' }}
                formatter={(value) => [`$${value.toLocaleString()}`, 'Value']}
              />
              <Area
                type="monotone"
                dataKey="portfolio"
                stroke="#F7931A"
                strokeWidth={2}
                fill="url(#portfolioGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Asset Breakdown */}
      <div className="card-glass rounded-2xl p-6">
        <h3 className="font-semibold mb-6">Asset Performance</h3>
        <div className="space-y-4">
          {holdings.map((holding) => {
          const value = holding.ticker === 'BTC' 
            ? holding.quantity * currentPrice 
            : holding.quantity * (holding.current_price || 0);
            const gain = value - (holding.cost_basis_total || 0);
            const gainPercent = holding.cost_basis_total ? (gain / holding.cost_basis_total) * 100 : 0;

            return (
              <div key={holding.id} className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    holding.ticker === 'BTC' ? 'bg-amber-400/10' : 'bg-zinc-700'
                  )}>
                    {holding.ticker === 'BTC' ? (
                      <Bitcoin className="w-5 h-5 text-amber-400" />
                    ) : (
                      <span className="text-sm font-bold text-zinc-400">{holding.ticker?.[0]}</span>
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{holding.asset_name}</p>
                    <p className="text-sm text-zinc-500">{holding.quantity} {holding.ticker}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">${value.toLocaleString()}</p>
                  {holding.cost_basis_total > 0 && (
                    <p className={cn(
                      "text-sm font-medium",
                      gain >= 0 ? "text-emerald-400" : "text-rose-400"
                    )}>
                      {gain >= 0 ? '+' : ''}{gainPercent.toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          {holdings.length === 0 && (
            <p className="text-center text-zinc-500 py-8">No holdings to display</p>
          )}
        </div>
      </div>
    </div>
  );
}