import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Target, Plus, Pencil, Trash2, Calendar, Home, Car, Briefcase, Heart, DollarSign, Building, CreditCard, TrendingUp } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import EmptyState from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';

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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const queryClient = useQueryClient();

  // Form states
  const [goalForm, setGoalForm] = useState({
    name: '', type: 'savings', target_amount: '', saved_so_far: '', target_date: '', 
    withdraw_from_portfolio: false, linked_liability_id: '', payoff_strategy: 'minimum', 
    extra_monthly_payment: '', lump_sum_date: '', notes: '',
  });

  const [eventForm, setEventForm] = useState({
    name: '', event_type: 'major_expense', year: new Date().getFullYear() + 1, amount: '', 
    is_recurring: false, recurring_years: '', affects: 'assets', notes: '',
    monthly_expense_impact: '', liability_amount: '', down_payment: '', interest_rate: '', loan_term_years: '',
    allocation_method: 'proportionate', btc_allocation: 0, stocks_allocation: 0, real_estate_allocation: 0, 
    bonds_allocation: 0, cash_allocation: 0, other_allocation: 0,
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

  const { data: liabilities = [] } = useQuery({
    queryKey: ['liabilities'],
    queryFn: () => base44.entities.Liability.list(),
  });

  const { data: collateralizedLoans = [] } = useQuery({
    queryKey: ['collateralizedLoans'],
    queryFn: () => base44.entities.CollateralizedLoan.list(),
  });

  // Check if critical data is loading
  const isLoadingData = !goals || !liabilities || !collateralizedLoans;

  // Sort goals by creation date (newest first)
  const sortedGoals = useMemo(() => {
    return [...goals].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  }, [goals]);

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

  const resetGoalForm = () => setGoalForm({ 
    name: '', type: 'savings', target_amount: '', saved_so_far: '', target_date: '', 
    withdraw_from_portfolio: false, linked_liability_id: '', payoff_strategy: 'minimum', 
    extra_monthly_payment: '', lump_sum_date: '', notes: '',
  });
  
  const resetEventForm = () => setEventForm({ 
    name: '', event_type: 'major_expense', year: new Date().getFullYear() + 1, amount: '', 
    is_recurring: false, recurring_years: '', affects: 'assets', notes: '', 
    monthly_expense_impact: '', liability_amount: '', down_payment: '', interest_rate: '', loan_term_years: '', 
    allocation_method: 'proportionate', btc_allocation: 0, stocks_allocation: 0, real_estate_allocation: 0, 
    bonds_allocation: 0, cash_allocation: 0, other_allocation: 0 
  });

  useEffect(() => {
    if (editingGoal) {
      setGoalForm({
        name: editingGoal.name || '',
        type: editingGoal.type || 'savings',
        target_amount: editingGoal.target_amount || '',
        saved_so_far: editingGoal.saved_so_far || editingGoal.current_amount || '',
        target_date: editingGoal.target_date || '',
        withdraw_from_portfolio: editingGoal.withdraw_from_portfolio || editingGoal.will_be_spent || false,
        linked_liability_id: editingGoal.linked_liability_id || '',
        payoff_strategy: editingGoal.payoff_strategy || 'minimum',
        extra_monthly_payment: editingGoal.extra_monthly_payment || '',
        lump_sum_date: editingGoal.lump_sum_date || '',
        notes: editingGoal.notes || '',
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
    let data = { 
      ...goalForm, 
      target_amount: parseFloat(goalForm.target_amount) || 0, 
      saved_so_far: parseFloat(goalForm.saved_so_far) || 0,
      extra_monthly_payment: parseFloat(goalForm.extra_monthly_payment) || null,
      linked_liability_id: goalForm.linked_liability_id || null,
    };

    if (!data.name || !data.target_amount) {
      toast.error("Goal Name and Target Amount are required.");
      return;
    }

    // Remove deprecated and system fields to prevent validation errors
    delete data.funding_sources;
    delete data.will_be_spent;
    delete data.goal_type;
    delete data.current_amount;
    delete data.priority;
    delete data.linked_dca_plan_id;
    delete data.payoff_years;
    delete data.id;
    delete data.created_date;
    delete data.updated_date;
    delete data.created_by;

    if (editingGoal) {
      updateGoal.mutate({ id: editingGoal.id, data });
    } else {
      createGoal.mutate(data);
    }
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

  // Calculate payoff date for debt payoff goals
  const getDebtPayoffInfo = (goal) => {
    if (goal.type !== 'debt_payoff' || !goal.linked_liability_id) return null;

    const isLoan = goal.linked_liability_id.startsWith('loan_');
    const actualId = isLoan ? goal.linked_liability_id.substring(5) : goal.linked_liability_id;
    const debt = isLoan 
      ? collateralizedLoans.find(l => l.id === actualId)
      : liabilities.find(l => l.id === actualId);

    if (!debt) return null;

    const currentBalance = debt.current_balance || 0;
    const originalAmount = goal.target_amount || currentBalance;
    const progress = originalAmount > 0 ? ((originalAmount - currentBalance) / originalAmount) * 100 : 0;

    // Estimate payoff date based on strategy
    let estimatedPayoffDate = null;
    if (goal.payoff_strategy === 'lump_sum' && goal.lump_sum_date) {
      estimatedPayoffDate = new Date(goal.lump_sum_date);
    } else if (goal.payoff_strategy === 'extra' && goal.extra_monthly_payment && debt.monthly_payment) {
      const totalMonthly = (debt.monthly_payment || 0) + (goal.extra_monthly_payment || 0);
      const interestRate = (debt.interest_rate || 0) / 100 / 12;
      if (totalMonthly > 0 && currentBalance > 0) {
        // Approximate months to payoff with extra payment
        const monthsToPayoff = interestRate > 0
          ? Math.log((totalMonthly) / (totalMonthly - currentBalance * interestRate)) / Math.log(1 + interestRate)
          : currentBalance / totalMonthly;
        estimatedPayoffDate = new Date();
        estimatedPayoffDate.setMonth(estimatedPayoffDate.getMonth() + Math.ceil(monthsToPayoff));
      }
    } else if (debt.monthly_payment && currentBalance > 0) {
      // Minimum payments
      const interestRate = (debt.interest_rate || 0) / 100 / 12;
      const monthlyPayment = debt.monthly_payment;
      if (monthlyPayment > 0) {
        const monthsToPayoff = interestRate > 0 && monthlyPayment > currentBalance * interestRate
          ? Math.log((monthlyPayment) / (monthlyPayment - currentBalance * interestRate)) / Math.log(1 + interestRate)
          : currentBalance / monthlyPayment;
        estimatedPayoffDate = new Date();
        estimatedPayoffDate.setMonth(estimatedPayoffDate.getMonth() + Math.ceil(monthsToPayoff));
      }
    }

    return {
      debt,
      currentBalance,
      originalAmount,
      progress,
      estimatedPayoffDate,
    };
  };

  const currentYear = new Date().getFullYear();

  // Show loading skeleton while data is being fetched
  if (isLoadingData) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Goals & Life Events</h1>
          <p className="text-zinc-500 mt-1">Track savings goals and plan for life changes</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { resetEventForm(); setEventFormOpen(true); }} className="bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700 text-sm">
            <Calendar className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Life Event</span>
            <span className="sm:hidden">Event</span>
          </Button>
          <Button onClick={() => { resetGoalForm(); setGoalFormOpen(true); }} size="sm" className="brand-gradient text-white font-semibold text-sm">
            <Plus className="w-4 h-4 mr-2" />
            Goal
          </Button>
        </div>
      </div>

      {/* Your Goals */}
      <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold flex items-center gap-2">
            <Target className="w-5 h-5 text-orange-400" />
            Your Goals
          </h3>
          <span className="text-sm text-zinc-500">{goals.length} goal{goals.length !== 1 ? 's' : ''}</span>
        </div>

        {sortedGoals.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No Goals Set"
            description="Create savings goals or debt payoff plans to track progress"
            actionText="Create Your First Goal"
            onAction={() => { resetGoalForm(); setGoalFormOpen(true); }}
          />
        ) : (
          <div className="space-y-3">
            {sortedGoals.map(goal => {
              // Handle both new schema and legacy data
              const goalType = goal.type || (goal.goal_type === 'debt_payoff' ? 'debt_payoff' : 'savings');
              const savedAmount = goal.saved_so_far ?? goal.current_amount ?? 0;
              const targetAmount = goal.target_amount || 0;
              const withdrawFromPortfolio = goal.withdraw_from_portfolio ?? goal.will_be_spent ?? false;

              const isSavings = goalType === 'savings';
              const isDebtPayoff = goalType === 'debt_payoff';

              let progress = 0;
              let subtitle = '';
              let estimatedDate = null;

              if (isSavings) {
                progress = targetAmount > 0 ? (savedAmount / targetAmount) * 100 : 0;
                subtitle = 'Savings Goal';
                if (goal.target_date) {
                  subtitle += ` • By: ${new Date(goal.target_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
                }
                if (targetAmount > 0) {
                  subtitle += ` • Target: ${formatNumber(targetAmount)}`;
                }
              } else if (isDebtPayoff) {
                const debtInfo = getDebtPayoffInfo(goal);
                if (debtInfo) {
                  progress = debtInfo.progress;
                  subtitle = `Debt Payoff • Linked: ${debtInfo.debt.name}`;
                  estimatedDate = debtInfo.estimatedPayoffDate;
                } else {
                  subtitle = 'Debt Payoff • No linked liability';
                }
              }

              return (
                <div key={goal.id} className="p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors border border-zinc-700/50">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {isSavings && <DollarSign className="w-4 h-4 text-blue-400" />}
                        {isDebtPayoff && <CreditCard className="w-4 h-4 text-rose-400" />}
                        <h4 className="font-medium text-zinc-200">{goal.name}</h4>
                      </div>
                      <p className="text-xs text-zinc-400">{subtitle}</p>
                      {isDebtPayoff && estimatedDate && (
                        <p className="text-xs text-zinc-500 mt-1">
                          Estimated payoff: {estimatedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => { setEditingGoal(goal); setGoalFormOpen(true); }} 
                        className="p-1.5 rounded hover:bg-zinc-700 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
                        aria-label={`Edit goal ${goal.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                      <button 
                        onClick={() => { setItemToDelete({ type: 'goal', item: goal }); setDeleteConfirmOpen(true); }} 
                        className="p-1.5 rounded hover:bg-rose-600/50 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50"
                        aria-label={`Delete goal ${goal.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">
                        {isSavings ? `Progress: ${formatNumber(savedAmount)}` : `Remaining: ${formatNumber(isDebtPayoff && getDebtPayoffInfo(goal) ? getDebtPayoffInfo(goal).currentBalance : 0)}`}
                      </span>
                      <span className={cn(
                        "font-medium",
                        progress >= 100 ? "text-emerald-400" : 
                        progress >= 50 ? "text-blue-400" : "text-zinc-400"
                      )}>
                        {formatNumber(targetAmount)} • {Math.round(progress)}%
                      </span>
                    </div>
                    <Progress 
                      value={Math.min(100, progress)} 
                      className={cn(
                        "h-2 bg-zinc-700",
                        isSavings && "[&>div]:bg-blue-500",
                        isDebtPayoff && "[&>div]:bg-rose-500"
                      )} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Life Events Section */}
      <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-orange-400" />
            Life Events
          </h3>
          <span className="text-sm text-zinc-500">{sortedEvents.length} planned</span>
        </div>

        {sortedEvents.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No Life Events Planned"
            description="Model future milestones like home purchases or career changes"
            actionText="Plan a Life Event"
            onAction={() => { resetEventForm(); setEventFormOpen(true); }}
          />
        ) : (
          <div className="space-y-2">
            {sortedEvents.map(event => {
              const Icon = eventIcons[event.event_type] || Calendar;
              const yearsFromNow = event.year - currentYear;
              
              return (
                <div key={event.id} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-orange-400/10 flex items-center justify-center shrink-0">
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
                    <button 
                      onClick={() => { setEditingEvent(event); setEventFormOpen(true); }} 
                      className="p-1.5 rounded hover:bg-zinc-700 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
                      aria-label={`Edit event ${event.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                    <button 
                      onClick={() => { setItemToDelete({ type: 'event', item: event }); setDeleteConfirmOpen(true); }} 
                      className="p-1.5 rounded hover:bg-rose-600/50 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50"
                      aria-label={`Delete event ${event.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Goal Form Dialog */}
      <Dialog open={goalFormOpen} onOpenChange={setGoalFormOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingGoal ? 'Edit Goal' : 'Add New Goal'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitGoal} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Goal Name</Label>
              <Input 
                value={goalForm.name} 
                onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} 
                placeholder="e.g., House Down Payment"
                className="bg-zinc-900 border-zinc-700 text-zinc-100" 
                required 
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400">Goal Type</Label>
              <Select 
                value={goalForm.type} 
                onValueChange={(value) => setGoalForm({ ...goalForm, type: value })}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="savings" className="text-zinc-100">💰 Savings Goal</SelectItem>
                  <SelectItem value="debt_payoff" className="text-zinc-100">💳 Debt Payoff</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Savings Goal Fields */}
            {goalForm.type === 'savings' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Target Amount ($)</Label>
                    <Input 
                      type="number" 
                      value={goalForm.target_amount} 
                      onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })} 
                      placeholder="50000" 
                      className="bg-zinc-900 border-zinc-700 text-zinc-100" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Saved So Far ($)</Label>
                    <Input 
                      type="number" 
                      value={goalForm.saved_so_far} 
                      onChange={(e) => setGoalForm({ ...goalForm, saved_so_far: e.target.value })} 
                      placeholder="12000" 
                      className="bg-zinc-900 border-zinc-700 text-zinc-100" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-400">Target Date (optional)</Label>
                  <Input 
                    type="date" 
                    value={goalForm.target_date} 
                    onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })} 
                    className="bg-zinc-900 border-zinc-700 text-zinc-100" 
                  />
                </div>

                <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-zinc-300">Withdraw from portfolio at target date</Label>
                      <p className="text-xs text-zinc-500 mt-0.5">Deduct target amount from projections</p>
                    </div>
                    <Switch 
                      checked={goalForm.withdraw_from_portfolio} 
                      onCheckedChange={(checked) => setGoalForm({ ...goalForm, withdraw_from_portfolio: checked })}
                      className="data-[state=checked]:bg-orange-500"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Debt Payoff Fields */}
            {goalForm.type === 'debt_payoff' && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400">Target Amount ($)</Label>
                  <Input 
                    type="number" 
                    value={goalForm.target_amount} 
                    onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })} 
                    placeholder="Amount to pay off" 
                    className="bg-zinc-900 border-zinc-700 text-zinc-100" 
                    required 
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-400">Link to Liability (optional)</Label>
                  <Select 
                    value={goalForm.linked_liability_id || 'none'} 
                    onValueChange={(value) => {
                      const isLoan = value.startsWith('loan_');
                      const actualId = isLoan ? value.substring(5) : value;
                      const debt = isLoan 
                        ? collateralizedLoans.find(l => l.id === actualId)
                        : liabilities.find(l => l.id === value);
                      
                      setGoalForm({ 
                        ...goalForm, 
                        linked_liability_id: value === 'none' ? '' : value,
                        target_amount: debt ? debt.current_balance : goalForm.target_amount,
                        name: debt && !goalForm.name ? `Pay off ${debt.name}` : goalForm.name,
                      });
                    }}
                  >
                    <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100">
                      <SelectValue placeholder="Select liability..." />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      <SelectItem value="none" className="text-zinc-100">None</SelectItem>
                      {liabilities.map(liability => (
                        <SelectItem key={liability.id} value={liability.id} className="text-zinc-100">
                          {liability.name} (${(liability.current_balance || 0).toLocaleString()} @ {liability.interest_rate || 0}%)
                        </SelectItem>
                      ))}
                      {collateralizedLoans.map(loan => (
                        <SelectItem key={loan.id} value={`loan_${loan.id}`} className="text-zinc-100">
                          {loan.name} (${(loan.current_balance || 0).toLocaleString()} @ {loan.interest_rate || 0}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-400">Payoff Strategy</Label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setGoalForm({ ...goalForm, payoff_strategy: 'minimum' })}
                      className={cn(
                        "w-full p-3 rounded-lg border text-left transition-all",
                        goalForm.payoff_strategy === 'minimum'
                          ? "bg-rose-500/20 border-rose-500/50"
                          : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <p className={cn("font-medium text-sm", goalForm.payoff_strategy === 'minimum' ? "text-rose-400" : "text-zinc-200")}>
                        Minimum Payments
                      </p>
                      <p className="text-xs text-zinc-400">Use existing payment schedule</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGoalForm({ ...goalForm, payoff_strategy: 'extra' })}
                      className={cn(
                        "w-full p-3 rounded-lg border text-left transition-all",
                        goalForm.payoff_strategy === 'extra'
                          ? "bg-rose-500/20 border-rose-500/50"
                          : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <p className={cn("font-medium text-sm", goalForm.payoff_strategy === 'extra' ? "text-rose-400" : "text-zinc-200")}>
                        Extra Payments
                      </p>
                      <p className="text-xs text-zinc-400">Add extra monthly amount</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGoalForm({ ...goalForm, payoff_strategy: 'lump_sum' })}
                      className={cn(
                        "w-full p-3 rounded-lg border text-left transition-all",
                        goalForm.payoff_strategy === 'lump_sum'
                          ? "bg-rose-500/20 border-rose-500/50"
                          : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <p className={cn("font-medium text-sm", goalForm.payoff_strategy === 'lump_sum' ? "text-rose-400" : "text-zinc-200")}>
                        Lump Sum
                      </p>
                      <p className="text-xs text-zinc-400">Pay off entirely at target date</p>
                    </button>
                  </div>
                </div>

                {goalForm.payoff_strategy === 'extra' && (
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Extra Monthly Payment ($)</Label>
                    <Input 
                      type="number" 
                      value={goalForm.extra_monthly_payment} 
                      onChange={(e) => setGoalForm({ ...goalForm, extra_monthly_payment: e.target.value })} 
                      placeholder="500" 
                      className="bg-zinc-900 border-zinc-700 text-zinc-100" 
                    />
                  </div>
                )}

                {goalForm.payoff_strategy === 'lump_sum' && (
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Target Date</Label>
                    <Input 
                      type="date" 
                      value={goalForm.lump_sum_date} 
                      onChange={(e) => setGoalForm({ ...goalForm, lump_sum_date: e.target.value })} 
                      className="bg-zinc-900 border-zinc-700 text-zinc-100" 
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-zinc-800">
              <Button type="button" variant="outline" onClick={() => { setGoalFormOpen(false); setEditingGoal(null); resetGoalForm(); }} className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700">
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="flex-1 brand-gradient text-white font-semibold"
                disabled={updateGoal.isPending || createGoal.isPending}
              >
                {editingGoal ? 'Update' : 'Save'} Goal
              </Button>
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
                    <SelectItem value="income_change" className="text-zinc-100">💼 Additional Income</SelectItem>
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
                <Label className="text-zinc-400">
                  {eventForm.event_type === 'income_change' ? 'Additional Annual Income ($)' : 'Amount ($)'}
                </Label>
                <Input type="number" value={eventForm.amount} onChange={(e) => setEventForm({ ...eventForm, amount: e.target.value })} placeholder={eventForm.event_type === 'income_change' ? '50000' : '-50000 (negative = expense)'} className="bg-zinc-900 border-zinc-700 text-zinc-100" required />
                {eventForm.event_type === 'income_change' && (
                  <p className="text-xs text-zinc-500">This amount will be added to your base income for the specified duration</p>
                )}
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

            {/* Investment Allocation - Only show for lump-sum inflows */}
            {eventForm.affects === 'assets' && parseFloat(eventForm.amount) > 0 && eventForm.event_type !== 'income_change' && (
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

            <div className="flex gap-3 pt-4 border-t border-zinc-800">
              <Button type="button" variant="outline" onClick={() => { setEventFormOpen(false); setEditingEvent(null); resetEventForm(); }} className="flex-1 bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700">
                Cancel
              </Button>
              <Button type="submit" className="flex-1 brand-gradient text-white font-semibold">
                {editingEvent ? 'Update' : 'Add'} Event
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-md animate-in fade-in-0 zoom-in-95 duration-200">
          <DialogHeader>
            <DialogTitle>Delete {itemToDelete?.type === 'goal' ? 'Goal' : 'Life Event'}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-zinc-400">
              Are you sure you want to delete <span className="font-semibold text-zinc-200">{itemToDelete?.item?.name}</span>?
            </p>
            <p className="text-sm text-rose-400">This action cannot be undone.</p>
            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                onClick={() => { setDeleteConfirmOpen(false); setItemToDelete(null); }} 
                className="flex-1 bg-transparent border-zinc-700"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  if (itemToDelete?.type === 'goal') {
                    deleteGoal.mutate(itemToDelete.item.id);
                  } else if (itemToDelete?.type === 'event') {
                    deleteEvent.mutate(itemToDelete.item.id);
                  }
                  setDeleteConfirmOpen(false);
                  setItemToDelete(null);
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}