import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { Plus, Pencil, Trash2, Copy, TrendingUp, TrendingDown, Target, Sparkles, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SCENARIO_COLORS = ['#F7931A', '#3B82F6', '#10B981', '#A855F7', '#F43F5E', '#06B6D4'];

const SCENARIO_PRESETS = {
  optimistic: {
    name: 'Optimistic',
    btc_cagr_override: 40,
    stocks_cagr_override: 10,
    inflation_override: 2,
    income_growth_override: 5,
  },
  pessimistic: {
    name: 'Pessimistic',
    btc_cagr_override: 5,
    stocks_cagr_override: 4,
    inflation_override: 5,
    income_growth_override: 1,
  },
  early_retirement: {
    name: 'Early Retirement',
    retirement_age_override: 50,
    annual_retirement_spending_override: 80000,
  },
  market_crash: {
    name: 'Market Crash',
    market_crash_year: new Date().getFullYear() + 3,
    crash_severity_percent: 50,
  },
  bull_run: {
    name: 'Bull Run',
    outperformance_year: new Date().getFullYear() + 2,
    outperformance_gain_percent: 100,
  },
  aggressive_debt_payoff: {
    name: 'Aggressive Debt Payoff',
    debt_payoff_strategy: 'accelerated',
  },
};

const BTC_RETURN_MODELS = {
  custom: { name: 'Custom', getRate: (btcCagr) => btcCagr, shortDesc: null },
  saylor24: { 
    name: 'Saylor Bitcoin24', 
    shortDesc: '50%→20% declining',
    getRate: (btcCagr, yearFromNow) => Math.max(15, 45 - (yearFromNow * 1.5)) 
  },
  conservative: { 
    name: 'Conservative', 
    shortDesc: '10% flat',
    getRate: () => 10 
  },
};

const REBALANCING_OPTIONS = [
  { value: 'none', label: 'No Rebalancing', desc: 'Let allocations drift naturally' },
  { value: 'annual', label: 'Annual', desc: 'Rebalance once per year' },
  { value: 'quarterly', label: 'Quarterly', desc: 'Rebalance every 3 months' },
];

const DEBT_STRATEGIES = [
  { value: 'minimum', label: 'Minimum Payments', desc: 'Pay only required amounts' },
  { value: 'accelerated', label: 'Accelerated', desc: 'Extra payments to principal' },
  { value: 'avalanche', label: 'Avalanche', desc: 'Highest interest first' },
  { value: 'snowball', label: 'Snowball', desc: 'Smallest balance first' },
];

const ASSET_CLASSES = [
  { key: 'btc', label: 'Bitcoin', color: 'orange' },
  { key: 'stocks', label: 'Stocks', color: 'blue' },
  { key: 'real_estate', label: 'Real Estate', color: 'emerald' },
  { key: 'bonds', label: 'Bonds', color: 'purple' },
  { key: 'cash', label: 'Cash', color: 'cyan' },
];

export default function Scenarios() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingScenario, setEditingScenario] = useState(null);
  const [expandedScenario, setExpandedScenario] = useState(null);
  const [showComparison, setShowComparison] = useState(true);
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: '',
    description: '',
    scenario_type: 'custom',
    retirement_age_override: '',
    life_expectancy_override: '',
    btc_cagr_override: '',
    stocks_cagr_override: '',
    real_estate_cagr_override: '',
    bonds_cagr_override: '',
    inflation_override: '',
    income_growth_override: '',
    annual_retirement_spending_override: '',
    withdrawal_strategy_override: '',
    dynamic_withdrawal_rate_override: '',
    btc_return_model_override: '',
    market_crash_year: '',
    crash_severity_percent: '',
    outperformance_year: '',
    outperformance_gain_percent: '',
    btc_allocation_override: '',
    stocks_allocation_override: '',
    real_estate_allocation_override: '',
    bonds_allocation_override: '',
    cash_allocation_override: '',
    cash_cagr_override: '',
    other_cagr_override: '',
    rebalancing_strategy: 'none',
    debt_payoff_strategy: 'minimum',
    extra_debt_payment: '',
    linked_life_event_ids: [],
  });

  // Fetch BTC price
  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
      .then(r => r.json())
      .then(data => setBtcPrice(data.bitcoin.usd))
      .catch(() => setBtcPrice(97000));
  }, []);

  const currentPrice = btcPrice || 97000;

  // Queries
  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => base44.entities.Scenario.list(),
  });

  const { data: userSettings = [] } = useQuery({
    queryKey: ['userSettings'],
    queryFn: () => base44.entities.UserSettings.list(),
  });

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const { data: budgetItems = [] } = useQuery({
    queryKey: ['budgetItems'],
    queryFn: () => base44.entities.BudgetItem.list(),
  });

  const { data: lifeEvents = [] } = useQuery({
    queryKey: ['lifeEvents'],
    queryFn: () => base44.entities.LifeEvent.list(),
  });

  const { data: liabilities = [] } = useQuery({
    queryKey: ['liabilities'],
    queryFn: () => base44.entities.Liability.list(),
  });

  const settings = userSettings[0] || {};
  
  // Get BTC growth rate based on model
  const getBtcGrowthRate = (model, customCagr, yearFromNow) => {
    const modelConfig = BTC_RETURN_MODELS[model] || BTC_RETURN_MODELS.custom;
    return modelConfig.getRate(customCagr, yearFromNow);
  };

  // Base assumptions from UserSettings
  const baseAssumptions = {
    currentAge: settings.current_age || 35,
    retirementAge: settings.retirement_age || 65,
    lifeExpectancy: settings.life_expectancy || 90,
    btcCagr: settings.btc_cagr_assumption || 25,
    stocksCagr: settings.stocks_cagr || 7,
    realEstateCagr: settings.real_estate_cagr || 4,
    bondsCagr: settings.bonds_cagr || 3,
    cashCagr: settings.cash_cagr || 0,
    otherCagr: settings.other_cagr || 7,
    inflationRate: settings.inflation_rate || 3,
    incomeGrowth: settings.income_growth_rate || 3,
    retirementSpending: settings.annual_retirement_spending || 100000,
    withdrawalStrategy: settings.withdrawal_strategy || 'dynamic',
    dynamicWithdrawalRate: settings.dynamic_withdrawal_rate || 5,
    btcReturnModel: settings.btc_return_model || 'custom',
  };

  // Calculate portfolio values
  const btcValue = holdings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity * currentPrice, 0);
  const stocksValue = holdings.filter(h => h.asset_type === 'stocks').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const realEstateValue = holdings.filter(h => h.asset_type === 'real_estate').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const bondsValue = holdings.filter(h => h.asset_type === 'bonds').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const otherValue = holdings.filter(h => !['BTC'].includes(h.ticker) && !['stocks', 'real_estate', 'bonds'].includes(h.asset_type)).reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const totalValue = btcValue + stocksValue + realEstateValue + bondsValue + otherValue;

  // Calculate annual savings
  const freqMultiplier = { monthly: 12, weekly: 52, biweekly: 26, quarterly: 4, annual: 1, one_time: 0 };
  const monthlyIncome = budgetItems.filter(b => b.type === 'income' && b.is_active !== false).reduce((sum, b) => sum + (b.amount * (freqMultiplier[b.frequency] || 12) / 12), 0);
  const monthlyExpenses = budgetItems.filter(b => b.type === 'expense' && b.is_active !== false).reduce((sum, b) => sum + (b.amount * (freqMultiplier[b.frequency] || 12) / 12), 0);
  const annualSavings = Math.max(0, (monthlyIncome - monthlyExpenses) * 12);

  // Generate projection for a scenario
  const generateProjection = (scenario) => {
    const btcModel = scenario?.btc_return_model_override || baseAssumptions.btcReturnModel;
    const assumptions = {
      ...baseAssumptions,
      retirementAge: scenario?.retirement_age_override || baseAssumptions.retirementAge,
      lifeExpectancy: scenario?.life_expectancy_override || baseAssumptions.lifeExpectancy,
      btcCagr: scenario?.btc_cagr_override ?? baseAssumptions.btcCagr,
      stocksCagr: scenario?.stocks_cagr_override ?? baseAssumptions.stocksCagr,
      realEstateCagr: scenario?.real_estate_cagr_override ?? baseAssumptions.realEstateCagr,
      bondsCagr: scenario?.bonds_cagr_override ?? baseAssumptions.bondsCagr,
      cashCagr: scenario?.cash_cagr_override ?? baseAssumptions.cashCagr,
      otherCagr: scenario?.other_cagr_override ?? baseAssumptions.otherCagr,
      inflationRate: scenario?.inflation_override ?? baseAssumptions.inflationRate,
      incomeGrowth: scenario?.income_growth_override ?? baseAssumptions.incomeGrowth,
      retirementSpending: scenario?.annual_retirement_spending_override || baseAssumptions.retirementSpending,
      withdrawalStrategy: scenario?.withdrawal_strategy_override || baseAssumptions.withdrawalStrategy,
      dynamicWithdrawalRate: scenario?.dynamic_withdrawal_rate_override || baseAssumptions.dynamicWithdrawalRate,
      btcReturnModel: btcModel,
      btcAllocation: scenario?.btc_allocation_override,
      stocksAllocation: scenario?.stocks_allocation_override,
      realEstateAllocation: scenario?.real_estate_allocation_override,
      bondsAllocation: scenario?.bonds_allocation_override,
      cashAllocation: scenario?.cash_allocation_override,
      rebalancingStrategy: scenario?.rebalancing_strategy || 'none',
      debtPayoffStrategy: scenario?.debt_payoff_strategy || 'minimum',
      extraDebtPayment: scenario?.extra_debt_payment || 0,
    };

    const years = assumptions.lifeExpectancy - assumptions.currentAge;
    const data = [];
    const currentYear = new Date().getFullYear();

    let runningBtc = btcValue;
    let runningStocks = stocksValue;
    let runningRealEstate = realEstateValue;
    let runningBonds = bondsValue;
    let runningOther = otherValue;
    let runningSavings = 0;
    let initialRetirementWithdrawal = 0;
    
    // Track debt for accelerated payoff
    let runningDebt = liabilities.reduce((sum, l) => sum + (l.current_balance || 0), 0);
    const avgDebtInterestRate = liabilities.length > 0 
      ? liabilities.reduce((sum, l) => sum + (l.interest_rate || 0), 0) / liabilities.length 
      : 0;

    // Calculate initial total for allocation targets
    const initialTotal = btcValue + stocksValue + realEstateValue + bondsValue + otherValue;
    
    // Linked life events for this scenario
    const scenarioLifeEvents = scenario?.linked_life_event_ids?.length > 0
      ? lifeEvents.filter(e => scenario.linked_life_event_ids.includes(e.id))
      : [];

    for (let i = 0; i <= years; i++) {
      const year = currentYear + i;
      const isRetired = assumptions.currentAge + i >= assumptions.retirementAge;
      const yearsIntoRetirement = isRetired ? assumptions.currentAge + i - assumptions.retirementAge : 0;

      // Get dynamic BTC growth rate based on model
      const yearBtcGrowth = getBtcGrowthRate(assumptions.btcReturnModel, assumptions.btcCagr, i);

      // Check for market crash
      let crashMultiplier = 1;
      if (scenario?.market_crash_year === year && scenario?.crash_severity_percent) {
        crashMultiplier = 1 - (scenario.crash_severity_percent / 100);
      }
      
      // Check for market outperformance
      let outperformanceMultiplier = 1;
      if (scenario?.outperformance_year === year && scenario?.outperformance_gain_percent) {
        outperformanceMultiplier = 1 + (scenario.outperformance_gain_percent / 100);
      }

      // Apply life event impacts
      let lifeEventImpact = 0;
      scenarioLifeEvents.forEach(event => {
        if (event.year === year || (event.is_recurring && event.year <= year && year < event.year + (event.recurring_years || 1))) {
          const growthMultiplier = event.affects === 'income' 
            ? Math.pow(1 + assumptions.incomeGrowth / 100, Math.max(0, year - event.year))
            : 1;
          lifeEventImpact += event.amount * growthMultiplier;
        }
      });

      if (i > 0) {
        // Apply growth rates with market events
        runningBtc = runningBtc * (1 + yearBtcGrowth / 100) * crashMultiplier * outperformanceMultiplier;
        runningStocks = runningStocks * (1 + assumptions.stocksCagr / 100) * crashMultiplier * outperformanceMultiplier;
        runningRealEstate = runningRealEstate * (1 + assumptions.realEstateCagr / 100);
        runningBonds = runningBonds * (1 + assumptions.bondsCagr / 100);
        runningOther = runningOther * (1 + assumptions.otherCagr / 100) * crashMultiplier * outperformanceMultiplier;

        const blendedGrowthRate = (yearBtcGrowth * 0.3 + assumptions.stocksCagr * 0.7) / 100;
        runningSavings = runningSavings * (1 + blendedGrowthRate) * crashMultiplier * outperformanceMultiplier;
        
        // Apply debt interest (grows debt if not paid off)
        if (runningDebt > 0) {
          runningDebt = runningDebt * (1 + avgDebtInterestRate / 100);
        }

        // Rebalancing logic - check if any allocation is set
        const hasAllocations = assumptions.btcAllocation !== undefined || 
                               assumptions.stocksAllocation !== undefined ||
                               assumptions.realEstateAllocation !== undefined ||
                               assumptions.bondsAllocation !== undefined;
        
        const shouldRebalance = hasAllocations && (
          (assumptions.rebalancingStrategy === 'annual' && i % 1 === 0) ||
          (assumptions.rebalancingStrategy === 'quarterly' && i % 0.25 === 0)
        );
        
        if (shouldRebalance) {
          const totalAssets = runningBtc + runningStocks + runningRealEstate + runningBonds + runningOther;
          
          // Calculate current allocations
          const currentBtcPct = totalAssets > 0 ? (runningBtc / totalAssets) * 100 : 0;
          const currentStocksPct = totalAssets > 0 ? (runningStocks / totalAssets) * 100 : 0;
          const currentRealEstatePct = totalAssets > 0 ? (runningRealEstate / totalAssets) * 100 : 0;
          const currentBondsPct = totalAssets > 0 ? (runningBonds / totalAssets) * 100 : 0;
          
          // Use override if set, otherwise keep current allocation
          const targetBtcPct = assumptions.btcAllocation ?? currentBtcPct;
          const targetStocksPct = assumptions.stocksAllocation ?? currentStocksPct;
          const targetRealEstatePct = assumptions.realEstateAllocation ?? currentRealEstatePct;
          const targetBondsPct = assumptions.bondsAllocation ?? currentBondsPct;
          
          runningBtc = totalAssets * (targetBtcPct / 100);
          runningStocks = totalAssets * (targetStocksPct / 100);
          runningRealEstate = totalAssets * (targetRealEstatePct / 100);
          runningBonds = totalAssets * (targetBondsPct / 100);
          
          // Remaining goes to other
          const usedPct = targetBtcPct + targetStocksPct + targetRealEstatePct + targetBondsPct;
          runningOther = totalAssets * (Math.max(0, 100 - usedPct) / 100);
        }
      }

      if (!isRetired) {
        let yearSavings = annualSavings * Math.pow(1 + assumptions.incomeGrowth / 100, i);
        
        // Apply accelerated debt payoff strategies
        if (assumptions.debtPayoffStrategy !== 'minimum' && runningDebt > 0) {
          // Use specified extra payment amount, or default to 30% of savings
          const extraPayment = assumptions.extraDebtPayment > 0 
            ? assumptions.extraDebtPayment 
            : yearSavings * 0.3;
          const debtPayment = Math.min(extraPayment, runningDebt);
          runningDebt = Math.max(0, runningDebt - debtPayment);
          yearSavings -= debtPayment;
        }
        
        runningSavings += yearSavings;
      } else {
        let yearWithdrawal = 0;
        const total = runningBtc + runningStocks + runningRealEstate + runningBonds + runningOther + runningSavings;

        if (assumptions.withdrawalStrategy === '4percent') {
          if (yearsIntoRetirement === 0) {
            initialRetirementWithdrawal = total * 0.04;
          }
          yearWithdrawal = initialRetirementWithdrawal * Math.pow(1 + assumptions.inflationRate / 100, yearsIntoRetirement);
        } else if (assumptions.withdrawalStrategy === 'dynamic') {
          yearWithdrawal = total * (assumptions.dynamicWithdrawalRate / 100);
        } else {
          const yearsOfInflation = (assumptions.retirementAge - assumptions.currentAge) + yearsIntoRetirement;
          yearWithdrawal = assumptions.retirementSpending * Math.pow(1 + assumptions.inflationRate / 100, yearsOfInflation);
        }

        const totalForWithdrawal = runningBtc + runningStocks + runningRealEstate + runningBonds + runningOther + runningSavings;
        if (totalForWithdrawal > 0 && yearWithdrawal > 0) {
          const withdrawRatio = Math.min(1, yearWithdrawal / totalForWithdrawal);
          runningBtc -= runningBtc * withdrawRatio;
          runningStocks -= runningStocks * withdrawRatio;
          runningRealEstate -= runningRealEstate * withdrawRatio;
          runningBonds -= runningBonds * withdrawRatio;
          runningOther -= runningOther * withdrawRatio;
          runningSavings -= runningSavings * withdrawRatio;
        }
      }

      // Apply life event impact
      const totalBeforeEvent = runningBtc + runningStocks + runningRealEstate + runningBonds + runningOther + runningSavings;
      const total = Math.max(0, totalBeforeEvent + lifeEventImpact - runningDebt);

      data.push({
        age: assumptions.currentAge + i,
        year,
        total: Math.round(total),
        isRetired,
        btcGrowthRate: yearBtcGrowth,
      });
    }

    return { data, assumptions };
  };

  // Generate projections for all scenarios + base
  const allProjections = useMemo(() => {
    const projections = {
      base: generateProjection(null),
    };

    scenarios.forEach((scenario, index) => {
      projections[scenario.id] = {
        ...generateProjection(scenario),
        color: SCENARIO_COLORS[index % SCENARIO_COLORS.length],
        scenario,
      };
    });

    return projections;
  }, [scenarios, baseAssumptions, btcValue, stocksValue, realEstateValue, bondsValue, otherValue, annualSavings]);

  // Merge projections for comparison chart
  const comparisonData = useMemo(() => {
    const baseData = allProjections.base.data;
    return baseData.map((point, index) => {
      const merged = { age: point.age, year: point.year, base: point.total };
      scenarios.forEach(scenario => {
        const scenarioData = allProjections[scenario.id]?.data;
        if (scenarioData && scenarioData[index]) {
          merged[scenario.id] = scenarioData[index].total;
        }
      });
      return merged;
    });
  }, [allProjections, scenarios]);

  // Mutations
  const createScenario = useMutation({
    mutationFn: (data) => base44.entities.Scenario.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setFormOpen(false);
      resetForm();
    },
  });

  const updateScenario = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Scenario.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setFormOpen(false);
      setEditingScenario(null);
      resetForm();
    },
  });

  const deleteScenario = useMutation({
    mutationFn: (id) => base44.entities.Scenario.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scenarios'] }),
  });

  const resetForm = () => {
    setForm({
      name: '', description: '', scenario_type: 'custom',
      retirement_age_override: '', life_expectancy_override: '',
      btc_cagr_override: '', stocks_cagr_override: '', real_estate_cagr_override: '', bonds_cagr_override: '',
      inflation_override: '', income_growth_override: '', annual_retirement_spending_override: '',
      withdrawal_strategy_override: '', dynamic_withdrawal_rate_override: '', btc_return_model_override: '',
      market_crash_year: '', crash_severity_percent: '',
      outperformance_year: '', outperformance_gain_percent: '',
      btc_allocation_override: '', stocks_allocation_override: '', real_estate_allocation_override: '', bonds_allocation_override: '', cash_allocation_override: '', cash_cagr_override: '', other_cagr_override: '',
      rebalancing_strategy: 'none', debt_payoff_strategy: 'minimum', extra_debt_payment: '',
      linked_life_event_ids: [],
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...form,
      retirement_age_override: form.retirement_age_override ? parseInt(form.retirement_age_override) : null,
      life_expectancy_override: form.life_expectancy_override ? parseInt(form.life_expectancy_override) : null,
      btc_cagr_override: form.btc_cagr_override !== '' ? parseFloat(form.btc_cagr_override) : null,
      stocks_cagr_override: form.stocks_cagr_override !== '' ? parseFloat(form.stocks_cagr_override) : null,
      real_estate_cagr_override: form.real_estate_cagr_override !== '' ? parseFloat(form.real_estate_cagr_override) : null,
      bonds_cagr_override: form.bonds_cagr_override !== '' ? parseFloat(form.bonds_cagr_override) : null,
      inflation_override: form.inflation_override !== '' ? parseFloat(form.inflation_override) : null,
      income_growth_override: form.income_growth_override !== '' ? parseFloat(form.income_growth_override) : null,
      annual_retirement_spending_override: form.annual_retirement_spending_override ? parseFloat(form.annual_retirement_spending_override) : null,
      dynamic_withdrawal_rate_override: form.dynamic_withdrawal_rate_override !== '' ? parseFloat(form.dynamic_withdrawal_rate_override) : null,
      btc_return_model_override: form.btc_return_model_override || null,
      market_crash_year: form.market_crash_year ? parseInt(form.market_crash_year) : null,
      crash_severity_percent: form.crash_severity_percent !== '' ? parseFloat(form.crash_severity_percent) : null,
      outperformance_year: form.outperformance_year ? parseInt(form.outperformance_year) : null,
      outperformance_gain_percent: form.outperformance_gain_percent !== '' ? parseFloat(form.outperformance_gain_percent) : null,
      btc_allocation_override: form.btc_allocation_override !== '' ? parseFloat(form.btc_allocation_override) : null,
      stocks_allocation_override: form.stocks_allocation_override !== '' ? parseFloat(form.stocks_allocation_override) : null,
      real_estate_allocation_override: form.real_estate_allocation_override !== '' ? parseFloat(form.real_estate_allocation_override) : null,
      bonds_allocation_override: form.bonds_allocation_override !== '' ? parseFloat(form.bonds_allocation_override) : null,
      cash_allocation_override: form.cash_allocation_override !== '' ? parseFloat(form.cash_allocation_override) : null,
      cash_cagr_override: form.cash_cagr_override !== '' ? parseFloat(form.cash_cagr_override) : null,
      other_cagr_override: form.other_cagr_override !== '' ? parseFloat(form.other_cagr_override) : null,
      rebalancing_strategy: form.rebalancing_strategy || 'none',
      debt_payoff_strategy: form.debt_payoff_strategy || 'minimum',
      extra_debt_payment: form.extra_debt_payment !== '' ? parseFloat(form.extra_debt_payment) : null,
      linked_life_event_ids: form.linked_life_event_ids || [],
    };

    if (editingScenario) {
      updateScenario.mutate({ id: editingScenario.id, data });
    } else {
      createScenario.mutate(data);
    }
  };

  const handleEdit = (scenario) => {
    setEditingScenario(scenario);
    setForm({
      name: scenario.name || '',
      description: scenario.description || '',
      scenario_type: scenario.scenario_type || 'custom',
      retirement_age_override: scenario.retirement_age_override || '',
      life_expectancy_override: scenario.life_expectancy_override || '',
      btc_cagr_override: scenario.btc_cagr_override ?? '',
      stocks_cagr_override: scenario.stocks_cagr_override ?? '',
      real_estate_cagr_override: scenario.real_estate_cagr_override ?? '',
      bonds_cagr_override: scenario.bonds_cagr_override ?? '',
      inflation_override: scenario.inflation_override ?? '',
      income_growth_override: scenario.income_growth_override ?? '',
      annual_retirement_spending_override: scenario.annual_retirement_spending_override || '',
      withdrawal_strategy_override: scenario.withdrawal_strategy_override || '',
      dynamic_withdrawal_rate_override: scenario.dynamic_withdrawal_rate_override ?? '',
      btc_return_model_override: scenario.btc_return_model_override || '',
      market_crash_year: scenario.market_crash_year || '',
      crash_severity_percent: scenario.crash_severity_percent ?? '',
      outperformance_year: scenario.outperformance_year || '',
      outperformance_gain_percent: scenario.outperformance_gain_percent ?? '',
      btc_allocation_override: scenario.btc_allocation_override ?? '',
      stocks_allocation_override: scenario.stocks_allocation_override ?? '',
      real_estate_allocation_override: scenario.real_estate_allocation_override ?? '',
      bonds_allocation_override: scenario.bonds_allocation_override ?? '',
      cash_allocation_override: scenario.cash_allocation_override ?? '',
      cash_cagr_override: scenario.cash_cagr_override ?? '',
      other_cagr_override: scenario.other_cagr_override ?? '',
      rebalancing_strategy: scenario.rebalancing_strategy || 'none',
      debt_payoff_strategy: scenario.debt_payoff_strategy || 'minimum',
      extra_debt_payment: scenario.extra_debt_payment ?? '',
      linked_life_event_ids: scenario.linked_life_event_ids || [],
    });
    setFormOpen(true);
  };

  const handleDuplicate = (scenario) => {
    const duplicated = {
      ...scenario,
      name: `${scenario.name} (Copy)`,
    };
    delete duplicated.id;
    delete duplicated.created_date;
    delete duplicated.updated_date;
    createScenario.mutate(duplicated);
  };

  const applyPreset = (presetKey) => {
    const preset = SCENARIO_PRESETS[presetKey];
    if (preset) {
      setForm(prev => ({
        ...prev,
        name: preset.name,
        scenario_type: presetKey === 'optimistic' ? 'optimistic' : presetKey === 'pessimistic' ? 'pessimistic' : 'custom',
        ...preset,
      }));
    }
  };

  const formatNumber = (num) => {
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}k`;
    return `$${num.toLocaleString()}`;
  };

  const baseRetirementValue = allProjections.base.data.find(d => d.age === baseAssumptions.retirementAge)?.total || 0;
  const baseEndValue = allProjections.base.data[allProjections.base.data.length - 1]?.total || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Scenario Planning</h1>
          <p className="text-zinc-500 mt-1">Compare different financial futures side by side</p>
        </div>
        <Button onClick={() => { resetForm(); setEditingScenario(null); setFormOpen(true); }} className="brand-gradient text-white font-semibold">
          <Plus className="w-4 h-4 mr-2" />
          New Scenario
        </Button>
      </div>

      {/* Base Case Summary */}
      <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Target className="w-5 h-5 text-orange-400" />
            Base Case (Current Settings)
          </h3>
          <Link to={createPageUrl('FinancialPlan')}>
            <Button variant="outline" size="sm" className="bg-transparent border-zinc-700">
              <ExternalLink className="w-4 h-4 mr-2" />
              Edit in Projections
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="p-3 rounded-xl bg-zinc-800/30">
            <p className="text-xs text-zinc-500">Retire at</p>
            <p className="text-lg font-bold text-zinc-200">{baseAssumptions.retirementAge}</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/30">
            <p className="text-xs text-zinc-500">BTC CAGR</p>
            <p className="text-lg font-bold text-orange-400">
              {baseAssumptions.btcReturnModel && baseAssumptions.btcReturnModel !== 'custom' && BTC_RETURN_MODELS[baseAssumptions.btcReturnModel]?.shortDesc
                ? BTC_RETURN_MODELS[baseAssumptions.btcReturnModel].shortDesc
                : `${baseAssumptions.btcCagr}%`}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/30">
            <p className="text-xs text-zinc-500">Stocks CAGR</p>
            <p className="text-lg font-bold text-blue-400">{baseAssumptions.stocksCagr}%</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/30">
            <p className="text-xs text-zinc-500">Inflation</p>
            <p className="text-lg font-bold text-rose-400">{baseAssumptions.inflationRate}%</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/30">
            <p className="text-xs text-zinc-500">At Retirement</p>
            <p className="text-lg font-bold text-emerald-400">{formatNumber(baseRetirementValue)}</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/30">
            <p className="text-xs text-zinc-500">At {baseAssumptions.lifeExpectancy}</p>
            <p className="text-lg font-bold text-zinc-200">{formatNumber(baseEndValue)}</p>
          </div>
        </div>
      </div>

      {/* Comparison Chart */}
      {scenarios.length > 0 && (
        <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-400" />
              Scenario Comparison
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setShowComparison(!showComparison)}>
              {showComparison ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
          
          {showComparison && (
            <>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={comparisonData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="age" stroke="#71717a" fontSize={12} />
                    <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                      formatter={(value, name) => {
                        const label = name === 'base' ? 'Base Case' : scenarios.find(s => s.id === name)?.name || name;
                        return [formatNumber(value), label];
                      }}
                      labelFormatter={(age) => `Age ${age}`}
                    />
                    <Legend formatter={(value) => value === 'base' ? 'Base Case' : scenarios.find(s => s.id === value)?.name || value} />
                    <ReferenceLine x={baseAssumptions.retirementAge} stroke="#F7931A" strokeDasharray="5 5" />
                    <Line type="monotone" dataKey="base" stroke="#71717a" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                    {scenarios.map((scenario, index) => (
                      <Line
                        key={scenario.id}
                        type="monotone"
                        dataKey={scenario.id}
                        stroke={SCENARIO_COLORS[index % SCENARIO_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-4 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-0.5 bg-zinc-500" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #71717a 0, #71717a 5px, transparent 5px, transparent 10px)' }} />
                  <span className="text-sm text-zinc-400">Base Case</span>
                </div>
                {scenarios.map((scenario, index) => (
                  <div key={scenario.id} className="flex items-center gap-2">
                    <div className="w-6 h-0.5" style={{ backgroundColor: SCENARIO_COLORS[index % SCENARIO_COLORS.length] }} />
                    <span className="text-sm text-zinc-400">{scenario.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Scenarios List */}
      <div className="space-y-4">
        <h3 className="font-semibold">Your Scenarios</h3>
        
        {scenarios.length === 0 ? (
          <div className="card-premium rounded-2xl p-12 text-center border border-zinc-800/50">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 mx-auto flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-orange-400" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Scenarios Yet</h3>
            <p className="text-zinc-500 mb-6 max-w-sm mx-auto">Create scenarios to explore different financial futures and compare outcomes</p>
            <Button onClick={() => setFormOpen(true)} className="brand-gradient text-white font-semibold">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Scenario
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {scenarios.map((scenario, index) => {
              const projection = allProjections[scenario.id];
              const retirementAge = scenario.retirement_age_override || baseAssumptions.retirementAge;
              const retirementValue = projection?.data.find(d => d.age === retirementAge)?.total || 0;
              const endValue = projection?.data[projection?.data.length - 1]?.total || 0;
              const diffFromBase = endValue - baseEndValue;
              const isExpanded = expandedScenario === scenario.id;

              return (
                <div
                  key={scenario.id}
                  className="card-premium rounded-xl border border-zinc-800/50 overflow-hidden"
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3 h-12 rounded-full"
                          style={{ backgroundColor: SCENARIO_COLORS[index % SCENARIO_COLORS.length] }}
                        />
                        <div>
                          <h4 className="font-semibold text-lg">{scenario.name}</h4>
                          {scenario.description && (
                            <p className="text-sm text-zinc-500 mt-0.5">{scenario.description}</p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {scenario.retirement_age_override && (
                              <Badge variant="outline" className="border-zinc-600 text-zinc-400">
                                Retire at {scenario.retirement_age_override}
                              </Badge>
                            )}
                            {(scenario.btc_cagr_override !== null && scenario.btc_cagr_override !== undefined) || scenario.btc_return_model_override ? (
                              <Badge variant="outline" className="border-orange-500/30 text-orange-400">
                                BTC {scenario.btc_return_model_override && scenario.btc_return_model_override !== 'custom' && BTC_RETURN_MODELS[scenario.btc_return_model_override]?.shortDesc
                                  ? BTC_RETURN_MODELS[scenario.btc_return_model_override].shortDesc
                                  : `${scenario.btc_cagr_override ?? baseAssumptions.btcCagr}%`}
                              </Badge>
                            ) : null}
                            {scenario.stocks_cagr_override !== null && scenario.stocks_cagr_override !== undefined && (
                              <Badge variant="outline" className="border-blue-500/30 text-blue-400">
                                Stocks {scenario.stocks_cagr_override}%
                              </Badge>
                            )}
                            {scenario.inflation_override !== null && scenario.inflation_override !== undefined && (
                              <Badge variant="outline" className="border-rose-500/30 text-rose-400">
                                Inflation {scenario.inflation_override}%
                              </Badge>
                            )}
                            {scenario.market_crash_year && (
                              <Badge variant="outline" className="border-red-500/30 text-red-400">
                                Crash in {scenario.market_crash_year}
                              </Badge>
                            )}
                            {scenario.outperformance_year && (
                              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                                Bull run {scenario.outperformance_year}
                              </Badge>
                            )}
                            {scenario.rebalancing_strategy && scenario.rebalancing_strategy !== 'none' && (
                              <Badge variant="outline" className="border-purple-500/30 text-purple-400">
                                {scenario.rebalancing_strategy} rebalance
                              </Badge>
                            )}
                            {scenario.debt_payoff_strategy && scenario.debt_payoff_strategy !== 'minimum' && (
                              <Badge variant="outline" className="border-cyan-500/30 text-cyan-400">
                                {scenario.debt_payoff_strategy} debt
                              </Badge>
                            )}
                            {scenario.linked_life_event_ids?.length > 0 && (
                              <Badge variant="outline" className="border-amber-500/30 text-amber-400">
                                {scenario.linked_life_event_ids.length} life event(s)
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleDuplicate(scenario)}>
                          <Copy className="w-4 h-4 text-zinc-400" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(scenario)}>
                          <Pencil className="w-4 h-4 text-zinc-400" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteScenario.mutate(scenario.id)}>
                          <Trash2 className="w-4 h-4 text-zinc-400" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div className="p-3 rounded-lg bg-zinc-800/30">
                        <p className="text-xs text-zinc-500">At Retirement</p>
                        <p className="text-lg font-bold text-emerald-400">{formatNumber(retirementValue)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-zinc-800/30">
                        <p className="text-xs text-zinc-500">End of Life</p>
                        <p className="text-lg font-bold text-zinc-200">{formatNumber(endValue)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-zinc-800/30">
                        <p className="text-xs text-zinc-500">vs Base Case</p>
                        <p className={cn("text-lg font-bold flex items-center gap-1", diffFromBase >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {diffFromBase >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          {formatNumber(Math.abs(diffFromBase))}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedScenario(isExpanded ? null : scenario.id)}
                      className="w-full mt-4 text-zinc-500"
                    >
                      {isExpanded ? 'Hide Details' : 'Show Details'}
                      {isExpanded ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-zinc-800/50 pt-4">
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={projection?.data || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="age" stroke="#71717a" fontSize={10} />
                            <YAxis stroke="#71717a" fontSize={10} tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                              formatter={(value) => [formatNumber(value), 'Portfolio']}
                              labelFormatter={(age) => `Age ${age}`}
                            />
                            <ReferenceLine x={retirementAge} stroke="#F7931A" strokeDasharray="5 5" />
                            <Line
                              type="monotone"
                              dataKey="total"
                              stroke={SCENARIO_COLORS[index % SCENARIO_COLORS.length]}
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingScenario ? 'Edit Scenario' : 'Create New Scenario'}</DialogTitle>
          </DialogHeader>

          {/* Presets */}
          {!editingScenario && (
            <div className="mb-4">
              <Label className="text-zinc-400 text-sm mb-2 block">Quick Start from Preset</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SCENARIO_PRESETS).map(([key, preset]) => (
                  <Button key={key} variant="outline" size="sm" onClick={() => applyPreset(key)} className="bg-transparent border-zinc-700">
                    {preset.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Scenario Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Early Retirement, Bear Market..."
                  className="bg-zinc-800 border-zinc-700"
                  required
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe this scenario..."
                  className="bg-zinc-800 border-zinc-700"
                  rows={2}
                />
              </div>
            </div>

            {/* Retirement Settings */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-zinc-300">Retirement Settings</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Retirement Age</Label>
                  <Input
                    type="number"
                    value={form.retirement_age_override}
                    onChange={(e) => setForm({ ...form, retirement_age_override: e.target.value })}
                    placeholder={baseAssumptions.retirementAge.toString()}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Life Expectancy</Label>
                  <Input
                    type="number"
                    value={form.life_expectancy_override}
                    onChange={(e) => setForm({ ...form, life_expectancy_override: e.target.value })}
                    placeholder={baseAssumptions.lifeExpectancy.toString()}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Retirement Spending</Label>
                  <Input
                    type="number"
                    value={form.annual_retirement_spending_override}
                    onChange={(e) => setForm({ ...form, annual_retirement_spending_override: e.target.value })}
                    placeholder={baseAssumptions.retirementSpending.toString()}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </div>
            </div>

            {/* Growth Rates */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-zinc-300">Growth Rate Assumptions</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-zinc-400 text-xs">Bitcoin CAGR</Label>
                    <span className="text-orange-400 text-xs font-medium">{form.btc_cagr_override !== '' ? form.btc_cagr_override : baseAssumptions.btcCagr}%</span>
                  </div>
                  <Slider
                    value={[form.btc_cagr_override !== '' ? parseFloat(form.btc_cagr_override) : baseAssumptions.btcCagr]}
                    onValueChange={([v]) => setForm({ ...form, btc_cagr_override: v })}
                    min={-20}
                    max={100}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-zinc-400 text-xs">Stocks CAGR</Label>
                    <span className="text-blue-400 text-xs font-medium">{form.stocks_cagr_override !== '' ? form.stocks_cagr_override : baseAssumptions.stocksCagr}%</span>
                  </div>
                  <Slider
                    value={[form.stocks_cagr_override !== '' ? parseFloat(form.stocks_cagr_override) : baseAssumptions.stocksCagr]}
                    onValueChange={([v]) => setForm({ ...form, stocks_cagr_override: v })}
                    min={-10}
                    max={20}
                    step={0.5}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-zinc-400 text-xs">Real Estate CAGR</Label>
                    <span className="text-emerald-400 text-xs font-medium">{form.real_estate_cagr_override !== '' ? form.real_estate_cagr_override : baseAssumptions.realEstateCagr}%</span>
                  </div>
                  <Slider
                    value={[form.real_estate_cagr_override !== '' ? parseFloat(form.real_estate_cagr_override) : baseAssumptions.realEstateCagr]}
                    onValueChange={([v]) => setForm({ ...form, real_estate_cagr_override: v })}
                    min={-5}
                    max={15}
                    step={0.5}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-zinc-400 text-xs">Bonds CAGR</Label>
                    <span className="text-purple-400 text-xs font-medium">{form.bonds_cagr_override !== '' ? form.bonds_cagr_override : baseAssumptions.bondsCagr}%</span>
                  </div>
                  <Slider
                    value={[form.bonds_cagr_override !== '' ? parseFloat(form.bonds_cagr_override) : baseAssumptions.bondsCagr]}
                    onValueChange={([v]) => setForm({ ...form, bonds_cagr_override: v })}
                    min={0}
                    max={10}
                    step={0.5}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-zinc-400 text-xs">Cash/Savings CAGR</Label>
                    <span className="text-cyan-400 text-xs font-medium">{form.cash_cagr_override !== '' ? form.cash_cagr_override : baseAssumptions.cashCagr}%</span>
                  </div>
                  <Slider
                    value={[form.cash_cagr_override !== '' ? parseFloat(form.cash_cagr_override) : baseAssumptions.cashCagr]}
                    onValueChange={([v]) => setForm({ ...form, cash_cagr_override: v })}
                    min={0}
                    max={10}
                    step={0.5}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-zinc-400 text-xs">Other Assets CAGR</Label>
                    <span className="text-zinc-400 text-xs font-medium">{form.other_cagr_override !== '' ? form.other_cagr_override : baseAssumptions.otherCagr}%</span>
                  </div>
                  <Slider
                    value={[form.other_cagr_override !== '' ? parseFloat(form.other_cagr_override) : baseAssumptions.otherCagr]}
                    onValueChange={([v]) => setForm({ ...form, other_cagr_override: v })}
                    min={-10}
                    max={20}
                    step={0.5}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-zinc-400 text-xs">Inflation Rate</Label>
                    <span className="text-rose-400 text-xs font-medium">{form.inflation_override !== '' ? form.inflation_override : baseAssumptions.inflationRate}%</span>
                  </div>
                  <Slider
                    value={[form.inflation_override !== '' ? parseFloat(form.inflation_override) : baseAssumptions.inflationRate]}
                    onValueChange={([v]) => setForm({ ...form, inflation_override: v })}
                    min={0}
                    max={15}
                    step={0.5}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-zinc-400 text-xs">Income Growth</Label>
                    <span className="text-amber-400 text-xs font-medium">{form.income_growth_override !== '' ? form.income_growth_override : baseAssumptions.incomeGrowth}%</span>
                  </div>
                  <Slider
                    value={[form.income_growth_override !== '' ? parseFloat(form.income_growth_override) : baseAssumptions.incomeGrowth]}
                    onValueChange={([v]) => setForm({ ...form, income_growth_override: v })}
                    min={0}
                    max={10}
                    step={0.5}
                  />
                </div>
              </div>
            </div>

            {/* BTC Return Model */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-zinc-300">BTC Return Model</h4>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(BTC_RETURN_MODELS).map(([key, model]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm({ ...form, btc_return_model_override: key })}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-all",
                      form.btc_return_model_override === key
                        ? "bg-orange-500/20 border-orange-500/50 text-orange-300"
                        : "bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:border-zinc-600"
                    )}
                  >
                    <p className="font-medium text-sm">{model.name}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500">Leave unselected to use base case model from settings</p>
            </div>

            {/* Market Events */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-zinc-300">Market Events (Optional)</h4>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Market Crash Year</Label>
                  <Input
                    type="number"
                    value={form.market_crash_year}
                    onChange={(e) => setForm({ ...form, market_crash_year: e.target.value })}
                    placeholder="e.g., 2028"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Crash Severity (%)</Label>
                  <Input
                    type="number"
                    value={form.crash_severity_percent}
                    onChange={(e) => setForm({ ...form, crash_severity_percent: e.target.value })}
                    placeholder="e.g., 50"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Outperformance Year</Label>
                  <Input
                    type="number"
                    value={form.outperformance_year}
                    onChange={(e) => setForm({ ...form, outperformance_year: e.target.value })}
                    placeholder="e.g., 2026"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">Outperformance Gain (%)</Label>
                  <Input
                    type="number"
                    value={form.outperformance_gain_percent}
                    onChange={(e) => setForm({ ...form, outperformance_gain_percent: e.target.value })}
                    placeholder="e.g., 100"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </div>
            </div>

            {/* Asset Allocation & Rebalancing */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-zinc-300">Asset Allocation & Rebalancing</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">BTC (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={form.btc_allocation_override}
                    onChange={(e) => setForm({ ...form, btc_allocation_override: e.target.value })}
                    placeholder="Current"
                    className="bg-zinc-800 border-zinc-700 h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Stocks (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={form.stocks_allocation_override}
                    onChange={(e) => setForm({ ...form, stocks_allocation_override: e.target.value })}
                    placeholder="Current"
                    className="bg-zinc-800 border-zinc-700 h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Real Estate (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={form.real_estate_allocation_override}
                    onChange={(e) => setForm({ ...form, real_estate_allocation_override: e.target.value })}
                    placeholder="Current"
                    className="bg-zinc-800 border-zinc-700 h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Bonds (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={form.bonds_allocation_override}
                    onChange={(e) => setForm({ ...form, bonds_allocation_override: e.target.value })}
                    placeholder="Current"
                    className="bg-zinc-800 border-zinc-700 h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Cash (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={form.cash_allocation_override}
                    onChange={(e) => setForm({ ...form, cash_allocation_override: e.target.value })}
                    placeholder="Current"
                    className="bg-zinc-800 border-zinc-700 h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Rebalancing</Label>
                  <Select value={form.rebalancing_strategy} onValueChange={(v) => setForm({ ...form, rebalancing_strategy: v })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      {REBALANCING_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-zinc-500">Leave empty to use current allocation. Total should equal 100% (remainder goes to "Other").</p>
            </div>

            {/* Debt Payoff Strategy */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-zinc-300">Debt Payoff Strategy</h4>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {DEBT_STRATEGIES.map(strategy => (
                  <button
                    key={strategy.value}
                    type="button"
                    onClick={() => setForm({ ...form, debt_payoff_strategy: strategy.value })}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-all",
                      form.debt_payoff_strategy === strategy.value
                        ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                        : "bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:border-zinc-600"
                    )}
                  >
                    <p className="font-medium text-sm">{strategy.label}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{strategy.desc}</p>
                  </button>
                ))}
              </div>
              {form.debt_payoff_strategy !== 'minimum' && (
                <div className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-700">
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-xs">Extra Annual Payment to Debt ($)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.extra_debt_payment}
                      onChange={(e) => setForm({ ...form, extra_debt_payment: e.target.value })}
                      placeholder="Leave empty for 30% of savings"
                      className="bg-zinc-800 border-zinc-700"
                    />
                    <p className="text-xs text-zinc-500">Specify how much extra you'll pay annually toward debt. If empty, defaults to 30% of annual savings.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Life Events Integration */}
            {lifeEvents.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-zinc-300">Include Life Events</h4>
                <p className="text-xs text-zinc-500">Select life events to include in this scenario's projections. Life events model changes to income, expenses, or assets at specific years.</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {lifeEvents.map(event => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => {
                        const current = form.linked_life_event_ids || [];
                        const updated = current.includes(event.id)
                          ? current.filter(id => id !== event.id)
                          : [...current, event.id];
                        setForm({ ...form, linked_life_event_ids: updated });
                      }}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all flex items-center gap-3",
                        (form.linked_life_event_ids || []).includes(event.id)
                          ? "bg-amber-500/20 border-amber-500/50"
                          : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                      )}
                    >
                      <div className={cn(
                        "w-3 h-3 rounded border-2",
                        (form.linked_life_event_ids || []).includes(event.id) ? "bg-amber-400 border-amber-400" : "border-zinc-600"
                      )} />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{event.name}</p>
                        <p className="text-xs text-zinc-500">{event.year} • {event.amount >= 0 ? '+' : ''}{event.amount?.toLocaleString()}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="bg-transparent border-zinc-700">
                Cancel
              </Button>
              <Button type="submit" className="brand-gradient text-white font-semibold">
                {editingScenario ? 'Update Scenario' : 'Create Scenario'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}