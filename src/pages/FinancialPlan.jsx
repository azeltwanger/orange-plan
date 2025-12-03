import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart, Legend } from 'recharts';
import { Target, Plus, Pencil, Trash2, TrendingUp, Calendar, Settings, Play, AlertTriangle, ChevronDown, ChevronUp, Sparkles, Home, Car, Baby, Briefcase, Heart, DollarSign, RefreshCw, Landmark, Building2, PiggyBank, Shield } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Monte Carlo simulation
const runMonteCarloSimulation = (initialValue, years, meanReturn, volatility, numSimulations = 500) => {
  const results = [];
  
  for (let sim = 0; sim < numSimulations; sim++) {
    let value = initialValue;
    const path = [value];
    
    for (let year = 1; year <= years; year++) {
      // Generate random return using Box-Muller transform
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const yearReturn = meanReturn + volatility * z;
      value = value * (1 + yearReturn / 100);
      path.push(Math.max(0, value));
    }
    results.push(path);
  }
  
  return results;
};

// Calculate percentiles from simulation results
const calculatePercentiles = (simulations, percentiles = [10, 25, 50, 75, 90]) => {
  const years = simulations[0].length;
  const result = [];
  
  for (let year = 0; year < years; year++) {
    const yearValues = simulations.map(sim => sim[year]).sort((a, b) => a - b);
    const yearPercentiles = {};
    
    percentiles.forEach(p => {
      const index = Math.floor((p / 100) * yearValues.length);
      yearPercentiles[`p${p}`] = yearValues[index];
    });
    
    result.push(yearPercentiles);
  }
  
  return result;
};

export default function FinancialPlan() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('projections');
  const [showMonteCarloSettings, setShowMonteCarloSettings] = useState(false);
  const queryClient = useQueryClient();

  // Assumption states
  const [btcCagr, setBtcCagr] = useState(25);
  const [btcVolatility, setBtcVolatility] = useState(60);
  const [stocksCagr, setStocksCagr] = useState(7);
  const [stocksVolatility, setStocksVolatility] = useState(15);
  const [realEstateCagr, setRealEstateCagr] = useState(4);
  const [bondsCagr, setBondsCagr] = useState(3);
  const [inflationRate, setInflationRate] = useState(3);
  const [incomeGrowth, setIncomeGrowth] = useState(3);
  
  // Retirement settings
  const [retirementAge, setRetirementAge] = useState(65);
  const [currentAge, setCurrentAge] = useState(35);
  const [annualSpending, setAnnualSpending] = useState(100000);
  
  // Monte Carlo
  const [runSimulation, setRunSimulation] = useState(false);
  const [simulationResults, setSimulationResults] = useState(null);
  
  // Forms
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [scenarioFormOpen, setScenarioFormOpen] = useState(false);
  const [editingScenario, setEditingScenario] = useState(null);
  const [activeScenarioId, setActiveScenarioId] = useState(null);
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  const [goalForm, setGoalForm] = useState({
    name: '', target_amount: '', current_amount: '', target_date: '', goal_type: 'other', priority: 'medium', notes: '',
  });

  const [eventForm, setEventForm] = useState({
    name: '', event_type: 'expense_change', year: new Date().getFullYear() + 1, amount: '', is_recurring: false, recurring_years: '', affects: 'expenses', notes: '',
  });

  const [scenarioForm, setScenarioForm] = useState({
    name: '', scenario_type: 'custom', btc_cagr_override: '', stocks_cagr_override: '', inflation_override: '', market_crash_year: '', crash_severity_percent: '', description: '',
  });

  const [accountForm, setAccountForm] = useState({
    name: '', account_type: 'taxable', institution: '', annual_contribution: '', employer_match_percent: '', employer_match_limit: '', notes: '',
  });

  // Fetch BTC price
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
  }, []);

  const currentPrice = btcPrice || 97000;

  // Queries
  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: () => base44.entities.FinancialGoal.list(),
  });

  const { data: lifeEvents = [] } = useQuery({
    queryKey: ['lifeEvents'],
    queryFn: () => base44.entities.LifeEvent.list(),
  });

  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => base44.entities.Scenario.list(),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  // Mutations
  const createGoal = useMutation({
    mutationFn: (data) => base44.entities.FinancialGoal.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['goals'] }); setGoalFormOpen(false); },
  });

  const updateGoal = useMutation({
    mutationFn: ({ id, data }) => base44.entities.FinancialGoal.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['goals'] }); setGoalFormOpen(false); setEditingGoal(null); },
  });

  const deleteGoal = useMutation({
    mutationFn: (id) => base44.entities.FinancialGoal.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['goals'] }),
  });

  const createEvent = useMutation({
    mutationFn: (data) => base44.entities.LifeEvent.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lifeEvents'] }); setEventFormOpen(false); },
  });

  const updateEvent = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LifeEvent.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lifeEvents'] }); setEventFormOpen(false); setEditingEvent(null); },
  });

  const deleteEvent = useMutation({
    mutationFn: (id) => base44.entities.LifeEvent.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lifeEvents'] }),
  });

  const createScenario = useMutation({
    mutationFn: (data) => base44.entities.Scenario.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['scenarios'] }); setScenarioFormOpen(false); },
  });

  const updateScenario = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Scenario.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['scenarios'] }); setScenarioFormOpen(false); setEditingScenario(null); },
  });

  const deleteScenario = useMutation({
    mutationFn: (id) => base44.entities.Scenario.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scenarios'] }),
  });

  const createAccount = useMutation({
    mutationFn: (data) => base44.entities.Account.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounts'] }); setAccountFormOpen(false); },
  });

  const updateAccount = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Account.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounts'] }); setAccountFormOpen(false); setEditingAccount(null); },
  });

  const deleteAccount = useMutation({
    mutationFn: (id) => base44.entities.Account.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  // Account type helpers
  const ACCOUNT_TYPE_INFO = {
    taxable: { label: 'Taxable Brokerage', icon: Building2, color: 'text-zinc-400', taxDeferred: false, taxFree: false },
    '401k_traditional': { label: 'Traditional 401(k)', icon: Landmark, color: 'text-blue-400', taxDeferred: true, taxFree: false, limit2024: 23000 },
    '401k_roth': { label: 'Roth 401(k)', icon: Landmark, color: 'text-emerald-400', taxDeferred: false, taxFree: true, limit2024: 23000 },
    'ira_traditional': { label: 'Traditional IRA', icon: PiggyBank, color: 'text-purple-400', taxDeferred: true, taxFree: false, limit2024: 7000 },
    'ira_roth': { label: 'Roth IRA', icon: PiggyBank, color: 'text-emerald-400', taxDeferred: false, taxFree: true, limit2024: 7000 },
    'hsa': { label: 'HSA', icon: Shield, color: 'text-cyan-400', taxDeferred: false, taxFree: true, limit2024: 4150 },
    '529': { label: '529 Plan', icon: PiggyBank, color: 'text-amber-400', taxDeferred: false, taxFree: true },
  };

  // Calculate portfolio values by account type
  const getHoldingValue = (h) => {
    if (h.ticker === 'BTC') return h.quantity * currentPrice;
    return h.quantity * (h.current_price || 0);
  };

  const holdingsWithAccounts = holdings.map(h => {
    const account = accounts.find(a => a.id === h.account_id);
    return { ...h, account, accountType: account?.account_type || 'taxable' };
  });

  // Group by tax treatment
  const taxableHoldings = holdingsWithAccounts.filter(h => !ACCOUNT_TYPE_INFO[h.accountType]?.taxDeferred && !ACCOUNT_TYPE_INFO[h.accountType]?.taxFree);
  const taxDeferredHoldings = holdingsWithAccounts.filter(h => ACCOUNT_TYPE_INFO[h.accountType]?.taxDeferred);
  const taxFreeHoldings = holdingsWithAccounts.filter(h => ACCOUNT_TYPE_INFO[h.accountType]?.taxFree);

  const taxableValue = taxableHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);
  const taxDeferredValue = taxDeferredHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);
  const taxFreeValue = taxFreeHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);

  // Calculate portfolio values by asset type
  const btcValue = holdings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity * currentPrice, 0);
  const stocksValue = holdings.filter(h => h.asset_type === 'stocks').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const realEstateValue = holdings.filter(h => h.asset_type === 'real_estate').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const bondsValue = holdings.filter(h => h.asset_type === 'bonds').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const otherValue = holdings.filter(h => !['BTC'].includes(h.ticker) && !['stocks', 'real_estate', 'bonds'].includes(h.asset_type)).reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const totalValue = btcValue + stocksValue + realEstateValue + bondsValue + otherValue;

  // Annual contributions from accounts
  const totalAnnualContributions = accounts.reduce((sum, a) => {
    const contrib = a.annual_contribution || 0;
    const match = a.employer_match_percent && a.employer_match_limit 
      ? Math.min((contrib * a.employer_match_percent / 100), a.employer_match_limit)
      : 0;
    return sum + contrib + match;
  }, 0);

  // Get active scenario overrides
  const activeScenario = scenarios.find(s => s.id === activeScenarioId);
  const effectiveBtcCagr = activeScenario?.btc_cagr_override ?? btcCagr;
  const effectiveStocksCagr = activeScenario?.stocks_cagr_override ?? stocksCagr;
  const effectiveInflation = activeScenario?.inflation_override ?? inflationRate;

  // Generate projection data with account types
  const projections = useMemo(() => {
    const years = retirementAge - currentAge;
    const data = [];
    const currentYear = new Date().getFullYear();
    
    // Starting values by tax treatment
    let runningTaxable = taxableValue;
    let runningTaxDeferred = taxDeferredValue;
    let runningTaxFree = taxFreeValue;
    
    // Estimate weighted CAGR based on holdings
    const weightedCagr = totalValue > 0 
      ? (btcValue / totalValue * effectiveBtcCagr + (stocksValue + otherValue) / totalValue * effectiveStocksCagr + realEstateValue / totalValue * realEstateCagr + bondsValue / totalValue * bondsCagr)
      : effectiveStocksCagr;
    
    for (let i = 0; i <= years; i++) {
      const year = currentYear + i;
      
      // Apply market crash if scenario specifies one
      let crashMultiplier = 1;
      if (activeScenario?.market_crash_year === year) {
        crashMultiplier = 1 - (activeScenario.crash_severity_percent || 40) / 100;
      }
      
      // Calculate life event impacts for this year
      let eventImpact = 0;
      lifeEvents.forEach(event => {
        if (event.year === year || (event.is_recurring && event.year <= year && year < event.year + (event.recurring_years || 1))) {
          if (event.affects === 'assets') eventImpact += event.amount;
        }
      });
      
      // Project by asset type
      const btcProjected = (btcValue * Math.pow(1 + effectiveBtcCagr / 100, i) * crashMultiplier);
      const stocksProjected = (stocksValue * Math.pow(1 + effectiveStocksCagr / 100, i) * crashMultiplier);
      const realEstateProjected = realEstateValue * Math.pow(1 + realEstateCagr / 100, i);
      const bondsProjected = bondsValue * Math.pow(1 + bondsCagr / 100, i);
      const otherProjected = otherValue * Math.pow(1 + stocksCagr / 100, i);
      
      // Project by account type (with contributions)
      if (i > 0) {
        runningTaxable = runningTaxable * (1 + weightedCagr / 100) * crashMultiplier;
        runningTaxDeferred = (runningTaxDeferred + totalAnnualContributions * 0.6) * (1 + weightedCagr / 100) * crashMultiplier; // Assume 60% to tax-deferred
        runningTaxFree = (runningTaxFree + totalAnnualContributions * 0.4) * (1 + weightedCagr / 100) * crashMultiplier; // Assume 40% to tax-free
      }
      
      const total = btcProjected + stocksProjected + realEstateProjected + bondsProjected + otherProjected + eventImpact;
      const totalByAccount = runningTaxable + runningTaxDeferred + runningTaxFree + eventImpact;
      const realTotal = total / Math.pow(1 + effectiveInflation / 100, i);
      
      // Tax-adjusted retirement value (tax-deferred taxed at estimated 25%)
      const taxAdjustedTotal = runningTaxable + (runningTaxDeferred * 0.75) + runningTaxFree;
      
      data.push({
        age: currentAge + i,
        year,
        btc: Math.round(btcProjected),
        stocks: Math.round(stocksProjected),
        realEstate: Math.round(realEstateProjected),
        bonds: Math.round(bondsProjected),
        total: Math.round(total),
        realTotal: Math.round(realTotal),
        taxable: Math.round(runningTaxable),
        taxDeferred: Math.round(runningTaxDeferred),
        taxFree: Math.round(runningTaxFree),
        taxAdjusted: Math.round(taxAdjustedTotal / Math.pow(1 + effectiveInflation / 100, i)),
        hasEvent: lifeEvents.some(e => e.year === year),
      });
    }
    return data;
  }, [btcValue, stocksValue, realEstateValue, bondsValue, otherValue, currentAge, retirementAge, effectiveBtcCagr, effectiveStocksCagr, realEstateCagr, bondsCagr, effectiveInflation, lifeEvents, activeScenario, taxableValue, taxDeferredValue, taxFreeValue, totalAnnualContributions, totalValue]);

  // Run Monte Carlo when button clicked
  const handleRunSimulation = () => {
    const years = retirementAge - currentAge;
    const simulations = runMonteCarloSimulation(totalValue, years, effectiveBtcCagr * (btcValue / totalValue) + effectiveStocksCagr * ((totalValue - btcValue) / totalValue), btcVolatility * (btcValue / totalValue) + stocksVolatility * ((totalValue - btcValue) / totalValue), 500);
    const percentiles = calculatePercentiles(simulations);
    
    const chartData = percentiles.map((p, i) => ({
      age: currentAge + i,
      year: new Date().getFullYear() + i,
      p10: Math.round(p.p10),
      p25: Math.round(p.p25),
      p50: Math.round(p.p50),
      p75: Math.round(p.p75),
      p90: Math.round(p.p90),
    }));
    
    setSimulationResults(chartData);
  };

  const retirementValue = projections[projections.length - 1]?.total || 0;
  const realRetirementValue = projections[projections.length - 1]?.realTotal || 0;
  const withdrawalRate = 0.04;
  const sustainableWithdrawal = realRetirementValue * withdrawalRate;
  const canRetire = sustainableWithdrawal >= annualSpending;

  const eventIcons = {
    income_change: Briefcase,
    expense_change: DollarSign,
    asset_purchase: Home,
    asset_sale: TrendingUp,
    retirement: Heart,
    inheritance: Heart,
    major_expense: Car,
    other: Calendar,
  };

  const goalTypeColors = {
    retirement: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
    btc_stack: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    emergency_fund: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    major_purchase: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    debt_payoff: 'bg-rose-400/10 text-rose-400 border-rose-400/20',
    other: 'bg-zinc-400/10 text-zinc-400 border-zinc-400/20',
  };

  useEffect(() => {
    if (editingGoal) {
      setGoalForm({
        name: editingGoal.name || '', target_amount: editingGoal.target_amount || '', current_amount: editingGoal.current_amount || '',
        target_date: editingGoal.target_date || '', goal_type: editingGoal.goal_type || 'other', priority: editingGoal.priority || 'medium', notes: editingGoal.notes || '',
      });
    }
  }, [editingGoal]);

  useEffect(() => {
    if (editingEvent) {
      setEventForm({
        name: editingEvent.name || '', event_type: editingEvent.event_type || 'expense_change', year: editingEvent.year || new Date().getFullYear() + 1,
        amount: editingEvent.amount || '', is_recurring: editingEvent.is_recurring || false, recurring_years: editingEvent.recurring_years || '',
        affects: editingEvent.affects || 'expenses', notes: editingEvent.notes || '',
      });
    }
  }, [editingEvent]);

  useEffect(() => {
    if (editingScenario) {
      setScenarioForm({
        name: editingScenario.name || '', scenario_type: editingScenario.scenario_type || 'custom',
        btc_cagr_override: editingScenario.btc_cagr_override || '', stocks_cagr_override: editingScenario.stocks_cagr_override || '',
        inflation_override: editingScenario.inflation_override || '', market_crash_year: editingScenario.market_crash_year || '',
        crash_severity_percent: editingScenario.crash_severity_percent || '', description: editingScenario.description || '',
      });
    }
  }, [editingScenario]);

  const handleSubmitGoal = (e) => {
    e.preventDefault();
    const data = { ...goalForm, target_amount: parseFloat(goalForm.target_amount) || 0, current_amount: parseFloat(goalForm.current_amount) || 0 };
    editingGoal ? updateGoal.mutate({ id: editingGoal.id, data }) : createGoal.mutate(data);
  };

  const handleSubmitEvent = (e) => {
    e.preventDefault();
    const data = { ...eventForm, year: parseInt(eventForm.year), amount: parseFloat(eventForm.amount) || 0, recurring_years: parseInt(eventForm.recurring_years) || 0 };
    editingEvent ? updateEvent.mutate({ id: editingEvent.id, data }) : createEvent.mutate(data);
  };

  const handleSubmitScenario = (e) => {
    e.preventDefault();
    const data = {
      ...scenarioForm,
      btc_cagr_override: scenarioForm.btc_cagr_override ? parseFloat(scenarioForm.btc_cagr_override) : null,
      stocks_cagr_override: scenarioForm.stocks_cagr_override ? parseFloat(scenarioForm.stocks_cagr_override) : null,
      inflation_override: scenarioForm.inflation_override ? parseFloat(scenarioForm.inflation_override) : null,
      market_crash_year: scenarioForm.market_crash_year ? parseInt(scenarioForm.market_crash_year) : null,
      crash_severity_percent: scenarioForm.crash_severity_percent ? parseFloat(scenarioForm.crash_severity_percent) : null,
    };
    editingScenario ? updateScenario.mutate({ id: editingScenario.id, data }) : createScenario.mutate(data);
  };

  const resetGoalForm = () => setGoalForm({ name: '', target_amount: '', current_amount: '', target_date: '', goal_type: 'other', priority: 'medium', notes: '' });
  const resetEventForm = () => setEventForm({ name: '', event_type: 'expense_change', year: new Date().getFullYear() + 1, amount: '', is_recurring: false, recurring_years: '', affects: 'expenses', notes: '' });
  const resetScenarioForm = () => setScenarioForm({ name: '', scenario_type: 'custom', btc_cagr_override: '', stocks_cagr_override: '', inflation_override: '', market_crash_year: '', crash_severity_percent: '', description: '' });
  const resetAccountForm = () => setAccountForm({ name: '', account_type: 'taxable', institution: '', annual_contribution: '', employer_match_percent: '', employer_match_limit: '', notes: '' });

  useEffect(() => {
    if (editingAccount) {
      setAccountForm({
        name: editingAccount.name || '', account_type: editingAccount.account_type || 'taxable',
        institution: editingAccount.institution || '', annual_contribution: editingAccount.annual_contribution || '',
        employer_match_percent: editingAccount.employer_match_percent || '', employer_match_limit: editingAccount.employer_match_limit || '',
        notes: editingAccount.notes || '',
      });
    }
  }, [editingAccount]);

  const handleSubmitAccount = (e) => {
    e.preventDefault();
    const data = {
      ...accountForm,
      annual_contribution: parseFloat(accountForm.annual_contribution) || 0,
      employer_match_percent: parseFloat(accountForm.employer_match_percent) || 0,
      employer_match_limit: parseFloat(accountForm.employer_match_limit) || 0,
    };
    editingAccount ? updateAccount.mutate({ id: editingAccount.id, data }) : createAccount.mutate(data);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Projections</h1>
          <p className="text-zinc-500 mt-1">Model your financial future with scenarios and simulations</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowMonteCarloSettings(!showMonteCarloSettings)} className="bg-transparent border-zinc-700">
            <Settings className="w-4 h-4 mr-2" />
            Assumptions
          </Button>
          <Button onClick={handleRunSimulation} className="brand-gradient text-white font-semibold hover:opacity-90 shadow-lg shadow-orange-500/20">
            <Play className="w-4 h-4 mr-2" />
            Run Simulation
          </Button>
        </div>
      </div>

      {/* Assumptions Panel */}
      {showMonteCarloSettings && (
        <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
          <h3 className="font-semibold mb-6 flex items-center gap-2">
            <Settings className="w-5 h-5 text-orange-400" />
            Rate Assumptions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label className="text-zinc-400">Bitcoin CAGR</Label>
                <span className="text-orange-400 font-semibold">{btcCagr}%</span>
              </div>
              <Slider value={[btcCagr]} onValueChange={([v]) => setBtcCagr(v)} min={-20} max={100} step={1} />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label className="text-zinc-400">BTC Volatility</Label>
                <span className="text-orange-400 font-semibold">{btcVolatility}%</span>
              </div>
              <Slider value={[btcVolatility]} onValueChange={([v]) => setBtcVolatility(v)} min={10} max={100} step={1} />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label className="text-zinc-400">Stocks CAGR</Label>
                <span className="text-blue-400 font-semibold">{stocksCagr}%</span>
              </div>
              <Slider value={[stocksCagr]} onValueChange={([v]) => setStocksCagr(v)} min={-10} max={20} step={0.5} />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label className="text-zinc-400">Real Estate CAGR</Label>
                <span className="text-emerald-400 font-semibold">{realEstateCagr}%</span>
              </div>
              <Slider value={[realEstateCagr]} onValueChange={([v]) => setRealEstateCagr(v)} min={0} max={15} step={0.5} />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label className="text-zinc-400">Bonds CAGR</Label>
                <span className="text-purple-400 font-semibold">{bondsCagr}%</span>
              </div>
              <Slider value={[bondsCagr]} onValueChange={([v]) => setBondsCagr(v)} min={0} max={10} step={0.5} />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label className="text-zinc-400">Inflation Rate</Label>
                <span className="text-rose-400 font-semibold">{inflationRate}%</span>
              </div>
              <Slider value={[inflationRate]} onValueChange={([v]) => setInflationRate(v)} min={0} max={15} step={0.5} />
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-zinc-800/50 p-1 flex-wrap">
          <TabsTrigger value="projections" className="data-[state=active]:bg-zinc-700">Projections</TabsTrigger>
          <TabsTrigger value="accounts" className="data-[state=active]:bg-zinc-700">Accounts</TabsTrigger>
          <TabsTrigger value="montecarlo" className="data-[state=active]:bg-zinc-700">Monte Carlo</TabsTrigger>
          <TabsTrigger value="scenarios" className="data-[state=active]:bg-zinc-700">Scenarios</TabsTrigger>
          <TabsTrigger value="lifeevents" className="data-[state=active]:bg-zinc-700">Life Events</TabsTrigger>
          <TabsTrigger value="goals" className="data-[state=active]:bg-zinc-700">Goals</TabsTrigger>
        </TabsList>

        {/* Projections Tab */}
        <TabsContent value="projections" className="space-y-6">
          {/* Retirement Settings */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-6">Retirement Planning</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label className="text-zinc-400">Current Age</Label>
                <Input type="number" value={currentAge} onChange={(e) => setCurrentAge(parseInt(e.target.value) || 0)} className="bg-zinc-900 border-zinc-800" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Target Retirement Age</Label>
                <Input type="number" value={retirementAge} onChange={(e) => setRetirementAge(parseInt(e.target.value) || 65)} className="bg-zinc-900 border-zinc-800" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Annual Spending Need</Label>
                <Input type="number" value={annualSpending} onChange={(e) => setAnnualSpending(parseInt(e.target.value) || 0)} className="bg-zinc-900 border-zinc-800" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-6 p-4 rounded-xl bg-zinc-800/30">
              <div>
                <p className="text-sm text-zinc-500">Projected at Retirement</p>
                <p className="text-2xl font-bold text-orange-400">${(retirementValue / 1000000).toFixed(2)}M</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Inflation Adjusted</p>
                <p className="text-2xl font-bold text-zinc-300">${(realRetirementValue / 1000000).toFixed(2)}M</p>
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

            {/* Account Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-700">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-zinc-400" />
                  <p className="text-sm text-zinc-500">Taxable</p>
                </div>
                <p className="text-xl font-bold text-zinc-300">${taxableValue.toLocaleString()}</p>
                <p className="text-xs text-zinc-500 mt-1">Subject to capital gains tax</p>
              </div>
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Landmark className="w-4 h-4 text-blue-400" />
                  <p className="text-sm text-blue-400">Tax-Deferred</p>
                </div>
                <p className="text-xl font-bold text-blue-400">${taxDeferredValue.toLocaleString()}</p>
                <p className="text-xs text-zinc-500 mt-1">401(k), Traditional IRA</p>
              </div>
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <PiggyBank className="w-4 h-4 text-emerald-400" />
                  <p className="text-sm text-emerald-400">Tax-Free</p>
                </div>
                <p className="text-xl font-bold text-emerald-400">${taxFreeValue.toLocaleString()}</p>
                <p className="text-xs text-zinc-500 mt-1">Roth IRA, Roth 401(k), HSA</p>
              </div>
            </div>
          </div>

          {/* Active Scenario */}
          {scenarios.length > 0 && (
            <div className="card-premium rounded-xl p-4 border border-zinc-800/50">
              <div className="flex items-center gap-4">
                <Label className="text-zinc-400">Active Scenario:</Label>
                <Select value={activeScenarioId || 'base'} onValueChange={(v) => setActiveScenarioId(v === 'base' ? null : v)}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 w-48">
                    <SelectValue placeholder="Base Case" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="base">Base Case</SelectItem>
                    {scenarios.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeScenario && (
                  <Badge variant="outline" className="border-orange-400/50 text-orange-400">
                    {activeScenario.btc_cagr_override && `BTC: ${activeScenario.btc_cagr_override}%`}
                    {activeScenario.market_crash_year && ` | Crash: ${activeScenario.market_crash_year}`}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Projection Chart */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-6">Wealth Projection</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={projections}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="age" stroke="#71717a" fontSize={12} />
                  <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                    formatter={(value) => [`$${value.toLocaleString()}`, '']}
                    labelFormatter={(age) => `Age ${age}`}
                  />
                  <ReferenceLine x={retirementAge} stroke="#F7931A" strokeDasharray="5 5" label={{ value: 'Retirement', fill: '#F7931A', fontSize: 12 }} />
                  <Area type="monotone" dataKey="bonds" stackId="1" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.3} name="Bonds" />
                  <Area type="monotone" dataKey="realEstate" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Real Estate" />
                  <Area type="monotone" dataKey="stocks" stackId="1" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.3} name="Stocks" />
                  <Area type="monotone" dataKey="btc" stackId="1" stroke="#F7931A" fill="#F7931A" fillOpacity={0.5} name="Bitcoin" />
                  <Line type="monotone" dataKey="realTotal" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Inflation Adjusted" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-400" /><span className="text-sm text-zinc-400">Bitcoin</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-400" /><span className="text-sm text-zinc-400">Stocks</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-400" /><span className="text-sm text-zinc-400">Real Estate</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-400" /><span className="text-sm text-zinc-400">Bonds</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-rose-400" /><span className="text-sm text-zinc-400">Inflation Adjusted</span></div>
            </div>
          </div>
        </TabsContent>

        {/* Accounts Tab */}
        <TabsContent value="accounts" className="space-y-6">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold">Investment Accounts</h3>
                <p className="text-sm text-zinc-500">Manage taxable and tax-advantaged accounts</p>
              </div>
              <Button size="sm" onClick={() => { setEditingAccount(null); resetAccountForm(); setAccountFormOpen(true); }} className="brand-gradient text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add Account
              </Button>
            </div>

            {/* Account Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-zinc-800/30">
                <p className="text-sm text-zinc-500 mb-1">Total Annual Contributions</p>
                <p className="text-2xl font-bold text-orange-400">${totalAnnualContributions.toLocaleString()}</p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-800/30">
                <p className="text-sm text-zinc-500 mb-1">Tax-Advantaged %</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {totalValue > 0 ? (((taxDeferredValue + taxFreeValue) / totalValue) * 100).toFixed(0) : 0}%
                </p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-800/30">
                <p className="text-sm text-zinc-500 mb-1">Total Accounts</p>
                <p className="text-2xl font-bold text-zinc-300">{accounts.length}</p>
              </div>
            </div>

            {accounts.length === 0 ? (
              <div className="text-center py-12">
                <Landmark className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">No accounts added yet</p>
                <p className="text-sm text-zinc-600 mt-1">Add your 401(k), IRA, Roth IRA, and brokerage accounts</p>
              </div>
            ) : (
              <div className="space-y-3">
                {accounts.map(account => {
                  const info = ACCOUNT_TYPE_INFO[account.account_type] || ACCOUNT_TYPE_INFO.taxable;
                  const Icon = info.icon;
                  const accountHoldings = holdingsWithAccounts.filter(h => h.account_id === account.id);
                  const accountValue = accountHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);
                  
                  return (
                    <div key={account.id} className="p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", 
                            info.taxFree ? "bg-emerald-400/10" : info.taxDeferred ? "bg-blue-400/10" : "bg-zinc-700")}>
                            <Icon className={cn("w-5 h-5", info.color)} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{account.name}</p>
                              <Badge variant="outline" className={cn("text-xs", 
                                info.taxFree ? "border-emerald-400/50 text-emerald-400" : 
                                info.taxDeferred ? "border-blue-400/50 text-blue-400" : 
                                "border-zinc-600 text-zinc-400")}>
                                {info.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-zinc-500">{account.institution || 'No institution'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-semibold text-zinc-200">${accountValue.toLocaleString()}</p>
                            {account.annual_contribution > 0 && (
                              <p className="text-xs text-zinc-500">+${account.annual_contribution.toLocaleString()}/yr</p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => { setEditingAccount(account); setAccountFormOpen(true); }} className="p-1.5 rounded-lg hover:bg-zinc-700">
                              <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                            </button>
                            <button onClick={() => deleteAccount.mutate(account.id)} className="p-1.5 rounded-lg hover:bg-rose-600/50">
                              <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                      {(account.employer_match_percent > 0 || info.limit2024) && (
                        <div className="flex gap-4 mt-3 pt-3 border-t border-zinc-700/50 text-xs text-zinc-500">
                          {account.employer_match_percent > 0 && (
                            <span className="text-emerald-400">Employer match: {account.employer_match_percent}% up to ${account.employer_match_limit?.toLocaleString()}</span>
                          )}
                          {info.limit2024 && (
                            <span>2024 limit: ${info.limit2024.toLocaleString()}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tax Treatment Breakdown */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-4">Tax Treatment Breakdown</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-zinc-400" />
                  <span className="text-zinc-300">Taxable (Brokerage)</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold">${taxableValue.toLocaleString()}</span>
                  <span className="text-zinc-500 ml-2">({totalValue > 0 ? ((taxableValue / totalValue) * 100).toFixed(0) : 0}%)</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/10">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-blue-400" />
                  <span className="text-zinc-300">Tax-Deferred (401k, Trad IRA)</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-blue-400">${taxDeferredValue.toLocaleString()}</span>
                  <span className="text-zinc-500 ml-2">({totalValue > 0 ? ((taxDeferredValue / totalValue) * 100).toFixed(0) : 0}%)</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                  <span className="text-zinc-300">Tax-Free (Roth, HSA)</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-emerald-400">${taxFreeValue.toLocaleString()}</span>
                  <span className="text-zinc-500 ml-2">({totalValue > 0 ? ((taxFreeValue / totalValue) * 100).toFixed(0) : 0}%)</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-4">
              Tax-deferred accounts are taxed as ordinary income at withdrawal. Tax-free accounts grow and withdraw tax-free.
            </p>
          </div>
        </TabsContent>

        {/* Monte Carlo Tab */}
        <TabsContent value="montecarlo" className="space-y-6">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-orange-400" />
                  Monte Carlo Simulation
                </h3>
                <p className="text-sm text-zinc-500 mt-1">500 randomized scenarios based on historical volatility</p>
              </div>
              <Button onClick={handleRunSimulation} className="brand-gradient text-white font-semibold">
                <RefreshCw className="w-4 h-4 mr-2" />
                Run Simulation
              </Button>
            </div>

            {simulationResults ? (
              <>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={simulationResults}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="age" stroke="#71717a" fontSize={12} />
                      <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                        formatter={(value, name) => [`$${value.toLocaleString()}`, name.replace('p', '') + 'th percentile']}
                      />
                      <Area type="monotone" dataKey="p10" stackId="1" stroke="none" fill="#ef4444" fillOpacity={0.1} />
                      <Area type="monotone" dataKey="p25" stackId="2" stroke="none" fill="#f59e0b" fillOpacity={0.2} />
                      <Area type="monotone" dataKey="p75" stackId="3" stroke="none" fill="#10b981" fillOpacity={0.2} />
                      <Area type="monotone" dataKey="p90" stackId="4" stroke="none" fill="#10b981" fillOpacity={0.1} />
                      <Line type="monotone" dataKey="p50" stroke="#F7931A" strokeWidth={3} dot={false} name="Median" />
                      <Line type="monotone" dataKey="p10" stroke="#ef4444" strokeWidth={1} strokeDasharray="3 3" dot={false} />
                      <Line type="monotone" dataKey="p90" stroke="#10b981" strokeWidth={1} strokeDasharray="3 3" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <p className="text-sm text-zinc-500">10th Percentile (Worst)</p>
                    <p className="text-2xl font-bold text-rose-400">${(simulationResults[simulationResults.length - 1]?.p10 / 1000000).toFixed(2)}M</p>
                  </div>
                  <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                    <p className="text-sm text-zinc-500">50th Percentile (Median)</p>
                    <p className="text-2xl font-bold text-orange-400">${(simulationResults[simulationResults.length - 1]?.p50 / 1000000).toFixed(2)}M</p>
                  </div>
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-sm text-zinc-500">90th Percentile (Best)</p>
                    <p className="text-2xl font-bold text-emerald-400">${(simulationResults[simulationResults.length - 1]?.p90 / 1000000).toFixed(2)}M</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-16">
                <Play className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">Click "Run Simulation" to generate Monte Carlo projections</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Scenarios Tab */}
        <TabsContent value="scenarios" className="space-y-6">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold">Economic Scenarios</h3>
              <Button size="sm" onClick={() => { setEditingScenario(null); resetScenarioForm(); setScenarioFormOpen(true); }} className="brand-gradient text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add Scenario
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Base Case Card */}
              <div className={cn(
                "p-5 rounded-xl border transition-all cursor-pointer",
                !activeScenarioId ? "bg-orange-500/10 border-orange-500/30" : "bg-zinc-800/30 border-zinc-800 hover:border-zinc-700"
              )} onClick={() => setActiveScenarioId(null)}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold">Base Case</h4>
                  {!activeScenarioId && <Badge className="bg-orange-500/20 text-orange-400">Active</Badge>}
                </div>
                <p className="text-sm text-zinc-500">Default assumptions with no market shocks</p>
                <div className="flex gap-4 mt-3 text-sm">
                  <span className="text-orange-400">BTC: {btcCagr}%</span>
                  <span className="text-blue-400">Stocks: {stocksCagr}%</span>
                  <span className="text-rose-400">Inflation: {inflationRate}%</span>
                </div>
              </div>

              {scenarios.map(scenario => (
                <div key={scenario.id} className={cn(
                  "p-5 rounded-xl border transition-all cursor-pointer",
                  activeScenarioId === scenario.id ? "bg-orange-500/10 border-orange-500/30" : "bg-zinc-800/30 border-zinc-800 hover:border-zinc-700"
                )} onClick={() => setActiveScenarioId(scenario.id)}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold">{scenario.name}</h4>
                    <div className="flex items-center gap-2">
                      {activeScenarioId === scenario.id && <Badge className="bg-orange-500/20 text-orange-400">Active</Badge>}
                      <button onClick={(e) => { e.stopPropagation(); setEditingScenario(scenario); setScenarioFormOpen(true); }} className="p-1 hover:bg-zinc-700 rounded">
                        <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteScenario.mutate(scenario.id); }} className="p-1 hover:bg-rose-600/50 rounded">
                        <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                      </button>
                    </div>
                  </div>
                  {scenario.description && <p className="text-sm text-zinc-500 mb-3">{scenario.description}</p>}
                  <div className="flex flex-wrap gap-3 text-sm">
                    {scenario.btc_cagr_override && <span className="text-orange-400">BTC: {scenario.btc_cagr_override}%</span>}
                    {scenario.stocks_cagr_override && <span className="text-blue-400">Stocks: {scenario.stocks_cagr_override}%</span>}
                    {scenario.inflation_override && <span className="text-rose-400">Inflation: {scenario.inflation_override}%</span>}
                    {scenario.market_crash_year && <Badge variant="outline" className="border-rose-400/50 text-rose-400">Crash: {scenario.market_crash_year} (-{scenario.crash_severity_percent}%)</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Life Events Tab */}
        <TabsContent value="lifeevents" className="space-y-6">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold">Life Events</h3>
                <p className="text-sm text-zinc-500">Model major financial events in your future</p>
              </div>
              <Button size="sm" onClick={() => { setEditingEvent(null); resetEventForm(); setEventFormOpen(true); }} className="brand-gradient text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add Event
              </Button>
            </div>

            {lifeEvents.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">No life events added yet</p>
                <p className="text-sm text-zinc-600 mt-1">Add events like buying a house, having kids, or changing jobs</p>
              </div>
            ) : (
              <div className="space-y-3">
                {lifeEvents.sort((a, b) => a.year - b.year).map(event => {
                  const Icon = eventIcons[event.event_type] || Calendar;
                  return (
                    <div key={event.id} className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-orange-400/10 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-orange-400" />
                        </div>
                        <div>
                          <p className="font-medium">{event.name}</p>
                          <div className="flex items-center gap-2 text-sm text-zinc-500">
                            <span>{event.year}</span>
                            {event.is_recurring && <Badge variant="outline" className="text-xs">Recurring {event.recurring_years}yrs</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className={cn("font-semibold", event.amount >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {event.amount >= 0 ? '+' : ''}${Math.abs(event.amount).toLocaleString()}
                        </p>
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingEvent(event); setEventFormOpen(true); }} className="p-1.5 rounded-lg hover:bg-zinc-700"><Pencil className="w-3.5 h-3.5 text-zinc-400" /></button>
                          <button onClick={() => deleteEvent.mutate(event.id)} className="p-1.5 rounded-lg hover:bg-rose-600/50"><Trash2 className="w-3.5 h-3.5 text-zinc-400" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Goals Tab */}
        <TabsContent value="goals" className="space-y-6">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold">Financial Goals</h3>
              <Button size="sm" onClick={() => { setEditingGoal(null); resetGoalForm(); setGoalFormOpen(true); }} className="brand-gradient text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add Goal
              </Button>
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
                          <span className={cn("px-2 py-1 rounded-lg text-xs font-medium border", goalTypeColors[goal.goal_type])}>{goal.goal_type?.replace('_', ' ')}</span>
                          <h4 className="font-medium">{goal.name}</h4>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingGoal(goal); setGoalFormOpen(true); }} className="p-1.5 rounded-lg hover:bg-zinc-700"><Pencil className="w-3.5 h-3.5 text-zinc-400" /></button>
                          <button onClick={() => deleteGoal.mutate(goal.id)} className="p-1.5 rounded-lg hover:bg-rose-600/50"><Trash2 className="w-3.5 h-3.5 text-zinc-400" /></button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mb-2 text-sm">
                        <span className="text-zinc-400">${(goal.current_amount || 0).toLocaleString()} / ${goal.target_amount.toLocaleString()}</span>
                        <span className="font-medium text-orange-400">{progress.toFixed(0)}%</span>
                      </div>
                      <Progress value={progress} className="h-2 bg-zinc-700" />
                      {goal.target_date && <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1"><Calendar className="w-3 h-3" />Target: {new Date(goal.target_date).toLocaleDateString()}</p>}
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
          <DialogHeader><DialogTitle>{editingGoal ? 'Edit Goal' : 'Add Goal'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitGoal} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Goal Name</Label>
              <Input value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} className="bg-zinc-900 border-zinc-800" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Target Amount</Label>
                <Input type="number" value={goalForm.target_amount} onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })} className="bg-zinc-900 border-zinc-800" required />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Current Amount</Label>
                <Input type="number" value={goalForm.current_amount} onChange={(e) => setGoalForm({ ...goalForm, current_amount: e.target.value })} className="bg-zinc-900 border-zinc-800" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Goal Type</Label>
                <Select value={goalForm.goal_type} onValueChange={(value) => setGoalForm({ ...goalForm, goal_type: value })}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
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
                <Input type="date" value={goalForm.target_date} onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })} className="bg-zinc-900 border-zinc-800" />
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setGoalFormOpen(false)} className="flex-1 bg-transparent border-zinc-800">Cancel</Button>
              <Button type="submit" className="flex-1 brand-gradient text-white font-semibold">{editingGoal ? 'Update' : 'Add'} Goal</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Event Form Dialog */}
      <Dialog open={eventFormOpen} onOpenChange={setEventFormOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-md">
          <DialogHeader><DialogTitle>{editingEvent ? 'Edit Life Event' : 'Add Life Event'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitEvent} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Event Name</Label>
              <Input value={eventForm.name} onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })} placeholder="e.g., Buy a house" className="bg-zinc-900 border-zinc-800" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Event Type</Label>
                <Select value={eventForm.event_type} onValueChange={(value) => setEventForm({ ...eventForm, event_type: value })}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="income_change">Income Change</SelectItem>
                    <SelectItem value="expense_change">Expense Change</SelectItem>
                    <SelectItem value="asset_purchase">Asset Purchase</SelectItem>
                    <SelectItem value="asset_sale">Asset Sale</SelectItem>
                    <SelectItem value="major_expense">Major Expense</SelectItem>
                    <SelectItem value="inheritance">Inheritance</SelectItem>
                    <SelectItem value="retirement">Retirement</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Year</Label>
                <Input type="number" value={eventForm.year} onChange={(e) => setEventForm({ ...eventForm, year: e.target.value })} className="bg-zinc-900 border-zinc-800" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Amount (+ or -)</Label>
                <Input type="number" value={eventForm.amount} onChange={(e) => setEventForm({ ...eventForm, amount: e.target.value })} placeholder="-50000" className="bg-zinc-900 border-zinc-800" required />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Affects</Label>
                <Select value={eventForm.affects} onValueChange={(value) => setEventForm({ ...eventForm, affects: value })}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="assets">Assets</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expenses">Expenses</SelectItem>
                    <SelectItem value="liabilities">Liabilities</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/30">
              <Switch checked={eventForm.is_recurring} onCheckedChange={(checked) => setEventForm({ ...eventForm, is_recurring: checked })} />
              <div className="flex-1">
                <Label className="text-zinc-300">Recurring Event</Label>
                {eventForm.is_recurring && (
                  <Input type="number" value={eventForm.recurring_years} onChange={(e) => setEventForm({ ...eventForm, recurring_years: e.target.value })} placeholder="Number of years" className="bg-zinc-900 border-zinc-800 mt-2" />
                )}
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setEventFormOpen(false)} className="flex-1 bg-transparent border-zinc-800">Cancel</Button>
              <Button type="submit" className="flex-1 brand-gradient text-white font-semibold">{editingEvent ? 'Update' : 'Add'} Event</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Scenario Form Dialog */}
      <Dialog open={scenarioFormOpen} onOpenChange={setScenarioFormOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingScenario ? 'Edit Scenario' : 'Add Scenario'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitScenario} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Scenario Name</Label>
              <Input value={scenarioForm.name} onChange={(e) => setScenarioForm({ ...scenarioForm, name: e.target.value })} placeholder="e.g., Bear Market 2026" className="bg-zinc-900 border-zinc-800" required />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Description</Label>
              <Textarea value={scenarioForm.description} onChange={(e) => setScenarioForm({ ...scenarioForm, description: e.target.value })} placeholder="Describe this scenario..." className="bg-zinc-900 border-zinc-800 resize-none" rows={2} />
            </div>
            <div className="p-4 rounded-xl bg-zinc-800/30">
              <p className="text-sm font-medium text-zinc-300 mb-3">Override Assumptions (leave blank to use defaults)</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Bitcoin CAGR %</Label>
                  <Input type="number" value={scenarioForm.btc_cagr_override} onChange={(e) => setScenarioForm({ ...scenarioForm, btc_cagr_override: e.target.value })} placeholder={btcCagr.toString()} className="bg-zinc-900 border-zinc-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Stocks CAGR %</Label>
                  <Input type="number" value={scenarioForm.stocks_cagr_override} onChange={(e) => setScenarioForm({ ...scenarioForm, stocks_cagr_override: e.target.value })} placeholder={stocksCagr.toString()} className="bg-zinc-900 border-zinc-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Inflation %</Label>
                  <Input type="number" value={scenarioForm.inflation_override} onChange={(e) => setScenarioForm({ ...scenarioForm, inflation_override: e.target.value })} placeholder={inflationRate.toString()} className="bg-zinc-900 border-zinc-800" />
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <p className="text-sm font-medium text-rose-400 mb-3">Market Crash (optional)</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Crash Year</Label>
                  <Input type="number" value={scenarioForm.market_crash_year} onChange={(e) => setScenarioForm({ ...scenarioForm, market_crash_year: e.target.value })} placeholder="2026" className="bg-zinc-900 border-zinc-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Severity %</Label>
                  <Input type="number" value={scenarioForm.crash_severity_percent} onChange={(e) => setScenarioForm({ ...scenarioForm, crash_severity_percent: e.target.value })} placeholder="40" className="bg-zinc-900 border-zinc-800" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setScenarioFormOpen(false)} className="flex-1 bg-transparent border-zinc-800">Cancel</Button>
              <Button type="submit" className="flex-1 brand-gradient text-white font-semibold">{editingScenario ? 'Update' : 'Add'} Scenario</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}