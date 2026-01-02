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
import { getRMDFactor, getStandardDeduction as getStandardDeductionFromData } from '@/components/shared/taxData';
import { get401kLimit, getRothIRALimit, getHSALimit, getTaxConfigForYear } from '@/components/shared/taxConfig';
import { getStateOptions, getStateTaxSummary, STATE_TAX_CONFIG, calculateStateTaxOnRetirement, calculateStateCapitalGainsTax, calculateStateIncomeTax } from '@/components/shared/stateTaxConfig';
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
                  // Auto-enable custom mode if a custom amount was saved (handles legacy data)
                  if (settings.use_custom_social_security !== undefined) {
                    setUseCustomSocialSecurity(settings.use_custom_social_security);
                  } else if (settings.social_security_amount && settings.social_security_amount > 0) {
                    setUseCustomSocialSecurity(true);
                  }
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

  // ... continue