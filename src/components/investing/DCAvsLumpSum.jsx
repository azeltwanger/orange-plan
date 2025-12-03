import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';
import { Calculator, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Info } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

// Historical BTC monthly prices (simplified dataset - monthly closes)
const HISTORICAL_BTC_PRICES = {
  '2020-01': 9350, '2020-02': 8600, '2020-03': 6400, '2020-04': 8800, '2020-05': 9500, '2020-06': 9150,
  '2020-07': 11350, '2020-08': 11700, '2020-09': 10800, '2020-10': 13800, '2020-11': 19700, '2020-12': 29000,
  '2021-01': 33100, '2021-02': 45200, '2021-03': 58800, '2021-04': 57800, '2021-05': 37300, '2021-06': 35000,
  '2021-07': 41500, '2021-08': 47100, '2021-09': 43800, '2021-10': 61400, '2021-11': 57000, '2021-12': 46300,
  '2022-01': 38500, '2022-02': 43200, '2022-03': 45500, '2022-04': 38000, '2022-05': 31800, '2022-06': 19900,
  '2022-07': 23300, '2022-08': 20050, '2022-09': 19400, '2022-10': 20500, '2022-11': 17150, '2022-12': 16500,
  '2023-01': 23100, '2023-02': 23500, '2023-03': 28450, '2023-04': 29250, '2023-05': 27200, '2023-06': 30450,
  '2023-07': 29200, '2023-08': 26000, '2023-09': 27000, '2023-10': 34500, '2023-11': 37700, '2023-12': 42500,
  '2024-01': 42600, '2024-02': 62000, '2024-03': 71300, '2024-04': 64000, '2024-05': 67500, '2024-06': 62700,
  '2024-07': 66800, '2024-08': 59000, '2024-09': 63300, '2024-10': 72300, '2024-11': 97000, '2024-12': 97000,
};

const START_DATES = [
  { value: '2020-01', label: 'Jan 2020 (Pre-COVID crash)' },
  { value: '2020-03', label: 'Mar 2020 (COVID bottom)' },
  { value: '2021-01', label: 'Jan 2021 (Bull run start)' },
  { value: '2021-04', label: 'Apr 2021 (ATH period)' },
  { value: '2022-01', label: 'Jan 2022 (Bear market start)' },
  { value: '2022-11', label: 'Nov 2022 (FTX bottom)' },
  { value: '2023-01', label: 'Jan 2023 (Recovery start)' },
  { value: '2024-01', label: 'Jan 2024 (ETF approval)' },
];

export default function DCAvsLumpSum({ btcPrice = 97000 }) {
  const [investmentAmount, setInvestmentAmount] = useState(10000);
  const [startDate, setStartDate] = useState('2023-01');
  const [dcaPeriodMonths, setDcaPeriodMonths] = useState(12);

  const simulation = useMemo(() => {
    const priceKeys = Object.keys(HISTORICAL_BTC_PRICES).sort();
    const startIndex = priceKeys.indexOf(startDate);
    
    if (startIndex === -1) return null;

    const startPrice = HISTORICAL_BTC_PRICES[startDate];
    const endIndex = Math.min(startIndex + dcaPeriodMonths, priceKeys.length - 1);
    const endDate = priceKeys[endIndex];
    const endPrice = HISTORICAL_BTC_PRICES[endDate];

    // Lump Sum: Buy all at start
    const lumpSumBtc = investmentAmount / startPrice;
    const lumpSumFinalValue = lumpSumBtc * endPrice;
    const lumpSumReturn = ((lumpSumFinalValue - investmentAmount) / investmentAmount) * 100;

    // DCA: Buy monthly over the period
    const monthlyInvestment = investmentAmount / dcaPeriodMonths;
    let dcaBtc = 0;
    const dcaData = [];
    let dcaMaxValue = 0;
    let dcaMinValue = Infinity;
    let lumpSumMaxValue = 0;
    let lumpSumMinValue = Infinity;

    for (let i = 0; i <= endIndex - startIndex; i++) {
      const monthKey = priceKeys[startIndex + i];
      const price = HISTORICAL_BTC_PRICES[monthKey];
      
      if (i < dcaPeriodMonths) {
        dcaBtc += monthlyInvestment / price;
      }
      
      const dcaValue = dcaBtc * price;
      const lumpSumValue = lumpSumBtc * price;
      const dcaInvested = Math.min((i + 1) * monthlyInvestment, investmentAmount);
      
      dcaMaxValue = Math.max(dcaMaxValue, dcaValue);
      dcaMinValue = Math.min(dcaMinValue, dcaValue);
      lumpSumMaxValue = Math.max(lumpSumMaxValue, lumpSumValue);
      lumpSumMinValue = Math.min(lumpSumMinValue, lumpSumValue);
      
      dcaData.push({
        month: monthKey,
        price,
        dcaValue: Math.round(dcaValue),
        lumpSumValue: Math.round(lumpSumValue),
        dcaInvested: Math.round(dcaInvested),
        dcaBtc: dcaBtc.toFixed(6),
      });
    }

    const dcaFinalValue = dcaBtc * endPrice;
    const dcaReturn = ((dcaFinalValue - investmentAmount) / investmentAmount) * 100;
    const dcaCostBasis = investmentAmount / dcaBtc;

    // Calculate max drawdowns
    const lumpSumMaxDrawdown = ((lumpSumMaxValue - lumpSumMinValue) / lumpSumMaxValue) * 100;
    const dcaMaxDrawdown = dcaMaxValue > 0 ? ((dcaMaxValue - dcaMinValue) / dcaMaxValue) * 100 : 0;

    return {
      startDate,
      endDate,
      startPrice,
      endPrice,
      investmentAmount,
      dcaPeriodMonths,
      // Lump Sum results
      lumpSumBtc,
      lumpSumFinalValue,
      lumpSumReturn,
      lumpSumCostBasis: startPrice,
      lumpSumMaxDrawdown,
      // DCA results
      dcaBtc,
      dcaFinalValue,
      dcaReturn,
      dcaCostBasis,
      dcaMaxDrawdown,
      // Chart data
      chartData: dcaData,
      // Winner
      winner: lumpSumFinalValue > dcaFinalValue ? 'lumpsum' : 'dca',
      difference: Math.abs(lumpSumFinalValue - dcaFinalValue),
    };
  }, [investmentAmount, startDate, dcaPeriodMonths]);

  if (!simulation) {
    return <div className="text-center py-12 text-zinc-500">Invalid date selection</div>;
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="card-premium rounded-xl p-6 border border-zinc-800/50">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-orange-400" />
          Simulation Parameters
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label className="text-zinc-400">Investment Amount</Label>
            <Input
              type="number"
              value={investmentAmount}
              onChange={(e) => setInvestmentAmount(parseFloat(e.target.value) || 0)}
              className="bg-zinc-900 border-zinc-800"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-zinc-400">Start Date</Label>
            <Select value={startDate} onValueChange={setStartDate}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {START_DATES.map(d => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-zinc-400">DCA Period</Label>
              <span className="text-orange-400 font-semibold">{dcaPeriodMonths} months</span>
            </div>
            <Slider
              value={[dcaPeriodMonths]}
              onValueChange={([v]) => setDcaPeriodMonths(v)}
              min={3}
              max={24}
              step={1}
            />
          </div>
        </div>
      </div>

      {/* Results Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Lump Sum */}
        <div className={cn(
          "card-premium rounded-xl p-6 border",
          simulation.winner === 'lumpsum' ? "border-emerald-500/30" : "border-zinc-800/50"
        )}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-blue-400" />
              Lump Sum
            </h4>
            {simulation.winner === 'lumpsum' && (
              <span className="px-2 py-1 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400">
                WINNER
              </span>
            )}
          </div>
          
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-zinc-800/30">
              <p className="text-sm text-zinc-500">Final Value</p>
              <p className="text-3xl font-bold text-blue-400">
                ${simulation.lumpSumFinalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className={cn(
                "text-sm font-medium mt-1",
                simulation.lumpSumReturn >= 0 ? "text-emerald-400" : "text-rose-400"
              )}>
                {simulation.lumpSumReturn >= 0 ? '+' : ''}{simulation.lumpSumReturn.toFixed(1)}% return
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-zinc-500">BTC Acquired</p>
                <p className="font-semibold">{simulation.lumpSumBtc.toFixed(6)}</p>
              </div>
              <div>
                <p className="text-zinc-500">Cost Basis</p>
                <p className="font-semibold">${simulation.lumpSumCostBasis.toLocaleString()}</p>
              </div>
            </div>
            
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-rose-400" />
                <span className="text-sm font-medium text-rose-400">Max Drawdown Risk</span>
              </div>
              <p className="text-2xl font-bold text-rose-400">
                -{simulation.lumpSumMaxDrawdown.toFixed(1)}%
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Largest peak-to-trough decline during period
              </p>
            </div>
          </div>
        </div>

        {/* DCA */}
        <div className={cn(
          "card-premium rounded-xl p-6 border",
          simulation.winner === 'dca' ? "border-emerald-500/30" : "border-zinc-800/50"
        )}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-400" />
              DCA ({dcaPeriodMonths} months)
            </h4>
            {simulation.winner === 'dca' && (
              <span className="px-2 py-1 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400">
                WINNER
              </span>
            )}
          </div>
          
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-zinc-800/30">
              <p className="text-sm text-zinc-500">Final Value</p>
              <p className="text-3xl font-bold text-orange-400">
                ${simulation.dcaFinalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className={cn(
                "text-sm font-medium mt-1",
                simulation.dcaReturn >= 0 ? "text-emerald-400" : "text-rose-400"
              )}>
                {simulation.dcaReturn >= 0 ? '+' : ''}{simulation.dcaReturn.toFixed(1)}% return
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-zinc-500">BTC Acquired</p>
                <p className="font-semibold">{simulation.dcaBtc.toFixed(6)}</p>
              </div>
              <div>
                <p className="text-zinc-500">Avg Cost Basis</p>
                <p className="font-semibold">${simulation.dcaCostBasis.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
            
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-400">Max Drawdown Risk</span>
              </div>
              <p className="text-2xl font-bold text-amber-400">
                -{simulation.dcaMaxDrawdown.toFixed(1)}%
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Lower emotional volatility due to gradual entry
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Difference Summary */}
      <div className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/50">
        <div className="flex items-center gap-3">
          <Info className="w-5 h-5 text-zinc-400" />
          <p className="text-sm text-zinc-400">
            <span className="font-semibold text-zinc-200">
              {simulation.winner === 'lumpsum' ? 'Lump Sum' : 'DCA'}
            </span>
            {' '}outperformed by{' '}
            <span className="text-emerald-400 font-semibold">
              ${simulation.difference.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            {' '}in this period.
            {simulation.winner === 'lumpsum' && simulation.lumpSumMaxDrawdown > 30 && (
              <span className="text-amber-400">
                {' '}However, lump sum had a {simulation.lumpSumMaxDrawdown.toFixed(0)}% max drawdown — could you stomach that volatility?
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="card-premium rounded-xl p-6 border border-zinc-800/50">
        <h3 className="font-semibold mb-4">Value Over Time</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={simulation.chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis 
                dataKey="month" 
                stroke="#71717a" 
                fontSize={12}
                tickFormatter={(v) => v.slice(2)}
              />
              <YAxis 
                stroke="#71717a" 
                fontSize={12}
                tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                formatter={(value, name) => [
                  `$${value.toLocaleString()}`,
                  name === 'lumpSumValue' ? 'Lump Sum' : name === 'dcaValue' ? 'DCA' : 'Invested'
                ]}
              />
              <ReferenceLine y={investmentAmount} stroke="#71717a" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="lumpSumValue" stroke="#60a5fa" strokeWidth={2} dot={false} name="lumpSumValue" />
              <Line type="monotone" dataKey="dcaValue" stroke="#F7931A" strokeWidth={2} dot={false} name="dcaValue" />
              <Line type="monotone" dataKey="dcaInvested" stroke="#71717a" strokeWidth={1} strokeDasharray="5 5" dot={false} name="dcaInvested" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-400" />
            <span className="text-sm text-zinc-400">Lump Sum</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-400" />
            <span className="text-sm text-zinc-400">DCA</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-zinc-500" style={{ width: 12 }} />
            <span className="text-sm text-zinc-400">Amount Invested</span>
          </div>
        </div>
      </div>

      {/* Educational Note */}
      <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/10">
        <h4 className="font-semibold text-orange-400 mb-2">Historical Context</h4>
        <p className="text-sm text-zinc-400">
          Historically, lump sum investing outperforms DCA about 2/3 of the time because markets tend to go up. 
          However, DCA reduces timing risk and emotional stress from volatility. The "best" strategy depends on your 
          risk tolerance and whether you can stomach potential short-term losses.
        </p>
      </div>
    </div>
  );
}