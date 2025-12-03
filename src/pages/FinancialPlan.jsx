import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart, Legend } from 'recharts';
import { Target, Plus, Pencil, Trash2, TrendingUp, Calendar, Settings, Play, AlertTriangle, ChevronDown, ChevronUp, Sparkles, Home, Car, Baby, Briefcase, Heart, DollarSign, RefreshCw } from 'lucide-react';
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

// Calculate success probability (percentage of simulations meeting target)
const calculateSuccessProbability = (simulations, targetValue) => {
  const finalValues = simulations.map(sim => sim[sim.length - 1]);
  const successCount = finalValues.filter(v => v >= targetValue).length;
  return (successCount / simulations.length) * 100;
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
  const [stocksCagr, setStocksCagr] = useState(7);
  const [stocksVolatility, setStocksVolatility] = useState(15);
  const [realEstateCagr, setRealEstateCagr] = useState(4);
  const [bondsCagr, setBondsCagr] = useState(3);
  const [inflationRate, setInflationRate] = useState(3);
  const [incomeGrowth, setIncomeGrowth] = useState(3);
  const [annualSavings, setAnnualSavings] = useState(20000);
  
  // Retirement settings
  const [retirementAge, setRetirementAge] = useState(65);
  const [currentAge, setCurrentAge] = useState(35);
  const [annualSpending, setAnnualSpending] = useState(100000);
  
  // Monte Carlo
  const [runSimulation, setRunSimulation] = useState(false);
  const [simulationResults, setSimulationResults] = useState(null);
  const [successProbability, setSuccessProbability] = useState(null);
  const [retirementTarget, setRetirementTarget] = useState(2500000);
  
  // Forms
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);


  const [goalForm, setGoalForm] = useState({
    name: '', target_amount: '', current_amount: '', target_date: '', goal_type: 'other', priority: 'medium', notes: '',
  });

  const [eventForm, setEventForm] = useState({
    name: '', event_type: 'expense_change', year: new Date().getFullYear() + 1, amount: '', is_recurring: false, recurring_years: '', affects: 'expenses', notes: '',
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



  // Calculate portfolio values
  const btcValue = holdings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity * currentPrice, 0);
  const stocksValue = holdings.filter(h => h.asset_type === 'stocks').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const realEstateValue = holdings.filter(h => h.asset_type === 'real_estate').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const bondsValue = holdings.filter(h => h.asset_type === 'bonds').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const otherValue = holdings.filter(h => !['BTC'].includes(h.ticker) && !['stocks', 'real_estate', 'bonds'].includes(h.asset_type)).reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const totalValue = btcValue + stocksValue + realEstateValue + bondsValue + otherValue;

  // Use slider values directly (scenarios removed)
  const effectiveBtcCagr = btcCagr;
  const effectiveStocksCagr = stocksCagr;
  const effectiveInflation = inflationRate;

  // Generate projection data with cumulative savings factored in
  const projections = useMemo(() => {
    const years = retirementAge - currentAge;
    const data = [];
    const currentYear = new Date().getFullYear();
    
    let cumulativeSavings = 0;
    
    for (let i = 0; i <= years; i++) {
      const year = currentYear + i;
      
      // Calculate life event impacts for this year
      let eventImpact = 0;
      lifeEvents.forEach(event => {
        if (event.year === year || (event.is_recurring && event.year <= year && year < event.year + (event.recurring_years || 1))) {
          if (event.affects === 'assets') eventImpact += event.amount;
        }
      });
      
      // Annual savings grows with income growth rate
      const yearSavings = i > 0 ? annualSavings * Math.pow(1 + incomeGrowth / 100, i) : 0;
      cumulativeSavings += yearSavings;
      
      // Assume new savings are invested in a mix (simplified: grows at blended rate)
      const blendedGrowthRate = (effectiveBtcCagr * 0.3 + effectiveStocksCagr * 0.7) / 100;
      const savingsGrown = cumulativeSavings * Math.pow(1 + blendedGrowthRate, Math.max(0, i - 1));
      
      const btcProjected = btcValue * Math.pow(1 + effectiveBtcCagr / 100, i);
      const stocksProjected = stocksValue * Math.pow(1 + effectiveStocksCagr / 100, i);
      const realEstateProjected = realEstateValue * Math.pow(1 + realEstateCagr / 100, i);
      const bondsProjected = bondsValue * Math.pow(1 + bondsCagr / 100, i);
      const otherProjected = otherValue * Math.pow(1 + stocksCagr / 100, i);
      
      const total = btcProjected + stocksProjected + realEstateProjected + bondsProjected + otherProjected + savingsGrown + eventImpact;
      const realTotal = total / Math.pow(1 + effectiveInflation / 100, i); // Inflation adjusted
      
      data.push({
        age: currentAge + i,
        year,
        btc: Math.round(btcProjected),
        stocks: Math.round(stocksProjected),
        realEstate: Math.round(realEstateProjected),
        bonds: Math.round(bondsProjected),
        savings: Math.round(savingsGrown),
        total: Math.round(total),
        realTotal: Math.round(realTotal),
        hasEvent: lifeEvents.some(e => e.year === year),
      });
    }
    return data;
  }, [btcValue, stocksValue, realEstateValue, bondsValue, otherValue, currentAge, retirementAge, effectiveBtcCagr, effectiveStocksCagr, realEstateCagr, bondsCagr, effectiveInflation, lifeEvents, annualSavings, incomeGrowth]);

  // Run Monte Carlo when button clicked
  const handleRunSimulation = () => {
    const years = retirementAge - currentAge;
    // Use a blended volatility based on portfolio composition
    const btcWeight = totalValue > 0 ? btcValue / totalValue : 0.5;
    const blendedVolatility = 60 * btcWeight + stocksVolatility * (1 - btcWeight); // BTC ~60% vol, stocks ~15%
    const blendedReturn = effectiveBtcCagr * btcWeight + effectiveStocksCagr * (1 - btcWeight);
    const simulations = runMonteCarloSimulation(totalValue, years, blendedReturn, blendedVolatility, 1000);
    const percentiles = calculatePercentiles(simulations);
    
    // Calculate success probability against target
    const probability = calculateSuccessProbability(simulations, retirementTarget);
    setSuccessProbability(probability);
    
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



  const resetGoalForm = () => setGoalForm({ name: '', target_amount: '', current_amount: '', target_date: '', goal_type: 'other', priority: 'medium', notes: '' });
  const resetEventForm = () => setEventForm({ name: '', event_type: 'expense_change', year: new Date().getFullYear() + 1, amount: '', is_recurring: false, recurring_years: '', affects: 'expenses', notes: '' });


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
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label className="text-zinc-400">Income Growth</Label>
                <span className="text-cyan-400 font-semibold">{incomeGrowth}%</span>
              </div>
              <Slider value={[incomeGrowth]} onValueChange={([v]) => setIncomeGrowth(v)} min={0} max={10} step={0.5} />
            </div>
            <div className="space-y-3 lg:col-span-2">
              <div className="flex justify-between">
                <Label className="text-zinc-400">Annual Savings (grows with income)</Label>
                <span className="text-emerald-400 font-semibold">${annualSavings.toLocaleString()}</span>
              </div>
              <Slider value={[annualSavings]} onValueChange={([v]) => setAnnualSavings(v)} min={0} max={100000} step={1000} />
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-zinc-800/50 p-1 flex-wrap">
          <TabsTrigger value="projections" className="data-[state=active]:bg-zinc-700">Projections</TabsTrigger>
          <TabsTrigger value="montecarlo" className="data-[state=active]:bg-zinc-700">Monte Carlo</TabsTrigger>
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
          </div>



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

        {/* Monte Carlo Tab */}
        <TabsContent value="montecarlo" className="space-y-6">
          {/* Target Setting */}
          <div className="card-premium rounded-xl p-4 border border-zinc-800/50">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <Label className="text-zinc-400 text-sm">Retirement Target</Label>
                <p className="text-xs text-zinc-600">Set your goal to calculate success probability</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-zinc-500">$</span>
                <Input 
                  type="number" 
                  value={retirementTarget} 
                  onChange={(e) => setRetirementTarget(parseFloat(e.target.value) || 0)} 
                  className="bg-zinc-900 border-zinc-800 w-40" 
                />
                <Button onClick={handleRunSimulation} className="brand-gradient text-white font-semibold">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Run
                </Button>
              </div>
            </div>
          </div>

          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-orange-400" />
                  Monte Carlo Simulation
                </h3>
                <p className="text-sm text-zinc-500 mt-1">1,000 randomized scenarios based on historical volatility</p>
              </div>
            </div>

            {simulationResults ? (
              <>
                {/* Success Probability - Main Focus */}
                <div className={cn(
                  "p-6 rounded-2xl mb-6 text-center",
                  successProbability >= 80 ? "bg-emerald-500/10 border border-emerald-500/30" :
                  successProbability >= 50 ? "bg-amber-500/10 border border-amber-500/30" :
                  "bg-rose-500/10 border border-rose-500/30"
                )}>
                  <p className="text-sm text-zinc-400 mb-2">Probability of Reaching ${(retirementTarget / 1000000).toFixed(1)}M</p>
                  <p className={cn(
                    "text-5xl font-bold",
                    successProbability >= 80 ? "text-emerald-400" :
                    successProbability >= 50 ? "text-amber-400" :
                    "text-rose-400"
                  )}>
                    {successProbability?.toFixed(0)}%
                  </p>
                  <p className="text-sm text-zinc-500 mt-2">
                    {successProbability >= 80 ? "Excellent! You're on track for retirement." :
                     successProbability >= 50 ? "Good progress, but consider increasing savings." :
                     "You may need to adjust your plan to reach your goal."}
                  </p>
                </div>

                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={simulationResults}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="age" stroke="#71717a" fontSize={12} />
                      <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                        formatter={(value, name) => {
                          const labels = { p10: 'Worst Case (10%)', p25: 'Pessimistic (25%)', p50: 'Most Likely', p75: 'Optimistic (75%)', p90: 'Best Case (90%)' };
                          return [`$${value.toLocaleString()}`, labels[name] || name];
                        }}
                      />
                      <ReferenceLine y={retirementTarget} stroke="#F7931A" strokeDasharray="5 5" label={{ value: 'Target', fill: '#F7931A', fontSize: 12 }} />
                      <Area type="monotone" dataKey="p10" stackId="1" stroke="none" fill="#ef4444" fillOpacity={0.1} name="p10" />
                      <Area type="monotone" dataKey="p25" stackId="2" stroke="none" fill="#f59e0b" fillOpacity={0.15} name="p25" />
                      <Area type="monotone" dataKey="p75" stackId="3" stroke="none" fill="#10b981" fillOpacity={0.15} name="p75" />
                      <Area type="monotone" dataKey="p90" stackId="4" stroke="none" fill="#10b981" fillOpacity={0.1} name="p90" />
                      <Line type="monotone" dataKey="p50" stroke="#F7931A" strokeWidth={3} dot={false} name="p50" />
                      <Line type="monotone" dataKey="p10" stroke="#ef4444" strokeWidth={1} strokeDasharray="3 3" dot={false} name="p10" />
                      <Line type="monotone" dataKey="p90" stroke="#10b981" strokeWidth={1} strokeDasharray="3 3" dot={false} name="p90" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <p className="text-sm text-zinc-500">Worst Case (10%)</p>
                    <p className="text-2xl font-bold text-rose-400">${(simulationResults[simulationResults.length - 1]?.p10 / 1000000).toFixed(2)}M</p>
                    <p className="text-xs text-zinc-600 mt-1">90% chance to beat this</p>
                  </div>
                  <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                    <p className="text-sm text-zinc-500">Most Likely (Median)</p>
                    <p className="text-2xl font-bold text-orange-400">${(simulationResults[simulationResults.length - 1]?.p50 / 1000000).toFixed(2)}M</p>
                    <p className="text-xs text-zinc-600 mt-1">50% chance to beat this</p>
                  </div>
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-sm text-zinc-500">Best Case (90%)</p>
                    <p className="text-2xl font-bold text-emerald-400">${(simulationResults[simulationResults.length - 1]?.p90 / 1000000).toFixed(2)}M</p>
                    <p className="text-xs text-zinc-600 mt-1">10% chance to beat this</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-16">
                <Play className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">Click "Run" to generate Monte Carlo projections</p>
                <p className="text-xs text-zinc-600 mt-2">Set your retirement target above to see your success probability</p>
              </div>
            )}
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


    </div>
  );
}