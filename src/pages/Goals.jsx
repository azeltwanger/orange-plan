import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Target, TrendingUp, Plus, Pencil, Trash2, Calendar, Home, Car, Briefcase, Heart, DollarSign, Building, Clock, Link2, CreditCard } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import GoalFundingCalculator from '@/components/goals/GoalFundingCalculator';
import FundingSourcesEditor from '@/components/goals/FundingSourcesEditor';

const BUCKET_CONFIG = {
  emergency: {
    name: 'Emergency Fund',
    icon: Shield,
    color: 'emerald',
    description: 'Short-term safety net for unexpected expenses',
    targetMonths: 6,
    bgClass: 'bg-emerald-500/10 border-emerald-500/20',
    textClass: 'text-emerald-400',
    iconBg: 'bg-emerald-500/20',
  },
  goals: {
    name: 'Goal Savings',
    icon: Target,
    color: 'blue',
    description: 'Medium-term targets like house, car, or big purchases',
    bgClass: 'bg-blue-500/10 border-blue-500/20',
    textClass: 'text-blue-400',
    iconBg: 'bg-blue-500/20',
  },
  longterm: {
    name: 'Long-Term Wealth',
    icon: TrendingUp,
    color: 'orange',
    description: 'Retirement, BTC stack, and generational wealth',
    bgClass: 'bg-orange-500/10 border-orange-500/20',
    textClass: 'text-orange-400',
    iconBg: 'bg-orange-500/20',
  },
};

const eventIcons = {
  income_change: Briefcase,
  expense_change: DollarSign,
  asset_purchase: Building,
  asset_sale: TrendingUp,
  retirement: Heart,
  inheritance: Heart,
  major_expense: Car,
  home_purchase: Home,
  other: Calendar,
};

export default function Goals() {
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [expandedBucket, setExpandedBucket] = useState(null);
  const queryClient = useQueryClient();

  // Form states
  const [goalForm, setGoalForm] = useState({
    name: '', target_amount: '', current_amount: '', target_date: '', goal_type: 'major_purchase', priority: 'medium', notes: '', bucket: 'goals', will_be_spent: false, funding_sources: [], linked_dca_plan_id: '', linked_liability_id: '', payoff_years: '', payoff_strategy: 'spread_payments',
  });

  const [eventForm, setEventForm] = useState({
    name: '', event_type: 'major_expense', year: new Date().getFullYear() + 1, amount: '', is_recurring: false, recurring_years: '', affects: 'assets', notes: '',
    monthly_expense_impact: '', liability_amount: '', down_payment: '', interest_rate: '', loan_term_years: '',
    allocation_method: 'proportionate', btc_allocation: 0, stocks_allocation: 0, real_estate_allocation: 0, bonds_allocation: 0, cash_allocation: 0, other_allocation: 0,
  });

  // Queries
  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: () => base44.entities.FinancialGoal.list(),
  });

  const { data: lifeEvents = [] } = useQuery({
    queryKey: ['lifeEvents'],
    queryFn: () => base44.entities.LifeEvent.list(),
  });

  const { data: budgetItems = [] } = useQuery({
    queryKey: ['budgetItems'],
    queryFn: () => base44.entities.BudgetItem.list(),
  });

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const { data: dcaPlans = [] } = useQuery({
    queryKey: ['dcaPlans'],
    queryFn: () => base44.entities.DCAPlan.list(),
  });

  const { data: userSettings = {} } = useQuery({
    queryKey: ['userSettings'],
    queryFn: async () => {
      const settings = await base44.entities.UserSettings.list();
      return settings[0] || {};
    },
  });

  const { data: liabilities = [] } = useQuery({
    queryKey: ['liabilities'],
    queryFn: () => base44.entities.Liability.list(),
  });

  const { data: collateralizedLoans = [] } = useQuery({
    queryKey: ['collateralizedLoans'],
    queryFn: () => base44.entities.CollateralizedLoan.list(),
  });

  const { data: collateralizedLoans = [] } = useQuery({
    queryKey: ['collateralizedLoans'],
    queryFn: () => base44.entities.CollateralizedLoan.list(),
  });

  // Fetch BTC price
  const [btcPrice, setBtcPrice] = React.useState(97000);
  React.useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
      .then(r => r.json())
      .then(data => setBtcPrice(data.bitcoin.usd))
      .catch(() => {});
  }, []);

  // Calculate monthly expenses for emergency fund target
  const freqMultiplier = { monthly: 12, weekly: 52, biweekly: 26, quarterly: 4, annual: 1, one_time: 0 };
  const monthlyBudgetExpenses = budgetItems
    .filter(b => b.type === 'expense' && b.is_active !== false)
    .reduce((sum, b) => sum + (b.amount * (freqMultiplier[b.frequency] || 12) / 12), 0);
  
  const monthlyDebtPayments = liabilities.reduce((sum, liability) => {
    if (liability.monthly_payment && liability.monthly_payment > 0) {
      return sum + liability.monthly_payment;
    }
    return sum;
  }, 0);
  
  const monthlyExpenses = monthlyBudgetExpenses + monthlyDebtPayments;
  
  const monthlyIncome = budgetItems
    .filter(b => b.type === 'income' && b.is_active !== false)
    .reduce((sum, b) => sum + (b.amount * (freqMultiplier[b.frequency] || 12) / 12), 0);
  
  const monthlySavingsAvailable = Math.max(0, monthlyIncome - monthlyExpenses);

  // Categorize goals by bucket
  const categorizeGoal = (goal) => {
    if (goal.goal_type === 'emergency_fund') return 'emergency';
    if (goal.goal_type === 'retirement' || goal.goal_type === 'btc_stack') return 'longterm';
    return 'goals';
  };

  const goalsByBucket = useMemo(() => {
    const buckets = { emergency: [], goals: [], longterm: [] };
    goals.forEach(goal => {
      const bucket = categorizeGoal(goal);
      buckets[bucket].push(goal);
    });
    return buckets;
  }, [goals]);

  // Calculate bucket totals
  const bucketTotals = useMemo(() => {
    const totals = {};
    Object.keys(BUCKET_CONFIG).forEach(bucket => {
      const bucketGoals = goalsByBucket[bucket] || [];
      totals[bucket] = {
        current: bucketGoals.reduce((sum, g) => sum + (g.current_amount || 0), 0),
        target: bucketGoals.reduce((sum, g) => sum + (g.target_amount || 0), 0),
        goalCount: bucketGoals.length,
      };
      });
      return totals;
  }, [goalsByBucket, monthlyExpenses]);

  // Life events sorted by year
  const sortedEvents = useMemo(() => {
    return [...lifeEvents].sort((a, b) => a.year - b.year);
  }, [lifeEvents]);

  // Mutations
  const createGoal = useMutation({
    mutationFn: (data) => base44.entities.FinancialGoal.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['goals'] }); setGoalFormOpen(false); resetGoalForm(); },
  });

  const updateGoal = useMutation({
    mutationFn: ({ id, data }) => base44.entities.FinancialGoal.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['goals'] }); setGoalFormOpen(false); setEditingGoal(null); resetGoalForm(); },
  });

  const deleteGoal = useMutation({
    mutationFn: (id) => base44.entities.FinancialGoal.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['goals'] }),
  });

  const createEvent = useMutation({
    mutationFn: (data) => base44.entities.LifeEvent.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lifeEvents'] }); setEventFormOpen(false); resetEventForm(); },
  });

  const updateEvent = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LifeEvent.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lifeEvents'] }); setEventFormOpen(false); setEditingEvent(null); resetEventForm(); },
  });

  const deleteEvent = useMutation({
    mutationFn: (id) => base44.entities.LifeEvent.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lifeEvents'] }),
  });

  const resetGoalForm = () => setGoalForm({ name: '', target_amount: '', current_amount: '', target_date: '', goal_type: 'major_purchase', priority: 'medium', notes: '', bucket: 'goals', will_be_spent: false, funding_sources: [], linked_dca_plan_id: '', linked_liability_id: '', payoff_years: '', payoff_strategy: 'spread_payments' });
  const resetEventForm = () => setEventForm({ name: '', event_type: 'major_expense', year: new Date().getFullYear() + 1, amount: '', is_recurring: false, recurring_years: '', affects: 'assets', notes: '', monthly_expense_impact: '', liability_amount: '', down_payment: '', interest_rate: '', loan_term_years: '', allocation_method: 'proportionate', btc_allocation: 0, stocks_allocation: 0, real_estate_allocation: 0, bonds_allocation: 0, cash_allocation: 0, other_allocation: 0 });

  useEffect(() => {
    if (editingGoal) {
      setGoalForm({
        name: editingGoal.name || '',
        target_amount: editingGoal.target_amount || '',
        current_amount: editingGoal.current_amount || '',
        target_date: editingGoal.target_date || '',
        goal_type: editingGoal.goal_type || 'major_purchase',
        priority: editingGoal.priority || 'medium',
        notes: editingGoal.notes || '',
        bucket: categorizeGoal(editingGoal),
        will_be_spent: editingGoal.will_be_spent || false,
        funding_sources: editingGoal.funding_sources || [],
        linked_dca_plan_id: editingGoal.linked_dca_plan_id || '',
        linked_liability_id: editingGoal.linked_liability_id || '',
        payoff_years: editingGoal.payoff_years || '',
        payoff_strategy: editingGoal.payoff_strategy || 'spread_payments',
      });
    }
  }, [editingGoal]);

  useEffect(() => {
    if (editingEvent) {
      setEventForm({
        name: editingEvent.name || '',
        event_type: editingEvent.event_type || 'major_expense',
        year: editingEvent.year || new Date().getFullYear() + 1,
        amount: editingEvent.amount || '',
        is_recurring: editingEvent.is_recurring || false,
        recurring_years: editingEvent.recurring_years || '',
        affects: editingEvent.affects || 'assets',
        notes: editingEvent.notes || '',
        monthly_expense_impact: editingEvent.monthly_expense_impact || '',
        liability_amount: editingEvent.liability_amount || '',
        down_payment: editingEvent.down_payment || '',
        interest_rate: editingEvent.interest_rate || '',
        loan_term_years: editingEvent.loan_term_years || '',
        allocation_method: editingEvent.allocation_method || 'proportionate',
        btc_allocation: editingEvent.btc_allocation || 0,
        stocks_allocation: editingEvent.stocks_allocation || 0,
        real_estate_allocation: editingEvent.real_estate_allocation || 0,
        bonds_allocation: editingEvent.bonds_allocation || 0,
        cash_allocation: editingEvent.cash_allocation || 0,
        other_allocation: editingEvent.other_allocation || 0,
      });
    }
  }, [editingEvent]);

  const handleSubmitGoal = (e) => {
    e.preventDefault();
    // Map bucket back to goal_type if needed
    let goalType = goalForm.goal_type;
    if (goalForm.bucket === 'emergency') goalType = 'emergency_fund';
    else if (goalForm.bucket === 'longterm' && goalType === 'major_purchase') goalType = 'retirement';
    
    const data = { 
      ...goalForm, 
      goal_type: goalType,
      target_amount: parseFloat(goalForm.target_amount) || 0, 
      current_amount: parseFloat(goalForm.current_amount) || 0,
      will_be_spent: goalForm.will_be_spent,
      funding_sources: goalForm.funding_sources || [],
      linked_dca_plan_id: goalForm.linked_dca_plan_id || null,
      linked_liability_id: goalForm.linked_liability_id || null,
      payoff_years: parseFloat(goalForm.payoff_years) || null,
      payoff_strategy: goalForm.payoff_strategy || 'spread_payments',
    };
    delete data.bucket;
    editingGoal ? updateGoal.mutate({ id: editingGoal.id, data }) : createGoal.mutate(data);
  };

  const handleSubmitEvent = (e) => {
    e.preventDefault();
    const data = { 
      ...eventForm, 
      year: parseInt(eventForm.year), 
      amount: parseFloat(eventForm.amount) || 0, 
      recurring_years: parseInt(eventForm.recurring_years) || 0,
      monthly_expense_impact: parseFloat(eventForm.monthly_expense_impact) || 0,
      liability_amount: parseFloat(eventForm.liability_amount) || 0,
      down_payment: parseFloat(eventForm.down_payment) || 0,
      interest_rate: parseFloat(eventForm.interest_rate) || 0,
      loan_term_years: parseInt(eventForm.loan_term_years) || 0,
      affects: eventForm.event_type === 'home_purchase' ? 'multiple' : eventForm.affects,
      allocation_method: eventForm.allocation_method || 'proportionate',
      btc_allocation: parseFloat(eventForm.btc_allocation) || 0,
      stocks_allocation: parseFloat(eventForm.stocks_allocation) || 0,
      real_estate_allocation: parseFloat(eventForm.real_estate_allocation) || 0,
      bonds_allocation: parseFloat(eventForm.bonds_allocation) || 0,
      cash_allocation: parseFloat(eventForm.cash_allocation) || 0,
      other_allocation: parseFloat(eventForm.other_allocation) || 0,
    };
    editingEvent ? updateEvent.mutate({ id: editingEvent.id, data }) : createEvent.mutate(data);
  };

  const formatNumber = (num, decimals = 0) => {
    if (num == null || isNaN(num)) return '$0';
    if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(decimals)}k`;
    return `$${num.toLocaleString()}`;
  };

  const openGoalForm = (bucket) => {
    let goalType = 'major_purchase';
    if (bucket === 'emergency') goalType = 'emergency_fund';
    if (bucket === 'longterm') goalType = 'retirement';
    setGoalForm({ ...goalForm, bucket, goal_type: goalType });
    setGoalFormOpen(true);
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Goals & Life Events</h1>
          <p className="text-zinc-500 mt-1">Track savings goals and plan for life changes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { resetEventForm(); setEventFormOpen(true); }} className="bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700">
            <Calendar className="w-4 h-4 mr-2" />
            Life Event
          </Button>
          <Button onClick={() => { resetGoalForm(); setGoalFormOpen(true); }} className="brand-gradient text-white font-semibold">
            <Plus className="w-4 h-4 mr-2" />
            Goal
          </Button>
        </div>
      </div>

      {/* 3 Bucket Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(BUCKET_CONFIG).map(([key, config]) => {
          const Icon = config.icon;
          const total = bucketTotals[key];
          const progress = total.target > 0 ? (total.current / total.target) * 100 : 0;
          const bucketGoals = goalsByBucket[key] || [];
          const isExpanded = expandedBucket === key;
          
          return (
            <div key={key} className={cn("card-premium rounded-2xl border transition-all", config.bgClass)}>
              {/* Bucket Header - Always Visible */}
              <div 
                className="p-5 cursor-pointer"
                onClick={() => setExpandedBucket(isExpanded ? null : key)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={cn("p-2 rounded-xl", config.iconBg)}>
                    <Icon className={cn("w-5 h-5", config.textClass)} />
                  </div>
                  <Badge variant="outline" className={cn("border-current text-xs", config.textClass)}>
                    {bucketGoals.length} goal{bucketGoals.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <h3 className="font-semibold text-zinc-200">{config.name}</h3>
                <p className="text-xs text-zinc-500 mb-3">{config.description}</p>
                
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-zinc-400">{formatNumber(total.current)}</span>
                  <span className={config.textClass}>{formatNumber(total.target)}</span>
                </div>
                <Progress value={Math.min(100, progress)} className={cn("h-2 bg-zinc-800", key === 'emergency' && "[&>div]:bg-emerald-500", key === 'goals' && "[&>div]:bg-blue-500", key === 'longterm' && "[&>div]:bg-orange-500")} />
              </div>

              {/* Expanded Goals List */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-zinc-800/50 pt-4 space-y-3">
                  {bucketGoals.length === 0 ? (
                              <p className="text-sm text-zinc-500 text-center py-2">No goals yet</p>
                            ) : (
                              bucketGoals.map(goal => {
                                const goalProgress = (goal.current_amount || 0) / (goal.target_amount || 1) * 100;
                                const linkedPlan = dcaPlans.find(p => p.id === goal.linked_dca_plan_id);
                                return (
                                  <div key={goal.id} className="p-3 rounded-lg bg-zinc-800/50">
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-zinc-200">{goal.name}</span>
                                        {linkedPlan && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 flex items-center gap-1">
                                            <Link2 className="w-2.5 h-2.5" />
                                            DCA
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex gap-1">
                                        <button onClick={(e) => { e.stopPropagation(); setEditingGoal(goal); setGoalFormOpen(true); }} className="p-1 rounded hover:bg-zinc-700">
                                          <Pencil className="w-3 h-3 text-zinc-500" />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); deleteGoal.mutate(goal.id); }} className="p-1 rounded hover:bg-rose-600/50">
                                          <Trash2 className="w-3 h-3 text-zinc-500" />
                                        </button>
                                      </div>
                                    </div>
                                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                                      <span>{formatNumber(goal.current_amount || 0)}</span>
                                      <span>{goalProgress.toFixed(0)}%</span>
                                    </div>
                                    <Progress value={Math.min(100, goalProgress)} className={cn("h-1.5 bg-zinc-700", key === 'emergency' && "[&>div]:bg-emerald-500", key === 'goals' && "[&>div]:bg-blue-500", key === 'longterm' && "[&>div]:bg-orange-500")} />
                                  </div>
                                );
                              })
                            )}
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={(e) => { e.stopPropagation(); openGoalForm(key); }}
                    className="w-full bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-700 mt-2"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Goal
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Life Events Section */}
      <div className="card-premium rounded-2xl p-5 border border-zinc-800/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-orange-400" />
            Life Events
          </h3>
          <span className="text-sm text-zinc-500">{sortedEvents.length} planned</span>
        </div>

        {sortedEvents.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-4">No life events planned. Add events to see them in your projections.</p>
        ) : (
          <div className="space-y-2">
            {sortedEvents.slice(0, 5).map(event => {
              const Icon = eventIcons[event.event_type] || Calendar;
              const yearsFromNow = event.year - currentYear;
              
              return (
                <div key={event.id} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/30">
                  <div className="w-8 h-8 rounded-lg bg-orange-400/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-orange-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{event.name}</p>
                    <p className="text-xs text-zinc-500">{event.year} • {yearsFromNow > 0 ? `${yearsFromNow}yr` : 'Now'}</p>
                  </div>
                  <p className={cn("text-sm font-semibold", (event.amount || 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {(event.amount || 0) >= 0 ? '+' : ''}{formatNumber(event.amount || 0)}
                  </p>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingEvent(event); setEventFormOpen(true); }} className="p-1 rounded hover:bg-zinc-700">
                      <Pencil className="w-3 h-3 text-zinc-500" />
                    </button>
                    <button onClick={() => deleteEvent.mutate(event.id)} className="p-1 rounded hover:bg-rose-600/50">
                      <Trash2 className="w-3 h-3 text-zinc-500" />
                    </button>
                  </div>
                </div>
              );
            })}
            {sortedEvents.length > 5 && (
              <p className="text-xs text-zinc-500 text-center pt-2">+{sortedEvents.length - 5} more events</p>
            )}
          </div>
        )}
      </div>

      {/* Goal Form Dialog */}
      <Dialog open={goalFormOpen} onOpenChange={setGoalFormOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingGoal ? 'Edit Goal' : 'Add New Goal'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitGoal} className="space-y-5 mt-4">
            <div className="space-y-3">
              <Label className="text-zinc-400 font-medium">Which bucket?</Label>
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(BUCKET_CONFIG).map(([key, config]) => {
                  const Icon = config.icon;
                  const isSelected = goalForm.bucket === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setGoalForm({ ...goalForm, bucket: key })}
                      className={cn(
                        "p-4 rounded-xl border text-center transition-all",
                        isSelected ? "bg-orange-500/20 border-orange-500/50" : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <Icon className={cn("w-6 h-6 mx-auto mb-2", isSelected ? "text-orange-400" : "text-zinc-400")} />
                      <p className={cn("text-xs font-medium leading-tight", isSelected ? "text-orange-400" : "text-zinc-400")}>{config.name}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400">Goal Name</Label>
              <Input 
                value={goalForm.name} 
                onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} 
                placeholder={
                  goalForm.bucket === 'emergency' ? "e.g., 6-Month Emergency Fund" :
                  goalForm.bucket === 'goals' ? "e.g., House Down Payment (3-5 yrs)" :
                  "e.g., Retirement Fund (10+ yrs)"
                }
                className="bg-zinc-900 border-zinc-700 text-zinc-100" 
                required 
              />
            </div>

            {/* Goal Type Selector for non-emergency buckets */}
            {goalForm.bucket !== 'emergency' && (
              <div className="space-y-2">
                <Label className="text-zinc-400">Goal Type</Label>
                <Select 
                  value={goalForm.goal_type} 
                  onValueChange={(value) => setGoalForm({ ...goalForm, goal_type: value })}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {goalForm.bucket === 'goals' && (
                      <>
                        <SelectItem value="major_purchase" className="text-zinc-100">🏠 Major Purchase</SelectItem>
                        <SelectItem value="debt_payoff" className="text-zinc-100">💳 Debt Payoff</SelectItem>
                        <SelectItem value="other" className="text-zinc-100">📝 Other</SelectItem>
                      </>
                    )}
                    {goalForm.bucket === 'longterm' && (
                      <>
                        <SelectItem value="retirement" className="text-zinc-100">🎯 Retirement</SelectItem>
                        <SelectItem value="btc_stack" className="text-zinc-100">₿ BTC Stack</SelectItem>
                        <SelectItem value="debt_payoff" className="text-zinc-100">💳 Debt Payoff</SelectItem>
                        <SelectItem value="other" className="text-zinc-100">📝 Other</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Emergency Fund Quick Presets */}
            {goalForm.bucket === 'emergency' && monthlyExpenses > 0 && (
              <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-400" />
                  <Label className="text-emerald-300 font-medium">Auto-calculate based on monthly expenses</Label>
                </div>
                <p className="text-sm text-zinc-300">
                  Your current monthly expenses: <span className="font-semibold text-emerald-400">${monthlyExpenses.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                  {monthlyDebtPayments > 0 && (
                    <span className="text-zinc-500"> (includes ${monthlyDebtPayments.toLocaleString('en-US', { maximumFractionDigits: 0 })} debt payments)</span>
                  )}
                </p>
                <div className="grid grid-cols-4 gap-3">
                  {[3, 6, 12, 24].map(months => {
                    const amount = monthlyExpenses * months;
                    const isSelected = parseFloat(goalForm.target_amount) === Math.round(amount);
                    return (
                      <button
                        key={months}
                        type="button"
                        onClick={() => setGoalForm({ 
                          ...goalForm, 
                          name: goalForm.name || `${months}-Month Emergency Fund`,
                          target_amount: Math.round(amount).toString() 
                        })}
                        className={cn(
                          "p-3 rounded-lg border text-center transition-all",
                          isSelected 
                            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" 
                            : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600 text-zinc-400"
                        )}
                      >
                        <p className="text-base font-semibold">{months}mo</p>
                        <p className="text-xs mt-1">${(amount / 1000).toFixed(0)}k</p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-zinc-500">
                  Click a preset to auto-fill your target amount. You can adjust it after.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 font-medium">Target Amount ($)</Label>
                <Input type="number" value={goalForm.target_amount} onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })} placeholder="100000" className="bg-zinc-900 border-zinc-700 text-zinc-100 h-11" required />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-medium">Saved So Far ($)</Label>
                <Input type="number" value={goalForm.current_amount} onChange={(e) => setGoalForm({ ...goalForm, current_amount: e.target.value })} placeholder="25000" className="bg-zinc-900 border-zinc-700 text-zinc-100 h-11" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400 font-medium">Target Date (optional)</Label>
              <Input type="date" value={goalForm.target_date} onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })} className="bg-zinc-900 border-zinc-700 text-zinc-100 h-11" />
            </div>

            {/* Will be spent toggle */}
            <div className="p-5 rounded-xl bg-zinc-800/50 border border-zinc-700 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-zinc-300">I plan to spend this</Label>
                  <p className="text-xs text-zinc-500 mt-0.5">Deduct from portfolio in projections at target date</p>
                </div>
                <Switch 
                  checked={goalForm.will_be_spent} 
                  onCheckedChange={(checked) => setGoalForm({ ...goalForm, will_be_spent: checked })}
                  className="data-[state=checked]:bg-orange-500"
                />
              </div>

              {goalForm.will_be_spent && (
                <div className="pt-3 border-t border-zinc-700 space-y-4">
                  <FundingSourcesEditor
                    fundingSources={goalForm.funding_sources}
                    onChange={(sources) => setGoalForm({ ...goalForm, funding_sources: sources })}
                    holdings={holdings}
                    userSettings={userSettings}
                  />
                  <p className="text-xs text-zinc-500">
                    Specify what percentage of assets to sell to fund this goal at target date.
                  </p>
                </div>
              )}
            </div>

            {/* Link to DCA Plan */}
            <div className="space-y-2">
              <Label className="text-zinc-400 flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                Link to Investment Plan (optional)
              </Label>
              <Select 
                value={goalForm.linked_dca_plan_id || 'none'} 
                onValueChange={(value) => setGoalForm({ ...goalForm, linked_dca_plan_id: value === 'none' ? '' : value })}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100">
                  <SelectValue placeholder="No linked plan" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="none" className="text-zinc-100">No linked plan</SelectItem>
                  {dcaPlans.filter(p => p.is_active).map(plan => (
                    <SelectItem key={plan.id} value={plan.id} className="text-zinc-100">
                      {plan.name} (${plan.amount_per_period}/{plan.frequency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500">Connect a DCA plan that contributes to this goal</p>
            </div>

            {/* Link to Liability (for debt_payoff goals) */}
            {goalForm.goal_type === 'debt_payoff' && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-rose-400" />
                  <Label className="text-rose-300 font-medium">Debt Payoff Settings</Label>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-zinc-400">Link to Liability or Loan</Label>
                  <Select 
                    value={goalForm.linked_liability_id || 'none'} 
                    onValueChange={(value) => {
                      const liability = liabilities.find(l => l.id === value);
                      const loan = collateralizedLoans.find(l => `loan_${l.id}` === value);
                      const selectedDebt = liability || loan;
                      
                      setGoalForm({ 
                        ...goalForm, 
                        linked_liability_id: value === 'none' ? '' : value,
                        target_amount: selectedDebt ? selectedDebt.current_balance : goalForm.target_amount,
                        name: selectedDebt && !goalForm.name ? `Pay off ${selectedDebt.name}` : goalForm.name,
                      });
                    }}
                  >
                    <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100">
                      <SelectValue placeholder="Select a liability..." />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      <SelectItem value="none" className="text-zinc-100">No linked liability</SelectItem>
                      {liabilities.map(liability => (
                        <SelectItem key={liability.id} value={liability.id} className="text-zinc-100">
                          {liability.name} (${(liability.current_balance || 0).toLocaleString()} @ {liability.interest_rate || 0}%)
                        </SelectItem>
                      ))}
                      {collateralizedLoans.map(loan => (
                        <SelectItem key={loan.id} value={`loan_${loan.id}`} className="text-zinc-100">
                          {loan.name} - Collateralized (${(loan.current_balance || 0).toLocaleString()} @ {loan.interest_rate || 0}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label className="text-zinc-400">Payoff Strategy</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setGoalForm({ ...goalForm, payoff_strategy: 'spread_payments' })}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all",
                        goalForm.payoff_strategy === 'spread_payments'
                          ? "bg-rose-500/20 border-rose-500/50"
                          : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <p className={cn("font-medium text-sm", goalForm.payoff_strategy === 'spread_payments' ? "text-rose-400" : "text-zinc-200")}>
                        Spread Payments
                      </p>
                      <p className="text-xs text-zinc-400 mt-1">Pay over multiple years</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGoalForm({ ...goalForm, payoff_strategy: 'lump_sum' })}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all",
                        goalForm.payoff_strategy === 'lump_sum'
                          ? "bg-rose-500/20 border-rose-500/50"
                          : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <p className={cn("font-medium text-sm", goalForm.payoff_strategy === 'lump_sum' ? "text-rose-400" : "text-zinc-200")}>
                        Lump Sum
                      </p>
                      <p className="text-xs text-zinc-400 mt-1">Pay off all at once</p>
                    </button>
                  </div>
                </div>

                {goalForm.payoff_strategy === 'spread_payments' && (
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Payoff Period (years)</Label>
                    <Input 
                      type="number" 
                      value={goalForm.payoff_years} 
                      onChange={(e) => setGoalForm({ ...goalForm, payoff_years: e.target.value })} 
                      placeholder="e.g., 5" 
                      className="bg-zinc-900 border-zinc-700 text-zinc-100" 
                    />
                    <p className="text-xs text-zinc-500">
                      How many years to pay off this debt? This will be factored into retirement projections as annual withdrawals from investments.
                    </p>
                  </div>
                )}

                {goalForm.payoff_strategy === 'lump_sum' && (
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Payoff Date</Label>
                    <p className="text-xs text-zinc-500 mb-2">
                      Use the "Target Date" field above to specify when you'll pay off this debt in full from your portfolio.
                    </p>
                  </div>
                )}

                {goalForm.linked_liability_id && goalForm.payoff_strategy === 'spread_payments' && goalForm.payoff_years && parseFloat(goalForm.target_amount) > 0 && (
                  <div className="p-3 rounded-lg bg-zinc-800/50">
                    <p className="text-sm text-zinc-300">
                      Annual payment needed: <span className="font-semibold text-rose-400">
                        ${Math.round(parseFloat(goalForm.target_amount) / parseFloat(goalForm.payoff_years)).toLocaleString()}/yr
                      </span>
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      This will be withdrawn from your portfolio each year during the payoff period.
                    </p>
                  </div>
                )}

                {goalForm.linked_liability_id && goalForm.payoff_strategy === 'lump_sum' && goalForm.target_date && parseFloat(goalForm.target_amount) > 0 && (
                  <div className="p-3 rounded-lg bg-zinc-800/50">
                    <p className="text-sm text-zinc-300">
                      Lump sum payment: <span className="font-semibold text-rose-400">
                        ${parseFloat(goalForm.target_amount).toLocaleString()}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      This will be withdrawn from your portfolio at {new Date(goalForm.target_date).getFullYear()}.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Funding Calculator */}
            {goalForm.target_amount && goalForm.target_date && (
              <GoalFundingCalculator
                targetAmount={parseFloat(goalForm.target_amount) || 0}
                currentAmount={parseFloat(goalForm.current_amount) || 0}
                targetDate={goalForm.target_date}
                fundingSources={goalForm.funding_sources}
                userSettings={userSettings}
                monthlySavingsAvailable={monthlySavingsAvailable}
                btcPrice={btcPrice}
                linkedDcaPlan={dcaPlans.find(p => p.id === goalForm.linked_dca_plan_id)}
              />
            )}

            <div className="flex gap-3 pt-6 border-t border-zinc-800">
              <Button type="button" variant="outline" onClick={() => { setGoalFormOpen(false); setEditingGoal(null); resetGoalForm(); }} className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700 h-11">Cancel</Button>
              <Button type="submit" className="flex-1 brand-gradient text-white font-semibold h-11">{editingGoal ? 'Update' : 'Add'} Goal</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Event Form Dialog */}
      <Dialog open={eventFormOpen} onOpenChange={setEventFormOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingEvent ? 'Edit Life Event' : 'Plan a Life Event'}</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-500 -mt-2">Model future expenses or income changes.</p>
          <form onSubmit={handleSubmitEvent} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-zinc-400">Event Name</Label>
              <Input value={eventForm.name} onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })} placeholder="e.g., Buy a house" className="bg-zinc-900 border-zinc-700 text-zinc-100" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Event Type</Label>
                <Select value={eventForm.event_type} onValueChange={(value) => setEventForm({ ...eventForm, event_type: value })}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
                    <SelectItem value="home_purchase" className="text-zinc-100">🏠 Home Purchase</SelectItem>
                    <SelectItem value="major_expense" className="text-zinc-100">💸 Major Expense</SelectItem>
                    <SelectItem value="expense_change" className="text-zinc-100">📊 Expense Change</SelectItem>
                    <SelectItem value="income_change" className="text-zinc-100">💼 Income Change</SelectItem>
                    <SelectItem value="inheritance" className="text-zinc-100">🎁 Inheritance</SelectItem>
                    <SelectItem value="other" className="text-zinc-100">📝 Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Year</Label>
                <Input type="number" value={eventForm.year} onChange={(e) => setEventForm({ ...eventForm, year: e.target.value })} className="bg-zinc-900 border-zinc-700 text-zinc-100" required />
              </div>
            </div>

            {eventForm.event_type === 'home_purchase' ? (
              <>
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs text-blue-400">🏠 Tip: Create a Goal to track saving for your down payment!</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Home Price ($)</Label>
                    <Input type="number" value={eventForm.amount} onChange={(e) => setEventForm({ ...eventForm, amount: e.target.value })} placeholder="500000" className="bg-zinc-900 border-zinc-700 text-zinc-100" required />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Down Payment ($)</Label>
                    <Input type="number" value={eventForm.down_payment} onChange={(e) => setEventForm({ ...eventForm, down_payment: e.target.value })} placeholder="100000" className="bg-zinc-900 border-zinc-700 text-zinc-100" />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label className="text-zinc-400">Amount ($)</Label>
                <Input type="number" value={eventForm.amount} onChange={(e) => setEventForm({ ...eventForm, amount: e.target.value })} placeholder="-50000 (negative = expense)" className="bg-zinc-900 border-zinc-700 text-zinc-100" required />
              </div>
            )}

            <div className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700">
              <Switch checked={eventForm.is_recurring} onCheckedChange={(checked) => setEventForm({ ...eventForm, is_recurring: checked })} className="data-[state=checked]:bg-orange-500" />
              <div className="flex-1">
                <Label className="text-zinc-300">Recurring for multiple years</Label>
                {eventForm.is_recurring && (
                  <Input type="number" value={eventForm.recurring_years} onChange={(e) => setEventForm({ ...eventForm, recurring_years: e.target.value })} placeholder="How many years?" className="bg-zinc-900 border-zinc-700 text-zinc-100 mt-2" />
                )}
              </div>
            </div>

            {/* Investment Allocation - Only show for positive asset impacts (inheritance, windfall, etc.) */}
            {eventForm.affects === 'assets' && parseFloat(eventForm.amount) > 0 && (
              <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-orange-400" />
                  <Label className="text-orange-300 font-medium">How will you invest this capital?</Label>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEventForm({ ...eventForm, allocation_method: 'proportionate' })}
                    className={cn(
                      "flex-1 p-3 rounded-lg border text-left transition-all",
                      eventForm.allocation_method === 'proportionate'
                        ? "bg-orange-500/20 border-orange-500/50"
                        : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                    )}
                  >
                    <p className={cn("font-medium text-sm", eventForm.allocation_method === 'proportionate' ? "text-orange-400" : "text-zinc-200")}>
                      Match Current Portfolio
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">Invest proportional to existing assets</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEventForm({ ...eventForm, allocation_method: 'custom' })}
                    className={cn(
                      "flex-1 p-3 rounded-lg border text-left transition-all",
                      eventForm.allocation_method === 'custom'
                        ? "bg-orange-500/20 border-orange-500/50"
                        : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                    )}
                  >
                    <p className={cn("font-medium text-sm", eventForm.allocation_method === 'custom' ? "text-orange-400" : "text-zinc-200")}>
                      Custom Allocation
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">Specify exactly where to invest</p>
                  </button>
                </div>

                {eventForm.allocation_method === 'custom' && (
                  <div className="space-y-3 pt-3 border-t border-zinc-700">
                    {[
                      { key: 'btc_allocation', label: 'Bitcoin', color: 'text-orange-400' },
                      { key: 'stocks_allocation', label: 'Stocks', color: 'text-blue-400' },
                      { key: 'real_estate_allocation', label: 'Real Estate', color: 'text-emerald-400' },
                      { key: 'bonds_allocation', label: 'Bonds', color: 'text-purple-400' },
                      { key: 'cash_allocation', label: 'Cash', color: 'text-cyan-400' },
                      { key: 'other_allocation', label: 'Other', color: 'text-zinc-400' },
                    ].map(({ key, label, color }) => (
                      <div key={key} className="flex items-center gap-3">
                        <Label className={cn("w-24 text-sm", color)}>{label}</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={eventForm[key]}
                          onChange={(e) => setEventForm({ ...eventForm, [key]: e.target.value })}
                          placeholder="0"
                          className="flex-1 bg-zinc-900 border-zinc-700 text-zinc-100"
                        />
                        <span className="text-xs text-zinc-500 w-8">%</span>
                      </div>
                    ))}
                    {(() => {
                      const total = 
                        (parseFloat(eventForm.btc_allocation) || 0) +
                        (parseFloat(eventForm.stocks_allocation) || 0) +
                        (parseFloat(eventForm.real_estate_allocation) || 0) +
                        (parseFloat(eventForm.bonds_allocation) || 0) +
                        (parseFloat(eventForm.cash_allocation) || 0) +
                        (parseFloat(eventForm.other_allocation) || 0);
                      const isValid = Math.abs(total - 100) < 0.01;
                      return (
                        <div className={cn(
                          "p-2 rounded-lg text-sm font-medium text-center",
                          isValid ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                        )}>
                          Total: {total.toFixed(1)}% {isValid ? '✓' : '(must equal 100%)'}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => { setEventFormOpen(false); setEditingEvent(null); resetEventForm(); }} className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700">Cancel</Button>
              <Button type="submit" className="flex-1 brand-gradient text-white font-semibold">{editingEvent ? 'Update' : 'Add'} Event</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}