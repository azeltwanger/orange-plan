import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Target, TrendingUp, Plus, Pencil, Trash2, Calendar, Home, Car, Briefcase, Heart, DollarSign, Building, Clock } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
    name: '', target_amount: '', current_amount: '', target_date: '', goal_type: 'major_purchase', priority: 'medium', notes: '', bucket: 'goals',
  });

  const [eventForm, setEventForm] = useState({
    name: '', event_type: 'major_expense', year: new Date().getFullYear() + 1, amount: '', is_recurring: false, recurring_years: '', affects: 'assets', notes: '',
    monthly_expense_impact: '', liability_amount: '', down_payment: '', interest_rate: '', loan_term_years: '',
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

  // Calculate monthly expenses for emergency fund target
  const freqMultiplier = { monthly: 12, weekly: 52, biweekly: 26, quarterly: 4, annual: 1, one_time: 0 };
  const monthlyExpenses = budgetItems
    .filter(b => b.type === 'expense' && b.is_active !== false)
    .reduce((sum, b) => sum + (b.amount * (freqMultiplier[b.frequency] || 12) / 12), 0);

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
    // Emergency fund special: target is 6 months expenses
    if (totals.emergency.target === 0) {
      totals.emergency.target = monthlyExpenses * 6;
    }
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

  const resetGoalForm = () => setGoalForm({ name: '', target_amount: '', current_amount: '', target_date: '', goal_type: 'major_purchase', priority: 'medium', notes: '', bucket: 'goals' });
  const resetEventForm = () => setEventForm({ name: '', event_type: 'major_expense', year: new Date().getFullYear() + 1, amount: '', is_recurring: false, recurring_years: '', affects: 'assets', notes: '', monthly_expense_impact: '', liability_amount: '', down_payment: '', interest_rate: '', loan_term_years: '' });

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
      current_amount: parseFloat(goalForm.current_amount) || 0 
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
    setSelectedBucket(bucket);
    let goalType = 'major_purchase';
    if (bucket === 'emergency') goalType = 'emergency_fund';
    if (bucket === 'longterm') goalType = 'retirement';
    setGoalForm({ ...goalForm, bucket, goal_type: goalType });
    setGoalFormOpen(true);
  };

  // Calculate months to goal
  const getMonthsToGoal = (goal) => {
    if (!goal.target_date) return null;
    const targetDate = new Date(goal.target_date);
    const now = new Date();
    const months = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());
    return Math.max(0, months);
  };

  // Calculate monthly needed
  const getMonthlyNeeded = (goal) => {
    const months = getMonthsToGoal(goal);
    if (!months || months <= 0) return 0;
    const remaining = (goal.target_amount || 0) - (goal.current_amount || 0);
    return remaining / months;
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Goals & Life Events</h1>
          <p className="text-zinc-500 mt-1">Plan your financial future with the 3-bucket strategy</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { resetEventForm(); setEventFormOpen(true); }} className="bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700">
            <Calendar className="w-4 h-4 mr-2" />
            Add Life Event
          </Button>
          <Button onClick={() => { resetGoalForm(); setGoalFormOpen(true); }} className="brand-gradient text-white font-semibold">
            <Plus className="w-4 h-4 mr-2" />
            Add Goal
          </Button>
        </div>
      </div>

      {/* 3 Bucket Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(BUCKET_CONFIG).map(([key, config]) => {
          const Icon = config.icon;
          const total = bucketTotals[key];
          const progress = total.target > 0 ? (total.current / total.target) * 100 : 0;
          const bucketGoals = goalsByBucket[key] || [];
          
          return (
            <div 
              key={key} 
              className={cn("card-premium rounded-2xl p-5 border cursor-pointer transition-all hover:scale-[1.02]", config.bgClass)}
              onClick={() => setActiveTab(key)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={cn("p-2.5 rounded-xl", config.iconBg)}>
                  <Icon className={cn("w-5 h-5", config.textClass)} />
                </div>
                <Badge variant="outline" className={cn("border-current", config.textClass)}>
                  {bucketGoals.length} goal{bucketGoals.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <h3 className="font-semibold text-zinc-200 mb-1">{config.name}</h3>
              <p className="text-xs text-zinc-500 mb-3">{config.description}</p>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">{formatNumber(total.current)}</span>
                  <span className={config.textClass}>{formatNumber(total.target)}</span>
                </div>
                <Progress value={Math.min(100, progress)} className="h-2 bg-zinc-800" />
                <p className={cn("text-xs font-medium", progress >= 100 ? "text-emerald-400" : config.textClass)}>
                  {progress >= 100 ? '✓ Fully funded' : `${progress.toFixed(0)}% complete`}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-zinc-800/50 p-1 flex-wrap">
          <TabsTrigger value="overview" className="data-[state=active]:bg-zinc-700">Overview</TabsTrigger>
          <TabsTrigger value="emergency" className="data-[state=active]:bg-zinc-700">
            <Shield className="w-4 h-4 mr-1.5" />Emergency
          </TabsTrigger>
          <TabsTrigger value="goals" className="data-[state=active]:bg-zinc-700">
            <Target className="w-4 h-4 mr-1.5" />Goals
          </TabsTrigger>
          <TabsTrigger value="longterm" className="data-[state=active]:bg-zinc-700">
            <TrendingUp className="w-4 h-4 mr-1.5" />Long-Term
          </TabsTrigger>
          <TabsTrigger value="events" className="data-[state=active]:bg-zinc-700">
            <Calendar className="w-4 h-4 mr-1.5" />Life Events
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Financial Health Summary */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-4">Financial Health Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-zinc-800/30">
                <p className="text-sm text-zinc-400">Total Assets</p>
                <p className="text-2xl font-bold text-zinc-100">{formatNumber(totalAssets)}</p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-800/30">
                <p className="text-sm text-zinc-400">Monthly Surplus</p>
                <p className={cn("text-2xl font-bold", monthlySurplus >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {formatNumber(monthlySurplus)}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-800/30">
                <p className="text-sm text-zinc-400">Total Goal Progress</p>
                <p className="text-2xl font-bold text-blue-400">
                  {goals.length > 0 ? `${Math.round(goals.reduce((sum, g) => sum + ((g.current_amount || 0) / (g.target_amount || 1)) * 100, 0) / goals.length)}%` : '0%'}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-800/30">
                <p className="text-sm text-zinc-400">Upcoming Events</p>
                <p className="text-2xl font-bold text-orange-400">
                  {sortedEvents.filter(e => e.year >= currentYear && e.year <= currentYear + 5).length}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions / Recommendations */}
          {monthlySurplus > 0 && (
            <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <PiggyBank className="w-5 h-5 text-orange-400" />
                Suggested Allocation
              </h3>
              <p className="text-sm text-zinc-400 mb-4">
                Based on your ${formatNumber(monthlySurplus)}/mo surplus, here's a recommended split:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {bucketTotals.emergency.current < bucketTotals.emergency.target && (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-4 h-4 text-emerald-400" />
                      <span className="font-medium text-emerald-400">Emergency First</span>
                    </div>
                    <p className="text-sm text-zinc-300">
                      Save {formatNumber(Math.min(monthlySurplus * 0.5, (bucketTotals.emergency.target - bucketTotals.emergency.current) / 6))}/mo
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">Until 6 months expenses saved</p>
                  </div>
                )}
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-blue-400" />
                    <span className="font-medium text-blue-400">Goal Savings</span>
                  </div>
                  <p className="text-sm text-zinc-300">
                    {formatNumber(monthlySurplus * 0.3)}/mo
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">For medium-term goals</p>
                </div>
                <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-orange-400" />
                    <span className="font-medium text-orange-400">Long-Term</span>
                  </div>
                  <p className="text-sm text-zinc-300">
                    {formatNumber(monthlySurplus * 0.2)}/mo
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">BTC, retirement, wealth building</p>
                </div>
              </div>
            </div>
          )}

          {/* Timeline View */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-4">Upcoming Timeline</h3>
            {sortedEvents.length === 0 && goals.filter(g => g.target_date).length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400">No upcoming events or goal deadlines</p>
                <p className="text-sm text-zinc-500">Add life events and goal target dates to see your timeline</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Combine and sort events and goal deadlines */}
                {[
                  ...sortedEvents.filter(e => e.year >= currentYear).map(e => ({ type: 'event', year: e.year, data: e })),
                  ...goals.filter(g => g.target_date).map(g => ({ type: 'goal', year: new Date(g.target_date).getFullYear(), data: g })),
                ].sort((a, b) => a.year - b.year).slice(0, 8).map((item, i) => {
                  if (item.type === 'event') {
                    const event = item.data;
                    const Icon = eventIcons[event.event_type] || Calendar;
                    return (
                      <div key={`event-${event.id}`} className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/30">
                        <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-orange-400" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-zinc-200">{event.name}</p>
                          <p className="text-sm text-zinc-500">{event.year} • Life Event</p>
                        </div>
                        <div className="text-right">
                          <p className={cn("font-semibold", event.amount >= 0 ? "text-emerald-400" : "text-rose-400")}>
                            {event.amount >= 0 ? '+' : ''}{formatNumber(event.amount)}
                          </p>
                        </div>
                      </div>
                    );
                  } else {
                    const goal = item.data;
                    const progress = (goal.current_amount || 0) / (goal.target_amount || 1) * 100;
                    return (
                      <div key={`goal-${goal.id}`} className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/30">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                          <Target className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-zinc-200">{goal.name}</p>
                          <p className="text-sm text-zinc-500">{new Date(goal.target_date).toLocaleDateString()} • Goal Target</p>
                        </div>
                        <div className="text-right">
                          <p className={cn("font-semibold", progress >= 100 ? "text-emerald-400" : "text-blue-400")}>
                            {progress >= 100 ? '✓ Done' : `${progress.toFixed(0)}%`}
                          </p>
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Bucket Tabs */}
        {['emergency', 'goals', 'longterm'].map(bucketKey => {
          const config = BUCKET_CONFIG[bucketKey];
          const Icon = config.icon;
          const bucketGoals = goalsByBucket[bucketKey] || [];
          const total = bucketTotals[bucketKey];

          return (
            <TabsContent key={bucketKey} value={bucketKey} className="space-y-6">
              {/* Bucket Header */}
              <div className={cn("card-premium rounded-2xl p-6 border", config.bgClass)}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-3 rounded-xl", config.iconBg)}>
                      <Icon className={cn("w-6 h-6", config.textClass)} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{config.name}</h3>
                      <p className="text-sm text-zinc-400">{config.description}</p>
                    </div>
                  </div>
                  <Button onClick={() => openGoalForm(bucketKey)} className="brand-gradient text-white font-semibold">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Goal
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div>
                    <p className="text-sm text-zinc-400">Current</p>
                    <p className={cn("text-2xl font-bold", config.textClass)}>{formatNumber(total.current)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">Target</p>
                    <p className="text-2xl font-bold text-zinc-200">{formatNumber(total.target)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">Remaining</p>
                    <p className="text-2xl font-bold text-zinc-400">{formatNumber(Math.max(0, total.target - total.current))}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <Progress value={Math.min(100, total.target > 0 ? (total.current / total.target) * 100 : 0)} className="h-3 bg-zinc-800" />
                </div>

                {bucketKey === 'emergency' && (
                  <div className="mt-4 p-3 rounded-lg bg-zinc-800/50">
                    <p className="text-sm text-zinc-300">
                      <span className="text-emerald-400 font-medium">Recommendation:</span> Keep 3-6 months of expenses ({formatNumber(monthlyExpenses * 3)} - {formatNumber(monthlyExpenses * 6)}) in a high-yield savings account for emergencies.
                    </p>
                  </div>
                )}
              </div>

              {/* Goals List */}
              {bucketGoals.length === 0 ? (
                <div className="card-premium rounded-2xl p-12 border border-zinc-800/50 text-center">
                  <Icon className={cn("w-12 h-12 mx-auto mb-4", config.textClass)} style={{ opacity: 0.5 }} />
                  <p className="text-zinc-400">No goals in this bucket yet</p>
                  <Button onClick={() => openGoalForm(bucketKey)} className="mt-4 brand-gradient text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Goal
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {bucketGoals.map(goal => {
                    const progress = (goal.current_amount || 0) / (goal.target_amount || 1) * 100;
                    const monthsTo = getMonthsToGoal(goal);
                    const monthlyNeeded = getMonthlyNeeded(goal);
                    const canAfford = monthlyNeeded <= monthlySurplus;

                    return (
                      <div key={goal.id} className="card-premium rounded-xl p-5 border border-zinc-800/50">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-semibold text-zinc-100">{goal.name}</h4>
                            {goal.target_date && (
                              <p className="text-sm text-zinc-500 flex items-center gap-1 mt-1">
                                <Clock className="w-3.5 h-3.5" />
                                {monthsTo !== null ? `${monthsTo} months remaining` : 'No deadline'}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => { setEditingGoal(goal); setGoalFormOpen(true); }} className="p-1.5 rounded-lg hover:bg-zinc-700">
                              <Pencil className="w-4 h-4 text-zinc-400" />
                            </button>
                            <button onClick={() => deleteGoal.mutate(goal.id)} className="p-1.5 rounded-lg hover:bg-rose-600/50">
                              <Trash2 className="w-4 h-4 text-zinc-400" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mb-2">
                          <span className="text-zinc-300">{formatNumber(goal.current_amount || 0)} / {formatNumber(goal.target_amount || 0)}</span>
                          <span className={cn("font-semibold", progress >= 100 ? "text-emerald-400" : config.textClass)}>{progress.toFixed(0)}%</span>
                        </div>
                        <Progress value={Math.min(100, progress)} className="h-2 bg-zinc-800" />

                        {monthlyNeeded > 0 && (
                          <div className={cn("mt-3 p-2 rounded-lg text-sm", canAfford ? "bg-emerald-500/10" : "bg-amber-500/10")}>
                            <p className={canAfford ? "text-emerald-400" : "text-amber-400"}>
                              {canAfford ? '✓' : '⚠️'} Need {formatNumber(monthlyNeeded)}/mo to reach goal on time
                              {!canAfford && ` (surplus is ${formatNumber(monthlySurplus)}/mo)`}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          );
        })}

        {/* Life Events Tab */}
        <TabsContent value="events" className="space-y-6">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold">Life Events Timeline</h3>
                <p className="text-sm text-zinc-400">Plan for major life changes and see their financial impact</p>
              </div>
              <Button onClick={() => { resetEventForm(); setEventFormOpen(true); }} className="brand-gradient text-white font-semibold">
                <Plus className="w-4 h-4 mr-2" />
                Add Event
              </Button>
            </div>

            {sortedEvents.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-400">No life events planned yet</p>
                <p className="text-sm text-zinc-500 mt-1">Add events like buying a house, having kids, or changing jobs</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedEvents.map(event => {
                  const Icon = eventIcons[event.event_type] || Calendar;
                  const yearsFromNow = event.year - currentYear;
                  
                  return (
                    <div key={event.id} className="p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-orange-400/10 flex items-center justify-center">
                            <Icon className="w-5 h-5 text-orange-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-zinc-100">{event.name}</p>
                              {event.is_recurring && (
                                <Badge variant="outline" className="text-xs border-zinc-600 text-zinc-300">
                                  Recurring {event.recurring_years}yrs
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-zinc-400 mt-1">
                              {event.year} • {yearsFromNow > 0 ? `In ${yearsFromNow} year${yearsFromNow !== 1 ? 's' : ''}` : yearsFromNow === 0 ? 'This year' : 'Past'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className={cn("font-semibold", (event.amount || 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                              {event.event_type === 'home_purchase' 
                                ? `-${formatNumber(event.down_payment || 0)}` 
                                : `${(event.amount || 0) >= 0 ? '+' : ''}${formatNumber(Math.abs(event.amount || 0))}`}
                            </p>
                            {event.event_type === 'home_purchase' && (
                              <p className="text-xs text-zinc-500">down payment</p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => { setEditingEvent(event); setEventFormOpen(true); }} className="p-1.5 rounded-lg hover:bg-zinc-700">
                              <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                            </button>
                            <button onClick={() => deleteEvent.mutate(event.id)} className="p-1.5 rounded-lg hover:bg-rose-600/50">
                              <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Goal Form Dialog */}
      <Dialog open={goalFormOpen} onOpenChange={setGoalFormOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader><DialogTitle>{editingGoal ? 'Edit Goal' : 'Add New Goal'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitGoal} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-zinc-400">Which bucket?</Label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(BUCKET_CONFIG).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setGoalForm({ ...goalForm, bucket: key })}
                      className={cn(
                        "p-3 rounded-lg border text-center transition-all",
                        goalForm.bucket === key ? config.bgClass : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <Icon className={cn("w-5 h-5 mx-auto mb-1", goalForm.bucket === key ? config.textClass : "text-zinc-400")} />
                      <p className={cn("text-xs font-medium", goalForm.bucket === key ? config.textClass : "text-zinc-400")}>{config.name.split(' ')[0]}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400">Goal Name</Label>
              <Input value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} placeholder="e.g., House Down Payment" className="bg-zinc-900 border-zinc-700 text-zinc-100" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Target Amount ($)</Label>
                <Input type="number" value={goalForm.target_amount} onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })} placeholder="100000" className="bg-zinc-900 border-zinc-700 text-zinc-100" required />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Saved So Far ($)</Label>
                <Input type="number" value={goalForm.current_amount} onChange={(e) => setGoalForm({ ...goalForm, current_amount: e.target.value })} placeholder="25000" className="bg-zinc-900 border-zinc-700 text-zinc-100" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Target Date (optional)</Label>
              <Input type="date" value={goalForm.target_date} onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })} className="bg-zinc-900 border-zinc-700 text-zinc-100" />
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => { setGoalFormOpen(false); setEditingGoal(null); resetGoalForm(); }} className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700">Cancel</Button>
              <Button type="submit" className="flex-1 brand-gradient text-white font-semibold">{editingGoal ? 'Update' : 'Add'} Goal</Button>
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
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="home_purchase">🏠 Home Purchase</SelectItem>
                    <SelectItem value="major_expense">💸 Major Expense</SelectItem>
                    <SelectItem value="expense_change">📊 Expense Change</SelectItem>
                    <SelectItem value="income_change">💼 Income Change</SelectItem>
                    <SelectItem value="inheritance">🎁 Inheritance</SelectItem>
                    <SelectItem value="other">📝 Other</SelectItem>
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
              <Switch checked={eventForm.is_recurring} onCheckedChange={(checked) => setEventForm({ ...eventForm, is_recurring: checked })} />
              <div className="flex-1">
                <Label className="text-zinc-300">Recurring for multiple years</Label>
                {eventForm.is_recurring && (
                  <Input type="number" value={eventForm.recurring_years} onChange={(e) => setEventForm({ ...eventForm, recurring_years: e.target.value })} placeholder="How many years?" className="bg-zinc-900 border-zinc-700 text-zinc-100 mt-2" />
                )}
              </div>
            </div>

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