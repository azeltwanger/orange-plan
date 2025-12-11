import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Plus, Pencil, Trash2, ArrowUpRight, ArrowDownRight, TrendingUp, Wallet } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import CashFlowProjections from '@/components/budget/CashFlowProjections';
import { calculateCurrentMonthlyDebtPayments, calculateCurrentYearDebtPayments } from '@/components/shared/debtCalculations';

const categoryLabels = {
  salary: 'Salary',
  investment_income: 'Investment Income',
  rental: 'Rental Income',
  other_income: 'Other Income',
  housing: 'Housing',
  transportation: 'Transportation',
  food: 'Food & Dining',
  utilities: 'Utilities',
  healthcare: 'Healthcare',
  entertainment: 'Entertainment',
  savings: 'Savings',
  debt_payment: 'Debt Payment',
  other_expense: 'Other',
};

const categoryColors = {
  salary: '#10b981',
  investment_income: '#22d3ee',
  rental: '#a78bfa',
  other_income: '#f472b6',
  housing: '#ef4444',
  transportation: '#f97316',
  food: '#eab308',
  utilities: '#84cc16',
  healthcare: '#14b8a6',
  entertainment: '#8b5cf6',
  savings: '#F7931A',
  debt_payment: '#ec4899',
  other_expense: '#6b7280',
};

export default function Budget() {
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: '',
    type: 'expense',
    category: 'other_expense',
    amount: '',
    frequency: 'monthly',
    is_active: true,
    notes: '',
  });

  const { data: budgetItems = [] } = useQuery({
    queryKey: ['budgetItems'],
    queryFn: () => base44.entities.BudgetItem.list(),
  });

  const { data: liabilities = [] } = useQuery({
    queryKey: ['liabilities'],
    queryFn: () => base44.entities.Liability.list(),
  });

  const { data: lifeEvents = [] } = useQuery({
    queryKey: ['lifeEvents'],
    queryFn: () => base44.entities.LifeEvent.list(),
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: () => base44.entities.FinancialGoal.list(),
  });

  const { data: userSettings = [] } = useQuery({
    queryKey: ['userSettings'],
    queryFn: () => base44.entities.UserSettings.list(),
  });

  const createItem = useMutation({
    mutationFn: (data) => base44.entities.BudgetItem.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgetItems'] });
      setFormOpen(false);
      resetForm();
    },
  });

  const updateItem = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BudgetItem.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgetItems'] });
      setFormOpen(false);
      setEditingItem(null);
      resetForm();
    },
  });

  const deleteItem = useMutation({
    mutationFn: (id) => base44.entities.BudgetItem.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budgetItems'] }),
  });

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'expense',
      category: 'other_expense',
      amount: '',
      frequency: 'monthly',
      is_active: true,
      notes: '',
    });
  };

  useEffect(() => {
    if (editingItem) {
      setFormData({
        name: editingItem.name || '',
        type: editingItem.type || 'expense',
        category: editingItem.category || 'other_expense',
        amount: editingItem.amount || '',
        frequency: editingItem.frequency || 'monthly',
        is_active: editingItem.is_active !== false,
        notes: editingItem.notes || '',
      });
    }
  }, [editingItem]);

  const freqMultiplier = { monthly: 1, weekly: 4.33, biweekly: 2.17, quarterly: 0.33, annual: 0.083, one_time: 0 };

  const monthlyIncome = budgetItems
    .filter(b => b.type === 'income' && b.is_active !== false)
    .reduce((sum, b) => sum + (b.amount * (freqMultiplier[b.frequency] || 1)), 0);

  const monthlyExpenses = budgetItems
    .filter(b => b.type === 'expense' && b.is_active !== false)
    .reduce((sum, b) => sum + (b.amount * (freqMultiplier[b.frequency] || 1)), 0);

  // Calculate accurate debt payments for current month and year
  const currentYear = new Date().getFullYear();
  const currentMonthIndex = new Date().getMonth(); // 0-11
  const monthlyDebtPayments = calculateCurrentMonthlyDebtPayments(liabilities, currentYear, currentMonthIndex);
  const annualDebtPayments = calculateCurrentYearDebtPayments(liabilities, currentYear, currentMonthIndex);

  const totalMonthlyExpenses = monthlyExpenses + monthlyDebtPayments;
  const surplus = monthlyIncome - totalMonthlyExpenses;

  // Annual totals
  const annualIncome = monthlyIncome * 12;
  const annualBudgetExpenses = monthlyExpenses * 12;
  const totalAnnualExpenses = annualBudgetExpenses + annualDebtPayments;
  const annualSurplus = annualIncome - totalAnnualExpenses;

  // Group expenses by category (including debt payments)
  const expensesByCategory = budgetItems
    .filter(b => b.type === 'expense' && b.is_active !== false)
    .reduce((acc, b) => {
      const monthly = b.amount * (freqMultiplier[b.frequency] || 1);
      acc[b.category] = (acc[b.category] || 0) + monthly;
      return acc;
    }, {});

  // Add debt payments to their own category
  if (monthlyDebtPayments > 0) {
    expensesByCategory['debt_payment'] = (expensesByCategory['debt_payment'] || 0) + monthlyDebtPayments;
  }

  const pieData = Object.entries(expensesByCategory).map(([category, value]) => ({
    name: categoryLabels[category] || category,
    value: Math.round(value),
    color: categoryColors[category] || '#6b7280',
  }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      amount: parseFloat(formData.amount) || 0,
    };
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data });
    } else {
      createItem.mutate(data);
    }
  };

  const incomeItems = budgetItems.filter(b => b.type === 'income');
  const expenseItems = budgetItems.filter(b => b.type === 'expense');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Budget & Cash Flow</h1>
          <p className="text-zinc-500 mt-1">Track income, expenses, and surplus</p>
        </div>
        <Button
          onClick={() => { setEditingItem(null); resetForm(); setFormOpen(true); }}
          className="accent-gradient text-zinc-950 font-semibold hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-500 uppercase tracking-wider">Monthly Income</span>
            <div className="p-2 rounded-lg bg-emerald-400/10">
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-emerald-400">${monthlyIncome.toLocaleString()}</p>
          <p className="text-xs text-zinc-500 mt-1">${annualIncome.toLocaleString()} / year</p>
        </div>

        <div className="card-glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-500 uppercase tracking-wider">Monthly Expenses</span>
            <div className="p-2 rounded-lg bg-rose-400/10">
              <ArrowDownRight className="w-4 h-4 text-rose-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-rose-400">${totalMonthlyExpenses.toLocaleString()}</p>
          <p className="text-xs text-zinc-500 mt-1">
            ${totalAnnualExpenses.toLocaleString()} / year
            {annualDebtPayments > 0 && ` (includes $${annualDebtPayments.toLocaleString()}/yr debt)`}
          </p>
        </div>

        <div className="card-glass rounded-xl p-6 glow-amber">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-500 uppercase tracking-wider">Monthly Surplus</span>
            <div className={cn("p-2 rounded-lg", surplus >= 0 ? "bg-amber-400/10" : "bg-rose-400/10")}>
              <Wallet className={cn("w-4 h-4", surplus >= 0 ? "text-amber-400" : "text-rose-400")} />
            </div>
          </div>
          <p className={cn("text-3xl font-bold", surplus >= 0 ? "text-amber-400" : "text-rose-400")}>
            {surplus >= 0 ? '+' : '-'}${Math.abs(surplus).toLocaleString()}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {annualSurplus >= 0 ? '+' : '-'}${Math.abs(annualSurplus).toLocaleString()} / year
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-zinc-800/50 p-1">
          <TabsTrigger value="overview" className="data-[state=active]:bg-zinc-700">Overview</TabsTrigger>
          <TabsTrigger value="projections" className="data-[state=active]:bg-zinc-700">Cash Flow Projections</TabsTrigger>
          <TabsTrigger value="income" className="data-[state=active]:bg-zinc-700">Income</TabsTrigger>
          <TabsTrigger value="expenses" className="data-[state=active]:bg-zinc-700">Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="projections" className="space-y-6">
          <CashFlowProjections
            monthlyIncome={monthlyIncome}
            monthlyBudgetExpenses={monthlyExpenses}
            lifeEvents={lifeEvents}
            goals={goals}
            liabilities={liabilities}
            userSettings={userSettings[0]}
          />
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Expense Breakdown Pie */}
            <div className="card-glass rounded-2xl p-6">
              <h3 className="font-semibold mb-6">Expense Breakdown</h3>
              {pieData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#18181b',
                          border: '1px solid #27272a',
                          borderRadius: '12px',
                          color: '#f4f4f5',
                        }}
                        itemStyle={{ color: '#f4f4f5' }}
                        labelStyle={{ color: '#f4f4f5' }}
                        formatter={(value) => [`$${value.toLocaleString()}`, '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-center text-zinc-500 py-12">No expenses to display</p>
              )}
              <div className="grid grid-cols-2 gap-2 mt-4">
                {pieData.slice(0, 6).map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-zinc-400 truncate">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cash Flow Bar */}
            <div className="card-glass rounded-2xl p-6">
              <h3 className="font-semibold mb-6">Cash Flow Summary</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                     { name: 'Income', value: monthlyIncome, fill: '#10b981' },
                     { name: 'Expenses', value: totalMonthlyExpenses, fill: '#ef4444' },
                     { name: 'Surplus', value: Math.max(0, surplus), fill: '#F7931A' },
                    ]}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis type="number" stroke="#71717a" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" stroke="#71717a" width={80} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid #27272a',
                        borderRadius: '12px',
                        color: '#f4f4f5',
                      }}
                      itemStyle={{ color: '#f4f4f5' }}
                      labelStyle={{ color: '#f4f4f5' }}
                      formatter={(value) => [`$${value.toLocaleString()}`, '']}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="income">
          <div className="card-glass rounded-2xl p-6">
            <h3 className="font-semibold mb-6">Income Sources</h3>
            {incomeItems.length === 0 ? (
              <p className="text-center text-zinc-500 py-12">No income sources added yet</p>
            ) : (
              <div className="space-y-3">
                {incomeItems.map((item) => (
                  <BudgetItemRow key={item.id} item={item} onEdit={setEditingItem} onDelete={deleteItem.mutate} setFormOpen={setFormOpen} />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="expenses">
          <div className="card-glass rounded-2xl p-6">
            <h3 className="font-semibold mb-6">Expenses</h3>
            <div className="space-y-3">
              {expenseItems.length === 0 && liabilities.filter(l => l.monthly_payment > 0).length === 0 ? (
                <p className="text-center text-zinc-500 py-12">No expenses added yet</p>
              ) : (
                <>
                  {/* Budget expenses */}
                  {expenseItems.map((item) => (
                    <BudgetItemRow key={item.id} item={item} onEdit={setEditingItem} onDelete={deleteItem.mutate} setFormOpen={setFormOpen} />
                  ))}
                  
                  {/* Debt payments from liabilities */}
                  {liabilities.filter(l => l.monthly_payment > 0).length > 0 && (
                    <>
                      <div className="pt-4 pb-2 border-t border-zinc-700/50">
                        <p className="text-xs text-zinc-500 uppercase tracking-wider">From Liabilities</p>
                      </div>
                      {liabilities.filter(l => l.monthly_payment > 0).map((liability) => (
                        <DebtPaymentRow key={liability.id} liability={liability} />
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Item' : 'Add Budget Item'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value, category: value === 'income' ? 'salary' : 'other_expense' })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {formData.type === 'income' ? (
                      <>
                        <SelectItem value="salary">Salary</SelectItem>
                        <SelectItem value="investment_income">Investment Income</SelectItem>
                        <SelectItem value="rental">Rental Income</SelectItem>
                        <SelectItem value="other_income">Other Income</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="housing">Housing</SelectItem>
                        <SelectItem value="transportation">Transportation</SelectItem>
                        <SelectItem value="food">Food & Dining</SelectItem>
                        <SelectItem value="utilities">Utilities</SelectItem>
                        <SelectItem value="healthcare">Healthcare</SelectItem>
                        <SelectItem value="entertainment">Entertainment</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                        <SelectItem value="debt_payment">Debt Payment</SelectItem>
                        <SelectItem value="other_expense">Other</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Amount</Label>
                <Input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
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
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="one_time">One-time</SelectItem>
                  </SelectContent>
                </Select>
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
                {editingItem ? 'Update' : 'Add'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BudgetItemRow({ item, onEdit, onDelete, setFormOpen }) {
  const freqMultiplier = { monthly: 1, weekly: 4.33, biweekly: 2.17, quarterly: 0.33, annual: 0.083, one_time: 0 };
  const monthlyAmount = item.amount * (freqMultiplier[item.frequency] || 1);

  return (
    <div className={cn(
      "flex items-center justify-between p-4 rounded-xl transition-colors",
      item.is_active ? "bg-zinc-800/30 hover:bg-zinc-800/50" : "bg-zinc-800/10 opacity-50"
    )}>
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center",
          item.type === 'income' ? 'bg-emerald-400/10' : 'bg-rose-400/10'
        )}>
          {item.type === 'income' ? (
            <ArrowUpRight className="w-5 h-5 text-emerald-400" />
          ) : (
            <ArrowDownRight className="w-5 h-5 text-rose-400" />
          )}
        </div>
        <div>
          <p className="font-medium">{item.name}</p>
          <p className="text-sm text-zinc-500">
            {categoryLabels[item.category] || item.category} • {item.frequency}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-semibold">${item.amount.toLocaleString()}</p>
          <p className="text-xs text-zinc-500">${monthlyAmount.toFixed(0)}/mo</p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => { onEdit(item); setFormOpen(true); }}
            className="p-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5 text-zinc-400" />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="p-1.5 rounded-lg hover:bg-rose-600/50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DebtPaymentRow({ liability }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-orange-400/10">
          <ArrowDownRight className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <p className="font-medium">{liability.name}</p>
          <p className="text-sm text-zinc-500">
            Debt Payment • {liability.interest_rate ? `${liability.interest_rate}% APR` : 'No interest'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-semibold text-orange-400">${liability.monthly_payment.toLocaleString()}/mo</p>
          <p className="text-xs text-zinc-500">Balance: ${(liability.current_balance || 0).toLocaleString()}</p>
        </div>
        <div className="px-2 py-1 rounded-lg bg-zinc-800/50 border border-zinc-700">
          <p className="text-[10px] text-zinc-500">Auto-synced</p>
        </div>
      </div>
    </div>
  );
}