import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Plus, Pencil, Trash2, ArrowUpRight, ArrowDownRight, Bitcoin, TrendingUp, Calendar, Play, Pause } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

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
    strategy_type: 'accumulation',
    amount_per_period: '',
    frequency: 'weekly',
    start_date: '',
    target_amount: '',
    current_progress: '',
    is_active: true,
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
    };
    if (editingPlan) {
      updatePlan.mutate({ id: editingPlan.id, data });
    } else {
      createPlan.mutate(data);
    }
  };

  // Calculate totals
  const activePlans = dcaPlans.filter(p => p.is_active);
  const freqMultiplier = { daily: 30, weekly: 4.33, biweekly: 2.17, monthly: 1 };
  const totalMonthlyDCA = activePlans
    .filter(p => p.strategy_type === 'accumulation')
    .reduce((sum, p) => sum + (p.amount_per_period * (freqMultiplier[p.frequency] || 1)), 0);

  const totalMonthlyWithdrawal = activePlans
    .filter(p => p.strategy_type === 'withdrawal')
    .reduce((sum, p) => sum + (p.amount_per_period * (freqMultiplier[p.frequency] || 1)), 0);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">DCA Strategy</h1>
          <p className="text-zinc-500 mt-1">Manage accumulation and withdrawal plans</p>
        </div>
        <Button
          onClick={() => { setEditingPlan(null); resetForm(); setFormOpen(true); }}
          className="accent-gradient text-zinc-950 font-semibold hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Plan
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-500 uppercase tracking-wider">Monthly DCA</span>
            <div className="p-2 rounded-lg bg-emerald-400/10">
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-emerald-400">${totalMonthlyDCA.toLocaleString()}</p>
          <p className="text-sm text-zinc-500 mt-1">
            ≈ {(totalMonthlyDCA / currentPrice).toFixed(6)} BTC/mo
          </p>
        </div>

        <div className="card-glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-500 uppercase tracking-wider">Monthly Withdrawal</span>
            <div className="p-2 rounded-lg bg-rose-400/10">
              <ArrowDownRight className="w-4 h-4 text-rose-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-rose-400">${totalMonthlyWithdrawal.toLocaleString()}</p>
        </div>

        <div className="card-glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-500 uppercase tracking-wider">Active Plans</span>
            <div className="p-2 rounded-lg bg-amber-400/10">
              <TrendingUp className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-amber-400">{activePlans.length}</p>
        </div>
      </div>

      {/* Projection Chart */}
      {totalMonthlyDCA > 0 && (
        <div className="card-glass rounded-2xl p-6">
          <h3 className="font-semibold mb-6">12-Month DCA Projection</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectionData}>
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
                    name === 'btc' ? 'Accumulated' : name === 'invested' ? 'Invested' : 'Value'
                  ]}
                />
                <Area type="monotone" dataKey="btc" stroke="#F7931A" fill="url(#btcGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6 p-4 rounded-xl bg-zinc-800/30">
            <div className="text-center">
              <p className="text-sm text-zinc-500">Total Invested</p>
              <p className="text-lg font-bold text-zinc-100">${(totalMonthlyDCA * 12).toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-zinc-500">BTC Accumulated</p>
              <p className="text-lg font-bold text-amber-400">{((totalMonthlyDCA * 12) / currentPrice).toFixed(4)} BTC</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-zinc-500">At Current Price</p>
              <p className="text-lg font-bold text-emerald-400">${(totalMonthlyDCA * 12).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* DCA Plans */}
      <div className="card-glass rounded-2xl p-6">
        <h3 className="font-semibold mb-6">Your DCA Plans</h3>
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
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center",
                        plan.strategy_type === 'accumulation' ? 'bg-emerald-400/10' : 'bg-rose-400/10'
                      )}>
                        {plan.strategy_type === 'accumulation' ? (
                          <ArrowUpRight className="w-6 h-6 text-emerald-400" />
                        ) : (
                          <ArrowDownRight className="w-6 h-6 text-rose-400" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-semibold text-lg">{plan.name}</h4>
                        <div className="flex items-center gap-2 text-sm text-zinc-500">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-xs font-medium",
                            plan.strategy_type === 'accumulation' 
                              ? 'bg-emerald-400/10 text-emerald-400' 
                              : 'bg-rose-400/10 text-rose-400'
                          )}>
                            {plan.strategy_type}
                          </span>
                          <span>•</span>
                          <span>{plan.asset_ticker}</span>
                          <span>•</span>
                          <span>{plan.frequency}</span>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Strategy</Label>
                <Select
                  value={formData.strategy_type}
                  onValueChange={(value) => setFormData({ ...formData, strategy_type: value })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="accumulation">Accumulation</SelectItem>
                    <SelectItem value="withdrawal">Withdrawal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Asset</Label>
                <Input
                  value={formData.asset_ticker}
                  onChange={(e) => setFormData({ ...formData, asset_ticker: e.target.value.toUpperCase() })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
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
            <div className="flex items-center gap-3">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
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