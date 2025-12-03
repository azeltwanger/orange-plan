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

// Monte Carlo simulation with full projection logic through retirement
const runMonteCarloSimulation = (params, numSimulations = 1000) => {
  const {
    btcValue, stocksValue, realEstateValue, bondsValue, otherValue,
    currentAge, retirementAge, lifeExpectancy,
    getBtcGrowthRate, stocksCagr, realEstateCagr, bondsCagr, inflationRate,
    annualSavings, incomeGrowth, retirementAnnualSpending,
    withdrawalStrategy, dynamicWithdrawalRate,
    btcVolatility = 60, stocksVolatility = 15
  } = params;
  
  const results = [];
  const successResults = []; // Track if simulation succeeded (didn't run out of money)
  const years = lifeExpectancy - currentAge; // Project through entire life
  const yearsToRetirement = retirementAge - currentAge;
  
  for (let sim = 0; sim < numSimulations; sim++) {
    let runningBtc = btcValue;
    let runningStocks = stocksValue;
    let runningRealEstate = realEstateValue;
    let runningBonds = bondsValue;
    let runningOther = otherValue;
    let runningSavings = 0;
    let ranOutOfMoney = false;
    let initialRetirementWithdrawal = 0;
    
    const path = [runningBtc + runningStocks + runningRealEstate + runningBonds + runningOther];
    
    for (let year = 1; year <= years; year++) {
      const isRetired = year > yearsToRetirement;
      const yearsIntoRetirement = isRetired ? year - yearsToRetirement : 0;
      
      // Get expected BTC return based on model
      const expectedBtcReturn = getBtcGrowthRate(year);
      
      // Generate random returns with volatility (Box-Muller)
      const u1 = Math.random();
      const u2 = Math.random();
      const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const z2 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
      
      // BTC return with high volatility
      const btcReturn = expectedBtcReturn + btcVolatility * z1;
      // Stocks return with moderate volatility
      const stocksReturn = stocksCagr + stocksVolatility * z2;
      // Real estate and bonds with low volatility
      const realEstateReturn = realEstateCagr + 5 * Math.random() - 2.5;
      const bondsReturn = bondsCagr + 3 * Math.random() - 1.5;
      
      // Grow assets
      runningBtc = Math.max(0, runningBtc * (1 + btcReturn / 100));
      runningStocks = Math.max(0, runningStocks * (1 + stocksReturn / 100));
      runningRealEstate = Math.max(0, runningRealEstate * (1 + realEstateReturn / 100));
      runningBonds = Math.max(0, runningBonds * (1 + bondsReturn / 100));
      runningOther = Math.max(0, runningOther * (1 + stocksReturn / 100));
      
      // Grow savings at blended rate
      const blendedGrowthRate = (btcReturn * 0.3 + stocksReturn * 0.7) / 100;
      runningSavings = Math.max(0, runningSavings * (1 + blendedGrowthRate));
      
      let total = runningBtc + runningStocks + runningRealEstate + runningBonds + runningOther + runningSavings;
      
      if (!isRetired) {
        // Add annual savings (pre-retirement only)
        const yearSavings = annualSavings * Math.pow(1 + incomeGrowth / 100, year);
        runningSavings += yearSavings;
        total += yearSavings;
      } else {
        // Retirement: withdraw money
        let yearWithdrawal = 0;
        
        if (withdrawalStrategy === '4percent') {
          // 4% rule: fixed amount based on initial retirement portfolio, inflation-adjusted
          if (yearsIntoRetirement === 1) {
            initialRetirementWithdrawal = total * 0.04;
          }
          yearWithdrawal = initialRetirementWithdrawal * Math.pow(1 + inflationRate / 100, yearsIntoRetirement - 1);
        } else if (withdrawalStrategy === 'dynamic') {
          // Dynamic: % of current portfolio
          yearWithdrawal = total * (dynamicWithdrawalRate / 100);
        } else {
          // Income-based (variable): withdraw exactly what you need, inflation-adjusted
          yearWithdrawal = retirementAnnualSpending * Math.pow(1 + inflationRate / 100, yearsToRetirement + yearsIntoRetirement);
        }
        
        // Withdraw proportionally from all assets
        if (total > 0 && yearWithdrawal > 0) {
          const withdrawRatio = Math.min(1, yearWithdrawal / total);
          runningBtc -= runningBtc * withdrawRatio;
          runningStocks -= runningStocks * withdrawRatio;
          runningRealEstate -= runningRealEstate * withdrawRatio;
          runningBonds -= runningBonds * withdrawRatio;
          runningOther -= runningOther * withdrawRatio;
          runningSavings -= runningSavings * withdrawRatio;
          total = total - yearWithdrawal;
        }
        
        if (total <= 0) {
          ranOutOfMoney = true;
        }
      }
      
      path.push(Math.max(0, total));
    }
    
    results.push(path);
    successResults.push(!ranOutOfMoney);
  }
  
  return { paths: results, successResults };
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
  
  // Retirement settings
  const [retirementAge, setRetirementAge] = useState(65);
  const [currentAge, setCurrentAge] = useState(35);
  const [lifeExpectancy, setLifeExpectancy] = useState(90);
  const [currentAnnualSpending, setCurrentAnnualSpending] = useState(80000);
  const [retirementAnnualSpending, setRetirementAnnualSpending] = useState(100000);
  
  // Withdrawal strategy - separate from return model
  const [withdrawalStrategy, setWithdrawalStrategy] = useState('dynamic'); // '4percent', 'dynamic', 'variable'
  const [dynamicWithdrawalRate, setDynamicWithdrawalRate] = useState(5); // For dynamic: withdraw % of portfolio each year
  
  // BTC return model (separate from withdrawal)
  const [btcReturnModel, setBtcReturnModel] = useState('custom'); // 'custom', 'saylor24', 'powerlaw', 'conservative'
  
  // Monte Carlo
  const [runSimulation, setRunSimulation] = useState(false);
  const [simulationResults, setSimulationResults] = useState(null);
  const [successProbability, setSuccessProbability] = useState(null);
  
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
    monthly_expense_impact: '', liability_amount: '', down_payment: '', interest_rate: '', loan_term_years: '',
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

  const { data: budgetItems = [] } = useQuery({
    queryKey: ['budgetItems'],
    queryFn: () => base44.entities.BudgetItem.list(),
  });

  // Calculate annual savings from Income & Expenses (single source of truth)
  const freqMultiplier = { monthly: 12, weekly: 52, biweekly: 26, quarterly: 4, annual: 1, one_time: 0 };
  const monthlyIncome = budgetItems
    .filter(b => b.type === 'income' && b.is_active !== false)
    .reduce((sum, b) => sum + (b.amount * (freqMultiplier[b.frequency] || 12) / 12), 0);
  const monthlyExpenses = budgetItems
    .filter(b => b.type === 'expense' && b.is_active !== false)
    .reduce((sum, b) => sum + (b.amount * (freqMultiplier[b.frequency] || 12) / 12), 0);
  const annualSavings = Math.max(0, (monthlyIncome - monthlyExpenses) * 12);



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



  // Calculate portfolio values by tax treatment
  const getHoldingValue = (h) => h.ticker === 'BTC' ? h.quantity * currentPrice : h.quantity * (h.current_price || 0);
  
  // Taxable accounts (accessible anytime) - exclude real estate for liquidity
  const taxableHoldings = holdings.filter(h => !h.account_type || h.account_type === 'taxable');
  const taxableValue = taxableHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);
  const taxableLiquidHoldings = taxableHoldings.filter(h => h.asset_type !== 'real_estate');
  const taxableLiquidValue = taxableLiquidHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);
  
  // Tax-deferred accounts (401k, Traditional IRA) - 10% penalty before 59½
  const taxDeferredHoldings = holdings.filter(h => ['traditional_401k', 'traditional_ira'].includes(h.account_type));
  const taxDeferredValue = taxDeferredHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);
  
  // Tax-free accounts (Roth, HSA) - contributions accessible, gains after 59½
  const taxFreeHoldings = holdings.filter(h => ['roth_401k', 'roth_ira', 'hsa', '529'].includes(h.account_type));
  const taxFreeValue = taxFreeHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);
  
  // By asset type for projections
  const btcValue = holdings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity * currentPrice, 0);
  const stocksValue = holdings.filter(h => h.asset_type === 'stocks').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const realEstateValue = holdings.filter(h => h.asset_type === 'real_estate').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const bondsValue = holdings.filter(h => h.asset_type === 'bonds').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const otherValue = holdings.filter(h => !['BTC'].includes(h.ticker) && !['stocks', 'real_estate', 'bonds'].includes(h.asset_type)).reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const totalValue = btcValue + stocksValue + realEstateValue + bondsValue + otherValue;
  
  // Penalty-free age for retirement accounts
  const PENALTY_FREE_AGE = 59.5;

  // Use slider values directly (scenarios removed)
  const effectiveBtcCagr = btcCagr;
  const effectiveStocksCagr = stocksCagr;
  const effectiveInflation = inflationRate;

  // BTC growth models - now based on btcReturnModel, not withdrawalStrategy
  const getBtcGrowthRate = (yearFromNow) => {
    switch (btcReturnModel) {
      case 'saylor24':
        // Saylor's Bitcoin24 model: ~29% CAGR declining over time
        // Starts at ~45% and declines to ~15% over 20 years
        const baseRate = 45;
        const declinePerYear = 1.5;
        return Math.max(15, baseRate - (yearFromNow * declinePerYear));
      case 'powerlaw':
        // Power Law model: follows log regression, higher early returns declining
        // Approximation: starts ~60% declining to ~20% 
        const plBase = 60;
        const plDecline = 2;
        return Math.max(20, plBase - (yearFromNow * plDecline));
      case 'conservative':
        // Conservative model: 10% flat
        return 10;
      default:
        return effectiveBtcCagr;
    }
  };
  
  // Number formatting helper
  const formatNumber = (num, decimals = 0) => {
    if (num >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(decimals)}k`;
    return `$${num.toLocaleString()}`;
  };
  
  const formatNumberFull = (num) => {
    return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };

  // Generate projection data with dynamic withdrawal based on portfolio growth and account types
  const projections = useMemo(() => {
    const years = lifeExpectancy - currentAge;
    const data = [];
    const currentYear = new Date().getFullYear();

    let cumulativeSavings = 0;
    let runningBtc = btcValue;
    let runningStocks = stocksValue;
    let runningRealEstate = realEstateValue;
    let runningBonds = bondsValue;
    let runningOther = otherValue;
    let runningSavings = 0;
    
    // Track by account type
    let runningTaxable = taxableValue;
    let runningTaxDeferred = taxDeferredValue;
    let runningTaxFree = taxFreeValue;

    for (let i = 0; i <= years; i++) {
      const year = currentYear + i;
      
      // Calculate life event impacts for this year
      let eventImpact = 0;
      lifeEvents.forEach(event => {
        if (event.year === year || (event.is_recurring && event.year <= year && year < event.year + (event.recurring_years || 1))) {
          if (event.affects === 'assets') eventImpact += event.amount;
          if (event.event_type === 'home_purchase' && event.year === year) {
            eventImpact -= (event.down_payment || 0);
          }
        }
      });

      const isRetired = currentAge + i >= retirementAge;
      const yearsIntoRetirement = isRetired ? currentAge + i - retirementAge : 0;

      // Get BTC growth rate based on return model (not withdrawal strategy)
      const yearBtcGrowth = getBtcGrowthRate(i);
      
      // Pre-retirement: save and grow. Post-retirement: grow then withdraw
      let yearSavings = 0;
      let yearWithdrawal = 0;
      let penaltyPaid = 0;
      
      if (i > 0) {
        // Grow assets
        runningBtc = runningBtc * (1 + yearBtcGrowth / 100);
        runningStocks = runningStocks * (1 + effectiveStocksCagr / 100);
        runningRealEstate = runningRealEstate * (1 + realEstateCagr / 100);
        runningBonds = runningBonds * (1 + bondsCagr / 100);
        runningOther = runningOther * (1 + effectiveStocksCagr / 100);
        
        const blendedGrowthRate = (yearBtcGrowth * 0.3 + effectiveStocksCagr * 0.7) / 100;
        runningSavings = runningSavings * (1 + blendedGrowthRate);
        
        // Grow account type buckets at blended rate
        runningTaxable = runningTaxable * (1 + blendedGrowthRate);
        runningTaxDeferred = runningTaxDeferred * (1 + blendedGrowthRate);
        runningTaxFree = runningTaxFree * (1 + blendedGrowthRate);
      }

      if (!isRetired) {
        yearSavings = annualSavings * Math.pow(1 + incomeGrowth / 100, i);
        runningSavings += yearSavings;
        cumulativeSavings += yearSavings;
      } else {
        // Calculate withdrawal based on strategy
        const totalBeforeWithdrawal = runningBtc + runningStocks + runningRealEstate + runningBonds + runningOther + runningSavings;
        
        if (withdrawalStrategy === '4percent') {
          // Traditional 4% rule: fixed amount based on initial retirement portfolio
          if (yearsIntoRetirement === 0) {
            yearWithdrawal = totalBeforeWithdrawal * 0.04;
          } else {
            // Inflation-adjusted from initial withdrawal
            const initialWithdrawal = data[retirementAge - currentAge]?.yearWithdrawal || totalBeforeWithdrawal * 0.04;
            yearWithdrawal = initialWithdrawal * Math.pow(1 + effectiveInflation / 100, yearsIntoRetirement);
          }
        } else {
          // Dynamic withdrawal: withdraw % of current portfolio (allows more when portfolio grows)
          const withdrawRate = dynamicWithdrawalRate / 100;
          yearWithdrawal = totalBeforeWithdrawal * withdrawRate;
          
          // Floor: at least inflation-adjusted base spending
          const minWithdrawal = retirementAnnualSpending * Math.pow(1 + effectiveInflation / 100, retirementAge - currentAge + yearsIntoRetirement);
          yearWithdrawal = Math.max(yearWithdrawal, Math.min(minWithdrawal, totalBeforeWithdrawal * 0.1));
        }
        
        // Smart withdrawal order based on age and account types
        const currentAgeInYear = currentAge + i;
        const canAccessRetirementPenaltyFree = currentAgeInYear >= PENALTY_FREE_AGE;
        
        let remainingWithdrawal = yearWithdrawal;
        let withdrawFromTaxable = 0;
        let withdrawFromTaxDeferred = 0;
        let withdrawFromTaxFree = 0;
        let penaltyPaid = 0;
        
        if (canAccessRetirementPenaltyFree) {
          // After 59½: Withdraw from tax-deferred first (pay income tax), then taxable, then tax-free last
          withdrawFromTaxDeferred = Math.min(remainingWithdrawal, runningTaxDeferred);
          remainingWithdrawal -= withdrawFromTaxDeferred;
          
          withdrawFromTaxable = Math.min(remainingWithdrawal, runningTaxable);
          remainingWithdrawal -= withdrawFromTaxable;
          
          withdrawFromTaxFree = Math.min(remainingWithdrawal, runningTaxFree);
          remainingWithdrawal -= withdrawFromTaxFree;
        } else {
          // Before 59½: Withdraw from taxable first, then Roth contributions (penalty-free), avoid tax-deferred
          withdrawFromTaxable = Math.min(remainingWithdrawal, runningTaxable);
          remainingWithdrawal -= withdrawFromTaxable;
          
          // If still need more, tap tax-free (Roth contributions accessible)
          const taxFreeAvailable = runningTaxFree * 0.5; // Assume 50% is contributions
          withdrawFromTaxFree = Math.min(remainingWithdrawal, taxFreeAvailable);
          remainingWithdrawal -= withdrawFromTaxFree;
          
          // Last resort: tax-deferred with 10% penalty
          if (remainingWithdrawal > 0) {
            withdrawFromTaxDeferred = Math.min(remainingWithdrawal, runningTaxDeferred);
            penaltyPaid = withdrawFromTaxDeferred * 0.10;
            remainingWithdrawal -= withdrawFromTaxDeferred;
          }
        }
        
        // Update running balances
        runningTaxable -= withdrawFromTaxable;
        runningTaxDeferred -= withdrawFromTaxDeferred;
        runningTaxFree -= withdrawFromTaxFree;
        
        // Withdraw proportionally from asset types
        const totalForWithdrawal = runningBtc + runningStocks + runningRealEstate + runningBonds + runningOther + runningSavings;
        const actualWithdrawal = withdrawFromTaxable + withdrawFromTaxDeferred + withdrawFromTaxFree;
        if (totalForWithdrawal > 0 && actualWithdrawal > 0) {
          const withdrawRatio = Math.min(1, actualWithdrawal / totalForWithdrawal);
          runningBtc -= runningBtc * withdrawRatio;
          runningStocks -= runningStocks * withdrawRatio;
          runningRealEstate -= runningRealEstate * withdrawRatio;
          runningBonds -= runningBonds * withdrawRatio;
          runningOther -= runningOther * withdrawRatio;
          runningSavings -= runningSavings * withdrawRatio;
        }
      }

      const total = Math.max(0, runningBtc + runningStocks + runningRealEstate + runningBonds + runningOther + runningSavings + eventImpact);
      const realTotal = total / Math.pow(1 + effectiveInflation / 100, i);

      data.push({
        age: currentAge + i,
        year,
        btc: Math.round(runningBtc),
        stocks: Math.round(runningStocks),
        realEstate: Math.round(runningRealEstate),
        bonds: Math.round(runningBonds),
        savings: Math.round(runningSavings),
        total: Math.round(total),
        realTotal: Math.round(realTotal),
        hasEvent: lifeEvents.some(e => e.year === year),
        isRetired: isRetired,
        yearWithdrawal: Math.round(yearWithdrawal),
        btcGrowthRate: yearBtcGrowth,
        // Account type balances
        taxable: Math.round(runningTaxable),
        taxDeferred: Math.round(runningTaxDeferred),
        taxFree: Math.round(runningTaxFree),
        canAccessPenaltyFree: currentAge + i >= PENALTY_FREE_AGE,
        penaltyPaid: Math.round(penaltyPaid),
      });
    }
    return data;
  }, [btcValue, stocksValue, realEstateValue, bondsValue, otherValue, taxableValue, taxDeferredValue, taxFreeValue, currentAge, retirementAge, lifeExpectancy, effectiveBtcCagr, effectiveStocksCagr, realEstateCagr, bondsCagr, effectiveInflation, lifeEvents, annualSavings, incomeGrowth, retirementAnnualSpending, withdrawalStrategy, dynamicWithdrawalRate, btcReturnModel]);

  // Run Monte Carlo when button clicked
  const handleRunSimulation = () => {
    const simulations = runMonteCarloSimulation({
      btcValue,
      stocksValue,
      realEstateValue,
      bondsValue,
      otherValue,
      currentAge,
      retirementAge,
      lifeExpectancy,
      getBtcGrowthRate,
      stocksCagr: effectiveStocksCagr,
      realEstateCagr,
      bondsCagr,
      inflationRate: effectiveInflation,
      annualSavings,
      incomeGrowth,
      retirementAnnualSpending,
      withdrawalStrategy,
      dynamicWithdrawalRate,
      btcVolatility: 60,
      stocksVolatility,
    }, 1000);
    
    const percentiles = calculatePercentiles(simulations);
    
    // Calculate success probability against inflation-adjusted retirement income need
    const probability = calculateSuccessProbability(simulations, requiredNestEgg);
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

  const retirementYearIndex = retirementAge - currentAge;
  const retirementValue = projections[retirementYearIndex]?.total || 0;
  const realRetirementValue = projections[retirementYearIndex]?.realTotal || 0;
  const endOfLifeValue = projections[projections.length - 1]?.total || 0;
  const runOutOfMoneyAge = projections.findIndex(p => p.total <= 0 && p.isRetired);
  const willRunOutOfMoney = runOutOfMoneyAge !== -1;
  
  // Calculate first year withdrawal and average withdrawal in retirement
  const firstRetirementWithdrawal = projections[retirementYearIndex]?.yearWithdrawal || 0;
  const retirementYears = projections.filter(p => p.isRetired);
  const avgRetirementWithdrawal = retirementYears.length > 0 
    ? retirementYears.reduce((sum, p) => sum + p.yearWithdrawal, 0) / retirementYears.length 
    : 0;
  const totalLifetimeWithdrawals = retirementYears.reduce((sum, p) => sum + p.yearWithdrawal, 0);
  
  // Calculate inflation-adjusted retirement spending need at retirement
  const yearsToRetirement = retirementAge - currentAge;
  const inflationAdjustedRetirementSpending = retirementAnnualSpending * Math.pow(1 + inflationRate / 100, yearsToRetirement);
  
  // Required nest egg based on withdrawal strategy
  // For income-based (variable), we need enough that a safe withdrawal covers the spending
  const effectiveWithdrawalRate = withdrawalStrategy === '4percent' ? 0.04 : 
    withdrawalStrategy === 'dynamic' ? dynamicWithdrawalRate / 100 : 0.04; // Income-based uses 4% as baseline
  const requiredNestEgg = inflationAdjustedRetirementSpending / effectiveWithdrawalRate;
  
  // Check if retirement is feasible: portfolio at retirement meets required nest egg
  const canRetire = retirementValue >= requiredNestEgg * 0.8; // Within 80% of required

  const eventIcons = {
    income_change: Briefcase,
    expense_change: DollarSign,
    asset_purchase: Home,
    asset_sale: TrendingUp,
    retirement: Heart,
    inheritance: Heart,
    major_expense: Car,
    home_purchase: Home,
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
        monthly_expense_impact: editingEvent.monthly_expense_impact || '', liability_amount: editingEvent.liability_amount || '',
        down_payment: editingEvent.down_payment || '', interest_rate: editingEvent.interest_rate || '', loan_term_years: editingEvent.loan_term_years || '',
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



  const resetGoalForm = () => setGoalForm({ name: '', target_amount: '', current_amount: '', target_date: '', goal_type: 'other', priority: 'medium', notes: '' });
  const resetEventForm = () => setEventForm({ name: '', event_type: 'expense_change', year: new Date().getFullYear() + 1, amount: '', is_recurring: false, recurring_years: '', affects: 'expenses', notes: '', monthly_expense_impact: '', liability_amount: '', down_payment: '', interest_rate: '', loan_term_years: '' });


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
          {/* BTC Return Model Selection */}
          <div className="mb-6 p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
            <Label className="text-zinc-300 font-medium mb-3 block">Bitcoin Return Model</Label>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                { value: 'custom', label: 'Custom', desc: `${btcCagr}% CAGR` },
                { value: 'saylor24', label: 'Saylor Bitcoin24', desc: '45%→15% declining' },
                { value: 'powerlaw', label: 'Power Law', desc: '60%→20% declining' },
                { value: 'conservative', label: 'Conservative', desc: '10% flat' },
              ].map(model => (
                <button
                  key={model.value}
                  onClick={() => setBtcReturnModel(model.value)}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all",
                    btcReturnModel === model.value 
                      ? "bg-orange-500/20 border-orange-500/50 text-orange-400" 
                      : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                  )}
                >
                  <p className="font-medium text-sm">{model.label}</p>
                  <p className="text-xs opacity-70">{model.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className={cn("space-y-3", btcReturnModel !== 'custom' && "opacity-50")}>
              <div className="flex justify-between">
                <Label className="text-zinc-400">Bitcoin CAGR {btcReturnModel !== 'custom' && '(using model)'}</Label>
                <span className="text-orange-400 font-semibold">{btcReturnModel === 'custom' ? btcCagr : getBtcGrowthRate(0)}%</span>
              </div>
              <Slider 
                value={[btcCagr]} 
                onValueChange={([v]) => { setBtcCagr(v); setBtcReturnModel('custom'); }} 
                min={-20} max={100} step={1} 
                disabled={btcReturnModel !== 'custom'}
              />
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
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Label className="text-zinc-400">Annual Savings (from Income & Expenses)</Label>
                  <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">Auto-calculated</span>
                </div>
                <span className="text-emerald-400 font-semibold">{formatNumberFull(annualSavings)}</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500/50 rounded-full" 
                  style={{ width: `${Math.min(100, (annualSavings / 100000) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500">
                Monthly: {formatNumberFull(monthlyIncome)} income − {formatNumberFull(monthlyExpenses)} expenses = {formatNumberFull(monthlyIncome - monthlyExpenses)} surplus
              </p>
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
          {/* Account Type Summary */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50 mb-6">
            <h3 className="font-semibold mb-4">Portfolio by Tax Treatment</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-sm text-zinc-400">Taxable (Accessible Now)</p>
                <p className="text-2xl font-bold text-emerald-400">{formatNumber(taxableValue)}</p>
                <p className="text-xs text-zinc-500">Brokerage, self-custody crypto</p>
              </div>
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-sm text-zinc-400">Tax-Deferred (59½+)</p>
                <p className="text-2xl font-bold text-amber-400">{formatNumber(taxDeferredValue)}</p>
                <p className="text-xs text-zinc-500">401(k), Traditional IRA • 10% penalty if early</p>
              </div>
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <p className="text-sm text-zinc-400">Tax-Free (Roth/HSA)</p>
                <p className="text-2xl font-bold text-purple-400">{formatNumber(taxFreeValue)}</p>
                <p className="text-xs text-zinc-500">Roth IRA/401k, HSA • Contributions accessible</p>
              </div>
            </div>
            {retirementAge < 59.5 && (() => {
                const yearsUntilPenaltyFree = Math.ceil(59.5 - retirementAge);
                const annualNeedAtRetirement = retirementAnnualSpending * Math.pow(1 + inflationRate / 100, retirementAge - currentAge);

                // Calculate blended growth rate based on actual LIQUID taxable portfolio composition
                const taxableBtc = taxableLiquidHoldings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity * currentPrice, 0);
                const taxableStocks = taxableLiquidHoldings.filter(h => h.asset_type === 'stocks').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
                const taxableBonds = taxableLiquidHoldings.filter(h => h.asset_type === 'bonds').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
                const taxableOther = taxableLiquidValue - taxableBtc - taxableStocks - taxableBonds;

                // Weighted average growth rate based on taxable portfolio allocation
                // Use average BTC growth rate over the bridge period based on selected model
                const avgBtcGrowthForBridge = (() => {
                  if (btcReturnModel === 'custom') return effectiveBtcCagr;
                  // Calculate average growth rate over bridge period
                  let totalGrowth = 0;
                  const yearsToRetire = retirementAge - currentAge;
                  for (let y = yearsToRetire; y < yearsToRetire + yearsUntilPenaltyFree; y++) {
                    totalGrowth += getBtcGrowthRate(y);
                  }
                  return totalGrowth / yearsUntilPenaltyFree;
                })();

                let bridgeGrowthRate = 0.05; // default 5%
                if (taxableLiquidValue > 0) {
                  bridgeGrowthRate = (
                    (taxableBtc / taxableLiquidValue) * (avgBtcGrowthForBridge / 100) +
                    (taxableStocks / taxableLiquidValue) * (effectiveStocksCagr / 100) +
                    (taxableBonds / taxableLiquidValue) * (bondsCagr / 100) +
                    (taxableOther / taxableLiquidValue) * (effectiveStocksCagr / 100)
                  );
                }

                const realReturnRate = bridgeGrowthRate - (inflationRate / 100);

                // Present value of withdrawals
                let bridgeFundsNeeded;
                if (Math.abs(realReturnRate) < 0.001) {
                  bridgeFundsNeeded = annualNeedAtRetirement * yearsUntilPenaltyFree;
                } else {
                  bridgeFundsNeeded = annualNeedAtRetirement * (1 - Math.pow(1 + realReturnRate, -yearsUntilPenaltyFree)) / realReturnRate;
                }

                const currentBridgeFunds = taxableLiquidValue;
                const shortfall = Math.max(0, bridgeFundsNeeded - currentBridgeFunds);

                return (
                  <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-sm text-amber-400">
                      ⚠️ Retiring at {retirementAge} means {yearsUntilPenaltyFree} years before penalty-free access to retirement accounts.
                      You'll need <span className="font-bold">{formatNumber(bridgeFundsNeeded)}</span> in liquid taxable accounts to cover {formatNumber(annualNeedAtRetirement)}/yr for {yearsUntilPenaltyFree} years (assuming {((bridgeGrowthRate)*100).toFixed(1)}% blended growth, {inflationRate}% inflation).
                      {shortfall > 0 ? (
                        <span className="text-rose-400"> Current shortfall: <span className="font-bold">{formatNumber(shortfall)}</span></span>
                      ) : (
                        <span className="text-emerald-400"> ✓ You have {formatNumber(currentBridgeFunds)} liquid — sufficient!</span>
                      )}
                    </p>
                  </div>
                );
              })()}
          </div>

          {/* Retirement Settings */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-6">Retirement Planning</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400">Current Age</Label>
                  <Input type="number" value={currentAge} onChange={(e) => setCurrentAge(parseInt(e.target.value) || 0)} className="bg-zinc-900 border-zinc-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Retirement Age</Label>
                  <Input type="number" value={retirementAge} onChange={(e) => setRetirementAge(parseInt(e.target.value) || 65)} className="bg-zinc-900 border-zinc-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Life Expectancy</Label>
                  <Input type="number" value={lifeExpectancy} onChange={(e) => setLifeExpectancy(parseInt(e.target.value) || 90)} className="bg-zinc-900 border-zinc-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Current Spending</Label>
                  <Input type="number" value={currentAnnualSpending} onChange={(e) => setCurrentAnnualSpending(parseInt(e.target.value) || 0)} className="bg-zinc-900 border-zinc-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Retirement Income Need</Label>
                  <Input type="number" value={retirementAnnualSpending} onChange={(e) => setRetirementAnnualSpending(parseInt(e.target.value) || 0)} className="bg-zinc-900 border-zinc-800" />
                </div>
              </div>

            {/* Withdrawal Strategy */}
            <div className="mt-6 p-4 rounded-xl bg-zinc-800/30">
              <Label className="text-zinc-300 font-medium mb-3 block">Withdrawal Strategy</Label>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <button
                  onClick={() => setWithdrawalStrategy('4percent')}
                  className={cn(
                    "p-4 rounded-lg border text-left transition-all",
                    withdrawalStrategy === '4percent' 
                      ? "bg-emerald-500/20 border-emerald-500/50" 
                      : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                  )}
                >
                  <p className="font-medium text-sm">4% Rule (Traditional)</p>
                  <p className="text-xs text-zinc-500 mt-1">Withdraw 4% of initial portfolio, adjust for inflation</p>
                </button>
                <button
                  onClick={() => setWithdrawalStrategy('dynamic')}
                  className={cn(
                    "p-4 rounded-lg border text-left transition-all",
                    withdrawalStrategy === 'dynamic' 
                      ? "bg-emerald-500/20 border-emerald-500/50" 
                      : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                  )}
                >
                  <p className="font-medium text-sm">Dynamic % of Portfolio</p>
                  <p className="text-xs text-zinc-500 mt-1">Withdraw {dynamicWithdrawalRate}% of current value each year</p>
                </button>
                <button
                  onClick={() => setWithdrawalStrategy('variable')}
                  className={cn(
                    "p-4 rounded-lg border text-left transition-all",
                    withdrawalStrategy === 'variable' 
                      ? "bg-emerald-500/20 border-emerald-500/50" 
                      : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                  )}
                >
                  <p className="font-medium text-sm">Income-Based</p>
                  <p className="text-xs text-zinc-500 mt-1">Withdraw exactly what you need ({formatNumber(retirementAnnualSpending)}/yr)</p>
                </button>
              </div>
              
              {withdrawalStrategy === 'dynamic' && (
                <div className="mt-4 p-3 rounded-lg bg-zinc-900/50">
                  <div className="flex justify-between mb-2">
                    <Label className="text-zinc-400 text-sm">Annual Withdrawal Rate</Label>
                    <span className="text-orange-400 font-semibold">{dynamicWithdrawalRate}%</span>
                  </div>
                  <Slider 
                    value={[dynamicWithdrawalRate]} 
                    onValueChange={([v]) => setDynamicWithdrawalRate(v)} 
                    min={2} max={10} step={0.5} 
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 p-4 rounded-xl bg-zinc-800/30">
              <div>
                <p className="text-sm text-zinc-500">At Retirement (Age {retirementAge})</p>
                <p className="text-2xl font-bold text-orange-400">{formatNumber(retirementValue, 2)}</p>
                <p className="text-xs text-zinc-600">Need: {formatNumber(requiredNestEgg)}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">At Life Expectancy (Age {lifeExpectancy})</p>
                <p className="text-2xl font-bold text-zinc-300">{formatNumber(endOfLifeValue, 2)}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Year 1 Withdrawal</p>
                <p className="text-2xl font-bold text-emerald-400">{formatNumber(firstRetirementWithdrawal)}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Avg Annual Withdrawal</p>
                <p className="text-2xl font-bold text-cyan-400">{formatNumber(avgRetirementWithdrawal)}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Needed at Retirement</p>
                <p className="text-xl font-bold text-amber-400">{formatNumber(inflationAdjustedRetirementSpending)}/yr</p>
                <p className="text-xs text-zinc-600">({inflationRate}% inflation adjusted)</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Total Lifetime Withdrawals</p>
                <p className="text-xl font-bold text-purple-400">{formatNumber(totalLifetimeWithdrawals, 1)}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Retirement Status</p>
                <p className={cn("text-xl font-bold", canRetire && !willRunOutOfMoney ? "text-emerald-400" : "text-amber-400")}>
                  {willRunOutOfMoney ? `Runs out at ${currentAge + runOutOfMoneyAge}` : canRetire ? 'On Track ✓' : 'Optimistic*'}
                </p>
                {!canRetire && !willRunOutOfMoney && (
                  <p className="text-xs text-zinc-500">*Based on avg returns. Run Monte Carlo for realistic odds.</p>
                )}
              </div>
              <div>
                <p className="text-sm text-zinc-500">Retirement Duration</p>
                <p className="text-xl font-bold text-zinc-300">{lifeExpectancy - retirementAge} years</p>
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
                      formatter={(value, name, props) => {
                        if (name === 'Total') {
                          const p = props.payload;
                          return [`$${value.toLocaleString()}${p.isRetired ? ` (withdrawing $${(p.yearWithdrawal/1000).toFixed(0)}k/yr)` : ''}`, name];
                        }
                        return [`$${value.toLocaleString()}`, name];
                      }}
                      labelFormatter={(age) => `Age ${age}`}
                    />
                    <ReferenceLine x={retirementAge} stroke="#F7931A" strokeDasharray="5 5" label={{ value: 'Retirement', fill: '#F7931A', fontSize: 12 }} />
                    <ReferenceLine x={lifeExpectancy} stroke="#a78bfa" strokeDasharray="5 5" label={{ value: 'Life Exp.', fill: '#a78bfa', fontSize: 12 }} />
                    <Area type="monotone" dataKey="bonds" stackId="1" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.3} name="Bonds" />
                    <Area type="monotone" dataKey="realEstate" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Real Estate" />
                    <Area type="monotone" dataKey="stocks" stackId="1" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.3} name="Stocks" />
                    <Area type="monotone" dataKey="btc" stackId="1" stroke="#F7931A" fill="#F7931A" fillOpacity={0.5} name="Bitcoin" />
                    <Line type="monotone" dataKey="total" stroke="#ffffff" strokeWidth={2} dot={false} name="Total" />
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
          {/* Income-Based Target */}
          <div className="card-premium rounded-xl p-4 border border-zinc-800/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <Label className="text-zinc-400 text-sm">Success Based on Retirement Income Need</Label>
                <p className="text-xs text-zinc-600">
                  ${retirementAnnualSpending.toLocaleString()}/yr today → ${Math.round(inflationAdjustedRetirementSpending).toLocaleString()}/yr at retirement ({inflationRate}% inflation)
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Strategy: <span className="text-orange-400 font-semibold">
                    {withdrawalStrategy === '4percent' ? '4% Rule' : 
                     withdrawalStrategy === 'dynamic' ? `${dynamicWithdrawalRate}% Dynamic` : 'Income-Based'}
                  </span> • BTC Model: <span className="text-orange-400 font-semibold">
                    {btcReturnModel === 'custom' ? `${btcCagr}% Custom` : 
                     btcReturnModel === 'saylor24' ? 'Saylor Bitcoin24' : 
                     btcReturnModel === 'powerlaw' ? 'Power Law' : 'Conservative'}
                  </span> • Required: <span className="text-orange-400 font-semibold">{formatNumber(requiredNestEgg, 2)}</span>
                </p>
              </div>
              <Button onClick={handleRunSimulation} className="brand-gradient text-white font-semibold">
                <RefreshCw className="w-4 h-4 mr-2" />
                Run Simulation
              </Button>
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
                  <p className="text-sm text-zinc-400 mb-2">
                    Probability of Funding ${Math.round(inflationAdjustedRetirementSpending).toLocaleString()}/yr Retirement Income
                  </p>
                  <p className={cn(
                    "text-5xl font-bold",
                    successProbability >= 80 ? "text-emerald-400" :
                    successProbability >= 50 ? "text-amber-400" :
                    "text-rose-400"
                  )}>
                    {successProbability?.toFixed(0)}%
                  </p>
                  <p className="text-xs text-zinc-600 mt-1">
                  {withdrawalStrategy === '4percent' ? '4% Rule' : 
                   withdrawalStrategy === 'dynamic' ? `${dynamicWithdrawalRate}% Dynamic` : 'Income-Based'} withdrawal • {btcReturnModel === 'custom' ? `${btcCagr}%` : btcReturnModel} BTC returns
                </p>
                  <p className="text-sm text-zinc-500 mt-2">
                    {successProbability >= 80 ? "Excellent! You're on track for your desired retirement lifestyle." :
                     successProbability >= 50 ? "Good progress, but consider increasing savings or adjusting expectations." :
                     "You may need to save more or adjust your retirement income goal."}
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
                      <ReferenceLine y={requiredNestEgg} stroke="#F7931A" strokeDasharray="5 5" label={{ value: 'Target', fill: '#F7931A', fontSize: 12 }} />
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
                    <p className="text-2xl font-bold text-rose-400">{formatNumber(simulationResults[simulationResults.length - 1]?.p10 || 0, 2)}</p>
                    <p className="text-xs text-zinc-600 mt-1">90% chance to beat this</p>
                  </div>
                  <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                    <p className="text-sm text-zinc-500">Most Likely (Median)</p>
                    <p className="text-2xl font-bold text-orange-400">{formatNumber(simulationResults[simulationResults.length - 1]?.p50 || 0, 2)}</p>
                    <p className="text-xs text-zinc-600 mt-1">50% chance to beat this</p>
                  </div>
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-sm text-zinc-500">Best Case (90%)</p>
                    <p className="text-2xl font-bold text-emerald-400">{formatNumber(simulationResults[simulationResults.length - 1]?.p90 || 0, 2)}</p>
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
                    <SelectItem value="home_purchase">Home Purchase (w/ Mortgage)</SelectItem>
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

            {eventForm.event_type === 'home_purchase' ? (
              <>
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 mb-2">
                  <p className="text-xs text-blue-400">Home purchase affects assets (down payment), liabilities (mortgage), and expenses (monthly payment)</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Home Price</Label>
                    <Input type="number" value={eventForm.amount} onChange={(e) => setEventForm({ ...eventForm, amount: e.target.value })} placeholder="500000" className="bg-zinc-900 border-zinc-800" required />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Down Payment</Label>
                    <Input type="number" value={eventForm.down_payment} onChange={(e) => setEventForm({ ...eventForm, down_payment: e.target.value })} placeholder="100000" className="bg-zinc-900 border-zinc-800" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Mortgage Amount</Label>
                    <Input type="number" value={eventForm.liability_amount} onChange={(e) => setEventForm({ ...eventForm, liability_amount: e.target.value })} placeholder="400000" className="bg-zinc-900 border-zinc-800" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Interest Rate %</Label>
                    <Input type="number" step="0.1" value={eventForm.interest_rate} onChange={(e) => setEventForm({ ...eventForm, interest_rate: e.target.value })} placeholder="6.5" className="bg-zinc-900 border-zinc-800" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Term (Years)</Label>
                    <Input type="number" value={eventForm.loan_term_years} onChange={(e) => setEventForm({ ...eventForm, loan_term_years: e.target.value })} placeholder="30" className="bg-zinc-900 border-zinc-800" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Monthly Payment (inc. taxes/insurance)</Label>
                  <Input type="number" value={eventForm.monthly_expense_impact} onChange={(e) => setEventForm({ ...eventForm, monthly_expense_impact: e.target.value })} placeholder="3000" className="bg-zinc-900 border-zinc-800" />
                </div>
              </>
            ) : (
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
            )}
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