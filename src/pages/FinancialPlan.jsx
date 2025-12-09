import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart, Legend } from 'recharts';
import { Target, Plus, Pencil, Trash2, TrendingUp, Calendar, Settings, Play, AlertTriangle, ChevronDown, ChevronUp, Sparkles, Home, Car, Baby, Briefcase, Heart, DollarSign, RefreshCw, Receipt } from 'lucide-react';
import { 
  STANDARD_DEDUCTION_2024, 
  TAX_BRACKETS_2024, 
  getIncomeTaxRate, 
  getLTCGRate, 
  calculateProgressiveIncomeTax,
  estimateRetirementWithdrawalTaxes 
} from '@/components/tax/taxCalculations';
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

const getBtcVolatility = (yearFromNow) => {
  const initialVolatility = 55;
  const minimumVolatility = 20;
  const decayRate = 0.05;
  const volatility = minimumVolatility + (initialVolatility - minimumVolatility) * Math.exp(-decayRate * yearFromNow);
  return volatility;
};

const runMonteCarloSimulation = (params, numSimulations = 1000) => {
  const {
    btcValue, stocksValue, realEstateValue, bondsValue, otherValue,
    taxableValue, taxDeferredValue, taxFreeValue,
    currentAge, retirementAge, lifeExpectancy,
    getBtcGrowthRate, stocksCagr, realEstateCagr, bondsCagr, inflationRate,
    annualSavings, incomeGrowth, retirementAnnualSpending,
    withdrawalStrategy, dynamicWithdrawalRate,
    stocksVolatility = 15
  } = params;
  
  const results = [];
  const successResults = [];
  const withdrawalPaths = [];
  const years = Math.max(1, lifeExpectancy - currentAge);
  const yearsToRetirement = Math.max(0, retirementAge - currentAge);
  const totalStartingAssets = btcValue + stocksValue + realEstateValue + bondsValue + otherValue;
  const totalStartingAccounts = taxableValue + taxDeferredValue + taxFreeValue;
  
  const startingPortfolio = totalStartingAccounts > 0 ? totalStartingAccounts : totalStartingAssets;
  
  const btcPct = totalStartingAssets > 0 ? btcValue / totalStartingAssets : 0;
  const stocksPct = totalStartingAssets > 0 ? stocksValue / totalStartingAssets : 0;
  const realEstatePct = totalStartingAssets > 0 ? realEstateValue / totalStartingAssets : 0;
  const bondsPct = totalStartingAssets > 0 ? bondsValue / totalStartingAssets : 0;
  const otherPct = totalStartingAssets > 0 ? otherValue / totalStartingAssets : 0;
  
  for (let sim = 0; sim < numSimulations; sim++) {
    let runningTaxable = taxableValue;
    let runningTaxDeferred = taxDeferredValue;
    let runningTaxFree = taxFreeValue;
    let runningSavings = 0;
    let ranOutOfMoney = false;
    let initial4PercentWithdrawal = 0;
    
    const path = [startingPortfolio];
    const withdrawalPath = [0];
    
    for (let year = 1; year <= years; year++) {
      const isRetired = year > yearsToRetirement;
      const yearsIntoRetirement = isRetired ? year - yearsToRetirement : 0;
      
      const expectedBtcReturn = getBtcGrowthRate(year, inflationRate);
      const yearBtcVolatility = getBtcVolatility(year);

      const u1 = Math.max(0.0001, Math.random());
      const u2 = Math.random();
      const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const z2 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);

      const btcReturn = Math.max(-60, Math.min(200, expectedBtcReturn + yearBtcVolatility * z1));
      const stocksReturn = Math.max(-40, Math.min(50, stocksCagr + stocksVolatility * z2));
      const realEstateReturn = realEstateCagr + (Math.random() * 10 - 5);
      const bondsReturn = bondsCagr + (Math.random() * 4 - 2);
      
      const portfolioReturn = (
        btcPct * btcReturn +
        stocksPct * stocksReturn +
        realEstatePct * realEstateReturn +
        bondsPct * bondsReturn +
        otherPct * stocksReturn
      ) / 100;
      
      runningTaxable = Math.max(0, runningTaxable * (1 + portfolioReturn));
      runningTaxDeferred = Math.max(0, runningTaxDeferred * (1 + portfolioReturn));
      runningTaxFree = Math.max(0, runningTaxFree * (1 + portfolioReturn));
      runningSavings = Math.max(0, runningSavings * (1 + portfolioReturn));
      
      let yearWithdrawal = 0;
      
      if (!isRetired) {
        const yearNetCashFlow = annualSavings * Math.pow(1 + incomeGrowth / 100, year);
        runningSavings += yearNetCashFlow;
        runningTaxable += yearNetCashFlow;
      } else {
        const accountTotal = runningTaxable + runningTaxDeferred + runningTaxFree;
        
        if (withdrawalStrategy === '4percent') {
          if (yearsIntoRetirement === 1) {
            initial4PercentWithdrawal = accountTotal * 0.04;
          }
          yearWithdrawal = initial4PercentWithdrawal * Math.pow(1 + inflationRate / 100, yearsIntoRetirement - 1);
        } else if (withdrawalStrategy === 'dynamic') {
          yearWithdrawal = accountTotal * (dynamicWithdrawalRate / 100);
        } else {
          yearWithdrawal = retirementAnnualSpending * Math.pow(1 + inflationRate / 100, yearsToRetirement + yearsIntoRetirement);
        }
        
        let remaining = yearWithdrawal;
        
        const fromTaxable = Math.min(remaining, runningTaxable);
        runningTaxable -= fromTaxable;
        remaining -= fromTaxable;
        
        const fromTaxDeferred = Math.min(remaining, runningTaxDeferred);
        runningTaxDeferred -= fromTaxDeferred;
        remaining -= fromTaxDeferred;
        
        const fromTaxFree = Math.min(remaining, runningTaxFree);
        runningTaxFree -= fromTaxFree;
        remaining -= fromTaxFree;
        
        const totalBeforeWithdraw = runningTaxable + runningTaxDeferred + runningTaxFree + runningSavings + yearWithdrawal;
        if (totalBeforeWithdraw > 0 && runningSavings > 0) {
          const savingsRatio = runningSavings / totalBeforeWithdraw;
          runningSavings = Math.max(0, runningSavings - yearWithdrawal * savingsRatio);
        }
        
        if (runningTaxable + runningTaxDeferred + runningTaxFree <= 0) {
          ranOutOfMoney = true;
        }
      }
      
      const total = runningTaxable + runningTaxDeferred + runningTaxFree;
      path.push(Math.max(0, total));
      withdrawalPath.push(yearWithdrawal);
    }
    
    results.push(path);
    withdrawalPaths.push(withdrawalPath);
    successResults.push(!ranOutOfMoney);
  }
  
  return { paths: results, successResults, withdrawalPaths };
};

const calculateSuccessProbability = (successResults) => {
  const successCount = successResults.filter(s => s).length;
  return (successCount / successResults.length) * 100;
};

const calculatePercentiles = (simulations, percentiles = [10, 25, 50, 75, 90]) => {
  const years = simulations[0].length;
  const result = [];
  
  for (let year = 0; year < years; year++) {
    const yearValues = simulations.map(sim => sim[year]).sort((a, b) => a - b);
    const yearPercentiles = {};
    
    percentiles.forEach(p => {
      const index = Math.min(Math.floor((p / 100) * yearValues.length), yearValues.length - 1);
      yearPercentiles[`p${p}`] = yearValues[index];
    });
    
    result.push(yearPercentiles);
  }
  
  return result;
};

const calculateWithdrawals = (params) => {
  const { currentAge, retirementAge, lifeExpectancy, inflationRate, retirementAnnualSpending, withdrawalStrategy, dynamicWithdrawalRate } = params;
  const years = Math.max(1, lifeExpectancy - currentAge);
  const yearsToRetirement = Math.max(0, retirementAge - currentAge);
  const withdrawals = [];
  
  for (let i = 0; i <= years; i++) {
    const isRetired = i >= yearsToRetirement;
    if (!isRetired) {
      withdrawals.push(0);
    } else {
      const yearsIntoRetirement = i - yearsToRetirement;
      const yearsOfInflation = yearsToRetirement + yearsIntoRetirement;
      const withdrawal = retirementAnnualSpending * Math.pow(1 + inflationRate / 100, yearsOfInflation);
      withdrawals.push(Math.round(withdrawal));
    }
  }
  return withdrawals;
};

export default function FinancialPlan() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('projections');
  const [showMonteCarloSettings, setShowMonteCarloSettings] = useState(false);
  const [earliestRetirementAge, setEarliestRetirementAge] = useState(null);
  const [maxSustainableSpending, setMaxSustainableSpending] = useState(0);
  const queryClient = useQueryClient();

  const [btcCagr, setBtcCagr] = useState(25);
  const [stocksCagr, setStocksCagr] = useState(7);
  const [stocksVolatility, setStocksVolatility] = useState(15);
  const [realEstateCagr, setRealEstateCagr] = useState(4);
  const [bondsCagr, setBondsCagr] = useState(3);
  const [cashCagr, setCashCagr] = useState(0);
  const [otherCagr, setOtherCagr] = useState(7);
  const [inflationRate, setInflationRate] = useState(3);
  const [incomeGrowth, setIncomeGrowth] = useState(3);
  
  const [retirementAge, setRetirementAge] = useState(65);
  const [currentAge, setCurrentAge] = useState(35);
  const [lifeExpectancy, setLifeExpectancy] = useState(90);
  const [currentAnnualSpending, setCurrentAnnualSpending] = useState(80000);
  const [retirementAnnualSpending, setRetirementAnnualSpending] = useState(100000);
  
  const [withdrawalStrategy, setWithdrawalStrategy] = useState('dynamic');
  const [dynamicWithdrawalRate, setDynamicWithdrawalRate] = useState(5);
  const [btcReturnModel, setBtcReturnModel] = useState('custom');
  
  const [filingStatus, setFilingStatus] = useState('single');
  const [otherRetirementIncome, setOtherRetirementIncome] = useState(0);
  const [socialSecurityStartAge, setSocialSecurityStartAge] = useState(67);
  const [socialSecurityAmount, setSocialSecurityAmount] = useState(0);
  
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  const [runSimulation, setRunSimulation] = useState(false);
  const [simulationResults, setSimulationResults] = useState(null);
  const [successProbability, setSuccessProbability] = useState(null);
  
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
    allocation_method: 'proportionate', btc_allocation: 0, stocks_allocation: 0, real_estate_allocation: 0, bonds_allocation: 0, cash_allocation: 0, other_allocation: 0,
  });

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

  const { data: liabilities = [] } = useQuery({
    queryKey: ['liabilities'],
    queryFn: () => base44.entities.Liability.list(),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  const { data: userSettings = [] } = useQuery({
    queryKey: ['userSettings'],
    queryFn: () => base44.entities.UserSettings.list(),
  });

  useEffect(() => {
    if (userSettings.length > 0 && !settingsLoaded) {
      const settings = userSettings[0];
      if (settings.btc_cagr_assumption !== undefined) setBtcCagr(settings.btc_cagr_assumption);
      if (settings.stocks_cagr !== undefined) setStocksCagr(settings.stocks_cagr);
      if (settings.stocks_volatility !== undefined) setStocksVolatility(settings.stocks_volatility);
      if (settings.real_estate_cagr !== undefined) setRealEstateCagr(settings.real_estate_cagr);
      if (settings.bonds_cagr !== undefined) setBondsCagr(settings.bonds_cagr);
      if (settings.cash_cagr !== undefined) setCashCagr(settings.cash_cagr);
      if (settings.other_cagr !== undefined) setOtherCagr(settings.other_cagr);
      if (settings.inflation_rate !== undefined) setInflationRate(settings.inflation_rate);
      if (settings.income_growth_rate !== undefined) setIncomeGrowth(settings.income_growth_rate);
      if (settings.retirement_age !== undefined) setRetirementAge(settings.retirement_age);
      if (settings.current_age !== undefined) setCurrentAge(settings.current_age);
      if (settings.life_expectancy !== undefined) setLifeExpectancy(settings.life_expectancy);
      if (settings.current_annual_spending !== undefined) setCurrentAnnualSpending(settings.current_annual_spending);
      if (settings.annual_retirement_spending !== undefined) setRetirementAnnualSpending(settings.annual_retirement_spending);
      if (settings.withdrawal_strategy !== undefined) setWithdrawalStrategy(settings.withdrawal_strategy);
      if (settings.dynamic_withdrawal_rate !== undefined) setDynamicWithdrawalRate(settings.dynamic_withdrawal_rate);
      if (settings.btc_return_model !== undefined) setBtcReturnModel(settings.btc_return_model);
      if (settings.other_retirement_income !== undefined) setOtherRetirementIncome(settings.other_retirement_income);
      if (settings.social_security_start_age !== undefined) setSocialSecurityStartAge(settings.social_security_start_age);
      if (settings.social_security_amount !== undefined) setSocialSecurityAmount(settings.social_security_amount);
      setSettingsLoaded(true);
    }
  }, [userSettings, settingsLoaded]);

  const saveSettings = useMutation({
    mutationFn: async (data) => {
      if (userSettings.length > 0) {
        return base44.entities.UserSettings.update(userSettings[0].id, data);
      } else {
        return base44.entities.UserSettings.create(data);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['userSettings'] }),
  });

  useEffect(() => {
    if (!settingsLoaded) return;
    const timeoutId = setTimeout(() => {
      saveSettings.mutate({
        btc_cagr_assumption: btcCagr || 25,
        stocks_cagr: stocksCagr || 7,
        stocks_volatility: stocksVolatility || 15,
        real_estate_cagr: realEstateCagr || 4,
        bonds_cagr: bondsCagr || 3,
        cash_cagr: cashCagr || 0,
        other_cagr: otherCagr || 7,
        inflation_rate: inflationRate || 3,
        income_growth_rate: incomeGrowth || 3,
        retirement_age: retirementAge || 65,
        current_age: currentAge || 35,
        life_expectancy: lifeExpectancy || 90,
        current_annual_spending: currentAnnualSpending || 80000,
        annual_retirement_spending: retirementAnnualSpending || 100000,
        withdrawal_strategy: withdrawalStrategy || 'dynamic',
        dynamic_withdrawal_rate: dynamicWithdrawalRate || 5,
        btc_return_model: btcReturnModel || 'custom',
        other_retirement_income: otherRetirementIncome || 0,
        social_security_start_age: socialSecurityStartAge || 67,
        social_security_amount: socialSecurityAmount || 0,
      });
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [settingsLoaded, btcCagr, stocksCagr, stocksVolatility, realEstateCagr, bondsCagr, cashCagr, otherCagr, inflationRate, incomeGrowth, retirementAge, currentAge, lifeExpectancy, currentAnnualSpending, retirementAnnualSpending, withdrawalStrategy, dynamicWithdrawalRate, btcReturnModel, otherRetirementIncome, socialSecurityStartAge, socialSecurityAmount]);

  const freqMultiplier = { monthly: 12, weekly: 52, biweekly: 26, quarterly: 4, annual: 1, one_time: 0 };
  const monthlyIncome = budgetItems
    .filter(b => b.type === 'income' && b.is_active !== false)
    .reduce((sum, b) => sum + (b.amount * (freqMultiplier[b.frequency] || 12) / 12), 0);
  
  const monthlyDebtPayments = liabilities.reduce((sum, liability) => {
    if (liability.monthly_payment && liability.monthly_payment > 0) {
      return sum + liability.monthly_payment;
    }
    return sum;
  }, 0);

  const annualSavings = (monthlyIncome * 12) - currentAnnualSpending;

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

  const getHoldingValue = (h) => h.ticker === 'BTC' ? h.quantity * currentPrice : h.quantity * (h.current_price || 0);
  
  const getTaxTreatmentFromHolding = (h) => {
    if (h.tax_treatment) return h.tax_treatment;
    const accountType = h.account_type || 'taxable';
    if (['traditional_401k', 'traditional_ira'].includes(accountType)) return 'tax_deferred';
    if (['roth_401k', 'roth_ira', 'hsa', '529'].includes(accountType)) return 'tax_free';
    return 'taxable';
  };
  
  const taxableHoldings = holdings.filter(h => getTaxTreatmentFromHolding(h) === 'taxable');
  const taxableValue = taxableHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);
  const taxableLiquidHoldings = taxableHoldings.filter(h => h.asset_type !== 'real_estate');
  const taxableLiquidValue = taxableLiquidHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);
  
  const taxDeferredHoldings = holdings.filter(h => getTaxTreatmentFromHolding(h) === 'tax_deferred');
  const taxDeferredValue = taxDeferredHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);
  
  const taxFreeHoldings = holdings.filter(h => getTaxTreatmentFromHolding(h) === 'tax_free');
  const taxFreeValue = taxFreeHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);
  
  const btcValue = holdings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity * currentPrice, 0);
  const stocksValue = holdings.filter(h => h.asset_type === 'stocks').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const realEstateValue = holdings.filter(h => h.asset_type === 'real_estate').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const bondsValue = holdings.filter(h => h.asset_type === 'bonds').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const otherValue = holdings.filter(h => !['BTC'].includes(h.ticker) && !['stocks', 'real_estate', 'bonds'].includes(h.asset_type)).reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const totalValue = btcValue + stocksValue + realEstateValue + bondsValue + otherValue;
  
  const PENALTY_FREE_AGE = 59.5;
  const RMD_START_AGE = 73;
  
  const standardDeduction = STANDARD_DEDUCTION_2024[filingStatus] || STANDARD_DEDUCTION_2024.single;

  const effectiveBtcCagr = btcCagr;
  const effectiveStocksCagr = stocksCagr;
  const effectiveInflation = inflationRate;

  const getBtcGrowthRate = (yearFromNow, inflationRate) => {
    switch (btcReturnModel) {
      case 'saylor24':
        const currentYear = new Date().getFullYear();
        const absoluteYear = currentYear + yearFromNow;

        if (absoluteYear <= 2037) {
          const yearsFromStart = absoluteYear - 2025;
          return Math.max(20, 50 - (yearsFromStart * 2.5));
        } else if (absoluteYear <= 2045) {
          return 20;
        } else if (absoluteYear <= 2075) {
          const yearsIntoDecline = absoluteYear - 2045;
          const totalDeclineYears = 2075 - 2045;
          const targetRate = inflationRate + 3;
          const declineAmount = 20 - targetRate;
          return 20 - (declineAmount * (yearsIntoDecline / totalDeclineYears));
        } else {
          return inflationRate + 2;
        }
      case 'conservative':
        return 10;
      default:
        return effectiveBtcCagr;
    }
  };
  
  const formatNumber = (num, decimals = 0) => {
    if (num == null || isNaN(num)) return '$0';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(decimals)}k`;
    return `$${num.toLocaleString()}`;
  };
  
  const formatNumberFull = (num) => {
    if (num == null || isNaN(num)) return '$0';
    return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };

  const projections = useMemo(() => {
    const years = lifeExpectancy - currentAge;
    const data = [];
    const currentYear = new Date().getFullYear();

    // Calculate initial asset allocation percentages
    const totalInitialAssets = btcValue + stocksValue + realEstateValue + bondsValue + otherValue;
    const btcAllocationPct = totalInitialAssets > 0 ? btcValue / totalInitialAssets : 0;
    const stocksAllocationPct = totalInitialAssets > 0 ? stocksValue / totalInitialAssets : 0;
    const realEstateAllocationPct = totalInitialAssets > 0 ? realEstateValue / totalInitialAssets : 0;
    const bondsAllocationPct = totalInitialAssets > 0 ? bondsValue / totalInitialAssets : 0;
    const otherAllocationPct = totalInitialAssets > 0 ? otherValue / totalInitialAssets : 0;

    let cumulativeSavings = 0;
    
    // Track by account type - this is the source of truth
    let runningTaxable = taxableValue;
    let runningTaxDeferred = taxDeferredValue;
    let runningTaxFree = taxFreeValue;
    
    const initialTaxableCostBasis = taxableHoldings.reduce((sum, h) => sum + (h.cost_basis_total || 0), 0);
    let runningTaxableBasis = initialTaxableCostBasis;
    
    const runningDebt = {};
    const encumberedBtc = {};
    const releasedBtc = {};
    const debtPaidOffYears = {};

    liabilities.forEach(liability => {
      runningDebt[liability.id] = liability.current_balance || 0;
      debtPaidOffYears[liability.id] = null;
      if (liability.type === 'btc_collateralized' && liability.collateral_btc_amount) {
        encumberedBtc[liability.id] = liability.collateral_btc_amount;
        releasedBtc[liability.id] = 0;
      }
    });
    
    let initial4PercentWithdrawal = 0;

    for (let i = 0; i <= years; i++) {
      const year = currentYear + i;
      
      const yearBtcGrowth = getBtcGrowthRate(i, effectiveInflation);
      
      let eventImpact = 0;
      let yearGoalWithdrawal = 0;
      const yearGoalNames = [];
      
      lifeEvents.forEach(event => {
        const yearsFromEventStart = year - event.year;
        if (event.year === year || (event.is_recurring && event.year <= year && year < event.year + (event.recurring_years || 1))) {
          const growthMultiplier = (event.affects === 'income' || event.event_type === 'income_change') 
            ? Math.pow(1 + incomeGrowth / 100, Math.max(0, yearsFromEventStart))
            : 1;

          if (event.affects === 'assets') {
            eventImpact += event.amount;
          } else if (event.affects === 'income') {
            eventImpact += event.amount * growthMultiplier;
          }

          if (event.event_type === 'home_purchase' && event.year === year) {
            eventImpact -= (event.down_payment || 0);
          }
        }
      });
      
      goals.forEach(goal => {
        if (goal.will_be_spent && goal.target_date) {
          const goalYear = new Date(goal.target_date).getFullYear();
          if (goalYear === year) {
            const goalAmount = goal.target_amount || 0;
            eventImpact -= goalAmount;
            yearGoalWithdrawal += goalAmount;
            yearGoalNames.push(goal.name);
          }
        }
      });

      const debtPayoffGoalMonthlyPayments = {};
      goals.forEach(goal => {
        if (goal.goal_type === 'debt_payoff' && goal.linked_liability_id && goal.payoff_years > 0) {
          const startYear = goal.target_date ? new Date(goal.target_date).getFullYear() : currentYear;
          const endYear = startYear + goal.payoff_years;

          if (year >= startYear && year < endYear) {
            const annualPayment = (goal.target_amount || 0) / goal.payoff_years;
            const monthlyExtraPayment = annualPayment / 12;
            debtPayoffGoalMonthlyPayments[goal.linked_liability_id] = monthlyExtraPayment;
            eventImpact -= annualPayment;
          }
        }
      });

      let actualAnnualDebtPayments = 0;

      liabilities.forEach(liability => {
        if (runningDebt[liability.id] > 0) {
          const hasPayment = liability.monthly_payment && liability.monthly_payment > 0;
          const hasInterest = liability.interest_rate && liability.interest_rate > 0;
          const hasExtraPayment = debtPayoffGoalMonthlyPayments[liability.id] > 0;

          if (hasPayment || hasExtraPayment) {
            let remainingBalance = runningDebt[liability.id];
            const baseMonthlyPayment = liability.monthly_payment || 0;
            const extraMonthlyPayment = debtPayoffGoalMonthlyPayments[liability.id] || 0;
            const totalMonthlyPayment = baseMonthlyPayment + extraMonthlyPayment;
            const currentMonth = new Date().getMonth();
            const startMonth = i === 0 ? currentMonth : 0;

            for (let month = startMonth; month < 12; month++) {
              if (remainingBalance <= 0) break;

              const monthlyInterest = hasInterest 
                ? remainingBalance * (liability.interest_rate / 100 / 12)
                : 0;

              remainingBalance += monthlyInterest;
              const actualPayment = Math.min(totalMonthlyPayment, remainingBalance);
              remainingBalance = Math.max(0, remainingBalance - actualPayment);
              actualAnnualDebtPayments += actualPayment;
            }

            runningDebt[liability.id] = remainingBalance;

            if (remainingBalance <= 0 && debtPaidOffYears[liability.id] === null) {
              debtPaidOffYears[liability.id] = year;
            }
          } else if (hasInterest) {
            const annualInterest = runningDebt[liability.id] * (liability.interest_rate / 100);
            runningDebt[liability.id] += annualInterest;
          }
        }

        if (liability.type === 'btc_collateralized' && encumberedBtc[liability.id] > 0) {
          const yearBtcPrice = btcPrice * Math.pow(1 + yearBtcGrowth / 100, i);
          const collateralValue = encumberedBtc[liability.id] * yearBtcPrice;
          const currentLTV = runningDebt[liability.id] / collateralValue;
          const releaseLTV = (liability.collateral_release_ltv || 30) / 100;

          if (currentLTV <= releaseLTV && releasedBtc[liability.id] === 0) {
            releasedBtc[liability.id] = encumberedBtc[liability.id];
            encumberedBtc[liability.id] = 0;
          }
        }
      });

      const isRetired = currentAge + i >= retirementAge;
      const yearsIntoRetirement = isRetired ? currentAge + i - retirementAge : 0;
      
      let yearSavings = 0;
      let yearWithdrawal = 0;
      let taxesPaid = 0;
      let penaltyPaid = 0;
      let withdrawFromTaxable = 0;
      let withdrawFromTaxDeferred = 0;
      let withdrawFromTaxFree = 0;
      let retirementSpendingOnly = 0;
      let totalWithdrawalForTaxCalculation = 0;
      
      // Step 1: Add cash flow (pre-retirement) or calculate withdrawal need (post-retirement)
      if (!isRetired) {
        yearSavings = annualSavings * Math.pow(1 + incomeGrowth / 100, i);
        cumulativeSavings += yearSavings;
        const netCashFlowAfterDebt = yearSavings - actualAnnualDebtPayments;
        runningTaxable += netCashFlowAfterDebt;
      }
      
      // Step 2: Apply growth to all account buckets
      if (i > 0) {
        const yearBtcGrowthForBlend = getBtcGrowthRate(i, effectiveInflation);
        const blendedGrowthRate = (
          btcAllocationPct * (yearBtcGrowthForBlend / 100) +
          stocksAllocationPct * (effectiveStocksCagr / 100) +
          realEstateAllocationPct * (realEstateCagr / 100) +
          bondsAllocationPct * (bondsCagr / 100) +
          otherAllocationPct * (otherCagr / 100)
        );
        
        runningTaxable = runningTaxable * (1 + blendedGrowthRate);
        runningTaxDeferred = runningTaxDeferred * (1 + blendedGrowthRate);
        runningTaxFree = runningTaxFree * (1 + blendedGrowthRate);
      }
      
      // Step 3: Calculate and apply retirement withdrawals
      if (isRetired) {
        const accountTotalBeforeWithdrawal = runningTaxable + runningTaxDeferred + runningTaxFree;
        
        if (withdrawalStrategy === '4percent') {
          if (yearsIntoRetirement === 0) {
            initial4PercentWithdrawal = accountTotalBeforeWithdrawal * 0.04;
            yearWithdrawal = initial4PercentWithdrawal;
          } else {
            yearWithdrawal = initial4PercentWithdrawal * Math.pow(1 + effectiveInflation / 100, yearsIntoRetirement);
          }
        } else if (withdrawalStrategy === 'dynamic') {
          const withdrawRate = dynamicWithdrawalRate / 100;
          yearWithdrawal = accountTotalBeforeWithdrawal * withdrawRate;
        } else {
          const nominalSpendingAtRetirement = retirementAnnualSpending * Math.pow(1 + effectiveInflation / 100, Math.max(0, retirementAge - currentAge));
          yearWithdrawal = nominalSpendingAtRetirement * Math.pow(1 + effectiveInflation / 100, yearsIntoRetirement);
        }
        
        const currentAgeInYear = currentAge + i;
        const canAccessRetirementPenaltyFree = currentAgeInYear >= PENALTY_FREE_AGE;
        
        let rmdAmount = 0;
        if (currentAgeInYear >= RMD_START_AGE && runningTaxDeferred > 0) {
          const rmdFactor = (() => {
            if (currentAgeInYear === 73) return 26.5;
            if (currentAgeInYear === 74) return 25.5;
            if (currentAgeInYear === 75) return 24.6;
            if (currentAgeInYear === 76) return 23.7;
            if (currentAgeInYear === 77) return 22.9;
            if (currentAgeInYear === 78) return 22.0;
            if (currentAgeInYear === 79) return 21.1;
            if (currentAgeInYear === 80) return 20.2;
            if (currentAgeInYear >= 81 && currentAgeInYear <= 85) return 19.0 - ((currentAgeInYear - 81) * 0.5);
            return Math.max(10, 16.0 - ((currentAgeInYear - 86) * 0.4));
          })();
          rmdAmount = runningTaxDeferred / rmdFactor;
          yearWithdrawal = Math.max(yearWithdrawal, rmdAmount);
        }
        
        const effectiveRunningTaxableBasis = Math.min(runningTaxable, runningTaxableBasis);
        const estimatedCurrentGainRatio = runningTaxable > 0 ? Math.max(0, (runningTaxable - effectiveRunningTaxableBasis) / runningTaxable) : 0;
        
        const currentAgeInYearForSS = currentAge + i;
        let socialSecurityIncome = 0;
        if (currentAgeInYearForSS >= socialSecurityStartAge && socialSecurityAmount > 0) {
          const yearsOfSSInflation = currentAgeInYearForSS - socialSecurityStartAge;
          socialSecurityIncome = socialSecurityAmount * Math.pow(1 + effectiveInflation / 100, yearsOfSSInflation);
        }

        const totalOtherIncome = otherRetirementIncome + socialSecurityIncome;
        retirementSpendingOnly = yearWithdrawal;
        totalWithdrawalForTaxCalculation = retirementSpendingOnly + yearGoalWithdrawal;

        const taxEstimate = estimateRetirementWithdrawalTaxes({
          withdrawalNeeded: totalWithdrawalForTaxCalculation,
          taxableBalance: runningTaxable,
          taxDeferredBalance: runningTaxDeferred,
          taxFreeBalance: runningTaxFree,
          taxableGainPercent: estimatedCurrentGainRatio,
          isLongTermGain: true,
          filingStatus,
          age: currentAgeInYear,
          otherIncome: totalOtherIncome,
        });
        
        withdrawFromTaxable = taxEstimate.fromTaxable || 0;
        withdrawFromTaxDeferred = taxEstimate.fromTaxDeferred || 0;
        withdrawFromTaxFree = taxEstimate.fromTaxFree || 0;
        taxesPaid = taxEstimate.totalTax || 0;
        penaltyPaid = taxEstimate.totalPenalty || 0;
        
        if (withdrawFromTaxable > 0 && runningTaxable > 0) {
          const basisRatio = runningTaxableBasis / runningTaxable;
          runningTaxableBasis = Math.max(0, runningTaxableBasis - (withdrawFromTaxable * basisRatio));
        }
        
        runningTaxable = Math.max(0, runningTaxable - withdrawFromTaxable);
        runningTaxDeferred = Math.max(0, runningTaxDeferred - withdrawFromTaxDeferred);
        runningTaxFree = Math.max(0, runningTaxFree - withdrawFromTaxFree);
      }

      // Step 4: Apply event impacts
      runningTaxable += eventImpact;

      const totalDebt = Object.values(runningDebt).reduce((sum, balance) => sum + balance, 0);
      const totalEncumberedBtc = Object.values(encumberedBtc).reduce((sum, amount) => sum + amount, 0);
      const totalReleasedBtc = Object.values(releasedBtc).reduce((sum, amount) => sum + amount, 0);
      
      // Step 5: Calculate total and derive individual assets
      const total = Math.max(0, runningTaxable + runningTaxDeferred + runningTaxFree);
      const realTotal = total / Math.pow(1 + effectiveInflation / 100, i);

      const runningBtc = total * btcAllocationPct;
      const runningStocks = total * stocksAllocationPct;
      const runningRealEstate = total * realEstateAllocationPct;
      const runningBonds = total * bondsAllocationPct;
      const runningOther = total * otherAllocationPct;

      const accountTotal = runningTaxable + runningTaxDeferred + runningTaxFree;
      const portfolioFailed = total <= 0 && isRetired;
      const btcRunsOut = runningBtc <= 0 && isRetired;

      data.push({
        age: currentAge + i,
        year,
        btc: Math.round(runningBtc),
        stocks: Math.round(runningStocks),
        realEstate: Math.round(runningRealEstate),
        bonds: Math.round(runningBonds),
        savings: 0,
        yearSavingsForTooltip: isRetired ? 0 : Math.round(yearSavings),
        total: Math.round(total),
        realTotal: Math.round(realTotal),
        hasEvent: lifeEvents.some(e => e.year === year) || 
          goals.some(g => g.will_be_spent && g.target_date && new Date(g.target_date).getFullYear() === year) ||
          goals.some(g => g.goal_type === 'debt_payoff' && g.linked_liability_id && g.payoff_years > 0 && 
            year >= (g.target_date ? new Date(g.target_date).getFullYear() : currentYear) && 
            year < (g.target_date ? new Date(g.target_date).getFullYear() : currentYear) + g.payoff_years),
        hasGoalWithdrawal: yearGoalWithdrawal > 0,
        isRetired: isRetired,
        yearWithdrawal: isRetired ? Math.round(totalWithdrawalForTaxCalculation) : 0,
        yearGoalWithdrawal: Math.round(yearGoalWithdrawal),
        retirementSpendingOnly: isRetired ? Math.round(retirementSpendingOnly) : 0,
        goalNames: yearGoalNames,
        btcGrowthRate: yearBtcGrowth,
        taxable: Math.round(runningTaxable),
        taxDeferred: Math.round(runningTaxDeferred),
        taxFree: Math.round(runningTaxFree),
        accountTotal: Math.round(accountTotal),
        canAccessPenaltyFree: currentAge + i >= PENALTY_FREE_AGE,
        penaltyPaid: isRetired ? Math.round(penaltyPaid) : 0,
        taxesPaid: isRetired ? Math.round(taxesPaid) : 0,
        netWithdrawal: isRetired ? Math.round(totalWithdrawalForTaxCalculation - taxesPaid - penaltyPaid) : 0,
        withdrawFromTaxable: isRetired ? Math.round(withdrawFromTaxable) : 0,
        withdrawFromTaxDeferred: isRetired ? Math.round(withdrawFromTaxDeferred) : 0,
        withdrawFromTaxFree: isRetired ? Math.round(withdrawFromTaxFree) : 0,
        totalDebt: Math.round(totalDebt),
        debtPayments: i === 0 ? Math.round(monthlyDebtPayments * 12) : Math.round(actualAnnualDebtPayments),
        encumberedBtc: totalEncumberedBtc,
        releasedBtc: totalReleasedBtc,
        liquidBtc: Math.max(0, (runningBtc / (btcPrice || 97000)) - totalEncumberedBtc),
        debtPaidOffThisYear: Object.entries(debtPaidOffYears)
          .filter(([id, payoffYear]) => payoffYear === year)
          .map(([id]) => liabilities.find(l => l.id === id)?.name)
          .filter(Boolean),
        portfolioFailed,
        btcRunsOut,
      });
    }
    return data;
  }, [btcValue, stocksValue, realEstateValue, bondsValue, otherValue, taxableValue, taxDeferredValue, taxFreeValue, currentAge, retirementAge, lifeExpectancy, effectiveBtcCagr, effectiveStocksCagr, realEstateCagr, bondsCagr, effectiveInflation, lifeEvents, goals, annualSavings, incomeGrowth, retirementAnnualSpending, withdrawalStrategy, dynamicWithdrawalRate, btcReturnModel, filingStatus, taxableHoldings, otherRetirementIncome, socialSecurityStartAge, socialSecurityAmount, liabilities, monthlyDebtPayments, btcPrice]);

  const handleRunSimulation = () => {
    const { paths: simulations, successResults, withdrawalPaths } = runMonteCarloSimulation({
      btcValue,
      stocksValue,
      realEstateValue,
      bondsValue,
      otherValue,
      taxableValue,
      taxDeferredValue,
      taxFreeValue,
      currentAge,
      retirementAge,
      lifeExpectancy,
      getBtcGrowthRate: (year) => getBtcGrowthRate(year, effectiveInflation),
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
    
    const medianWithdrawals = [];
    const years = Math.max(1, lifeExpectancy - currentAge);
    for (let i = 0; i <= years; i++) {
      const yearWithdrawals = withdrawalPaths.map(path => path[i] || 0).sort((a, b) => a - b);
      const medianIndex = Math.floor(yearWithdrawals.length / 2);
      medianWithdrawals.push(yearWithdrawals[medianIndex] || 0);
    }
    
    const probability = calculateSuccessProbability(successResults);
    setSuccessProbability(probability);
    
    const chartData = percentiles.map((p, i) => ({
      age: currentAge + i,
      year: new Date().getFullYear() + i,
      p10: Math.round(p.p10 || 0),
      p25: Math.round(p.p25 || 0),
      p50: Math.round(p.p50 || 0),
      p75: Math.round(p.p75 || 0),
      p90: Math.round(p.p90 || 0),
      withdrawal: Math.round(medianWithdrawals[i] || 0),
      isRetired: i >= (retirementAge - currentAge),
    }));
    
    setSimulationResults(chartData);
  };

  const retirementYearIndex = Math.max(0, retirementAge - currentAge);
  const retirementValue = projections[retirementYearIndex]?.total || 0;
  const realRetirementValue = projections[retirementYearIndex]?.realTotal || 0;
  const endOfLifeValue = projections[projections.length - 1]?.total || 0;
  const runOutOfMoneyAge = projections.findIndex(p => p.total <= 0 && p.isRetired);
  const willRunOutOfMoney = runOutOfMoneyAge !== -1;
  const yearsInRetirement = lifeExpectancy - retirementAge;

  const yearsToRetirement = Math.max(0, retirementAge - currentAge);
  const inflationAdjustedRetirementSpending = retirementAnnualSpending * Math.pow(1 + inflationRate / 100, yearsToRetirement);
  
  const effectiveWithdrawalRate = withdrawalStrategy === '4percent' ? 0.04 : 
    withdrawalStrategy === 'dynamic' ? dynamicWithdrawalRate / 100 : 
    Math.max(0.03, 1 / yearsInRetirement);
  const requiredNestEgg = inflationAdjustedRetirementSpending / effectiveWithdrawalRate;

  const retirementStatus = useMemo(() => {
    const canAffordDesiredSpending = retirementAnnualSpending <= maxSustainableSpending;

    if (willRunOutOfMoney) {
      return {
        type: 'critical',
        title: 'Critical: Plan Not Sustainable',
        description: `Portfolio projected to run out at age ${currentAge + runOutOfMoneyAge}.`,
        icon: <AlertTriangle className="w-5 h-5" />
      };
    }

    if (!canAffordDesiredSpending && maxSustainableSpending > 0) {
      const shortfallPercent = ((retirementAnnualSpending - maxSustainableSpending) / retirementAnnualSpending * 100).toFixed(0);
      return {
        type: 'critical',
        title: 'At Risk: Spending Not Sustainable',
        description: `Portfolio can only support ${formatNumber(maxSustainableSpending)}/yr (today's $), ${shortfallPercent}% below your ${formatNumber(retirementAnnualSpending)}/yr target.`,
        icon: <AlertTriangle className="w-5 h-5" />
      };
    }

    const gap = earliestRetirementAge ? earliestRetirementAge - retirementAge : null;

    if (gap === null || gap > 10) {
      return {
        type: 'critical',
        title: 'At Risk: Major Shortfall',
        description: `Retirement not achievable at target age ${retirementAge} with current plan.`,
        icon: <AlertTriangle className="w-5 h-5" />
      };
    } else if (gap > 3) {
      return {
        type: 'at_risk',
        title: 'At Risk: Adjustments Needed',
        description: `Earliest sustainable retirement: Age ${earliestRetirementAge} (${gap} years later than target).`,
        icon: <AlertTriangle className="w-5 h-5" />
      };
    } else if (gap > 0) {
      return {
        type: 'on_track',
        title: 'Nearly On Track',
        description: `Close to target! Earliest retirement: Age ${earliestRetirementAge} (${gap} years from target).`,
        icon: <TrendingUp className="w-5 h-5" />
      };
    } else {
      const yearsEarly = Math.abs(gap);
      return {
        type: 'optimistic',
        title: 'Ahead of Schedule!',
        description: yearsEarly > 0 
          ? `You can retire ${yearsEarly} year${yearsEarly !== 1 ? 's' : ''} earlier at Age ${earliestRetirementAge}.`
          : `On track to retire at Age ${retirementAge} as planned.`,
        icon: <Sparkles className="w-5 h-5" />
      };
    }
  }, [earliestRetirementAge, retirementAge, willRunOutOfMoney, runOutOfMoneyAge, currentAge, retirementValue, maxSustainableSpending, retirementAnnualSpending, inflationRate]);

  useEffect(() => {
    const calculateMaxSpending = () => {
      const startingPortfolio = taxableValue + taxDeferredValue + taxFreeValue;
      if (startingPortfolio <= 0 && annualSavings <= 0) {
        setMaxSustainableSpending(0);
        return;
      }

      const totalAssets = btcValue + stocksValue + realEstateValue + bondsValue + otherValue;
      const btcPct = totalAssets > 0 ? btcValue / totalAssets : 0;
      const stocksPct = totalAssets > 0 ? stocksValue / totalAssets : 0;
      const realEstatePct = totalAssets > 0 ? realEstateValue / totalAssets : 0;
      const bondsPct = totalAssets > 0 ? bondsValue / totalAssets : 0;
      const otherPct = totalAssets > 0 ? otherValue / totalAssets : 0;

      if (withdrawalStrategy === '4percent' || withdrawalStrategy === 'dynamic') {
        let portfolioAtRetirement = startingPortfolio;
        const currentYear = new Date().getFullYear();
        
        for (let year = 1; year <= retirementAge - currentAge; year++) {
          const yearBtcGrowth = getBtcGrowthRate(year, effectiveInflation);
          const blendedGrowthRate = (
            btcPct * (yearBtcGrowth / 100) +
            stocksPct * (effectiveStocksCagr / 100) +
            realEstatePct * (realEstateCagr / 100) +
            bondsPct * (bondsCagr / 100) +
            otherPct * (otherCagr / 100)
          );
          portfolioAtRetirement *= (1 + blendedGrowthRate);
          portfolioAtRetirement += annualSavings * Math.pow(1 + incomeGrowth / 100, year);
          
          const simulationYear = currentYear + year;
          lifeEvents.forEach(event => {
            if (event.year === simulationYear && event.affects === 'assets') {
              portfolioAtRetirement += event.amount;
            }
          });
          goals.forEach(goal => {
            if (goal.will_be_spent && goal.target_date && new Date(goal.target_date).getFullYear() === simulationYear) {
              portfolioAtRetirement -= (goal.target_amount || 0);
            }
          });
        }
        
        const firstYearWithdrawal = withdrawalStrategy === '4percent'
          ? portfolioAtRetirement * 0.04
          : portfolioAtRetirement * (dynamicWithdrawalRate / 100);
        
        const maxSpendingTodayDollars = firstYearWithdrawal / Math.pow(1 + effectiveInflation / 100, retirementAge - currentAge);
        setMaxSustainableSpending(Math.round(maxSpendingTodayDollars));
        return;
      }

      let low = 0;
      let high = 1000000;
      let maxSpending = 0;
      const tolerance = 0.01;

      while (high - low > tolerance) {
        const testSpending = (low + high) / 2;
        let portfolio = startingPortfolio;
        let canSustain = true;
        const currentYear = new Date().getFullYear();
        let initial4PercentWithdrawal = 0;

        for (let year = 1; year <= lifeExpectancy - currentAge; year++) {
          const age = currentAge + year;
          const isRetired = age >= retirementAge;
          const simulationYear = currentYear + year;

          const yearBtcGrowth = getBtcGrowthRate(year, effectiveInflation);
          const blendedGrowthRate = (
            btcPct * (yearBtcGrowth / 100) +
            stocksPct * (effectiveStocksCagr / 100) +
            realEstatePct * (realEstateCagr / 100) +
            bondsPct * (bondsCagr / 100) +
            otherPct * (otherCagr / 100)
          );

          portfolio *= (1 + blendedGrowthRate);

          let eventImpact = 0;
          lifeEvents.forEach(event => {
            const yearsFromEventStart = simulationYear - event.year;
            if (event.year === simulationYear || (event.is_recurring && event.year <= simulationYear && simulationYear < event.year + (event.recurring_years || 1))) {
              const growthMultiplier = (event.affects === 'income' || event.event_type === 'income_change') 
                ? Math.pow(1 + incomeGrowth / 100, Math.max(0, yearsFromEventStart))
                : 1;

              if (event.affects === 'assets') eventImpact += event.amount;
              else if (event.affects === 'income') eventImpact += event.amount * growthMultiplier;
              if (event.event_type === 'home_purchase' && event.year === simulationYear) {
                eventImpact -= (event.down_payment || 0);
              }
            }
          });
          
          goals.forEach(goal => {
            if (goal.will_be_spent && goal.target_date && new Date(goal.target_date).getFullYear() === simulationYear) {
              eventImpact -= (goal.target_amount || 0);
            }
            if (goal.goal_type === 'debt_payoff' && goal.linked_liability_id && goal.payoff_years > 0) {
              const startYear = goal.target_date ? new Date(goal.target_date).getFullYear() : currentYear;
              const endYear = startYear + goal.payoff_years;
              if (simulationYear >= startYear && simulationYear < endYear) {
                eventImpact -= (goal.target_amount || 0) / goal.payoff_years;
              }
            }
          });

          portfolio += eventImpact;

          if (!isRetired) {
            portfolio += annualSavings * Math.pow(1 + incomeGrowth / 100, year);
          } else {
            const yearsIntoRetirement = age - retirementAge;
            const nominalSpendingRequired = testSpending * Math.pow(1 + effectiveInflation / 100, yearsIntoRetirement);
            
            let withdrawal;
            if (withdrawalStrategy === 'dynamic') {
              const dynamicAmount = portfolio * (dynamicWithdrawalRate / 100);
              if (dynamicAmount < nominalSpendingRequired) {
                canSustain = false;
                break;
              }
              withdrawal = dynamicAmount;
            } else {
              withdrawal = nominalSpendingRequired;
            }

            if (portfolio < withdrawal) {
              canSustain = false;
              break;
            }
            portfolio -= withdrawal;
          }
        }

        if (canSustain && portfolio >= 0) {
          maxSpending = testSpending;
          low = testSpending;
        } else {
          high = testSpending;
        }
      }

      setMaxSustainableSpending(Math.round(maxSpending));
    };

    calculateMaxSpending();
  }, [currentAge, retirementAge, lifeExpectancy, taxableValue, taxDeferredValue, taxFreeValue, btcValue, stocksValue, realEstateValue, bondsValue, otherValue, annualSavings, effectiveInflation, incomeGrowth, effectiveStocksCagr, realEstateCagr, bondsCagr, otherCagr, withdrawalStrategy, dynamicWithdrawalRate, getBtcGrowthRate, lifeEvents, goals]);

  useEffect(() => {
    const calculateEarliestFI = () => {
      const startingPortfolio = taxableValue + taxDeferredValue + taxFreeValue;
      
      const totalAssets = btcValue + stocksValue + realEstateValue + bondsValue + otherValue;
      const btcPct = totalAssets > 0 ? btcValue / totalAssets : 0;
      const stocksPct = totalAssets > 0 ? stocksValue / totalAssets : 0;
      const realEstatePct = totalAssets > 0 ? realEstateValue / totalAssets : 0;
      const bondsPct = totalAssets > 0 ? bondsValue / totalAssets : 0;
      const otherPct = totalAssets > 0 ? otherValue / totalAssets : 0;
      
      for (let testAge = currentAge + 1; testAge <= lifeExpectancy - 5; testAge++) {
        let portfolio = startingPortfolio;
        let canSustain = true;
        
        for (let year = 1; year <= lifeExpectancy - currentAge; year++) {
          const age = currentAge + year;
          const isRetired = age >= testAge;
          
          const yearBtcGrowth = getBtcGrowthRate(year, effectiveInflation);
          const blendedGrowthRate = (
            btcPct * (yearBtcGrowth / 100) +
            stocksPct * (effectiveStocksCagr / 100) +
            realEstatePct * (realEstateCagr / 100) +
            bondsPct * (bondsCagr / 100) +
            otherPct * (effectiveStocksCagr / 100)
          );
          
          portfolio = portfolio * (1 + blendedGrowthRate);
          
          if (!isRetired) {
            const yearNetCashFlow = annualSavings * Math.pow(1 + incomeGrowth / 100, year);
            portfolio += yearNetCashFlow;
          } else {
            let withdrawal;
            const yearsIntoRetirement = age - testAge;
            
            if (withdrawalStrategy === '4percent') {
              const simulatedRetirementYearIndex = testAge - currentAge;
              const initialPortfolioAtFI = (projections[simulatedRetirementYearIndex]?.total || 0);
              if (yearsIntoRetirement === 0) {
                withdrawal = initialPortfolioAtFI * 0.04;
              } else {
                const baseWithdrawal = (simulatedRetirementYearIndex > 0 ? projections[simulatedRetirementYearIndex - 1]?.total || 0 : startingPortfolio) * 0.04;
                withdrawal = baseWithdrawal * Math.pow(1 + effectiveInflation / 100, yearsIntoRetirement);
              }
            } else if (withdrawalStrategy === 'dynamic') {
              withdrawal = portfolio * (dynamicWithdrawalRate / 100);
            } else {
              const nominalRetirementSpendingAtTestAge = retirementAnnualSpending * Math.pow(1 + effectiveInflation / 100, Math.max(0, testAge - currentAge));
              withdrawal = nominalRetirementSpendingAtTestAge * Math.pow(1 + effectiveInflation / 100, yearsIntoRetirement);
            }
            
            if (portfolio < withdrawal) {
              canSustain = false;
              break;
            }
            
            portfolio -= withdrawal;
          }
        }
        
        if (canSustain && portfolio > 0) {
          setEarliestRetirementAge(testAge);
          return;
        }
      }
      setEarliestRetirementAge(null);
    };
    
    if ((taxableValue + taxDeferredValue + taxFreeValue) > 0 || annualSavings !== 0) {
      calculateEarliestFI();
    }
  }, [currentAge, lifeExpectancy, taxableValue, taxDeferredValue, taxFreeValue, btcValue, stocksValue, realEstateValue, bondsValue, otherValue, annualSavings, retirementAnnualSpending, effectiveInflation, incomeGrowth, effectiveStocksCagr, realEstateCagr, bondsCagr, withdrawalStrategy, dynamicWithdrawalRate, getBtcGrowthRate, projections]);
  
  const lifetimeTaxesPaid = projections.filter(p => p.isRetired).reduce((sum, p) => sum + (p.taxesPaid || 0), 0);
  const lifetimePenaltiesPaid = projections.filter(p => p.isRetired).reduce((sum, p) => sum + (p.penaltyPaid || 0), 0);
  const avgAnnualTaxInRetirement = yearsInRetirement > 0 ? lifetimeTaxesPaid / yearsInRetirement : 0;

  const projectedPortfolioReturn = useMemo(() => {
    if (totalValue <= 0) return 0;
    const btcPct = btcValue / totalValue;
    const stocksPct = stocksValue / totalValue;
    const realEstatePct = realEstateValue / totalValue;
    const bondsPct = bondsValue / totalValue;
    const otherPct = otherValue / totalValue;

    const btcExpectedReturn = getBtcGrowthRate(1, effectiveInflation);

    const weightedReturn = (
      btcPct * btcExpectedReturn +
      stocksPct * effectiveStocksCagr +
      realEstatePct * realEstateCagr +
      bondsPct * bondsCagr +
      otherPct * otherCagr
    );

    return weightedReturn;
  }, [btcValue, stocksValue, realEstateValue, bondsValue, otherValue, totalValue, effectiveStocksCagr, realEstateCagr, bondsCagr, getBtcGrowthRate]);

  const goalsWithProjections = useMemo(() => {
    return goals.map(goal => {
      const targetAmount = goal.target_amount || 0;
      const currentAmount = goal.current_amount || 0;
      
      const meetYearIndex = projections.findIndex(p => p.total >= targetAmount);
      const meetYear = meetYearIndex >= 0 ? projections[meetYearIndex]?.year : null;
      const meetAge = meetYearIndex >= 0 ? projections[meetYearIndex]?.age : null;
      
      let onTrackForDate = true;
      let projectedAtTargetDate = null;
      if (goal.target_date) {
        const targetYear = new Date(goal.target_date).getFullYear();
        const targetYearIndex = projections.findIndex(p => p.year >= targetYear);
        if (targetYearIndex >= 0) {
          projectedAtTargetDate = projections[targetYearIndex]?.total || 0;
          onTrackForDate = projectedAtTargetDate >= targetAmount;
        }
      }
      
      const yearsToTarget = goal.target_date 
        ? Math.max(0, (new Date(goal.target_date).getFullYear() - new Date().getFullYear()))
        : 5;
      const remainingNeeded = Math.max(0, targetAmount - currentAmount);
      const monthlyNeeded = yearsToTarget > 0 ? remainingNeeded / (yearsToTarget * 12) : remainingNeeded;
      
      return {
        ...goal,
        meetYear,
        meetAge,
        onTrackForDate,
        projectedAtTargetDate,
        monthlyNeeded,
        yearsToTarget,
        remainingNeeded,
      };
    });
  }, [goals, projections]);

  const lifeEventsWithImpact = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return lifeEvents.map(event => {
      const yearsFromNow = event.year - currentYear;
      const projectionAtEvent = projections.find(p => p.year === event.year);
      const portfolioAtEvent = projectionAtEvent?.total || 0;
      
      let isAffordable = true;
      let impactPercent = 0;
      if (event.affects === 'assets' && event.amount < 0) {
        isAffordable = portfolioAtEvent >= Math.abs(event.amount);
        impactPercent = portfolioAtEvent > 0 ? (Math.abs(event.amount) / portfolioAtEvent) * 100 : 100;
      }
      
      let totalCashNeeded = 0;
      if (event.event_type === 'home_purchase') {
        totalCashNeeded = (event.down_payment || 0);
        isAffordable = portfolioAtEvent >= totalCashNeeded;
        impactPercent = portfolioAtEvent > 0 ? (totalCashNeeded / portfolioAtEvent) * 100 : 100;
      }
      
      return {
        ...event,
        yearsFromNow,
        portfolioAtEvent,
        isAffordable,
        impactPercent,
        totalCashNeeded,
      };
    }).sort((a, b) => a.year - b.year);
  }, [lifeEvents, projections]);
  
  const firstRetirementWithdrawal = projections[retirementYearIndex]?.yearWithdrawal || 0;
  const retirementYears = projections.filter(p => p.isRetired);
  const avgRetirementWithdrawal = retirementYears.length > 0 
    ? retirementYears.reduce((sum, p) => sum + p.yearWithdrawal, 0) / retirementYears.length 
    : 0;
  const totalLifetimeWithdrawals = retirementYears.reduce((sum, p) => sum + p.yearWithdrawal, 0);
  
  const canRetire = retirementValue >= requiredNestEgg * 0.8;

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

  const resetGoalForm = () => setGoalForm({ name: '', target_amount: '', current_amount: '', target_date: '', goal_type: 'other', priority: 'medium', notes: '' });
  const resetEventForm = () => setEventForm({ name: '', event_type: 'expense_change', year: new Date().getFullYear() + 1, amount: '', is_recurring: false, recurring_years: '', affects: 'expenses', notes: '', monthly_expense_impact: '', liability_amount: '', down_payment: '', interest_rate: '', loan_term_years: '', allocation_method: 'proportionate', btc_allocation: 0, stocks_allocation: 0, real_estate_allocation: 0, bonds_allocation: 0, cash_allocation: 0, other_allocation: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Retirement Planning</h1>
          <p className="text-zinc-500 mt-1">Model your path to financial freedom</p>
        </div>
        <Button variant="outline" onClick={() => setShowMonteCarloSettings(!showMonteCarloSettings)} className="bg-transparent border-zinc-700">
          <Settings className="w-4 h-4 mr-2" />
          Assumptions
        </Button>
      </div>

      {showMonteCarloSettings && (
        <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
          <h3 className="font-semibold mb-6 flex items-center gap-2">
            <Settings className="w-5 h-5 text-orange-400" />
            Rate Assumptions
          </h3>
          <div className="mb-6 p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
            <Label className="text-zinc-300 font-medium mb-3 block">Bitcoin Return Model</Label>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {[
                { value: 'custom', label: 'Custom', desc: `${btcCagr}% CAGR` },
                { value: 'saylor24', label: 'Saylor Bitcoin 24 Model', desc: '50%→20% declining' },
                { value: 'conservative', label: 'Conservative', desc: '10% flat' },
              ].map(model => (
                <button
                  key={model.value}
                  onClick={() => setBtcReturnModel(model.value)}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all",
                    btcReturnModel === model.value 
                      ? "bg-orange-500/20 border-orange-500/50 text-orange-300" 
                      : "bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:border-zinc-600"
                  )}
                >
                  <p className="font-medium text-sm">{model.label}</p>
                  <p className="text-xs text-zinc-400">{model.desc}</p>
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
              <Slider value={[stocksCagr]} onValueChange={([v]) => setStocksCagr(v)} min={-10} max={100} step={1} />
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
                <Label className="text-zinc-400">Cash/Savings CAGR</Label>
                <span className="text-cyan-400 font-semibold">{cashCagr}%</span>
              </div>
              <Slider value={[cashCagr]} onValueChange={([v]) => setCashCagr(v)} min={0} max={10} step={0.5} />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label className="text-zinc-400">Other Assets CAGR</Label>
                <span className="text-zinc-400 font-semibold">{otherCagr}%</span>
              </div>
              <Slider value={[otherCagr]} onValueChange={([v]) => setOtherCagr(v)} min={-10} max={20} step={0.5} />
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
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-zinc-800/50 p-1 flex-wrap">
          <TabsTrigger value="projections" className="data-[state=active]:bg-zinc-700">Retirement Planning</TabsTrigger>
          <TabsTrigger value="montecarlo" className="data-[state=active]:bg-zinc-700">Monte Carlo</TabsTrigger>
        </TabsList>

        <TabsContent value="projections" className="space-y-6">
          <div className="card-premium rounded-2xl p-6 border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-transparent">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div>
                <p className="text-sm text-zinc-400 uppercase tracking-wider mb-2">Earliest Retirement Age</p>
                <div className="flex items-baseline gap-3">
                  <span className={cn(
                    "text-5xl font-bold",
                    earliestRetirementAge && earliestRetirementAge <= retirementAge ? "text-emerald-400" : 
                    earliestRetirementAge ? "text-orange-400" : "text-rose-400"
                  )}>
                    {earliestRetirementAge ? `Age ${earliestRetirementAge}` : "Not Yet Achievable"}
                  </span>
                  {earliestRetirementAge && (
                    <span className="text-zinc-500">
                      ({earliestRetirementAge - currentAge} years from now)
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-400 mt-2">
                  {earliestRetirementAge && earliestRetirementAge <= retirementAge 
                    ? `You can retire ${retirementAge - earliestRetirementAge} years earlier than your target!`
                    : earliestRetirementAge 
                      ? `Your target age ${retirementAge} is ${earliestRetirementAge - retirementAge} years too early based on current trajectory.`
                      : "Increase savings or reduce spending to retire."}
                </p>
              </div>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-zinc-400">Annual Net Cash Flow:</span>
                  <span className="font-semibold text-emerald-400">{formatNumber(annualSavings)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-zinc-400">Retirement Spending:</span>
                  <span className="font-semibold text-amber-400">{formatNumber(retirementAnnualSpending)}/yr</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-zinc-400">Current Portfolio:</span>
                  <span className="font-semibold text-blue-400">{formatNumber(totalValue)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400" />
                  <span className="text-zinc-400">Projected Return:</span>
                  <span className="font-semibold text-cyan-400">{projectedPortfolioReturn.toFixed(1)}%/yr</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className={cn(
              "lg:col-span-1 card-premium rounded-xl p-4 border flex items-start gap-3",
              retirementStatus.type === 'optimistic' && "border-emerald-500/30 bg-emerald-500/5",
              retirementStatus.type === 'on_track' && "border-emerald-500/30 bg-emerald-500/5",
              retirementStatus.type === 'at_risk' && "border-amber-500/30 bg-amber-500/5",
              retirementStatus.type === 'critical' && "border-rose-500/30 bg-rose-500/5"
            )}>
              <div className={cn(
                "p-2 rounded-lg shrink-0",
                retirementStatus.type === 'optimistic' && "bg-emerald-500/20 text-emerald-400",
                retirementStatus.type === 'on_track' && "bg-emerald-500/20 text-emerald-400",
                retirementStatus.type === 'at_risk' && "bg-amber-500/20 text-amber-400",
                retirementStatus.type === 'critical' && "bg-rose-500/20 text-rose-400"
              )}>
                {retirementStatus.icon}
              </div>
              <div>
                <h4 className={cn(
                  "font-semibold text-sm mb-1",
                  retirementStatus.type === 'optimistic' && "text-emerald-400",
                  retirementStatus.type === 'on_track' && "text-emerald-400",
                  retirementStatus.type === 'at_risk' && "text-amber-400",
                  retirementStatus.type === 'critical' && "text-rose-400"
                )}>{retirementStatus.title}</h4>
                <p className="text-xs text-zinc-400">{retirementStatus.description}</p>
              </div>
            </div>

            {(!earliestRetirementAge || earliestRetirementAge > retirementAge || willRunOutOfMoney || retirementStatus.type === 'critical' || retirementStatus.type === 'at_risk') && (
              <>
                <div className="card-premium rounded-xl p-4 border border-zinc-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <h5 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Increase Annual Investment By</h5>
                  </div>
                  <p className="text-2xl font-bold text-emerald-400">
                    +{formatNumber((() => {
                      const yearsToWork = retirementAge - currentAge;
                      if (yearsToWork <= 0) return 0;

                      const spendingShortfall = Math.max(0, retirementAnnualSpending - maxSustainableSpending);
                      if (spendingShortfall <= 0) return 0;

                      const effectiveWithdrawalRate = withdrawalStrategy === '4percent' ? 0.04 : 
                        withdrawalStrategy === 'dynamic' ? dynamicWithdrawalRate / 100 : 
                        Math.max(0.03, 1 / (lifeExpectancy - retirementAge));
                      
                      const additionalNestEggNeeded = spendingShortfall / effectiveWithdrawalRate;

                      const totalAssets = btcValue + stocksValue + realEstateValue + bondsValue + otherValue;
                      const btcPct = totalAssets > 0 ? btcValue / totalAssets : 0.5;
                      const stocksPct = totalAssets > 0 ? stocksValue / totalAssets : 0.3;
                      const realEstatePct = totalAssets > 0 ? realEstateValue / totalAssets : 0.1;
                      const bondsPct = totalAssets > 0 ? bondsValue / totalAssets : 0.05;
                      const otherPct = totalAssets > 0 ? otherValue / totalAssets : 0.05;

                      const avgBtcReturn = (() => {
                        let total = 0;
                        for (let y = 1; y <= yearsToWork; y++) {
                          total += getBtcGrowthRate(y, effectiveInflation);
                        }
                        return total / yearsToWork;
                      })();

                      const blendedGrowthRate = (
                        btcPct * (avgBtcReturn / 100) +
                        stocksPct * (effectiveStocksCagr / 100) +
                        realEstatePct * (realEstateCagr / 100) +
                        bondsPct * (bondsCagr / 100) +
                        otherPct * (otherCagr / 100)
                      );

                      if (Math.abs(blendedGrowthRate) < 0.001) {
                        return additionalNestEggNeeded / yearsToWork;
                      }

                      const fvFactor = (Math.pow(1 + blendedGrowthRate, yearsToWork) - 1) / blendedGrowthRate;
                      return additionalNestEggNeeded / fvFactor;
                    })())}<span className="text-sm text-zinc-500">/yr</span>
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1">invested into your portfolio to retire at age {retirementAge}</p>
                </div>

                <div className="card-premium rounded-xl p-4 border border-zinc-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    <h5 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Or Reduce Retirement Spending To</h5>
                  </div>
                  <p className="text-2xl font-bold text-rose-400">
                    {formatNumber(maxSustainableSpending)}<span className="text-sm text-zinc-500">/yr</span>
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    {(() => {
                      const reduction = Math.max(0, retirementAnnualSpending - maxSustainableSpending);
                      return `${formatNumber(reduction)} less than planned (in today's dollars)`;
                    })()}
                  </p>
                </div>

                {earliestRetirementAge && (
                  <div className="card-premium rounded-xl p-4 border border-zinc-700/50">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <h5 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Or Wait Until</h5>
                    </div>
                    <p className="text-2xl font-bold text-amber-400">
                      Age {earliestRetirementAge}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-1">+{earliestRetirementAge - retirementAge} years with current plan</p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-2">Wealth Projection</h3>
            <p className="text-sm text-zinc-400 mb-4">
              {lifeEvents.length > 0 && `${lifeEvents.length} life event${lifeEvents.length !== 1 ? 's' : ''} • `}
              {goals.filter(g => g.will_be_spent).length > 0 && `${goals.filter(g => g.will_be_spent).length} planned expense${goals.filter(g => g.will_be_spent).length !== 1 ? 's' : ''} • `}
              {goals.length > 0 && `${goals.length} goal${goals.length !== 1 ? 's' : ''} tracked`}
            </p>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={projections}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="age" stroke="#71717a" fontSize={12} />
                  <YAxis yAxisId="left" stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
                  <YAxis yAxisId="right" orientation="right" stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0]?.payload;
                      if (!p) return null;

                      return (
                        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-sm min-w-[200px]">
                          <p className="font-semibold text-zinc-200 mb-2">Age {label} {p.hasEvent ? '📅' : ''}</p>
                          <div className="space-y-1">
                            <div className="flex justify-between gap-4">
                              <span className="text-orange-400">Bitcoin:</span>
                              <span className="text-zinc-200">${(p.btc || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-blue-400">Stocks:</span>
                              <span className="text-zinc-200">${(p.stocks || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-emerald-400">Real Estate:</span>
                              <span className="text-zinc-200">${(p.realEstate || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-purple-400">Bonds:</span>
                              <span className="text-zinc-200">${(p.bonds || 0).toLocaleString()}</span>
                            </div>
                            <div className="pt-2 mt-2 border-t border-zinc-700">
                              <div className="flex justify-between gap-4">
                                <span className="text-white font-semibold">Total Assets:</span>
                                <span className="text-white font-semibold">${(p.total || 0).toLocaleString()}</span>
                              </div>
                              {p.totalDebt > 0 && (
                                <>
                                  <div className="flex justify-between gap-4 mt-1">
                                    <span className="text-rose-400 font-semibold">Total Debt:</span>
                                    <span className="text-rose-400 font-semibold">-${(p.totalDebt || 0).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between gap-4 mt-1 pt-1 border-t border-zinc-700/50">
                                    <span className="text-emerald-400 font-semibold">Net Worth:</span>
                                    <span className="text-emerald-400 font-semibold">${((p.total || 0) - (p.totalDebt || 0)).toLocaleString()}</span>
                                  </div>
                                </>
                              )}
                              {p.debtPaidOffThisYear && p.debtPaidOffThisYear.length > 0 && (
                                <div className="pt-2 mt-2 border-t border-zinc-700">
                                  <p className="text-emerald-400 font-semibold text-xs">✓ Debt Paid Off!</p>
                                  <p className="text-[10px] text-zinc-500">{p.debtPaidOffThisYear.join(', ')}</p>
                                </div>
                              )}
                            </div>
                            {!p.isRetired && (
                              <div className="pt-2 mt-2 border-t border-zinc-700">
                                <div className="text-xs space-y-0.5 text-zinc-400 mb-1">
                                  <div className="flex justify-between">
                                    <span>• Current Spending:</span>
                                    <span className="text-zinc-300">${currentAnnualSpending.toLocaleString()}</span>
                                  </div>
                                </div>
                                <p className={`font-medium ${p.yearSavingsForTooltip >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  Total Annual {p.yearSavingsForTooltip >= 0 ? 'Inflow' : 'Outflow'}: ${Math.abs(p.yearSavingsForTooltip).toLocaleString()}
                                </p>
                              </div>
                            )}
                            {p.isRetired && (p.yearWithdrawal > 0 || p.yearGoalWithdrawal > 0) && (
                              <div className="pt-2 mt-2 border-t border-zinc-700">
                                {p.retirementSpendingOnly > 0 && (
                                  <div className="text-xs space-y-0.5 text-zinc-400 mb-1">
                                    <div className="flex justify-between">
                                      <span>• Retirement Spending:</span>
                                      <span className="text-zinc-300">${(p.retirementSpendingOnly).toLocaleString()}</span>
                                    </div>
                                  </div>
                                )}
                                {p.yearGoalWithdrawal > 0 && (
                                  <div className="text-xs space-y-0.5 text-zinc-400 mb-2">
                                    <div className="flex justify-between">
                                      <span>• Goal Funding:</span>
                                      <span className="text-orange-400">${(p.yearGoalWithdrawal).toLocaleString()}</span>
                                    </div>
                                    {p.goalNames && p.goalNames.length > 0 && (
                                      <p className="text-[10px] text-zinc-500 ml-2">{p.goalNames.join(', ')}</p>
                                    )}
                                  </div>
                                )}
                                <p className={`font-medium ${p.yearWithdrawal > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                  Total Annual {p.yearWithdrawal > 0 ? 'Outflow' : 'Inflow'}: ${(p.yearWithdrawal || 0).toLocaleString()}
                                </p>
                                <div className="text-xs space-y-0.5 text-zinc-400 mt-2 pt-2 border-t border-zinc-700/50">
                                  {p.withdrawFromTaxable > 0 && (
                                    <div className="flex justify-between">
                                      <span>From Taxable:</span>
                                      <span className="text-emerald-400">${(p.withdrawFromTaxable).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {p.withdrawFromTaxDeferred > 0 && (
                                    <div className="flex justify-between">
                                      <span>From Tax-Deferred:</span>
                                      <span className="text-amber-400">${(p.withdrawFromTaxDeferred).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {p.withdrawFromTaxFree > 0 && (
                                    <div className="flex justify-between">
                                      <span>From Tax-Free:</span>
                                      <span className="text-purple-400">${(p.withdrawFromTaxFree).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {p.taxesPaid > 0 && (
                                    <div className="flex justify-between text-rose-400">
                                      <span>Taxes:</span>
                                      <span>-${(p.taxesPaid).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {p.penaltyPaid > 0 && (
                                    <div className="flex justify-between text-rose-400">
                                      <span>Early Withdrawal Penalty:</span>
                                      <span>-${(p.penaltyPaid).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {p.taxesPaid === 0 && p.penaltyPaid === 0 && p.canAccessPenaltyFree && (
                                    <div className="flex justify-between text-emerald-400">
                                      <span>Tax Status:</span>
                                      <span>Tax-Free! ✓</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                    labelFormatter={(age) => {
                      const year = new Date().getFullYear() + (age - currentAge);
                      const yearEvents = lifeEvents.filter(e => e.year === year);
                      const yearGoals = goals.filter(g => g.will_be_spent && g.target_date && new Date(g.target_date).getFullYear() === year);
                      let label = `Age ${age}`;
                      if (yearEvents.length > 0) {
                        label += ` • ${yearEvents.map(e => e.name).join(', ')}`;
                      }
                      if (yearGoals.length > 0) {
                        label += ` • ${yearGoals.map(g => `${g.name} (-$${(g.target_amount/1000).toFixed(0)}k)`).join(', ')}`;
                      }
                      return label;
                    }}
                  />
                  <Legend />
                  <ReferenceLine x={retirementAge} stroke="#F7931A" strokeDasharray="5 5" label={{ value: 'Retire', fill: '#F7931A', fontSize: 10 }} yAxisId="left" />
                  {lifeEvents.slice(0, 5).map((event, i) => {
                    const eventAge = currentAge + (event.year - new Date().getFullYear());
                    if (eventAge > currentAge && eventAge < lifeExpectancy) {
                      return (
                        <ReferenceLine 
                          key={event.id} 
                          x={eventAge} 
                          stroke={event.amount < 0 ? "#f87171" : "#34d399"} 
                          strokeDasharray="3 3"
                          strokeOpacity={0.5}
                          yAxisId="left"
                        />
                      );
                    }
                    return null;
                  })}
                  {goals.filter(g => g.will_be_spent && g.target_date).slice(0, 5).map((goal) => {
                    const goalYear = new Date(goal.target_date).getFullYear();
                    const goalAge = currentAge + (goalYear - new Date().getFullYear());
                    const goalColor = (() => {
                      switch(goal.goal_type) {
                        case 'retirement': return '#a78bfa';
                        case 'btc_stack': return '#fbbf24';
                        case 'emergency_fund': return '#34d399';
                        case 'major_purchase': return '#60a5fa';
                        case 'debt_payoff': return '#f87171';
                        default: return '#71717a';
                      }
                    })();
                    if (goalAge > currentAge && goalAge < lifeExpectancy) {
                      return (
                        <ReferenceLine 
                          key={`goal-${goal.id}`} 
                          x={goalAge} 
                          stroke={goalColor}
                          strokeDasharray="3 3"
                          strokeOpacity={0.7}
                          label={{ value: goal.name, fill: goalColor, fontSize: 9, position: 'insideTopLeft', offset: 10 }}
                          yAxisId="left"
                        />
                      );
                    }
                    return null;
                  })}
                  {goalsWithProjections.filter(g => g.target_amount > 0 && !g.will_be_spent).slice(0, 3).map((goal, i) => (
                    <ReferenceLine 
                      key={goal.id} 
                      y={goal.target_amount} 
                      stroke="#60a5fa" 
                      strokeDasharray="8 4"
                      strokeOpacity={0.4}
                      label={{ value: goal.name, fill: '#60a5fa', fontSize: 10, position: 'right' }}
                      yAxisId="left"
                    />
                  ))}
                  <Area type="monotone" dataKey="bonds" stackId="1" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.3} name="Bonds" yAxisId="left" />
                  <Area type="monotone" dataKey="realEstate" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Real Estate" yAxisId="left" />
                  <Area type="monotone" dataKey="stocks" stackId="1" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.3} name="Stocks" yAxisId="left" />
                  <Area type="monotone" dataKey="btc" stackId="1" stroke="#F7931A" fill="#F7931A" fillOpacity={0.5} name="Bitcoin" yAxisId="left" />
                  <Line type="monotone" dataKey="total" stroke="#ffffff" strokeWidth={2} dot={false} name="Total Assets" yAxisId="left" />
                  <Line type="monotone" dataKey="totalDebt" stroke="#dc2626" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Total Debt" yAxisId="left" />
                  <Line type="monotone" dataKey="yearGoalWithdrawal" stroke="#fb923c" strokeWidth={2} strokeDasharray="4 4" dot={(props) => {
                    if (props.payload?.yearGoalWithdrawal > 0) {
                      return <circle cx={props.cx} cy={props.cy} r={4} fill="#fb923c" stroke="#0a0a0b" strokeWidth={2} />;
                    }
                    return null;
                  }} name="Goal Funding" yAxisId="right" connectNulls={false} />
                  <Line type="monotone" dataKey="yearWithdrawal" stroke="#ef4444" strokeWidth={2} dot={(props) => {
                    if (props.payload?.yearWithdrawal > 0) {
                      return <circle cx={props.cx} cy={props.cy} r={2} fill="#ef4444" />;
                    }
                    return null;
                  }} name="Withdrawal" yAxisId="right" connectNulls={false} />
                  {projections.filter(p => p.debtPaidOffThisYear && p.debtPaidOffThisYear.length > 0).map((p) => (
                    <ReferenceLine 
                      key={`debt-${p.age}`}
                      x={p.age} 
                      stroke="#22c55e"
                      strokeDasharray="3 3"
                      strokeOpacity={0.6}
                      label={{ value: '✓ Debt Free', fill: '#22c55e', fontSize: 9, position: 'top' }}
                      yAxisId="left"
                    />
                  ))}
                  {(() => {
                    const firstFailure = projections.find(p => p.portfolioFailed);
                    if (firstFailure) {
                      return (
                        <ReferenceLine 
                          x={firstFailure.age} 
                          stroke="#dc2626"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          label={{ value: '❌ Portfolio Depleted', fill: '#dc2626', fontSize: 10, position: 'top' }}
                          yAxisId="left"
                        />
                      );
                    }
                    return null;
                  })()}
                  {(() => {
                    const firstBtcDepletion = projections.find(p => p.btcRunsOut);
                    if (firstBtcDepletion) {
                      return (
                        <ReferenceLine 
                          x={firstBtcDepletion.age} 
                          stroke="#F7931A"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          strokeOpacity={0.7}
                          label={{ value: '⚠️ BTC Depleted', fill: '#F7931A', fontSize: 10, position: 'insideBottomLeft' }}
                          yAxisId="left"
                        />
                      );
                    }
                    return null;
                  })()}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {(lifeEvents.length > 0 || goals.length > 0) && (
              <div className="flex flex-wrap justify-center gap-4 mt-4">
                {lifeEvents.length > 0 && <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-rose-400/50" /><span className="text-sm text-zinc-400">Life Events</span></div>}
                {goals.length > 0 && <div className="flex items-center gap-2"><div className="w-6 h-0.5 bg-blue-400/50" style={{backgroundImage: 'repeating-linear-gradient(90deg, #60a5fa 0, #60a5fa 8px, transparent 8px, transparent 12px)'}} /><span className="text-sm text-zinc-400">Goal Targets</span></div>}
              </div>
            )}
          </div>

          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-4">Portfolio by Tax Treatment</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-zinc-400">Taxable (Accessible Now)</p>
                  <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">1st</Badge>
                </div>
                <p className="text-2xl font-bold text-emerald-400">{formatNumber(taxableValue)}</p>
                <p className="text-xs text-zinc-500">Brokerage, self-custody crypto</p>
              </div>
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-zinc-400">Tax-Deferred (59½+)</p>
                  <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">2nd</Badge>
                </div>
                <p className="text-2xl font-bold text-amber-400">{formatNumber(taxDeferredValue)}</p>
                <p className="text-xs text-zinc-500">401(k), Traditional IRA • 10% penalty if early</p>
              </div>
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-zinc-400">Tax-Free (Roth/HSA)</p>
                  <Badge className="bg-purple-500/20 text-purple-400 text-[10px]">3rd</Badge>
                </div>
                <p className="text-2xl font-bold text-purple-400">{formatNumber(taxFreeValue)}</p>
                <p className="text-xs text-zinc-500">Roth IRA/401k, HSA • Contributions accessible</p>
              </div>
            </div>
            
            <div className="mt-4 p-3 rounded-lg bg-zinc-800/30 border border-zinc-700/50">
              <p className="text-xs font-medium text-zinc-300 mb-2">Withdrawal Priority Order</p>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">1. Taxable</span>
                <span>→</span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">2. Tax-Deferred</span>
                <span>→</span>
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">3. Tax-Free (Last)</span>
              </div>
              <p className="text-[10px] text-zinc-500 mt-2">
                After age 59½: Taxable first (LTCG rates), then tax-deferred (income tax), then tax-free last (preserves tax-free growth).
                Before 59½: Taxable first, then Roth contributions, then tax-deferred with 10% penalty as last resort.
              </p>
            </div>

            {retirementAge < 59.5 && (() => {
              const yearsUntilPenaltyFree = Math.ceil(59.5 - retirementAge);
              const annualNeedAtRetirement = retirementAnnualSpending * Math.pow(1 + inflationRate / 100, retirementAge - currentAge);

              const taxableBtc = taxableLiquidHoldings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity * currentPrice, 0);
              const taxableStocks = taxableLiquidHoldings.filter(h => h.asset_type === 'stocks').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
              const taxableBonds = taxableLiquidHoldings.filter(h => h.asset_type === 'bonds').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
              const taxableOther = taxableLiquidValue - taxableBtc - taxableStocks - taxableBonds;

              const avgBtcGrowthForBridge = (() => {
                if (btcReturnModel === 'custom') return effectiveBtcCagr;
                let totalGrowth = 0;
                const yearsToRetire = retirementAge - currentAge;
                for (let y = yearsToRetire; y < yearsToRetire + yearsUntilPenaltyFree; y++) {
                  totalGrowth += getBtcGrowthRate(y, effectiveInflation);
                }
                return totalGrowth / yearsUntilPenaltyFree;
              })();

              let bridgeGrowthRate = 0.05;
              if (taxableLiquidValue > 0) {
                bridgeGrowthRate = (
                  (taxableBtc / taxableLiquidValue) * (avgBtcGrowthForBridge / 100) +
                  (taxableStocks / taxableLiquidValue) * (effectiveStocksCagr / 100) +
                  (taxableBonds / taxableLiquidValue) * (bondsCagr / 100) +
                  (taxableOther / taxableLiquidValue) * (effectiveStocksCagr / 100)
                );
              }

              const nominalBridgeGrowthRate = bridgeGrowthRate;
              const inflationRateDecimal = inflationRate / 100;

              const totalRothContributions = accounts
                .filter(a => ['401k_roth', 'ira_roth', 'hsa'].includes(a.account_type))
                .reduce((sum, a) => sum + (a.roth_contributions || 0), 0);

              let bridgeFundsNeeded;
              if (Math.abs(nominalBridgeGrowthRate - inflationRateDecimal) < 0.000001) {
                bridgeFundsNeeded = annualNeedAtRetirement * yearsUntilPenaltyFree;
              } else {
                bridgeFundsNeeded = annualNeedAtRetirement * (
                  (1 - Math.pow((1 + inflationRateDecimal) / (1 + nominalBridgeGrowthRate), yearsUntilPenaltyFree)) /
                  (nominalBridgeGrowthRate - inflationRateDecimal)
                );
              }

              const yearsToRetirement = Math.max(0, retirementAge - currentAge);
              const projectedAccessibleFunds = (taxableLiquidValue + totalRothContributions) * Math.pow(1 + bridgeGrowthRate, yearsToRetirement);
              const shortfall = Math.max(0, bridgeFundsNeeded - projectedAccessibleFunds);

              return (
                <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-sm text-amber-400 font-medium mb-2">
                    ⚠️ Early Retirement Warning (Before Age 59.5)
                  </p>
                  <p className="text-sm text-zinc-300">
                    Retiring at {retirementAge} means {yearsUntilPenaltyFree} years before penalty-free access to retirement account earnings.
                    You'll need <span className="font-bold text-amber-400">{formatNumber(bridgeFundsNeeded)}</span> in accessible funds (liquid taxable + Roth contributions) to cover {formatNumber(annualNeedAtRetirement)}/yr for {yearsUntilPenaltyFree} years.
                  </p>
                  <div className="text-xs text-zinc-400 mt-2 space-y-1">
                    <div>• Liquid Taxable (today): {formatNumber(taxableLiquidValue)}</div>
                    <div>• Roth Contributions (today): {formatNumber(totalRothContributions)}</div>
                    <div className="font-medium">• Projected Accessible at {retirementAge}: {formatNumber(projectedAccessibleFunds)}</div>
                    {totalRothContributions === 0 && taxFreeValue > 0 && (
                      <div className="text-amber-400 mt-1">⚠️ Set Roth contributions in Account settings for accurate early retirement planning</div>
                    )}
                  </div>
                  {shortfall > 0 ? (
                    <p className="text-sm text-rose-400 mt-2 font-semibold">
                      Shortfall: {formatNumber(shortfall)} — You may need to withdraw Roth earnings or tax-deferred funds early (incurring penalties).
                    </p>
                  ) : (
                    <p className="text-sm text-emerald-400 mt-2 font-semibold">
                      ✓ Sufficient accessible funds for early retirement bridge period!
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-6">Retirement Planning Settings</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Current Age</Label>
                <Input type="number" value={currentAge} onChange={(e) => setCurrentAge(parseInt(e.target.value) || 0)} className="bg-zinc-900 border-zinc-800" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400">Target Retirement Age</Label>
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
                <Label className="text-zinc-400">Retirement Spending</Label>
                <Input type="number" value={retirementAnnualSpending} onChange={(e) => setRetirementAnnualSpending(parseInt(e.target.value) || 0)} className="bg-zinc-900 border-zinc-800" />
              </div>
            </div>
            
            <div className="mt-4 space-y-2">
              <p className="text-xs text-zinc-500">
                💡 Your annual net cash flow of <span className="text-emerald-400 font-medium">{formatNumber(annualSavings)}</span> is calculated from your total income (from Budget) minus your current annual spending (from Settings).
                A positive value means you are saving. A negative value means you are drawing down.
              </p>
            </div>

            <div className="mt-6 p-4 rounded-xl bg-zinc-800/30">
              <Label className="text-zinc-300 font-medium mb-3 block">Withdrawal Strategy</Label>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <button
                  onClick={() => setWithdrawalStrategy('4percent')}
                  className={cn(
                    "p-4 rounded-lg border text-left transition-all",
                    withdrawalStrategy === '4percent' 
                      ? "bg-orange-500/20 border-orange-500/50" 
                      : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                  )}
                >
                  <p className={cn("font-medium text-sm", withdrawalStrategy === '4percent' ? "text-orange-400" : "text-zinc-200")}>4% Rule (Traditional)</p>
                  <p className="text-xs text-zinc-400 mt-1">Withdraw 4% of initial portfolio, adjust for inflation</p>
                </button>
                <button
                  onClick={() => setWithdrawalStrategy('dynamic')}
                  className={cn(
                    "p-4 rounded-lg border text-left transition-all",
                    withdrawalStrategy === 'dynamic' 
                      ? "bg-orange-500/20 border-orange-500/50" 
                      : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                  )}
                >
                  <p className={cn("font-medium text-sm", withdrawalStrategy === 'dynamic' ? "text-orange-400" : "text-zinc-200")}>Dynamic % of Portfolio</p>
                  <p className="text-xs text-zinc-400 mt-1">Withdraw {dynamicWithdrawalRate}% of current value each year</p>
                </button>
                <button
                  onClick={() => setWithdrawalStrategy('variable')}
                  className={cn(
                    "p-4 rounded-lg border text-left transition-all",
                    withdrawalStrategy === 'variable' 
                      ? "bg-orange-500/20 border-orange-500/50" 
                      : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                  )}
                >
                  <p className={cn("font-medium text-sm", withdrawalStrategy === 'variable' ? "text-orange-400" : "text-zinc-200")}>Income-Based</p>
                  <p className="text-xs text-zinc-400 mt-1">Withdraw exactly what you need ({formatNumber(retirementAnnualSpending)}/yr)</p>
                </button>
              </div>
              
              {withdrawalStrategy === 'dynamic' && (
                <div className="mt-4 p-3 rounded-lg bg-zinc-900/50">
                  <div className="flex justify-between mb-2">
                    <Label className="text-zinc-300 text-sm">Annual Withdrawal Rate</Label>
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
                <p className="text-sm text-zinc-400">At Retirement (Age {retirementAge})</p>
                <p className="text-2xl font-bold text-orange-400">{formatNumber(retirementValue, 2)}</p>
                <p className="text-xs text-zinc-500">Need: {formatNumber(requiredNestEgg)}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-400">Max Sustainable Spending</p>
                <p className="text-2xl font-bold text-emerald-400">{formatNumber(maxSustainableSpending)}/yr</p>
                <p className="text-xs text-zinc-500">{formatNumber(maxSustainableSpending / 12)}/mo (today's dollars)</p>
              </div>
              <div>
                <p className="text-sm text-zinc-400">At Age {lifeExpectancy}</p>
                <p className="text-2xl font-bold text-zinc-200">{formatNumber(endOfLifeValue, 2)}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-400">Spending at Retirement</p>
                <p className="text-2xl font-bold text-amber-400">{formatNumber(retirementAnnualSpending)}/yr</p>
                <p className="text-xs text-zinc-500">{formatNumber(retirementAnnualSpending / 12)}/mo today • inflates to {formatNumber(inflationAdjustedRetirementSpending)}/yr</p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="montecarlo" className="space-y-6">
          <div className="card-premium rounded-xl p-4 border border-zinc-800/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
              <Label className="text-zinc-300 text-sm">Success = Not Running Out of Money Through Age {lifeExpectancy}</Label>
              <p className="text-xs text-zinc-400">
                ${(retirementAnnualSpending || 0).toLocaleString()}/yr today → ${Math.round(inflationAdjustedRetirementSpending || 0).toLocaleString()}/yr at retirement ({inflationRate || 0}% inflation) for {yearsInRetirement} years
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Strategy: <span className="text-orange-400 font-semibold">
                  {withdrawalStrategy === '4percent' ? '4% Rule' : 
                   withdrawalStrategy === 'dynamic' ? `${dynamicWithdrawalRate}% Dynamic` : 'Income-Based'}
                </span> • BTC Model: <span className="text-orange-400 font-semibold">
                  {btcReturnModel === 'custom' ? `${btcCagr}%` : 
                   btcReturnModel === 'saylor24' ? 'Saylor Bitcoin24' : 
                   btcReturnModel === 'powerlaw' ? 'Power Law' : 'Conservative'}
                </span>
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
                <div className={cn(
                  "p-6 rounded-2xl mb-6 text-center",
                  successProbability >= 80 ? "bg-emerald-500/10 border border-emerald-500/30" :
                  successProbability >= 50 ? "bg-amber-500/10 border border-amber-500/30" :
                  "bg-rose-500/10 border border-rose-500/30"
                )}>
                  <p className="text-sm text-zinc-300 mb-2">
                    Probability of Not Running Out of Money Through Age {lifeExpectancy}
                  </p>
                  <p className={cn(
                    "text-5xl font-bold",
                    successProbability >= 80 ? "text-emerald-400" :
                    successProbability >= 50 ? "text-amber-400" :
                    "text-rose-400"
                  )}>
                    {successProbability?.toFixed(0)}%
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">
                    {withdrawalStrategy === '4percent' ? '4% Rule' : 
                     withdrawalStrategy === 'dynamic' ? `${dynamicWithdrawalRate || 5}% Dynamic` : `Income-Based ($${Math.round(inflationAdjustedRetirementSpending || 0).toLocaleString()}/yr)`} • {btcReturnModel === 'custom' ? `${btcCagr || 25}%` : btcReturnModel} BTC • BTC Vol: {getBtcVolatility(0).toFixed(0)}%→{getBtcVolatility(30).toFixed(0)}%
                  </p>
                  <p className="text-sm text-zinc-300 mt-2">
                    {successProbability >= 80 ? "Excellent! You're on track for your desired retirement lifestyle." :
                     successProbability >= 50 ? "Good progress, but consider increasing savings or adjusting expectations." :
                     "You may need to save more or adjust your retirement income goal."}
                  </p>
                </div>

                <div className="mb-6">
                  <h4 className="text-sm font-medium text-zinc-400 mb-3">Portfolio Value Over Time</h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={simulationResults}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="age" stroke="#71717a" fontSize={12} />
                        <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const data = payload[0]?.payload;
                            return (
                              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-sm">
                                <p className="font-semibold text-zinc-200 mb-2">Age {label}{data?.isRetired ? ' (Retired)' : ''}</p>
                                <div className="space-y-1">
                                  <div className="flex justify-between gap-4">
                                    <span className="text-emerald-400">Best Case (90%):</span>
                                    <span className="text-zinc-200">${(data?.p90 || 0).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between gap-4">
                                    <span className="text-orange-400">Most Likely:</span>
                                    <span className="text-zinc-200 font-semibold">${(data?.p50 || 0).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between gap-4">
                                    <span className="text-rose-400">Worst Case (10%):</span>
                                    <span className="text-zinc-200">${(data?.p10 || 0).toLocaleString()}</span>
                                  </div>
                                  {data?.isRetired && data?.withdrawal > 0 && (
                                    <div className="pt-2 mt-2 border-t border-zinc-700">
                                      <div className="flex justify-between gap-4">
                                        <span className="text-cyan-400">Annual Withdrawal:</span>
                                        <span className="text-zinc-200">${(data?.withdrawal || 0).toLocaleString()}/yr</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }}
                        />
                        <ReferenceLine x={retirementAge} stroke="#F7931A" strokeDasharray="5 5" label={{ value: 'Retire', fill: '#F7931A', fontSize: 10 }} />
                        <Area type="monotone" dataKey="p90" stroke="none" fill="#10b981" fillOpacity={0.15} name="p90" />
                        <Area type="monotone" dataKey="p75" stroke="none" fill="#10b981" fillOpacity={0.2} name="p75" />
                        <Area type="monotone" dataKey="p25" stroke="none" fill="#f59e0b" fillOpacity={0.2} name="p25" />
                        <Area type="monotone" dataKey="p10" stroke="none" fill="#ef4444" fillOpacity={0.15} name="p10" />
                        <Line type="monotone" dataKey="p50" stroke="#F7931A" strokeWidth={3} dot={false} name="p50" />
                        <Line type="monotone" dataKey="p10" stroke="#ef4444" strokeWidth={1} strokeDasharray="3 3" dot={false} name="p10" />
                        <Line type="monotone" dataKey="p90" stroke="#10b981" strokeWidth={1} strokeDasharray="3 3" dot={false} name="p90" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <p className="text-xs text-zinc-500">Worst Case (10%)</p>
                    <p className="text-xl font-bold text-rose-400">{formatNumber(simulationResults[simulationResults.length - 1]?.p10 || 0, 1)}</p>
                    <p className="text-xs text-zinc-600">at age {lifeExpectancy}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                    <p className="text-xs text-zinc-500">Most Likely</p>
                    <p className="text-xl font-bold text-orange-400">{formatNumber(simulationResults[simulationResults.length - 1]?.p50 || 0, 1)}</p>
                    <p className="text-xs text-zinc-600">at age {lifeExpectancy}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-xs text-zinc-500">Best Case (90%)</p>
                    <p className="text-xl font-bold text-emerald-400">{formatNumber(simulationResults[simulationResults.length - 1]?.p90 || 0, 1)}</p>
                    <p className="text-xs text-zinc-600">at age {lifeExpectancy}</p>
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-xl bg-zinc-800/30">
                  <h4 className="text-sm font-medium text-zinc-400 mb-3">At Retirement (Age {retirementAge})</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-zinc-500">Worst Case</p>
                      <p className="text-lg font-bold text-rose-400">{formatNumber(simulationResults[Math.min(retirementAge - currentAge, simulationResults.length - 1)]?.p10 || 0, 1)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Most Likely</p>
                      <p className="text-lg font-bold text-orange-400">{formatNumber(simulationResults[Math.min(retirementAge - currentAge, simulationResults.length - 1)]?.p50 || 0, 1)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Best Case</p>
                      <p className="text-lg font-bold text-emerald-400">{formatNumber(simulationResults[Math.min(retirementAge - currentAge, simulationResults.length - 1)]?.p90 || 0, 1)}</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-16">
                <Play className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-400">Click "Run" to generate Monte Carlo projections</p>
                <p className="text-xs text-zinc-500 mt-2">Set your retirement target above to see your success probability</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}