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
                <Progress value={Math.min(100, progress)} className="h-2 bg-zinc-800" />
              </div>

              {/* Expanded Goals List */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-zinc-800/50 pt-4 space-y-3">
                  {bucketGoals.length === 0 ? (
                    <p className="text-sm text-zinc-500 text-center py-2">No goals yet</p>
                  ) : (
                    bucketGoals.map(goal => {
                      const goalProgress = (goal.current_amount || 0) / (goal.target_amount || 1) * 100;
                      return (
                        <div key={goal.id} className="p-3 rounded-lg bg-zinc-800/50">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-zinc-200">{goal.name}</span>
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
                          <Progress value={Math.min(100, goalProgress)} className="h-1.5 bg-zinc-700" />
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