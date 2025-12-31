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
  getTaxDataForYear,
  calculateTaxableSocialSecurity,
  estimateSocialSecurityBenefit
} from '@/components/tax/taxCalculations';
import { getRMDFactor } from '@/components/shared/taxData';
import { get401kLimit, getRothIRALimit, getHSALimit, getTaxConfigForYear } from '@/components/shared/taxConfig';
import { getStateOptions, getStateTaxSummary, STATE_TAX_CONFIG, calculateStateTaxOnRetirement, calculateStateCapitalGainsTax } from '@/components/shared/stateTaxConfig';
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

// Bitcoin volatility model - starts high and decays over time based on historical trends
// Historical: ~80% in 2011-2013, ~60% in 2017-2018, ~40-50% in 2021-2024
// Projects continued decline as Bitcoin matures as an asset class
const getBtcVolatility = (yearFromNow) => {
  const initialVolatility = 55; // Current approximate annualized volatility
  const minimumVolatility = 20; // Floor - won't go below this (mature asset level)
  const decayRate = 0.05; // 5% reduction per year

  // Exponential decay model: vol(t) = min + (initial - min) * e^(-decay * t)
  const volatility = minimumVolatility + (initialVolatility - minimumVolatility) * Math.exp(-decayRate * yearFromNow);
  return volatility;
};

// Monte Carlo simulation - uses same logic as main projections
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
  const withdrawalPaths = []; // Track withdrawals per simulation
  const years = Math.max(1, lifeExpectancy - currentAge);
  const yearsToRetirement = Math.max(0, retirementAge - currentAge);
  const totalStartingAssets = btcValue + stocksValue + realEstateValue + bondsValue + otherValue;
  const totalStartingAccounts = taxableValue + taxDeferredValue + taxFreeValue;

  // Use account totals if available, otherwise use asset totals
  const startingPortfolio = totalStartingAccounts > 0 ? totalStartingAccounts : totalStartingAssets;

  // Calculate portfolio allocation percentages for growth rates
  const btcPct = totalStartingAssets > 0 ? btcValue / totalStartingAssets : 0;
  const stocksPct = totalStartingAssets > 0 ? stocksValue / totalStartingAssets : 0;
  const realEstatePct = totalStartingAssets > 0 ? realEstateValue / totalStartingAssets : 0;
  const bondsPct = totalStartingAssets > 0 ? bondsValue / totalStartingAssets : 0;
  const otherPct = totalStartingAssets > 0 ? otherValue / totalStartingAssets : 0;

  for (let sim = 0; sim < numSimulations; sim++) {
    // Track by account type (same as main projections)
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

      // Calculate active income/expense adjustments for THIS year only
      let activeIncomeAdjustment = 0;
      let activeExpenseAdjustment = 0;
      
      lifeEvents.forEach(event => {
        if (event.event_type === 'income_change') {
          const eventEndYear = event.year + (event.is_recurring ? (event.recurring_years || 1) : 1);
          const isActive = simulationAbsoluteYear >= event.year && simulationAbsoluteYear < eventEndYear;
          if (isActive) {
            activeIncomeAdjustment += event.amount;
          }
        }
        
        if (event.event_type === 'expense_change') {
          const eventEndYear = event.year + (event.is_recurring ? (event.recurring_years || 1) : 1);
          const isActive = simulationAbsoluteYear >= event.year && simulationAbsoluteYear < eventEndYear;
          if (isActive) {
            activeExpenseAdjustment += event.amount;
          }
        }
        
        if (event.event_type === 'home_purchase' && event.year <= simulationAbsoluteYear && event.monthly_expense_impact > 0) {
          activeExpenseAdjustment += event.monthly_expense_impact * 12;
        }
      });

      // Get expected BTC return based on model
      const expectedBtcReturn = getBtcGrowthRate(year, inflationRate);

      // Get dynamic BTC volatility for this year (decreases over time)
      const yearBtcVolatility = getBtcVolatility(year);

      // Generate random returns (Box-Muller for normal distribution)
      const u1 = Math.max(0.0001, Math.random());
      const u2 = Math.random();
      const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const z2 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);

      // Asset returns with realistic volatility (BTC volatility now dynamic)
      const btcReturn = Math.max(-60, Math.min(200, expectedBtcReturn + yearBtcVolatility * z1));
      const stocksReturn = Math.max(-40, Math.min(50, stocksCagr + stocksVolatility * z2));
      const realEstateReturn = realEstateCagr + (Math.random() * 10 - 5);
      const bondsReturn = bondsCagr + (Math.random() * 4 - 2);

      // Calculate blended portfolio return based on allocation
      const portfolioReturn = (
        btcPct * btcReturn +
        stocksPct * stocksReturn +
        realEstatePct * realEstateReturn +
        bondsPct * bondsReturn +
        otherPct * stocksReturn
      ) / 100;

      // Only grow if not already out of money
      if (!ranOutOfMoney) {
        runningTaxable = Math.max(0, runningTaxable * (1 + portfolioReturn));
        runningTaxDeferred = Math.max(0, runningTaxDeferred * (1 + portfolioReturn));
        runningTaxFree = Math.max(0, runningTaxFree * (1 + portfolioReturn));
      }

      let yearWithdrawal = 0;

      if (!isRetired) {
        // Add annual net cash flow to taxable (can be positive or negative), adjusted by life events
        const adjustedAnnualSavings = annualSavings + activeIncomeAdjustment - activeExpenseAdjustment;
        const yearNetCashFlow = adjustedAnnualSavings * Math.pow(1 + incomeGrowth / 100, year);
        runningTaxable += yearNetCashFlow;
      } else {
        // Income-based withdrawal (inflation-adjusted spending need)
        yearWithdrawal = retirementAnnualSpending * Math.pow(1 + inflationRate / 100, yearsToRetirement + yearsIntoRetirement);

        // Withdraw in priority order: Taxable -> Tax-Deferred -> Tax-Free
        let remaining = yearWithdrawal;

        // 1. Taxable first
        const fromTaxable = Math.min(remaining, runningTaxable);
        runningTaxable -= fromTaxable;
        remaining -= fromTaxable;

        // 2. Tax-Deferred second
        const fromTaxDeferred = Math.min(remaining, runningTaxDeferred);
        runningTaxDeferred -= fromTaxDeferred;
        remaining -= fromTaxDeferred;

        // 3. Tax-Free last
        const fromTaxFree = Math.min(remaining, runningTaxFree);
        runningTaxFree -= fromTaxFree;
        remaining -= fromTaxFree;

        // Check if ran out of money
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

// Calculate success probability (percentage of simulations that didn't run out of money)
const calculateSuccessProbability = (successResults) => {
  const successCount = successResults.filter(s => s).length;
  return (successCount / successResults.length) * 100;
};

// Calculate percentiles from simulation results
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

  // Assumption states - will be loaded from UserSettings
  const [btcCagr, setBtcCagr] = useState(25);
  const [stocksCagr, setStocksCagr] = useState(7);
  const [stocksVolatility, setStocksVolatility] = useState(15);
  const [realEstateCagr, setRealEstateCagr] = useState(4);
  const [bondsCagr, setBondsCagr] = useState(3);
  const [cashCagr, setCashCagr] = useState(0);
  const [otherCagr, setOtherCagr] = useState(7);
  const [inflationRate, setInflationRate] = useState(3);
  const [incomeGrowth, setIncomeGrowth] = useState(3);

  // Retirement settings - will be loaded from UserSettings
  const [retirementAge, setRetirementAge] = useState(65);
  const [currentAge, setCurrentAge] = useState(35);
  const [lifeExpectancy, setLifeExpectancy] = useState(90);
  const [currentAnnualSpending, setCurrentAnnualSpending] = useState(80000);
  const [retirementAnnualSpending, setRetirementAnnualSpending] = useState(100000);
  const [grossAnnualIncome, setGrossAnnualIncome] = useState(100000);



  // BTC return model (separate from withdrawal)
  const [btcReturnModel, setBtcReturnModel] = useState('custom');

  // Tax settings
  const [filingStatus, setFilingStatus] = useState(() => {
    return localStorage.getItem('userFilingStatus') || 'single';
  });
  const [otherRetirementIncome, setOtherRetirementIncome] = useState(0);
  const [socialSecurityStartAge, setSocialSecurityStartAge] = useState(67);
  const [socialSecurityAmount, setSocialSecurityAmount] = useState(0);
  const [useCustomSocialSecurity, setUseCustomSocialSecurity] = useState(false);

  // Savings allocation percentages
  const [savingsAllocationBtc, setSavingsAllocationBtc] = useState(80);
  const [savingsAllocationStocks, setSavingsAllocationStocks] = useState(20);
  const [savingsAllocationBonds, setSavingsAllocationBonds] = useState(0);
  const [savingsAllocationCash, setSavingsAllocationCash] = useState(0);
  const [savingsAllocationOther, setSavingsAllocationOther] = useState(0);

  // Retirement savings allocation
  const [contribution401k, setContribution401k] = useState(0);
  const [employer401kMatch, setEmployer401kMatch] = useState(0);
  const [contributionRothIRA, setContributionRothIRA] = useState(0);
  const [contributionHSA, setContributionHSA] = useState(0);
  const [hsaFamilyCoverage, setHsaFamilyCoverage] = useState(false);

  // BTC Collateral Management Settings
  const [autoTopUpBtcCollateral, setAutoTopUpBtcCollateral] = useState(true);
  const [btcTopUpTriggerLtv, setBtcTopUpTriggerLtv] = useState(70);
  const [btcTopUpTargetLtv, setBtcTopUpTargetLtv] = useState(65); // Ledn brings LTV to 65% after auto top-up

  // State tax settings
  const [stateOfResidence, setStateOfResidence] = useState(() => {
    return localStorage.getItem('userStateOfResidence') || 'TX';
  });

  // Settings loaded flag
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Monte Carlo
  const [runSimulation, setRunSimulation] = useState(false);
  const [simulationResults, setSimulationResults] = useState(null);
  const [successProbability, setSuccessProbability] = useState(null);

  // Forms
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  
  // Tooltip locking state
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

  // Click outside to dismiss locked tooltip
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (lockedTooltipData && chartContainerRef.current && !chartContainerRef.current.contains(event.target)) {
        setLockedTooltipData(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [lockedTooltipData]);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('userStateOfResidence', stateOfResidence);
  }, [stateOfResidence]);

  useEffect(() => {
    localStorage.setItem('userFilingStatus', filingStatus);
  }, [filingStatus]);

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

  // Load settings from UserSettings entity
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
                  if (settings.use_custom_social_security !== undefined) setUseCustomSocialSecurity(settings.use_custom_social_security);
                  if (settings.savings_allocation_btc !== undefined) setSavingsAllocationBtc(settings.savings_allocation_btc);
                  if (settings.savings_allocation_stocks !== undefined) setSavingsAllocationStocks(settings.savings_allocation_stocks);
                  if (settings.savings_allocation_bonds !== undefined) setSavingsAllocationBonds(settings.savings_allocation_bonds);
                  if (settings.savings_allocation_cash !== undefined) setSavingsAllocationCash(settings.savings_allocation_cash);
                  if (settings.savings_allocation_other !== undefined) setSavingsAllocationOther(settings.savings_allocation_other);
                  if (settings.gross_annual_income !== undefined) setGrossAnnualIncome(settings.gross_annual_income);
                  if (settings.contribution_401k !== undefined) setContribution401k(settings.contribution_401k);
                  if (settings.employer_401k_match !== undefined) setEmployer401kMatch(settings.employer_401k_match);
                  if (settings.contribution_roth_ira !== undefined) setContributionRothIRA(settings.contribution_roth_ira);
                  if (settings.contribution_hsa !== undefined) setContributionHSA(settings.contribution_hsa);
                  if (settings.hsa_family_coverage !== undefined) setHsaFamilyCoverage(settings.hsa_family_coverage);
                  // filing_status is managed via localStorage for cross-page sync, don't override from UserSettings
                  if (settings.auto_top_up_btc_collateral !== undefined) setAutoTopUpBtcCollateral(settings.auto_top_up_btc_collateral);
                  if (settings.btc_top_up_trigger_ltv !== undefined) setBtcTopUpTriggerLtv(settings.btc_top_up_trigger_ltv);
                  if (settings.btc_top_up_target_ltv !== undefined) setBtcTopUpTargetLtv(settings.btc_top_up_target_ltv);
                  setSettingsLoaded(true);
    }
  }, [userSettings, settingsLoaded]);

  // Save settings mutation
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

  // Auto-save settings when they change
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
                      use_custom_social_security: useCustomSocialSecurity,
                      savings_allocation_btc: savingsAllocationBtc,
                      savings_allocation_stocks: savingsAllocationStocks,
                      savings_allocation_bonds: savingsAllocationBonds,
                      savings_allocation_cash: savingsAllocationCash,
                      savings_allocation_other: savingsAllocationOther,
                      gross_annual_income: grossAnnualIncome || 100000,
                      contribution_401k: contribution401k || 0,
                      employer_401k_match: employer401kMatch || 0,
                      contribution_roth_ira: contributionRothIRA || 0,
                      contribution_hsa: contributionHSA || 0,
                      hsa_family_coverage: hsaFamilyCoverage || false,
                      filing_status: filingStatus || 'single',
                      auto_top_up_btc_collateral: autoTopUpBtcCollateral,
                      btc_top_up_trigger_ltv: btcTopUpTriggerLtv || 70,
                      btc_top_up_target_ltv: btcTopUpTargetLtv || 65,
                    });
    }, 1000); // Debounce 1 second
    return () => clearTimeout(timeoutId);
  }, [settingsLoaded, btcCagr, stocksCagr, stocksVolatility, realEstateCagr, bondsCagr, cashCagr, otherCagr, inflationRate, incomeGrowth, retirementAge, currentAge, lifeExpectancy, currentAnnualSpending, retirementAnnualSpending, btcReturnModel, otherRetirementIncome, socialSecurityStartAge, socialSecurityAmount, useCustomSocialSecurity, grossAnnualIncome, contribution401k, employer401kMatch, contributionRothIRA, contributionHSA, hsaFamilyCoverage, filingStatus, autoTopUpBtcCollateral, btcTopUpTriggerLtv, btcTopUpTargetLtv, savingsAllocationBtc, savingsAllocationStocks, savingsAllocationBonds, savingsAllocationCash, savingsAllocationOther]);

  // Calculate accurate debt payments for current month
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

  // Calculate estimated Social Security benefit
  const estimatedSocialSecurity = estimateSocialSecurityBenefit(grossAnnualIncome, socialSecurityStartAge, currentAge);
  const effectiveSocialSecurity = useCustomSocialSecurity ? socialSecurityAmount : estimatedSocialSecurity;

  // Calculate annual net cash flow after estimated income tax and retirement contributions
  const currentYear = new Date().getFullYear();
  const { standardDeductions } = getTaxDataForYear(currentYear);
  const currentStandardDeduction = standardDeductions[filingStatus] || standardDeductions.single;
  
  // Get current contribution limits for validation
  const currentLimit401k = get401kLimit(currentYear, currentAge);
  const currentLimitRoth = getRothIRALimit(currentYear, currentAge);
  const currentLimitHSA = getHSALimit(currentYear, currentAge, hsaFamilyCoverage);
  
  // Cap contributions to limits
  const actual401k = Math.min(contribution401k || 0, currentLimit401k);
  const actualRoth = Math.min(contributionRothIRA || 0, currentLimitRoth);
  const actualHSA = Math.min(contributionHSA || 0, currentLimitHSA);
  
  // Pre-tax contributions (401k, HSA) reduce taxable income
  const taxableGrossIncome = Math.max(0, grossAnnualIncome - actual401k - actualHSA - currentStandardDeduction);
  const estimatedIncomeTax = calculateProgressiveIncomeTax(taxableGrossIncome, filingStatus, currentYear);
  
  // Net income after taxes
  const netIncome = grossAnnualIncome - estimatedIncomeTax;
  
  // Total retirement contributions (Roth comes from after-tax income)
  const totalRetirementContributions = actualRoth;
  
  // Annual net cash flow = netIncome - spending - rothContribution (CAN be negative)
  const annualSavings = netIncome - currentAnnualSpending - totalRetirementContributions;

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

  // Helper to determine tax treatment from account_type or tax_treatment field
  const getTaxTreatmentFromHolding = (h) => {
    // Get account_type from holding, or look it up from linked account
    let accountType = h.account_type || '';
    
    // If no account_type on holding but has account_id, try to get it from accounts
    if (!accountType && h.account_id && accounts?.length > 0) {
      const linkedAccount = accounts.find(a => a.id === h.account_id);
      if (linkedAccount?.account_type) {
        accountType = linkedAccount.account_type;
      }
    }
    
    const assetType = h.asset_type || '';
    
    // Real estate is illiquid - treated separately
    if (assetType === 'real_estate' || accountType === 'taxable_real_estate') {
      return 'real_estate';
    }
    
    // Tax-deferred: Traditional 401k, IRA, etc (support both naming conventions)
    if (['traditional_401k', 'traditional_ira', 'sep_ira', '403b', 
         '401k_traditional', 'ira_traditional'].includes(accountType)) {
      return 'tax_deferred';
    }
    
    // Tax-free: Roth accounts, HSA, 529 (support both naming conventions)
    if (['roth_401k', 'roth_ira', 'hsa', '529',
         '401k_roth', 'ira_roth'].includes(accountType)) {
      return 'tax_free';
    }
    
    // For non-retirement accounts, use explicit tax_treatment if set
    if (h.tax_treatment) return h.tax_treatment;
    
    // Default to taxable
    return 'taxable';
  };

  // Taxable accounts (accessible anytime) - excludes real estate which is separate
  const taxableHoldings = holdings.filter(h => getTaxTreatmentFromHolding(h) === 'taxable');
  const taxableValue = taxableHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);
  const taxableLiquidHoldings = taxableHoldings; // All taxable is now liquid since RE is separate
  const taxableLiquidValue = taxableValue;

  // Tax-deferred accounts (401k, Traditional IRA) - 10% penalty before 59½
  const taxDeferredHoldings = holdings.filter(h => getTaxTreatmentFromHolding(h) === 'tax_deferred');
  const taxDeferredValue = taxDeferredHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);

  // Tax-free accounts (Roth, HSA) - contributions accessible, gains after 59½
  const taxFreeHoldings = holdings.filter(h => getTaxTreatmentFromHolding(h) === 'tax_free');
  const taxFreeValue = taxFreeHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);

  // Real estate (illiquid) - last resort for withdrawals
  const realEstateHoldings = holdings.filter(h => getTaxTreatmentFromHolding(h) === 'real_estate');
  const realEstateAccountValue = realEstateHoldings.reduce((sum, h) => sum + getHoldingValue(h), 0);

  // By asset type for projections
  const btcValue = holdings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity * currentPrice, 0);
  const stocksValue = holdings.filter(h => h.asset_type === 'stocks').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const realEstateValue = holdings.filter(h => h.asset_type === 'real_estate').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const bondsValue = holdings.filter(h => h.asset_type === 'bonds').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const cashValue = holdings.filter(h => h.asset_type === 'cash').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const otherValue = holdings.filter(h => !['BTC'].includes(h.ticker) && !['stocks', 'real_estate', 'bonds', 'cash', 'btc', 'crypto'].includes(h.asset_type)).reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const totalValue = btcValue + stocksValue + realEstateValue + bondsValue + cashValue + otherValue;

  // Penalty-free age for retirement accounts
  const PENALTY_FREE_AGE = 59.5;
  const RMD_START_AGE = 73; // Required Minimum Distribution age

  // Calculate effective tax rates based on filing status
  const standardDeduction = STANDARD_DEDUCTION_2024[filingStatus] || STANDARD_DEDUCTION_2024.single;

  // Use slider values directly (scenarios removed)
  const effectiveBtcCagr = btcCagr;
  const effectiveStocksCagr = stocksCagr;
  const effectiveInflation = inflationRate;

  // BTC growth models - now based on btcReturnModel, not withdrawalStrategy
  const getBtcGrowthRate = (yearFromNow, inflationRate) => {
    switch (btcReturnModel) {
      case 'saylor24':
        // Saylor's Bitcoin 24 Model with extended phases:
        // Phase 1 (2025-2037): 50% declining to 20%
        // Phase 2 (2038-2045): Plateau at 20%
        // Phase 3 (2046-2075): Decline from 20% to inflation + 3%
        // Phase 4 (Beyond 2075): Terminal rate of inflation + 2%
        const currentYear = new Date().getFullYear();
        const absoluteYear = currentYear + yearFromNow;

        if (absoluteYear <= 2037) {
          // Phase 1: Linear decline from 50% to 20%
          const yearsFromStart = absoluteYear - 2025;
          return Math.max(20, 50 - (yearsFromStart * 2.5));
        } else if (absoluteYear <= 2045) {
          // Phase 2: Plateau at 20%
          return 20;
        } else if (absoluteYear <= 2075) {
          // Phase 3: Decline from 20% to inflation + 3%
          const yearsIntoDecline = absoluteYear - 2045;
          const totalDeclineYears = 2075 - 2045; // 30 years
          const targetRate = inflationRate + 3; // Mid-point of 2-4% above inflation
          const declineAmount = 20 - targetRate;
          return 20 - (declineAmount * (yearsIntoDecline / totalDeclineYears));
        } else {
          // Phase 4: Terminal rate (2% above inflation for long-term real returns)
          return inflationRate + 2;
        }
      case 'conservative':
        // Conservative model: 10% flat
        return 10;
      default:
        return effectiveBtcCagr;
    }
  };

  // Number formatting helper
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

  // Reusable simulation helper for consistent calculations across all derived values
  const simulateForward = (params) => {
    const {
      startingPortfolio,
      startAge,
      endAge,
      retireAge,
      annualSpending,        // Today's dollars
      annualSavings,         // Today's dollars (pre-retirement)
      inflationRate,
      // Asset allocation percentages (0-1)
      btcPct,
      stocksPct,
      realEstatePct,
      bondsPct,
      cashPct,
      otherPct,
    } = params;
    
    let portfolio = startingPortfolio;
    
    for (let age = startAge; age <= endAge; age++) {
      const yearIndex = age - startAge;
      const yearsFromNow = age - currentAge;
      const isRetired = age >= retireAge;
      
      // Calculate year-specific growth rates (captures Saylor declining model)
      const yearBtcGrowth = getBtcGrowthRate(yearsFromNow, inflationRate) / 100;
      
      // Blended growth based on allocation
      const blendedGrowth = (
        btcPct * yearBtcGrowth +
        stocksPct * (effectiveStocksCagr / 100) +
        realEstatePct * (realEstateCagr / 100) +
        bondsPct * (bondsCagr / 100) +
        cashPct * (cashCagr / 100) +
        otherPct * (otherCagr / 100)
      );
      
      // Apply growth first
      if (yearIndex > 0) {
        portfolio *= (1 + blendedGrowth);
      }
      
      if (isRetired) {
        // Inflation-adjusted withdrawal + tax gross-up (federal + state)
        const yearsIntoRetirement = age - retireAge;
        const inflatedSpending = annualSpending * Math.pow(1 + inflationRate / 100, yearsFromNow);
        
        // Calculate more accurate combined tax rate using state LTCG treatment
        const baseFederalTaxRate = 0.15; // Base federal estimate for LTCG

        // Get effective state LTCG rate (accounts for deductions like SC's 44%)
        const stateCapGainsResult = calculateStateCapitalGainsTax({
          longTermGains: 50000, // Representative withdrawal amount
          shortTermGains: 0,
          otherIncome: annualSpending * 0.3, // Assume some ordinary income
          filingStatus: filingStatus === 'married' ? 'married_filing_jointly' : filingStatus,
          state: stateOfResidence,
          year: new Date().getFullYear()
        });

        const effectiveStateTaxRate = stateCapGainsResult.effectiveRate || 0;
        const combinedTaxRate = Math.min(0.45, baseFederalTaxRate + effectiveStateTaxRate);
        const grossWithdrawal = inflatedSpending / (1 - combinedTaxRate);
        
        // Cap withdrawal to available (like main projection does)
        const actualWithdrawal = Math.min(grossWithdrawal, portfolio);
        portfolio -= actualWithdrawal;
        
        // Check if FULL spending need was met
        if (actualWithdrawal < grossWithdrawal * 0.95) {
          // Can't meet 95% of spending need - consider it failed
          return { survives: false, finalPortfolio: portfolio, depleteAge: age };
        }
      } else {
        // Pre-retirement: add/subtract savings (inflation-adjusted)
        const inflatedSavings = annualSavings * Math.pow(1 + incomeGrowth / 100, yearsFromNow);
        portfolio += inflatedSavings;
      }
      
      if (portfolio <= 0) {
        return { survives: false, finalPortfolio: 0, depleteAge: age };
      }
    }
    
    return { survives: true, finalPortfolio: portfolio, depleteAge: null };
  };

  // Generate projection data with dynamic withdrawal based on portfolio growth and account types
  const projections = useMemo(() => {
    const years = lifeExpectancy - currentAge;
    const data = [];
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-11
    
    // Pro-rata factor for Year 0 - only apply spending/income for remaining months
    const remainingMonthsThisYear = 12 - currentMonth; // Jan=12, Feb=11, ..., Dec=1
    const currentYearProRataFactor = remainingMonthsThisYear / 12;

    let cumulativeSavings = 0;

    // REFACTORED: Initialize asset-in-account structure from actual holdings
    const initializePortfolio = () => {
      const structure = {
        taxable: { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 },
        taxDeferred: { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 },
        taxFree: { btc: 0, stocks: 0, bonds: 0, cash: 0, other: 0 },
        realEstate: 0  // Illiquid, tracked separately
      };
      
      holdings.forEach(h => {
        const value = getHoldingValue(h);
        const taxTreatment = getTaxTreatmentFromHolding(h);
        const assetType = h.asset_type || 'other';
        
        if (taxTreatment === 'real_estate') {
          structure.realEstate += value;
          return;
        }
        
        // Map asset_type to our categories (support both old 'crypto' and new 'btc')
        let assetCategory = 'other';
        if (h.ticker === 'BTC' || assetType === 'btc' || assetType === 'crypto') assetCategory = 'btc';
        else if (assetType === 'stocks') assetCategory = 'stocks';
        else if (assetType === 'bonds') assetCategory = 'bonds';
        else if (assetType === 'cash') assetCategory = 'cash';
        
        // Map tax treatment to account
        let accountKey = 'taxable';
        if (taxTreatment === 'tax_deferred') accountKey = 'taxDeferred';
        else if (taxTreatment === 'tax_free') accountKey = 'taxFree';
        
        structure[accountKey][assetCategory] += value;
      });
      
      return structure;
    };

    let portfolio = initializePortfolio();

    // Helper functions to get derived totals
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

    const getTotalPortfolio = (encumberedBtcValue = 0) => {
      // Total portfolio includes liquid assets + real estate + encumbered BTC (still owned, just locked)
      return getTotalLiquid() + portfolio.realEstate + encumberedBtcValue;
    };

    let firstDepletionAge = null; // Track first age when portfolio depletes (for reference line)

    // Track cost basis for taxable accounts to dynamically estimate capital gains
    const initialTaxableCostBasis = taxableHoldings.reduce((sum, h) => sum + (h.cost_basis_total || 0), 0);
    let runningTaxableBasis = initialTaxableCostBasis;

    // Track cumulative income and expense adjustments from life events
    let cumulativeIncomeAdjustment = 0;
    let cumulativeExpenseAdjustment = 0;

    // Track debt balances for all liabilities with month-by-month amortization
    // Initialize these mutable liability states once outside the loop
    const tempRunningDebt = {};
    liabilities.forEach(liability => {
      tempRunningDebt[liability.id] = {
        ...liability,
        current_balance: liability.current_balance || 0,
        paid_off: false, // Add a paid_off flag
        entity_type: 'Liability',
      };
    });

    // Add collateralized loans to debt tracking
    collateralizedLoans.forEach(loan => {
      tempRunningDebt[loan.id] = {
        ...loan,
        current_balance: loan.current_balance || 0,
        paid_off: false,
        entity_type: 'CollateralizedLoan',
        type: 'btc_collateralized', // Treat as BTC collateralized for projection logic
        monthly_payment: loan.minimum_monthly_payment || 0,
      };
    });

    // Track collateralized loans (daily interest accrual, monthly approximation)
    const tempRunningCollateralizedLoans = {};
    collateralizedLoans.forEach(loan => {
      tempRunningCollateralizedLoans[loan.id] = {
        ...loan,
        current_balance: loan.current_balance || 0,
        paid_off: false,
      };
    });

    const encumberedBtc = {}; // Track BTC locked as collateral - mutable per year
    let releasedBtc = {}; // Track BTC released when LTV drops below threshold - changed to let for reassignment
    const liquidatedBtc = {}; // Track BTC liquidated due to LTV breach
    const liquidationEvents = []; // Track liquidation events by year

    // Track BTC collateral from regular liabilities - INITIAL STATE
    liabilities.forEach(liability => {
      if (liability.type === 'btc_collateralized' && liability.collateral_btc_amount) {
        encumberedBtc[liability.id] = liability.collateral_btc_amount;
        releasedBtc[liability.id] = 0;
        liquidatedBtc[liability.id] = 0;
      }
    });

    // Track BTC collateral from CollateralizedLoan entities - INITIAL STATE (deduplicated)
    collateralizedLoans.forEach(loan => {
      if (loan.collateral_btc_amount) {
        const loanKey = `loan_${loan.id}`;
        encumberedBtc[loanKey] = loan.collateral_btc_amount;
        releasedBtc[loanKey] = 0;
        liquidatedBtc[loanKey] = 0;
      }
    });

    // Subtract encumbered BTC from taxable portfolio to avoid double-counting
    // Encumbered BTC will be added back separately in total calculations
    const totalInitialEncumberedBtc = Object.values(encumberedBtc).reduce((sum, amount) => sum + amount, 0);
    const encumberedBtcValue = totalInitialEncumberedBtc * currentPrice;
    portfolio.taxable.btc = Math.max(0, portfolio.taxable.btc - encumberedBtcValue);

    // Track cumulative BTC price for variable growth models (Saylor, etc.)
    let cumulativeBtcPrice = currentPrice;

    for (let i = 0; i <= years; i++) {
      const year = currentYear + i;
      const age = currentAge + i;

      // Get BTC growth rate for this year (needed early for collateral calculations)
      const yearBtcGrowth = getBtcGrowthRate(i, effectiveInflation);

      // Update cumulative BTC price for this year (compounds each year's growth rate)
      if (i > 0) {
        cumulativeBtcPrice = cumulativeBtcPrice * (1 + yearBtcGrowth / 100);
      }

      // Add released BTC back to portfolio as liquid BTC for immediate availability
      const totalReleasedBtcValueThisYear = Object.values(releasedBtc).reduce((sum, btcAmount) => {
        return sum + (btcAmount * cumulativeBtcPrice);
      }, 0);
      if (totalReleasedBtcValueThisYear > 0) {
        // Add released BTC value to taxable.btc - this is returned collateral
        portfolio.taxable.btc += totalReleasedBtcValueThisYear;
      }
      // Reset releasedBtc for the next year's calculation
      releasedBtc = {};

      // Calculate active income/expense adjustments for THIS year only
      let activeIncomeAdjustment = 0;
      let activeExpenseAdjustment = 0;
      
      lifeEvents.forEach(event => {
        // Check if income_change event is active this year
        if (event.event_type === 'income_change') {
          const eventEndYear = event.year + (event.is_recurring ? (event.recurring_years || 1) : 1);
          const isActive = year >= event.year && year < eventEndYear;
          if (isActive) {
            activeIncomeAdjustment += event.amount;
          }
        }
        
        // Check if expense_change event is active this year
        if (event.event_type === 'expense_change') {
          const eventEndYear = event.year + (event.is_recurring ? (event.recurring_years || 1) : 1);
          const isActive = year >= event.year && year < eventEndYear;
          if (isActive) {
            activeExpenseAdjustment += event.amount;
          }
        }
        
        // Check if home_purchase ongoing expenses are active this year (from event year forward indefinitely)
        if (event.event_type === 'home_purchase' && event.year <= year && event.monthly_expense_impact > 0) {
          activeExpenseAdjustment += event.monthly_expense_impact * 12;
        }
      });

      // Calculate life event impacts for this year (with income growth applied)
        let eventImpact = 0;
        let yearGoalWithdrawal = 0; // Track goal-specific withdrawals for this year
        const yearGoalNames = []; // Track which goals are funded this year

        lifeEvents.forEach(event => {
          if (event.year === year || (event.is_recurring && event.year <= year && year < event.year + (event.recurring_years || 1))) {
            if (event.affects === 'assets') {
              const eventAmount = event.amount;
              eventImpact += eventAmount;

              // Apply custom allocation if specified and amount is positive
              if (eventAmount > 0 && event.allocation_method === 'custom') {
                const btcAlloc = (event.btc_allocation || 0) / 100;
                const stocksAlloc = (event.stocks_allocation || 0) / 100;
                const realEstateAlloc = (event.real_estate_allocation || 0) / 100;
                const bondsAlloc = (event.bonds_allocation || 0) / 100;
                const cashAlloc = (event.cash_allocation || 0) / 100;
                const otherAlloc = (event.other_allocation || 0) / 100;

                // Add to taxable account by default
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

      // Include goals marked as "will_be_spent" at their target date (exclude debt_payoff goals - handled separately)
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

      // Debt payoff goals - handle both spread payments and lump sum strategies
      // Track which liabilities/loans have active payoff goals this year
      const liabilitiesWithPayoffGoals = new Set();
      const loansWithPayoffGoals = new Set();
      
      goals.forEach(goal => {
        if (goal.goal_type === 'debt_payoff' && goal.linked_liability_id) {
          const payoffStrategy = goal.payoff_strategy || 'spread_payments';

          // Check if this is a regular liability or collateralized loan
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
                  if (loanToUpdate.current_balance <= 0.01) {
                    loanToUpdate.paid_off = true;
                  }
                }
              } else {
                liabilitiesWithPayoffGoals.add(actualId);
                const liabilityToUpdate = tempRunningDebt[actualId];
                if (liabilityToUpdate && !liabilityToUpdate.paid_off) {
                  liabilityToUpdate.current_balance = Math.max(0, liabilityToUpdate.current_balance - annualPayment);
                  if (liabilityToUpdate.current_balance <= 0.01) {
                    liabilityToUpdate.paid_off = true;
                  }
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

      // Calculate actual debt payments for this year with month-by-month simulation
      let actualAnnualDebtPayments = 0;
      const debtPayoffEvents = []; // Track debts paid off this year

      // For liabilities WITHOUT active payoff goals, process monthly
      Object.values(tempRunningDebt).forEach(liability => {
        if (!liabilitiesWithPayoffGoals.has(liability.id) && !liability.paid_off) { // Check paid_off flag
          const hasPayment = liability.monthly_payment && liability.monthly_payment > 0;
          const hasInterest = liability.interest_rate && liability.interest_rate > 0;
          const startingBalanceForYear = liability.current_balance; // Store for payoff check
          const isBtcLoan = liability.type === 'btc_collateralized';

          if (hasPayment) {
            let remainingBalance = liability.current_balance;
            let payoffMonth = null;

            // For the first year (i === 0), start simulation from the current month
            // For subsequent years, start from the beginning of the year (month 0)
            const startMonth = (i === 0) ? currentMonth : 0;

            for (let month = startMonth; month < 12; month++) {
              if (remainingBalance <= 0) {
                liability.paid_off = true; // Mark as paid off
                break;
              }

              // Calculate monthly interest
              const monthlyInterest = hasInterest
                ? remainingBalance * (liability.interest_rate / 100 / 12)
                : 0;

              // Principal portion of payment
              const principalPayment = Math.max(0, liability.monthly_payment - monthlyInterest);

              // Ensure payment does not exceed remaining balance + interest
              const paymentThisMonth = Math.min(remainingBalance + monthlyInterest, liability.monthly_payment);
              remainingBalance = Math.max(0, remainingBalance - principalPayment);

              actualAnnualDebtPayments += paymentThisMonth; // Add the actual amount paid this month

              // Track payoff month (if it happens this year)
              if (remainingBalance <= 0.01 && payoffMonth === null) {
                payoffMonth = month + 1; // 1-12
              }
            }

            // Update liability's balance for the next year's calculation
            liability.current_balance = remainingBalance;

            // Track if debt was paid off this year
            if (startingBalanceForYear > 0 && liability.current_balance <= 0.01 && payoffMonth) {
              debtPayoffEvents.push({
                name: liability.name,
                month: payoffMonth,
                age: currentAge + i
              });
              liability.paid_off = true; // Mark as paid off so no further payments are made
            }

          } else if (hasInterest && !isBtcLoan) {
            // No payment, interest accrues and is added to principal (annualized) - EXCEPT for BTC loans
            const annualInterest = liability.current_balance * (liability.interest_rate / 100);
            liability.current_balance += annualInterest;
          } else if (isBtcLoan && hasInterest && i > 0) {
            // BTC loans: ONLY accrue interest AFTER year 0 - year 0 uses actual current balance
            const dailyRate = liability.interest_rate / 100 / 365;
            const daysInYear = 365;
            liability.current_balance = liability.current_balance * Math.pow(1 + dailyRate, daysInYear);
          }
          // If no payment and no interest, debt stays constant
        }

        // Check for BTC collateral management based on LTV
        if (liability.type === 'btc_collateralized' && encumberedBtc[liability.id] > 0) {
          // Use cumulative BTC price (properly compounds variable growth rates like Saylor model)
          const yearBtcPrice = cumulativeBtcPrice;
          const collateralValue = encumberedBtc[liability.id] * yearBtcPrice;
          const currentLTV = (liability.current_balance / collateralValue) * 100; // LTV as percentage
          const liquidationLTV = liability.liquidation_ltv || 80;
          const releaseLTV = liability.collateral_release_ltv || 30;
          const triggerLTV = btcTopUpTriggerLtv || 70;
          const targetLTV = 65; // Ledn standard: top-up brings LTV to 65%

          // AUTO TOP-UP: If enabled and LTV reaches trigger threshold (before liquidation)
          if (autoTopUpBtcCollateral && currentLTV >= triggerLTV && currentLTV < liquidationLTV) {
            // Calculate how much BTC needed to bring LTV back to target
            // targetLTV = debt / (currentCollateral + additionalBtc) * price
            // Solve for additionalBtc: additionalBtc = (debt / (targetLTV/100) / price) - currentCollateral
            const targetCollateralValue = liability.current_balance / (targetLTV / 100);
            const additionalBtcNeeded = (targetCollateralValue / yearBtcPrice) - encumberedBtc[liability.id];
            
            // Check if we have enough liquid BTC
            const liquidBtcAvailable = portfolio.taxable.btc / yearBtcPrice; // Convert value to BTC amount
            
            if (additionalBtcNeeded > 0 && liquidBtcAvailable >= additionalBtcNeeded) {
              // Top up from liquid BTC
              encumberedBtc[liability.id] += additionalBtcNeeded;
              portfolio.taxable.btc -= additionalBtcNeeded * yearBtcPrice;
              
              // Log top-up event (not a liquidation)
              liquidationEvents.push({
                year,
                age: currentAge + i,
                liabilityName: liability.name,
                type: 'top_up',
                btcAdded: additionalBtcNeeded,
                newLtv: btcTopUpTargetLtv,
                message: `Added ${additionalBtcNeeded.toFixed(4)} BTC collateral to reduce LTV from ${currentLTV.toFixed(0)}% to 65%`
              });
            }
            // If not enough liquid BTC, do nothing here - will be handled by liquidation logic below if LTV reaches 80%
          }

          // Recalculate LTV after potential top-up
          const postTopUpCollateralValue = encumberedBtc[liability.id] * yearBtcPrice;
          const postTopUpLTV = (liability.current_balance / postTopUpCollateralValue) * 100;

          // LIQUIDATION: If LTV exceeds liquidation threshold (80%)
          if (postTopUpLTV >= liquidationLTV) {
            const totalCollateralBtc = encumberedBtc[liability.id];
            const debtBalance = liability.current_balance;
            
            // LIQUIDATION: Sell enough BTC to pay off the ENTIRE loan
            // Per Ledn terms: At 80% LTV, collateral is sold to cover outstanding loan balance
            const btcNeededToPayOff = debtBalance / yearBtcPrice;

            let btcToSell, proceedsFromSale, newDebtBalance, remainingCollateralBtc;

            if (btcNeededToPayOff >= totalCollateralBtc) {
              // Not enough collateral to fully pay off - sell everything
              btcToSell = totalCollateralBtc;
              proceedsFromSale = btcToSell * yearBtcPrice;
              newDebtBalance = Math.max(0, debtBalance - proceedsFromSale);
              remainingCollateralBtc = 0;
            } else {
              // Enough collateral - sell exactly what's needed to pay off loan
              btcToSell = btcNeededToPayOff;
              proceedsFromSale = btcToSell * yearBtcPrice;
              newDebtBalance = 0; // Loan fully paid off
              remainingCollateralBtc = totalCollateralBtc - btcToSell;
            }
            
            // Update loan state
            liability.current_balance = newDebtBalance;
            encumberedBtc[liability.id] = remainingCollateralBtc;
            
            // If debt fully paid or no collateral left, mark as paid off
            if (newDebtBalance <= 0.01) {
              liability.paid_off = true;
              if (remainingCollateralBtc > 0) {
                // Store in releasedBtc for NEXT year (so it's available before withdrawals)
                releasedBtc[liability.id] = (releasedBtc[liability.id] || 0) + remainingCollateralBtc;
                encumberedBtc[liability.id] = 0;
              }
            }
            
            // Calculate new LTV for reporting
            const newLTV = remainingCollateralBtc > 0 
              ? (newDebtBalance / (remainingCollateralBtc * yearBtcPrice)) * 100 
              : 0;

            liquidationEvents.push({
              year,
              age: currentAge + i,
              liabilityName: liability.name,
              type: newDebtBalance <= 0 ? 'full_liquidation' : 'partial_liquidation',
              btcAmount: btcToSell,
              btcReturned: remainingCollateralBtc,
              proceeds: proceedsFromSale,
              debtReduction: proceedsFromSale,
              remainingDebt: newDebtBalance,
              remainingCollateral: remainingCollateralBtc,
              newLtv: newLTV,
              message: newDebtBalance <= 0
                ? `Loan paid off: Sold ${btcToSell.toFixed(4)} BTC ($${Math.round(proceedsFromSale).toLocaleString()}) to pay off loan. ${remainingCollateralBtc.toFixed(4)} BTC released back to liquid.`
                : `Partial liquidation: Sold ${btcToSell.toFixed(4)} BTC but debt remains: $${Math.round(newDebtBalance).toLocaleString()}`
            });
          }
          // RELEASE: If LTV drops below release threshold
          else if (postTopUpLTV <= releaseLTV) {
            // If loan is paid off, release ALL collateral
            if (liability.current_balance <= 0) {
              if (!releasedBtc[liability.id] || releasedBtc[liability.id] === 0) {
                releasedBtc[liability.id] = encumberedBtc[liability.id];
                encumberedBtc[liability.id] = 0;
              }
            } else {
              // Loan still active: only release EXCESS collateral, keep loan at target LTV
              const currentCollateral = encumberedBtc[liability.id];
              const releaseTargetLTV = 40; // Ledn releases excess collateral to bring LTV up to 40%
              const targetCollateralForLoan = liability.current_balance / (releaseTargetLTV / 100) / yearBtcPrice;
              const excessCollateral = Math.max(0, currentCollateral - targetCollateralForLoan);
              
              if (excessCollateral > 0) {
                releasedBtc[liability.id] = excessCollateral;
                encumberedBtc[liability.id] = targetCollateralForLoan;
                
                liquidationEvents.push({
                  year,
                  age: currentAge + i,
                  liabilityName: liability.name,
                  type: 'release',
                  btcReleased: excessCollateral,
                  previousLTV: postTopUpLTV,
                  newLTV: 40,
                  message: `Released ${excessCollateral.toFixed(4)} BTC back to liquid. LTV increased from ${postTopUpLTV.toFixed(0)}% to 40%`
                });
              }
            }
          }
        }
      });

      // Process collateralized loans (monthly interest accrual approximation)
      Object.values(tempRunningCollateralizedLoans).forEach(loan => {
        if (!loansWithPayoffGoals.has(loan.id) && !loan.paid_off) {
          const hasInterest = loan.interest_rate && loan.interest_rate > 0;
          const hasMinPayment = loan.minimum_monthly_payment && loan.minimum_monthly_payment > 0;

          // Start from current month for year 0, start of year otherwise
          const startMonth = (i === 0) ? currentMonth : 0;

          if (hasMinPayment) {
            // Process monthly if there's a payment
            let remainingBalance = loan.current_balance;

            for (let month = startMonth; month < 12; month++) {
              if (remainingBalance <= 0) {
                loan.paid_off = true;
                break;
              }

              // Monthly interest accrual
              const monthlyInterest = hasInterest ? remainingBalance * (loan.interest_rate / 100 / 12) : 0;
              const principalPayment = Math.max(0, loan.minimum_monthly_payment - monthlyInterest);
              const paymentThisMonth = Math.min(remainingBalance + monthlyInterest, loan.minimum_monthly_payment);

              actualAnnualDebtPayments += paymentThisMonth;
              remainingBalance = Math.max(0, remainingBalance - principalPayment);
            }

            loan.current_balance = remainingBalance;
          } else if (hasInterest && i > 0) {
            // No payment but interest accrues daily (compound daily) - ONLY AFTER year 0
            const dailyRate = loan.interest_rate / 100 / 365;
            const daysInYear = 365;
            loan.current_balance = loan.current_balance * Math.pow(1 + dailyRate, daysInYear);
          }
        }

        // Check for collateral release or liquidation
        const loanKey = `loan_${loan.id}`;
        if (encumberedBtc[loanKey] > 0) {
          // Use cumulative BTC price (properly compounds variable growth rates like Saylor model)
          const yearBtcPrice = cumulativeBtcPrice;
          const collateralValue = encumberedBtc[loanKey] * yearBtcPrice;
          const currentLTV = (loan.current_balance / collateralValue) * 100;
          const liquidationLTV = loan.liquidation_ltv || 80;
          const releaseLTV = loan.collateral_release_ltv || 30;

          const triggerLTV = btcTopUpTriggerLtv || 70;
          const targetLTV = 65; // Ledn standard: top-up brings LTV to 65%

          // AUTO TOP-UP: If enabled and LTV reaches trigger threshold (before liquidation)
          if (autoTopUpBtcCollateral && currentLTV >= triggerLTV && currentLTV < liquidationLTV) {
            const targetCollateralValue = loan.current_balance / (targetLTV / 100);
            const additionalBtcNeeded = (targetCollateralValue / yearBtcPrice) - encumberedBtc[loanKey];
            const liquidBtcAvailable = portfolio.taxable.btc / yearBtcPrice;
            
            if (additionalBtcNeeded > 0 && liquidBtcAvailable >= additionalBtcNeeded) {
              encumberedBtc[loanKey] += additionalBtcNeeded;
              portfolio.taxable.btc -= additionalBtcNeeded * yearBtcPrice;
              
              liquidationEvents.push({
                year,
                age: currentAge + i,
                liabilityName: loan.name,
                type: 'top_up',
                btcAdded: additionalBtcNeeded,
                newLtv: btcTopUpTargetLtv,
                message: `Added ${additionalBtcNeeded.toFixed(4)} BTC collateral to reduce LTV from ${currentLTV.toFixed(0)}% to 65%`
              });
            }
          }

          // Recalculate LTV after potential top-up
          const postTopUpCollateralValue = encumberedBtc[loanKey] * yearBtcPrice;
          const postTopUpLTV = (loan.current_balance / postTopUpCollateralValue) * 100;

          // LIQUIDATION: If LTV exceeds liquidation threshold (80%)
          if (postTopUpLTV >= liquidationLTV) {
            const totalCollateralBtc = encumberedBtc[loanKey];
            const debtBalance = loan.current_balance;
            
            // LIQUIDATION: Sell enough BTC to pay off the ENTIRE loan
            // Per Ledn terms: At 80% LTV, collateral is sold to cover outstanding loan balance
            const btcNeededToPayOff = debtBalance / yearBtcPrice;

            let btcToSell, proceedsFromSale, newDebtBalance, remainingCollateralBtc;

            if (btcNeededToPayOff >= totalCollateralBtc) {
              // Not enough collateral to fully pay off - sell everything
              btcToSell = totalCollateralBtc;
              proceedsFromSale = btcToSell * yearBtcPrice;
              newDebtBalance = Math.max(0, debtBalance - proceedsFromSale);
              remainingCollateralBtc = 0;
            } else {
              // Enough collateral - sell exactly what's needed to pay off loan
              btcToSell = btcNeededToPayOff;
              proceedsFromSale = btcToSell * yearBtcPrice;
              newDebtBalance = 0; // Loan fully paid off
              remainingCollateralBtc = totalCollateralBtc - btcToSell;
            }
            
            // Update loan state
            loan.current_balance = newDebtBalance;
            encumberedBtc[loanKey] = remainingCollateralBtc;
            
            // Also update tempRunningDebt
            if (tempRunningDebt[loan.id]) {
              tempRunningDebt[loan.id].current_balance = newDebtBalance;
            }
            
            // If debt fully paid or no collateral left, mark as paid off
            if (newDebtBalance <= 0.01) {
              loan.paid_off = true;
              if (tempRunningDebt[loan.id]) {
                tempRunningDebt[loan.id].paid_off = true;
              }
              if (remainingCollateralBtc > 0) {
                // Store in releasedBtc for NEXT year (so it's available before withdrawals)
                releasedBtc[loanKey] = (releasedBtc[loanKey] || 0) + remainingCollateralBtc;
                encumberedBtc[loanKey] = 0;
              }
            }
            
            // Calculate new LTV for reporting
            const newLTV = remainingCollateralBtc > 0 
              ? (newDebtBalance / (remainingCollateralBtc * yearBtcPrice)) * 100 
              : 0;

            liquidationEvents.push({
              year,
              age: currentAge + i,
              liabilityName: loan.name,
              type: newDebtBalance <= 0 ? 'full_liquidation' : 'partial_liquidation',
              btcAmount: btcToSell,
              btcReturned: remainingCollateralBtc,
              proceeds: proceedsFromSale,
              debtReduction: proceedsFromSale,
              remainingDebt: newDebtBalance,
              remainingCollateral: remainingCollateralBtc,
              newLtv: newLTV,
              message: newDebtBalance <= 0
                ? `Loan paid off: Sold ${btcToSell.toFixed(4)} BTC ($${Math.round(proceedsFromSale).toLocaleString()}) to pay off loan. ${remainingCollateralBtc.toFixed(4)} BTC released back to liquid.`
                : `Partial liquidation: Sold ${btcToSell.toFixed(4)} BTC but debt remains: $${Math.round(newDebtBalance).toLocaleString()}`
            });
          }
          // RELEASE
          else if (postTopUpLTV <= releaseLTV) {
            // If loan is paid off, release ALL collateral
            if (loan.current_balance <= 0) {
              if (!releasedBtc[loanKey] || releasedBtc[loanKey] === 0) {
                releasedBtc[loanKey] = encumberedBtc[loanKey];
                encumberedBtc[loanKey] = 0;
              }
            } else {
              // Loan still active: only release EXCESS collateral, keep loan at target LTV
              const currentCollateral = encumberedBtc[loanKey];
              const releaseTargetLTV = 40; // Ledn releases excess collateral to bring LTV up to 40%
              const targetCollateralForLoan = loan.current_balance / (releaseTargetLTV / 100) / yearBtcPrice;
              const excessCollateral = Math.max(0, currentCollateral - targetCollateralForLoan);
              
              if (excessCollateral > 0) {
                releasedBtc[loanKey] = excessCollateral;
                encumberedBtc[loanKey] = targetCollateralForLoan;
                
                liquidationEvents.push({
                  year,
                  age: currentAge + i,
                  liabilityName: loan.name,
                  type: 'release',
                  btcReleased: excessCollateral,
                  previousLTV: postTopUpLTV,
                  newLTV: 40,
                  message: `Released ${excessCollateral.toFixed(4)} BTC back to liquid. LTV increased from ${postTopUpLTV.toFixed(0)}% to 40%`
                });
              }
            }
          }
        }
      });

      const isRetired = currentAge + i >= retirementAge;
      const yearsIntoRetirement = isRetired ? currentAge + i - retirementAge : 0;
      const currentAgeThisYear = currentAge + i;

      // Pre-retirement: save and grow. Post-retirement: grow then withdraw
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

      // Per-year depletion flag - reset each iteration
      let ranOutOfMoneyThisYear = false;
      
      if (i > 0) { // Always apply growth; if portfolio is 0, growth will be 0, but it can revive with inflows
        // REFACTORED: Grow each asset by its specific CAGR within each account
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
        // Calculate gross income with income growth and life event adjustments
        const baseGrossIncome = grossAnnualIncome * Math.pow(1 + incomeGrowth / 100, i);
        const yearGrossIncome = baseGrossIncome + activeIncomeAdjustment;
        
        // Get contribution limits for this year
        const yearLimit401k = get401kLimit(year, currentAgeThisYear);
        const yearLimitRoth = getRothIRALimit(year, currentAgeThisYear);
        const yearLimitHSA = getHSALimit(year, currentAgeThisYear, hsaFamilyCoverage);
        
        // Cap contributions to limits (grow with income growth)
        const year401k = Math.min((contribution401k || 0) * Math.pow(1 + incomeGrowth / 100, i), yearLimit401k);
        const yearRoth = Math.min((contributionRothIRA || 0) * Math.pow(1 + incomeGrowth / 100, i), yearLimitRoth);
        const yearHSA = Math.min((contributionHSA || 0) * Math.pow(1 + incomeGrowth / 100, i), yearLimitHSA);
        const yearEmployerMatch = (employer401kMatch || 0) * Math.pow(1 + incomeGrowth / 100, i);
        
        // Pre-tax contributions reduce taxable income
        const yearTaxableIncome = Math.max(0, yearGrossIncome - year401k - yearHSA - currentStandardDeduction);
        const yearTaxesPaid = calculateProgressiveIncomeTax(yearTaxableIncome, filingStatus, year);
        taxesPaid = yearTaxesPaid;
        
        // Net income after taxes
        const yearNetIncome = yearGrossIncome - yearTaxesPaid;

        // Track components for tooltip
        // Pro-rate Year 0 spending to only remaining months
        const baseYearSpending = (currentAnnualSpending * Math.pow(1 + inflationRate / 100, i)) + activeExpenseAdjustment;
        const yearSpending = i === 0 ? baseYearSpending * currentYearProRataFactor : baseYearSpending;
        
        // Net savings = net income - spending - roth contribution (Roth is after-tax)
        // Also pro-rate Year 0 net income
        const proRatedNetIncome = i === 0 ? yearNetIncome * currentYearProRataFactor : yearNetIncome;
        const proRatedYearRoth = i === 0 ? yearRoth * currentYearProRataFactor : yearRoth;
        yearSavings = proRatedNetIncome - yearSpending - proRatedYearRoth;
        // runningSavings is just a cumulative tracker for display, NOT for compounding
        cumulativeSavings += yearSavings;
        
        // Allocate retirement contributions to account types (proportionally to existing assets)
        const addToAccount = (accountKey, amount) => {
          const acct = portfolio[accountKey];
          const currentTotal = getAccountTotal(accountKey);
          if (currentTotal > 0) {
            // Add proportionally to existing allocation
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
            // Default to stocks for new retirement contributions
            acct.stocks += amount;
          }
        };
        
        addToAccount('taxDeferred', year401k + yearEmployerMatch);
        addToAccount('taxFree', yearRoth + yearHSA);

        // Allocate net cash flow to taxable accounts
        // If savings is negative, we're drawing down the portfolio pre-retirement
        if (yearSavings < 0) {
          const deficit = Math.abs(yearSavings);

          // CALCULATE TAXES ON PRE-RETIREMENT WITHDRAWALS
          const taxableBalance = getAccountTotal('taxable');
          const taxDeferredBalance = getAccountTotal('taxDeferred');
          const taxFreeBalance = getAccountTotal('taxFree');
          const effectiveRunningTaxableBasis = Math.min(taxableBalance, runningTaxableBasis);
          const estimatedCurrentGainRatio = taxableBalance > 0 ? Math.max(0, (taxableBalance - effectiveRunningTaxableBasis) / taxableBalance) : 0;

          // Calculate total Roth contributions for accessible funds calculation
          const totalRothContributions = accounts
            .filter(a => ['401k_roth', 'ira_roth', 'hsa'].includes(a.account_type))
            .reduce((sum, a) => sum + (a.roth_contributions || 0), 0);

          const taxEstimate = estimateRetirementWithdrawalTaxes({
            withdrawalNeeded: deficit,
            taxableBalance,
            taxDeferredBalance,
            taxFreeBalance,
            rothContributions: totalRothContributions,
            taxableGainPercent: estimatedCurrentGainRatio,
            isLongTermGain: true,
            filingStatus,
            age: currentAgeThisYear,
            otherIncome: 0,
            year: year,
            inflationRate: inflationRate / 100,
          });

          withdrawFromTaxable = taxEstimate.fromTaxable || 0;
          withdrawFromTaxDeferred = taxEstimate.fromTaxDeferred || 0;
          withdrawFromTaxFree = taxEstimate.fromTaxFree || 0;
          taxesPaid = taxEstimate.totalTax || 0;
          penaltyPaid = taxEstimate.totalPenalty || 0;

          // Adjust cost basis after taxable withdrawal
          if (withdrawFromTaxable > 0 && taxableBalance > 0) {
            const basisRatio = runningTaxableBasis / taxableBalance;
            runningTaxableBasis = Math.max(0, runningTaxableBasis - (withdrawFromTaxable * basisRatio));
          }

          // REFACTORED: Withdraw from accounts (which automatically reduces assets within them)
          const withdrawFromAccount = (accountKey, amount) => {
            const acct = portfolio[accountKey];
            const total = getAccountTotal(accountKey);
            
            if (total <= 0 || amount <= 0) return 0;
            
            const actualWithdrawal = Math.min(amount, total);
            const ratio = actualWithdrawal / total;
            
            // Reduce each asset proportionally within this account
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

          // Check if portfolio depleted after withdrawals
          if (getTotalPortfolio() <= 0) {
            ranOutOfMoneyThisYear = true;
          }
        } else if (yearSavings > 0) {
          // Positive savings - add to taxable accounts using user-defined allocation
          const totalAllocation = savingsAllocationBtc + savingsAllocationStocks + savingsAllocationBonds + savingsAllocationCash + savingsAllocationOther;
          
          if (totalAllocation > 0) {
            portfolio.taxable.btc += yearSavings * (savingsAllocationBtc / totalAllocation);
            portfolio.taxable.stocks += yearSavings * (savingsAllocationStocks / totalAllocation);
            portfolio.taxable.bonds += yearSavings * (savingsAllocationBonds / totalAllocation);
            portfolio.taxable.cash += yearSavings * (savingsAllocationCash / totalAllocation);
            portfolio.taxable.other += yearSavings * (savingsAllocationOther / totalAllocation);
          } else {
            // Fallback to 100% BTC if no allocation set
            portfolio.taxable.btc += yearSavings;
          }
          runningTaxableBasis += yearSavings;
        }
        // If yearSavings is exactly 0, do nothing
      } else {
        // Calculate withdrawal based on strategy
        const totalBeforeWithdrawal = getTotalPortfolio();
        const accountTotalBeforeWithdrawal = getTotalLiquid();

        // Income-based: withdraw exactly what you need, inflation-adjusted
        // Inflate to retirement age once, then from that nominal base inflate each year in retirement
        const nominalSpendingAtRetirement = retirementAnnualSpending * Math.pow(1 + effectiveInflation / 100, Math.max(0, retirementAge - currentAge));
        const baseDesiredWithdrawal = nominalSpendingAtRetirement * Math.pow(1 + effectiveInflation / 100, yearsIntoRetirement);
        
        // Pro-rate Year 0 retirement spending to only remaining months
        const desiredWithdrawal = i === 0 ? baseDesiredWithdrawal * currentYearProRataFactor : baseDesiredWithdrawal;
        
        // Cap withdrawal to what's actually available
        const totalAvailableForWithdrawal = Math.max(0, accountTotalBeforeWithdrawal);
        yearWithdrawal = Math.min(desiredWithdrawal, totalAvailableForWithdrawal);

        // Smart withdrawal order based on age and account types with TAX CALCULATION
        const currentAgeInYear = currentAge + i;
        const canAccessRetirementPenaltyFree = currentAgeInYear >= PENALTY_FREE_AGE;

        // Required Minimum Distributions (RMDs) from tax-deferred accounts starting at age 73
        let rmdAmount = 0;
        const taxDeferredBalanceForRMD = getAccountTotal('taxDeferred');
        if (currentAgeInYear >= RMD_START_AGE && taxDeferredBalanceForRMD > 0) {
          const rmdFactor = getRMDFactor(currentAgeInYear);
          if (rmdFactor > 0) {
            rmdAmount = taxDeferredBalanceForRMD / rmdFactor;
          }

          // RMDs count as taxable income and must be taken regardless of spending needs
          // If RMD > yearWithdrawal, we still need to take the full RMD
          yearWithdrawal = Math.max(yearWithdrawal, rmdAmount);
        }

        // Dynamically calculate capital gains ratio based on current value vs cost basis
        const taxableBalance = getAccountTotal('taxable');
        const effectiveRunningTaxableBasis = Math.min(taxableBalance, runningTaxableBasis);
        const estimatedCurrentGainRatio = taxableBalance > 0 ? Math.max(0, (taxableBalance - effectiveRunningTaxableBasis) / taxableBalance) : 0;

        // Calculate total Roth contributions for accessible funds calculation
        const totalRothContributions = accounts
          .filter(a => ['401k_roth', 'ira_roth', 'hsa'].includes(a.account_type))
          .reduce((sum, a) => sum + (a.roth_contributions || 0), 0);

        // Calculate Social Security income for this year (inflation-adjusted from start age)
        const currentAgeInYearForSS = currentAge + i;
        let socialSecurityIncome = 0;
        if (currentAgeInYearForSS >= socialSecurityStartAge && effectiveSocialSecurity > 0) {
          const yearsOfSSInflation = currentAgeInYearForSS - socialSecurityStartAge;
          socialSecurityIncome = effectiveSocialSecurity * Math.pow(1 + effectiveInflation / 100, yearsOfSSInflation);
        }

        // Calculate taxable portion of Social Security using federal provisional income rules
        // Provisional income uses other income (excluding SS) to determine what % of SS is taxable
        // Use estimated retirement withdrawal for provisional income calculation
        const estimatedWithdrawalForSS = retirementSpendingOnly || desiredWithdrawal || 0;
        const taxableSocialSecurity = calculateTaxableSocialSecurity(
          socialSecurityIncome, 
          otherRetirementIncome + estimatedWithdrawalForSS, 
          filingStatus
        );
        
        // For spending: use FULL Social Security income (user receives the entire benefit)
        const totalRetirementIncome = otherRetirementIncome + socialSecurityIncome;
        
        // For tax calculations: use only TAXABLE portion of Social Security
        const totalOtherIncomeForTax = otherRetirementIncome + taxableSocialSecurity;

        // Store UNCAPPED desired retirement spending (not capped yearWithdrawal)
        // This ensures remainingShortfall > 0 when liquid can't cover needs, triggering RE liquidation
        retirementSpendingOnly = desiredWithdrawal;

        // Reduce required withdrawal by FULL Social Security income (user receives entire benefit for spending)
        const netSpendingNeed = Math.max(0, retirementSpendingOnly - totalRetirementIncome);
        
        // Combine net spending (after SS) and goal withdrawal for tax estimation
        totalWithdrawalForTaxCalculation = netSpendingNeed + yearGoalWithdrawal;

        if (currentAgeInYear >= 70 && currentAgeInYear <= 72) {
          console.log(`[RETIREMENT Age ${currentAgeInYear}]`, {
            desiredWithdrawal: Math.round(desiredWithdrawal),
            socialSecurityIncome: Math.round(socialSecurityIncome),
            otherRetirementIncome: Math.round(otherRetirementIncome),
            totalRetirementIncome: Math.round(totalRetirementIncome),
            retirementSpendingOnly: Math.round(retirementSpendingOnly),
            netSpendingNeed: Math.round(netSpendingNeed),
            totalWithdrawalForTaxCalculation: Math.round(totalWithdrawalForTaxCalculation),
            effectiveSocialSecurity: Math.round(effectiveSocialSecurity)
          });
        }

        // Cap withdrawal to available balance
        const totalAvailableBalance = getTotalLiquid();
        const cappedWithdrawal = Math.min(totalWithdrawalForTaxCalculation, totalAvailableBalance);

        // Use tax calculation utility for accurate withdrawal taxes
        const taxEstimate = estimateRetirementWithdrawalTaxes({
          withdrawalNeeded: cappedWithdrawal,
          taxableBalance: getAccountTotal('taxable'),
          taxDeferredBalance: getAccountTotal('taxDeferred'),
          taxFreeBalance: getAccountTotal('taxFree'),
          rothContributions: totalRothContributions,
          taxableGainPercent: estimatedCurrentGainRatio,
          isLongTermGain: true,
          filingStatus,
          age: currentAgeInYear,
          otherIncome: totalOtherIncomeForTax,
          year: year,
          inflationRate: inflationRate / 100,
        });

        // Store initial withdrawal amounts (for spending only)
        const baseFromTaxable = taxEstimate.fromTaxable || 0;
        const baseFromTaxDeferred = taxEstimate.fromTaxDeferred || 0;
        const baseFromTaxFree = taxEstimate.fromTaxFree || 0;
        
        // Calculate state tax on retirement withdrawal
        const stateTax = calculateStateTaxOnRetirement({
          state: stateOfResidence,
          age: currentAgeInYear,
          filingStatus: filingStatus,
          totalAGI: totalOtherIncomeForTax + cappedWithdrawal,
          socialSecurityIncome: socialSecurityIncome,
          taxDeferredWithdrawal: withdrawFromTaxDeferred,
          taxableWithdrawal: withdrawFromTaxable,
          taxableGainPortion: withdrawFromTaxable * estimatedCurrentGainRatio,
          pensionIncome: 0,
          year: year,
        });
        
        taxesPaid = (taxEstimate.totalTax || 0) + stateTax;
        penaltyPaid = taxEstimate.totalPenalty || 0;

        // Calculate total withdrawal needed (spending + taxes + penalty)
        const totalNeededFromAccounts = cappedWithdrawal + taxesPaid + penaltyPaid;
        
        // Re-estimate withdrawal sources for the TOTAL amount (spending + taxes)
        const totalTaxEstimate = estimateRetirementWithdrawalTaxes({
          withdrawalNeeded: totalNeededFromAccounts,
          taxableBalance: getAccountTotal('taxable'),
          taxDeferredBalance: getAccountTotal('taxDeferred'),
          taxFreeBalance: getAccountTotal('taxFree'),
          rothContributions: totalRothContributions,
          taxableGainPercent: estimatedCurrentGainRatio,
          isLongTermGain: true,
          filingStatus,
          age: currentAgeInYear,
          otherIncome: totalOtherIncomeForTax,
          year: year,
          inflationRate: inflationRate / 100,
        });

        // Use the withdrawal sources that cover BOTH spending AND taxes
        withdrawFromTaxable = totalTaxEstimate.fromTaxable || 0;
        withdrawFromTaxDeferred = totalTaxEstimate.fromTaxDeferred || 0;
        withdrawFromTaxFree = totalTaxEstimate.fromTaxFree || 0;

        // Adjust cost basis after taxable withdrawal
        if (withdrawFromTaxable > 0 && getAccountTotal('taxable') > 0) {
          const basisRatio = runningTaxableBasis / getAccountTotal('taxable');
          runningTaxableBasis = Math.max(0, runningTaxableBasis - (withdrawFromTaxable * basisRatio));
        }

        // REFACTORED: Withdraw from accounts (assets within accounts reduced proportionally)
        const withdrawFromAccount = (accountKey, amount) => {
          const acct = portfolio[accountKey];
          const total = getAccountTotal(accountKey);
          
          if (total <= 0 || amount <= 0) return 0;
          
          const actualWithdrawal = Math.min(amount, total);
          const ratio = actualWithdrawal / total;
          
          // Reduce each asset proportionally within this account
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

        // Calculate how much was withdrawn from tax-optimized approach
        let totalWithdrawnFromAccounts = withdrawFromTaxable + withdrawFromTaxDeferred + withdrawFromTaxFree;
        // withdrawFromRealEstate and realEstateSaleProceeds already declared at top of loop
        
        // Calculate actual shortfall - how much more we need beyond what was withdrawn
        const actualWithdrawalNeeded = totalWithdrawalForTaxCalculation;
        let remainingShortfall = actualWithdrawalNeeded - totalWithdrawnFromAccounts;
        
        // FIX: If there's still a shortfall and liquid accounts have money remaining,
        // FORCE withdraw from liquid accounts before touching real estate
        if (remainingShortfall > 0) {
          // 1. Force from Taxable first
          const taxableRemaining = getAccountTotal('taxable');
          if (remainingShortfall > 0 && taxableRemaining > 0) {
            const forceFromTaxable = Math.min(remainingShortfall, taxableRemaining);
            withdrawFromAccount('taxable', forceFromTaxable);
            withdrawFromTaxable += forceFromTaxable;
            totalWithdrawnFromAccounts += forceFromTaxable;
            remainingShortfall -= forceFromTaxable;
          }
          
          // 2. Force from Tax-Deferred second
          const taxDeferredRemaining = getAccountTotal('taxDeferred');
          if (remainingShortfall > 0 && taxDeferredRemaining > 0) {
            const forceFromTaxDeferred = Math.min(remainingShortfall, taxDeferredRemaining);
            withdrawFromAccount('taxDeferred', forceFromTaxDeferred);
            withdrawFromTaxDeferred += forceFromTaxDeferred;
            totalWithdrawnFromAccounts += forceFromTaxDeferred;
            remainingShortfall -= forceFromTaxDeferred;
          }
          
          // 3. Force from Tax-Free third
          const taxFreeRemaining = getAccountTotal('taxFree');
          if (remainingShortfall > 0 && taxFreeRemaining > 0) {
            const forceFromTaxFree = Math.min(remainingShortfall, taxFreeRemaining);
            withdrawFromAccount('taxFree', forceFromTaxFree);
            withdrawFromTaxFree += forceFromTaxFree;
            totalWithdrawnFromAccounts += forceFromTaxFree;
            remainingShortfall -= forceFromTaxFree;
          }
          
          // 4. FINALLY: Liquidate Real Estate if liquid accounts can't cover shortfall
          // IMPORTANT: Real estate is all-or-nothing - sell entire property, put excess in taxable
          if (remainingShortfall > 0 && portfolio.realEstate > 0) {
            // Sell ALL real estate
            realEstateSaleProceeds = portfolio.realEstate;
            portfolio.realEstate = 0;
            
            // Use what we need for the shortfall
            withdrawFromRealEstate = Math.min(remainingShortfall, realEstateSaleProceeds);
            
            // Put excess proceeds into taxable account (as cash)
            const excessProceeds = realEstateSaleProceeds - withdrawFromRealEstate;
            if (excessProceeds > 0) {
              portfolio.taxable.cash += excessProceeds;
            }
            
            remainingShortfall -= withdrawFromRealEstate;
          }
          
          // 5. If STILL a shortfall after all accounts including RE, portfolio is depleted
          if (remainingShortfall > 0 && getTotalPortfolio() < 100) {
            ranOutOfMoneyThisYear = true;
          }
        }

        // Check if portfolio depleted
        if (getTotalPortfolio() <= 0) {
          ranOutOfMoneyThisYear = true;
        }
      }

      // Apply event impacts to total
      // For proportionate allocation or non-asset impacts, apply to total
      // Custom allocations were already applied directly to asset buckets above
      const totalBeforeEvent = getTotalPortfolio();

      // Only add eventImpact if it wasn't a custom-allocated positive asset event
      let adjustedEventImpact = eventImpact;
      lifeEvents.forEach(event => {
        if (event.year === year && event.affects === 'assets' && event.amount > 0 && event.allocation_method === 'custom') {
          // Subtract it back out since we already added it to individual buckets
          adjustedEventImpact -= event.amount;
        }
      });

      // Calculate total debt (net worth impact) from tempRunningDebt and tempRunningCollateralizedLoans
      const totalDebt = Object.values(tempRunningDebt).reduce((sum, liab) => sum + liab.current_balance, 0) +
                        Object.values(tempRunningCollateralizedLoans).reduce((sum, loan) => sum + loan.current_balance, 0);

      // Calculate total encumbered BTC (illiquid) AFTER all liquidation logic for this year
      const currentTotalEncumberedBtc = Object.values(encumberedBtc).reduce((sum, amount) => sum + amount, 0);
      const totalReleasedBtc = Object.values(releasedBtc).reduce((sum, amount) => sum + amount, 0);
      const totalLiquidatedBtc = Object.values(liquidatedBtc).reduce((sum, amount) => sum + amount, 0);
      const yearLiquidations = liquidationEvents.filter(e => e.year === year);

      // Total assets calculation - include encumbered BTC value (user still owns it)
      const encumberedBtcValueThisYear = currentTotalEncumberedBtc * cumulativeBtcPrice;
      const totalAssetsThisYear = getTotalPortfolio(encumberedBtcValueThisYear);
      
      let total = totalAssetsThisYear + adjustedEventImpact;

      // Check if LIQUID portfolio ran out of money AFTER withdrawals are processed
      // Liquid = taxable + taxDeferred + taxFree + realEstate (assets that can cover spending)
      // Encumbered BTC is still OWNED but cannot cover spending until released
      const liquidAssetsAfterWithdrawals = getTotalLiquid() + portfolio.realEstate;
      const accountTotalAfterWithdrawals = getTotalLiquid();
      
      // Track first depletion age for reference line (based on LIQUID assets only)
      if (liquidAssetsAfterWithdrawals <= 0 && firstDepletionAge === null) {
        firstDepletionAge = age;
      } else if (liquidAssetsAfterWithdrawals > 0 && firstDepletionAge !== null) {
        // Portfolio recovered (e.g., released BTC came in), clear depletion marker
        firstDepletionAge = null;
      }
      
      // ranOutOfMoneyThisYear = liquid assets depleted (can't cover spending)
      // But Total Assets should still show encumbered BTC value (user owns it)
      if (liquidAssetsAfterWithdrawals <= 0) {
        ranOutOfMoneyThisYear = true;
        // DO NOT set total = 0. Total should reflect ALL owned assets including encumbered BTC.
      }

      const realTotal = total / Math.pow(1 + effectiveInflation / 100, i);

      // Calculate total withdrawal amount (actual cash withdrawn from accounts)
      const totalWithdrawalAmount = isRetired 
        ? Math.round((totalWithdrawalForTaxCalculation || 0) + (taxesPaid || 0) + (penaltyPaid || 0))
        : yearSavings < 0 
          ? Math.round(Math.abs(yearSavings) + (taxesPaid || 0) + (penaltyPaid || 0))
          : 0;

      data.push({
        age: currentAge + i,
        year,
        btcLiquid: Math.round(getAssetTotal('btc')),
        btcEncumbered: Math.round(currentTotalEncumberedBtc * cumulativeBtcPrice),
        btcPrice: cumulativeBtcPrice,
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
        hasEvent: lifeEvents.some(e => e.year === year) ||
          goals.some(g => g.will_be_spent && g.target_date && new Date(g.target_date).getFullYear() === year) ||
          goals.some(g => g.goal_type === 'debt_payoff' && g.linked_liability_id && g.payoff_years > 0 &&
            year >= (g.target_date ? new Date(g.target_date).getFullYear() : currentYear) &&
            year < (g.target_date ? new Date(g.target_date).getFullYear() : currentYear) + g.payoff_years),
        hasGoalWithdrawal: yearGoalWithdrawal > 0,
        isRetired: isRetired,
        isWithdrawing: isRetired || yearSavings < 0,
        yearWithdrawal: isRetired ? Math.round(totalWithdrawalForTaxCalculation) : 0,
        yearGoalWithdrawal: Math.round(yearGoalWithdrawal),
        retirementSpendingOnly: isRetired ? Math.round(retirementSpendingOnly) : 0,
        goalNames: yearGoalNames,
        btcGrowthRate: yearBtcGrowth,
        // Account type balances
        taxable: Math.round(getAccountTotal('taxable')),
        taxDeferred: Math.round(getAccountTotal('taxDeferred')),
        taxFree: Math.round(getAccountTotal('taxFree')),
        accountTotal: Math.round(accountTotalAfterWithdrawals),
        canAccessPenaltyFree: currentAge + i >= PENALTY_FREE_AGE,
        penaltyPaid: Math.round(penaltyPaid),
        taxesPaid: Math.round(taxesPaid),
        totalWithdrawalAmount: totalWithdrawalAmount,
        // Withdrawal breakdown by account type
        withdrawFromTaxable: Math.round(withdrawFromTaxable),
        withdrawFromTaxDeferred: Math.round(withdrawFromTaxDeferred),
        withdrawFromTaxFree: Math.round(withdrawFromTaxFree),
        realEstateSold: realEstateSaleProceeds > 0,
        realEstateSaleProceeds: Math.round(realEstateSaleProceeds || 0),
        withdrawFromRealEstate: Math.round(withdrawFromRealEstate || 0),
        // Debt tracking
        totalDebt: Math.round(totalDebt),
        debtPayments: Math.round(actualAnnualDebtPayments),
        encumberedBtc: currentTotalEncumberedBtc,
        releasedBtc: totalReleasedBtc,
        liquidBtc: Math.max(0, getAssetTotal('btc') / (btcPrice || 97000)),
        btcPrice: cumulativeBtcPrice,
        debtPayoffs: debtPayoffEvents,
        liquidations: yearLiquidations,
        // BTC Loan tracking
        btcLoanDetails: (() => {
          const btcLoans = Object.values(tempRunningDebt).filter(l => l.type === 'btc_collateralized' && !l.paid_off);
          
          return btcLoans.map(loan => {
            const collateralBtc = encumberedBtc[loan.id] || loan.collateral_btc_amount || 0;
            const collateralValue = collateralBtc * cumulativeBtcPrice;
            const ltv = collateralValue > 0 ? (loan.current_balance / collateralValue) * 100 : 0;
            const released = (releasedBtc[loan.id] || 0) > 0;
            const liquidated = (liquidatedBtc[loan.id] || 0) > 0;
            
            return {
              name: loan.name,
              balance: Math.round(loan.current_balance),
              collateralBtc: collateralBtc,
              collateralValue: Math.round(collateralValue),
              ltv: Math.round(ltv),
              status: liquidated ? 'liquidated' : released ? 'released' : ltv < 40 ? 'healthy' : ltv < 60 ? 'moderate' : 'elevated'
            };
          });
        })(),
        totalBtcLoanDebt: Math.round(Object.values(tempRunningDebt)
          .filter(l => l.type === 'btc_collateralized' && !l.paid_off)
          .reduce((sum, l) => sum + l.current_balance, 0)),
        totalBtcCollateralValue: Math.round((() => {
          return Object.values(tempRunningDebt)
            .filter(l => l.type === 'btc_collateralized' && !l.paid_off)
            .reduce((sum, l) => {
              const collateralBtc = encumberedBtc[l.id] || l.collateral_btc_amount || 0;
              return sum + (collateralBtc * cumulativeBtcPrice);
            }, 0);
        })()),
        totalRegularDebt: Math.round(Object.values(tempRunningDebt)
          .filter(l => l.type !== 'btc_collateralized' && !l.paid_off)
          .reduce((sum, l) => sum + l.current_balance, 0)),
        });
    }
    return data;
  }, [btcValue, stocksValue, realEstateValue, bondsValue, cashValue, otherValue, taxableValue, taxDeferredValue, taxFreeValue, currentAge, retirementAge, lifeExpectancy, effectiveBtcCagr, effectiveStocksCagr, realEstateCagr, bondsCagr, effectiveInflation, lifeEvents, goals, annualSavings, incomeGrowth, retirementAnnualSpending, btcReturnModel, filingStatus, taxableHoldings, otherRetirementIncome, socialSecurityStartAge, effectiveSocialSecurity, liabilities, collateralizedLoans, monthlyDebtPayments, btcPrice, cashCagr, otherCagr, autoTopUpBtcCollateral, btcTopUpTriggerLtv, btcTopUpTargetLtv, stateOfResidence, savingsAllocationBtc, savingsAllocationStocks, savingsAllocationBonds, savingsAllocationCash, savingsAllocationOther]);

  // Run Monte Carlo when button clicked
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
      lifeEvents,
      btcVolatility: 60,
      stocksVolatility,
    }, 1000);

    const percentiles = calculatePercentiles(simulations);

    // Calculate median withdrawal per year from simulations
    const medianWithdrawals = [];
    const years = Math.max(1, lifeExpectancy - currentAge);
    for (let i = 0; i <= years; i++) {
      const yearWithdrawals = withdrawalPaths.map(path => path[i] || 0).sort((a, b) => a - b);
      const medianIndex = Math.floor(yearWithdrawals.length / 2);
      medianWithdrawals.push(yearWithdrawals[medianIndex] || 0);
    }

    // Calculate success probability - did you NOT run out of money through life expectancy?
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
  
  // Check for portfolio depletion - use the tracked firstDepletionAge from projections
  const depletionIndex = projections.findIndex(p => p.total <= 0);
  const willRunOutOfMoney = depletionIndex !== -1;
  const runOutOfMoneyAge = willRunOutOfMoney ? projections[depletionIndex]?.age : null;
  
  const yearsInRetirement = lifeExpectancy - retirementAge;

  // Calculate inflation-adjusted retirement spending need at retirement
  const yearsToRetirement = Math.max(0, retirementAge - currentAge);
  const inflationAdjustedRetirementSpending = retirementAnnualSpending * Math.pow(1 + inflationRate / 100, yearsToRetirement);

  // Required nest egg based on income-based withdrawals
  const effectiveWithdrawalRate = Math.max(0.03, 1 / yearsInRetirement);
  const requiredNestEgg = inflationAdjustedRetirementSpending / effectiveWithdrawalRate;

  // Calculate retirement status and insights
  const retirementStatus = useMemo(() => {
    // PRIORITY 1: If portfolio depletes at any point → Critical
    if (willRunOutOfMoney) {
      return {
        type: 'critical',
        title: 'Critical: Plan Not Sustainable',
        description: `Portfolio projected to deplete at age ${runOutOfMoneyAge}.`,
        icon: <AlertTriangle className="w-5 h-5" />
      };
    }

    // PRIORITY 2: If no sustainable retirement age found → Critical
    if (earliestRetirementAge === null) {
      return {
        type: 'critical',
        title: 'At Risk: Major Shortfall',
        description: `Retirement not achievable at target age ${retirementAge} with current plan.`,
        icon: <AlertTriangle className="w-5 h-5" />
      };
    }

    // PRIORITY 3: Check gap between earliest and target
    const gap = earliestRetirementAge - retirementAge;
    
    if (gap > 3) {
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
      // gap <= 0 means can retire at or before target age
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
  }, [earliestRetirementAge, retirementAge, willRunOutOfMoney, runOutOfMoneyAge, currentAge]);

  // UNIFIED: Derive earliestRetirementAge using forward simulation
  const derivedEarliestRetirementAge = useMemo(() => {
    const total = btcValue + stocksValue + realEstateValue + bondsValue + cashValue + otherValue;
    if (total <= 0) return null;
    
    // Calculate current allocation
    const btcPct = btcValue / total;
    const stocksPct = stocksValue / total;
    const realEstatePct = realEstateValue / total;
    const bondsPct = bondsValue / total;
    const cashPct = cashValue / total;
    const otherPct = otherValue / total;
    
    // Test each potential retirement age
    for (let testRetireAge = currentAge + 1; testRetireAge <= lifeExpectancy - 5; testRetireAge++) {
      const result = simulateForward({
        startingPortfolio: total,
        startAge: currentAge,
        endAge: lifeExpectancy,
        retireAge: testRetireAge,
        annualSpending: retirementAnnualSpending,
        annualSavings: annualSavings,
        inflationRate: effectiveInflation,
        btcPct,
        stocksPct,
        realEstatePct,
        bondsPct,
        cashPct,
        otherPct,
      });
      
      if (result.survives) {
        return testRetireAge;
      }
    }
    
    return null; // Not achievable at any tested age
  }, [currentAge, lifeExpectancy, btcValue, stocksValue, realEstateValue, bondsValue, cashValue, otherValue, retirementAnnualSpending, annualSavings, effectiveInflation, effectiveStocksCagr, realEstateCagr, bondsCagr, cashCagr, otherCagr, incomeGrowth, getBtcGrowthRate]);

  // Update state when derived value changes
  useEffect(() => {
    setEarliestRetirementAge(derivedEarliestRetirementAge);
  }, [derivedEarliestRetirementAge]);

  // UNIFIED: Derive maxSustainableSpending using binary search simulation
  const derivedMaxSustainableSpending = useMemo(() => {
    const total = btcValue + stocksValue + realEstateValue + bondsValue + cashValue + otherValue;
    if (total <= 0) return 0;
    
    // Calculate current allocation
    const btcPct = btcValue / total;
    const stocksPct = stocksValue / total;
    const realEstatePct = realEstateValue / total;
    const bondsPct = bondsValue / total;
    const cashPct = cashValue / total;
    const otherPct = otherValue / total;
    
    // First, estimate portfolio at retirement to set proper search bounds
    const projectionResult = simulateForward({
      startingPortfolio: total,
      startAge: currentAge,
      endAge: retirementAge,
      retireAge: retirementAge,
      annualSpending: 0,
      annualSavings: annualSavings,
      inflationRate: effectiveInflation,
      btcPct,
      stocksPct,
      realEstatePct,
      bondsPct,
      cashPct,
      otherPct,
    });

    // Convert projected retirement portfolio to today's dollars
    const yearsToRetirement = Math.max(0, retirementAge - currentAge);
    const estimatedRetirementPortfolio = projectionResult.finalPortfolio || total;
    const retirementPortfolioTodaysDollars = yearsToRetirement > 0 
      ? estimatedRetirementPortfolio / Math.pow(1 + effectiveInflation / 100, yearsToRetirement)
      : estimatedRetirementPortfolio;

    // Binary search for max sustainable spending
    let low = 0;
    let high = Math.max(total * 0.20, retirementPortfolioTodaysDollars * 0.20);
    
    for (let iteration = 0; iteration < 30; iteration++) {
      const testSpending = (low + high) / 2;
      
      const result = simulateForward({
        startingPortfolio: total,
        startAge: currentAge,
        endAge: lifeExpectancy,
        retireAge: retirementAge,
        annualSpending: testSpending,
        annualSavings: annualSavings,
        inflationRate: effectiveInflation,
        btcPct,
        stocksPct,
        realEstatePct,
        bondsPct,
        cashPct,
        otherPct,
      });
      
      if (result.survives) {
        low = testSpending;
      } else {
        high = testSpending;
      }
    }
    
    return Math.round(low);
  }, [currentAge, retirementAge, lifeExpectancy, btcValue, stocksValue, realEstateValue, bondsValue, cashValue, otherValue, annualSavings, effectiveInflation, effectiveStocksCagr, realEstateCagr, bondsCagr, cashCagr, otherCagr, incomeGrowth, getBtcGrowthRate]);

  // Update state when derived value changes
  useEffect(() => {
    setMaxSustainableSpending(derivedMaxSustainableSpending);
  }, [derivedMaxSustainableSpending]);

  // Calculate lifetime tax burden in retirement
  const lifetimeTaxesPaid = projections.filter(p => p.isRetired).reduce((sum, p) => sum + (p.taxesPaid || 0), 0);
  const lifetimePenaltiesPaid = projections.filter(p => p.isRetired).reduce((sum, p) => sum + (p.penaltyPaid || 0), 0);
  const avgAnnualTaxInRetirement = yearsInRetirement > 0 ? lifetimeTaxesPaid / yearsInRetirement : 0;

  // Calculate projected portfolio return based on asset allocation and assumptions
  const projectedPortfolioReturn = useMemo(() => {
    if (totalValue <= 0) return 0;
    const btcPct = btcValue / totalValue;
    const stocksPct = stocksValue / totalValue;
    const realEstatePct = realEstateValue / totalValue;
    const bondsPct = bondsValue / totalValue;
    const cashPct = cashValue / totalValue;
    const otherPct = otherValue / totalValue;

    // Get year 1 BTC growth rate based on selected model
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

  // Calculate when goals will be met based on projections
  const goalsWithProjections = useMemo(() => {
    return goals.map(goal => {
      const targetAmount = goal.target_amount || 0;
      const currentAmount = goal.current_amount || 0;

      // Find when portfolio reaches goal amount
      const meetYearIndex = projections.findIndex(p => p.total >= targetAmount);
      const meetYear = meetYearIndex >= 0 ? projections[meetYearIndex]?.year : null;
      const meetAge = meetYearIndex >= 0 ? projections[meetYearIndex]?.age : null;

      // Calculate if on track for target date
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

      // For savings goals, calculate monthly contribution needed
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

  // Calculate life events impact on cash flow
  const lifeEventsWithImpact = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return lifeEvents.map(event => {
      const yearsFromNow = event.year - currentYear;
      const projectionAtEvent = projections.find(p => p.year === event.year);
      const portfolioAtEvent = projectionAtEvent?.total || 0;

      // Calculate if event is affordable
      let isAffordable = true;
      let impactPercent = 0;
      if (event.affects === 'assets' && event.amount < 0) {
        isAffordable = portfolioAtEvent >= Math.abs(event.amount);
        impactPercent = portfolioAtEvent > 0 ? (Math.abs(event.amount) / portfolioAtEvent) * 100 : 100;
      }

      // For home purchases, calculate total impact
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

  // Calculate first year withdrawal and average withdrawal in retirement
  const firstRetirementWithdrawal = projections[retirementYearIndex]?.yearWithdrawal || 0;
  const retirementYears = projections.filter(p => p.isRetired);
  const avgRetirementWithdrawal = retirementYears.length > 0
    ? retirementYears.reduce((sum, p) => sum + p.yearWithdrawal, 0) / retirementYears.length
    : 0;
  const totalLifetimeWithdrawals = retirementYears.reduce((sum, p) => sum + p.yearWithdrawal, 0);

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
      {/* Header */}
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

      {/* Assumptions Panel */}
      {showMonteCarloSettings && (
        <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
          <h3 className="font-semibold mb-6 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Rate Assumptions
          </h3>
          {/* BTC Return Model Selection */}
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-zinc-800/50 p-1 flex-wrap">
          <TabsTrigger value="projections" className="data-[state=active]:bg-zinc-700">Retirement Planning</TabsTrigger>
          <TabsTrigger value="montecarlo" className="data-[state=active]:bg-zinc-700">Monte Carlo</TabsTrigger>
        </TabsList>

        {/* Projections Tab */}
        <TabsContent value="projections" className="space-y-6">
          {/* Earliest FI Age - Hero Card - NOW AT TOP */}
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
                      <span className="text-zinc-400">Target Retirement Spending:</span>
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

                  {/* Retirement Status Indicator */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Status Card */}
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

            {/* Actionable Insights - Show when behind schedule or plan not sustainable */}
            {(!earliestRetirementAge || earliestRetirementAge > retirementAge || willRunOutOfMoney || retirementStatus.type === 'critical' || retirementStatus.type === 'at_risk') && (
              <>
                {/* Savings Insight */}
                <div className="card-premium rounded-xl p-4 border border-zinc-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <h5 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Increase Annual Investment By</h5>
                  </div>
                  <p className="text-2xl font-bold text-emerald-400">
                    +{formatNumber((() => {
                      const yearsToWork = retirementAge - currentAge;
                      if (yearsToWork <= 0) return 0;

                      // Calculate shortfall based on sustainable vs desired spending (both in today's dollars)
                      const spendingShortfall = Math.max(0, retirementAnnualSpending - maxSustainableSpending);
                      if (spendingShortfall <= 0) return 0;

                      // Required additional nest egg in today's dollars to support the shortfall
                      const effectiveWithdrawalRate = Math.max(0.03, 1 / (lifeExpectancy - retirementAge));
                      const additionalNestEggNeeded = spendingShortfall / effectiveWithdrawalRate;

                      // Calculate blended growth rate for new savings
                      const totalAssets = btcValue + stocksValue + realEstateValue + bondsValue + cashValue + otherValue;
                      const btcPct = totalAssets > 0 ? btcValue / totalAssets : 0.5;
                      const stocksPct = totalAssets > 0 ? stocksValue / totalAssets : 0.3;
                      const realEstatePct = totalAssets > 0 ? realEstateValue / totalAssets : 0.1;
                      const bondsPct = totalAssets > 0 ? bondsValue / totalAssets : 0.05;
                      const cashPct = totalAssets > 0 ? cashValue / totalAssets : 0.0;
                      const otherPct = totalAssets > 0 ? otherValue / totalAssets : 0.05;

                      // Weighted average of expected returns
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
                        cashPct * (cashCagr / 100) +
                        otherPct * (otherCagr / 100)
                      );

                      // Annual savings needed using future value of annuity formula
                      // FV = PMT * [(1+r)^n - 1] / r
                      // So: PMT = FV / {[(1+r)^n - 1] / r}
                      if (Math.abs(blendedGrowthRate) < 0.001) {
                        return additionalNestEggNeeded / yearsToWork;
                      }

                      const fvFactor = (Math.pow(1 + blendedGrowthRate, yearsToWork) - 1) / blendedGrowthRate;
                      return additionalNestEggNeeded / fvFactor;
                    })())}<span className="text-sm text-zinc-500">/yr</span>
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1">invested into your portfolio to retire at age {retirementAge}</p>
                </div>

                {/* Spending Reduction Insight */}
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

                {/* Alternative: Delay Retirement */}
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

          {/* Projection Chart */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-2">Wealth Projection</h3>
            <p className="text-sm text-zinc-400 mb-4">
              {lifeEvents.length > 0 && `${lifeEvents.length} life event${lifeEvents.length !== 1 ? 's' : ''} • `}
              {goals.filter(g => g.will_be_spent).length > 0 && `${goals.filter(g => g.will_be_spent).length} planned expense${goals.filter(g => g.will_be_spent).length !== 1 ? 's' : ''} • `}
              {goals.length > 0 && `${goals.length} goal${goals.length !== 1 ? 's' : ''} tracked`}
            </p>
            <div className="h-[500px]" ref={chartContainerRef}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart 
                    data={projections} 
                    margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
                    onClick={(e) => {
                      if (e && e.activePayload && e.activeLabel !== undefined && e.activeCoordinate) {
                        // If clicking the same age, unlock
                        if (lockedTooltipData && lockedTooltipData.label === e.activeLabel) {
                          setLockedTooltipData(null);
                        } else {
                          // Lock to this data point with position
                          setLockedTooltipData({ 
                            payload: e.activePayload, 
                            label: e.activeLabel,
                            x: e.activeCoordinate.x,
                            y: 50 // Fixed y position near top
                          });
                        }
                      } else {
                        // Clicking empty area unlocks
                        setLockedTooltipData(null);
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="age" stroke="#71717a" fontSize={12} />
                    <YAxis yAxisId="left" stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
                    <YAxis yAxisId="right" orientation="right" stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ 
                        backgroundColor: '#18181b', 
                        border: '1px solid #27272a', 
                        borderRadius: '12px',
                        maxHeight: '400px',
                        overflowY: 'auto'
                      }}
                      wrapperStyle={{ 
                        zIndex: 1000,
                        pointerEvents: lockedTooltipData ? 'auto' : 'none'
                      }}
                      position={lockedTooltipData ? { x: lockedTooltipData.x + 15, y: lockedTooltipData.y } : { y: 0 }}
                      active={lockedTooltipData ? true : undefined}
                      cursor={lockedTooltipData ? false : true}
                      content={({ active, payload, label, coordinate }) => {
                        // If tooltip is locked, ONLY show locked data (ignore hover)
                        if (lockedTooltipData) {
                          const p = lockedTooltipData.payload[0]?.payload;
                          if (!p) return null;
                          const displayLabel = lockedTooltipData.label;
                          const hasLiquidation = p.liquidations && p.liquidations.length > 0;

                          return (
                            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-sm min-w-[240px] max-h-[400px] overflow-y-auto shadow-xl">
                              <div className="mb-4">
                                <div className="flex items-center justify-between">
                                  <p className="font-bold text-lg text-zinc-100">Age {displayLabel} {p.hasEvent ? '📅' : ''} {hasLiquidation ? '⚠️' : ''}</p>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setLockedTooltipData(null); }}
                                    className="text-zinc-500 hover:text-zinc-300 text-xs ml-2 p-1"
                                  >
                                    ✕
                                  </button>
                                </div>
                                <p className="text-xs text-zinc-500">{p.isRetired ? '(Retirement)' : '(Pre-Retirement)'} • Click ✕ or outside to unlock</p>
                              </div>
                              <div className="space-y-2">
                                {((p.btcLiquid || 0) > 0 || (p.btcEncumbered || 0) > 0) && (() => {
                                  const btcPrice = p.btcPrice || currentPrice;
                                  const liquidBtcAmount = (p.btcLiquid || 0) / btcPrice;
                                  const collateralBtcAmount = (p.btcEncumbered || 0) / btcPrice;
                                  const totalBtcAmount = liquidBtcAmount + collateralBtcAmount;
                                  
                                  return (
                                    <>
                                      <div className="flex justify-between gap-6">
                                        <span className="text-orange-400 font-medium">Bitcoin:</span>
                                        <span className="text-zinc-200 font-medium text-right">
                                          ${((p.btcLiquid || 0) + (p.btcEncumbered || 0)).toLocaleString()}
                                          <span className="text-zinc-500 text-xs ml-1">({totalBtcAmount.toFixed(4)} BTC)</span>
                                        </span>
                                      </div>
                                      {(p.btcLiquid || 0) > 0 && (
                                        <div className="flex justify-between gap-6 pl-3">
                                          <span className="text-orange-400/70 font-light text-sm">└ Liquid:</span>
                                          <span className="text-zinc-300 text-sm text-right">
                                            ${(p.btcLiquid || 0).toLocaleString()}
                                            <span className="text-zinc-500 text-xs ml-1">({liquidBtcAmount.toFixed(4)} BTC)</span>
                                          </span>
                                        </div>
                                      )}
                                      {(p.btcEncumbered || 0) > 0 && (
                                        <div className="flex justify-between gap-6 pl-3">
                                          <span className="text-amber-700/70 font-light text-sm">└ Collateral 🔒:</span>
                                          <span className="text-zinc-300 text-sm text-right">
                                            ${(p.btcEncumbered || 0).toLocaleString()}
                                            <span className="text-zinc-500 text-xs ml-1">({collateralBtcAmount.toFixed(4)} BTC)</span>
                                          </span>
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                                <div className="flex justify-between gap-6">
                                  <span className="text-blue-400 font-light">Stocks:</span>
                                  <span className="text-zinc-200 font-medium text-right">${(p.stocks || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between gap-6">
                                  <span className="text-emerald-400 font-light">Real Estate:</span>
                                  <span className="text-zinc-200 font-medium text-right">${(p.realEstate || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between gap-6">
                                  <span className="text-purple-400 font-light">Bonds:</span>
                                  <span className="text-zinc-200 font-medium text-right">${(p.bonds || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between gap-6">
                                  <span className="text-cyan-400 font-light">Cash:</span>
                                  <span className="text-zinc-200 font-medium text-right">${(p.cash || 0).toLocaleString()}</span>
                                </div>
                                <div className="pt-3 mt-3 border-t border-zinc-700/70 space-y-1.5">
                                  <div className="flex justify-between gap-6">
                                    <span className="text-zinc-100 font-semibold">Total Assets:</span>
                                    <span className="text-zinc-100 font-semibold text-right">${(p.total || 0).toLocaleString()}</span>
                                  </div>
                                </div>
                                
                                {/* Debt Summary */}
                                {(p.totalDebt > 0) && (
                                  <div className="pt-3 mt-3 border-t border-zinc-700/70">
                                    <div className="flex justify-between gap-6">
                                      <span className="text-rose-300 font-semibold">Total Debt:</span>
                                      <span className="text-rose-300 font-semibold">-${(p.totalDebt || 0).toLocaleString()}</span>
                                    </div>
                                    {p.totalBtcLoanDebt > 0 && (
                                      <div className="flex justify-between gap-6 text-xs text-zinc-500 mt-1">
                                        <span>BTC-Backed:</span>
                                        <span>${(p.totalBtcLoanDebt || 0).toLocaleString()} ({Math.round((p.btcLoanDetails || []).reduce((sum, l) => sum + l.ltv, 0) / (p.btcLoanDetails?.length || 1))}% avg LTV)</span>
                                      </div>
                                    )}
                                    {p.totalRegularDebt > 0 && (
                                      <div className="flex justify-between gap-6 text-xs text-zinc-500 mt-1">
                                        <span>Regular Debt:</span>
                                        <span>${(p.totalRegularDebt || 0).toLocaleString()}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between gap-6 mt-2 pt-2 border-t border-zinc-700/40">
                                      <span className={cn("font-semibold", ((p.total || 0) - (p.totalDebt || 0)) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                        Net Worth:
                                      </span>
                                      <span className={cn("font-semibold", ((p.total || 0) - (p.totalDebt || 0)) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                        ${((p.total || 0) - (p.totalDebt || 0)).toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                )}
                                {p.isWithdrawing && (
                                  <div className="pt-3 mt-3 border-t border-zinc-700/70">
                                    <p className="text-zinc-400 mb-2 font-medium text-xs">Annual Outflow:</p>
                                    <div className="text-xs space-y-1.5 text-zinc-500 mb-2">
                                      {p.isRetired ? (
                                        <div className="flex justify-between gap-6">
                                          <span>• Spending:</span>
                                          <span className="text-zinc-300 text-right">${(p.retirementSpendingOnly || 0).toLocaleString()}</span>
                                        </div>
                                      ) : (
                                        <div className="flex justify-between gap-6">
                                          <span>• Spending:</span>
                                          <span className="text-zinc-300 text-right">${(p.yearSpending || 0).toLocaleString()}</span>
                                        </div>
                                      )}
                                      {p.yearGoalWithdrawal > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>• Goal Funding:</span>
                                          <span className="text-zinc-300 text-right">${p.yearGoalWithdrawal.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {p.taxesPaid > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>• Taxes (Fed + {stateOfResidence}):</span>
                                          <span className="text-rose-300 text-right">${p.taxesPaid.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {p.penaltyPaid > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>• Penalty Paid:</span>
                                          <span className="text-rose-300 text-right">${p.penaltyPaid.toLocaleString()}</span>
                                        </div>
                                      )}
                                      </div>
                                      {(p.debtPayments > 0 && !p.isRetired) && (
                                      <div className="text-xs text-zinc-500 mb-2">
                                        (Debt Payments: ${p.debtPayments.toLocaleString()} - tracked separately)
                                      </div>
                                      )}
                                      <div className="pt-2 border-t border-zinc-700/40">
                                      <p className="font-semibold text-rose-300 text-sm">
                                        Net Withdrawal: ${(p.totalWithdrawalAmount || 0).toLocaleString()}
                                      </p>
                                      </div>
                                      {(p.withdrawFromTaxable > 0 || p.withdrawFromTaxDeferred > 0 || p.withdrawFromTaxFree > 0) && (
                                      <div className="text-xs space-y-1.5 text-zinc-500 mt-3 pt-3 border-t border-zinc-700/40">
                                        <p className="text-zinc-400 font-medium mb-1">Withdrawal Sources:</p>
                                        {p.withdrawFromTaxable > 0 && (
                                          <div className="flex justify-between gap-6">
                                            <span>From Taxable:</span>
                                            <span className="text-emerald-400 text-right">${p.withdrawFromTaxable.toLocaleString()}</span>
                                          </div>
                                        )}
                                        {p.withdrawFromTaxDeferred > 0 && (
                                          <div className="flex justify-between gap-6">
                                            <span>From Tax-Deferred:</span>
                                            <span className="text-amber-400 text-right">${p.withdrawFromTaxDeferred.toLocaleString()}</span>
                                          </div>
                                        )}
                                        {p.withdrawFromTaxFree > 0 && (
                                          <div className="flex justify-between gap-6">
                                            <span>From Tax-Free:</span>
                                            <span className="text-purple-400 text-right">${p.withdrawFromTaxFree.toLocaleString()}</span>
                                          </div>
                                        )}
                                        {p.withdrawFromRealEstate > 0 && (
                                          <div className="flex justify-between gap-6">
                                            <span>From Real Estate:</span>
                                            <span className="text-cyan-400 text-right">${p.withdrawFromRealEstate.toLocaleString()}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {p.realEstateSold && (
                                      <div className="mt-2 p-2 rounded bg-cyan-500/10 border border-cyan-500/20">
                                        <p className="text-xs text-cyan-400 font-medium">🏠 Real Estate Sold</p>
                                        <div className="text-[10px] text-zinc-400 mt-1">
                                          <div>Sale Proceeds: ${(p.realEstateSaleProceeds || 0).toLocaleString()}</div>
                                          <div>Used for Withdrawal: ${(p.withdrawFromRealEstate || 0).toLocaleString()}</div>
                                          <div>Added to Taxable: ${((p.realEstateSaleProceeds || 0) - (p.withdrawFromRealEstate || 0)).toLocaleString()}</div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {!p.isWithdrawing && p.netCashFlow > 0 && (
                                  <div className="pt-3 mt-3 border-t border-zinc-700/70">
                                    <p className="text-zinc-400 mb-2 font-medium text-xs">Annual Cash Flow:</p>
                                    <div className="text-xs space-y-1.5 text-zinc-500 mb-2">
                                      <div className="flex justify-between gap-6">
                                        <span>• Gross Income:</span>
                                        <span className="text-emerald-400 text-right">${(p.yearGrossIncome || 0).toLocaleString()}</span>
                                      </div>
                                      {p.taxesPaid > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>• Taxes Paid:</span>
                                          <span className="text-rose-300 text-right">-${p.taxesPaid.toLocaleString()}</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between gap-6">
                                        <span>• Spending:</span>
                                        <span className="text-zinc-300 text-right">-${(p.yearSpending || 0).toLocaleString()}</span>
                                      </div>
                                    </div>
                                    {p.debtPayments > 0 && (
                                      <div className="text-xs text-zinc-500 mb-2">
                                        (Debt Payments: ${p.debtPayments.toLocaleString()} - tracked separately)
                                      </div>
                                    )}
                                    <div className="pt-2 border-t border-zinc-700/40">
                                      <p className="font-semibold text-emerald-400 text-sm">
                                        Net Savings: ${p.netCashFlow.toLocaleString()}
                                      </p>
                                    </div>
                                  </div>
                                )}
                                {p.debtPayoffs && p.debtPayoffs.length > 0 && (
                                  <div className="pt-3 mt-3 border-t border-zinc-700/70">
                                    <p className="text-xs font-semibold text-emerald-400 mb-2">🎉 Debt Paid Off This Year:</p>
                                    <div className="space-y-1">
                                      {p.debtPayoffs.map((d, idx) => {
                                        const monthName = d.month ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.month - 1] : '';
                                        return (
                                          <p key={idx} className="text-xs text-emerald-400 font-light">
                                            ✓ {d.name || d.liability_name || 'Debt'}{monthName ? ` (${monthName})` : ''}
                                          </p>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                {p.liquidations && p.liquidations.length > 0 && (
                                  <div className="pt-3 mt-3 border-t border-zinc-700/70">
                                    {p.liquidations.map((liq, idx) => (
                                      <div key={idx} className="text-xs text-zinc-400 space-y-1 mb-2">
                                        {liq.type === 'top_up' ? (
                                          <>
                                            <p className="text-xs font-semibold text-amber-400 mb-1">🔄 Collateral Top-Up:</p>
                                            <p className="text-amber-400">• {liq.liabilityName}</p>
                                            <p className="ml-3 text-zinc-500">{liq.message}</p>
                                          </>
                                        ) : liq.type === 'release' ? (
                                          <>
                                            <p className="text-xs font-semibold text-cyan-400 mb-1">✅ Collateral Released:</p>
                                            <p className="text-cyan-400">• {liq.liabilityName}</p>
                                            <p className="ml-3 text-zinc-500">{liq.message}</p>
                                          </>
                                        ) : (
                                          <>
                                            <p className="text-xs font-semibold text-rose-400 mb-1">
                                              {liq.remainingDebt <= 0 ? '⚠️ Loan Liquidated:' : '⚠️ Partial Liquidation:'}
                                            </p>
                                            <p className="text-rose-400">• {liq.liabilityName}</p>
                                            <p className="ml-3 text-zinc-500">{liq.message || `Liquidated: ${(liq.btcAmount || 0).toFixed(4)} BTC ($${(liq.proceeds || 0).toLocaleString()})`}</p>
                                            {liq.remainingDebt > 0 && (
                                              <p className="ml-3 text-zinc-500">Remaining debt: ${liq.remainingDebt?.toLocaleString()} • Collateral: {(liq.remainingCollateral || 0).toFixed(4)} BTC</p>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }
                        
                        // Normal hover behavior when not locked
                        if (!active || !payload?.length) return null;
                        const p = payload[0]?.payload;
                        if (!p) return null;
                        const hasLiquidation = p.liquidations && p.liquidations.length > 0;

                        return (
                          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-sm min-w-[240px] max-h-[400px] overflow-y-auto shadow-xl">
                            <div className="mb-4">
                              <div className="flex items-center justify-between">
                                <p className="font-bold text-lg text-zinc-100">Age {label} {p.hasEvent ? '📅' : ''} {hasLiquidation ? '⚠️' : ''}</p>
                                {lockedTooltipData && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setLockedTooltipData(null); }}
                                    className="text-zinc-500 hover:text-zinc-300 text-xs ml-2"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-zinc-500">{p.isRetired ? '(Retirement)' : '(Pre-Retirement)'}{lockedTooltipData ? ' • Click to unlock' : ''}</p>
                            </div>
                            <div className="space-y-2">
                              {((p.btcLiquid || 0) > 0 || (p.btcEncumbered || 0) > 0) && (() => {
                                const btcPrice = p.btcPrice || currentPrice;
                                const liquidBtcAmount = (p.btcLiquid || 0) / btcPrice;
                                const collateralBtcAmount = (p.btcEncumbered || 0) / btcPrice;
                                const totalBtcAmount = liquidBtcAmount + collateralBtcAmount;
                                
                                return (
                                  <>
                                    <div className="flex justify-between gap-6">
                                      <span className="text-orange-400 font-medium">Bitcoin:</span>
                                      <span className="text-zinc-200 font-medium text-right">
                                        ${((p.btcLiquid || 0) + (p.btcEncumbered || 0)).toLocaleString()}
                                        <span className="text-zinc-500 text-xs ml-1">({totalBtcAmount.toFixed(4)} BTC)</span>
                                      </span>
                                    </div>
                                    {(p.btcLiquid || 0) > 0 && (
                                      <div className="flex justify-between gap-6 pl-3">
                                        <span className="text-orange-400/70 font-light text-sm">└ Liquid:</span>
                                        <span className="text-zinc-300 text-sm text-right">
                                          ${(p.btcLiquid || 0).toLocaleString()}
                                          <span className="text-zinc-500 text-xs ml-1">({liquidBtcAmount.toFixed(4)} BTC)</span>
                                        </span>
                                      </div>
                                    )}
                                    {(p.btcEncumbered || 0) > 0 && (
                                      <div className="flex justify-between gap-6 pl-3">
                                        <span className="text-amber-700/70 font-light text-sm">└ Collateral 🔒:</span>
                                        <span className="text-zinc-300 text-sm text-right">
                                          ${(p.btcEncumbered || 0).toLocaleString()}
                                          <span className="text-zinc-500 text-xs ml-1">({collateralBtcAmount.toFixed(4)} BTC)</span>
                                        </span>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                              <div className="flex justify-between gap-6">
                                <span className="text-blue-400 font-light">Stocks:</span>
                                <span className="text-zinc-200 font-medium text-right">${(p.stocks || 0).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between gap-6">
                                <span className="text-emerald-400 font-light">Real Estate:</span>
                                <span className="text-zinc-200 font-medium text-right">${(p.realEstate || 0).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between gap-6">
                                <span className="text-purple-400 font-light">Bonds:</span>
                                <span className="text-zinc-200 font-medium text-right">${(p.bonds || 0).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between gap-6">
                                <span className="text-cyan-400 font-light">Cash:</span>
                                <span className="text-zinc-200 font-medium text-right">${(p.cash || 0).toLocaleString()}</span>
                              </div>
                              <div className="pt-3 mt-3 border-t border-zinc-700/70 space-y-1.5">
                                <div className="flex justify-between gap-6">
                                  <span className="text-zinc-100 font-semibold">Total Assets:</span>
                                  <span className="text-zinc-100 font-semibold text-right">${(p.total || 0).toLocaleString()}</span>
                                </div>
                              </div>
                              
                              {/* Debt Summary - Simplified */}
                              {(p.totalDebt > 0) && (
                                <div className="pt-3 mt-3 border-t border-zinc-700/70">
                                  <div className="flex justify-between gap-6">
                                    <span className="text-rose-300 font-semibold">Total Debt:</span>
                                    <span className="text-rose-300 font-semibold">-${(p.totalDebt || 0).toLocaleString()}</span>
                                  </div>
                                  {p.totalBtcLoanDebt > 0 && (
                                    <div className="flex justify-between gap-6 text-xs text-zinc-500 mt-1">
                                      <span>BTC-Backed:</span>
                                      <span>${(p.totalBtcLoanDebt || 0).toLocaleString()} ({Math.round((p.btcLoanDetails || []).reduce((sum, l) => sum + l.ltv, 0) / (p.btcLoanDetails?.length || 1))}% avg LTV)</span>
                                    </div>
                                  )}
                                  {p.totalRegularDebt > 0 && (
                                    <div className="flex justify-between gap-6 text-xs text-zinc-500 mt-1">
                                      <span>Regular Debt:</span>
                                      <span>${(p.totalRegularDebt || 0).toLocaleString()}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between gap-6 mt-2 pt-2 border-t border-zinc-700/40">
                                    <span className={cn("font-semibold", ((p.total || 0) - (p.totalDebt || 0)) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                      Net Worth:
                                    </span>
                                    <span className={cn("font-semibold", ((p.total || 0) - (p.totalDebt || 0)) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                      ${((p.total || 0) - (p.totalDebt || 0)).toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              )}
                              {p.isWithdrawing && (
                                <div className="pt-3 mt-3 border-t border-zinc-700/70">
                                  <p className="text-zinc-400 mb-2 font-medium text-xs">Annual Outflow:</p>
                                  <div className="text-xs space-y-1.5 text-zinc-500 mb-2">
                                    {p.isRetired ? (
                                      <div className="flex justify-between gap-6">
                                        <span>• Spending:</span>
                                        <span className="text-zinc-300 text-right">${(p.retirementSpendingOnly || 0).toLocaleString()}</span>
                                      </div>
                                    ) : (
                                      <div className="flex justify-between gap-6">
                                        <span>• Spending:</span>
                                        <span className="text-zinc-300 text-right">${(p.yearSpending || 0).toLocaleString()}</span>
                                      </div>
                                    )}
                                    {p.yearGoalWithdrawal > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>• Goal Funding:</span>
                                        <span className="text-zinc-300 text-right">${p.yearGoalWithdrawal.toLocaleString()}</span>
                                      </div>
                                    )}
                                    {p.taxesPaid > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>• Taxes (Fed + {stateOfResidence}):</span>
                                        <span className="text-rose-300 text-right">${p.taxesPaid.toLocaleString()}</span>
                                      </div>
                                    )}
                                    {p.penaltyPaid > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>• Penalty Paid:</span>
                                        <span className="text-rose-300 text-right">${p.penaltyPaid.toLocaleString()}</span>
                                      </div>
                                    )}
                                  </div>
                                  {(p.debtPayments > 0 && !p.isRetired) && (
                                    <div className="text-xs text-zinc-500 mb-2">
                                      (Debt Payments: ${p.debtPayments.toLocaleString()} - tracked separately)
                                    </div>
                                  )}
                                  <div className="pt-2 border-t border-zinc-700/40">
                                    <p className="font-semibold text-rose-300 text-sm">
                                      Net Withdrawal: ${(p.totalWithdrawalAmount || 0).toLocaleString()}
                                    </p>
                                  </div>
                                  {(p.withdrawFromTaxable > 0 || p.withdrawFromTaxDeferred > 0 || p.withdrawFromTaxFree > 0) && (
                                    <div className="text-xs space-y-1.5 text-zinc-500 mt-3 pt-3 border-t border-zinc-700/40">
                                      <p className="text-zinc-400 font-medium mb-1">Withdrawal Sources:</p>
                                      {p.withdrawFromTaxable > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>From Taxable:</span>
                                          <span className="text-emerald-400 text-right">${p.withdrawFromTaxable.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {p.withdrawFromTaxDeferred > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>From Tax-Deferred:</span>
                                          <span className="text-amber-400 text-right">${p.withdrawFromTaxDeferred.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {p.withdrawFromTaxFree > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>From Tax-Free:</span>
                                          <span className="text-purple-400 text-right">${p.withdrawFromTaxFree.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {p.withdrawFromRealEstate > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>From Real Estate:</span>
                                          <span className="text-cyan-400 text-right">${p.withdrawFromRealEstate.toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {p.realEstateSold && (
                                    <div className="mt-2 p-2 rounded bg-cyan-500/10 border border-cyan-500/20">
                                      <p className="text-xs text-cyan-400 font-medium">🏠 Real Estate Sold</p>
                                      <div className="text-[10px] text-zinc-400 mt-1">
                                        <div>Sale Proceeds: ${(p.realEstateSaleProceeds || 0).toLocaleString()}</div>
                                        <div>Used for Withdrawal: ${(p.withdrawFromRealEstate || 0).toLocaleString()}</div>
                                        <div>Added to Taxable: ${((p.realEstateSaleProceeds || 0) - (p.withdrawFromRealEstate || 0)).toLocaleString()}</div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              {!p.isWithdrawing && p.netCashFlow > 0 && (
                                <div className="pt-3 mt-3 border-t border-zinc-700/70">
                                  <p className="text-zinc-400 mb-2 font-medium text-xs">Annual Cash Flow:</p>
                                  <div className="text-xs space-y-1.5 text-zinc-500 mb-2">
                                    <div className="flex justify-between gap-6">
                                      <span>• Gross Income:</span>
                                      <span className="text-emerald-400 text-right">${(p.yearGrossIncome || 0).toLocaleString()}</span>
                                    </div>
                                    {p.taxesPaid > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>• Taxes Paid:</span>
                                        <span className="text-rose-300 text-right">-${p.taxesPaid.toLocaleString()}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between gap-6">
                                      <span>• Spending:</span>
                                      <span className="text-zinc-300 text-right">-${(p.yearSpending || 0).toLocaleString()}</span>
                                    </div>
                                  </div>
                                  {(p.debtPayments > 0) && (
                                    <div className="text-xs text-zinc-500 mb-2">
                                      (Debt Payments: ${p.debtPayments.toLocaleString()} - tracked separately)
                                    </div>
                                  )}
                                  <div className="pt-2 border-t border-zinc-700/40">
                                    <p className="font-semibold text-emerald-400 text-sm">
                                      Net Savings: ${p.netCashFlow.toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                              )}
                              {p.debtPayoffs && p.debtPayoffs.length > 0 && (
                                <div className="pt-3 mt-3 border-t border-zinc-700/70">
                                  <p className="text-xs font-semibold text-emerald-400 mb-2">🎉 Debt Paid Off This Year:</p>
                                  <div className="space-y-1">
                                    {p.debtPayoffs.map((d, idx) => {
                                      const monthName = d.month ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.month - 1] : '';
                                      return (
                                        <p key={idx} className="text-xs text-emerald-400 font-light">
                                          ✓ {d.name || d.liability_name || 'Debt'}{monthName ? ` (${monthName})` : ''}
                                        </p>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {p.liquidations && p.liquidations.length > 0 && (
                                <div className="pt-3 mt-3 border-t border-zinc-700/70">
                                  {p.liquidations.map((liq, idx) => (
                                    <div key={idx} className="text-xs text-zinc-400 space-y-1 mb-2">
                                      {liq.type === 'top_up' ? (
                                        <>
                                          <p className="text-xs font-semibold text-amber-400 mb-1">🔄 Collateral Top-Up:</p>
                                          <p className="text-amber-400">• {liq.liabilityName}</p>
                                          <p className="ml-3 text-zinc-500">{liq.message}</p>
                                        </>
                                      ) : liq.type === 'release' ? (
                                        <>
                                          <p className="text-xs font-semibold text-cyan-400 mb-1">✅ Collateral Released:</p>
                                          <p className="text-cyan-400">• {liq.liabilityName}</p>
                                          <p className="ml-3 text-zinc-500">{liq.message}</p>
                                        </>
                                      ) : (
                                        <>
                                          <p className="text-xs font-semibold text-rose-400 mb-1">
                                            {liq.remainingDebt <= 0 ? '⚠️ Loan Liquidated:' : '⚠️ Partial Liquidation:'}
                                          </p>
                                          <p className="text-rose-400">• {liq.liabilityName}</p>
                                          <p className="ml-3 text-zinc-500">{liq.message || `Liquidated: ${(liq.btcAmount || 0).toFixed(4)} BTC ($${(liq.proceeds || 0).toLocaleString()})`}</p>
                                          {liq.remainingDebt > 0 && (
                                            <p className="ml-3 text-zinc-500">Remaining debt: ${liq.remainingDebt?.toLocaleString()} • Collateral: {(liq.remainingCollateral || 0).toFixed(4)} BTC</p>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                            </div>
                          </div>
                        );
                      }}
                      labelFormatter={(age) => `Age ${age}`}
                    />
                    <Legend
                      content={(props) => {
                        const { payload } = props;
                        return (
                          <div className="space-y-3">
                            {/* Asset types row */}
                            <div className="flex flex-wrap justify-center gap-4 text-xs">
                              {payload?.map((entry, index) => (
                                <div key={`item-${index}`} className="flex items-center gap-2">
                                  <div style={{ backgroundColor: entry.color }} className="w-3 h-3 rounded" />
                                  <span className="text-zinc-400">{entry.value}</span>
                                </div>
                              ))}
                            </div>
                            {/* Event markers row */}
                            <div className="flex flex-wrap justify-center gap-4 text-xs pt-2 border-t border-zinc-800/50">
                              {goals.filter(g => !g.will_be_spent).length > 0 && (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-0.5 bg-blue-400/50" style={{backgroundImage: 'repeating-linear-gradient(90deg, #60a5fa 0, #60a5fa 8px, transparent 8px, transparent 12px)'}} />
                                  <span className="text-zinc-400">Goal Targets</span>
                                </div>
                              )}
                              {goals.filter(g => g.will_be_spent).length > 0 && (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-0.5 bg-blue-400" style={{backgroundImage: 'repeating-linear-gradient(90deg, #60a5fa 0, #60a5fa 6px, transparent 6px, transparent 10px)'}} />
                                  <span className="text-zinc-400">Goal Funding</span>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-0.5 bg-emerald-400" style={{backgroundImage: 'repeating-linear-gradient(90deg, #10b981 0, #10b981 5px, transparent 5px, transparent 10px)'}} />
                                <span className="text-zinc-400">Debt Payoff</span>
                              </div>
                              {projections.some(p => p.liquidations?.some(l => l.type === 'top_up')) && (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-0.5" style={{backgroundImage: 'repeating-linear-gradient(90deg, #f59e0b 0, #f59e0b 4px, transparent 4px, transparent 8px)'}} />
                                  <span className="text-amber-400">Collateral Top-Up</span>
                                </div>
                              )}
                              {projections.some(p => p.liquidations?.some(l => l.type === 'release')) && (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-0.5" style={{backgroundImage: 'repeating-linear-gradient(90deg, #22d3ee 0, #22d3ee 4px, transparent 4px, transparent 8px)'}} />
                                  <span className="text-cyan-400">Collateral Released</span>
                                </div>
                              )}
                              {projections.some(p => p.liquidations?.some(l => l.type !== 'top_up' && l.type !== 'release')) && (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-0.5" style={{backgroundImage: 'repeating-linear-gradient(90deg, #f43f5e 0, #f43f5e 4px, transparent 4px, transparent 8px)'}} />
                                  <span className="text-rose-400">Collateral Liquidation</span>
                                </div>
                              )}
                              {runOutOfMoneyAge && (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-0.5 bg-red-500" />
                                  <span className="text-rose-400">Portfolio Depleted</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine x={retirementAge} stroke="#F7931A" strokeDasharray="5 5" label={{ value: 'Retire', fill: '#F7931A', fontSize: 10 }} yAxisId="left" />
                    {runOutOfMoneyAge && (
                      <ReferenceLine
                        x={runOutOfMoneyAge}
                        stroke="#ef4444"
                        strokeWidth={2}
                        yAxisId="left"
                      />
                    )}

                    {/* Life Event Reference Lines - NO LABELS */}
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
                    {/* All goals with target dates - vertical lines at target age - NO LABELS */}
                    {goals.filter(g => g.target_date || (g.goal_type === 'debt_payoff' && g.payoff_years)).slice(0, 5).map((goal) => {
                      let goalYear;
                      
                      // For debt payoff goals with spread payments, show at END of payment period
                      if (goal.goal_type === 'debt_payoff' && goal.payoff_strategy === 'spread_payments' && goal.payoff_years > 0) {
                        const startYear = goal.target_date ? new Date(goal.target_date).getFullYear() : new Date().getFullYear();
                        goalYear = startYear + goal.payoff_years;
                      } else if (goal.target_date) {
                        goalYear = new Date(goal.target_date).getFullYear();
                      } else {
                        return null; // Skip if no valid date
                      }
                      
                      const goalAge = currentAge + (goalYear - new Date().getFullYear());
                      if (goalAge > currentAge && goalAge < lifeExpectancy) {
                        return (
                          <ReferenceLine
                            key={`goal-${goal.id}`}
                            x={goalAge}
                            stroke="#60a5fa"
                            strokeDasharray="3 3"
                            strokeOpacity={0.7}
                            yAxisId="left"
                          />
                        );
                      }
                      return null;
                    })}
                    {/* Debt payoff markers - NO LABELS */}
                    {projections.filter(p => p.debtPayoffs && p.debtPayoffs.length > 0).map((p, idx) => {
                      if (p.age >= currentAge && p.age <= lifeExpectancy) {
                        return (
                          <ReferenceLine
                            key={`debt-payoff-${p.age}-${idx}`}
                            x={p.age}
                            stroke="#10b981"
                            strokeDasharray="5 5"
                            strokeOpacity={0.6}
                            yAxisId="left"
                          />
                        );
                      }
                      return null;
                    })}
                    {/* Collateral event markers - color-coded by type */}
                    {projections.flatMap((p, pIdx) => 
                      (p.liquidations || []).map((liq, liqIdx) => {
                        if (p.age < currentAge || p.age > lifeExpectancy) return null;
                        let strokeColor;
                        if (liq.type === 'top_up') {
                          strokeColor = '#f59e0b'; // amber-500
                        } else if (liq.type === 'release') {
                          strokeColor = '#22d3ee'; // cyan-400
                        } else {
                          strokeColor = '#f43f5e'; // rose-500 for liquidation
                        }
                        return (
                          <ReferenceLine
                            key={`collateral-${p.age}-${pIdx}-${liqIdx}`}
                            x={p.age}
                            stroke={strokeColor}
                            strokeWidth={2}
                            strokeDasharray="3 3"
                            strokeOpacity={0.8}
                            yAxisId="left"
                          />
                        );
                      })
                    )}
                    {/* Goal target lines - only show for accumulation goals (not one-time spending) - NO LABELS */}
                    {goalsWithProjections.filter(g => g.target_amount > 0 && !g.will_be_spent).slice(0, 3).map((goal, i) => (
                      <ReferenceLine
                        key={goal.id}
                        y={goal.target_amount}
                        stroke="#60a5fa"
                        strokeDasharray="8 4"
                        strokeOpacity={0.4}
                        yAxisId="left"
                      />
                    ))}
                    <Area type="monotone" dataKey="bonds" stackId="1" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.3} name="Bonds" yAxisId="left" />
                    <Area type="monotone" dataKey="cash" stackId="1" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.4} name="Cash" yAxisId="left" />
                    <Area type="monotone" dataKey="realEstate" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Real Estate" yAxisId="left" />
                    <Area type="monotone" dataKey="stocks" stackId="1" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.3} name="Stocks" yAxisId="left" />
                    <Area type="monotone" dataKey="btcEncumbered" stackId="1" stroke="#92400e" fill="#b45309" fillOpacity={0.4} name="Bitcoin (Collateral) 🔒" yAxisId="left" />
                    <Area type="monotone" dataKey="btcLiquid" stackId="1" stroke="#F7931A" fill="#F7931A" fillOpacity={0.6} name="Bitcoin (Liquid)" yAxisId="left" />
                    <Line type="monotone" dataKey="total" stroke="#ffffff" strokeWidth={2} dot={false} name="Total Assets" yAxisId="left" />
                    <Line type="monotone" dataKey="totalDebt" stroke="#ef4444" strokeWidth={2} strokeDasharray="3 3" dot={false} name="Total Debt" yAxisId="left" />
                    <Line type="monotone" dataKey="yearGoalWithdrawal" stroke="#fb923c" strokeWidth={2} strokeDasharray="4 4" dot={(props) => {
                      // Show dots for years with goal withdrawals
                      if (props.payload?.yearGoalWithdrawal > 0) {
                        return <circle cx={props.cx} cy={props.cy} r={4} fill="#fb923c" stroke="#0a0a0b" strokeWidth={2} />;
                      }
                      return null;
                    }} name="Goal Funding" yAxisId="right" connectNulls={false} />
                    <Line type="monotone" dataKey="yearWithdrawal" stroke="#ef4444" strokeWidth={2} dot={(props) => {
                      // Only show dots for retirement years with actual withdrawals
                      if (props.payload?.yearWithdrawal > 0) {
                        return <circle cx={props.cx} cy={props.cy} r={2} fill="#ef4444" />;
                      }
                      return null;
                    }} name="Withdrawal" yAxisId="right" connectNulls={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            <p className="text-xs text-zinc-500 text-center mt-2">
              💡 Click on a year to lock the tooltip, then scroll. Click again or outside to dismiss.
            </p>
            {lifeEvents.length > 0 && (
              <div className="flex flex-wrap justify-center gap-4 mt-4 text-xs text-zinc-400">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-rose-400/50" />
                  <span>Life Events</span>
                </div>
              </div>
            )}


          </div>

          {/* BTC Loans Status Card */}
          {liabilities.some(l => l.type === 'btc_collateralized') && projections.length > 0 && (
            <div className="card-premium rounded-2xl p-6 border border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <span className="text-orange-400">₿</span>
                  BTC-Backed Loans Projection
                </h3>
                <Badge className="bg-orange-500/20 text-orange-400 text-xs">
                  {liabilities.filter(l => l.type === 'btc_collateralized').length} Active Loans
                </Badge>
              </div>
              
              {/* LTV Snapshots Over Time */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {(() => {
                  const currentData = projections[0];
                  const midAge = Math.floor((currentAge + retirementAge) / 2);
                  const midData = projections[Math.max(0, midAge - currentAge)];
                  const retireData = projections[Math.max(0, retirementAge - currentAge)];
                  const endData = projections[projections.length - 1];
                  
                  const snapshots = [
                    { label: `Now (${currentAge})`, data: currentData },
                    { label: `Age ${midAge}`, data: midData },
                    { label: `Retire (${retirementAge})`, data: retireData },
                    { label: `Age ${lifeExpectancy}`, data: endData },
                  ];
                  
                  return snapshots.map((s, idx) => {
                    const loans = s.data?.btcLoanDetails || [];
                    const avgLtv = loans.length > 0 ? Math.round(loans.reduce((sum, l) => sum + l.ltv, 0) / loans.length) : 0;
                    const allReleased = loans.length > 0 && loans.every(l => l.status === 'released');
                    const anyLiquidated = loans.some(l => l.status === 'liquidated');
                    const totalCollateralBtc = loans.reduce((sum, l) => sum + (l.collateralBtc || 0), 0);
                    
                    return (
                      <div key={idx} className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
                        <p className="text-xs text-zinc-500 mb-1">{s.label}</p>
                        {allReleased ? (
                          <p className="text-lg font-bold text-purple-400">✓ Released</p>
                        ) : anyLiquidated ? (
                          <p className="text-lg font-bold text-rose-400">✗ Liquidated</p>
                        ) : (
                          <p className={cn(
                            "text-lg font-bold",
                            avgLtv < 40 ? "text-emerald-400" : avgLtv < 60 ? "text-amber-400" : "text-rose-400"
                          )}>{avgLtv}% LTV</p>
                        )}
                        <p className="text-[10px] text-zinc-500 mt-1">
                          Debt: ${(s.data?.totalBtcLoanDebt || 0).toLocaleString()}
                        </p>
                        {totalCollateralBtc > 0 && (
                          <p className="text-[10px] text-zinc-400 mt-0.5">
                            BTC Locked: {totalCollateralBtc.toFixed(4)}
                          </p>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
              
              {/* Current Loan Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {projections[0]?.btcLoanDetails?.map((loan, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-700/30">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-zinc-300">{loan.name}</span>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        loan.status === 'healthy' && "bg-emerald-500/20 text-emerald-400",
                        loan.status === 'moderate' && "bg-amber-500/20 text-amber-400",
                        loan.status === 'elevated' && "bg-rose-500/20 text-rose-400"
                      )}>{loan.ltv}% LTV</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div><span className="text-zinc-500">Balance:</span> <span className="text-rose-300">${loan.balance.toLocaleString()}</span></div>
                      <div><span className="text-zinc-500">Collateral:</span> <span className="text-emerald-400">${loan.collateralValue.toLocaleString()}</span></div>
                      <div><span className="text-zinc-500">BTC Locked:</span> <span className="text-orange-400">{loan.collateralBtc?.toFixed(4)}</span></div>
                      <div><span className="text-zinc-500">Equity:</span> <span className="text-emerald-400">${(loan.collateralValue - loan.balance).toLocaleString()}</span></div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Footer */}
              <p className="text-xs text-zinc-500 mt-4 pt-3 border-t border-zinc-700/50">
                <span className="text-emerald-400">●</span> Healthy &lt;40% • <span className="text-amber-400">●</span> Moderate 40-60% • <span className="text-rose-400">●</span> Elevated &gt;60% • Releases at ≤30% • Liquidates at ≥80%
              </p>
            </div>
          )}

          {/* Account Type Summary */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-4">Portfolio by Tax Treatment</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-zinc-400">Taxable (Liquid)</p>
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
              <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-zinc-400">Real Estate (Illiquid)</p>
                  <Badge className="bg-cyan-500/20 text-cyan-400 text-[10px]">4th</Badge>
                </div>
                <p className="text-2xl font-bold text-cyan-400">{formatNumber(realEstateAccountValue)}</p>
                <p className="text-xs text-zinc-500">Property • Last resort for withdrawals</p>
              </div>
            </div>

            {/* Withdrawal Priority Explanation */}
            <div className="mt-4 p-3 rounded-lg bg-zinc-800/30 border border-zinc-700/50">
              <p className="text-xs font-medium text-zinc-300 mb-2">Withdrawal Priority Order</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">1. Taxable</span>
                <span>→</span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">2. Tax-Deferred</span>
                <span>→</span>
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">3. Tax-Free</span>
                <span>→</span>
                <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400">4. Real Estate (Last)</span>
              </div>
              <p className="text-[10px] text-zinc-500 mt-2">
                After age 59½: Taxable first (LTCG rates), then tax-deferred (income tax), then tax-free (preserves growth), then real estate last (illiquid).
                Before 59½: Taxable first, then Roth contributions, then tax-deferred with 10% penalty, then real estate as last resort.
              </p>
            </div>


            {/* BTC Loan Explanation - show if user has BTC loans */}
            {liabilities.some(l => l.type === 'btc_collateralized') && (
              <div className="bg-zinc-800/50 rounded-lg p-4 mt-4">
                <h4 className="text-sm font-semibold text-orange-400 mb-2 flex items-center gap-2">
                  <span>₿</span> BTC-Backed Loan Modeling
                </h4>
                <p className="text-sm text-zinc-400 mb-3">
                  Loans auto-refinance annually at 12.4% APR (daily compounding). Your collateral adjusts automatically:
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-cyan-400">●</span>
                    <p><span className="text-cyan-400">LTV ≤ 30%:</span> <span className="text-zinc-400">Excess collateral released back to liquid (targets 40% LTV)</span></p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400">●</span>
                    <p><span className="text-amber-400">LTV ≥ 70%:</span> <span className="text-zinc-400">Auto top-up from liquid BTC (targets 65% LTV)</span></p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-rose-400">●</span>
                    <p><span className="text-rose-400">LTV ≥ 80%:</span> <span className="text-zinc-400">Collateral liquidated to pay off loan entirely</span></p>
                  </div>
                </div>
                <p className="text-xs text-zinc-500 mt-3">
                  To model paying off a loan early, create a Debt Payoff Goal linked to the loan.
                </p>
              </div>
            )}

            {retirementAge < PENALTY_FREE_AGE && (() => {
                const yearsUntilPenaltyFree = Math.ceil(PENALTY_FREE_AGE - retirementAge);
                const annualNeedAtRetirement = retirementAnnualSpending * Math.pow(1 + inflationRate / 100, retirementAge - currentAge);

                // Calculate blended growth rate based on actual LIQUID taxable portfolio composition
                const taxableBtc = taxableLiquidHoldings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity * currentPrice, 0);
                const taxableStocks = taxableLiquidHoldings.filter(h => h.asset_type === 'stocks').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
                const taxableBonds = taxableLiquidHoldings.filter(h => h.asset_type === 'bonds').reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
                const taxableOther = taxableLiquidValue - taxableBtc - taxableStocks - taxableBonds;

                // Weighted average growth rate based on taxable portfolio allocation
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

                // Use growing annuity formula: payments grow with inflation, discounted by nominal growth
                const nominalBridgeGrowthRate = bridgeGrowthRate;
                const inflationRateDecimal = inflationRate / 100;

                // Get actual Roth contributions from accounts (default to 0 if not specified)
                const totalRothContributions = accounts
                  .filter(a => ['401k_roth', 'ira_roth', 'hsa'].includes(a.account_type))
                  .reduce((sum, a) => sum + (a.roth_contributions || 0), 0);

                // Present value of withdrawals needed from taxable + Roth contributions
                // Using growing annuity: annualNeedAtRetirement inflates each year during bridge
                let bridgeFundsNeeded;
                if (Math.abs(nominalBridgeGrowthRate - inflationRateDecimal) < 0.000001) {
                  // When growth rate equals inflation rate
                  bridgeFundsNeeded = annualNeedAtRetirement * yearsUntilPenaltyFree;
                } else {
                  // Growing annuity present value formula
                  bridgeFundsNeeded = annualNeedAtRetirement * (
                    (1 - Math.pow((1 + inflationRateDecimal) / (1 + nominalBridgeGrowthRate), yearsUntilPenaltyFree)) /
                    (nominalBridgeGrowthRate - inflationRateDecimal)
                  );
                }

                // Project today's accessible funds forward to retirement age
                const yearsToRetirement = Math.max(0, retirementAge - currentAge);
                const projectedAccessibleFunds = (taxableLiquidValue + totalRothContributions) * Math.pow(1 + bridgeGrowthRate, yearsToRetirement);
                const shortfall = Math.max(0, bridgeFundsNeeded - projectedAccessibleFunds);

                return (
                  <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-sm text-amber-400 font-medium mb-2">
                      ⚠️ Early Retirement Warning (Before Age {PENALTY_FREE_AGE})
                    </p>
                    <p className="text-sm text-zinc-300">
                      Retiring at {retirementAge} means {yearsUntilPenaltyFree} years before penalty-free access to retirement account earnings.
                      At {formatNumber(annualNeedAtRetirement)}/yr spending for {yearsUntilPenaltyFree} years, you'll need approximately <span className="font-bold text-amber-400">{formatNumber(bridgeFundsNeeded)}</span> in accessible funds (liquid taxable + Roth contributions), assuming {(bridgeGrowthRate * 100).toFixed(1)}% portfolio growth during this period.
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

          {/* Retirement Planning Settings */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-6">Retirement Planning Settings</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  <Label className="text-zinc-400">Filing Status</Label>
                  <Select value={filingStatus} onValueChange={setFilingStatus}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="married">Married Filing Jointly</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-500">Affects tax calculations on withdrawals</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">State of Residence</Label>
                  <Select value={stateOfResidence} onValueChange={setStateOfResidence}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700 max-h-64">
                      {getStateOptions().map(state => (
                        <SelectItem key={state.value} value={state.value}>
                          {state.label} — {state.taxInfo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {STATE_TAX_CONFIG[stateOfResidence] && getStateTaxSummary(stateOfResidence)?.details.length > 0 && (
                    <p className="text-xs text-zinc-500">
                      {getStateTaxSummary(stateOfResidence).details.join(' • ')}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Gross Annual Income</Label>
                  <Input type="number" value={grossAnnualIncome} onChange={(e) => setGrossAnnualIncome(parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Annual Spending (After Tax)</Label>
                  <Input type="number" value={currentAnnualSpending} onChange={(e) => setCurrentAnnualSpending(parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-800" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Target Retirement Spending</Label>
                    <Input type="number" value={retirementAnnualSpending} onChange={(e) => setRetirementAnnualSpending(parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-800" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Other Retirement Income</Label>
                    <Input 
                      type="number" 
                      value={otherRetirementIncome} 
                      onChange={(e) => setOtherRetirementIncome(parseFloat(e.target.value) || 0)} 
                      className="bg-zinc-900 border-zinc-800" 
                      placeholder="0"
                    />
                    <p className="text-xs text-zinc-500">Pension, rental, etc. (excl. Social Security)</p>
                  </div>
                </div>
              </div>

              {/* New Savings Allocation */}
              <div className="mt-6 pt-6 border-t border-zinc-800">
                <div className="space-y-3 mb-6">
                  <h4 className="font-semibold text-zinc-300">New Savings Allocation</h4>
                  <p className="text-xs text-zinc-500">How to invest new savings (must total 100%)</p>
                  
                  <div className="grid grid-cols-5 gap-2">
                    <div>
                      <Label className="text-xs text-zinc-400">BTC %</Label>
                      <Input
                        type="number"
                        value={savingsAllocationBtc}
                        onChange={(e) => setSavingsAllocationBtc(parseFloat(e.target.value) || 0)}
                        className="bg-zinc-900 border-zinc-800 text-sm"
                        min={0}
                        max={100}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-400">Stocks %</Label>
                      <Input
                        type="number"
                        value={savingsAllocationStocks}
                        onChange={(e) => setSavingsAllocationStocks(parseFloat(e.target.value) || 0)}
                        className="bg-zinc-900 border-zinc-800 text-sm"
                        min={0}
                        max={100}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-400">Bonds %</Label>
                      <Input
                        type="number"
                        value={savingsAllocationBonds}
                        onChange={(e) => setSavingsAllocationBonds(parseFloat(e.target.value) || 0)}
                        className="bg-zinc-900 border-zinc-800 text-sm"
                        min={0}
                        max={100}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-400">Cash %</Label>
                      <Input
                        type="number"
                        value={savingsAllocationCash}
                        onChange={(e) => setSavingsAllocationCash(parseFloat(e.target.value) || 0)}
                        className="bg-zinc-900 border-zinc-800 text-sm"
                        min={0}
                        max={100}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-400">Other %</Label>
                      <Input
                        type="number"
                        value={savingsAllocationOther}
                        onChange={(e) => setSavingsAllocationOther(parseFloat(e.target.value) || 0)}
                        className="bg-zinc-900 border-zinc-800 text-sm"
                        min={0}
                        max={100}
                      />
                    </div>
                  </div>
                  
                  {(savingsAllocationBtc + savingsAllocationStocks + savingsAllocationBonds + savingsAllocationCash + savingsAllocationOther) !== 100 && (
                    <p className="text-xs text-amber-400">
                      ⚠️ Total: {savingsAllocationBtc + savingsAllocationStocks + savingsAllocationBonds + savingsAllocationCash + savingsAllocationOther}% (should be 100%)
                    </p>
                  )}
                </div>

                {/* Retirement Savings Allocation */}
                <h4 className="font-semibold mb-4">Retirement Account Contributions</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400">401k/403b Contribution</Label>
                    <Input 
                      type="number" 
                      value={contribution401k} 
                      onChange={(e) => setContribution401k(parseFloat(e.target.value) || 0)} 
                      className="bg-zinc-900 border-zinc-800" 
                    />
                    <p className={cn(
                      "text-xs",
                      contribution401k > currentLimit401k ? "text-amber-400" : "text-zinc-500"
                    )}>
                      {currentYear} limit: ${currentLimit401k.toLocaleString()} {currentAge >= 50 ? "(with catch-up)" : `(${(currentLimit401k + 7500).toLocaleString()} if 50+)`}
                      {contribution401k > currentLimit401k && " ⚠️ Exceeds limit"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Employer 401k Match</Label>
                    <Input 
                      type="number" 
                      value={employer401kMatch} 
                      onChange={(e) => setEmployer401kMatch(parseFloat(e.target.value) || 0)} 
                      className="bg-zinc-900 border-zinc-800" 
                    />
                    <p className="text-xs text-zinc-500">Free money from employer</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Roth IRA Contribution</Label>
                    <Input 
                      type="number" 
                      value={contributionRothIRA} 
                      onChange={(e) => setContributionRothIRA(parseFloat(e.target.value) || 0)} 
                      className="bg-zinc-900 border-zinc-800" 
                    />
                    <p className={cn(
                      "text-xs",
                      contributionRothIRA > currentLimitRoth ? "text-amber-400" : "text-zinc-500"
                    )}>
                      {currentYear} limit: ${currentLimitRoth.toLocaleString()} {currentAge >= 50 ? "(with catch-up)" : `(${(currentLimitRoth + 1000).toLocaleString()} if 50+)`}
                      {contributionRothIRA > currentLimitRoth && " ⚠️ Exceeds limit"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">HSA Contribution</Label>
                    <Input 
                      type="number" 
                      value={contributionHSA} 
                      onChange={(e) => setContributionHSA(parseFloat(e.target.value) || 0)} 
                      className="bg-zinc-900 border-zinc-800" 
                    />
                    <p className={cn(
                      "text-xs",
                      contributionHSA > currentLimitHSA ? "text-amber-400" : "text-zinc-500"
                    )}>
                      {currentYear} limit: ${currentLimitHSA.toLocaleString()} ({hsaFamilyCoverage ? "family" : "individual"}{currentAge >= 55 ? ", with catch-up" : ""})
                      {contributionHSA > currentLimitHSA && " ⚠️ Exceeds limit"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">HSA Coverage Type</Label>
                    <Select value={hsaFamilyCoverage ? "family" : "individual"} onValueChange={(v) => setHsaFamilyCoverage(v === "family")}>
                      <SelectTrigger className="bg-zinc-900 border-zinc-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">Individual</SelectItem>
                        <SelectItem value="family">Family</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  </div>

                  {/* Social Security Settings */}
                  <div className="mt-6 pt-6 border-t border-zinc-800">
                  <h4 className="font-semibold mb-4">Social Security</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-zinc-400">Social Security (Annual)</Label>
                      {useCustomSocialSecurity ? (
                        <Input
                          type="number"
                          value={socialSecurityAmount}
                          onChange={(e) => setSocialSecurityAmount(parseFloat(e.target.value) || 0)}
                          className="bg-zinc-900 border-zinc-800"
                        />
                      ) : (
                        <div className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-emerald-400">
                          ${estimatedSocialSecurity.toLocaleString()}/yr
                          <span className="text-zinc-500 text-xs ml-1">(today's $)</span>
                        </div>
                      )}
                      <button 
                        onClick={() => setUseCustomSocialSecurity(!useCustomSocialSecurity)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        {useCustomSocialSecurity ? 'Use estimate' : 'Enter custom amount'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-400">SS Start Age</Label>
                      <Input
                        type="number"
                        value={socialSecurityStartAge}
                        onChange={(e) => setSocialSecurityStartAge(parseInt(e.target.value) || 67)}
                        className="bg-zinc-900 border-zinc-800"
                        min={62}
                        max={70}
                      />
                      <p className="text-xs text-zinc-500">62 (reduced) to 70 (max)</p>
                    </div>
                    <div className="flex items-end pb-2">
                      <p className="text-xs text-zinc-500">Based on current income. Get exact amount at ssa.gov</p>
                    </div>
                  </div>
                  </div>

                {/* Cash Flow Summary */}
                <div className="mt-6 pt-4 border-t border-zinc-700">
                  <h4 className="text-sm font-medium text-zinc-300 mb-3">Cash Flow Summary</h4>
                <div className="p-4 rounded-xl bg-zinc-800/30">
                  {(() => {
                    // Calculate cash flow BEFORE retirement contributions
                    const cashFlowBeforeSavings = netIncome - currentAnnualSpending;
                    const hasRetirementContributions = actualRoth > 0;

                    if (cashFlowBeforeSavings >= 0) {
                      // Positive cash flow - normal display
                      return (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Net Income (after tax):</span>
                            <span className="text-zinc-200">{formatNumber(netIncome)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Spending:</span>
                            <span className="text-zinc-200">-{formatNumber(currentAnnualSpending)}</span>
                          </div>
                          {hasRetirementContributions && (
                            <div className="flex justify-between">
                              <span className="text-zinc-400">Roth IRA:</span>
                              <span className="text-zinc-200">-{formatNumber(actualRoth)}</span>
                            </div>
                          )}
                          <div className="flex justify-between border-t border-zinc-700 pt-2">
                            <span className="text-zinc-300 font-medium">Remaining to Taxable:</span>
                            <span className={cn("font-semibold", annualSavings >= 0 ? "text-emerald-400" : "text-rose-400")}>
                              {annualSavings >= 0 ? '+' : ''}{formatNumber(annualSavings)}
                            </span>
                          </div>
                        </div>
                      );
                    } else if (hasRetirementContributions) {
                      // Negative cash flow WITH retirement contributions
                      return (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Net Income (after tax):</span>
                            <span className="text-zinc-200">{formatNumber(netIncome)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Spending:</span>
                            <span className="text-zinc-200">-{formatNumber(currentAnnualSpending)}</span>
                          </div>
                          <div className="flex justify-between border-t border-zinc-700 pt-2">
                            <span className="text-zinc-300 font-medium">Cash Flow:</span>
                            <span className="font-semibold text-rose-400">{formatNumber(cashFlowBeforeSavings)}</span>
                          </div>
                          <div className="pt-2 mt-2 border-t border-zinc-700/50">
                            <p className="text-xs text-zinc-400 mb-2 font-medium">Retirement Contributions from Savings:</p>
                            <div className="flex justify-between pl-2">
                              <span className="text-zinc-400">• Roth IRA:</span>
                              <span className="text-purple-400">${actualRoth.toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="flex justify-between border-t border-zinc-700 pt-2 mt-2">
                            <span className="text-zinc-300 font-medium">Net Withdrawal from Taxable:</span>
                            <span className="font-semibold text-rose-400">{formatNumber(annualSavings)}</span>
                          </div>
                          <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <p className="text-xs text-amber-400">
                              ⚠️ Cash flow is negative. Retirement contributions will be funded by withdrawing from taxable accounts.
                            </p>
                          </div>
                        </div>
                      );
                    } else {
                      // Negative cash flow WITHOUT retirement contributions
                      // Calculate tax on the withdrawal needed to cover the deficit
                      const deficit = Math.abs(annualSavings);
                      const taxableBalanceNow = taxableValue;
                      const taxDeferredBalanceNow = taxDeferredValue;
                      const taxFreeBalanceNow = taxFreeValue;
                      const initialTaxableBasis = taxableHoldings.reduce((sum, h) => sum + (h.cost_basis_total || 0), 0);
                      const currentGainRatio = taxableBalanceNow > 0 ? Math.max(0, (taxableBalanceNow - initialTaxableBasis) / taxableBalanceNow) : 0;

                      const currentYearTaxEstimate = estimateRetirementWithdrawalTaxes({
                        withdrawalNeeded: deficit,
                        taxableBalance: taxableBalanceNow,
                        taxDeferredBalance: taxDeferredBalanceNow,
                        taxFreeBalance: taxFreeBalanceNow,
                        taxableGainPercent: currentGainRatio,
                        isLongTermGain: true,
                        filingStatus,
                        age: currentAge,
                        otherIncome: 0,
                        year: currentYear,
                        inflationRate: inflationRate / 100,
                      });

                      // Calculate state tax
                      const currentYearStateTax = calculateStateTaxOnRetirement({
                        state: stateOfResidence,
                        age: currentAge,
                        filingStatus: filingStatus,
                        totalAGI: deficit,
                        socialSecurityIncome: 0,
                        taxDeferredWithdrawal: currentYearTaxEstimate.fromTaxDeferred || 0,
                        taxableWithdrawal: currentYearTaxEstimate.fromTaxable || 0,
                        taxableGainPortion: (currentYearTaxEstimate.fromTaxable || 0) * currentGainRatio,
                        pensionIncome: 0,
                        year: currentYear,
                      });

                      const totalTaxOnWithdrawal = (currentYearTaxEstimate.totalTax || 0) + currentYearStateTax;
                      
                      return (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Net Income (after tax):</span>
                            <span className="text-zinc-200">{formatNumber(netIncome)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Spending:</span>
                            <span className="text-zinc-200">-{formatNumber(currentAnnualSpending)}</span>
                          </div>
                          <div className="flex justify-between border-t border-zinc-700 pt-2 mt-2">
                            <span className="text-zinc-300 font-medium">Cash Flow:</span>
                            <span className="font-semibold text-rose-400">{formatNumber(netIncome - currentAnnualSpending)}</span>
                          </div>
                          <div className="flex justify-between mt-2">
                            <span className="text-zinc-400">• Taxes on Withdrawal (Fed + {stateOfResidence}):</span>
                            <span className="text-rose-300">${Math.round(totalTaxOnWithdrawal).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between border-t border-zinc-700 pt-2 mt-2">
                            <span className="text-zinc-300 font-medium">Total Withdrawal from Taxable:</span>
                            <span className="font-semibold text-rose-400">{formatNumber(deficit + totalTaxOnWithdrawal)}</span>
                          </div>
                          <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <p className="text-xs text-amber-400">
                              ⚠️ Spending exceeds income. You're withdrawing from taxable accounts.
                            </p>
                          </div>
                        </div>
                      );
                    }
                  })()}
                </div>
              </div>

              <div className="mt-4 space-y-2">
              <p className="text-xs text-zinc-500">
                  💡 Pre-tax contributions (401k: {formatNumber(actual401k)}, HSA: {formatNumber(actualHSA)}) reduce your taxable income. 
                  Roth IRA comes from after-tax income. Employer match ({formatNumber(employer401kMatch || 0)}) goes to tax-deferred.
                  Debt payments ({formatNumber(monthlyDebtPayments * 12)}/yr) are tracked separately.
                </p>
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
                <p className="text-xs text-zinc-500">
                  {formatNumber(retirementAnnualSpending / 12)}/mo today • inflates to {formatNumber(inflationAdjustedRetirementSpending)}/yr
                </p>
              </div>
            </div>
          </div>
          </div>
        </TabsContent>

        {/* Monte Carlo Tab */}
        <TabsContent value="montecarlo" className="space-y-6">
          {/* Income-Based Target */}
          <div className="card-premium rounded-xl p-4 border border-zinc-800/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
              <Label className="text-zinc-300 text-sm">Success = Not Running Out of Money Through Age {lifeExpectancy}</Label>
              <p className="text-xs text-zinc-400">
                ${(retirementAnnualSpending || 0).toLocaleString()}/yr today → ${Math.round(inflationAdjustedRetirementSpending || 0).toLocaleString()}/yr at retirement ({inflationRate || 0}% inflation) for {yearsInRetirement} years
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                BTC Model: <span className="text-orange-400 font-semibold">
                  {btcReturnModel === 'custom' ? `${btcCagr || 25}%` :
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
                {/* Success Probability - Main Focus */}
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
                    Income-Based: ${Math.round(inflationAdjustedRetirementSpending || 0).toLocaleString()}/yr • {btcReturnModel === 'custom' ? `${btcCagr || 25}%` : btcReturnModel} BTC • BTC Vol: {getBtcVolatility(0).toFixed(0)}%→{getBtcVolatility(30).toFixed(0)}%
                  </p>
                  <p className="text-sm text-zinc-300 mt-2">
                    {successProbability >= 80 ? "Excellent! You're on track for your desired retirement lifestyle." :
                     successProbability >= 50 ? "Good progress, but consider increasing savings or adjusting expectations." :
                     "You may need to save more or adjust your retirement income goal."}
                  </p>
                </div>

                {/* Portfolio Value Chart */}
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
                          wrapperStyle={{ zIndex: 1000 }}
                          allowEscapeViewBox={{ x: false, y: true }}
                          position={{ y: 0 }}
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

                {/* Summary Stats */}
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

                {/* At Retirement Stats */}
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