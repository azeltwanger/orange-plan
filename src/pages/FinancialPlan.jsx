import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart, Legend } from 'recharts';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Target, Plus, Pencil, Trash2, TrendingUp, Calendar, Settings, Play, AlertTriangle, ChevronDown, ChevronUp, Sparkles, Home, Car, Baby, Briefcase, Heart, DollarSign, RefreshCw, Receipt, Info } from 'lucide-react';
import { useBtcPrice } from '@/components/shared/useBtcPrice';
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
import { runUnifiedProjection, getCustomReturnForYear } from '@/components/shared/runProjection';
import { selectLots, getAvailableQuantity } from '../components/shared/lotSelectionHelpers';
import { getRMDFactor } from '@/components/shared/taxData';
import { get401kLimit, getRothIRALimit, getTraditionalIRALimit, getHSALimit, getTaxConfigForYear, getRothIRAIncomeLimit } from '@/components/shared/taxConfig';
import { getStateOptions, getStateTaxSummary, STATE_TAX_CONFIG, calculateStateTaxOnRetirement, calculateStateCapitalGainsTax, calculateStateIncomeTax } from '@/components/shared/stateTaxConfig';
import { getPowerLawCAGR } from '@/components/shared/bitcoinPowerLaw';
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
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import CustomPeriodsModal from '@/components/retirement/CustomPeriodsModal';

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
  // Use shared BTC price hook for consistency across pages
  const { btcPrice, priceChange, loading: priceLoading } = useBtcPrice();
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
  const userBtcModelSelectionMade = useRef(false);
  
  // Custom return periods
  const [showCustomPeriodsModal, setShowCustomPeriodsModal] = useState(false);
  const [customReturnPeriods, setCustomReturnPeriods] = useState({
    btc: [],
    stocks: [],
    realEstate: [],
    bonds: [],
    cash: [],
    other: []
  });
  const [tickerReturns, setTickerReturns] = useState({});

  // Tax settings
  const [filingStatus, setFilingStatus] = useState('single');
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
  const [contributionTraditionalIRA, setContributionTraditionalIRA] = useState(0);
  const [contributionHSA, setContributionHSA] = useState(0);
  const [hsaFamilyCoverage, setHsaFamilyCoverage] = useState(false);

  // BTC Collateral Management Settings (Ledn defaults)
  const [autoTopUpBtcCollateral, setAutoTopUpBtcCollateral] = useState(true);
  const [btcTopUpTriggerLtv, setBtcTopUpTriggerLtv] = useState(70);
  const [btcTopUpTargetLtv, setBtcTopUpTargetLtv] = useState(50); // Ledn resets to 50% LTV after top-up
  const [btcReleaseTriggerLtv, setBtcReleaseTriggerLtv] = useState(30);
  const [btcReleaseTargetLtv, setBtcReleaseTargetLtv] = useState(40);

  // State tax settings
  const [stateOfResidence, setStateOfResidence] = useState('TX');

  // Cost basis method
  const [costBasisMethod, setCostBasisMethod] = useState('HIFO');

  // Asset withdrawal strategy
  const [assetWithdrawalStrategy, setAssetWithdrawalStrategy] = useState('proportional');
  const [withdrawalPriorityOrder, setWithdrawalPriorityOrder] = useState(['bonds', 'stocks', 'other', 'btc']);
  const [withdrawalBlendPercentages, setWithdrawalBlendPercentages] = useState({ bonds: 25, stocks: 35, other: 10, btc: 30 });

  // Settings loaded flag
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Monte Carlo
  const [runSimulation, setRunSimulation] = useState(false);
  const [simulationResults, setSimulationResults] = useState(null);
  const [successProbability, setSuccessProbability] = useState(null);
  const [safeSpending90, setSafeSpending90] = useState(null);

  // Forms
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  
  // Tooltip locking state
  const [lockedTooltipData, setLockedTooltipData] = useState(null);
  const chartContainerRef = useRef(null);


  const [goalForm, setGoalForm] = useState({
    name: '', type: 'savings', target_amount: '', saved_so_far: '', target_date: '',
    withdraw_from_portfolio: false, linked_liability_id: '', payoff_strategy: 'minimum',
    extra_monthly_payment: '', lump_sum_date: '', notes: '',
  });

  const [eventForm, setEventForm] = useState({
    name: '', event_type: 'expense_change', year: new Date().getFullYear() + 1, amount: '', is_recurring: false, recurring_years: '', affects: 'expenses', notes: '',
    monthly_expense_impact: '', liability_amount: '', down_payment: '', interest_rate: '', loan_term_years: '',
    allocation_method: 'proportionate', btc_allocation: 0, stocks_allocation: 0, real_estate_allocation: 0, bonds_allocation: 0, cash_allocation: 0, other_allocation: 0,
  });



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



  // Use live price - no fallback to ensure consistency
  const currentPrice = btcPrice;
  
  // Queries
  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: () => base44.entities.FinancialGoal.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: lifeEvents = [] } = useQuery({
    queryKey: ['lifeEvents'],
    queryFn: () => base44.entities.LifeEvent.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: budgetItems = [] } = useQuery({
    queryKey: ['budgetItems'],
    queryFn: () => base44.entities.BudgetItem.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: liabilities = [] } = useQuery({
    queryKey: ['liabilities'],
    queryFn: () => base44.entities.Liability.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: collateralizedLoans = [] } = useQuery({
    queryKey: ['collateralizedLoans'],
    queryFn: () => base44.entities.CollateralizedLoan.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: userSettings = [] } = useQuery({
    queryKey: ['userSettings'],
    queryFn: () => base44.entities.UserSettings.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list(),
    staleTime: 5 * 60 * 1000,
  });

  // Filter transactions to active tax lots (buys with remaining quantity)
  const activeTaxLots = useMemo(() => {
    return transactions.filter(t => 
      t.type === 'buy' && 
      (t.remaining_quantity ?? t.quantity) > 0
    );
  }, [transactions]);

  // Check if critical data is loading (after all queries defined) - include BTC price
  const isLoadingData = !holdings || !accounts || !userSettings || !liabilities || !collateralizedLoans || !transactions || priceLoading || !btcPrice;

  // Calculate portfolio values by tax treatment
  const getHoldingValue = (h) => h.ticker === 'BTC' ? h.quantity * currentPrice : h.quantity * (h.current_price || 0);

  // Helper to determine tax treatment from account_type or tax_treatment field
  const getTaxTreatmentFromHolding = (h) => {
    if (h.account_id && accounts?.length > 0) {
      const account = accounts.find(a => a.id === h.account_id);
      if (account) {
        const accountType = account.account_type || '';
        if (accountType === 'taxable_real_estate' || account.tax_treatment === 'real_estate') return 'real_estate';
        if (['traditional_401k', 'traditional_ira', 'sep_ira', '403b', '401k_traditional', 'ira_traditional'].includes(accountType)) return 'tax_deferred';
        if (['roth_401k', 'roth_ira', 'hsa', '529', '401k_roth', 'ira_roth'].includes(accountType)) return 'tax_free';
        if (account.tax_treatment) return account.tax_treatment;
      }
    }
    const assetType = h.asset_type || '';
    if (assetType === 'real_estate') return 'real_estate';
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
  const otherValue = holdings.filter(h => !['BTC'].includes(h.ticker) && !['stocks', 'real_estate', 'bonds', 'cash', 'btc', 'crypto'].includes(h.asset_type)).reduce((sum, h) => sum + h.quantity * (h.current_price || 0), 0);
  const totalValue = btcValue + stocksValue + realEstateValue + bondsValue + cashValue + otherValue;
  
  const PENALTY_FREE_AGE = 59.5;
  const getRMDStartAge = (birthYear) => {
    if (birthYear <= 1950) return 72;
    if (birthYear <= 1959) return 73;
    return 75;
  };
  const standardDeduction = STANDARD_DEDUCTION_2024[filingStatus] || STANDARD_DEDUCTION_2024.single;

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
      if (settings.btc_return_model !== undefined && !userBtcModelSelectionMade.current) {
        setBtcReturnModel(settings.btc_return_model);
      }
      if (settings.custom_return_periods !== undefined) setCustomReturnPeriods(settings.custom_return_periods);
      if (settings.ticker_returns !== undefined) setTickerReturns(settings.ticker_returns);
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
                  if (settings.gross_annual_income !== undefined && settings.gross_annual_income !== null) setGrossAnnualIncome(settings.gross_annual_income);
                  if (settings.contribution_401k !== undefined) setContribution401k(settings.contribution_401k);
                  if (settings.employer_401k_match !== undefined) setEmployer401kMatch(settings.employer_401k_match);
                  if (settings.contribution_roth_ira !== undefined) setContributionRothIRA(settings.contribution_roth_ira);
                  if (settings.contribution_traditional_ira !== undefined) setContributionTraditionalIRA(settings.contribution_traditional_ira);
                  if (settings.contribution_hsa !== undefined) setContributionHSA(settings.contribution_hsa);
                  if (settings.hsa_family_coverage !== undefined) setHsaFamilyCoverage(settings.hsa_family_coverage);
                  if (settings.filing_status !== undefined) setFilingStatus(settings.filing_status);
                  if (settings.state_of_residence !== undefined) setStateOfResidence(settings.state_of_residence);
                  if (settings.cost_basis_method !== undefined) setCostBasisMethod(settings.cost_basis_method);
                  if (settings.asset_withdrawal_strategy !== undefined) setAssetWithdrawalStrategy(settings.asset_withdrawal_strategy);
                  if (settings.withdrawal_priority_order !== undefined) setWithdrawalPriorityOrder(settings.withdrawal_priority_order);
                  if (settings.withdrawal_blend_percentages !== undefined) setWithdrawalBlendPercentages(settings.withdrawal_blend_percentages);
                  if (settings.auto_top_up_btc_collateral !== undefined) setAutoTopUpBtcCollateral(settings.auto_top_up_btc_collateral);
                  if (settings.btc_top_up_trigger_ltv !== undefined) setBtcTopUpTriggerLtv(settings.btc_top_up_trigger_ltv);
                  if (settings.btc_top_up_target_ltv !== undefined) setBtcTopUpTargetLtv(settings.btc_top_up_target_ltv);
                  if (settings.btc_release_trigger_ltv !== undefined) setBtcReleaseTriggerLtv(settings.btc_release_trigger_ltv);
                  if (settings.btc_release_target_ltv !== undefined) setBtcReleaseTargetLtv(settings.btc_release_target_ltv);
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
                      gross_annual_income: grossAnnualIncome,
                      contribution_401k: contribution401k || 0,
                      employer_401k_match: employer401kMatch || 0,
                      contribution_roth_ira: contributionRothIRA || 0,
                      contribution_traditional_ira: contributionTraditionalIRA || 0,
                      contribution_hsa: contributionHSA || 0,
                      hsa_family_coverage: hsaFamilyCoverage || false,
                      filing_status: filingStatus || 'single',
                      state_of_residence: stateOfResidence || '',
                      auto_top_up_btc_collateral: autoTopUpBtcCollateral,
                      btc_top_up_trigger_ltv: btcTopUpTriggerLtv || 70,
                      btc_top_up_target_ltv: btcTopUpTargetLtv || 65,
                      btc_release_trigger_ltv: btcReleaseTriggerLtv || 30,
                      btc_release_target_ltv: btcReleaseTargetLtv || 40,
                      custom_return_periods: customReturnPeriods,
                      ticker_returns: tickerReturns,
                      asset_withdrawal_strategy: assetWithdrawalStrategy,
                      withdrawal_priority_order: withdrawalPriorityOrder,
                      withdrawal_blend_percentages: withdrawalBlendPercentages,
                      });
                      }, 1000); // Debounce 1 second
                      return () => clearTimeout(timeoutId);
                      }, [settingsLoaded, btcCagr, stocksCagr, stocksVolatility, realEstateCagr, bondsCagr, cashCagr, otherCagr, inflationRate, incomeGrowth, retirementAge, currentAge, lifeExpectancy, currentAnnualSpending, retirementAnnualSpending, btcReturnModel, otherRetirementIncome, socialSecurityStartAge, socialSecurityAmount, useCustomSocialSecurity, grossAnnualIncome, contribution401k, employer401kMatch, contributionRothIRA, contributionTraditionalIRA, contributionHSA, hsaFamilyCoverage, filingStatus, stateOfResidence, autoTopUpBtcCollateral, btcTopUpTriggerLtv, btcTopUpTargetLtv, btcReleaseTriggerLtv, btcReleaseTargetLtv, savingsAllocationBtc, savingsAllocationStocks, savingsAllocationBonds, savingsAllocationCash, savingsAllocationOther, customReturnPeriods, tickerReturns, assetWithdrawalStrategy, withdrawalPriorityOrder, withdrawalBlendPercentages, saveSettings]);

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
  const currentLimitTraditionalIRA = getTraditionalIRALimit(currentYear, currentAge);
  const currentLimitHSA = getHSALimit(currentYear, currentAge, hsaFamilyCoverage);
  
  // Cap contributions to limits
  const actual401k = Math.min(contribution401k || 0, currentLimit401k);
  const actualRoth = Math.min(contributionRothIRA || 0, currentLimitRoth);
  const actualTraditionalIRA = Math.min(contributionTraditionalIRA || 0, currentLimitTraditionalIRA);
  const actualHSA = Math.min(contributionHSA || 0, currentLimitHSA);
  
  // Check Roth IRA income eligibility
  const rothIncomeLimit = getRothIRAIncomeLimit(currentYear, filingStatus);
  const adjustedGrossIncome = grossAnnualIncome - actual401k - actualTraditionalIRA - actualHSA;
  const rothIncomeEligible = adjustedGrossIncome < rothIncomeLimit.phaseOutEnd;
  const rothInPhaseOut = adjustedGrossIncome >= rothIncomeLimit.phaseOutStart && adjustedGrossIncome < rothIncomeLimit.phaseOutEnd;
  
  // Pre-tax contributions (401k, Traditional IRA, HSA) reduce taxable income
  const taxableGrossIncome = Math.max(0, grossAnnualIncome - actual401k - actualTraditionalIRA - actualHSA - currentStandardDeduction);
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



  // Use slider values directly (scenarios removed)
  const effectiveBtcCagr = btcCagr;
  const effectiveStocksCagr = stocksCagr;
  const effectiveInflation = inflationRate;

  // Power Law Year 1 CAGR (for display purposes)
  const powerLawYear1CAGR = useMemo(() => {
    return getPowerLawCAGR(0); // Year 1 rate
  }, []);
  
  // Power Law Year 10 CAGR (for display)
  const powerLawYear10CAGR = useMemo(() => {
    return getPowerLawCAGR(10);
  }, []);

  // BTC growth models - now based on btcReturnModel, not withdrawalStrategy
  const getBtcGrowthRate = useCallback((yearFromNow, inflationRate) => {
    let rate;
    
    // If custom_periods is selected, check for a custom period first
    if (btcReturnModel === 'custom_periods') {
      const customRate = getCustomReturnForYear('btc', yearFromNow, customReturnPeriods, null);
      if (customRate !== null) {
        return customRate;
      }
      // Fallback to Power Law if no custom period defined for this year
      return getPowerLawCAGR(yearFromNow);
    }
    
    switch (btcReturnModel) {
      case 'powerlaw':
        // Power Law model - use year-specific declining CAGR
        rate = getPowerLawCAGR(yearFromNow);
        break;
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
          rate = Math.max(20, 50 - (yearsFromStart * 2.5));
        } else if (absoluteYear <= 2045) {
          // Phase 2: Plateau at 20%
          rate = 20;
        } else if (absoluteYear <= 2075) {
          // Phase 3: Decline from 20% to inflation + 3%
          const yearsIntoDecline = absoluteYear - 2045;
          const totalDeclineYears = 2075 - 2045; // 30 years
          const targetRate = inflationRate + 3; // Mid-point of 2-4% above inflation
          const declineAmount = 20 - targetRate;
          rate = 20 - (declineAmount * (yearsIntoDecline / totalDeclineYears));
        } else {
          // Phase 4: Terminal rate (2% above inflation for long-term real returns)
          rate = inflationRate + 2;
        }
        break;
      default:
        rate = effectiveBtcCagr;
    }
    
    return rate;
  }, [btcReturnModel, effectiveBtcCagr, customReturnPeriods]);

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

  // Bitcoin volatility model - starts high and decays over time
  const getBtcVolatilityForMonteCarlo = useCallback((yearsFromNow) => {
    const initialVolatility = 55;
    const minimumVolatility = 20;
    const decayRate = 0.05;
    return minimumVolatility + (initialVolatility - minimumVolatility) * Math.exp(-decayRate * yearsFromNow);
  }, []);

  // Bitcoin distribution parameters based on academic research
  // Swan Research: Skewness +2.8, Kurtosis ~105
  // Skewed Student-t provides better empirical fit than normal distribution
  const BTC_SKEW_PARAM = 1.15;  // Positive skew (>1 = more upside outcomes)
  const BTC_DEGREES_OF_FREEDOM = 5;  // Fat tails (lower = fatter, 5 is typical for crypto)

  // Asset correlation matrix based on historical data (2018-2024)
  // Order: [BTC, Stocks, Bonds, RealEstate, Cash, Other]
  // Conservative estimates to avoid overfitting
  const ASSET_CORRELATIONS = [
    [1.00,  0.40, -0.10,  0.20,  0.00,  0.30],  // BTC
    [0.40,  1.00, -0.20,  0.50,  0.00,  0.60],  // Stocks
    [-0.10, -0.20, 1.00, -0.10,  0.30, -0.10],  // Bonds
    [0.20,  0.50, -0.10,  1.00,  0.00,  0.40],  // Real Estate
    [0.00,  0.00,  0.30,  0.00,  1.00,  0.00],  // Cash
    [0.30,  0.60, -0.10,  0.40,  0.00,  1.00],  // Other
  ];

  // Cholesky decomposition for generating correlated random numbers
  // Returns lower triangular matrix L where L * L^T = correlation matrix
  const choleskyDecomposition = (matrix) => {
    const n = matrix.length;
    const L = Array(n).fill(null).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;
        for (let k = 0; k < j; k++) {
          sum += L[i][k] * L[j][k];
        }
        if (i === j) {
          L[i][j] = Math.sqrt(Math.max(0, matrix[i][i] - sum));
        } else {
          L[i][j] = (matrix[i][j] - sum) / (L[j][j] || 1);
        }
      }
    }
    return L;
  };

  // Pre-compute Cholesky matrix once (it's constant)
  const CHOLESKY_L = choleskyDecomposition(ASSET_CORRELATIONS);

  // Generate correlated random numbers from independent ones
  // independentZ = [z1, z2, z3, z4, z5, z6] (independent standard normals)
  // Returns correlated values in same order: [btc, stocks, bonds, realEstate, cash, other]
  const generateCorrelatedReturns = (independentZ) => {
    const correlated = [];
    for (let i = 0; i < independentZ.length; i++) {
      let sum = 0;
      for (let j = 0; j <= i; j++) {
        sum += CHOLESKY_L[i][j] * independentZ[j];
      }
      correlated.push(sum);
    }
    return correlated;
  };

  // Monte Carlo simulation - now uses runUnifiedProjection for consistency
  const runMonteCarloSimulation = useCallback((numSimulations = 1000) => {
    const projectionYears = lifeExpectancy - currentAge + 1;
    const paths = [];
    const successResults = [];
    const withdrawalPaths = [];

    // Helper: Generate random normal using Box-Muller
    const randomNormal = () => {
      const u1 = Math.max(0.0001, Math.random());
      const u2 = Math.random();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };

    // Chi-squared random variate generator (sum of squared normals)
    const randomChiSquared = (df) => {
      let sum = 0;
      for (let i = 0; i < df; i++) {
        const z = randomNormal();
        sum += z * z;
      }
      return sum;
    };

    // Standard Student-t random variate
    const randomStudentT = (df) => {
      const z = randomNormal();
      const chi2 = randomChiSquared(df);
      return z / Math.sqrt(chi2 / df);
    };

    // Skewed Student-t using Fernández-Steel transformation
    // skew > 1 means positive skew (more upside), skew < 1 means negative skew
    const randomSkewedStudentT = (df, skew) => {
      const t = randomStudentT(df);
      const u = Math.random();
      
      // Fernández-Steel skewing: flip sign based on skew parameter
      const threshold = 1 / (1 + skew * skew);
      if (u < threshold) {
        return -Math.abs(t) / skew;
      } else {
        return Math.abs(t) * skew;
      }
    };

    for (let sim = 0; sim < numSimulations; sim++) {
      // Generate random yearly returns for this simulation
      const yearlyReturnOverrides = {
        btc: [],
        stocks: [],
        bonds: [],
        realEstate: [],
        cash: [],
        other: []
      };

      for (let year = 0; year <= projectionYears; year++) {
        // Generate independent random numbers
        // Use Skewed Student-t for BTC (fat tails + positive skew), normal for others
        const independentZ = [
          randomSkewedStudentT(BTC_DEGREES_OF_FREEDOM, BTC_SKEW_PARAM), // BTC
          randomNormal(), // Stocks
          randomNormal(), // Bonds
          randomNormal(), // Real Estate
          randomNormal(), // Cash
          randomNormal(), // Other
        ];
        
        // Apply correlation matrix to generate correlated shocks
        const correlatedZ = generateCorrelatedReturns(independentZ);
        const [zBtc, zStocks, zBonds, zRealEstate, zCash, zOther] = correlatedZ;

        // BTC: Use getBtcGrowthRate as expected return, add volatility
        const expectedBtcReturn = getBtcGrowthRate(year, effectiveInflation);
        const btcVolatility = getBtcVolatilityForMonteCarlo(year);
        // Expanded caps: -75% (worst year was -73%), +250% (allow fat tail upside)
        const btcReturn = Math.max(-75, Math.min(250, expectedBtcReturn + btcVolatility * zBtc));

        // Stocks: Use effectiveStocksCagr as expected, add volatility
        const stocksVolatilityVal = 18;
        const stocksReturn = Math.max(-40, Math.min(50, effectiveStocksCagr + stocksVolatilityVal * zStocks));

        // Real Estate: Add +/- 5% randomness
        const realEstateReturn = realEstateCagr + 5 * zRealEstate;

        // Bonds: Add +/- 2% randomness
        const bondsReturn = bondsCagr + 2 * zBonds;

        // Cash: Add +/- 1% randomness
        const cashReturn = cashCagr + 1 * zCash;

        // Other: Add +/- 3% randomness
        const otherReturn = otherCagr + 3 * zOther;

        yearlyReturnOverrides.btc.push(btcReturn);
        yearlyReturnOverrides.stocks.push(stocksReturn);
        yearlyReturnOverrides.bonds.push(bondsReturn);
        yearlyReturnOverrides.realEstate.push(realEstateReturn);
        yearlyReturnOverrides.cash.push(cashReturn);
        yearlyReturnOverrides.other.push(otherReturn);
      }

      // Run unified projection with randomized returns
      const result = runUnifiedProjection({
        holdings,
        accounts,
        liabilities,
        collateralizedLoans,
        currentPrice,
        currentAge,
        retirementAge,
        lifeExpectancy,
        retirementAnnualSpending,
        effectiveSocialSecurity,
        socialSecurityStartAge,
        otherRetirementIncome,
        annualSavings,
        incomeGrowth,
        grossAnnualIncome,
        currentAnnualSpending,
        filingStatus,
        stateOfResidence,
        contribution401k,
        employer401kMatch,
        contributionRothIRA,
        contributionTraditionalIRA,
        contributionHSA,
        hsaFamilyCoverage,
        getBtcGrowthRate,
        effectiveInflation,
        effectiveStocksCagr,
        bondsCagr,
        realEstateCagr,
        cashCagr,
        otherCagr,
        savingsAllocationBtc,
        savingsAllocationStocks,
        savingsAllocationBonds,
        savingsAllocationCash,
        savingsAllocationOther,
        autoTopUpBtcCollateral,
        btcTopUpTriggerLtv,
        btcTopUpTargetLtv,
        btcReleaseTriggerLtv,
        btcReleaseTargetLtv,
        goals,
        lifeEvents,
        getTaxTreatmentFromHolding,
        yearlyReturnOverrides,
        customReturnPeriods,
        tickerReturns,
        taxLots: activeTaxLots,
        costBasisMethod,
        assetWithdrawalStrategy,
        withdrawalPriorityOrder,
        withdrawalBlendPercentages,
        DEBUG: false,
        });

        // Extract path data from result
      const path = result.yearByYear.map(yearData => yearData.total || 0);
      const withdrawalPath = result.yearByYear.map(yearData => 
        (yearData.withdrawFromTaxable || 0) + 
        (yearData.withdrawFromTaxDeferred || 0) + 
        (yearData.withdrawFromTaxFree || 0)
      );

      paths.push(path);
      withdrawalPaths.push(withdrawalPath);
      successResults.push(result.survives);
    }

    return { paths, successResults, withdrawalPaths };
  }, [
    holdings, accounts, liabilities, collateralizedLoans, currentPrice, currentAge, retirementAge,
    lifeExpectancy, retirementAnnualSpending, effectiveSocialSecurity, socialSecurityStartAge,
    otherRetirementIncome, annualSavings, incomeGrowth, grossAnnualIncome, currentAnnualSpending,
    filingStatus, stateOfResidence, contribution401k, employer401kMatch, contributionRothIRA,
    contributionTraditionalIRA, contributionHSA, hsaFamilyCoverage, getBtcGrowthRate, effectiveInflation,
    effectiveStocksCagr, bondsCagr, realEstateCagr, cashCagr, otherCagr, savingsAllocationBtc,
    savingsAllocationStocks, savingsAllocationBonds, savingsAllocationCash, savingsAllocationOther,
    autoTopUpBtcCollateral, btcTopUpTriggerLtv, btcTopUpTargetLtv, btcReleaseTriggerLtv,
    btcReleaseTargetLtv, goals, lifeEvents, getTaxTreatmentFromHolding, getBtcVolatilityForMonteCarlo,
    activeTaxLots, costBasisMethod
  ]);

  // Reusable projection function using unified projection engine
  const runProjectionForRetirementAge = useCallback((testRetirementAge, testSpending = null) => {
    const spendingToUse = testSpending !== null ? testSpending : retirementAnnualSpending;
    
    const result = runUnifiedProjection({
      holdings,
      accounts,
      liabilities,
      collateralizedLoans,
      currentPrice,
      currentAge,
      retirementAge: testRetirementAge,
      lifeExpectancy,
      retirementAnnualSpending: spendingToUse,
      effectiveSocialSecurity,
      socialSecurityStartAge,
      otherRetirementIncome,
      annualSavings,
      incomeGrowth,
      grossAnnualIncome,
      currentAnnualSpending,
      filingStatus,
      stateOfResidence,
      contribution401k,
      employer401kMatch,
      contributionRothIRA,
      contributionTraditionalIRA,
      contributionHSA,
      hsaFamilyCoverage,
      getBtcGrowthRate,
      effectiveInflation,
      effectiveStocksCagr,
      bondsCagr,
      realEstateCagr,
      cashCagr,
      otherCagr,
      savingsAllocationBtc,
      savingsAllocationStocks,
      savingsAllocationBonds,
      savingsAllocationCash,
      savingsAllocationOther,
      autoTopUpBtcCollateral,
      btcTopUpTriggerLtv,
      btcTopUpTargetLtv,
      btcReleaseTriggerLtv,
      btcReleaseTargetLtv,
      goals,
      lifeEvents,
      getTaxTreatmentFromHolding,
      customReturnPeriods,
      tickerReturns,
      taxLots: activeTaxLots,
      costBasisMethod,
      assetWithdrawalStrategy,
      withdrawalPriorityOrder,
      withdrawalBlendPercentages,
      DEBUG: false,
    });
    
    return result;
  }, [holdings, accounts, liabilities, collateralizedLoans, currentPrice, currentAge, lifeExpectancy, customReturnPeriods, tickerReturns, 
      retirementAnnualSpending, effectiveSocialSecurity, socialSecurityStartAge, otherRetirementIncome,
      annualSavings, incomeGrowth, grossAnnualIncome, currentAnnualSpending, filingStatus, stateOfResidence,
      contribution401k, employer401kMatch, contributionRothIRA, contributionTraditionalIRA, contributionHSA, hsaFamilyCoverage,
      getBtcGrowthRate, effectiveInflation, effectiveStocksCagr, bondsCagr, 
      realEstateCagr, cashCagr, otherCagr, savingsAllocationBtc, savingsAllocationStocks, savingsAllocationBonds,
      savingsAllocationCash, savingsAllocationOther, autoTopUpBtcCollateral, btcTopUpTriggerLtv, btcTopUpTargetLtv,
      btcReleaseTriggerLtv, btcReleaseTargetLtv, goals, lifeEvents, getTaxTreatmentFromHolding, activeTaxLots, costBasisMethod]);



  // Generate projection data using unified projection engine
  const projections = useMemo(() => {
    console.log('PROJECTIONS: tickerReturns =', JSON.stringify(tickerReturns));
    const result = runUnifiedProjection({
      holdings,
      accounts,
      liabilities,
      collateralizedLoans,
      currentPrice,
      currentAge,
      retirementAge,
      lifeExpectancy,
      retirementAnnualSpending,
      effectiveSocialSecurity,
      socialSecurityStartAge,
      otherRetirementIncome,
      annualSavings,
      incomeGrowth,
      grossAnnualIncome,
      currentAnnualSpending,
      filingStatus,
      stateOfResidence,
      contribution401k,
      employer401kMatch,
      contributionRothIRA,
      contributionTraditionalIRA,
      contributionHSA,
      hsaFamilyCoverage,
      getBtcGrowthRate,
      effectiveInflation,
      effectiveStocksCagr,
      bondsCagr,
      realEstateCagr,
      cashCagr,
      otherCagr,
      savingsAllocationBtc,
      savingsAllocationStocks,
      savingsAllocationBonds,
      savingsAllocationCash,
      savingsAllocationOther,
      autoTopUpBtcCollateral,
      btcTopUpTriggerLtv,
      btcTopUpTargetLtv,
      btcReleaseTriggerLtv,
      btcReleaseTargetLtv,
      goals,
      lifeEvents,
      getTaxTreatmentFromHolding,
      customReturnPeriods,
      taxLots: activeTaxLots,
      costBasisMethod,
      assetWithdrawalStrategy,
      withdrawalPriorityOrder,
      withdrawalBlendPercentages,
      DEBUG: false,
    });
    
    return result.yearByYear;
  }, [holdings, accounts, liabilities, collateralizedLoans, currentPrice, currentAge, retirementAge, lifeExpectancy, customReturnPeriods, 
      retirementAnnualSpending, effectiveSocialSecurity, socialSecurityStartAge, otherRetirementIncome,
      annualSavings, incomeGrowth, grossAnnualIncome, currentAnnualSpending, filingStatus, stateOfResidence,
      contribution401k, employer401kMatch, contributionRothIRA, contributionTraditionalIRA, contributionHSA, hsaFamilyCoverage,
      getBtcGrowthRate, effectiveInflation, effectiveStocksCagr, bondsCagr, 
      realEstateCagr, cashCagr, otherCagr, savingsAllocationBtc, savingsAllocationStocks, savingsAllocationBonds,
      savingsAllocationCash, savingsAllocationOther, autoTopUpBtcCollateral, btcTopUpTriggerLtv, btcTopUpTargetLtv,
      btcReleaseTriggerLtv, btcReleaseTargetLtv, goals, lifeEvents, getTaxTreatmentFromHolding, activeTaxLots, costBasisMethod,
      assetWithdrawalStrategy, withdrawalPriorityOrder, withdrawalBlendPercentages]);

  // Calculate 90% safe spending using Monte Carlo binary search - OPTIMIZED
  const calculateSafeSpendingMonteCarlo = useCallback((numSimulations = 1000) => {
    let low = 0;
    let high = 500000;
    let safeSpending = 0;
    
    const projectionYears = lifeExpectancy - currentAge + 1;
    
    // Helper: Generate random normal using Box-Muller
    const randomNormal = () => {
      const u1 = Math.max(0.0001, Math.random());
      const u2 = Math.random();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };

    // Chi-squared random variate generator
    const randomChiSquared = (df) => {
      let sum = 0;
      for (let i = 0; i < df; i++) {
        const z = randomNormal();
        sum += z * z;
      }
      return sum;
    };

    // Standard Student-t random variate
    const randomStudentT = (df) => {
      const z = randomNormal();
      const chi2 = randomChiSquared(df);
      return z / Math.sqrt(chi2 / df);
    };

    // Skewed Student-t using Fernández-Steel transformation
    const randomSkewedStudentT = (df, skew) => {
      const t = randomStudentT(df);
      const u = Math.random();
      const threshold = 1 / (1 + skew * skew);
      if (u < threshold) {
        return -Math.abs(t) / skew;
      } else {
        return Math.abs(t) * skew;
      }
    };
    
    // STEP 1: Generate all random paths ONCE at the start (more efficient and consistent)
    const paths = [];
    for (let sim = 0; sim < numSimulations; sim++) {
      const yearlyReturnOverrides = {
        btc: [], stocks: [], bonds: [], realEstate: [], cash: [], other: []
      };
      
      for (let year = 0; year <= projectionYears; year++) {
        // Generate independent random numbers
        const independentZ = [
          randomSkewedStudentT(BTC_DEGREES_OF_FREEDOM, BTC_SKEW_PARAM),
          randomNormal(),
          randomNormal(),
          randomNormal(),
          randomNormal(),
          randomNormal(),
        ];
        
        // Apply correlation matrix
        const correlatedZ = generateCorrelatedReturns(independentZ);
        const [zBtc, zStocks, zBonds, zRealEstate, zCash, zOther] = correlatedZ;

        const expectedBtcReturn = getBtcGrowthRate(year, effectiveInflation);
        const btcVolatility = getBtcVolatilityForMonteCarlo(year);
        const btcReturn = Math.max(-75, Math.min(250, expectedBtcReturn + btcVolatility * zBtc));
        const stocksReturn = Math.max(-40, Math.min(50, effectiveStocksCagr + 18 * zStocks));
        const realEstateReturn = realEstateCagr + 5 * zRealEstate;
        const bondsReturn = bondsCagr + 2 * zBonds;
        const cashReturn = cashCagr + 1 * zCash;
        const otherReturn = otherCagr + 3 * zOther;

        yearlyReturnOverrides.btc.push(btcReturn);
        yearlyReturnOverrides.stocks.push(stocksReturn);
        yearlyReturnOverrides.bonds.push(bondsReturn);
        yearlyReturnOverrides.realEstate.push(realEstateReturn);
        yearlyReturnOverrides.cash.push(cashReturn);
        yearlyReturnOverrides.other.push(otherReturn);
      }
      paths.push(yearlyReturnOverrides);
    }
    
    // STEP 2: Binary search using the SAME paths for each spending level test
    for (let iteration = 0; iteration < 15; iteration++) {
      const mid = Math.round((low + high) / 2);
      let successes = 0;
      
      for (let sim = 0; sim < numSimulations; sim++) {
        const result = runUnifiedProjection({
          holdings,
          accounts,
          liabilities,
          collateralizedLoans,
          currentPrice,
          currentAge,
          retirementAge,
          lifeExpectancy,
          retirementAnnualSpending: mid,
          effectiveSocialSecurity,
          socialSecurityStartAge,
          otherRetirementIncome,
          annualSavings,
          incomeGrowth,
          grossAnnualIncome,
          currentAnnualSpending,
          filingStatus,
          stateOfResidence,
          contribution401k,
          employer401kMatch,
          contributionRothIRA,
          contributionTraditionalIRA,
          contributionHSA,
          hsaFamilyCoverage,
          getBtcGrowthRate,
          effectiveInflation,
          effectiveStocksCagr,
          bondsCagr,
          realEstateCagr,
          cashCagr,
          otherCagr,
          savingsAllocationBtc,
          savingsAllocationStocks,
          savingsAllocationBonds,
          savingsAllocationCash,
          savingsAllocationOther,
          autoTopUpBtcCollateral,
          btcTopUpTriggerLtv,
          btcTopUpTargetLtv,
          btcReleaseTriggerLtv,
          btcReleaseTargetLtv,
          goals,
          lifeEvents,
          getTaxTreatmentFromHolding,
          yearlyReturnOverrides: paths[sim],
          customReturnPeriods,
          tickerReturns,
          taxLots: activeTaxLots,
          costBasisMethod,
          DEBUG: false,
        });
        
        if (result.survives) {
          successes++;
        }
      }
      
      const successRate = successes / numSimulations;
      if (successRate >= 0.90) {
        safeSpending = mid;
        low = mid;
      } else {
        high = mid;
      }
      
      if (high - low <= 5000) break;
    }
    
    return safeSpending;
  }, [
    holdings, accounts, liabilities, collateralizedLoans, currentPrice, currentAge, retirementAge,
    lifeExpectancy, effectiveSocialSecurity, socialSecurityStartAge, otherRetirementIncome, annualSavings,
    incomeGrowth, grossAnnualIncome, currentAnnualSpending, filingStatus, stateOfResidence,
    contribution401k, employer401kMatch, contributionRothIRA, contributionTraditionalIRA, contributionHSA,
    hsaFamilyCoverage, getBtcGrowthRate, effectiveInflation, effectiveStocksCagr, bondsCagr, realEstateCagr,
    cashCagr, otherCagr, savingsAllocationBtc, savingsAllocationStocks, savingsAllocationBonds,
    savingsAllocationCash, savingsAllocationOther, autoTopUpBtcCollateral, btcTopUpTriggerLtv,
    btcTopUpTargetLtv, btcReleaseTriggerLtv, btcReleaseTargetLtv, goals, lifeEvents,
    getTaxTreatmentFromHolding, getBtcVolatilityForMonteCarlo, customReturnPeriods, tickerReturns,
    activeTaxLots, costBasisMethod
  ]);

  // Run Monte Carlo when button clicked
  const handleRunSimulation = () => {
    const { paths: simulations, successResults, withdrawalPaths } = runMonteCarloSimulation(1000);

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
    
    // Calculate 90% safe spending
    const safeSpendingResult = calculateSafeSpendingMonteCarlo(1000);
    setSafeSpending90(safeSpendingResult);

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
        description: `Close to target! Earliest retirement: Age ${earliestRetirementAge} (${gap} year${gap !== 1 ? 's' : ''} from target).`,
        icon: <TrendingUp className="w-5 h-5" />
      };
    } else if (gap === 0) {
      // Exactly on target
      return {
        type: 'on_track',
        title: 'On Track!',
        description: `Your target retirement at Age ${retirementAge} is achievable.`,
        icon: <TrendingUp className="w-5 h-5" />
      };
    } else {
      // gap < 0 means can retire before target age
      const yearsEarly = Math.abs(gap);
      return {
        type: 'optimistic',
        title: 'Ahead of Schedule!',
        description: `You can retire ${yearsEarly} year${yearsEarly !== 1 ? 's' : ''} earlier at Age ${earliestRetirementAge}.`,
        icon: <Sparkles className="w-5 h-5" />
      };
    }
  }, [earliestRetirementAge, retirementAge, willRunOutOfMoney, runOutOfMoneyAge, currentAge]);

  // UNIFIED: Derive earliestRetirementAge using binary search with accurate projection
  const derivedEarliestRetirementAge = useMemo(() => {
    const total = btcValue + stocksValue + realEstateValue + bondsValue + cashValue + otherValue;
    if (total <= 0) return null;
    
    // Binary search for earliest sustainable retirement age
    // Search from current age to life expectancy - 1
    let low = currentAge;
    let high = lifeExpectancy - 1;
    let earliest = null;
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const result = runProjectionForRetirementAge(mid);
      
      if (result.survives) {
        earliest = mid;
        high = mid - 1; // Try earlier
      } else {
        low = mid + 1; // Need to work longer
      }
    }
    
    return earliest;
  }, [holdings, accounts, liabilities, collateralizedLoans, currentPrice, currentAge, lifeExpectancy, 
      retirementAnnualSpending, effectiveSocialSecurity, socialSecurityStartAge, otherRetirementIncome,
      annualSavings, incomeGrowth, grossAnnualIncome, currentAnnualSpending, filingStatus, stateOfResidence,
      contribution401k, employer401kMatch, contributionRothIRA, contributionTraditionalIRA, contributionHSA, 
      hsaFamilyCoverage, getBtcGrowthRate, effectiveInflation, effectiveStocksCagr, bondsCagr, 
      realEstateCagr, cashCagr, otherCagr, savingsAllocationBtc, savingsAllocationStocks, 
      savingsAllocationBonds, savingsAllocationCash, savingsAllocationOther, autoTopUpBtcCollateral, 
      btcTopUpTriggerLtv, btcTopUpTargetLtv, btcReleaseTriggerLtv, btcReleaseTargetLtv, 
      goals, lifeEvents, getTaxTreatmentFromHolding, runProjectionForRetirementAge]);

  // Update state when derived value changes
  useEffect(() => {
    setEarliestRetirementAge(derivedEarliestRetirementAge);
  }, [derivedEarliestRetirementAge]);

  // UNIFIED: Derive maxSustainableSpending using binary search with accurate projection
  const derivedMaxSustainableSpending = useMemo(() => {
    const total = btcValue + stocksValue + realEstateValue + bondsValue + cashValue + otherValue;
    if (total <= 0) return 0;
    
    // Binary search for max sustainable spending (in today's dollars)
    // Start with a high upper bound - the search will find the true max
    let low = 0;
    let high = total * 2; // Start very high - 200% of portfolio

    // First, find a valid upper bound (where portfolio fails)
    let testResult = runProjectionForRetirementAge(retirementAge, high);
    while (testResult.survives && high < total * 10) {
      high = high * 2;
      testResult = runProjectionForRetirementAge(retirementAge, high);
    }

    // Now binary search between low and high
    for (let iteration = 0; iteration < 30; iteration++) {
      const testSpending = (low + high) / 2;
      
      const result = runProjectionForRetirementAge(retirementAge, testSpending);
      
      if (result.survives) {
        low = testSpending;
      } else {
        high = testSpending;
      }
    }
    
    return Math.round(low);
  }, [holdings, accounts, liabilities, collateralizedLoans, currentPrice, currentAge, lifeExpectancy, 
      retirementAnnualSpending, effectiveSocialSecurity, socialSecurityStartAge, otherRetirementIncome,
      annualSavings, incomeGrowth, grossAnnualIncome, currentAnnualSpending, filingStatus, stateOfResidence,
      contribution401k, employer401kMatch, contributionRothIRA, contributionTraditionalIRA, contributionHSA, 
      hsaFamilyCoverage, getBtcGrowthRate, effectiveInflation, effectiveStocksCagr, bondsCagr, 
      realEstateCagr, cashCagr, otherCagr, savingsAllocationBtc, savingsAllocationStocks, 
      savingsAllocationBonds, savingsAllocationCash, savingsAllocationOther, autoTopUpBtcCollateral, 
      btcTopUpTriggerLtv, btcTopUpTargetLtv, btcReleaseTriggerLtv, btcReleaseTargetLtv, 
      goals, lifeEvents, getTaxTreatmentFromHolding, retirementAge, runProjectionForRetirementAge]);

  // Update state when derived value changes
  useEffect(() => {
    setMaxSustainableSpending(derivedMaxSustainableSpending);
  }, [derivedMaxSustainableSpending]);

  // UNIFIED: Derive additional annual investment needed using binary search with projection
  const derivedAdditionalInvestmentNeeded = useMemo(() => {
    // If already sustainable at current savings, no additional needed
    const baseResult = runProjectionForRetirementAge(retirementAge);
    if (baseResult.survives) {
      return 0;
    }
    
    // Binary search for minimum additional annual investment needed
    let low = 0;
    let high = 500000; // $500k/year upper bound
    
    // Helper to run projection with additional savings
    const testWithAdditionalSavings = (additionalAmount) => {
      const result = runUnifiedProjection({
        holdings,
        accounts,
        liabilities,
        collateralizedLoans,
        currentPrice,
        currentAge,
        retirementAge,
        lifeExpectancy,
        retirementAnnualSpending,
        effectiveSocialSecurity,
        socialSecurityStartAge,
        otherRetirementIncome,
        annualSavings,
        additionalAnnualSavings: additionalAmount,
        incomeGrowth,
        grossAnnualIncome,
        currentAnnualSpending,
        filingStatus,
        stateOfResidence,
        contribution401k,
        employer401kMatch,
        contributionRothIRA,
        contributionTraditionalIRA,
        contributionHSA,
        hsaFamilyCoverage,
        getBtcGrowthRate,
        effectiveInflation,
        effectiveStocksCagr,
        bondsCagr,
        realEstateCagr,
        cashCagr,
        otherCagr,
        savingsAllocationBtc,
        savingsAllocationStocks,
        savingsAllocationBonds,
        savingsAllocationCash,
        savingsAllocationOther,
        autoTopUpBtcCollateral,
        btcTopUpTriggerLtv,
        btcTopUpTargetLtv,
        btcReleaseTriggerLtv,
        btcReleaseTargetLtv,
        goals,
        lifeEvents,
        getTaxTreatmentFromHolding,
        customReturnPeriods,
        tickerReturns,
        taxLots: activeTaxLots,
        costBasisMethod,
        DEBUG: false,
      });
      
      return result.survives;
    };
    
    // First check if even max amount works
    if (!testWithAdditionalSavings(high)) {
      return high + 1; // Return value above cap to signal "not achievable"
    }
    
    // Binary search to find minimum additional investment (within $500 precision)
    for (let iteration = 0; iteration < 20; iteration++) {
      const mid = Math.round((low + high) / 2);
      
      if (testWithAdditionalSavings(mid)) {
        high = mid; // Can succeed with this amount, try lower
      } else {
        low = mid; // Need more investment
      }
      
      // Stop when precision is within $500
      if (high - low <= 500) break;
    }
    
    return high;
  }, [holdings, accounts, liabilities, collateralizedLoans, currentPrice, currentAge, retirementAge, 
      lifeExpectancy, retirementAnnualSpending, effectiveSocialSecurity, socialSecurityStartAge, 
      otherRetirementIncome, annualSavings, incomeGrowth, grossAnnualIncome, currentAnnualSpending, 
      filingStatus, stateOfResidence, contribution401k, employer401kMatch, contributionRothIRA, 
      contributionTraditionalIRA, contributionHSA, hsaFamilyCoverage, getBtcGrowthRate, effectiveInflation, 
      effectiveStocksCagr, bondsCagr, realEstateCagr, cashCagr, otherCagr, savingsAllocationBtc, 
      savingsAllocationStocks, savingsAllocationBonds, savingsAllocationCash, savingsAllocationOther, 
      autoTopUpBtcCollateral, btcTopUpTriggerLtv, btcTopUpTargetLtv, btcReleaseTriggerLtv, 
      btcReleaseTargetLtv, goals, lifeEvents, getTaxTreatmentFromHolding, runProjectionForRetirementAge,
      activeTaxLots, costBasisMethod]);

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
  }, [projections, effectiveStocksCagr, realEstateCagr, bondsCagr, cashCagr, otherCagr, getBtcGrowthRate, effectiveInflation]);

  // Calculate when goals will be met based on projections
  const goalsWithProjections = useMemo(() => {
    return goals.map(goal => {
      const targetAmount = goal.target_amount || 0;
      const currentAmount = goal.saved_so_far || 0;

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
    
    // Only include fields that exist in the FinancialGoal schema
    const data = {
      name: goalForm.name,
      type: goalForm.type,
      target_amount: parseFloat(goalForm.target_amount) || 0,
      target_date: goalForm.target_date || null,
      saved_so_far: parseFloat(goalForm.saved_so_far) || 0,
      withdraw_from_portfolio: goalForm.withdraw_from_portfolio || false,
      notes: goalForm.notes || null,
      payoff_strategy: goalForm.payoff_strategy || null,
      extra_monthly_payment: parseFloat(goalForm.extra_monthly_payment) || null,
      lump_sum_date: goalForm.lump_sum_date || null,
      linked_liability_id: goalForm.linked_liability_id || null,
    };
    
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



  const resetGoalForm = () => setGoalForm({
    name: '', type: 'savings', target_amount: '', saved_so_far: '', target_date: '',
    withdraw_from_portfolio: false, linked_liability_id: '', payoff_strategy: 'minimum',
    extra_monthly_payment: '', lump_sum_date: '', notes: '',
  });
  const resetEventForm = () => setEventForm({ name: '', event_type: 'expense_change', year: new Date().getFullYear() + 1, amount: '', is_recurring: false, recurring_years: '', affects: 'expenses', notes: '', monthly_expense_impact: '', liability_amount: '', down_payment: '', interest_rate: '', loan_term_years: '', allocation_method: 'proportionate', btc_allocation: 0, stocks_allocation: 0, real_estate_allocation: 0, bonds_allocation: 0, cash_allocation: 0, other_allocation: 0 });


  // Show loading skeleton while data is being fetched
  if (isLoadingData) {
    return <LoadingSkeleton />;
  }

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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                { value: 'custom', label: 'Custom %', desc: `${btcCagr}% CAGR` },
                { value: 'saylor24', label: 'Saylor Model', desc: '50%→20%' },
                { value: 'powerlaw', label: 'Power Law', desc: `${powerLawYear1CAGR.toFixed(0)}%→${powerLawYear10CAGR.toFixed(0)}%`, hasTooltip: true },
                { value: 'custom_periods', label: 'Custom Periods', desc: '⚙️ Configure', isAction: true },
              ].map(model => (
                <div key={model.value} className="relative">
                  <button
                    onClick={() => {
                      if (model.isAction) {
                        setShowCustomPeriodsModal(true);
                        setBtcReturnModel('custom_periods');
                        userBtcModelSelectionMade.current = true;
                      } else {
                        setBtcReturnModel(model.value);
                        userBtcModelSelectionMade.current = true;
                      }
                    }}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-all w-full",
                      btcReturnModel === model.value
                        ? "bg-orange-500/20 border-orange-500/50 text-orange-300"
                        : "bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:border-zinc-600"
                    )}
                  >
                    <div className="flex items-center gap-1">
                      <p className="font-medium text-sm">{model.label}</p>
                      {model.hasTooltip && (
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help text-zinc-500 hover:text-zinc-300">
                                <Info className="w-3.5 h-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[280px] bg-zinc-800 border-zinc-700 text-zinc-200 text-sm p-3">
                              <p>Based on Bitcoin's Power Law model which has tracked BTC price for 15+ years. Growth rate declines over time: ~{powerLawYear1CAGR.toFixed(0)}% Year 1, ~{powerLawYear10CAGR.toFixed(0)}% Year 10. Use Custom % to stress test with different rates.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400">{model.desc}</p>
                    {model.value === 'custom_periods' && customReturnPeriods.btc?.length > 0 && (
                      <p className="text-[10px] text-emerald-400 mt-1">
                        ✓ {customReturnPeriods.btc.length} BTC period{customReturnPeriods.btc.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </button>
                </div>
              ))}
            </div>
            
            {/* Power Law info text */}
            {btcReturnModel === 'powerlaw' && (
              <p className="text-xs text-zinc-500 mt-3">
                Power Law growth: {powerLawYear1CAGR.toFixed(1)}% Year 1 → {powerLawYear10CAGR.toFixed(1)}% Year 10 (declining)
              </p>
            )}
            {btcReturnModel === 'custom_periods' && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-zinc-500">
                  Custom periods allow different return rates for different time ranges across all asset classes.
                </p>
                {Object.entries(customReturnPeriods).filter(([_, periods]) => periods?.length > 0).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(customReturnPeriods).filter(([_, periods]) => periods?.length > 0).map(([assetKey, periods]) => {
                      const assetInfo = {
                        btc: { label: 'BTC', color: 'text-orange-400' },
                        stocks: { label: 'Stocks', color: 'text-blue-400' },
                        realEstate: { label: 'RE', color: 'text-emerald-400' },
                        bonds: { label: 'Bonds', color: 'text-purple-400' },
                        cash: { label: 'Cash', color: 'text-cyan-400' },
                        other: { label: 'Other', color: 'text-zinc-400' },
                      }[assetKey] || { label: assetKey, color: 'text-zinc-400' };
                      
                      return (
                        <span key={assetKey} className={cn("text-xs px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700", assetInfo.color)}>
                          {assetInfo.label}: {periods.length} period{periods.length !== 1 ? 's' : ''}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {btcReturnModel === 'custom' && (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label className="text-zinc-400">Bitcoin CAGR</Label>
                  <span className="text-orange-400 font-semibold">{btcCagr}%</span>
                </div>
                <Slider
                  value={[btcCagr]}
                  onValueChange={([v]) => setBtcCagr(v)}
                  min={-20} max={100} step={1}
                />
              </div>
            )}
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
          {/* Earliest FI Age - Hero Card - Mobile Optimized */}
          <div className="card-premium rounded-2xl p-4 lg:p-6 border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-transparent">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div>
                <p className="text-sm text-zinc-400 uppercase tracking-wider mb-2">Earliest Retirement Age</p>
                <div className="flex items-baseline gap-2 lg:gap-3">
                  <span className={cn(
                    "text-3xl lg:text-5xl font-bold",
                    earliestRetirementAge && earliestRetirementAge <= retirementAge ? "text-emerald-400" :
                    earliestRetirementAge ? "text-orange-400" : "text-rose-400"
                  )}>
                    {earliestRetirementAge ? `Age ${earliestRetirementAge}` : "Not Yet Achievable"}
                  </span>
                  {earliestRetirementAge && (
                    <span className="text-zinc-500">
                      {earliestRetirementAge === currentAge 
                        ? "— You can retire now!" 
                        : `(${earliestRetirementAge - currentAge} years from now)`}
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-400 mt-2">
                  {earliestRetirementAge === null
                    ? "Increase savings or reduce spending to retire."
                    : earliestRetirementAge === currentAge
                      ? `You're ${retirementAge - earliestRetirementAge} year${retirementAge - earliestRetirementAge !== 1 ? 's' : ''} ahead of your target!`
                      : earliestRetirementAge < retirementAge
                        ? `You can retire ${retirementAge - earliestRetirementAge} year${retirementAge - earliestRetirementAge !== 1 ? 's' : ''} earlier than your target!`
                        : earliestRetirementAge === retirementAge
                          ? `Your target retirement at Age ${retirementAge} is achievable.`
                          : `Your target age ${retirementAge} is ${earliestRetirementAge - retirementAge} year${earliestRetirementAge - retirementAge !== 1 ? 's' : ''} too early based on current trajectory.`}
                </p>
                {/* Depletion warning when plan is not sustainable */}
                {((earliestRetirementAge === null || retirementAge < earliestRetirementAge) && runOutOfMoneyAge) && (
                  <p className="text-xs text-amber-400 mt-2">
                    ⚠️ With current plan: Portfolio depletes at age {runOutOfMoneyAge}
                  </p>
                )}
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

                  {/* Actionable Insights - Show recommendations or success message */}
          {(() => {
            const isAlreadyRetired = currentAge >= retirementAge;
            const isPlanSustainable = derivedMaxSustainableSpending >= retirementAnnualSpending && !willRunOutOfMoney;
            const monthlySavingsNeeded = Math.round(derivedAdditionalInvestmentNeeded / 12);
            
            // If plan is sustainable, show success message
            if (isPlanSustainable) {
              return (
                <div className="card-premium rounded-xl p-4 border border-emerald-500/30 bg-emerald-500/5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h5 className="text-sm font-semibold text-emerald-400">Your plan is on track!</h5>
                      <p className="text-xs text-zinc-400">
                        Current trajectory supports {formatNumber(retirementAnnualSpending)}/yr spending through age {lifeExpectancy}
                      </p>
                    </div>
                  </div>
                </div>
              );
            }
            
            // Plan not sustainable - show recommendations
            // Hide "Save More" if amount exceeds $500k/yr cap (not realistic)
            const savingsCapExceeded = derivedAdditionalInvestmentNeeded > 500000;
            
            return (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Save More Per Month - Only show if NOT retired AND under cap */}
                {!isAlreadyRetired && derivedAdditionalInvestmentNeeded > 0 && !savingsCapExceeded && (
                  <div className="card-premium rounded-xl p-4 border border-blue-500/30 bg-blue-500/5">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      <h5 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Save More</h5>
                    </div>
                    <p className="text-2xl font-bold text-blue-400">
                      +${monthlySavingsNeeded.toLocaleString()}<span className="text-sm text-zinc-500">/mo</span>
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-1">to retire at age {retirementAge}</p>
                  </div>
                )}

                {/* Wait Until Age - Only show if NOT retired AND earliest age exists AND is different from target */}
                {!isAlreadyRetired && earliestRetirementAge !== null && earliestRetirementAge > retirementAge && (
                  <div className="card-premium rounded-xl p-4 border border-amber-500/30 bg-amber-500/5">
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

                {/* Reduce Spending - Always show when not sustainable */}
                <div className="card-premium rounded-xl p-4 border border-rose-500/30 bg-rose-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    <h5 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
                      {isAlreadyRetired ? 'Reduce Spending To' : 'Or Reduce Spending To'}
                    </h5>
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
              </div>
            );
          })()}

          {/* Projection Chart */}
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <h3 className="font-semibold mb-2">Wealth Projection</h3>
            <p className="text-sm text-zinc-400 mb-4">
              {lifeEvents.length > 0 && `${lifeEvents.length} life event${lifeEvents.length !== 1 ? 's' : ''} • `}
              {goals.filter(g => g.withdraw_from_portfolio).length > 0 && `${goals.filter(g => g.withdraw_from_portfolio).length} planned expense${goals.filter(g => g.withdraw_from_portfolio).length !== 1 ? 's' : ''} • `}
              {goals.length > 0 && `${goals.length} goal${goals.length !== 1 ? 's' : ''} tracked`}
            </p>
            <div className="h-[500px] relative overflow-visible" ref={chartContainerRef}>
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
                    <RechartsTooltip
                      contentStyle={{ 
                        backgroundColor: '#18181b', 
                        border: '1px solid #27272a', 
                        borderRadius: '12px',
                        maxHeight: '50vh',
                        overflowY: 'auto',
                        pointerEvents: 'auto'
                      }}
                      wrapperStyle={{ 
                        zIndex: 9999,
                        pointerEvents: 'auto',
                        overflow: 'visible'
                      }}
                      position={{ y: 10 }}
                      active={lockedTooltipData ? true : undefined}
                      cursor={lockedTooltipData ? false : true}
                      content={({ active, payload, label, coordinate }) => {
                        // If tooltip is locked, don't render hover tooltip (locked tooltip rendered separately outside chart)
                        if (lockedTooltipData) {
                          return null;
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
                                        <span className="text-zinc-600 text-xs ml-1">@ {(p.btcGrowthRate || 0).toFixed(1)}%</span>
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
                                <span className="text-zinc-200 font-medium text-right">
                                  ${(p.stocks || 0).toLocaleString()}
                                  <span className="text-zinc-600 text-xs ml-1">@ {(p.stocksGrowthRate || 0).toFixed(1)}%</span>
                                </span>
                              </div>
                              <div className="flex justify-between gap-6">
                                <span className="text-emerald-400 font-light">Real Estate:</span>
                                <span className="text-zinc-200 font-medium text-right">
                                  ${(p.realEstate || 0).toLocaleString()}
                                  <span className="text-zinc-600 text-xs ml-1">@ {(p.realEstateGrowthRate || 0).toFixed(1)}%</span>
                                </span>
                              </div>
                              <div className="flex justify-between gap-6">
                                <span className="text-purple-400 font-light">Bonds:</span>
                                <span className="text-zinc-200 font-medium text-right">
                                  ${(p.bonds || 0).toLocaleString()}
                                  <span className="text-zinc-600 text-xs ml-1">@ {(p.bondsGrowthRate || 0).toFixed(1)}%</span>
                                </span>
                              </div>
                              <div className="flex justify-between gap-6">
                                <span className="text-cyan-400 font-light">Cash:</span>
                                <span className="text-zinc-200 font-medium text-right">
                                  ${(p.cash || 0).toLocaleString()}
                                  <span className="text-zinc-600 text-xs ml-1">@ {(p.cashGrowthRate || 0).toFixed(1)}%</span>
                                </span>
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
                              {/* Pre-retirement with negative cash flow - show full breakdown (hover) */}
                              {p.isWithdrawing && !p.isRetired && (
                                <div className="pt-3 mt-3 border-t border-zinc-700/70">
                                  <p className="text-zinc-400 mb-2 font-medium text-xs">Annual Cash Flow:</p>
                                  <div className="text-xs space-y-1.5 text-zinc-500 mb-2">
                                    <div className="flex justify-between gap-6">
                                      <span>Gross Income:</span>
                                      <span className="text-emerald-400 text-right">${(p.yearGrossIncome || 0).toLocaleString()}</span>
                                    </div>
                                    {p.lifeEventIncome > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>Life Event Income:</span>
                                        <span className="text-emerald-400 text-right">+${p.lifeEventIncome.toLocaleString()}</span>
                                      </div>
                                    )}
                                    {p.federalTaxPaid > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>Federal Tax:</span>
                                        <span className="text-rose-300 text-right">-${p.federalTaxPaid.toLocaleString()}</span>
                                      </div>
                                    )}
                                    {p.stateTaxPaid > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>{stateOfResidence} State Tax:</span>
                                        <span className="text-rose-300 text-right">-${p.stateTaxPaid.toLocaleString()}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between gap-6">
                                      <span>Spending:</span>
                                      <span className="text-zinc-300 text-right">-${(p.yearSpending || 0).toLocaleString()}</span>
                                    </div>
                                    {p.goalFunding > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>Goal Funding:</span>
                                        <span className="text-rose-300 text-right">-${p.goalFunding.toLocaleString()}</span>
                                      </div>
                                    )}
                                    {p.lifeEventExpense > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>Life Event Expense:</span>
                                        <span className="text-rose-300 text-right">-${p.lifeEventExpense.toLocaleString()}</span>
                                      </div>
                                    )}
                                    </div>
                                    {p.debtPayments > 0 && (
                                    <div className="text-xs text-zinc-500 mb-2">
                                      (Debt Payments: ${p.debtPayments.toLocaleString()} - tracked separately)
                                    </div>
                                  )}
                                  <div className="pt-2 border-t border-zinc-700/40">
                                    <p className={`font-semibold text-sm ${p.netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      Net Cash Flow: {p.netCashFlow >= 0 ? '+' : ''}${p.netCashFlow.toLocaleString()}
                                    </p>
                                  </div>
                                  {/* Withdrawal sources for pre-retirement deficit */}
                                  {(p.withdrawFromTaxable > 0 || p.withdrawFromTaxDeferred > 0 || p.withdrawFromTaxFree > 0) && (
                                    <div className="text-xs space-y-1.5 text-zinc-500 mt-3 pt-3 border-t border-zinc-700/40">
                                      <p className="text-zinc-400 font-medium mb-1">Withdrawal Sources (to cover deficit):</p>
                                      {p.withdrawFromTaxable > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>From Taxable:</span>
                                          <span className="text-rose-400 text-right">-${p.withdrawFromTaxable.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {p.withdrawFromTaxDeferred > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>From Tax-Deferred:</span>
                                          <span className="text-rose-400 text-right">-${p.withdrawFromTaxDeferred.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {p.withdrawFromTaxFree > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>From Tax-Free:</span>
                                          <span className="text-rose-400 text-right">-${p.withdrawFromTaxFree.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {p.penaltyPaid > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>Early Withdrawal Penalty:</span>
                                          <span className="text-rose-300 text-right">-${p.penaltyPaid.toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* Retirement withdrawals (hover) */}
                              {p.isWithdrawing && p.isRetired && (
                                <div className="pt-3 mt-3 border-t border-zinc-700/70">
                                  <p className="text-zinc-400 mb-2 font-medium text-xs">Annual Cash Flow:</p>
                                  <div className="text-xs space-y-1.5 text-zinc-500 mb-2">
                                    {/* Income sources - show even if $0 */}
                                    <div className="flex justify-between gap-6">
                                      <span>Gross Income:</span>
                                      <span className="text-emerald-400 text-right">
                                        {otherRetirementIncome > 0 ? `+$${otherRetirementIncome.toLocaleString()}` : '$0'}
                                      </span>
                                    </div>
                                    {p.lifeEventIncome > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>Life Event Income:</span>
                                        <span className="text-emerald-400 text-right">+${p.lifeEventIncome.toLocaleString()}</span>
                                      </div>
                                    )}
                                    {p.socialSecurityIncome > 0 && (
                                    <div className="flex justify-between gap-6">
                                      <span>Social Security Income:</span>
                                      <span className="text-emerald-400 text-right">+${p.socialSecurityIncome.toLocaleString()}</span>
                                    </div>
                                    )}
                                    {p.rmdWithdrawn > 0 && (
                                    <div className="flex justify-between gap-6">
                                      <span>RMD (Required):</span>
                                      <span className="text-emerald-400 text-right">+${p.rmdWithdrawn.toLocaleString()}</span>
                                    </div>
                                    )}
                                    {p.excessRmdReinvested > 0 && (
                                      <div className="flex justify-between gap-6 text-xs">
                                        <span className="text-zinc-500">└ Excess RMD Reinvested:</span>
                                        <span className="text-zinc-400 text-right">${p.excessRmdReinvested.toLocaleString()}</span>
                                      </div>
                                    )}
                                    {/* Expenses */}
                                    <div className="flex justify-between gap-6">
                                      <span>Spending:</span>
                                      <span className="text-zinc-300 text-right">-${(p.retirementSpendingOnly || 0).toLocaleString()}</span>
                                    </div>
                                    {p.yearGoalWithdrawal > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>Goal Funding:</span>
                                        <span className="text-zinc-300 text-right">-${p.yearGoalWithdrawal.toLocaleString()}</span>
                                      </div>
                                    )}
                                    {p.federalTaxPaid > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>Federal Tax:</span>
                                        <span className="text-rose-300 text-right">-${p.federalTaxPaid.toLocaleString()}</span>
                                      </div>
                                    )}
                                    {p.stateTaxPaid > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>{stateOfResidence} State Tax:</span>
                                        <span className="text-rose-300 text-right">-${p.stateTaxPaid.toLocaleString()}</span>
                                      </div>
                                    )}
                                    {p.penaltyPaid > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>Penalty Paid:</span>
                                        <span className="text-rose-300 text-right">-${p.penaltyPaid.toLocaleString()}</span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="pt-2 border-t border-zinc-700/40">
                                    {p.netCashFlow > 0 ? (
                                      <p className="font-semibold text-emerald-400 text-sm">
                                        Net Surplus (Reinvested): +${Math.abs(p.netCashFlow).toLocaleString()}
                                      </p>
                                    ) : (
                                      <p className="font-semibold text-rose-400 text-sm">
                                        Net Withdrawal from Portfolio: -${(p.totalWithdrawalAmount || 0).toLocaleString()}
                                      </p>
                                    )}
                                  </div>
                                  {p.netCashFlow <= 0 && (p.withdrawFromTaxable > 0 || p.withdrawFromTaxDeferred > 0 || p.withdrawFromTaxFree > 0) && (
                                    <div className="text-xs space-y-1.5 text-zinc-500 mt-3 pt-3 border-t border-zinc-700/40">
                                      <p className="text-zinc-400 font-medium mb-1">Withdrawal Sources:</p>
                                      {p.withdrawFromTaxable > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>From Taxable:</span>
                                          <span className="text-rose-400 text-right">-${p.withdrawFromTaxable.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {p.withdrawFromTaxDeferred > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>From Tax-Deferred:</span>
                                          <span className="text-rose-400 text-right">-${p.withdrawFromTaxDeferred.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {p.withdrawFromTaxFree > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>From Tax-Free:</span>
                                          <span className="text-rose-400 text-right">-${p.withdrawFromTaxFree.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {p.withdrawFromRealEstate > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>From Real Estate:</span>
                                          <span className="text-rose-400 text-right">-${p.withdrawFromRealEstate.toLocaleString()}</span>
                                        </div>
                                      )}
                                      {p.withdrawFromLoanPayoff > 0 && (
                                        <div className="flex justify-between gap-6">
                                          <span>From Loan Payoff:</span>
                                          <span className="text-rose-400 text-right">-${p.withdrawFromLoanPayoff.toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {p.loanPayoffs && p.loanPayoffs.length > 0 && (
                                    <div className="mt-2 p-2 rounded bg-orange-500/10 border border-orange-500/20">
                                      <p className="text-xs text-orange-400 font-medium">🎉 BTC Loan Paid Off (Collateral Unlocked)</p>
                                      {p.loanPayoffs.map((lp, lpIdx) => (
                                        <div key={lpIdx} className="text-[10px] text-zinc-400 mt-1">
                                          <div className="font-medium text-orange-300">{lp.loanName}</div>
                                          <div>Debt Cleared: ${Math.round(lp.debtPaid).toLocaleString()}</div>
                                          <div>BTC Released: {lp.btcReleased.toFixed(4)} BTC (${Math.round(lp.equityReleased).toLocaleString()})</div>
                                          <div>Tax on Sale: ${Math.round(lp.taxOnSale).toLocaleString()}</div>
                                          <div>Net Equity Applied: ${Math.round(lp.appliedToDeficit).toLocaleString()}</div>
                                        </div>
                                      ))}
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
                              {!p.isWithdrawing && (
                                <div className="pt-3 mt-3 border-t border-zinc-700/70">
                                  <p className="text-zinc-400 mb-2 font-medium text-xs">Annual Cash Flow:</p>
                                  <div className="text-xs space-y-1.5 text-zinc-500 mb-2">
                                    <div className="flex justify-between gap-6">
                                      <span>• Gross Income:</span>
                                      <span className="text-emerald-400 text-right">${(p.yearGrossIncome || 0).toLocaleString()}</span>
                                    </div>
                                    {p.lifeEventIncome > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>• Life Event Income:</span>
                                        <span className="text-emerald-400 text-right">+${p.lifeEventIncome.toLocaleString()}</span>
                                      </div>
                                    )}
                                    {p.federalTaxPaid > 0 && (
                                     <div className="flex justify-between gap-6">
                                       <span>• Federal Tax:</span>
                                       <span className="text-rose-300 text-right">-${p.federalTaxPaid.toLocaleString()}</span>
                                     </div>
                                    )}
                                    {p.stateTaxPaid > 0 && (
                                     <div className="flex justify-between gap-6">
                                       <span>• {stateOfResidence} State Tax:</span>
                                       <span className="text-rose-300 text-right">-${p.stateTaxPaid.toLocaleString()}</span>
                                     </div>
                                    )}
                                    {p.year401kContribution > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>• 401k/403b Contribution:</span>
                                        <span className="text-rose-300 text-right">-${p.year401kContribution.toLocaleString()}</span>
                                      </div>
                                    )}
                                    {p.yearEmployer401kMatch > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>• Employer 401k Match:</span>
                                        <span className="text-emerald-400 text-right">+${p.yearEmployer401kMatch.toLocaleString()}</span>
                                      </div>
                                    )}
                                    {p.yearRothContribution > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>• Roth IRA Contribution:</span>
                                        <span className="text-rose-300 text-right">-${p.yearRothContribution.toLocaleString()}</span>
                                      </div>
                                    )}
                                    {p.yearHSAContribution > 0 && (
                                      <div className="flex justify-between gap-6">
                                        <span>• HSA Contribution:</span>
                                        <span className="text-rose-300 text-right">-${p.yearHSAContribution.toLocaleString()}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between gap-6">
                                      <span>• Spending:</span>
                                      <span className="text-rose-300 text-right">-${(p.yearSpending || 0).toLocaleString()}</span>
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
                    />  {/* End RechartsTooltip */}
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
                              {goals.filter(g => !g.withdraw_from_portfolio).length > 0 && (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-0.5 bg-blue-400/50" style={{backgroundImage: 'repeating-linear-gradient(90deg, #60a5fa 0, #60a5fa 8px, transparent 8px, transparent 12px)'}} />
                                  <span className="text-zinc-400">Goal Targets</span>
                                </div>
                              )}
                              {goals.filter(g => g.withdraw_from_portfolio).length > 0 && (
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
                              {projections.some(p => p.liquidations?.some(l => l.type !== 'top_up' && l.type !== 'release' && l.type !== 'voluntary_payoff')) && (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-0.5" style={{backgroundImage: 'repeating-linear-gradient(90deg, #f43f5e 0, #f43f5e 4px, transparent 4px, transparent 8px)'}} />
                                  <span className="text-rose-400">Collateral Liquidation</span>
                                </div>
                              )}
                              {projections.some(p => p.loanPayoffs?.length > 0) && (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-0.5" style={{backgroundImage: 'repeating-linear-gradient(90deg, #fb923c 0, #fb923c 4px, transparent 4px, transparent 8px)'}} />
                                  <span className="text-orange-400">Loan Payoff (Equity Unlock)</span>
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
                    {goals.filter(g => g.target_date).slice(0, 5).map((goal) => {
                      let goalYear;
                      
                      if (goal.target_date) {
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
                    {/* Loan Payoff (Equity Unlock) markers */}
                    {projections.filter(p => p.loanPayoffs && p.loanPayoffs.length > 0).map((p, idx) => {
                      if (p.age >= currentAge && p.age <= lifeExpectancy) {
                        return (
                          <ReferenceLine
                            key={`loan-payoff-${p.age}-${idx}`}
                            x={p.age}
                            stroke="#fb923c"
                            strokeDasharray="4 4"
                            strokeOpacity={0.8}
                            yAxisId="left"
                          />
                        );
                      }
                      return null;
                    })}
                    {/* Goal target lines - only show for accumulation goals (not one-time spending) - NO LABELS */}
                    {goalsWithProjections.filter(g => g.target_amount > 0 && !g.withdraw_from_portfolio).slice(0, 3).map((goal, i) => (
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
              💡 Click on a year to lock the tooltip. Click ✕ or outside to dismiss.
            </p>
            
            {/* Locked Tooltip Portal - renders at click position with smart boundary detection */}
            {lockedTooltipData && (() => {
              const p = lockedTooltipData.payload[0]?.payload;
              if (!p) return null;
              const hasLiquidation = p.liquidations && p.liquidations.length > 0;
              
              // Smart positioning with boundary detection
              const tooltipWidth = 350;
              const containerWidth = chartContainerRef.current?.offsetWidth || 1200;
              const clickX = lockedTooltipData.x || 0;
              const offset = 15;
              
              // If tooltip would overflow right edge, position to left of click point
              const wouldOverflow = clickX + offset + tooltipWidth > containerWidth;
              const leftPosition = wouldOverflow 
                ? Math.max(0, clickX - tooltipWidth - offset) 
                : clickX + offset;
              
              return (
                <div 
                  className="absolute bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-sm shadow-2xl"
                  style={{ 
                    zIndex: 9999,
                    top: '20px',
                    left: `${leftPosition}px`,
                    width: '350px',
                    maxHeight: '500px',
                    overflowY: 'scroll'
                  }}
                >
                  <div className="mb-4">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-lg text-zinc-100">Age {lockedTooltipData.label} {p.hasEvent ? '📅' : ''} {hasLiquidation ? '⚠️' : ''}</p>
                      <button 
                        onClick={() => setLockedTooltipData(null)}
                        className="text-zinc-500 hover:text-zinc-300 text-sm p-1 hover:bg-zinc-800 rounded"
                      >
                        ✕
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500">{p.isRetired ? '(Retirement)' : '(Pre-Retirement)'}</p>
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
                              <span className="text-zinc-600 text-xs ml-1">@ {(p.btcGrowthRate || 0).toFixed(1)}%</span>
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
                      <span className="text-zinc-200 font-medium text-right">
                        ${(p.stocks || 0).toLocaleString()}
                        <span className="text-zinc-600 text-xs ml-1">@ {(p.stocksGrowthRate || 0).toFixed(1)}%</span>
                      </span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-emerald-400 font-light">Real Estate:</span>
                      <span className="text-zinc-200 font-medium text-right">
                        ${(p.realEstate || 0).toLocaleString()}
                        <span className="text-zinc-600 text-xs ml-1">@ {(p.realEstateGrowthRate || 0).toFixed(1)}%</span>
                      </span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-purple-400 font-light">Bonds:</span>
                      <span className="text-zinc-200 font-medium text-right">
                        ${(p.bonds || 0).toLocaleString()}
                        <span className="text-zinc-600 text-xs ml-1">@ {(p.bondsGrowthRate || 0).toFixed(1)}%</span>
                      </span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-cyan-400 font-light">Cash:</span>
                      <span className="text-zinc-200 font-medium text-right">
                        ${(p.cash || 0).toLocaleString()}
                        <span className="text-zinc-600 text-xs ml-1">@ {(p.cashGrowthRate || 0).toFixed(1)}%</span>
                      </span>
                    </div>
                    <div className="pt-3 mt-3 border-t border-zinc-700/70 space-y-1.5">
                      <div className="flex justify-between gap-6">
                        <span className="text-zinc-100 font-semibold">Total Assets:</span>
                        <span className="text-zinc-100 font-semibold text-right">${(p.total || 0).toLocaleString()}</span>
                      </div>
                    </div>
                    
                    {/* Debt Summary - Detailed */}
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
                    
                    {/* Pre-retirement with negative cash flow - full breakdown */}
                    {p.isWithdrawing && !p.isRetired && (
                      <div className="pt-3 mt-3 border-t border-zinc-700/70">
                        <p className="text-zinc-400 mb-2 font-medium text-xs">Annual Cash Flow:</p>
                        <div className="text-xs space-y-1.5 text-zinc-500 mb-2">
                          <div className="flex justify-between gap-6">
                            <span>Gross Income:</span>
                            <span className="text-emerald-400 text-right">${(p.yearGrossIncome || 0).toLocaleString()}</span>
                          </div>
                          {p.lifeEventIncome > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>Life Event Income:</span>
                              <span className="text-emerald-400 text-right">+${p.lifeEventIncome.toLocaleString()}</span>
                            </div>
                          )}
                          {p.federalTaxPaid > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>Federal Tax:</span>
                              <span className="text-rose-300 text-right">-${p.federalTaxPaid.toLocaleString()}</span>
                            </div>
                          )}
                          {p.stateTaxPaid > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>{stateOfResidence} State Tax:</span>
                              <span className="text-rose-300 text-right">-${p.stateTaxPaid.toLocaleString()}</span>
                            </div>
                          )}
                          <div className="flex justify-between gap-6">
                            <span>Spending:</span>
                            <span className="text-zinc-300 text-right">-${(p.yearSpending || 0).toLocaleString()}</span>
                          </div>
                          {p.goalFunding > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>Goal Funding:</span>
                              <span className="text-rose-300 text-right">-${p.goalFunding.toLocaleString()}</span>
                            </div>
                          )}
                          {p.lifeEventExpense > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>Life Event Expense:</span>
                              <span className="text-rose-300 text-right">-${p.lifeEventExpense.toLocaleString()}</span>
                            </div>
                          )}
                          </div>
                        {p.debtPayments > 0 && (
                          <div className="text-xs text-zinc-500 mb-2">
                            (Debt Payments: ${p.debtPayments.toLocaleString()} - tracked separately)
                          </div>
                        )}
                        <div className="pt-2 border-t border-zinc-700/40">
                          {p.netCashFlow > 0 ? (
                            <p className="font-semibold text-emerald-400 text-sm">
                              Net Savings: +${Math.abs(p.netCashFlow).toLocaleString()}
                            </p>
                          ) : (
                            <p className="font-semibold text-rose-400 text-sm">
                              Net Withdrawal from Portfolio: -${(p.totalWithdrawalAmount || 0).toLocaleString()}
                            </p>
                          )}
                        </div>
                        {/* Withdrawal sources for pre-retirement deficit */}
                        {(p.withdrawFromTaxable > 0 || p.withdrawFromTaxDeferred > 0 || p.withdrawFromTaxFree > 0) && (
                          <div className="text-xs space-y-1.5 text-zinc-500 mt-3 pt-3 border-t border-zinc-700/40">
                            <p className="text-zinc-400 font-medium mb-1">Withdrawal Sources (to cover deficit):</p>
                            {p.withdrawFromTaxable > 0 && (
                              <div className="flex justify-between gap-6">
                                <span>From Taxable:</span>
                                <span className="text-rose-400 text-right">-${p.withdrawFromTaxable.toLocaleString()}</span>
                              </div>
                            )}
                            {p.withdrawFromTaxDeferred > 0 && (
                              <div className="flex justify-between gap-6">
                                <span>From Tax-Deferred:</span>
                                <span className="text-rose-400 text-right">-${p.withdrawFromTaxDeferred.toLocaleString()}</span>
                              </div>
                            )}
                            {p.withdrawFromTaxFree > 0 && (
                              <div className="flex justify-between gap-6">
                                <span>From Tax-Free:</span>
                                <span className="text-rose-400 text-right">-${p.withdrawFromTaxFree.toLocaleString()}</span>
                              </div>
                            )}
                            {p.penaltyPaid > 0 && (
                              <div className="flex justify-between gap-6">
                                <span>Early Withdrawal Penalty:</span>
                                <span className="text-rose-300 text-right">-${p.penaltyPaid.toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Retirement withdrawals - full breakdown */}
                    {p.isWithdrawing && p.isRetired && (
                      <div className="pt-3 mt-3 border-t border-zinc-700/70">
                        <p className="text-zinc-400 mb-2 font-medium text-xs">Annual Cash Flow:</p>
                        <div className="text-xs space-y-1.5 text-zinc-500 mb-2">
                          {/* Income sources - show even if $0 */}
                          <div className="flex justify-between gap-6">
                            <span>Gross Income:</span>
                            <span className="text-emerald-400 text-right">
                              {otherRetirementIncome > 0 ? `+$${otherRetirementIncome.toLocaleString()}` : '$0'}
                            </span>
                          </div>
                          {p.lifeEventIncome > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>Life Event Income:</span>
                              <span className="text-emerald-400 text-right">+${p.lifeEventIncome.toLocaleString()}</span>
                            </div>
                          )}
                          {p.socialSecurityIncome > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>Social Security Income:</span>
                              <span className="text-emerald-400 text-right">+${p.socialSecurityIncome.toLocaleString()}</span>
                            </div>
                          )}
                          {p.rmdWithdrawn > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>RMD (Required):</span>
                              <span className="text-emerald-400 text-right">+${p.rmdWithdrawn.toLocaleString()}</span>
                            </div>
                          )}
                          {p.excessRmdReinvested > 0 && (
                            <div className="flex justify-between gap-6 text-xs">
                              <span className="text-zinc-500">└ Excess RMD Reinvested:</span>
                              <span className="text-zinc-400 text-right">${p.excessRmdReinvested.toLocaleString()}</span>
                            </div>
                          )}
                          {/* Expenses */}
                          <div className="flex justify-between gap-6">
                            <span>Spending:</span>
                            <span className="text-zinc-300 text-right">-${(p.retirementSpendingOnly || 0).toLocaleString()}</span>
                          </div>
                          {p.goalFunding > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>Goal Funding:</span>
                              <span className="text-rose-300 text-right">-${p.goalFunding.toLocaleString()}</span>
                            </div>
                          )}
                          {p.lifeEventExpense > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>Life Event Expense:</span>
                              <span className="text-rose-300 text-right">-${p.lifeEventExpense.toLocaleString()}</span>
                            </div>
                          )}
                          {p.federalTaxPaid > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>Federal Tax:</span>
                              <span className="text-rose-300 text-right">-${p.federalTaxPaid.toLocaleString()}</span>
                            </div>
                          )}
                          {p.stateTaxPaid > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>{stateOfResidence} State Tax:</span>
                              <span className="text-rose-300 text-right">-${p.stateTaxPaid.toLocaleString()}</span>
                            </div>
                          )}
                          {p.penaltyPaid > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>Penalty Paid:</span>
                              <span className="text-rose-300 text-right">-${p.penaltyPaid.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                        <div className="pt-2 border-t border-zinc-700/40">
                          {p.netCashFlow > 0 ? (
                            <p className="font-semibold text-emerald-400 text-sm">
                              Net Surplus (Reinvested): +${Math.abs(p.netCashFlow).toLocaleString()}
                            </p>
                          ) : (
                            <p className="font-semibold text-rose-400 text-sm">
                              Net Withdrawal from Portfolio: -${(p.totalWithdrawalAmount || 0).toLocaleString()}
                            </p>
                          )}
                        </div>
                        {p.netCashFlow <= 0 && (p.withdrawFromTaxable > 0 || p.withdrawFromTaxDeferred > 0 || p.withdrawFromTaxFree > 0) && (
                          <div className="text-xs space-y-1.5 text-zinc-500 mt-3 pt-3 border-t border-zinc-700/40">
                            <p className="text-zinc-400 font-medium mb-1">Withdrawal Sources:</p>
                            {p.withdrawFromTaxable > 0 && (
                              <div className="flex justify-between gap-6">
                                <span>From Taxable:</span>
                                <span className="text-rose-400 text-right">-${p.withdrawFromTaxable.toLocaleString()}</span>
                              </div>
                            )}
                            {p.withdrawFromTaxDeferred > 0 && (
                              <div className="flex justify-between gap-6">
                                <span>From Tax-Deferred:</span>
                                <span className="text-rose-400 text-right">-${p.withdrawFromTaxDeferred.toLocaleString()}</span>
                              </div>
                            )}
                            {p.withdrawFromTaxFree > 0 && (
                              <div className="flex justify-between gap-6">
                                <span>From Tax-Free:</span>
                                <span className="text-rose-400 text-right">-${p.withdrawFromTaxFree.toLocaleString()}</span>
                              </div>
                            )}
                            {p.withdrawFromRealEstate > 0 && (
                              <div className="flex justify-between gap-6">
                                <span>From Real Estate:</span>
                                <span className="text-rose-400 text-right">-${p.withdrawFromRealEstate.toLocaleString()}</span>
                              </div>
                            )}
                            {p.withdrawFromLoanPayoff > 0 && (
                              <div className="flex justify-between gap-6">
                                <span>From Loan Payoff:</span>
                                <span className="text-rose-400 text-right">-${p.withdrawFromLoanPayoff.toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {p.loanPayoffs && p.loanPayoffs.length > 0 && (
                          <div className="mt-2 p-2 rounded bg-orange-500/10 border border-orange-500/20">
                            <p className="text-xs text-orange-400 font-medium">🎉 Loan Paid Off to Unlock Equity</p>
                            {p.loanPayoffs.map((lp, lpIdx) => (
                              <div key={lpIdx} className="text-[10px] text-zinc-400 mt-1">
                                <div className="font-medium text-orange-300">{lp.loanName}</div>
                                <div>Debt Cleared: ${Math.round(lp.debtPaid).toLocaleString()}</div>
                                <div>BTC Released: {lp.btcReleased.toFixed(4)} BTC (${Math.round(lp.equityReleased).toLocaleString()})</div>
                                <div>Tax on Sale: ${Math.round(lp.taxOnSale).toLocaleString()}</div>
                                <div>Net Equity Applied: ${Math.round(lp.appliedToDeficit).toLocaleString()}</div>
                              </div>
                            ))}
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
                    {!p.isWithdrawing && !p.isRetired && (
                      <div className="pt-3 mt-3 border-t border-zinc-700/70">
                        <p className="text-zinc-400 mb-2 font-medium text-xs">Annual Cash Flow:</p>
                        <div className="text-xs space-y-1.5 text-zinc-500 mb-2">
                          <div className="flex justify-between gap-6">
                            <span>• Gross Income:</span>
                            <span className="text-emerald-400 text-right">${(p.yearGrossIncome || 0).toLocaleString()}</span>
                          </div>
                          {p.lifeEventIncome > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>• Life Event Income:</span>
                              <span className="text-emerald-400 text-right">+${p.lifeEventIncome.toLocaleString()}</span>
                            </div>
                          )}
                          {p.federalTaxPaid > 0 && (
                           <div className="flex justify-between gap-6">
                             <span>• Federal Tax:</span>
                             <span className="text-rose-300 text-right">-${p.federalTaxPaid.toLocaleString()}</span>
                           </div>
                          )}
                          {p.stateTaxPaid > 0 && (
                           <div className="flex justify-between gap-6">
                             <span>• {stateOfResidence} State Tax:</span>
                             <span className="text-rose-300 text-right">-${p.stateTaxPaid.toLocaleString()}</span>
                           </div>
                          )}
                          {p.year401kContribution > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>• 401k/403b Contribution:</span>
                              <span className="text-rose-300 text-right">-${p.year401kContribution.toLocaleString()}</span>
                            </div>
                          )}
                          {p.yearEmployer401kMatch > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>• Employer 401k Match:</span>
                              <span className="text-emerald-400 text-right">+${p.yearEmployer401kMatch.toLocaleString()}</span>
                            </div>
                          )}
                          {p.yearRothContribution > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>• Roth IRA Contribution:</span>
                              <span className="text-rose-300 text-right">-${p.yearRothContribution.toLocaleString()}</span>
                            </div>
                          )}
                          {p.yearHSAContribution > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>• HSA Contribution:</span>
                              <span className="text-rose-300 text-right">-${p.yearHSAContribution.toLocaleString()}</span>
                            </div>
                          )}
                          <div className="flex justify-between gap-6">
                            <span>• Spending:</span>
                            <span className="text-rose-300 text-right">-${(p.yearSpending || 0).toLocaleString()}</span>
                          </div>
                          {p.goalFunding > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>• Goal Funding:</span>
                              <span className="text-rose-300 text-right">-${p.goalFunding.toLocaleString()}</span>
                            </div>
                          )}
                          {p.lifeEventExpense > 0 && (
                            <div className="flex justify-between gap-6">
                              <span>• Life Event Expense:</span>
                              <span className="text-rose-300 text-right">-${p.lifeEventExpense.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                        {(p.debtPayments > 0) && (
                          <div className="text-xs text-zinc-500 mb-2">
                            (Debt Payments: ${p.debtPayments.toLocaleString()} - tracked separately)
                          </div>
                        )}
                        <div className="pt-2 border-t border-zinc-700/40">
                          {p.netCashFlow > 0 ? (
                            <p className="font-semibold text-emerald-400 text-sm">
                              Net Savings: +${Math.abs(p.netCashFlow).toLocaleString()}
                            </p>
                          ) : (
                            <p className="font-semibold text-rose-400 text-sm">
                              Net Withdrawal from Portfolio: -${(p.totalWithdrawalAmount || 0).toLocaleString()}
                            </p>
                          )}
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
            })()}
            
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
                    const hadReleaseEvent = s.data?.liquidations?.some(l => l.type === 'release');
                    
                    return (
                      <div key={idx} className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50">
                        <p className="text-xs text-zinc-500 mb-1">{s.label}</p>
                        {/* Always show LTV percentage - it's the key metric */}
                        <p className={cn(
                          "text-lg font-bold",
                          anyLiquidated ? "text-rose-400" :
                          avgLtv < 40 ? "text-emerald-400" : 
                          avgLtv < 60 ? "text-amber-400" : 
                          "text-rose-400"
                        )}>
                          {avgLtv}% LTV
                          {anyLiquidated && <span className="text-xs ml-1">✗</span>}
                        </p>
                        {/* Show release/liquidation indicator separately */}
                        {(allReleased || hadReleaseEvent) && !anyLiquidated && (
                          <p className="text-[10px] text-purple-400 font-medium">✓ Collateral released</p>
                        )}
                        {anyLiquidated && (
                          <p className="text-[10px] text-rose-400 font-medium">Liquidation occurred</p>
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
                  {(() => {
                    const btcLoans = liabilities.filter(l => l.type === 'btc_collateralized');
                    if (btcLoans.length === 1) {
                      return `Loan compounds daily at ${btcLoans[0].interest_rate || 12.4}% APR. Your collateral adjusts automatically:`;
                    } else if (btcLoans.length > 1) {
                      const rates = btcLoans.map(l => l.interest_rate || 12.4);
                      const minRate = Math.min(...rates);
                      const maxRate = Math.max(...rates);
                      if (minRate === maxRate) {
                        return `Loans compound daily at ${minRate}% APR. Your collateral adjusts automatically:`;
                      }
                      return `Loans compound daily at ${minRate}-${maxRate}% APR. Your collateral adjusts automatically:`;
                    }
                    return `Loans compound daily. Your collateral adjusts automatically:`;
                  })()}
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-cyan-400">●</span>
                    <p><span className="text-cyan-400">LTV ≤ {btcReleaseTriggerLtv}%:</span> <span className="text-zinc-400">Excess collateral released (LTV → {btcReleaseTargetLtv}%)</span></p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400">●</span>
                    <p><span className="text-amber-400">LTV ≥ {btcTopUpTriggerLtv}%:</span> <span className="text-zinc-400">Auto top-up from liquid BTC (→ {btcTopUpTargetLtv}%)</span></p>
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

            {/* RMD Start Age Notice - only show if user has tax-deferred accounts */}
            {taxDeferredValue > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-sm text-blue-400 font-medium mb-1">
                  ℹ️ Required Minimum Distributions (RMDs)
                </p>
                <p className="text-sm text-zinc-300">
                  Based on your birth year ({currentYear - currentAge}), RMDs begin at age {(() => {
                    const birthYear = currentYear - currentAge;
                    return getRMDStartAge(birthYear);
                  })()}.
                  {(() => {
                    const birthYear = currentYear - currentAge;
                    const startAge = getRMDStartAge(birthYear);
                    if (birthYear <= 1950) return " (Born 1950 or earlier)";
                    if (birthYear <= 1959) return " (Born 1951-1959)";
                    return " (Born 1960+, SECURE Act 2.0)";
                  })()}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  RMDs are calculated from your total tax-deferred balance and are taxed as ordinary income. Excess RMDs (beyond spending needs) are reinvested in taxable accounts.
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
                    <SelectContent className="bg-zinc-900 border-zinc-700">
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
                  <Label className="text-zinc-400">Cost Basis Method</Label>
                  <Select value={costBasisMethod} onValueChange={setCostBasisMethod}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      <SelectItem value="FIFO">FIFO - First in, first out</SelectItem>
                      <SelectItem value="LIFO">LIFO - Last in, first out</SelectItem>
                      <SelectItem value="HIFO">HIFO - Highest cost first</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-500 mt-1">
                    {costBasisMethod === 'FIFO' && 'Sells oldest lots first'}
                    {costBasisMethod === 'LIFO' && 'Sells newest lots first'}
                    {costBasisMethod === 'HIFO' && 'Sells highest cost lots first'}
                  </p>
                </div>
                
                {/* Asset Withdrawal Strategy */}
                <div className="col-span-full mt-4 pt-4 border-t border-zinc-800">
                  <Label className="text-zinc-400 text-sm mb-3 block">Asset Withdrawal Strategy</Label>
                  <p className="text-xs text-zinc-500 mb-3">When selling assets to fund retirement spending, how should they be sold? (Cash is always used first before selling assets)</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: 'proportional', label: 'Proportional', desc: 'Sell all assets based on current allocation' },
                      { value: 'blended', label: 'Blended %', desc: 'Set exact percentage from each asset' },
                      { value: 'priority', label: 'Priority Order', desc: 'Sell in sequence until depleted' },
                    ].map(strategy => (
                      <div
                        key={strategy.value}
                        onClick={() => setAssetWithdrawalStrategy(strategy.value)}
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition-all",
                          assetWithdrawalStrategy === strategy.value
                            ? "bg-orange-500/20 border-orange-500/50 ring-1 ring-orange-500/30"
                            : "bg-zinc-800/30 border-zinc-700 hover:border-zinc-600"
                        )}
                      >
                        <span className={cn(
                          "font-medium text-sm",
                          assetWithdrawalStrategy === strategy.value ? "text-orange-400" : "text-zinc-300"
                        )}>
                          {strategy.label}
                        </span>
                        <p className="text-xs text-zinc-500 mt-1">{strategy.desc}</p>
                      </div>
                    ))}
                  </div>

                  {/* Blended % Editor */}
                  {assetWithdrawalStrategy === 'blended' && (
                    <div 
                      className="mt-4 p-4 rounded-lg bg-zinc-800/50 border border-zinc-700"
                      onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget)) {
                          const total = Object.values(withdrawalBlendPercentages).reduce((a, b) => a + b, 0);
                          if (total !== 100 && total > 0) {
                            const factor = 100 / total;
                            const keys = ['bonds', 'stocks', 'other', 'btc'];
                            const normalized = {};
                            let sum = 0;
                            keys.forEach((key, i) => {
                              if (i === keys.length - 1) {
                                normalized[key] = 100 - sum;
                              } else {
                                normalized[key] = Math.round((withdrawalBlendPercentages[key] || 0) * factor);
                                sum += normalized[key];
                              }
                            });
                            setWithdrawalBlendPercentages(normalized);
                          }
                        }
                      }}
                      tabIndex={-1}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <Label className="text-zinc-400 text-sm">Withdrawal Split</Label>
                        <span className={cn(
                          "text-sm font-medium",
                          Object.values(withdrawalBlendPercentages).reduce((a, b) => a + b, 0) === 100
                            ? "text-emerald-400"
                            : "text-amber-400"
                        )}>
                          {Object.values(withdrawalBlendPercentages).reduce((a, b) => a + b, 0)}%
                        </span>
                      </div>
                      <div className="space-y-3">
                        {[
                          { key: 'bonds', label: 'Bonds', color: 'text-purple-400' },
                          { key: 'stocks', label: 'Stocks', color: 'text-blue-400' },
                          { key: 'other', label: 'Other', color: 'text-zinc-400' },
                          { key: 'btc', label: 'Bitcoin', color: 'text-orange-400' },
                        ].map((asset) => (
                          <div key={asset.key} className="flex items-center gap-3">
                            <div className="w-14 text-sm text-zinc-400">{asset.label}</div>
                            <div className="flex-1">
                              <Slider
                                value={[withdrawalBlendPercentages[asset.key] || 0]}
                                onValueChange={([newValue]) => {
                                  setWithdrawalBlendPercentages(prev => ({
                                    ...prev,
                                    [asset.key]: newValue
                                  }));
                                }}
                                max={100}
                                min={0}
                                step={5}
                              />
                            </div>
                            <div className={cn("w-10 text-right font-medium text-sm", asset.color)}>
                              {withdrawalBlendPercentages[asset.key] || 0}%
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Visual bar */}
                      <div className="mt-4 h-2 rounded-full overflow-hidden flex bg-zinc-700">
                        {withdrawalBlendPercentages.bonds > 0 && (
                          <div className="bg-purple-500 h-full transition-all" style={{ width: `${Math.min(withdrawalBlendPercentages.bonds, 100)}%` }} />
                        )}
                        {withdrawalBlendPercentages.stocks > 0 && (
                          <div className="bg-blue-500 h-full transition-all" style={{ width: `${Math.min(withdrawalBlendPercentages.stocks, 100)}%` }} />
                        )}
                        {withdrawalBlendPercentages.other > 0 && (
                          <div className="bg-zinc-500 h-full transition-all" style={{ width: `${Math.min(withdrawalBlendPercentages.other, 100)}%` }} />
                        )}
                        {withdrawalBlendPercentages.btc > 0 && (
                          <div className="bg-orange-500 h-full transition-all" style={{ width: `${Math.min(withdrawalBlendPercentages.btc, 100)}%` }} />
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-2">Drag sliders to set split. Auto-balances to 100% when you click away.</p>
                    </div>
                  )}

                  {/* Priority Order Editor */}
                  {assetWithdrawalStrategy === 'priority' && (
                    <div className="mt-4 p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
                      <Label className="text-zinc-400 text-sm mb-3 block">Sell Order</Label>
                      <div className="flex flex-wrap gap-2">
                        {withdrawalPriorityOrder.filter(a => a !== 'cash').map((asset, index) => (
                          <div
                            key={asset}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700"
                          >
                            <span className="text-orange-400 font-bold text-sm">{index + 1}</span>
                            <span className="text-zinc-300 text-sm">{asset === 'btc' ? 'Bitcoin' : asset.charAt(0).toUpperCase() + asset.slice(1)}</span>
                            <div className="flex flex-col ml-2">
                              <button
                                onClick={() => {
                                  const filteredOrder = withdrawalPriorityOrder.filter(a => a !== 'cash');
                                  if (index > 0) {
                                    const newOrder = [...filteredOrder];
                                    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                                    setWithdrawalPriorityOrder(newOrder);
                                  }
                                }}
                                disabled={index === 0}
                                className="text-zinc-500 hover:text-orange-400 disabled:opacity-30"
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => {
                                  const filteredOrder = withdrawalPriorityOrder.filter(a => a !== 'cash');
                                  if (index < filteredOrder.length - 1) {
                                    const newOrder = [...filteredOrder];
                                    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
                                    setWithdrawalPriorityOrder(newOrder);
                                  }
                                }}
                                disabled={index === withdrawalPriorityOrder.filter(a => a !== 'cash').length - 1}
                                className="text-zinc-500 hover:text-orange-400 disabled:opacity-30"
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-zinc-500 mt-3">Cash is used first, then assets are sold in this order.</p>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Gross Income (Pre-Retirement)</Label>
                  <Input type="number" value={grossAnnualIncome} onChange={(e) => setGrossAnnualIncome(parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-800" />
                  <p className="text-xs text-zinc-500">Salary/wages used until retirement age</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Annual Spending (After Tax)</Label>
                  <Input type="number" value={currentAnnualSpending} onChange={(e) => setCurrentAnnualSpending(parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Target Retirement Spending</Label>
                  <Input type="number" value={retirementAnnualSpending} onChange={(e) => setRetirementAnnualSpending(parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-800" />
                  <p className="text-xs text-zinc-500">Annual spending goal in retirement</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Gross Income (In Retirement)</Label>
                  <Input 
                    type="number" 
                    value={otherRetirementIncome} 
                    onChange={(e) => setOtherRetirementIncome(parseFloat(e.target.value) || 0)} 
                    className="bg-zinc-900 border-zinc-800" 
                    placeholder="0"
                  />
                  <p className="text-xs text-zinc-500">Pension, part-time work, rental (excl. SS)</p>
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
                <p className="text-xs text-zinc-500 mb-4">These contributions continue annually until retirement age {retirementAge}</p>
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
                    {grossAnnualIncome === 0 && contribution401k > 0 && (
                      <p className="text-xs text-rose-400">
                        ⚠️ Cannot contribute without earned income
                      </p>
                    )}
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
                    {!rothIncomeEligible && contributionRothIRA > 0 && (
                      <p className="text-xs text-rose-400">
                        ⚠️ Income too high for Roth IRA (MAGI ${adjustedGrossIncome.toLocaleString()} ≥ ${rothIncomeLimit.phaseOutEnd.toLocaleString()})
                      </p>
                    )}
                    {rothInPhaseOut && contributionRothIRA > 0 && (
                      <p className="text-xs text-amber-400">
                        ⚠️ Roth contribution will be reduced (MAGI in phase-out range)
                      </p>
                    )}
                    {grossAnnualIncome === 0 && contributionRothIRA > 0 && (
                      <p className="text-xs text-rose-400">
                        ⚠️ Cannot contribute without earned income
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Traditional IRA Contribution</Label>
                    <Input 
                      type="number" 
                      value={contributionTraditionalIRA} 
                      onChange={(e) => setContributionTraditionalIRA(parseFloat(e.target.value) || 0)} 
                      className="bg-zinc-900 border-zinc-800" 
                    />
                    <p className={cn(
                      "text-xs",
                      contributionTraditionalIRA > currentLimitTraditionalIRA ? "text-amber-400" : "text-zinc-500"
                    )}>
                      {currentYear} limit: ${currentLimitTraditionalIRA.toLocaleString()} {currentAge >= 50 ? "(with catch-up)" : `(${(currentLimitTraditionalIRA + 1000).toLocaleString()} if 50+)`}
                      {contributionTraditionalIRA > currentLimitTraditionalIRA && " ⚠️ Exceeds limit"}
                    </p>
                    {grossAnnualIncome === 0 && contributionTraditionalIRA > 0 && (
                      <p className="text-xs text-rose-400">
                        ⚠️ Cannot contribute without earned income
                      </p>
                    )}
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
                    {grossAnnualIncome === 0 && contributionHSA > 0 && (
                      <p className="text-xs text-rose-400">
                        ⚠️ Cannot contribute without earned income
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">HSA Coverage Type</Label>
                    <Select value={hsaFamilyCoverage ? "family" : "individual"} onValueChange={(v) => setHsaFamilyCoverage(v === "family")}>
                      <SelectTrigger className="bg-zinc-900 border-zinc-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
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
                          onChange={(e) => {
                            const newValue = parseFloat(e.target.value) || 0;
                            setSocialSecurityAmount(newValue);
                            // Automatically ensure custom mode is active when typing
                            if (!useCustomSocialSecurity) {
                              setUseCustomSocialSecurity(true);
                            }
                          }}
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
                        onBlur={(e) => {
                          const val = parseInt(e.target.value) || 67;
                          setSocialSecurityStartAge(Math.min(70, Math.max(62, val)));
                        }}
                        className="bg-zinc-900 border-zinc-800"
                        min={62}
                        max={70}
                      />
                      <p className="text-xs text-zinc-500">
                        62 (earliest) to 70 (max). Full benefit at {(() => {
                          const birthYear = new Date().getFullYear() - currentAge;
                          return birthYear >= 1960 ? 67 : 66;
                        })()}.
                      </p>
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
                    // Use the actual projection data for Year 0 to ensure consistency
                    const currentYearProjection = projections[0];
                    const isCurrentlyRetired = currentAge >= retirementAge;
                    
                    // If currently retired, show retirement cash flow
                    if (isCurrentlyRetired) {
                      const currentSS = currentAge >= socialSecurityStartAge ? effectiveSocialSecurity : 0;
                      const totalRetirementIncomeGross = otherRetirementIncome + currentSS;
                      const retirementIncomeTax = currentYearProjection?.taxesPaid || 0;
                      const retirementCashFlow = totalRetirementIncomeGross - retirementAnnualSpending - retirementIncomeTax;
                      
                      return (
                        <div className="space-y-2 text-sm">
                          <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 mb-3">
                            <p className="text-xs text-purple-400 font-medium">You are currently in retirement</p>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Retirement Income:</span>
                            <span className="text-zinc-200">{formatNumber(otherRetirementIncome)}</span>
                          </div>
                          {currentSS > 0 && (
                            <div className="flex justify-between">
                              <span className="text-zinc-400">Social Security:</span>
                              <span className="text-emerald-400">+{formatNumber(currentSS)}</span>
                            </div>
                          )}
                          {currentAge < socialSecurityStartAge && effectiveSocialSecurity > 0 && (
                            <div className="flex justify-between">
                              <span className="text-zinc-500">Social Security (starts age {socialSecurityStartAge}):</span>
                              <span className="text-zinc-500">{formatNumber(effectiveSocialSecurity)}</span>
                            </div>
                          )}
                          {retirementIncomeTax > 0 && (
                            <div className="flex justify-between">
                              <span className="text-zinc-400">Est. Taxes (on income):</span>
                              <span className="text-rose-300">-{formatNumber(retirementIncomeTax)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Retirement Spending:</span>
                            <span className="text-zinc-200">-{formatNumber(retirementAnnualSpending)}</span>
                          </div>
                          <div className="flex justify-between border-t border-zinc-700 pt-2">
                            <span className="text-zinc-300 font-medium">Net from Income:</span>
                            <span className={cn("font-semibold", retirementCashFlow >= 0 ? "text-emerald-400" : "text-rose-400")}>
                              {retirementCashFlow >= 0 ? '+' : ''}{formatNumber(retirementCashFlow)}
                            </span>
                          </div>
                          {retirementCashFlow < 0 && (
                            <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                              <p className="text-xs text-amber-400">
                                Shortfall of {formatNumber(Math.abs(retirementCashFlow))}/yr will be withdrawn from portfolio.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    }
                    
                    // Pre-retirement - use projection data for accuracy
                    // The projection already accounts for pro-rata factors and all calculations
                    if (currentYearProjection) {
                      const projGrossIncome = currentYearProjection.yearGrossIncome || 0;
                      const projTaxes = currentYearProjection.taxesPaid || 0;
                      const projSpending = currentYearProjection.yearSpending || 0;
                      const projNetCashFlow = currentYearProjection.netCashFlow || 0;
                      
                      return (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Gross Income:</span>
                            <span className="text-emerald-400">{formatNumber(projGrossIncome)}</span>
                          </div>
                          {currentYearProjection.federalTaxPaid > 0 && (
                            <div className="flex justify-between">
                              <span className="text-zinc-400">Federal Tax:</span>
                              <span className="text-rose-300">-{formatNumber(currentYearProjection.federalTaxPaid)}</span>
                            </div>
                          )}
                          {currentYearProjection.stateTaxPaid > 0 && (
                            <div className="flex justify-between">
                              <span className="text-zinc-400">{stateOfResidence} State Tax:</span>
                              <span className="text-rose-300">-{formatNumber(currentYearProjection.stateTaxPaid)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Spending:</span>
                            <span className="text-zinc-200">-{formatNumber(projSpending)}</span>
                          </div>
                          {currentYearProjection.goalFunding > 0 && (
                            <div className="flex justify-between">
                              <span className="text-zinc-400">Goal Funding:</span>
                              <span className="text-rose-300">-{formatNumber(currentYearProjection.goalFunding)}</span>
                            </div>
                          )}
                          <div className="flex justify-between border-t border-zinc-700 pt-2">
                            <span className="text-zinc-300 font-medium">Net Savings:</span>
                            <span className={cn("font-semibold", projNetCashFlow >= 0 ? "text-emerald-400" : "text-rose-400")}>
                              {projNetCashFlow >= 0 ? '+' : ''}{formatNumber(projNetCashFlow)}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    
                    // Fallback if no projection data
                    const cashFlowBeforeSavings = netIncome - currentAnnualSpending;
                    const hasRetirementContributions = actualRoth > 0;

                    if (cashFlowBeforeSavings >= 0) {
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
                  💡 Pre-tax contributions (401k: {formatNumber(actual401k)}, Traditional IRA: {formatNumber(actualTraditionalIRA)}, HSA: {formatNumber(actualHSA)}) reduce your taxable income. 
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
                <div className="flex items-center gap-1">
                  <p className="text-sm text-zinc-400">Projected Max Spending at Retirement</p>
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help text-zinc-500 hover:text-zinc-300">
                          <Info className="w-3.5 h-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[280px] bg-zinc-800 border-zinc-700 text-zinc-200 text-sm p-3">
                        <p>The maximum annual spending (in today's dollars) your plan can sustain from retirement through age {lifeExpectancy}, assuming your projected returns are achieved. See Monte Carlo tab for conservative estimates that account for market volatility.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-2xl font-bold text-emerald-400">{formatNumber(maxSustainableSpending)}/yr</p>
                <p className="text-xs text-zinc-500">{formatNumber(maxSustainableSpending / 12)}/mo (today's $) • See Monte Carlo for risk-adjusted</p>
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
                   btcReturnModel === 'powerlaw' ? `Power Law (${powerLawYear1CAGR.toFixed(0)}%→${powerLawYear10CAGR.toFixed(0)}%)` : 'Custom'}
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
                  Plan Confidence Score
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help text-zinc-500 hover:text-zinc-300 inline-flex">
                          <Info className="w-4 h-4" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[300px] bg-zinc-800 border-zinc-700 text-zinc-200 text-sm p-3">
                        <p>We simulate 1,000 different market futures, some with strong returns, some with crashes, to see how often your plan succeeds.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </h3>
                <p className="text-sm text-zinc-500 mt-1">1,000 market scenarios reflecting Bitcoin's volatility patterns</p>
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
                  <p className="text-sm text-zinc-300 mb-1">
                    Plan Success Rate
                  </p>
                  <p className="text-xs text-zinc-500 mb-2">
                    Through Age {lifeExpectancy}
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
                    Target Spending: ${Math.round(inflationAdjustedRetirementSpending || 0).toLocaleString()}/yr • {btcReturnModel === 'custom' ? `${btcCagr || 25}%` : btcReturnModel === 'powerlaw' ? `Power Law (${powerLawYear1CAGR.toFixed(0)}%→${powerLawYear10CAGR.toFixed(0)}%)` : btcReturnModel} BTC • BTC Vol: {getBtcVolatilityForMonteCarlo(0).toFixed(0)}%→{getBtcVolatilityForMonteCarlo(30).toFixed(0)}%
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
                        <RechartsTooltip
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

                {/* 90% Safe Spending Section */}
                <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-medium text-zinc-300">90% Safe Spending at Retirement</h4>
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help text-zinc-500 hover:text-zinc-300">
                            <Info className="w-4 h-4" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[300px] bg-zinc-800 border-zinc-700 text-zinc-200 text-sm p-3">
                          <p>The maximum annual spending (in today's dollars) where your plan succeeds in at least 90% of simulated market scenarios. Based on 1,000 market scenarios reflecting Bitcoin's volatility patterns.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-3xl font-bold text-emerald-400">
                    {safeSpending90 ? `${formatNumber(safeSpending90)}/yr` : 'Calculating...'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-2">
                    Based on 1,000 market scenarios reflecting Bitcoin's volatility patterns
                  </p>
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

      {/* Custom Periods Modal */}
      <CustomPeriodsModal
        open={showCustomPeriodsModal}
        onOpenChange={setShowCustomPeriodsModal}
        customReturnPeriods={customReturnPeriods}
        onSave={setCustomReturnPeriods}
        currentAge={currentAge}
        lifeExpectancy={lifeExpectancy}
        holdings={holdings}
        tickerReturns={tickerReturns}
        onTickerReturnsSave={setTickerReturns}
      />

    </div>
  );
}