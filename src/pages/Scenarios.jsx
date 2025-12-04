import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { Plus, Pencil, Trash2, Copy, TrendingUp, TrendingDown, Target, Sparkles, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SCENARIO_COLORS = ['#F7931A', '#3B82F6', '#10B981', '#A855F7', '#F43F5E', '#06B6D4'];

const SCENARIO_PRESETS = {
  optimistic: {
    name: 'Optimistic',
    btc_cagr_override: 40,
    stocks_cagr_override: 10,
    inflation_override: 2,
    income_growth_override: 5,
  },
  pessimistic: {
    name: 'Pessimistic',
    btc_cagr_override: 5,
    stocks_cagr_override: 4,
    inflation_override: 5,
    income_growth_override: 1,
  },
  early_retirement: {
    name: 'Early Retirement',
    retirement_age_override: 50,
    annual_retirement_spending_override: 80000,
  },
  market_crash: {
    name: 'Market Crash',
    market_crash_year: new Date().getFullYear() + 3,
    crash_severity_percent: 50,
  },
};

export default function Scenarios() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingScenario, setEditingScenario] = useState(null);
  const [expandedScenario, setExpandedScenario] = useState(null);
  const [showComparison, setShowComparison] = useState(true);
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: '',
    description: '',
    scenario_type: 'custom',
    retirement_age_override: '',
    life_expectancy_override: '',
    btc_cagr_override: '',
    stocks_cagr_override: '',
    real_estate_cagr_override: '',
    bonds_cagr_override: '',
    inflation_override: '',
    income_growth_override: '',
    annual_retirement_spending_override: '',
    withdrawal_strategy_override: '',
    dynamic_withdrawal_rate_override: '',
    market_crash_year: '',
    crash_severity_percent: '',
  });

  // Fetch BTC price
  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
      .then(r => r.json())
      .then(data => setBtcPrice(data.bitcoin.usd))
      .catch(() => setBtcPrice(97000));
  }, []);

  const currentPrice = btcPrice || 97000;

  // Queries
  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => base44.entities.Scenario.list(),
  });

  const { data: userSettings = [] } = useQuery({
    queryKey: ['userSettings'],
    queryFn: () => base44.entities.UserSettings.list(),
  });

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const { data: budgetItems = [] } = useQuery({
    queryKey: ['budgetItems'],
    queryFn: () => base44.entities.BudgetItem.list(),
  });

  const settings = userSettings[0] || {};

  // Base assumptions from UserSettings
  const baseAssumptions = {
    currentAge: settings.current_age || 35,
    retirementAge: settings.retirement_age || 65,
    lifeExpectancy: settings.life_expectancy || 90,
    btcCagr: settings.btc_cagr_assumption || 25,
    stocksCagr: settings.stocks_cagr || 7,
    realEstateCagr: settings.real_estate_cagr || 4,
    bondsCagr: settings.bonds_cagr || 3,
    inflationRate: settings.inflation_rate || 3,
    incomeGrowth: settings.income_growth_rate || 3,
    retirementSpending: settings.annual_retirement_spending || 100000,
    withdrawalStrategy: settings.withdrawal_strategy || 'dynamic',
    dynamicWithdrawalRate: settings.dynamic_withdrawal_rate || 5,
  };

  // Calculate portfolio values
  const btcValue = holdings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity * currentPrice, 0);
  const stocksValue = holdings.filter(h => h.asset_type === 'stocks').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const realEstateValue = holdings.filter(h => h.asset_type === 'real_estate').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const bondsValue = holdings.filter(h => h.asset_type === 'bonds').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const otherValue = holdings.filter(h => !['BTC'].includes(h.ticker) && !['stocks', 'real_estate', 'bonds'].includes(h.asset_type)).reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const totalValue = btcValue + stocksValue + realEstateValue + bondsValue + otherValue;

  // Calculate annual savings
  const freqMultiplier = { monthly: 12, weekly: 52, biweekly: 26, quarterly: 4, annual: 1, one_time: 0 };
  const monthlyIncome = budgetItems.filter(b => b.type === 'income' && b.is_active !== false).reduce((sum, b) => sum + (b.amount * (freqMultiplier[b.frequency] || 12) / 12), 0);
  const monthlyExpenses = budgetItems.filter(b => b.type === 'expense' && b.is_active !== false).reduce((sum, b) => sum + (b.amount * (freqMultiplier[b.frequency] || 12) / 12), 0);
  const annualSavings = Math.max(0, (monthlyIncome - monthlyExpenses) * 12);

  // Generate projection for a scenario
  const generateProjection = (scenario) => {
    const assumptions = {
      ...baseAssumptions,
      retirementAge: scenario?.retirement_age_override || baseAssumptions.retirementAge,
      lifeExpectancy: scenario?.life_expectancy_override || baseAssumptions.lifeExpectancy,
      btcCagr: scenario?.btc_cagr_override ?? baseAssumptions.btcCagr,
      stocksCagr: scenario?.stocks_cagr_override ?? baseAssumptions.stocksCagr,
      realEstateCagr: scenario?.real_estate_cagr_override ?? baseAssumptions.realEstateCagr,
      bondsCagr: scenario?.bonds_cagr_override ?? baseAssumptions.bondsCagr,
      inflationRate: scenario?.inflation_override ?? baseAssumptions.inflationRate,
      incomeGrowth: scenario?.income_growth_override ?? baseAssumptions.incomeGrowth,
      retirementSpending: scenario?.annual_retirement_spending_override || baseAssumptions.retirementSpending,
      withdrawalStrategy: scenario?.withdrawal_strategy_override || baseAssumptions.withdrawalStrategy,
      dynamicWithdrawalRate: scenario?.dynamic_withdrawal_rate_override || baseAssumptions.dynamicWithdrawalRate,
    };

    const years = assumptions.lifeExpectancy - assumptions.currentAge;
    const data = [];
    const currentYear = new Date().getFullYear();

    let runningBtc = btcValue;
    let runningStocks = stocksValue;
    let runningRealEstate = realEstateValue;
    let runningBonds = bondsValue;
    let runningOther = otherValue;
    let runningSavings = 0;
    let initialRetirementWithdrawal = 0;

    for (let i = 0; i <= years; i++) {
      const year = currentYear + i;
      const isRetired = assumptions.currentAge + i >= assumptions.retirementAge;
      const yearsIntoRetirement = isRetired ? assumptions.currentAge + i - assumptions.retirementAge : 0;

      // Check for market crash
      let crashMultiplier = 1;
      if (scenario?.market_crash_year === year && scenario?.crash_severity_percent) {
        crashMultiplier = 1 - (scenario.crash_severity_percent / 100);
      }

      if (i > 0) {
        runningBtc = runningBtc * (1 + assumptions.btcCagr / 100) * crashMultiplier;
        runningStocks = runningStocks * (1 + assumptions.stocksCagr / 100) * crashMultiplier;
        runningRealEstate = runningRealEstate * (1 + assumptions.realEstateCagr / 100);
        runningBonds = runningBonds * (1 + assumptions.bondsCagr / 100);
        runningOther = runningOther * (1 + assumptions.stocksCagr / 100) * crashMultiplier;

        const blendedGrowthRate = (assumptions.btcCagr * 0.3 + assumptions.stocksCagr * 0.7) / 100;
        runningSavings = runningSavings * (1 + blendedGrowthRate) * crashMultiplier;
      }

      if (!isRetired) {
        const yearSavings = annualSavings * Math.pow(1 + assumptions.incomeGrowth / 100, i);
        runningSavings += yearSavings;
      } else {
        let yearWithdrawal = 0;
        const total = runningBtc + runningStocks + runningRealEstate + runningBonds + runningOther + runningSavings;

        if (assumptions.withdrawalStrategy === '4percent') {
          if (yearsIntoRetirement === 0) {
            initialRetirementWithdrawal = total * 0.04;
          }
          yearWithdrawal = initialRetirementWithdrawal * Math.pow(1 + assumptions.inflationRate / 100, yearsIntoRetirement);
        } else if (assumptions.withdrawalStrategy === 'dynamic') {
          yearWithdrawal = total * (assumptions.dynamicWithdrawalRate / 100);
        } else {
          const yearsOfInflation = (assumptions.retirementAge - assumptions.currentAge) + yearsIntoRetirement;
          yearWithdrawal = assumptions.retirementSpending * Math.pow(1 + assumptions.inflationRate / 100, yearsOfInflation);
        }

        const totalForWithdrawal = runningBtc + runningStocks + runningRealEstate + runningBonds + runningOther + runningSavings;
        if (totalForWithdrawal > 0 && yearWithdrawal > 0) {
          const withdrawRatio = Math.min(1, yearWithdrawal / totalForWithdrawal);
          runningBtc -= runningBtc * withdrawRatio;
          runningStocks -= runningStocks * withdrawRatio;
          runningRealEstate -= runningRealEstate * withdrawRatio;
          runningBonds -= runningBonds * withdrawRatio;
          runningOther -= runningOther * withdrawRatio;
          runningSavings -= runningSavings * withdrawRatio;
        }
      }

      const total = Math.max(0, runningBtc + runningStocks + runningRealEstate + runningBonds + runningOther + runningSavings);

      data.push({
        age: assumptions.currentAge + i,
        year,
        total: Math.round(total),
        isRetired,
      });
    }

    return { data, assumptions };
  };

  // Generate projections for all scenarios + base
  const allProjections = useMemo(() => {
    const projections = {
      base: generateProjection(null),
    };

    scenarios.forEach((scenario, index) => {
      projections[scenario.id] = {
        ...generateProjection(scenario),
        color: SCENARIO_COLORS[index % SCENARIO_COLORS.length],
        scenario,
      };
    });

    return projections;
  }, [scenarios, baseAssumptions, btcValue, stocksValue, realEstateValue, bondsValue, otherValue, annualSavings]);

  // Merge projections for comparison chart
  const comparisonData = useMemo(() => {
    const baseData = allProjections.base.data;
    return baseData.map((point, index) => {
      const merged = { age: point.age, year: point.year, base: point.total };
      scenarios.forEach(scenario => {
        const scenarioData = allProjections[scenario.id]?.data;
        if (scenarioData && scenarioData[index]) {
          merged[scenario.id] = scenarioData[index].total;
        }
      });
      return merged;
    });
  }, [allProjections, scenarios]);

  // Mutations
  const createScenario = useMutation({
    mutationFn: (data) => base44.entities.Scenario.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setFormOpen(false);
      resetForm();
    },
  });

  const updateScenario = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Scenario.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setFormOpen(false);
      setEditingScenario(null);
      resetForm();
    },
  });

  const deleteScenario = useMutation({
    mutationFn: (id) => base44.entities.Scenario.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scenarios'] }),
  });

  const resetForm = () => {
    setForm({
      name: '', description: '', scenario_type: 'custom',
      retirement_age_override: '', life_expectancy_override: '',
      btc_cagr_override: '', stocks_cagr_override: '', real_estate_cagr_override: '', bonds_cagr_override: '',
      inflation_override: '', income_growth_override: '', annual_retirement_spending_override: '',
      withdrawal_strategy_override: '', dynamic_withdrawal_rate_override: '',
      market_crash_year: '', crash_severity_percent: '',
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...form,
      retirement_age_override: form.retirement_age_override ? parseInt(form.retirement_age_override) : null,
      life_expectancy_override: form.life_expectancy_override ? parseInt(form.life_expectancy_override) : null,
      btc_cagr_override: form.btc_cagr_override !== '' ? parseFloat(form.btc_cagr_override) : null,
      stocks_cagr_override: form.stocks_cagr_override !== '' ? parseFloat(form.stocks_cagr_override) : null,
      real_estate_cagr_override: form.real_estate_cagr_override !== '' ? parseFloat(form.real_estate_cagr_override) : null,
      bonds_cagr_override: form.bonds_cagr_override !== '' ? parseFloat(form.bonds_cagr_override) : null,
      inflation_override: form.inflation_override !== '' ? parseFloat(form.inflation_override) : null,
      income_growth_override: form.income_growth_override !== '' ? parseFloat(form.income_growth_override) : null,
      annual_retirement_spending_override: form.annual_retirement_spending_override ? parseFloat(form.annual_retirement_spending_override) : null,
      dynamic_withdrawal_rate_override: form.dynamic_withdrawal_rate_override !== '' ? parseFloat(form.dynamic_withdrawal_rate_override) : null,
      market_crash_year: form.market_crash_year ? parseInt(form.market_crash_year) : null,
      crash_severity_percent: form.crash_severity_percent !== '' ? parseFloat(form.crash_severity_percent) : null,
    };

    if (editingScenario) {
      updateScenario.mutate({ id: editingScenario.id, data });
    } else {
      createScenario.mutate(data);
    }
  };

  const handleEdit = (scenario) => {
    setEditingScenario(scenario);
    setForm({
      name: scenario.name || '',
      description: scenario.description || '',
      scenario_type: scenario.scenario_type || 'custom',
      retirement_age_override: scenario.retirement_age_override || '',
      life_expectancy_override: scenario.life_expectancy_override || '',
      btc_cagr_override: scenario.btc_cagr_override ?? '',
      stocks_cagr_override: scenario.stocks_cagr_override ?? '',
      real_estate_cagr_override: scenario.real_estate_cagr_override ?? '',
      bonds_cagr_override: scenario.bonds_cagr_override ?? '',
      inflation_override: scenario.inflation_override ?? '',
      income_growth_override: scenario.income_growth_override ?? '',
      annual_retirement_spending_override: scenario.annual_retirement_spending_override || '',
      withdrawal_strategy_override: scenario.withdrawal_strategy_override || '',
      dynamic_withdrawal_rate_override: scenario.dynamic_withdrawal_rate_override ?? '',
      market_crash_year: scenario.market_crash_year || '',
      crash_severity_percent: scenario.crash_severity_percent ?? '',
    });
    setFormOpen(true);
  };

  const handleDuplicate = (scenario) => {
    const duplicated = {
      ...scenario,
      name: `${scenario.name} (Copy)`,
    };
    delete duplicated.id;
    delete duplicated.created_date;
    delete duplicated.updated_date;
    createScenario.mutate(duplicated);
  };

  const applyPreset = (presetKey) => {
    const preset = SCENARIO_PRESETS[presetKey];
    if (preset) {
      setForm(prev => ({
        ...prev,
        name: preset.name,
        scenario_type: presetKey === 'optimistic' ? 'optimistic' : presetKey === 'pessimistic' ? 'pessimistic' : 'custom',
        ...preset,
      }));
    }
  };

  const formatNumber = (num) => {
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}k`;
    return `$${num.toLocaleString()}`;
  };

  const baseRetirementValue = allProjections.base.data.find(d => d.age === baseAssumptions.retirementAge)?.total || 0;
  const baseEndValue = allProjections.base.data[allProjections.base.data.length - 1]?.total || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Scenario Planning</h1>
          <p className="text-zinc-500 mt-1">Compare different financial futures side by side</p>
        </div>
        <Button onClick={() => { resetForm(); setEditingScenario(null); setFormOpen(true); }} className="brand-gradient text-white font-semibold">
          <Plus className="w-4 h-4 mr-2" />
          New Scenario
        </Button>
      </div>

      {/* Base Case Summary */}
      <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Target className="w-5 h-5 text-orange-400" />
            Base Case (Current Settings)
          </h3>
          <Link to={createPageUrl('FinancialPlan')}>
            <Button variant="outline" size="sm" className="bg-transparent border-zinc-700">
              <ExternalLink className="w-4 h-4 mr-2" />
              Edit in Projections
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="p-3 rounded-xl bg-zinc-800/30">
            <p className="text-xs text-zinc-500">Retire at</p>
            <p className="text-lg font-bold text-zinc-200">{baseAssumptions.retirementAge}</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/30">
            <p className="text-xs text-zinc-500">BTC CAGR</p>
            <p className="text-lg font-bold text-orange-400">{baseAssumptions.btcCagr}%</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/30">
            <p className="text-xs text-zinc-500">Stocks CAGR</p>
            <p className="text-lg font-bold text-blue-400">{baseAssumptions.stocksCagr}%</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/30">
            <p className="text-xs text-zinc-500">Inflation</p>
            <p className="text-lg font-bold text-rose-400">{baseAssumptions.inflationRate}%</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/30">
            <p className="text-xs text-zinc-500">At Retirement</p>
            <p className="text-lg font-bold text-emerald-400">{formatNumber(baseRetirementValue)}</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/30">
            <p className="text-xs text-zinc-500">At {baseAssumptions.lifeExpectancy}</p>
            <p className="text-lg font-bold text-zinc-200">{formatNumber(baseEndValue)}</p>
          </div>
        </div>
      </div>

      {/* Comparison Chart */}
      {scenarios.length > 0 && (
        <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-400" />
              Scenario Comparison
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setShowComparison(!showComparison)}>
              {showComparison ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
          
          {showComparison && (
            <>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={comparisonData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="age" stroke="#71717a" fontSize={12} />
                    <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                      formatter={(value, name) => {
                        const label = name === 'base' ? 'Base Case' : scenarios.find(s => s.id === name)?.name || name;
                        return [formatNumber(value), label];
                      }}
                      labelFormatter={(age) => `Age ${age}`}
                    />
                    <Legend formatter={(value) => value === 'base' ? 'Base Case' : scenarios.find(s => s.id === value)?.name || value} />
                    <ReferenceLine x={baseAssumptions.retirementAge} stroke="#F7931A" strokeDasharray="5 5" />
                    <Line type="monotone" dataKey="base" stroke="#71717a" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                    {scenarios.map((scenario, index) => (
                      <Line
                        key={scenario.id}
                        type="monotone"
                        dataKey={scenario.id}
                        stroke={SCENARIO_COLORS[index % SCENARIO_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-4 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-0.5 bg-zinc-500" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #71717a 0, #71717a 5px, transparent 5px, transparent 10px)' }} />
                  <span className="text-sm text-zinc-400">Base Case</span>
                </div>
                {scenarios.map((scenario, index) => (
                  <div key={scenario.id} className="flex items-center gap-2">
                    <div className="w-6 h-0.5" style={{ backgroundColor: SCENARIO_COLORS[index % SCENARIO_COLORS.length] }} />
                    <span className="text-sm text-zinc-400">{scenario.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Scenarios List */}
      <div className="space-y-4">
        <h3 className="font-semibold">Your Scenarios</h3>
        
        {scenarios.length === 0 ? (
          <div className="card-premium rounded-2xl p-12 text-center border border-zinc-800/50">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 mx-auto flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-orange-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Scenarios Yet</h3>
            <p className="text-zinc-500 mb-6 max-w-sm mx-auto">Create scenarios to explore different financial futures and compare outcomes</p>
            <Button onClick={() => setFormOpen(true)} className="brand-gradient text-white font-semibold">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Scenario
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {scenarios.map((scenario, index) => {
              const projection = allProjections[scenario.id];
              const retirementAge = scenario.retirement_age_override || baseAssumptions.retirementAge;
              const retirementValue = projection?.data.find(d => d.age === retirementAge)?.total || 0;
              const endValue = projection?.data[projection?.data.length - 1]?.total || 0;
              const diffFromBase = endValue - baseEndValue;
              const isExpanded = expandedScenario === scenario.id;

              return (
                <div
                  key={scenario.id}
                  className="card-premium rounded-xl border border-zinc-800/50 overflow-hidden"
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3 h-12 rounded-full"
                          style={{ backgroundColor: SCENARIO_COLORS[index % SCENARIO_COLORS.length] }}
                        />
                        <div>
                          <h4 className="font-semibold text-lg">{scenario.name}</h4>
                          {scenario.description && (
                            <p className="text-sm text-zinc-500 mt-0.5">{scenario.description}</p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {scenario.retirement_age_override && (
                              <Badge variant="outline" className="border-zinc-600 text-zinc-400">
                                Retire at {scenario.retirement_age_override}
                              </Badge>
                            )}
                            {scenario.btc_cagr_override !== null && scenario.btc_cagr_override !== undefined && (
                              <Badge variant="outline" className="border-orange-500/30 text-orange-400">
                                BTC {scenario.btc_cagr_override}%
                              </Badge>
                            )}
                            {scenario.stocks_cagr_override !== null && scenario.stocks_cagr_override !== undefined && (
                              <Badge variant="outline" className="border-blue-500/30 text-blue-400">
                                Stocks {scenario.stocks_cagr_override}%
                              </Badge>
                            )}
                            {scenario.inflation_override !== null && scenario.inflation_override !== undefined && (
                              <Badge variant="outline" className="border-rose-500/30 text-rose-400">
                                Inflation {scenario.inflation_override}%
                              </Badge>
                            )}
                            {scenario.market_crash_year && (
                              <Badge variant="outline" className="border-red-500/30 text-red-400">
                                Crash in {scenario.market_crash_year}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleDuplicate(scenario)}>
                          <Copy className="w-4 h-4 text-zinc-400" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(scenario)}>
                          <Pencil className="w-4 h-4 text-zinc-400" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteScenario.mutate(scenario.id)}>
                          <Trash2 className="w-4 h-4 text-zinc-400" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div className="p-3 rounded-lg bg-zinc-800/30">
                        <p className="text-xs text-zinc-500">At Retirement</p>
                        <p className="text-lg font-bold text-emerald-400">{formatNumber(retirementValue)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-zinc-800/30">
                        <p className="text-xs text-zinc-500">End of Life</p>
                        <p className="text-lg font-bold text-zinc-200">{formatNumber(endValue)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-zinc-800/30">
                        <p className="text-xs text-zinc-500">vs Base Case</p>
                        <p className={cn("text-lg font-bold flex items-center gap-1", diffFromBase >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {diffFromBase >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          {formatNumber(Math.abs(diffFromBase))}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedScenario(isExpanded ? null : scenario.id)}
                      className="w-full mt-4 text-zinc-500"
                    >
                      {isExpanded ? 'Hide Details' : 'Show Details'}
                      {isExpanded ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-zinc-800/50 pt-4">
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={projection?.data || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="age" stroke="#71717a" fontSize={10} />
                            <YAxis stroke="#71717a" fontSize={10} tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                              formatter={(value) => [formatNumber(value), 'Portfolio']}
                              labelFormatter={(age) => `Age ${age}`}
                            />
                            <ReferenceLine x={retirementAge} stroke="#F7931A" strokeDasharray="5 5" />
                            <Line
                              type="monotone"
                              dataKey="total"
                              stroke={SCENARIO_COLORS[index % SCENARIO_COLORS.length]}
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingScenario ? 'Edit Scenario' : 'Create New Scenario'}</DialogTitle>
          </DialogHeader>

          {/* Presets */}
          {!editingScenario && (
            <div className="mb-4">
              <Label className="text-zinc-400 text-sm mb-2 block">Quick Start from Preset</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SCENARIO_PRESETS).map(([key, preset]) => (
                  <Button key={key} variant="outline" size="sm" onClick={() => applyPreset(key)} className="bg-transparent border-zinc-700">
                    {preset.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Scenario Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Early Retirement, Bear Market..."
                  className="bg-zinc-800 border-zinc-700"
                  required
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe this scenario..."
                  className="bg-zinc-800 border-zinc-700"
                  rows={2}
                />
              </div>
            </div>

            {/* Retirement Settings */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-zinc-300">Retirement Settings</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Retirement Age</Label>
                  <Input
                    type="number"
                    value={form.retirement_age_override}
                    onChange={(e) => setForm({ ...form, retirement_age_override: e.target.value })}
                    placeholder={baseAssumptions.retirementAge.toString()}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Life Expectancy</Label>
                  <Input
                    type="number"
                    value={form.life_expectancy_override}
                    onChange={(e) => setForm({ ...form, life_expectancy_override: e.target.value })}
                    placeholder={baseAssumptions.lifeExpectancy.toString()}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Retirement Spending</Label>
                  <Input
                    type="number"
                    value={form.annual_retirement_spending_override}
                    onChange={(e) => setForm({ ...form, annual_retirement_spending_override: e.target.value })}
                    placeholder={baseAssumptions.retirementSpending.toString()}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </div>
            </div>

            {/* Growth Rates */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-zinc-300">Growth Rate Assumptions</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-zinc-400 text-xs">Bitcoin CAGR</Label>
                    <span className="text-orange-400 text-xs">{form.btc_cagr_override || baseAssumptions.btcCagr}%</span>
                  </div>
                  <Slider
                    value={[form.btc_cagr_override !== '' ? parseFloat(form.btc_cagr_override) : baseAssumptions.btcCagr]}
                    onValueChange={([v]) => setForm({ ...form, btc_cagr_override: v })}
                    min={-20}
                    max={100}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-zinc-400 text-xs">Stocks CAGR</Label>
                    <span className="text-blue-400 text-xs">{form.stocks_cagr_override || baseAssumptions.stocksCagr}%</span>
                  </div>
                  <Slider
                    value={[form.stocks_cagr_override !== '' ? parseFloat(form.stocks_cagr_override) : baseAssumptions.stocksCagr]}
                    onValueChange={([v]) => setForm({ ...form, stocks_cagr_override: v })}
                    min={-10}
                    max={20}
                    step={0.5}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-zinc-400 text-xs">Inflation Rate</Label>
                    <span className="text-rose-400 text-xs">{form.inflation_override || baseAssumptions.inflationRate}%</span>
                  </div>
                  <Slider
                    value={[form.inflation_override !== '' ? parseFloat(form.inflation_override) : baseAssumptions.inflationRate]}
                    onValueChange={([v]) => setForm({ ...form, inflation_override: v })}
                    min={0}
                    max={15}
                    step={0.5}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-zinc-400 text-xs">Income Growth</Label>
                    <span className="text-cyan-400 text-xs">{form.income_growth_override || baseAssumptions.incomeGrowth}%</span>
                  </div>
                  <Slider
                    value={[form.income_growth_override !== '' ? parseFloat(form.income_growth_override) : baseAssumptions.incomeGrowth]}
                    onValueChange={([v]) => setForm({ ...form, income_growth_override: v })}
                    min={0}
                    max={10}
                    step={0.5}
                  />
                </div>
              </div>
            </div>

            {/* Market Events */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-zinc-300">Market Events (Optional)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Market Crash Year</Label>
                  <Input
                    type="number"
                    value={form.market_crash_year}
                    onChange={(e) => setForm({ ...form, market_crash_year: e.target.value })}
                    placeholder="e.g., 2028"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Crash Severity (%)</Label>
                  <Input
                    type="number"
                    value={form.crash_severity_percent}
                    onChange={(e) => setForm({ ...form, crash_severity_percent: e.target.value })}
                    placeholder="e.g., 50"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="bg-transparent border-zinc-700">
                Cancel
              </Button>
              <Button type="submit" className="brand-gradient text-white font-semibold">
                {editingScenario ? 'Update Scenario' : 'Create Scenario'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}