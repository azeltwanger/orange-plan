import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Target, Plus, Pencil, Trash2, TrendingUp, Calendar, Bitcoin } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export default function FinancialPlan() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [btcCagr, setBtcCagr] = useState(25);

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
  const [otherCagr, setOtherCagr] = useState(7);
  const [retirementAge, setRetirementAge] = useState(65);
  const [currentAge, setCurrentAge] = useState(35);
  const [annualSpending, setAnnualSpending] = useState(100000);
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const queryClient = useQueryClient();

  const [goalForm, setGoalForm] = useState({
    name: '',
    target_amount: '',
    current_amount: '',
    target_date: '',
    goal_type: 'other',
    priority: 'medium',
    notes: '',
  });

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: () => base44.entities.FinancialGoal.list(),
  });

  const createGoal = useMutation({
    mutationFn: (data) => base44.entities.FinancialGoal.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setGoalFormOpen(false);
      resetForm();
    },
  });

  const updateGoal = useMutation({
    mutationFn: ({ id, data }) => base44.entities.FinancialGoal.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setGoalFormOpen(false);
      setEditingGoal(null);
      resetForm();
    },
  });

  const deleteGoal = useMutation({
    mutationFn: (id) => base44.entities.FinancialGoal.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['goals'] }),
  });

  const resetForm = () => {
    setGoalForm({
      name: '',
      target_amount: '',
      current_amount: '',
      target_date: '',
      goal_type: 'other',
      priority: 'medium',
      notes: '',
    });
  };

  useEffect(() => {
    if (editingGoal) {
      setGoalForm({
        name: editingGoal.name || '',
        target_amount: editingGoal.target_amount || '',
        current_amount: editingGoal.current_amount || '',
        target_date: editingGoal.target_date || '',
        goal_type: editingGoal.goal_type || 'other',
        priority: editingGoal.priority || 'medium',
        notes: editingGoal.notes || '',
      });
    }
  }, [editingGoal]);

  // Calculate current portfolio
  const btcValue = holdings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity * currentPrice, 0);
  const otherValue = holdings.filter(h => h.ticker !== 'BTC').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const totalValue = btcValue + otherValue;

  // Generate projection data
  const generateProjections = () => {
    const years = retirementAge - currentAge;
    const data = [];
    
    for (let i = 0; i <= years; i++) {
      const btcProjected = btcValue * Math.pow(1 + btcCagr / 100, i);
      const otherProjected = otherValue * Math.pow(1 + otherCagr / 100, i);
      const total = btcProjected + otherProjected;
      
      data.push({
        age: currentAge + i,
        year: new Date().getFullYear() + i,
        btc: Math.round(btcProjected),
        other: Math.round(otherProjected),
        total: Math.round(total),
      });
    }
    return data;
  };

  const projections = generateProjections();
  const retirementValue = projections[projections.length - 1]?.total || 0;
  const withdrawalRate = 0.04;
  const sustainableWithdrawal = retirementValue * withdrawalRate;
  const canRetire = sustainableWithdrawal >= annualSpending;

  const handleSubmitGoal = (e) => {
    e.preventDefault();
    const data = {
      ...goalForm,
      target_amount: parseFloat(goalForm.target_amount) || 0,
      current_amount: parseFloat(goalForm.current_amount) || 0,
    };
    
    if (editingGoal) {
      updateGoal.mutate({ id: editingGoal.id, data });
    } else {
      createGoal.mutate(data);
    }
  };

  const goalTypeColors = {
    retirement: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
    btc_stack: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    emergency_fund: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    major_purchase: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    debt_payoff: 'bg-rose-400/10 text-rose-400 border-rose-400/20',
    other: 'bg-zinc-400/10 text-zinc-400 border-zinc-400/20',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Financial Plan</h1>
          <p className="text-zinc-500 mt-1">Project your wealth and set goals</p>
        </div>
        <Button
          onClick={() => { setEditingGoal(null); resetForm(); setGoalFormOpen(true); }}
          className="accent-gradient text-zinc-950 font-semibold hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Goal
        </Button>
      </div>

      {/* CAGR Sliders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-glass rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-amber-400/10">
              <Bitcoin className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold">Bitcoin CAGR Assumption</h3>
              <p className="text-sm text-zinc-500">Annual growth rate projection</p>
            </div>
          </div>
          <div className="space-y-4">
            <Slider
              value={[btcCagr]}
              onValueChange={([v]) => setBtcCagr(v)}
              min={0}
              max={100}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">0%</span>
              <span className="text-amber-400 font-bold text-lg">{btcCagr}%</span>
              <span className="text-zinc-500">100%</span>
            </div>
          </div>
        </div>

        <div className="card-glass rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-blue-400/10">
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold">Other Assets CAGR</h3>
              <p className="text-sm text-zinc-500">Stocks, bonds, real estate</p>
            </div>
          </div>
          <div className="space-y-4">
            <Slider
              value={[otherCagr]}
              onValueChange={([v]) => setOtherCagr(v)}
              min={0}
              max={30}
              step={0.5}
              className="w-full"
            />
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">0%</span>
              <span className="text-blue-400 font-bold text-lg">{otherCagr}%</span>
              <span className="text-zinc-500">30%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Retirement Settings */}
      <div className="card-glass rounded-2xl p-6">
        <h3 className="font-semibold mb-6">Retirement Planning</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label className="text-zinc-400">Current Age</Label>
            <Input
              type="number"
              value={currentAge}
              onChange={(e) => setCurrentAge(parseInt(e.target.value) || 0)}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400">Target Retirement Age</Label>
            <Input
              type="number"
              value={retirementAge}
              onChange={(e) => setRetirementAge(parseInt(e.target.value) || 65)}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400">Annual Spending Need</Label>
            <Input
              type="number"
              value={annualSpending}
              onChange={(e) => setAnnualSpending(parseInt(e.target.value) || 0)}
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
        </div>

        {/* Retirement Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 p-4 rounded-xl bg-zinc-800/30">
          <div>
            <p className="text-sm text-zinc-500">Projected at Retirement</p>
            <p className="text-2xl font-bold text-amber-400">${(retirementValue / 1000000).toFixed(2)}M</p>
          </div>
          <div>
            <p className="text-sm text-zinc-500">Safe Withdrawal (4%)</p>
            <p className="text-2xl font-bold text-emerald-400">${(sustainableWithdrawal / 1000).toFixed(0)}k/yr</p>
          </div>
          <div>
            <p className="text-sm text-zinc-500">Retirement Status</p>
            <p className={cn("text-2xl font-bold", canRetire ? "text-emerald-400" : "text-rose-400")}>
              {canRetire ? 'On Track ✓' : 'Needs Work'}
            </p>
          </div>
        </div>
      </div>

      {/* Projection Chart */}
      <div className="card-glass rounded-2xl p-6">
        <h3 className="font-semibold mb-6">Wealth Projection</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projections}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="age" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #27272a',
                  borderRadius: '12px',
                }}
                formatter={(value) => [`$${value.toLocaleString()}`, '']}
                labelFormatter={(age) => `Age ${age}`}
              />
              <ReferenceLine x={retirementAge} stroke="#F7931A" strokeDasharray="5 5" />
              <Line type="monotone" dataKey="btc" stroke="#F7931A" strokeWidth={2} dot={false} name="Bitcoin" />
              <Line type="monotone" dataKey="other" stroke="#60a5fa" strokeWidth={2} dot={false} name="Other Assets" />
              <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={false} name="Total" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="text-sm text-zinc-400">Bitcoin</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-400" />
            <span className="text-sm text-zinc-400">Other</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
            <span className="text-sm text-zinc-400">Total</span>
          </div>
        </div>
      </div>

      {/* Goals */}
      <div className="card-glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold">Financial Goals</h3>
          <span className="text-sm text-zinc-500">{goals.length} goals</span>
        </div>
        
        {goals.length === 0 ? (
          <div className="text-center py-12">
            <Target className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-500">No goals set yet. Add your first financial goal.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {goals.map((goal) => {
              const progress = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
              return (
                <div key={goal.id} className="p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "px-2 py-1 rounded-lg text-xs font-medium border",
                        goalTypeColors[goal.goal_type]
                      )}>
                        {goal.goal_type?.replace('_', ' ')}
                      </span>
                      <h4 className="font-medium">{goal.name}</h4>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditingGoal(goal); setGoalFormOpen(true); }}
                        className="p-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                      <button
                        onClick={() => deleteGoal.mutate(goal.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-600/50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-2 text-sm">
                    <span className="text-zinc-400">${(goal.current_amount || 0).toLocaleString()} / ${goal.target_amount.toLocaleString()}</span>
                    <span className="font-medium text-amber-400">{progress.toFixed(0)}%</span>
                  </div>
                  <Progress value={progress} className="h-2 bg-zinc-700" />
                  {goal.target_date && (
                    <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Target: {new Date(goal.target_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Goal Form Dialog */}
      <Dialog open={goalFormOpen} onOpenChange={setGoalFormOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGoal ? 'Edit Goal' : 'Add Goal'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitGoal} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Goal Name</Label>
              <Input
                value={goalForm.name}
                onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Target Amount</Label>
                <Input
                  type="number"
                  value={goalForm.target_amount}
                  onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Current Amount</Label>
                <Input
                  type="number"
                  value={goalForm.current_amount}
                  onChange={(e) => setGoalForm({ ...goalForm, current_amount: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Goal Type</Label>
                <Select
                  value={goalForm.goal_type}
                  onValueChange={(value) => setGoalForm({ ...goalForm, goal_type: value })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="retirement">Retirement</SelectItem>
                    <SelectItem value="btc_stack">BTC Stack</SelectItem>
                    <SelectItem value="emergency_fund">Emergency Fund</SelectItem>
                    <SelectItem value="major_purchase">Major Purchase</SelectItem>
                    <SelectItem value="debt_payoff">Debt Payoff</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Target Date</Label>
                <Input
                  type="date"
                  value={goalForm.target_date}
                  onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setGoalFormOpen(false)} className="flex-1 bg-transparent border-zinc-700">
                Cancel
              </Button>
              <Button type="submit" className="flex-1 accent-gradient text-zinc-950 font-semibold">
                {editingGoal ? 'Update' : 'Add'} Goal
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}