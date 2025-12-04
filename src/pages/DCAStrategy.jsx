import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Plus, Pencil, Trash2, ArrowUpRight, Bitcoin, TrendingUp, Calendar, Play, Pause, Info, PieChart, Calculator } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

import DCAvsLumpSum from '@/components/investing/DCAvsLumpSum';

export default function DCAStrategy() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

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
  const [editingPlan, setEditingPlan] = useState(null);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: '',
    asset_ticker: 'BTC',
    strategy_type: 'accumulation', // Always accumulation now
    amount_per_period: '',
    frequency: 'weekly',
    start_date: '',
    target_amount: '',
    current_progress: '',
    is_active: true,
    linked_goal_id: '',
    notes: '',
  });

  const { data: dcaPlans = [] } = useQuery({
    queryKey: ['dcaPlans'],
    queryFn: () => base44.entities.DCAPlan.list(),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list(),
  });

  const { data: budgetItems = [] } = useQuery({
    queryKey: ['budgetItems'],
    queryFn: () => base44.entities.BudgetItem.list(),
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: () => base44.entities.FinancialGoal.list(),
  });

  // Calculate savings from Income & Expenses (single source of truth)
  const budgetFreqMultiplier = { monthly: 12, weekly: 52, biweekly: 26, quarterly: 4, annual: 1, one_time: 0 };
  const monthlyIncome = budgetItems
    .filter(b => b.type === 'income' && b.is_active !== false)
    .reduce((sum, b) => sum + (b.amount * (budgetFreqMultiplier[b.frequency] || 12) / 12), 0);
  const monthlyExpenses = budgetItems
    .filter(b => b.type === 'expense' && b.is_active !== false)
    .reduce((sum, b) => sum + (b.amount * (budgetFreqMultiplier[b.frequency] || 12) / 12), 0);
  const monthlySavings = Math.max(0, monthlyIncome - monthlyExpenses);
  const annualSavings = monthlySavings * 12;

  // Allocation state
  const [btcAllocation, setBtcAllocation] = useState(50);
  const [stocksAllocation, setStocksAllocation] = useState(30);
  const [cashAllocation, setCashAllocation] = useState(20);

  const createPlan = useMutation({
    mutationFn: (data) => base44.entities.DCAPlan.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dcaPlans'] });
      setFormOpen(false);
      resetForm();
    },
  });

  const updatePlan = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DCAPlan.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dcaPlans'] });
      setFormOpen(false);
      setEditingPlan(null);
      resetForm();
    },
  });

  const deletePlan = useMutation({
    mutationFn: (id) => base44.entities.DCAPlan.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dcaPlans'] }),
  });

  const resetForm = () => {
    setFormData({
      name: '',
      asset_ticker: 'BTC',
      strategy_type: 'accumulation',
      amount_per_period: '',
      frequency: 'weekly',
      start_date: '',
      target_amount: '',
      current_progress: '',
      is_active: true,
      linked_goal_id: '',
      notes: '',
    });
  };

  useEffect(() => {
    if (editingPlan) {
      setFormData({
        name: editingPlan.name || '',
        asset_ticker: editingPlan.asset_ticker || 'BTC',
        strategy_type: editingPlan.strategy_type || 'accumulation',
        amount_per_period: editingPlan.amount_per_period || '',
        frequency: editingPlan.frequency || 'weekly',
        start_date: editingPlan.start_date || '',
        target_amount: editingPlan.target_amount || '',
        current_progress: editingPlan.current_progress || '',
        is_active: editingPlan.is_active !== false,
        linked_goal_id: editingPlan.linked_goal_id || '',
        notes: editingPlan.notes || '',
      });
    }
  }, [editingPlan]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      amount_per_period: parseFloat(formData.amount_per_period) || 0,
      target_amount: parseFloat(formData.target_amount) || 0,
      current_progress: parseFloat(formData.current_progress) || 0,
      linked_goal_id: formData.linked_goal_id || null,
    };
    if (editingPlan) {
      updatePlan.mutate({ id: editingPlan.id, data });
    } else {
      createPlan.mutate(data);
    }
  };

  // Calculate totals - accumulation only (withdrawals handled in Projections)
  const activePlans = dcaPlans.filter(p => p.is_active && p.strategy_type === 'accumulation');
  const freqMultiplier = { daily: 30, weekly: 4.33, biweekly: 2.17, monthly: 1 };
  const totalMonthlyDCA = activePlans
    .reduce((sum, p) => sum + (p.amount_per_period * (freqMultiplier[p.frequency] || 1)), 0);

  // Calculated allocation amounts
  const monthlyBtcAmount = (monthlySavings * btcAllocation) / 100;
  const monthlyStocksAmount = (monthlySavings * stocksAllocation) / 100;
  const monthlyCashAmount = (monthlySavings * cashAllocation) / 100;

  // Generate projection chart
  const generateDCAProjection = () => {
    const months = 12;
    const data = [];
    let totalBtc = 0;
    let totalInvested = 0;

    for (let i = 0; i <= months; i++) {
      const monthlyBtc = totalMonthlyDCA / currentPrice;
      totalBtc += monthlyBtc;
      totalInvested += totalMonthlyDCA;
      
      data.push({
        month: i,
        btc: parseFloat(totalBtc.toFixed(4)),
        invested: Math.round(totalInvested),
        value: Math.round(totalBtc * currentPrice),
      });
    }
    return data;
  };

  const projectionData = generateDCAProjection();

  const [activeTab, setActiveTab] = useState('allocation');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Investing</h1>
          <p className="text-zinc-500 mt-1">DCA strategy, fee analysis, and investment planning</p>
        </div>
        <Button
          onClick={() => { setEditingPlan(null); resetForm(); setFormOpen(true); }}
          className="brand-gradient text-white font-semibold hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Plan
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-800/50 p-1">
          <TabsTrigger value="allocation" className="data-[state=active]:bg-zinc-700">
            <PieChart className="w-4 h-4 mr-2" />
            Allocation
          </TabsTrigger>
          <TabsTrigger value="simulator" className="data-[state=active]:bg-zinc-700">
            <Calculator className="w-4 h-4 mr-2" />
            DCA vs Lump Sum
          </TabsTrigger>
          </TabsList>

        <TabsContent value="allocation" className="space-y-6 mt-6">
      {/* Savings Source Card */}
      <div className="card-glass rounded-xl p-6 border border-zinc-800/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Available for Investing</h3>
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger><Info className="w-4 h-4 text-zinc-500" /></TooltipTrigger>
                <TooltipContent className="max-w-xs bg-zinc-800 border-zinc-700">
                  <p>Calculated from Income & Expenses. Adjust your budget to change this amount.</p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </div>
          <Link to={createPageUrl('Budget')} className="text-sm text-orange-400 hover:underline">
            Edit Budget →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-zinc-800/30">
            <p className="text-sm text-zinc-500">Monthly Income</p>
            <p className="text-xl font-bold text-emerald-400">${monthlyIncome.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="p-4 rounded-lg bg-zinc-800/30">
            <p className="text-sm text-zinc-500">Monthly Expenses</p>
            <p className="text-xl font-bold text-rose-400">${monthlyExpenses.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-sm text-zinc-500">Monthly Savings</p>
            <p className="text-2xl font-bold text-emerald-400">${monthlySavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
      </div>

      {/* Allocation Strategy */}
      <div className="card-glass rounded-xl p-6 border border-zinc-800/50">
        <div className="flex items-center gap-2 mb-4">
          <PieChart className="w-5 h-5 text-orange-400" />
          <h3 className="font-semibold">Savings Allocation</h3>
        </div>
        <p className="text-sm text-zinc-500 mb-6">How do you want to allocate your ${monthlySavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}/month savings?</p>
        
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label className="text-zinc-400 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-400" />
                Bitcoin
              </Label>
              <span className="text-orange-400 font-semibold">{btcAllocation}% (${monthlyBtcAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo)</span>
            </div>
            <Slider value={[btcAllocation]} onValueChange={([v]) => {
              setBtcAllocation(v);
              const remaining = 100 - v;
              const ratio = stocksAllocation / (stocksAllocation + cashAllocation) || 0.5;
              setStocksAllocation(Math.round(remaining * ratio));
              setCashAllocation(remaining - Math.round(remaining * ratio));
            }} min={0} max={100} step={5} />
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label className="text-zinc-400 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-400" />
                Stocks/ETFs
              </Label>
              <span className="text-blue-400 font-semibold">{stocksAllocation}% (${monthlyStocksAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo)</span>
            </div>
            <Slider value={[stocksAllocation]} onValueChange={([v]) => {
              setStocksAllocation(v);
              setCashAllocation(Math.max(0, 100 - btcAllocation - v));
            }} min={0} max={100 - btcAllocation} step={5} />
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label className="text-zinc-400 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
                Cash/Bonds
              </Label>
              <span className="text-emerald-400 font-semibold">{cashAllocation}% (${monthlyCashAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo)</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500/50 rounded-full" style={{ width: `${cashAllocation}%` }} />
            </div>
          </div>
        </div>

        {/* Visual allocation bar */}
        <div className="mt-6 h-4 rounded-full overflow-hidden flex">
          <div className="bg-orange-500" style={{ width: `${btcAllocation}%` }} />
          <div className="bg-blue-500" style={{ width: `${stocksAllocation}%` }} />
          <div className="bg-emerald-500" style={{ width: `${cashAllocation}%` }} />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-500 uppercase tracking-wider">Monthly to BTC</span>
            <div className="p-2 rounded-lg bg-orange-400/10">
              <Bitcoin className="w-4 h-4 text-orange-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-orange-400">${monthlyBtcAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
          <p className="text-sm text-zinc-500 mt-1">
            ≈ {(monthlyBtcAmount / currentPrice).toFixed(6)} BTC/mo
          </p>
        </div>

        <div className="card-glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-500 uppercase tracking-wider">Annual to BTC</span>
            <div className="p-2 rounded-lg bg-orange-400/10">
              <TrendingUp className="w-4 h-4 text-orange-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-orange-400">${(monthlyBtcAmount * 12).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
          <p className="text-sm text-zinc-500 mt-1">
            ≈ {((monthlyBtcAmount * 12) / currentPrice).toFixed(4)} BTC/yr
          </p>
        </div>

        <div className="card-glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-500 uppercase tracking-wider">Active Plans</span>
            <div className="p-2 rounded-lg bg-amber-400/10">
              <Calendar className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-amber-400">{activePlans.length}</p>
        </div>
      </div>

      {/* Projection Chart */}
      {monthlyBtcAmount > 0 && (
        <div className="card-glass rounded-2xl p-6">
          <h3 className="font-semibold mb-6">12-Month BTC Accumulation Projection</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={(() => {
                const data = [];
                let totalBtc = 0;
                let totalInvested = 0;
                for (let i = 0; i <= 12; i++) {
                  totalBtc += monthlyBtcAmount / currentPrice;
                  totalInvested += monthlyBtcAmount;
                  data.push({
                    month: i,
                    btc: parseFloat(totalBtc.toFixed(4)),
                    invested: Math.round(totalInvested),
                  });
                }
                return data;
              })()}>
                <defs>
                  <linearGradient id="btcGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F7931A" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#F7931A" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="month" stroke="#71717a" tickFormatter={(m) => `M${m}`} />
                <YAxis stroke="#71717a" tickFormatter={(v) => `${v.toFixed(2)}`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '12px',
                  }}
                  formatter={(value, name) => [
                    name === 'btc' ? `${value} BTC` : `$${value.toLocaleString()}`,
                    name === 'btc' ? 'Accumulated' : 'Invested'
                  ]}
                />
                <Area type="monotone" dataKey="btc" stroke="#F7931A" fill="url(#btcGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6 p-4 rounded-xl bg-zinc-800/30">
            <div className="text-center">
              <p className="text-sm text-zinc-500">Total Invested</p>
              <p className="text-lg font-bold text-zinc-100">${(monthlyBtcAmount * 12).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-zinc-500">BTC Accumulated</p>
              <p className="text-lg font-bold text-amber-400">{((monthlyBtcAmount * 12) / currentPrice).toFixed(4)} BTC</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-zinc-500">At Current Price</p>
              <p className="text-lg font-bold text-emerald-400">${(monthlyBtcAmount * 12).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
        </div>
      )}

      {/* DCA Plans */}
      <div className="card-glass rounded-2xl p-6">
        <h3 className="font-semibold mb-2">Your DCA Plans</h3>
        <p className="text-sm text-zinc-500 mb-6">Schedule recurring buys. Withdrawals are managed in Projections → Retirement Planning.</p>
        {dcaPlans.length === 0 ? (
          <div className="text-center py-12">
            <Bitcoin className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-500">No DCA plans yet. Create your first strategy.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {dcaPlans.map((plan) => {
              const progress = plan.target_amount > 0 ? (plan.current_progress / plan.target_amount) * 100 : 0;
              const monthlyAmount = plan.amount_per_period * (freqMultiplier[plan.frequency] || 1);

              return (
                <div key={plan.id} className={cn(
                  "p-5 rounded-xl transition-colors",
                  plan.is_active ? "bg-zinc-800/30 hover:bg-zinc-800/50" : "bg-zinc-800/10 opacity-50"
                )}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-orange-400/10">
                        <Bitcoin className="w-6 h-6 text-orange-400" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-lg">{plan.name}</h4>
                        <div className="flex items-center gap-2 text-sm text-zinc-500 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-400/10 text-emerald-400">
                        DCA
                        </span>
                        <span>•</span>
                        <span>{plan.asset_ticker}</span>
                        <span>•</span>
                        <span>{plan.frequency}</span>
                        {plan.linked_goal_id && goals.find(g => g.id === plan.linked_goal_id) && (
                        <>
                        <span>•</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-400/10 text-blue-400">
                        → {goals.find(g => g.id === plan.linked_goal_id)?.name}
                        </span>
                        </>
                        )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updatePlan.mutate({ id: plan.id, data: { ...plan, is_active: !plan.is_active } })}
                        className={cn(
                          "p-2 rounded-lg transition-colors",
                          plan.is_active ? "bg-emerald-400/10 text-emerald-400" : "bg-zinc-700 text-zinc-400"
                        )}
                      >
                        {plan.is_active ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => { setEditingPlan(plan); setFormOpen(true); }}
                        className="p-2 rounded-lg hover:bg-zinc-700 transition-colors"
                      >
                        <Pencil className="w-4 h-4 text-zinc-400" />
                      </button>
                      <button
                        onClick={() => deletePlan.mutate(plan.id)}
                        className="p-2 rounded-lg hover:bg-rose-600/50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-zinc-400" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-zinc-500">Per {plan.frequency}</p>
                      <p className="text-lg font-semibold">${plan.amount_per_period.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-zinc-500">Monthly</p>
                      <p className="text-lg font-semibold">${monthlyAmount.toFixed(0)}</p>
                    </div>
                    {plan.target_amount > 0 && (
                      <div>
                        <p className="text-sm text-zinc-500">Target</p>
                        <p className="text-lg font-semibold">${plan.target_amount.toLocaleString()}</p>
                      </div>
                    )}
                  </div>

                  {plan.target_amount > 0 && (
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-zinc-500">Progress</span>
                        <span className="text-amber-400 font-medium">{progress.toFixed(1)}%</span>
                      </div>
                      <Progress value={progress} className="h-2 bg-zinc-700" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

        </TabsContent>

        <TabsContent value="simulator" className="mt-6">
          <DCAvsLumpSum btcPrice={currentPrice} />
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Edit Plan' : 'New DCA Plan'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Plan Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Weekly Bitcoin Stack"
                className="bg-zinc-800 border-zinc-700"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Asset</Label>
              <Input
                value={formData.asset_ticker}
                onChange={(e) => setFormData({ ...formData, asset_ticker: e.target.value.toUpperCase() })}
                className="bg-zinc-800 border-zinc-700"
                placeholder="BTC"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Amount ($)</Label>
                <Input
                  type="number"
                  value={formData.amount_per_period}
                  onChange={(e) => setFormData({ ...formData, amount_per_period: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Frequency</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(value) => setFormData({ ...formData, frequency: value })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Target Amount (optional)</Label>
                <Input
                  type="number"
                  value={formData.target_amount}
                  onChange={(e) => setFormData({ ...formData, target_amount: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Start Date</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Link to Goal (optional)</Label>
              <Select
                value={formData.linked_goal_id || 'none'}
                onValueChange={(value) => setFormData({ ...formData, linked_goal_id: value === 'none' ? '' : value })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue placeholder="No linked goal" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="none">No linked goal</SelectItem>
                  {goals.map(goal => (
                    <SelectItem key={goal.id} value={goal.id}>
                      {goal.name} (${(goal.target_amount || 0).toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                className="data-[state=checked]:bg-orange-500"
              />
              <Label className="text-zinc-400">Active</Label>
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="flex-1 bg-transparent border-zinc-700">
                Cancel
              </Button>
              <Button type="submit" className="flex-1 accent-gradient text-zinc-950 font-semibold">
                {editingPlan ? 'Update' : 'Create'} Plan
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}