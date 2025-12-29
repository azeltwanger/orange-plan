import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  estimateRetirementWithdrawalTaxes,
  getTaxDataForYear
} from '@/components/tax/taxCalculations';
import { get401kLimit, getRothIRALimit, getHSALimit, getTaxConfigForYear } from '@/components/shared/taxConfig';
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
    lifeEvents = [],
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
    let ranOutOfMoney = false;

    const path = [startingPortfolio];
    const withdrawalPath = [0];
    const currentSimYear = new Date().getFullYear();

    for (let year = 1; year <= years; year++) {
      const isRetired = year > yearsToRetirement;
      const yearsIntoRetirement = isRetired ? year - yearsToRetirement : 0;
      const simulationAbsoluteYear = currentSimYear + year;

      let activeIncomeAdjustment = 0;
      let activeExpenseAdjustment = 0;
      
      lifeEvents.forEach(event => {
        if (event.event_type === 'income_change') {
          const eventEndYear = event.year + (event.is_recurring ? (event.recurring_years || 1) : 1);
          const isActive = simulationAbsoluteYear >= event.year && simulationAbsoluteYear < eventEndYear;
          if (isActive) activeIncomeAdjustment += event.amount;
        }
        if (event.event_type === 'expense_change') {
          const eventEndYear = event.year + (event.is_recurring ? (event.recurring_years || 1) : 1);
          const isActive = simulationAbsoluteYear >= event.year && simulationAbsoluteYear < eventEndYear;
          if (isActive) activeExpenseAdjustment += event.amount;
        }
        if (event.event_type === 'home_purchase' && event.year <= simulationAbsoluteYear && event.monthly_expense_impact > 0) {
          activeExpenseAdjustment += event.monthly_expense_impact * 12;
        }
      });

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

      if (!ranOutOfMoney) {
        runningTaxable = Math.max(0, runningTaxable * (1 + portfolioReturn));
        runningTaxDeferred = Math.max(0, runningTaxDeferred * (1 + portfolioReturn));
        runningTaxFree = Math.max(0, runningTaxFree * (1 + portfolioReturn));
      }

      let yearWithdrawal = 0;

      if (!isRetired) {
        const adjustedAnnualSavings = annualSavings + activeIncomeAdjustment - activeExpenseAdjustment;
        const yearNetCashFlow = adjustedAnnualSavings * Math.pow(1 + incomeGrowth / 100, year);
        runningTaxable += yearNetCashFlow;
      } else {
        yearWithdrawal = retirementAnnualSpending * Math.pow(1 + inflationRate / 100, yearsToRetirement + yearsIntoRetirement);

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

        if (runningTaxable + runningTaxDeferred + runningTaxFree <= 0) {
          ranOutOfMoney = true;
        }
      }

      const totalMC = runningTaxable + runningTaxDeferred + runningTaxFree;
      path.push(Math.max(0, totalMC));
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
  const [grossAnnualIncome, setGrossAnnualIncome] = useState(100000);

  const [btcReturnModel, setBtcReturnModel] = useState('custom');
  const [filingStatus, setFilingStatus] = useState('single');
  const [otherRetirementIncome, setOtherRetirementIncome] = useState(0);
  const [socialSecurityStartAge, setSocialSecurityStartAge] = useState(67);
  const [socialSecurityAmount, setSocialSecurityAmount] = useState(0);

  const [contribution401k, setContribution401k] = useState(0);
  const [employer401kMatch, setEmployer401kMatch] = useState(0);
  const [contributionRothIRA, setContributionRothIRA] = useState(0);
  const [contributionHSA, setContributionHSA] = useState(0);
  const [hsaFamilyCoverage, setHsaFamilyCoverage] = useState(false);

  const [autoTopUpBtcCollateral, setAutoTopUpBtcCollateral] = useState(true);
  const [btcTopUpTriggerLtv, setBtcTopUpTriggerLtv] = useState(70);
  const [btcTopUpTargetLtv, setBtcTopUpTargetLtv] = useState(50);

  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [runSimulation, setRunSimulation] = useState(false);
  const [simulationResults, setSimulationResults] = useState(null);
  const [successProbability, setSuccessProbability] = useState(null);

  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [lockedTooltipData, setLockedTooltipData] = useState(null);
  const chartContainerRef = useRef(null);

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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (lockedTooltipData && chartContainerRef.current && !chartContainerRef.current.contains(event.target)) {
        setLockedTooltipData(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [lockedTooltipData]);

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

  const { data: collateralizedLoans = [] } = useQuery({
    queryKey: ['collateralizedLoans'],
    queryFn: () => base44.entities.CollateralizedLoan.list(),
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
      if (settings.btc_return_model !== undefined) setBtcReturnModel(settings.btc_return_model);
      if (settings.other_retirement_income !== undefined) setOtherRetirementIncome(settings.other_retirement_income);
      if (settings.social_security_start_age !== undefined) setSocialSecurityStartAge(settings.social_security_start_age);
      if (settings.social_security_amount !== undefined) setSocialSecurityAmount(settings.social_security_amount);
      if (settings.gross_annual_income !== undefined) setGrossAnnualIncome(settings.gross_annual_income);
      if (settings.contribution_401k !== undefined) setContribution401k(settings.contribution_401k);
      if (settings.employer_401k_match !== undefined) setEmployer401kMatch(settings.employer_401k_match);
      if (settings.contribution_roth_ira !== undefined) setContributionRothIRA(settings.contribution_roth_ira);
      if (settings.contribution_hsa !== undefined) setContributionHSA(settings.contribution_hsa);
      if (settings.hsa_family_coverage !== undefined) setHsaFamilyCoverage(settings.hsa_family_coverage);
      if (settings.filing_status !== undefined) setFilingStatus(settings.filing_status);
      if (settings.auto_top_up_btc_collateral !== undefined) setAutoTopUpBtcCollateral(settings.auto_top_up_btc_collateral);
      if (settings.btc_top_up_trigger_ltv !== undefined) setBtcTopUpTriggerLtv(settings.btc_top_up_trigger_ltv);
      if (settings.btc_top_up_target_ltv !== undefined) setBtcTopUpTargetLtv(settings.btc_top_up_target_ltv);
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
        btc_return_model: btcReturnModel || 'custom',
        other_retirement_income: otherRetirementIncome || 0,
        social_security_start_age: socialSecurityStartAge || 67,
        social_security_amount: socialSecurityAmount || 0,
        gross_annual_income: grossAnnualIncome || 100000,
        contribution_401k: contribution401k || 0,
        employer_401k_match: employer401kMatch || 0,
        contribution_roth_ira: contributionRothIRA || 0,
        contribution_hsa: contributionHSA || 0,
        hsa_family_coverage: hsaFamilyCoverage || false,
        filing_status: filingStatus || 'single',
        auto_top_up_btc_collateral: autoTopUpBtcCollateral,
        btc_top_up_trigger_ltv: btcTopUpTriggerLtv || 70,
        btc_top_up_target_ltv: btcTopUpTargetLtv || 50,
      });
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [settingsLoaded, btcCagr, stocksCagr, stocksVolatility, realEstateCagr, bondsCagr, cashCagr, otherCagr, inflationRate, incomeGrowth, retirementAge, currentAge, lifeExpectancy, currentAnnualSpending, retirementAnnualSpending, btcReturnModel, otherRetirementIncome, socialSecurityStartAge, socialSecurityAmount, grossAnnualIncome, contribution401k, employer401kMatch, contributionRothIRA, contributionHSA, hsaFamilyCoverage, filingStatus, autoTopUpBtcCollateral, btcTopUpTriggerLtv, btcTopUpTargetLtv]);

  const currentMonthForDebt = new Date().getMonth();
  const currentYearForDebt = new Date().getFullYear();
  const monthlyDebtPayments = liabilities.reduce((sum, liability) => {
    if (!liability.monthly_payment || liability.monthly_payment <= 0) return sum;
    let remainingBalance = liability.current_balance || 0;
    const hasInterest = liability.interest_rate && liability.interest_rate > 0;

    for (let month = 0; month <= currentMonthForDebt; month++) {
      if (remainingBalance <= 0) break;
      const monthlyInterest = hasInterest ? remainingBalance * (liability.interest_rate / 100 / 12) : 0;
      const principalPayment = Math.max(0, liability.monthly_payment - monthlyInterest);
      const paymentThisMonth = Math.min(remainingBalance + monthlyInterest, liability.monthly_payment);
      if (month === currentMonthForDebt) {
        return sum + paymentThisMonth;
      }
      remainingBalance = Math.max(0, remainingBalance - principalPayment);
    }
    return sum;
  }, 0);

  const currentYear = new Date().getFullYear();
  const { standardDeductions } = getTaxDataForYear(currentYear);
  const currentStandardDeduction = standardDeductions[filingStatus] || standardDeductions.single;
  
  const currentLimit401k = get401kLimit(currentYear, currentAge);
  const currentLimitRoth = getRothIRALimit(currentYear, currentAge);
  const currentLimitHSA = getHSALimit(currentYear, currentAge, hsaFamilyCoverage);
  
  const actual401k = Math.min(contribution401k || 0, currentLimit401k);
  const actualRoth = Math.min(contributionRothIRA || 0, currentLimitRoth);
  const actualHSA = Math.min(contributionHSA || 0, currentLimitHSA);
  
  const taxableGrossIncome = Math.max(0, grossAnnualIncome - actual401k - actualHSA - currentStandardDeduction);
  const estimatedIncomeTax = calculateProgressiveIncomeTax(taxableGrossIncome, filingStatus, currentYear);
  const netIncome = grossAnnualIncome - estimatedIncomeTax;
  const totalRetirementContributions = actualRoth;
  const annualSavings = netIncome - currentAnnualSpending - totalRetirementContributions;

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
    const accountType = h.account_type || '';
    const assetType = h.asset_type || '';
    
    if (assetType === 'real_estate' || accountType === 'taxable_real_estate') {
      return 'real_estate';
    }
    if (['traditional_401k', 'traditional_ira', 'sep_ira', '403b'].includes(accountType)) {
      return 'tax_deferred';
    }
    if (['roth_401k', 'roth_ira', 'hsa', '529'].includes(accountType)) {
      return 'tax_free';
    }
    if (h.tax_treatment) return h.tax_treatment;
    return 'taxable';
  };

  const taxableHoldings = holdings.filter(h => getTaxTreatmentFromHolding(h) === 'taxable');
  const taxableValue = taxableHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);
  const taxableLiquidHoldings = taxableHoldings;
  const taxableLiquidValue = taxableValue;

  const taxDeferredHoldings = holdings.filter(h => getTaxTreatmentFromHolding(h) === 'tax_deferred');
  const taxDeferredValue = taxDeferredHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);

  const taxFreeHoldings = holdings.filter(h => getTaxTreatmentFromHolding(h) === 'tax_free');
  const taxFreeValue = taxFreeHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);

  const realEstateHoldings = holdings.filter(h => getTaxTreatmentFromHolding(h) === 'real_estate');
  const realEstateAccountValue = realEstateHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);

  const btcValue = holdings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity * currentPrice, 0);
  const stocksValue = holdings.filter(h => h.asset_type === 'stocks').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const realEstateValue = holdings.filter(h => h.asset_type === 'real_estate').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const bondsValue = holdings.filter(h => h.asset_type === 'bonds').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const cashValue = holdings.filter(h => h.asset_type === 'cash').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const otherValue = holdings.filter(h => !['BTC'].includes(h.ticker) && !['stocks', 'real_estate', 'bonds', 'cash', 'crypto'].includes(h.asset_type)).reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const totalValue = btcValue + stocksValue + realEstateValue + bondsValue + cashValue + otherValue;

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

  const simulateForward = (params) => {
    const {
      startingPortfolio, startAge, endAge, retireAge, annualSpending, annualSavings, inflationRate,
      btcPct, stocksPct, realEstatePct, bondsPct, cashPct, otherPct,
    } = params;
    
    let portfolio = startingPortfolio;
    
    for (let age = startAge; age <= endAge; age++) {
      const yearIndex = age - startAge;
      const yearsFromNow = age - currentAge;
      const isRetired = age >= retireAge;
      
      const yearBtcGrowth = getBtcGrowthRate(yearsFromNow, inflationRate) / 100;
      const blendedGrowth = (
        btcPct * yearBtcGrowth +
        stocksPct * (effectiveStocksCagr / 100) +
        realEstatePct * (realEstateCagr / 100) +
        bondsPct * (bondsCagr / 100) +
        cashPct * (cashCagr / 100) +
        otherPct * (otherCagr / 100)
      );
      
      if (yearIndex > 0) {
        portfolio *= (1 + blendedGrowth);
      }
      
      if (isRetired) {
        const yearsIntoRetirement = age - retireAge;
        const inflatedSpending = annualSpending * Math.pow(1 + inflationRate / 100, yearsFromNow);
        const grossWithdrawal = inflatedSpending * 1.15;
        const actualWithdrawal = Math.min(grossWithdrawal, portfolio);
        portfolio -= actualWithdrawal;
        
        if (actualWithdrawal < grossWithdrawal * 0.95) {
          return { survives: false, finalPortfolio: portfolio, depleteAge: age };
        }
      } else {
        const inflatedSavings = annualSavings * Math.pow(1 + incomeGrowth / 100, yearsFromNow);
        portfolio += inflatedSavings;
      }
      
      if (portfolio <= 0) {
        return { survives: false, finalPortfolio: 0, depleteAge: age };
      }
    }
    
    return { survives: true, finalPortfolio: portfolio, depleteAge: null };
  };

  const projections = useMemo(() => {
    const years = lifeExpectancy - currentAge;
    const data = [];
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    let cumulativeSavings = 0;

    const initializePortfolio = () => {
      const structure = {
        taxable: { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 },
        taxDeferred: { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 },
        taxFree: { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 },
        realEstate: 0
      };
      
      holdings.forEach(h => {
        const value = getHoldingValue(h);
        const taxTreatment = getTaxTreatmentFromHolding(h);
        const assetType = h.asset_type || '';
        
        if (taxTreatment === 'real_estate') {
          structure.realEstate += value;
          return;
        }
        
        let assetCategory = 'other';
        if (h.ticker === 'BTC' || assetType === 'crypto') assetCategory = 'btc';
        else if (assetType === 'stocks') assetCategory = 'stocks';
        else if (assetType === 'bonds') assetCategory = 'bonds';
        else if (assetType === 'cash') assetCategory = 'cash';
        
        let accountKey = 'taxable';
        if (taxTreatment === 'tax_deferred') accountKey = 'taxDeferred';
        else if (taxTreatment === 'tax_free') accountKey = 'taxFree';
        
        structure[accountKey][assetCategory] += value;
      });
      
      return structure;
    };

    let portfolio = initializePortfolio();

    const getAccountTotal = (accountKey) => {
      const acct = portfolio[accountKey];
      return acct.btc + acct.stocks + acct.bonds + acct.cash + acct.other;
    };

    const getAssetTotal = (assetKey) => {
      return portfolio.taxable[assetKey] + portfolio.taxDeferred[assetKey] + portfolio.taxFree[assetKey];
    };

    const getTotalLiquid = () => {
      return getAccountTotal('taxable') + getAccountTotal('taxDeferred') + getAccountTotal('taxFree');
    };

    const getTotalPortfolio = () => {
      return getTotalLiquid() + portfolio.realEstate;
    };

    let ranOutOfMoney = false;
    const initialTaxableCostBasis = taxableHoldings.reduce((sum, h) => sum + (h.cost_basis_total || 0), 0);
    let runningTaxableBasis = initialTaxableCostBasis;

    const tempRunningDebt = {};
    liabilities.forEach(liability => {
      tempRunningDebt[liability.id] = {
        ...liability,
        current_balance: liability.current_balance || 0,
        paid_off: false,
        entity_type: 'Liability',
      };
    });

    collateralizedLoans.forEach(loan => {
      tempRunningDebt[loan.id] = {
        ...loan,
        current_balance: loan.current_balance || 0,
        paid_off: false,
        entity_type: 'CollateralizedLoan',
        type: 'btc_collateralized',
        monthly_payment: loan.minimum_monthly_payment || 0,
      };
    });

    const tempRunningCollateralizedLoans = {};
    collateralizedLoans.forEach(loan => {
      tempRunningCollateralizedLoans[loan.id] = {
        ...loan,
        current_balance: loan.current_balance || 0,
        paid_off: false,
      };
    });

    const encumberedBtc = {};
    let releasedBtc = {};
    const liquidationEvents = [];

    liabilities.forEach(liability => {
      if (liability.type === 'btc_collateralized' && liability.collateral_btc_amount) {
        encumberedBtc[liability.id] = liability.collateral_btc_amount;
        releasedBtc[liability.id] = 0;
      }
    });

    collateralizedLoans.forEach(loan => {
      if (loan.collateral_btc_amount) {
        const loanKey = `loan_${loan.id}`;
        encumberedBtc[loanKey] = loan.collateral_btc_amount;
        releasedBtc[loanKey] = 0;
      }
    });

    for (let i = 0; i <= years; i++) {
      const year = currentYear + i;
      const age = currentAge + i;
      const yearBtcGrowth = getBtcGrowthRate(i, effectiveInflation);

      const totalReleasedBtcValueThisYear = Object.values(releasedBtc).reduce((sum, btcAmount) => {
        const btcPriceThisYear = currentPrice * Math.pow(1 + yearBtcGrowth / 100, i);
        return sum + (btcAmount * btcPriceThisYear);
      }, 0);
      if (totalReleasedBtcValueThisYear > 0) {
        portfolio.taxable.btc += totalReleasedBtcValueThisYear;
      }
      releasedBtc = {};

      let activeIncomeAdjustment = 0;
      let activeExpenseAdjustment = 0;
      
      lifeEvents.forEach(event => {
        if (event.event_type === 'income_change') {
          const eventEndYear = event.year + (event.is_recurring ? (event.recurring_years || 1) : 1);
          const isActive = year >= event.year && year < eventEndYear;
          if (isActive) activeIncomeAdjustment += event.amount;
        }
        if (event.event_type === 'expense_change') {
          const eventEndYear = event.year + (event.is_recurring ? (event.recurring_years || 1) : 1);
          const isActive = year >= event.year && year < eventEndYear;
          if (isActive) activeExpenseAdjustment += event.amount;
        }
        if (event.event_type === 'home_purchase' && event.year <= year && event.monthly_expense_impact > 0) {
          activeExpenseAdjustment += event.monthly_expense_impact * 12;
        }
      });

      let eventImpact = 0;
      let yearGoalWithdrawal = 0;
      const yearGoalNames = [];

      lifeEvents.forEach(event => {
        if (event.year === year || (event.is_recurring && event.year <= year && year < event.year + (event.recurring_years || 1))) {
          if (event.affects === 'assets') {
            const eventAmount = event.amount;
            eventImpact += eventAmount;

            if (eventAmount > 0 && event.allocation_method === 'custom') {
              const btcAlloc = (event.btc_allocation || 0) / 100;
              const stocksAlloc = (event.stocks_allocation || 0) / 100;
              const realEstateAlloc = (event.real_estate_allocation || 0) / 100;
              const bondsAlloc = (event.bonds_allocation || 0) / 100;
              const cashAlloc = (event.cash_allocation || 0) / 100;
              const otherAlloc = (event.other_allocation || 0) / 100;

              portfolio.taxable.btc += eventAmount * btcAlloc;
              portfolio.taxable.stocks += eventAmount * stocksAlloc;
              portfolio.realEstate += eventAmount * realEstateAlloc;
              portfolio.taxable.bonds += eventAmount * bondsAlloc;
              portfolio.taxable.other += eventAmount * (cashAlloc + otherAlloc);
            }
          }
          if (event.event_type === 'home_purchase' && event.year === year) {
            eventImpact -= (event.down_payment || 0);
          }
        }
      });

      goals.forEach(goal => {
        if (goal.will_be_spent && goal.target_date && goal.goal_type !== 'debt_payoff') {
          const goalYear = new Date(goal.target_date).getFullYear();
          if (goalYear === year) {
            const goalAmount = goal.target_amount || 0;
            eventImpact -= goalAmount;
            yearGoalWithdrawal += goalAmount;
            yearGoalNames.push(goal.name);
          }
        }
      });

      const liabilitiesWithPayoffGoals = new Set();
      const loansWithPayoffGoals = new Set();
      
      goals.forEach(goal => {
        if (goal.goal_type === 'debt_payoff' && goal.linked_liability_id) {
          const payoffStrategy = goal.payoff_strategy || 'spread_payments';
          const isLoan = goal.linked_liability_id.startsWith('loan_');
          const actualId = isLoan ? goal.linked_liability_id.substring(5) : goal.linked_liability_id;
          
          if (payoffStrategy === 'spread_payments' && goal.payoff_years > 0) {
            const startYear = goal.target_date ? new Date(goal.target_date).getFullYear() : currentYear;
            const endYear = startYear + goal.payoff_years;

            if (year >= startYear && year < endYear) {
              const annualPayment = (goal.target_amount || 0) / goal.payoff_years;
              eventImpact -= annualPayment;
              yearGoalWithdrawal += annualPayment;
              yearGoalNames.push(goal.name);
              
              if (isLoan) {
                loansWithPayoffGoals.add(actualId);
                const loanToUpdate = tempRunningCollateralizedLoans[actualId];
                if (loanToUpdate && !loanToUpdate.paid_off) {
                  loanToUpdate.current_balance = Math.max(0, loanToUpdate.current_balance - annualPayment);
                  if (loanToUpdate.current_balance <= 0.01) loanToUpdate.paid_off = true;
                }
              } else {
                liabilitiesWithPayoffGoals.add(actualId);
                const liabilityToUpdate = tempRunningDebt[actualId];
                if (liabilityToUpdate && !liabilityToUpdate.paid_off) {
                  liabilityToUpdate.current_balance = Math.max(0, liabilityToUpdate.current_balance - annualPayment);
                  if (liabilityToUpdate.current_balance <= 0.01) liabilityToUpdate.paid_off = true;
                }
              }
            }
          } else if (payoffStrategy === 'lump_sum' && goal.target_date) {
            const payoffYear = new Date(goal.target_date).getFullYear();
            
            if (year === payoffYear) {
              const lumpSumAmount = goal.target_amount || 0;
              eventImpact -= lumpSumAmount;
              yearGoalWithdrawal += lumpSumAmount;
              yearGoalNames.push(goal.name);
              
              if (isLoan) {
                loansWithPayoffGoals.add(actualId);
                const loanToUpdate = tempRunningCollateralizedLoans[actualId];
                if (loanToUpdate && !loanToUpdate.paid_off) {
                  loanToUpdate.current_balance = 0;
                  loanToUpdate.paid_off = true;
                }
              } else {
                liabilitiesWithPayoffGoals.add(actualId);
                const liabilityToUpdate = tempRunningDebt[actualId];
                if (liabilityToUpdate && !liabilityToUpdate.paid_off) {
                  liabilityToUpdate.current_balance = 0;
                  liabilityToUpdate.paid_off = true;
                }
              }
            }
          }
        }
      });

      let actualAnnualDebtPayments = 0;
      const debtPayoffEvents = [];

      Object.values(tempRunningDebt).forEach(liability => {
        if (!liabilitiesWithPayoffGoals.has(liability.id) && !liability.paid_off) {
          const hasPayment = liability.monthly_payment && liability.monthly_payment > 0;
          const hasInterest = liability.interest_rate && liability.interest_rate > 0;
          const startingBalanceForYear = liability.current_balance;
          const isBtcLoan = liability.type === 'btc_collateralized';

          if (hasPayment) {
            let remainingBalance = liability.current_balance;
            let payoffMonth = null;
            const startMonth = (i === 0) ? currentMonth : 0;

            for (let month = startMonth; month < 12; month++) {
              if (remainingBalance <= 0) {
                liability.paid_off = true;
                break;
              }

              const monthlyInterest = hasInterest ? remainingBalance * (liability.interest_rate / 100 / 12) : 0;
              const principalPayment = Math.max(0, liability.monthly_payment - monthlyInterest);
              const paymentThisMonth = Math.min(remainingBalance + monthlyInterest, liability.monthly_payment);
              remainingBalance = Math.max(0, remainingBalance - principalPayment);
              actualAnnualDebtPayments += paymentThisMonth;

              if (remainingBalance <= 0.01 && payoffMonth === null) {
                payoffMonth = month + 1;
              }
            }

            liability.current_balance = remainingBalance;

            if (startingBalanceForYear > 0 && liability.current_balance <= 0.01 && payoffMonth) {
              debtPayoffEvents.push({
                name: liability.name,
                month: payoffMonth,
                age: currentAge + i
              });
              liability.paid_off = true;
            }
          } else if (hasInterest && !isBtcLoan) {
            const annualInterest = liability.current_balance * (liability.interest_rate / 100);
            liability.current_balance += annualInterest;
          } else if (isBtcLoan && hasInterest && i > 0) {
            const dailyRate = liability.interest_rate / 100 / 365;
            liability.current_balance = liability.current_balance * Math.pow(1 + dailyRate, 365);
          }
        }

        // BTC COLLATERAL MANAGEMENT FOR LIABILITIES
        if (liability.type === 'btc_collateralized' && encumberedBtc[liability.id] > 0) {
          const yearBtcPrice = i === 0 ? currentPrice : currentPrice * Math.pow(1 + yearBtcGrowth / 100, i);
          const collateralValue = encumberedBtc[liability.id] * yearBtcPrice;
          const currentLTV = (liability.current_balance / collateralValue) * 100;
          const liquidationLTV = liability.liquidation_ltv || 80;
          const releaseLTV = liability.collateral_release_ltv || 30;
          const triggerLTV = btcTopUpTriggerLtv || 70;
          const targetLTV = btcTopUpTargetLtv || 50;

          // AUTO TOP-UP
          if (autoTopUpBtcCollateral && currentLTV >= triggerLTV && currentLTV < liquidationLTV) {
            const targetCollateralValue = liability.current_balance / (targetLTV / 100);
            const additionalBtcNeeded = (targetCollateralValue / yearBtcPrice) - encumberedBtc[liability.id];
            const liquidBtcAvailable = portfolio.taxable.btc / yearBtcPrice;
            
            if (additionalBtcNeeded > 0 && liquidBtcAvailable >= additionalBtcNeeded) {
              encumberedBtc[liability.id] += additionalBtcNeeded;
              portfolio.taxable.btc -= additionalBtcNeeded * yearBtcPrice;
              
              liquidationEvents.push({
                year, age: currentAge + i, liabilityName: liability.name, type: 'top_up',
                btcAdded: additionalBtcNeeded, newLtv: targetLTV,
                message: `Added ${additionalBtcNeeded.toFixed(4)} BTC collateral to reduce LTV from ${currentLTV.toFixed(0)}% to ${targetLTV}%`
              });
            }
          }

          const postTopUpCollateralValue = encumberedBtc[liability.id] * yearBtcPrice;
          const postTopUpLTV = (liability.current_balance / postTopUpCollateralValue) * 100;

          // PARTIAL/FULL LIQUIDATION (FIXED LOGIC)
          if (postTopUpLTV >= liquidationLTV) {
            const totalCollateralBtc = encumberedBtc[liability.id];
            const debtBalance = liability.current_balance;
            const targetCollateralBtc = debtBalance / (targetLTV / 100) / yearBtcPrice;
            
            let btcToSell, proceedsFromSale, newDebtBalance, remainingCollateralBtc;
            
            if (targetCollateralBtc >= totalCollateralBtc) {
              // FULL LIQUIDATION
              btcToSell = totalCollateralBtc;
              proceedsFromSale = btcToSell * yearBtcPrice;
              newDebtBalance = Math.max(0, debtBalance - proceedsFromSale);
              remainingCollateralBtc = 0;
            } else {
              // PARTIAL LIQUIDATION
              btcToSell = totalCollateralBtc - targetCollateralBtc;
              proceedsFromSale = btcToSell * yearBtcPrice;
              newDebtBalance = Math.max(0, debtBalance - proceedsFromSale);
              remainingCollateralBtc = totalCollateralBtc - btcToSell;
            }
            
            liability.current_balance = newDebtBalance;
            encumberedBtc[liability.id] = remainingCollateralBtc;
            
            if (newDebtBalance <= 0.01) {
              liability.paid_off = true;
              if (remainingCollateralBtc > 0) {
                portfolio.taxable.btc += remainingCollateralBtc * yearBtcPrice;
                encumberedBtc[liability.id] = 0;
              }
            }
            
            const newLTV = remainingCollateralBtc > 0 ? (newDebtBalance / (remainingCollateralBtc * yearBtcPrice)) * 100 : 0;

            liquidationEvents.push({
              year, age: currentAge + i, liabilityName: liability.name,
              type: remainingCollateralBtc === 0 ? 'full_liquidation' : 'partial_liquidation',
              btcAmount: btcToSell, btcReturned: 0, proceeds: proceedsFromSale,
              debtReduction: proceedsFromSale, remainingDebt: newDebtBalance,
              remainingCollateral: remainingCollateralBtc, newLtv: newLTV,
              message: remainingCollateralBtc === 0 
                ? `Full liquidation: Sold all ${btcToSell.toFixed(4)} BTC ($${Math.round(proceedsFromSale).toLocaleString()}) to cover debt. Remaining debt: $${Math.round(newDebtBalance).toLocaleString()}`
                : `Partial liquidation: Sold ${btcToSell.toFixed(4)} BTC to reduce LTV from ${postTopUpLTV.toFixed(0)}% to ${newLTV.toFixed(0)}%`
            });
          }
          // RELEASE
          else if (postTopUpLTV <= releaseLTV) {
            if (liability.current_balance <= 0) {
              if (!releasedBtc[liability.id] || releasedBtc[liability.id] === 0) {
                releasedBtc[liability.id] = encumberedBtc[liability.id];
                encumberedBtc[liability.id] = 0;
              }
            } else {
              const currentCollateral = encumberedBtc[liability.id];
              const targetCollateralForLoan = liability.current_balance / (targetLTV / 100) / yearBtcPrice;
              const excessCollateral = Math.max(0, currentCollateral - targetCollateralForLoan);
              
              if (excessCollateral > 0) {
                releasedBtc[liability.id] = excessCollateral;
                encumberedBtc[liability.id] = targetCollateralForLoan;
              }
            }
          }
        }
      });

      // COLLATERALIZED LOANS PROCESSING
      Object.values(tempRunningCollateralizedLoans).forEach(loan => {
        if (!loansWithPayoffGoals.has(loan.id) && !loan.paid_off) {
          const hasInterest = loan.interest_rate && loan.interest_rate > 0;
          const hasMinPayment = loan.minimum_monthly_payment && loan.minimum_monthly_payment > 0;
          const startMonth = (i === 0) ? currentMonth : 0;

          if (hasMinPayment) {
            let remainingBalance = loan.current_balance;

            for (let month = startMonth; month < 12; month++) {
              if (remainingBalance <= 0) {
                loan.paid_off = true;
                break;
              }

              const monthlyInterest = hasInterest ? remainingBalance * (loan.interest_rate / 100 / 12) : 0;
              const principalPayment = Math.max(0, loan.minimum_monthly_payment - monthlyInterest);
              const paymentThisMonth = Math.min(remainingBalance + monthlyInterest, loan.minimum_monthly_payment);

              actualAnnualDebtPayments += paymentThisMonth;
              remainingBalance = Math.max(0, remainingBalance - principalPayment);
            }

            loan.current_balance = remainingBalance;
          } else if (hasInterest && i > 0) {
            const monthlyRate = loan.interest_rate / 100 / 12;
            loan.current_balance = loan.current_balance * Math.pow(1 + monthlyRate, 12);
          }
        }

        // BTC COLLATERAL MANAGEMENT FOR COLLATERALIZED LOANS
        const loanKey = `loan_${loan.id}`;
        if (encumberedBtc[loanKey] > 0) {
          const yearBtcPrice = i === 0 ? currentPrice : currentPrice * Math.pow(1 + yearBtcGrowth / 100, i);
          const collateralValue = encumberedBtc[loanKey] * yearBtcPrice;
          const currentLTV = (loan.current_balance / collateralValue) * 100;
          const liquidationLTV = loan.liquidation_ltv || 80;
          const releaseLTV = loan.collateral_release_ltv || 30;
          const triggerLTV = btcTopUpTriggerLtv || 70;
          const targetLTV = btcTopUpTargetLtv || 50;

          // AUTO TOP-UP
          if (autoTopUpBtcCollateral && currentLTV >= triggerLTV && currentLTV < liquidationLTV) {
            const targetCollateralValue = loan.current_balance / (targetLTV / 100);
            const additionalBtcNeeded = (targetCollateralValue / yearBtcPrice) - encumberedBtc[loanKey];
            const liquidBtcAvailable = portfolio.taxable.btc / yearBtcPrice;
            
            if (additionalBtcNeeded > 0 && liquidBtcAvailable >= additionalBtcNeeded) {
              encumberedBtc[loanKey] += additionalBtcNeeded;
              portfolio.taxable.btc -= additionalBtcNeeded * yearBtcPrice;
              
              liquidationEvents.push({
                year, age: currentAge + i, liabilityName: loan.name, type: 'top_up',
                btcAdded: additionalBtcNeeded, newLtv: targetLTV,
                message: `Added ${additionalBtcNeeded.toFixed(4)} BTC collateral to reduce LTV from ${currentLTV.toFixed(0)}% to ${targetLTV}%`
              });
            }
          }

          const postTopUpCollateralValue = encumberedBtc[loanKey] * yearBtcPrice;
          const postTopUpLTV = (loan.current_balance / postTopUpCollateralValue) * 100;

          // PARTIAL/FULL LIQUIDATION (FIXED LOGIC)
          if (postTopUpLTV >= liquidationLTV) {
            const totalCollateralBtc = encumberedBtc[loanKey];
            const debtBalance = loan.current_balance;
            const targetCollateralBtc = debtBalance / (targetLTV / 100) / yearBtcPrice;
            
            let btcToSell, proceedsFromSale, newDebtBalance, remainingCollateralBtc;
            
            if (targetCollateralBtc >= totalCollateralBtc) {
              // FULL LIQUIDATION
              btcToSell = totalCollateralBtc;
              proceedsFromSale = btcToSell * yearBtcPrice;
              newDebtBalance = Math.max(0, debtBalance - proceedsFromSale);
              remainingCollateralBtc = 0;
            } else {
              // PARTIAL LIQUIDATION
              btcToSell = totalCollateralBtc - targetCollateralBtc;
              proceedsFromSale = btcToSell * yearBtcPrice;
              newDebtBalance = Math.max(0, debtBalance - proceedsFromSale);
              remainingCollateralBtc = totalCollateralBtc - btcToSell;
            }
            
            loan.current_balance = newDebtBalance;
            encumberedBtc[loanKey] = remainingCollateralBtc;
            
            if (tempRunningDebt[loan.id]) {
              tempRunningDebt[loan.id].current_balance = newDebtBalance;
            }
            
            if (newDebtBalance <= 0.01) {
              loan.paid_off = true;
              if (tempRunningDebt[loan.id]) tempRunningDebt[loan.id].paid_off = true;
              if (remainingCollateralBtc > 0) {
                portfolio.taxable.btc += remainingCollateralBtc * yearBtcPrice;
                encumberedBtc[loanKey] = 0;
              }
            }
            
            const newLTV = remainingCollateralBtc > 0 ? (newDebtBalance / (remainingCollateralBtc * yearBtcPrice)) * 100 : 0;

            liquidationEvents.push({
              year, age: currentAge + i, liabilityName: loan.name,
              type: remainingCollateralBtc === 0 ? 'full_liquidation' : 'partial_liquidation',
              btcAmount: btcToSell, btcReturned: 0, proceeds: proceedsFromSale,
              debtReduction: proceedsFromSale, remainingDebt: newDebtBalance,
              remainingCollateral: remainingCollateralBtc, newLtv: newLTV,
              message: remainingCollateralBtc === 0 
                ? `Full liquidation: Sold all ${btcToSell.toFixed(4)} BTC ($${Math.round(proceedsFromSale).toLocaleString()}) to cover debt. Remaining debt: $${Math.round(newDebtBalance).toLocaleString()}`
                : `Partial liquidation: Sold ${btcToSell.toFixed(4)} BTC to reduce LTV from ${postTopUpLTV.toFixed(0)}% to ${newLTV.toFixed(0)}%`
            });
          }
          // RELEASE
          else if (postTopUpLTV <= releaseLTV) {
            if (loan.current_balance <= 0) {
              if (!releasedBtc[loanKey] || releasedBtc[loanKey] === 0) {
                releasedBtc[loanKey] = encumberedBtc[loanKey];
                encumberedBtc[loanKey] = 0;
              }
            } else {
              const currentCollateral = encumberedBtc[loanKey];
              const targetCollateralForLoan = loan.current_balance / (targetLTV / 100) / yearBtcPrice;
              const excessCollateral = Math.max(0, currentCollateral - targetCollateralForLoan);
              
              if (excessCollateral > 0) {
                releasedBtc[loanKey] = excessCollateral;
                encumberedBtc[loanKey] = targetCollateralForLoan;
              }
            }
          }
        }
      });

      const isRetired = currentAge + i >= retirementAge;
      const yearsIntoRetirement = isRetired ? currentAge + i - retirementAge : 0;
      const currentAgeThisYear = currentAge + i;

      let yearSavings = 0;
      let yearWithdrawal = 0;
      let taxesPaid = 0;
      let penaltyPaid = 0;
      let withdrawFromTaxable = 0;
      let withdrawFromTaxDeferred = 0;
      let withdrawFromTaxFree = 0;
      let withdrawFromRealEstate = 0;
      let realEstateSaleProceeds = 0;
      let retirementSpendingOnly = 0;
      let totalWithdrawalForTaxCalculation = 0;

      if (i > 0 && !ranOutOfMoney) {
        ['taxable', 'taxDeferred', 'taxFree'].forEach(accountKey => {
          portfolio[accountKey].btc *= (1 + yearBtcGrowth / 100);
          portfolio[accountKey].stocks *= (1 + effectiveStocksCagr / 100);
          portfolio[accountKey].bonds *= (1 + bondsCagr / 100);
          portfolio[accountKey].cash *= (1 + cashCagr / 100);
          portfolio[accountKey].other *= (1 + otherCagr / 100);
        });
        portfolio.realEstate *= (1 + realEstateCagr / 100);
      }

      if (!isRetired) {
        const baseGrossIncome = grossAnnualIncome * Math.pow(1 + incomeGrowth / 100, i);
        const yearGrossIncome = baseGrossIncome + activeIncomeAdjustment;
        
        const yearLimit401k = get401kLimit(year, currentAgeThisYear);
        const yearLimitRoth = getRothIRALimit(year, currentAgeThisYear);
        const yearLimitHSA = getHSALimit(year, currentAgeThisYear, hsaFamilyCoverage);
        
        const year401k = Math.min((contribution401k || 0) * Math.pow(1 + incomeGrowth / 100, i), yearLimit401k);
        const yearRoth = Math.min((contributionRothIRA || 0) * Math.pow(1 + incomeGrowth / 100, i), yearLimitRoth);
        const yearHSA = Math.min((contributionHSA || 0) * Math.pow(1 + incomeGrowth / 100, i), yearLimitHSA);
        const yearEmployerMatch = (employer401kMatch || 0) * Math.pow(1 + incomeGrowth / 100, i);
        
        const yearTaxableIncome = Math.max(0, yearGrossIncome - year401k - yearHSA - currentStandardDeduction);
        const yearTaxesPaid = calculateProgressiveIncomeTax(yearTaxableIncome, filingStatus, year);
        taxesPaid = yearTaxesPaid;
        const yearNetIncome = yearGrossIncome - yearTaxesPaid;
        const yearSpending = (currentAnnualSpending * Math.pow(1 + inflationRate / 100, i)) + activeExpenseAdjustment;
        
        yearSavings = yearNetIncome - yearSpending - yearRoth;
        cumulativeSavings += yearSavings;
        
        const addToAccount = (accountKey, amount) => {
          const acct = portfolio[accountKey];
          const currentTotal = getAccountTotal(accountKey);
          if (currentTotal > 0) {
            const btcRatio = acct.btc / currentTotal;
            const stocksRatio = acct.stocks / currentTotal;
            const bondsRatio = acct.bonds / currentTotal;
            const cashRatio = acct.cash / currentTotal;
            const otherRatio = acct.other / currentTotal;
            acct.btc += amount * btcRatio;
            acct.stocks += amount * stocksRatio;
            acct.bonds += amount * bondsRatio;
            acct.cash += amount * cashRatio;
            acct.other += amount * otherRatio;
          } else {
            acct.stocks += amount;
          }
        };
        
        addToAccount('taxDeferred', year401k + yearEmployerMatch);
        addToAccount('taxFree', yearRoth + yearHSA);

        if (yearSavings < 0) {
          const deficit = Math.abs(yearSavings);
          const taxableBalance = getAccountTotal('taxable');
          const taxDeferredBalance = getAccountTotal('taxDeferred');
          const taxFreeBalance = getAccountTotal('taxFree');
          const effectiveRunningTaxableBasis = Math.min(taxableBalance, runningTaxableBasis);
          const estimatedCurrentGainRatio = taxableBalance > 0 ? Math.max(0, (taxableBalance - effectiveRunningTaxableBasis) / taxableBalance) : 0;

          const taxEstimate = estimateRetirementWithdrawalTaxes({
            withdrawalNeeded: deficit,
            taxableBalance, taxDeferredBalance, taxFreeBalance,
            taxableGainPercent: estimatedCurrentGainRatio,
            isLongTermGain: true, filingStatus,
            age: currentAgeThisYear, otherIncome: 0,
          });

          withdrawFromTaxable = taxEstimate.fromTaxable || 0;
          withdrawFromTaxDeferred = taxEstimate.fromTaxDeferred || 0;
          withdrawFromTaxFree = taxEstimate.fromTaxFree || 0;
          taxesPaid = taxEstimate.totalTax || 0;
          penaltyPaid = taxEstimate.totalPenalty || 0;

          if (withdrawFromTaxable > 0 && taxableBalance > 0) {
            const basisRatio = runningTaxableBasis / taxableBalance;
            runningTaxableBasis = Math.max(0, runningTaxableBasis - (withdrawFromTaxable * basisRatio));
          }

          const withdrawFromAccount = (accountKey, amount) => {
            const acct = portfolio[accountKey];
            const total = getAccountTotal(accountKey);
            if (total <= 0 || amount <= 0) return 0;
            const actualWithdrawal = Math.min(amount, total);
            const ratio = actualWithdrawal / total;
            acct.btc = Math.max(0, acct.btc * (1 - ratio));
            acct.stocks = Math.max(0, acct.stocks * (1 - ratio));
            acct.bonds = Math.max(0, acct.bonds * (1 - ratio));
            acct.cash = Math.max(0, acct.cash * (1 - ratio));
            acct.other = Math.max(0, acct.other * (1 - ratio));
            return actualWithdrawal;
          };

          withdrawFromAccount('taxable', withdrawFromTaxable);
          withdrawFromAccount('taxDeferred', withdrawFromTaxDeferred);
          withdrawFromAccount('taxFree', withdrawFromTaxFree);

          if (getTotalPortfolio() <= 0 && !ranOutOfMoney) {
            ranOutOfMoney = true;
          }
        } else if (yearSavings > 0) {
          const taxableTotal = getAccountTotal('taxable');
          if (taxableTotal > 0) {
            const btcRatio = portfolio.taxable.btc / taxableTotal;
            const stocksRatio = portfolio.taxable.stocks / taxableTotal;
            const bondsRatio = portfolio.taxable.bonds / taxableTotal;
            const cashRatio = portfolio.taxable.cash / taxableTotal;
            const otherRatio = portfolio.taxable.other / taxableTotal;
            portfolio.taxable.btc += yearSavings * btcRatio;
            portfolio.taxable.stocks += yearSavings * stocksRatio;
            portfolio.taxable.bonds += yearSavings * bondsRatio;
            portfolio.taxable.cash += yearSavings * cashRatio;
            portfolio.taxable.other += yearSavings * otherRatio;
          } else {
            portfolio.taxable.stocks += yearSavings;
          }
          runningTaxableBasis += yearSavings;
        }
      } else {
        const nominalSpendingAtRetirement = retirementAnnualSpending * Math.pow(1 + effectiveInflation / 100, Math.max(0, retirementAge - currentAge));
        const desiredWithdrawal = nominalSpendingAtRetirement * Math.pow(1 + effectiveInflation / 100, yearsIntoRetirement);
        const totalAvailableForWithdrawal = Math.max(0, getTotalLiquid());
        yearWithdrawal = Math.min(desiredWithdrawal, totalAvailableForWithdrawal);

        let rmdAmount = 0;
        const taxDeferredBalanceForRMD = getAccountTotal('taxDeferred');
        if (currentAgeThisYear >= RMD_START_AGE && taxDeferredBalanceForRMD > 0) {
          const rmdFactor = (() => {
            if (currentAgeThisYear === 73) return 26.5;
            if (currentAgeThisYear === 74) return 25.5;
            if (currentAgeThisYear === 75) return 24.6;
            if (currentAgeThisYear === 76) return 23.7;
            if (currentAgeThisYear === 77) return 22.9;
            if (currentAgeThisYear === 78) return 22.0;
            if (currentAgeThisYear === 79) return 21.1;
            if (currentAgeThisYear === 80) return 20.2;
            if (currentAgeThisYear >= 81 && currentAgeThisYear <= 85) return 19.0 - ((currentAgeThisYear - 81) * 0.5);
            return Math.max(10, 16.0 - ((currentAgeThisYear - 86) * 0.4));
          })();
          rmdAmount = taxDeferredBalanceForRMD / rmdFactor;
          yearWithdrawal = Math.max(yearWithdrawal, rmdAmount);
        }

        const taxableBalance = getAccountTotal('taxable');
        const effectiveRunningTaxableBasis = Math.min(taxableBalance, runningTaxableBasis);
        const estimatedCurrentGainRatio = taxableBalance > 0 ? Math.max(0, (taxableBalance - effectiveRunningTaxableBasis) / taxableBalance) : 0;

        let socialSecurityIncome = 0;
        if (currentAgeThisYear >= socialSecurityStartAge && socialSecurityAmount > 0) {
          const yearsOfSSInflation = currentAgeThisYear - socialSecurityStartAge;
          socialSecurityIncome = socialSecurityAmount * Math.pow(1 + effectiveInflation / 100, yearsOfSSInflation);
        }

        const totalOtherIncome = otherRetirementIncome + socialSecurityIncome;
        retirementSpendingOnly = desiredWithdrawal;
        totalWithdrawalForTaxCalculation = retirementSpendingOnly + yearGoalWithdrawal;
        const totalAvailableBalance = getTotalLiquid();
        const cappedWithdrawal = Math.min(totalWithdrawalForTaxCalculation, totalAvailableBalance);

        const taxEstimate = estimateRetirementWithdrawalTaxes({
          withdrawalNeeded: cappedWithdrawal,
          taxableBalance: getAccountTotal('taxable'),
          taxDeferredBalance: getAccountTotal('taxDeferred'),
          taxFreeBalance: getAccountTotal('taxFree'),
          taxableGainPercent: estimatedCurrentGainRatio,
          isLongTermGain: true, filingStatus,
          age: currentAgeThisYear, otherIncome: totalOtherIncome,
        });

        withdrawFromTaxable = taxEstimate.fromTaxable || 0;
        withdrawFromTaxDeferred = taxEstimate.fromTaxDeferred || 0;
        withdrawFromTaxFree = taxEstimate.fromTaxFree || 0;
        taxesPaid = taxEstimate.totalTax || 0;
        penaltyPaid = taxEstimate.totalPenalty || 0;

        if (withdrawFromTaxable > 0 && getAccountTotal('taxable') > 0) {
          const basisRatio = runningTaxableBasis / getAccountTotal('taxable');
          runningTaxableBasis = Math.max(0, runningTaxableBasis - (withdrawFromTaxable * basisRatio));
        }

        const withdrawFromAccount = (accountKey, amount) => {
          const acct = portfolio[accountKey];
          const total = getAccountTotal(accountKey);
          if (total <= 0 || amount <= 0) return 0;
          const actualWithdrawal = Math.min(amount, total);
          const ratio = actualWithdrawal / total;
          acct.btc = Math.max(0, acct.btc * (1 - ratio));
          acct.stocks = Math.max(0, acct.stocks * (1 - ratio));
          acct.bonds = Math.max(0, acct.bonds * (1 - ratio));
          acct.cash = Math.max(0, acct.cash * (1 - ratio));
          acct.other = Math.max(0, acct.other * (1 - ratio));
          return actualWithdrawal;
        };

        withdrawFromAccount('taxable', withdrawFromTaxable);
        withdrawFromAccount('taxDeferred', withdrawFromTaxDeferred);
        withdrawFromAccount('taxFree', withdrawFromTaxFree);

        let totalWithdrawnFromAccounts = withdrawFromTaxable + withdrawFromTaxDeferred + withdrawFromTaxFree;
        const actualWithdrawalNeeded = totalWithdrawalForTaxCalculation;
        let remainingShortfall = actualWithdrawalNeeded - totalWithdrawnFromAccounts;
        
        if (remainingShortfall > 0) {
          const taxableRemaining = getAccountTotal('taxable');
          if (remainingShortfall > 0 && taxableRemaining > 0) {
            const forceFromTaxable = Math.min(remainingShortfall, taxableRemaining);
            withdrawFromAccount('taxable', forceFromTaxable);
            withdrawFromTaxable += forceFromTaxable;
            totalWithdrawnFromAccounts += forceFromTaxable;
            remainingShortfall -= forceFromTaxable;
          }
          
          const taxDeferredRemaining = getAccountTotal('taxDeferred');
          if (remainingShortfall > 0 && taxDeferredRemaining > 0) {
            const forceFromTaxDeferred = Math.min(remainingShortfall, taxDeferredRemaining);
            withdrawFromAccount('taxDeferred', forceFromTaxDeferred);
            withdrawFromTaxDeferred += forceFromTaxDeferred;
            totalWithdrawnFromAccounts += forceFromTaxDeferred;
            remainingShortfall -= forceFromTaxDeferred;
          }
          
          const taxFreeRemaining = getAccountTotal('taxFree');
          if (remainingShortfall > 0 && taxFreeRemaining > 0) {
            const forceFromTaxFree = Math.min(remainingShortfall, taxFreeRemaining);
            withdrawFromAccount('taxFree', forceFromTaxFree);
            withdrawFromTaxFree += forceFromTaxFree;
            totalWithdrawnFromAccounts += forceFromTaxFree;
            remainingShortfall -= forceFromTaxFree;
          }
          
          if (remainingShortfall > 0 && portfolio.realEstate > 0) {
            realEstateSaleProceeds = portfolio.realEstate;
            portfolio.realEstate = 0;
            withdrawFromRealEstate = Math.min(remainingShortfall, realEstateSaleProceeds);
            const excessProceeds = realEstateSaleProceeds - withdrawFromRealEstate;
            if (excessProceeds > 0) {
              portfolio.taxable.cash += excessProceeds;
            }
            remainingShortfall -= withdrawFromRealEstate;
          }
          
          if (remainingShortfall > 0 && getTotalPortfolio() < 100) {
            ranOutOfMoney = true;
          }
        }

        if (getTotalPortfolio() <= 0 && !ranOutOfMoney) {
          ranOutOfMoney = true;
        }
      }

      let adjustedEventImpact = eventImpact;
      lifeEvents.forEach(event => {
        if (event.year === year && event.affects === 'assets' && event.amount > 0 && event.allocation_method === 'custom') {
          adjustedEventImpact -= event.amount;
        }
      });

      const totalDebt = Object.values(tempRunningDebt).reduce((sum, liab) => sum + liab.current_balance, 0) +
                        Object.values(tempRunningCollateralizedLoans).reduce((sum, loan) => sum + loan.current_balance, 0);

      const currentTotalEncumberedBtc = Object.values(encumberedBtc).reduce((sum, amount) => sum + amount, 0);
      const totalReleasedBtc = Object.values(releasedBtc).reduce((sum, amount) => sum + amount, 0);
      const yearLiquidations = liquidationEvents.filter(e => e.year === year);
      const yearBtcPriceForChart = currentPrice * Math.pow(1 + yearBtcGrowth / 100, i);

      const totalAssetsThisYear = getTotalPortfolio() + (currentTotalEncumberedBtc * yearBtcPriceForChart);
      let total = totalAssetsThisYear + adjustedEventImpact;

      if (getTotalPortfolio() <= 0 && !ranOutOfMoney) {
        ranOutOfMoney = true;
      }

      if (ranOutOfMoney) {
        total = 0;
        portfolio.taxable = { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 };
        portfolio.taxDeferred = { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 };
        portfolio.taxFree = { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 };
        portfolio.realEstate = 0;
      }

      const realTotal = total / Math.pow(1 + effectiveInflation / 100, i);
      const totalWithdrawalAmount = isRetired 
        ? Math.round((retirementSpendingOnly || 0) + (taxesPaid || 0) + (penaltyPaid || 0) + (yearGoalWithdrawal || 0))
        : yearSavings < 0 
          ? Math.round(Math.abs(yearSavings) + (taxesPaid || 0) + (penaltyPaid || 0))
          : 0;

      data.push({
        age: currentAge + i, year,
        btcLiquid: Math.round(getAssetTotal('btc')),
        btcEncumbered: Math.round(currentTotalEncumberedBtc * yearBtcPriceForChart),
        stocks: Math.round(getAssetTotal('stocks')),
        realEstate: Math.round(portfolio.realEstate),
        bonds: Math.round(getAssetTotal('bonds')),
        cash: Math.round(getAssetTotal('cash')),
        savings: Math.round(cumulativeSavings),
        netCashFlow: Math.round(yearSavings),
        yearGrossIncome: !isRetired ? Math.round((grossAnnualIncome * Math.pow(1 + incomeGrowth / 100, i)) + activeIncomeAdjustment) : 0,
        yearSpending: !isRetired ? Math.round((currentAnnualSpending * Math.pow(1 + inflationRate / 100, i)) + activeExpenseAdjustment) : 0,
        total: Math.round(total),
        realTotal: Math.round(realTotal),
        hasEvent: lifeEvents.some(e => e.year === year) || goals.some(g => g.will_be_spent && g.target_date && new Date(g.target_date).getFullYear() === year),
        hasGoalWithdrawal: yearGoalWithdrawal > 0,
        isRetired, isWithdrawing: isRetired || yearSavings < 0,
        yearWithdrawal: isRetired ? Math.round(totalWithdrawalForTaxCalculation) : 0,
        yearGoalWithdrawal: Math.round(yearGoalWithdrawal),
        retirementSpendingOnly: isRetired ? Math.round(retirementSpendingOnly) : 0,
        goalNames: yearGoalNames,
        btcGrowthRate: yearBtcGrowth,
        taxable: Math.round(getAccountTotal('taxable')),
        taxDeferred: Math.round(getAccountTotal('taxDeferred')),
        taxFree: Math.round(getAccountTotal('taxFree')),
        accountTotal: Math.round(getTotalLiquid()),
        canAccessPenaltyFree: currentAge + i >= PENALTY_FREE_AGE,
        penaltyPaid: Math.round(penaltyPaid),
        taxesPaid: Math.round(taxesPaid),
        totalWithdrawalAmount,
        withdrawFromTaxable: Math.round(withdrawFromTaxable),
        withdrawFromTaxDeferred: Math.round(withdrawFromTaxDeferred),
        withdrawFromTaxFree: Math.round(withdrawFromTaxFree),
        realEstateSold: realEstateSaleProceeds > 0,
        realEstateSaleProceeds: Math.round(realEstateSaleProceeds || 0),
        withdrawFromRealEstate: Math.round(withdrawFromRealEstate || 0),
        totalDebt: Math.round(totalDebt),
        debtPayments: Math.round(actualAnnualDebtPayments),
        encumberedBtc: currentTotalEncumberedBtc,
        releasedBtc: totalReleasedBtc,
        liquidBtc: Math.max(0, getAssetTotal('btc') / (btcPrice || 97000)),
        debtPayoffs: debtPayoffEvents,
        liquidations: yearLiquidations,
        btcLoanDetails: (() => {
          const btcLoans = Object.values(tempRunningDebt).filter(l => l.type === 'btc_collateralized' && !l.paid_off);
          const yearBtcPrice = currentPrice * Math.pow(1 + yearBtcGrowth / 100, i);
          
          return btcLoans.map(loan => {
            const collateralBtc = encumberedBtc[loan.id] || loan.collateral_btc_amount || 0;
            const collateralValue = collateralBtc * yearBtcPrice;
            const ltv = collateralValue > 0 ? (loan.current_balance / collateralValue) * 100 : 0;
            
            return {
              name: loan.name,
              balance: Math.round(loan.current_balance),
              collateralBtc,
              collateralValue: Math.round(collateralValue),
              ltv: Math.round(ltv),
              status: ltv < 40 ? 'healthy' : ltv < 60 ? 'moderate' : 'elevated'
            };
          });
        })(),
        totalBtcLoanDebt: Math.round(Object.values(tempRunningDebt)
          .filter(l => l.type === 'btc_collateralized' && !l.paid_off)
          .reduce((sum, l) => sum + l.current_balance, 0)),
        totalBtcCollateralValue: Math.round((() => {
          const yearBtcPrice = currentPrice * Math.pow(1 + yearBtcGrowth / 100, i);
          return Object.values(tempRunningDebt)
            .filter(l => l.type === 'btc_collateralized' && !l.paid_off)
            .reduce((sum, l) => {
              const collateralBtc = encumberedBtc[l.id] || l.collateral_btc_amount || 0;
              return sum + (collateralBtc * yearBtcPrice);
            }, 0);
        })()),
        totalRegularDebt: Math.round(Object.values(tempRunningDebt)
          .filter(l => l.type !== 'btc_collateralized' && !l.paid_off)
          .reduce((sum, l) => sum + l.current_balance, 0)),
      });
    }
    return data;
  }, [btcValue, stocksValue, realEstateValue, bondsValue, cashValue, otherValue, taxableValue, taxDeferredValue, taxFreeValue, currentAge, retirementAge, lifeExpectancy, effectiveBtcCagr, effectiveStocksCagr, realEstateCagr, bondsCagr, effectiveInflation, lifeEvents, goals, annualSavings, incomeGrowth, retirementAnnualSpending, btcReturnModel, filingStatus, taxableHoldings, otherRetirementIncome, socialSecurityStartAge, socialSecurityAmount, liabilities, collateralizedLoans, monthlyDebtPayments, btcPrice, cashCagr, otherCagr, autoTopUpBtcCollateral, btcTopUpTriggerLtv, btcTopUpTargetLtv]);

  const handleRunSimulation = () => {
    const { paths: simulations, successResults, withdrawalPaths } = runMonteCarloSimulation({
      btcValue, stocksValue, realEstateValue, bondsValue, otherValue,
      taxableValue, taxDeferredValue, taxFreeValue,
      currentAge, retirementAge, lifeExpectancy,
      getBtcGrowthRate: (year) => getBtcGrowthRate(year, effectiveInflation),
      stocksCagr: effectiveStocksCagr, realEstateCagr, bondsCagr,
      inflationRate: effectiveInflation, annualSavings, incomeGrowth,
      retirementAnnualSpending, lifeEvents, btcVolatility: 60, stocksVolatility,
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
  const depletionIndex = projections.findIndex(p => p.total <= 0);
  const willRunOutOfMoney = depletionIndex !== -1;
  const runOutOfMoneyAge = willRunOutOfMoney ? projections[depletionIndex]?.age : null;
  const yearsInRetirement = lifeExpectancy - retirementAge;
  const yearsToRetirement = Math.max(0, retirementAge - currentAge);
  const inflationAdjustedRetirementSpending = retirementAnnualSpending * Math.pow(1 + inflationRate / 100, yearsToRetirement);
  const effectiveWithdrawalRate = Math.max(0.03, 1 / yearsInRetirement);
  const requiredNestEgg = inflationAdjustedRetirementSpending / effectiveWithdrawalRate;

  const retirementStatus = useMemo(() => {
    if (willRunOutOfMoney) {
      return {
        type: 'critical', title: 'Critical: Plan Not Sustainable',
        description: `Portfolio projected to deplete at age ${runOutOfMoneyAge}.`,
        icon: <AlertTriangle className="w-5 h-5" />
      };
    }
    if (earliestRetirementAge === null) {
      return {
        type: 'critical', title: 'At Risk: Major Shortfall',
        description: `Retirement not achievable at target age ${retirementAge} with current plan.`,
        icon: <AlertTriangle className="w-5 h-5" />
      };
    }
    const gap = earliestRetirementAge - retirementAge;
    if (gap > 3) {
      return {
        type: 'at_risk', title: 'At Risk: Adjustments Needed',
        description: `Earliest sustainable retirement: Age ${earliestRetirementAge} (${gap} years later than target).`,
        icon: <AlertTriangle className="w-5 h-5" />
      };
    } else if (gap > 0) {
      return {
        type: 'on_track', title: 'Nearly On Track',
        description: `Close to target! Earliest retirement: Age ${earliestRetirementAge} (${gap} years from target).`,
        icon: <TrendingUp className="w-5 h-5" />
      };
    } else {
      const yearsEarly = Math.abs(gap);
      return {
        type: 'optimistic', title: 'Ahead of Schedule!',
        description: yearsEarly > 0
          ? `You can retire ${yearsEarly} year${yearsEarly !== 1 ? 's' : ''} earlier at Age ${earliestRetirementAge}.`
          : `On track to retire at Age ${retirementAge} as planned.`,
        icon: <Sparkles className="w-5 h-5" />
      };
    }
  }, [earliestRetirementAge, retirementAge, willRunOutOfMoney, runOutOfMoneyAge]);

  const derivedEarliestRetirementAge = useMemo(() => {
    const total = btcValue + stocksValue + realEstateValue + bondsValue + cashValue + otherValue;
    if (total <= 0) return null;
    
    const btcPct = btcValue / total;
    const stocksPct = stocksValue / total;
    const realEstatePct = realEstateValue / total;
    const bondsPct = bondsValue / total;
    const cashPct = cashValue / total;
    const otherPct = otherValue / total;
    
    for (let testRetireAge = currentAge + 1; testRetireAge <= lifeExpectancy - 5; testRetireAge++) {
      const result = simulateForward({
        startingPortfolio: total, startAge: currentAge, endAge: lifeExpectancy, retireAge: testRetireAge,
        annualSpending: retirementAnnualSpending, annualSavings, inflationRate: effectiveInflation,
        btcPct, stocksPct, realEstatePct, bondsPct, cashPct, otherPct,
      });
      if (result.survives) return testRetireAge;
    }
    return null;
  }, [currentAge, lifeExpectancy, btcValue, stocksValue, realEstateValue, bondsValue, cashValue, otherValue, retirementAnnualSpending, annualSavings, effectiveInflation, effectiveStocksCagr, realEstateCagr, bondsCagr, cashCagr, otherCagr, incomeGrowth, getBtcGrowthRate]);

  useEffect(() => {
    setEarliestRetirementAge(derivedEarliestRetirementAge);
  }, [derivedEarliestRetirementAge]);

  const derivedMaxSustainableSpending = useMemo(() => {
    const total = btcValue + stocksValue + realEstateValue + bondsValue + cashValue + otherValue;
    if (total <= 0) return 0;
    
    const btcPct = btcValue / total;
    const stocksPct = stocksValue / total;
    const realEstatePct = realEstateValue / total;
    const bondsPct = bondsValue / total;
    const cashPct = cashValue / total;
    const otherPct = otherValue / total;
    
    let low = 0;
    let high = total * 0.20;
    
    for (let iteration = 0; iteration < 30; iteration++) {
      const testSpending = (low + high) / 2;
      const result = simulateForward({
        startingPortfolio: total, startAge: currentAge, endAge: lifeExpectancy, retireAge: retirementAge,
        annualSpending: testSpending, annualSavings, inflationRate: effectiveInflation,
        btcPct, stocksPct, realEstatePct, bondsPct, cashPct, otherPct,
      });
      if (result.survives) low = testSpending;
      else high = testSpending;
    }
    return Math.round(low);
  }, [currentAge, retirementAge, lifeExpectancy, btcValue, stocksValue, realEstateValue, bondsValue, cashValue, otherValue, annualSavings, effectiveInflation, effectiveStocksCagr, realEstateCagr, bondsCagr, cashCagr, otherCagr, incomeGrowth, getBtcGrowthRate]);

  useEffect(() => {
    setMaxSustainableSpending(derivedMaxSustainableSpending);
  }, [derivedMaxSustainableSpending]);

  const lifetimeTaxesPaid = projections.filter(p => p.isRetired).reduce((sum, p) => sum + (p.taxesPaid || 0), 0);
  const lifetimePenaltiesPaid = projections.filter(p => p.isRetired).reduce((sum, p) => sum + (p.penaltyPaid || 0), 0);
  const avgAnnualTaxInRetirement = yearsInRetirement > 0 ? lifetimeTaxesPaid / yearsInRetirement : 0;

  const projectedPortfolioReturn = useMemo(() => {
    if (totalValue <= 0) return 0;
    const btcPct = btcValue / totalValue;
    const stocksPct = stocksValue / totalValue;
    const realEstatePct = realEstateValue / totalValue;
    const bondsPct = bondsValue / totalValue;
    const cashPct = cashValue / totalValue;
    const otherPct = otherValue / totalValue;
    const btcExpectedReturn = getBtcGrowthRate(1, effectiveInflation);
    const weightedReturn = (
      btcPct * btcExpectedReturn +
      stocksPct * effectiveStocksCagr +
      realEstatePct * realEstateCagr +
      bondsPct * bondsCagr +
      cashPct * cashCagr +
      otherPct * otherCagr
    );
    return weightedReturn;
  }, [btcValue, stocksValue, realEstateValue, bondsValue, cashValue, otherValue, totalValue, effectiveStocksCagr, realEstateCagr, bondsCagr, cashCagr, getBtcGrowthRate, otherCagr, effectiveInflation]);

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
        ...goal, meetYear, meetAge, onTrackForDate, projectedAtTargetDate,
        monthlyNeeded, yearsToTarget, remainingNeeded,
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
        ...event, yearsFromNow, portfolioAtEvent,
        isAffordable, impactPercent, totalCashNeeded,
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
    income_change: Briefcase, expense_change: DollarSign, asset_purchase: Home,
    asset_sale: TrendingUp, retirement: Heart, inheritance: Heart,
    major_expense: Car, home_purchase: Home, other: Calendar,
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
        name: editingGoal.name || '', target_amount: editingGoal.target_amount || '',
        current_amount: editingGoal.current_amount || '', target_date: editingGoal.target_date || '',
        goal_type: editingGoal.goal_type || 'other', priority: editingGoal.priority || 'medium', notes: editingGoal.notes || '',
      });
    }
  }, [editingGoal]);

  useEffect(() => {
    if (editingEvent) {
      setEventForm({
        name: editingEvent.name || '', event_type: editingEvent.event_type || 'expense_change',
        year: editingEvent.year || new Date().getFullYear() + 1,
        amount: editingEvent.amount || '', is_recurring: editingEvent.is_recurring || false,
        recurring_years: editingEvent.recurring_years || '', affects: editingEvent.affects || 'expenses',
        notes: editingEvent.notes || '', monthly_expense_impact: editingEvent.monthly_expense_impact || '',
        liability_amount: editingEvent.liability_amount || '', down_payment: editingEvent.down_payment || '',
        interest_rate: editingEvent.interest_rate || '', loan_term_years: editingEvent.loan_term_years || '',
        allocation_method: editingEvent.allocation_method || 'proportionate',
        btc_allocation: editingEvent.btc_allocation || 0, stocks_allocation: editingEvent.stocks_allocation || 0,
        real_estate_allocation: editingEvent.real_estate_allocation || 0, bonds_allocation: editingEvent.bonds_allocation || 0,
        cash_allocation: editingEvent.cash_allocation || 0, other_allocation: editingEvent.other_allocation || 0,
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
      ...eventForm, year: parseInt(eventForm.year), amount: parseFloat(eventForm.amount) || 0,
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
                <span className="text-orange-400 font-semibold">{btcReturnModel === 'custom' ? btcCagr : getBtcGrowthRate(0, effectiveInflation)}%</span>
              </div>
              <Slider value={[btcCagr]} onValueChange={([v]) => { setBtcCagr(v); setBtcReturnModel('custom'); }} min={-20} max={100} step={1} disabled={btcReturnModel !== 'custom'} />
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

      <p className="text-zinc-500 text-sm">File truncated - UI rendering continues below...</p>
    </div>
  );
}