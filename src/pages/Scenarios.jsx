import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { runUnifiedProjection } from '@/components/shared/runProjection';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Area, ComposedChart } from 'recharts';
import { Plus, Pencil, Trash2, Target, TrendingUp, TrendingDown, ArrowRight, RefreshCw, ChevronDown, ChevronUp, Sparkles, DollarSign, Calendar, MapPin, PiggyBank, Loader2, Play, Settings2 } from 'lucide-react';
import { getPowerLawCAGR } from '@/components/shared/bitcoinPowerLaw';
import { 
  createSeededRNG, 
  generateMonteCarloSeed, 
  generateRandomPaths,
  regenerateReturnsForParams,
  getBtcVolatilityForMonteCarlo,
  MONTE_CARLO_VERSION 
} from '../components/shared/monteCarloSimulation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useBtcPrice } from '@/components/shared/useBtcPrice';
import CustomPeriodsModal from '@/components/retirement/CustomPeriodsModal';
import { 
  calculateComprehensiveAnnualSavings, 
  deriveEffectiveSocialSecurity, 
  createBtcGrowthRateFunction,
  getTaxTreatmentFromHolding as sharedGetTaxTreatment
} from '@/components/shared/projectionHelpers';

// CollapsibleSection component for organizing metrics
const CollapsibleSection = ({ title, defaultOpen = true, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="mb-2 rounded-xl border border-zinc-800/50 bg-zinc-900/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full py-3 px-4 hover:bg-zinc-800/70 rounded-t-xl text-left transition-colors duration-200"
      >
        <span className="text-sm font-semibold text-zinc-300">{title}</span>
        <span className="text-zinc-400">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </span>
      </button>
      {isOpen && <div className="p-4 pt-0">{children}</div>}
    </div>
  );
};

// CollapsibleFormSection component for modal form sections
const CollapsibleFormSection = ({ title, defaultOpen = false, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full py-3 px-4 bg-zinc-800/50 hover:bg-zinc-800 text-left"
      >
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
        <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
};

// Helper to get BTC quantity and value at a specific age
function getBtcAtAge(projectionResults, targetAge, startAge) {
  if (!projectionResults) return { quantity: null, value: null, depleted: true };
  const yearIndex = targetAge - startAge;
  if (yearIndex < 0 || yearIndex >= projectionResults.length) {
    return { quantity: null, value: null, depleted: true };
  }
  const yearData = projectionResults[yearIndex];
  if (!yearData || yearData.total <= 0) {
    return { quantity: 0, value: 0, depleted: true };
  }
  const btcPrice = yearData.btcPrice || 97000;
  const btcLiquidQty = (yearData.btcLiquid || 0) / btcPrice;
  const btcEncumberedQty = (yearData.btcEncumbered || 0) / btcPrice;
  const btcQuantity = btcLiquidQty + btcEncumberedQty;
  const btcValue = (yearData.btcLiquid || 0) + (yearData.btcEncumbered || 0);
  return { quantity: btcQuantity, value: btcValue, depleted: false };
}

// Helper for liquidation risk display with proper coloring
function getLiquidationRiskDisplay(riskPercent) {
  if (riskPercent === null || riskPercent === undefined) {
    return { label: "N/A", color: "text-zinc-500" };
  }
  const roundedRisk = riskPercent.toFixed(0);
  if (riskPercent <= 10) {
    return { label: `Low (${roundedRisk}%)`, color: "text-emerald-400" };
  } else if (riskPercent <= 25) {
    return { label: `Moderate (${roundedRisk}%)`, color: "text-amber-400" };
  } else if (riskPercent <= 50) {
    return { label: `Elevated (${roundedRisk}%)`, color: "text-orange-400" };
  } else {
    return { label: `High (${roundedRisk}%)`, color: "text-rose-400" };
  }
}

// State list for state comparison feature
const US_STATES = [
  { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' }, { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' }, { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' }, { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' }, { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' }, { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' }, { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' }, { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' }, { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' }, { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' }, { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' }, { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' }, { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' }, { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' }, { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' }, { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' }, { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' }, { value: 'DC', label: 'Washington DC' }
];

export default function Scenarios() {
  const { btcPrice, loading: priceLoading } = useBtcPrice();
  const [selectedScenarioId, setSelectedScenarioId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingScenario, setEditingScenario] = useState(null);
  const [showChart, setShowChart] = useState(true);
  const [monteCarloRunning, setMonteCarloRunning] = useState(false);
  const [baselineMonteCarloResults, setBaselineMonteCarloResults] = useState(null);
  const [scenarioMonteCarloResults, setScenarioMonteCarloResults] = useState(null);
  const queryClient = useQueryClient();

  // Form state for creating/editing scenarios
  const [form, setForm] = useState({
    name: '',
    description: '',
    retirement_age_override: '',
    life_expectancy_override: '',
    annual_retirement_spending_override: '',
    state_override: '',
    btc_cagr_override: '',
    stocks_cagr_override: '',
    bonds_cagr_override: '',
    real_estate_cagr_override: '',
    cash_cagr_override: '',
    inflation_override: '',
    income_growth_override: '',
    social_security_start_age_override: '',
    social_security_amount_override: '',
    savings_allocation_btc_override: '',
    savings_allocation_stocks_override: '',
    savings_allocation_bonds_override: '',
    savings_allocation_cash_override: '',
    savings_allocation_other_override: '',
    btc_return_model_override: '',
    custom_return_periods_override: {},
    ticker_returns_override: {},
    gross_annual_income_override: '',
    current_annual_spending_override: '',
    dividend_income_override: '',
    dividend_income_qualified: true,
    one_time_events: [],
    asset_reallocations: [],
    hypothetical_btc_loan: { enabled: false, loan_amount: '', interest_rate: '', collateral_btc: '', ltv: '' }
  });

  // State for Custom Periods Modal
  const [customPeriodsModalOpen, setCustomPeriodsModalOpen] = useState(false);

  // Array handlers for one-time events
  const addOneTimeEvent = () => {
    setForm({
      ...form,
      one_time_events: [...(form.one_time_events || []), { 
        id: Date.now().toString(), 
        year: '', 
        amount: '', 
        description: '', 
        event_type: 'windfall' 
      }]
    });
  };

  const removeOneTimeEvent = (id) => {
    setForm({
      ...form,
      one_time_events: (form.one_time_events || []).filter(e => e.id !== id)
    });
  };

  const updateOneTimeEvent = (id, field, value) => {
    setForm({
      ...form,
      one_time_events: (form.one_time_events || []).map(e => 
        e.id === id ? { ...e, [field]: value } : e
      )
    });
  };

  // Array handlers for asset reallocations
  const addAssetReallocation = () => {
    setForm({
      ...form,
      asset_reallocations: [...(form.asset_reallocations || []), {
        id: Date.now().toString(),
        sell_holding_id: '',
        sell_amount: '',
        execution_year: '',
        buy_asset_name: '',
        buy_asset_type: 'stocks',
        buy_cagr: '',
        buy_dividend_yield: '',
        buy_dividend_qualified: true
      }]
    });
  };

  const removeAssetReallocation = (id) => {
    setForm({
      ...form,
      asset_reallocations: (form.asset_reallocations || []).filter(r => r.id !== id)
    });
  };

  const updateAssetReallocation = (id, field, value) => {
    setForm({
      ...form,
      asset_reallocations: (form.asset_reallocations || []).map(r =>
        r.id === id ? { ...r, [field]: value } : r
      )
    });
  };

  const currentPrice = btcPrice || 97000;

  // Load all data entities - SAME as FinancialPlan.jsx
  const { data: holdings = [], isLoading: holdingsLoading } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: liabilities = [], isLoading: liabilitiesLoading } = useQuery({
    queryKey: ['liabilities'],
    queryFn: () => base44.entities.Liability.list(),
    staleTime: 5 * 60 * 1000,
  });

  // Derive BTC-backed loans from Liability entity (type='btc_collateralized')
  const btcCollateralizedLoans = useMemo(() => {
    if (!liabilities) return [];
    return liabilities
      .filter(l => l.type === 'btc_collateralized')
      .map(l => ({
        id: l.id,
        loan_name: l.name,
        current_balance: l.current_balance || 0,
        collateral_btc_amount: l.collateral_btc_amount || 0,
        liquidation_ltv: l.liquidation_ltv || 80,
        margin_call_ltv: l.margin_call_ltv || 70,
        interest_rate: l.interest_rate || 12.4,
        collateral_release_ltv: l.collateral_release_ltv || 30,
      }));
  }, [liabilities]);

  const { data: goals = [], isLoading: goalsLoading } = useQuery({
    queryKey: ['goals'],
    queryFn: () => base44.entities.FinancialGoal.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: lifeEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['lifeEvents'],
    queryFn: () => base44.entities.LifeEvent.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: userSettings = [], isLoading: settingsLoading } = useQuery({
    queryKey: ['userSettings'],
    queryFn: () => base44.entities.UserSettings.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: scenarios = [], isLoading: scenariosLoading } = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => base44.entities.Scenario.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: budgetItems = [] } = useQuery({
    queryKey: ['budgetItems'],
    queryFn: () => base44.entities.BudgetItem.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.filter({ type: 'buy' }),
    staleTime: 5 * 60 * 1000,
  });

  // Filter for active tax lots (buys with remaining quantity)
  const activeTaxLots = useMemo(() => {
    return (transactions || []).filter(t => 
      t.type === 'buy' && 
      (t.remaining_quantity ?? t.quantity) > 0
    );
  }, [transactions]);

  const isLoading = holdingsLoading || accountsLoading || liabilitiesLoading || goalsLoading || eventsLoading || settingsLoading || scenariosLoading || priceLoading;

  const settings = userSettings[0] || {};

  // Build projection parameters from settings - creates the baseline params object
  // Uses shared helpers for EXACT consistency with FinancialPlan.jsx
  const buildProjectionParams = (overrides = {}) => {
    const effectiveSettings = { ...settings, ...overrides };
    
    const retirementAge = effectiveSettings.retirement_age_override || effectiveSettings.retirement_age || 65;
    const currentAge = effectiveSettings.current_age || 35;
    const lifeExpectancy = effectiveSettings.life_expectancy_override || effectiveSettings.life_expectancy || 90;
    const retirementSpending = effectiveSettings.annual_retirement_spending_override || effectiveSettings.annual_retirement_spending || 100000;
    const stateOfResidence = effectiveSettings.state_override || effectiveSettings.state_of_residence || 'TX';
    const btcCagr = effectiveSettings.btc_cagr_override ?? effectiveSettings.btc_cagr_assumption ?? 25;
    const stocksCagr = effectiveSettings.stocks_cagr_override ?? effectiveSettings.stocks_cagr ?? 7;
    const bondsCagr = effectiveSettings.bonds_cagr_override ?? effectiveSettings.bonds_cagr ?? 3;
    const realEstateCagr = effectiveSettings.real_estate_cagr_override ?? effectiveSettings.real_estate_cagr ?? 4;
    const cashCagr = effectiveSettings.cash_cagr_override ?? effectiveSettings.cash_cagr ?? 0;
    const otherCagr = effectiveSettings.other_cagr_override ?? effectiveSettings.other_cagr ?? 7;
    const inflationRate = effectiveSettings.inflation_override ?? effectiveSettings.inflation_rate ?? 3;
    const incomeGrowth = effectiveSettings.income_growth_override ?? effectiveSettings.income_growth_rate ?? 3;
    const ssStartAge = effectiveSettings.social_security_start_age_override || effectiveSettings.social_security_start_age || 67;
    const ssAmount = effectiveSettings.social_security_amount_override ?? effectiveSettings.social_security_amount ?? 0;
    const btcReturnModel = effectiveSettings.btc_return_model_override || effectiveSettings.btc_return_model || 'custom';
    const useCustomSocialSecurity = effectiveSettings.use_custom_social_security ?? false;
    
    const savingsAllocationBtc = effectiveSettings.savings_allocation_btc_override ?? effectiveSettings.savings_allocation_btc ?? 80;
    const savingsAllocationStocks = effectiveSettings.savings_allocation_stocks_override ?? effectiveSettings.savings_allocation_stocks ?? 20;
    const savingsAllocationBonds = effectiveSettings.savings_allocation_bonds_override ?? effectiveSettings.savings_allocation_bonds ?? 0;
    const savingsAllocationCash = effectiveSettings.savings_allocation_cash_override ?? effectiveSettings.savings_allocation_cash ?? 0;
    const savingsAllocationOther = effectiveSettings.savings_allocation_other_override ?? effectiveSettings.savings_allocation_other ?? 0;

    // Use shared helper for comprehensive annual savings (EXACT match with FinancialPlan.jsx)
    const grossAnnualIncome = effectiveSettings.gross_annual_income_override ?? effectiveSettings.gross_annual_income ?? 100000;
    const currentAnnualSpending = effectiveSettings.current_annual_spending_override ?? effectiveSettings.current_annual_spending ?? 80000;
    const filingStatus = effectiveSettings.filing_status || 'single';
    const contribution401k = effectiveSettings.contribution_401k ?? 0;
    const employer401kMatch = effectiveSettings.employer_401k_match ?? 0;
    const contributionRothIRA = effectiveSettings.contribution_roth_ira ?? 0;
    const contributionTraditionalIRA = effectiveSettings.contribution_traditional_ira ?? 0;
    const contributionHSA = effectiveSettings.contribution_hsa ?? 0;
    const hsaFamilyCoverage = effectiveSettings.hsa_family_coverage || false;

    // Dividend income parameters
    const dividendIncome = effectiveSettings.dividend_income_override ?? 0;
    const dividendIncomeQualified = effectiveSettings.dividend_income_qualified ?? true;

    // Process one-time events from scenario into lifeEvents format
    const scenarioOneTimeEvents = (effectiveSettings.one_time_events || []).map(event => ({
      id: `scenario_event_${event.id}`,
      name: event.description || `${event.event_type} at age ${event.year}`,
      event_type: event.amount >= 0 ? 'income_change' : 'expense_change',
      year: parseInt(event.year) || currentAge,
      amount: Math.abs(parseFloat(event.amount) || 0),
      is_recurring: false,
      affects: event.amount >= 0 ? 'income' : 'expenses',
      _isOneTime: true,
      _originalAmount: parseFloat(event.amount) || 0
    }));

    // Combine with existing life events
    const combinedLifeEvents = [...(lifeEvents || []), ...scenarioOneTimeEvents];

    // Process hypothetical BTC loan
    let scenarioLiabilities = [...(liabilities || [])];
    let scenarioCollateralizedLoans = [...(btcCollateralizedLoans || [])];

    // Note: hypothetical_btc_loan is passed directly to runUnifiedProjection
    // which handles it with proper start_age logic. Do NOT add it to liabilities arrays here.

    // Asset reallocations for future processing
    const assetReallocations = effectiveSettings.asset_reallocations || [];

    const savingsResult = calculateComprehensiveAnnualSavings({
      grossAnnualIncome,
      currentAnnualSpending,
      filingStatus,
      contribution401k,
      employer401kMatch,
      contributionRothIRA,
      contributionTraditionalIRA,
      contributionHSA,
      hsaFamilyCoverage,
      currentAge,
    });

    // Use shared helper for effective Social Security (EXACT match with FinancialPlan.jsx)
    const effectiveSocialSecurity = deriveEffectiveSocialSecurity({
      grossAnnualIncome,
      socialSecurityStartAge: ssStartAge,
      socialSecurityAmount: ssAmount,
      useCustomSocialSecurity,
      currentAge,
    });

    // Use shared helper for BTC growth rate function (EXACT match with FinancialPlan.jsx)
    // Scenario custom_return_periods_override takes precedence over global settings
    const effectiveCustomReturnPeriods = effectiveSettings.custom_return_periods_override || effectiveSettings.custom_return_periods || {};
    const getBtcGrowthRate = createBtcGrowthRateFunction(
      btcReturnModel, 
      btcCagr, 
      effectiveCustomReturnPeriods
    );

    return {
      holdings,
      accounts,
      liabilities: scenarioLiabilities,
      collateralizedLoans: scenarioCollateralizedLoans,
      currentPrice,
      currentAge,
      retirementAge,
      lifeExpectancy,
      retirementAnnualSpending: retirementSpending,
      effectiveSocialSecurity,
      socialSecurityStartAge: ssStartAge,
      otherRetirementIncome: (effectiveSettings.other_retirement_income || 0) + dividendIncome,
      annualSavings: savingsResult.annualSavings,
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
      effectiveInflation: inflationRate,
      effectiveStocksCagr: stocksCagr,
      bondsCagr,
      realEstateCagr,
      cashCagr,
      otherCagr,
      savingsAllocationBtc,
      savingsAllocationStocks,
      savingsAllocationBonds,
      savingsAllocationCash,
      savingsAllocationOther,
      autoTopUpBtcCollateral: effectiveSettings.auto_top_up_btc_collateral ?? true,
      btcTopUpTriggerLtv: effectiveSettings.btc_top_up_trigger_ltv || 70,
      btcTopUpTargetLtv: effectiveSettings.btc_top_up_target_ltv || 50,
      btcReleaseTriggerLtv: effectiveSettings.btc_release_trigger_ltv || 30,
      btcReleaseTargetLtv: effectiveSettings.btc_release_target_ltv || 40,
      goals: goals || [],
      lifeEvents: combinedLifeEvents,
      getTaxTreatmentFromHolding: (holding) => sharedGetTaxTreatment(holding, accounts),
      customReturnPeriods: effectiveSettings.custom_return_periods_override || effectiveSettings.custom_return_periods || {},
      tickerReturns: effectiveSettings.ticker_returns_override || effectiveSettings.ticker_returns || {},
      dividendIncomeQualified,
      assetReallocations,
      hypothetical_btc_loan: effectiveSettings.hypothetical_btc_loan || null,
      // Tax lots for lot-level cost basis tracking
      taxLots: activeTaxLots,
      // Withdrawal strategy parameters from user settings
      assetWithdrawalStrategy: effectiveSettings.asset_withdrawal_strategy || 'proportional',
      withdrawalPriorityOrder: effectiveSettings.withdrawal_priority_order || ['cash', 'bonds', 'stocks', 'other', 'btc'],
      withdrawalBlendPercentages: effectiveSettings.withdrawal_blend_percentages || { cash: 0, bonds: 25, stocks: 35, other: 10, btc: 30 },
      costBasisMethod: effectiveSettings.cost_basis_method || 'HIFO',
    };
  };

  // Run baseline projection
  const baselineProjection = useMemo(() => {
    if (!holdings.length || !accounts.length || !userSettings.length || !currentPrice) return null;
    try {
      const params = buildProjectionParams();
      return runUnifiedProjection(params);
    } catch (error) {
      console.error('Baseline projection error:', error);
      return null;
    }
  }, [holdings, accounts, liabilities, btcCollateralizedLoans, goals, lifeEvents, userSettings, budgetItems, currentPrice]);

  // Run scenario projection
  const selectedScenario = scenarios.find(s => s.id === selectedScenarioId);
  
  const scenarioProjection = useMemo(() => {
    if (!selectedScenario || !holdings.length || !accounts.length || !userSettings.length || !currentPrice) return null;
    try {
      const overrides = {
        // Existing fields
        retirement_age_override: selectedScenario.retirement_age_override,
        life_expectancy_override: selectedScenario.life_expectancy_override,
        annual_retirement_spending_override: selectedScenario.annual_retirement_spending_override,
        state_override: selectedScenario.state_override,
        btc_cagr_override: selectedScenario.btc_cagr_override,
        stocks_cagr_override: selectedScenario.stocks_cagr_override,
        bonds_cagr_override: selectedScenario.bonds_cagr_override,
        real_estate_cagr_override: selectedScenario.real_estate_cagr_override,
        cash_cagr_override: selectedScenario.cash_cagr_override,
        inflation_override: selectedScenario.inflation_override,
        income_growth_override: selectedScenario.income_growth_override,
        social_security_start_age_override: selectedScenario.social_security_start_age_override,
        social_security_amount_override: selectedScenario.social_security_amount_override,
        savings_allocation_btc_override: selectedScenario.savings_allocation_btc_override,
        savings_allocation_stocks_override: selectedScenario.savings_allocation_stocks_override,
        savings_allocation_bonds_override: selectedScenario.savings_allocation_bonds_override,
        savings_allocation_cash_override: selectedScenario.savings_allocation_cash_override,
        savings_allocation_other_override: selectedScenario.savings_allocation_other_override,
        // New fields
        btc_return_model_override: selectedScenario.btc_return_model_override,
        custom_return_periods_override: selectedScenario.custom_return_periods_override,
        ticker_returns_override: selectedScenario.ticker_returns_override,
        gross_annual_income_override: selectedScenario.gross_annual_income_override,
        current_annual_spending_override: selectedScenario.current_annual_spending_override,
        dividend_income_override: selectedScenario.dividend_income_override,
        dividend_income_qualified: selectedScenario.dividend_income_qualified,
        one_time_events: selectedScenario.one_time_events,
        asset_reallocations: selectedScenario.asset_reallocations,
        hypothetical_btc_loan: selectedScenario.hypothetical_btc_loan,
      };
      const params = buildProjectionParams(overrides);
      return runUnifiedProjection(params);
    } catch (error) {
      console.error('Scenario projection error:', error);
      return null;
    }
  }, [selectedScenario, holdings, accounts, liabilities, btcCollateralizedLoans, goals, lifeEvents, userSettings, budgetItems, currentPrice]);

  // Calculate max drawdown BTC can survive without liquidation
  const calculateMaxDrawdownSurvived = useCallback(() => {
    if (!btcCollateralizedLoans || btcCollateralizedLoans.length === 0) {
      return null; // No BTC loans
    }

    // Find the loan with highest LTV (most at risk)
    let worstDrawdown = 100; // Start with best case
    
    for (const loan of btcCollateralizedLoans) {
      if (!loan.collateral_btc_amount || loan.collateral_btc_amount <= 0) continue;
      
      const collateralValue = loan.collateral_btc_amount * currentPrice;
      const currentLTV = (loan.current_balance / collateralValue) * 100;
      const liquidationLTV = loan.liquidation_ltv || 80;
      
      // Max drawdown = 1 - (currentLTV / liquidationLTV)
      // If LTV is 50% and liquidation is 80%, we can survive a 37.5% drop
      const maxDrawdown = (1 - (currentLTV / liquidationLTV)) * 100;
      
      if (maxDrawdown < worstDrawdown) {
        worstDrawdown = maxDrawdown;
      }
    }
    
    return worstDrawdown;
  }, [btcCollateralizedLoans, currentPrice]);

  // Extract metrics from projection
  const extractMetrics = (projection, retirementAge) => {
    if (!projection || !projection.yearByYear) return null;
    
    const yearByYear = projection.yearByYear;
    const retirementYear = yearByYear.find(y => y.age === retirementAge);
    const finalYear = yearByYear[yearByYear.length - 1];
    
    const lifetimeTaxes = yearByYear.reduce((sum, y) => sum + (y.taxesPaid || 0), 0);
    
    // Calculate Net Worth = Total Assets - Total Debt
    const retirementNetWorth = (retirementYear?.total || 0) - (retirementYear?.totalDebt || 0);
    const finalNetWorth = (finalYear?.total || 0) - (finalYear?.totalDebt || 0);
    
    return {
      survives: projection.survives,
      depleteAge: projection.depleteAge,
      portfolioAtRetirement: retirementNetWorth,
      finalNetWorth: finalNetWorth,
      lifetimeTaxes,
      btcAtRetirement: retirementYear?.liquidBtc || 0,
      btcAtEnd: finalYear?.liquidBtc || 0,
      // Also include gross values for reference
      totalAssetsAtRetirement: retirementYear?.total || 0,
      totalDebtAtRetirement: retirementYear?.totalDebt || 0,
    };
  };

  const maxDrawdownSurvived = calculateMaxDrawdownSurvived();

  const baselineRetirementAge = settings.retirement_age || 65;
  const scenarioRetirementAge = selectedScenario?.retirement_age_override || baselineRetirementAge;
  
  const baselineMetrics = extractMetrics(baselineProjection, baselineRetirementAge);
  const scenarioMetrics = extractMetrics(scenarioProjection, scenarioRetirementAge);

  // Calculate BTC milestones based on retirement status
  const currentAge = settings.current_age || 35;
  const lifeExpectancy = settings.life_expectancy || 90;
  const isCurrentlyRetired = currentAge >= baselineRetirementAge;
  
  let btcMilestones = [];
  if (isCurrentlyRetired) {
    btcMilestones = [
      { age: currentAge, label: "BTC Now" },
      { age: Math.min(currentAge + 10, lifeExpectancy), label: "BTC in 10 Years" },
      { age: Math.min(currentAge + 20, lifeExpectancy), label: "BTC in 20 Years" },
      { age: lifeExpectancy, label: "BTC at Life Expectancy" }
    ];
  } else {
    btcMilestones = [
      { age: baselineRetirementAge, label: "BTC at Retirement" },
      { age: Math.min(baselineRetirementAge + 10, lifeExpectancy), label: "BTC at Ret. +10 Yrs" },
      { age: Math.min(baselineRetirementAge + 20, lifeExpectancy), label: "BTC at Ret. +20 Yrs" },
      { age: lifeExpectancy, label: "BTC at Life Expectancy" }
    ];
  }
  // Remove duplicates
  btcMilestones = btcMilestones.filter((m, i, arr) => i === 0 || m.age !== arr[i - 1].age);

  // Monte Carlo functions imported from shared module

  // Check if scenario affects loan/liquidation parameters
  const scenarioAffectsLiquidation = useCallback((scenario) => {
    if (!scenario) return false;
    // Only these overrides affect liquidation risk
    return (
      (scenario.btc_cagr_override !== null && scenario.btc_cagr_override !== undefined) ||
      (scenario.savings_allocation_btc_override !== null && scenario.savings_allocation_btc_override !== undefined) ||
      (scenario.hypothetical_btc_loan?.enabled === true)
    );
  }, []);

  // Run Monte Carlo comparison with SAME random paths for both baseline and scenario
  const runMonteCarloComparison = useCallback((baselineParams, scenarioParams, numSimulations = 500) => {
    const projectionYears = Math.max(
      baselineParams.lifeExpectancy - baselineParams.currentAge + 1,
      scenarioParams ? scenarioParams.lifeExpectancy - scenarioParams.currentAge + 1 : 0
    );

    // Format settings object with correct key names for generateMonteCarloSeed
    // generateMonteCarloSeed expects snake_case keys, but buildProjectionParams returns camelCase
    const seedSettings = {
      current_age: baselineParams.currentAge,
      retirement_age: baselineParams.retirementAge,
      life_expectancy: baselineParams.lifeExpectancy,
      annual_retirement_spending: baselineParams.retirementAnnualSpending,
      gross_annual_income: baselineParams.grossAnnualIncome,
      filing_status: baselineParams.filingStatus,
      state_of_residence: baselineParams.stateOfResidence,
      btc_cagr_assumption: settings?.btc_cagr_assumption ?? 25,
      stocks_cagr: baselineParams.effectiveStocksCagr,
      income_growth_rate: baselineParams.incomeGrowth,
      inflation_rate: baselineParams.effectiveInflation,
      btc_return_model: settings?.btc_return_model || 'powerlaw',
      asset_withdrawal_strategy: baselineParams.assetWithdrawalStrategy,
      cost_basis_method: baselineParams.costBasisMethod,
    };
    const seed = generateMonteCarloSeed(seedSettings, scenarioParams, holdings, liabilities, accounts, currentPrice);
    const seededRandom = createSeededRNG(seed);
    
    // Generate paths once using baseline params with seeded RNG
    const paths = generateRandomPaths(numSimulations, projectionYears, baselineParams, seededRandom);

    let baselineSuccess = 0;
    let scenarioSuccess = 0;
    let baselineLiquidations = 0;
    let scenarioLiquidations = 0;

    for (let i = 0; i < paths.length; i++) {
      // Run baseline with original path
      const baseResult = runUnifiedProjection({
        ...baselineParams,
        yearlyReturnOverrides: paths[i],
        taxLots: [], // Use aggregate basis for Monte Carlo speed
        DEBUG: false,
      });

      if (baseResult.survives) baselineSuccess++;
      
      // Check for liquidation events (excluding top_up and release)
      const baseHasLiquidation = baseResult.yearByYear?.some(y => 
        y.liquidations?.some(l => l.type !== 'top_up' && l.type !== 'release')
      );
      
      // Only count as catastrophic liquidation if BOTH liquidation happened AND plan failed
      if (baseHasLiquidation && !baseResult.survives) baselineLiquidations++;

      // Run scenario with regenerated returns (same Z-scores, different expected returns if changed)
      if (scenarioParams) {
        const scenarioOverrides = regenerateReturnsForParams(paths[i], scenarioParams);
        const scenResult = runUnifiedProjection({
          ...scenarioParams,
          yearlyReturnOverrides: scenarioOverrides,
          taxLots: [], // Use aggregate basis for Monte Carlo speed
          DEBUG: false,
        });

        if (scenResult.survives) scenarioSuccess++;
        
        // Check for liquidation events (excluding top_up and release)
        const scenHasLiquidation = scenResult.yearByYear?.some(y => 
          y.liquidations?.some(l => l.type !== 'top_up' && l.type !== 'release')
        );
        
        // Only count as catastrophic liquidation if BOTH liquidation happened AND plan failed
        if (scenHasLiquidation && !scenResult.survives) scenarioLiquidations++;
      }
    }

    return {
      baselineSuccessRate: (baselineSuccess / numSimulations) * 100,
      scenarioSuccessRate: scenarioParams ? (scenarioSuccess / numSimulations) * 100 : null,
      baselineLiquidationRisk: (baselineLiquidations / numSimulations) * 100,
      scenarioLiquidationRisk: scenarioParams ? (scenarioLiquidations / numSimulations) * 100 : null,
      numSimulations,
    };
  }, []);

  // Binary search for max sustainable spending with shared paths
  // If sharedPaths is provided, use those instead of generating new ones
  const findMaxSustainableSpendingWithPaths = useCallback((baseParams, numSimulations = 200, sharedPaths = null) => {
    let low = 10000;
    let high = 500000;
    let maxSpending = low;

    // Use shared paths if provided, otherwise generate new ones with seeded RNG
    const projectionYears = baseParams.lifeExpectancy - baseParams.currentAge + 1;
    
    let paths;
    if (sharedPaths) {
      paths = sharedPaths;
    } else {
      const seed = generateMonteCarloSeed(baseParams, null, holdings, liabilities, accounts, currentPrice);
      const seededRandom = createSeededRNG(seed);
      paths = generateRandomPaths(numSimulations, projectionYears, baseParams, seededRandom);
    }

    for (let iteration = 0; iteration < 15; iteration++) {
      const testSpending = Math.round((low + high) / 2);
      const testParams = { ...baseParams, retirementAnnualSpending: testSpending };
      
      let successCount = 0;
      for (let i = 0; i < paths.length; i++) {
        const result = runUnifiedProjection({
          ...testParams,
          yearlyReturnOverrides: paths[i],
          taxLots: [], // Use aggregate basis for Monte Carlo speed
          DEBUG: false,
        });
        if (result.survives) successCount++;
      }
      
      const successRate = (successCount / numSimulations) * 100;

      if (successRate >= 90) {
        maxSpending = testSpending;
        low = testSpending;
      } else {
        high = testSpending;
      }

      if (high - low <= 5000) break;
    }

    return maxSpending;
  }, [holdings, liabilities, accounts, currentPrice]);

  // Run Monte Carlo for both baseline and scenario
  const handleRunMonteCarlo = useCallback(async () => {
    setMonteCarloRunning(true);
    setBaselineMonteCarloResults(null);
    setScenarioMonteCarloResults(null);

    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      try {
        const baselineParams = buildProjectionParams();
        let scenarioParams = null;

        if (selectedScenario) {
          const overrides = {
            retirement_age_override: selectedScenario.retirement_age_override,
            life_expectancy_override: selectedScenario.life_expectancy_override,
            annual_retirement_spending_override: selectedScenario.annual_retirement_spending_override,
            state_override: selectedScenario.state_override,
            btc_cagr_override: selectedScenario.btc_cagr_override,
            stocks_cagr_override: selectedScenario.stocks_cagr_override,
            bonds_cagr_override: selectedScenario.bonds_cagr_override,
            real_estate_cagr_override: selectedScenario.real_estate_cagr_override,
            cash_cagr_override: selectedScenario.cash_cagr_override,
            inflation_override: selectedScenario.inflation_override,
            income_growth_override: selectedScenario.income_growth_override,
            social_security_start_age_override: selectedScenario.social_security_start_age_override,
            social_security_amount_override: selectedScenario.social_security_amount_override,
            savings_allocation_btc_override: selectedScenario.savings_allocation_btc_override,
            savings_allocation_stocks_override: selectedScenario.savings_allocation_stocks_override,
            savings_allocation_bonds_override: selectedScenario.savings_allocation_bonds_override,
            savings_allocation_cash_override: selectedScenario.savings_allocation_cash_override,
            savings_allocation_other_override: selectedScenario.savings_allocation_other_override,
            // New fields for Monte Carlo
            btc_return_model_override: selectedScenario.btc_return_model_override,
            custom_return_periods_override: selectedScenario.custom_return_periods_override,
            ticker_returns_override: selectedScenario.ticker_returns_override,
            gross_annual_income_override: selectedScenario.gross_annual_income_override,
            current_annual_spending_override: selectedScenario.current_annual_spending_override,
            dividend_income_override: selectedScenario.dividend_income_override,
            dividend_income_qualified: selectedScenario.dividend_income_qualified,
            one_time_events: selectedScenario.one_time_events,
            asset_reallocations: selectedScenario.asset_reallocations,
            hypothetical_btc_loan: selectedScenario.hypothetical_btc_loan,
          };
          scenarioParams = buildProjectionParams(overrides);
        }

        // Run comparison with shared random paths (500 simulations)
        const mcResults = runMonteCarloComparison(baselineParams, scenarioParams, 500);

        // Generate shared paths ONCE for 90% safe spending calculations with seeded RNG
        const safeSpendingSimulations = 500;
        const projectionYearsForSafeSpending = baselineParams.lifeExpectancy - baselineParams.currentAge + 1;
        // Use same seedSettings format for safe spending seed
        const safeSpendingSeedSettings = {
          current_age: baselineParams.currentAge,
          retirement_age: baselineParams.retirementAge,
          life_expectancy: baselineParams.lifeExpectancy,
          annual_retirement_spending: baselineParams.retirementAnnualSpending,
          gross_annual_income: baselineParams.grossAnnualIncome,
          filing_status: baselineParams.filingStatus,
          state_of_residence: baselineParams.stateOfResidence,
          btc_cagr_assumption: settings?.btc_cagr_assumption ?? 25,
          stocks_cagr: baselineParams.effectiveStocksCagr,
          income_growth_rate: baselineParams.incomeGrowth,
          inflation_rate: baselineParams.effectiveInflation,
          btc_return_model: settings?.btc_return_model || 'powerlaw',
          asset_withdrawal_strategy: baselineParams.assetWithdrawalStrategy,
          cost_basis_method: baselineParams.costBasisMethod,
        };
        const safeSpendingSeed = generateMonteCarloSeed(safeSpendingSeedSettings, null, holdings, liabilities, accounts, currentPrice);
        const safeSpendingRandom = createSeededRNG(safeSpendingSeed);
        const sharedSafeSpendingPaths = generateRandomPaths(safeSpendingSimulations, projectionYearsForSafeSpending, baselineParams, safeSpendingRandom);

        const baselineMaxSpending = findMaxSustainableSpendingWithPaths(baselineParams, safeSpendingSimulations, sharedSafeSpendingPaths);
        
        // Check if liquidation difference is meaningful
        const liquidationAffected = scenarioAffectsLiquidation(selectedScenario);

        setBaselineMonteCarloResults({
          successRate: mcResults.baselineSuccessRate,
          liquidationRisk: mcResults.baselineLiquidationRisk,
          maxSustainableSpending: baselineMaxSpending,
          numSimulations: mcResults.numSimulations,
        });

        if (scenarioParams) {
          // Find max sustainable spending for scenario using SAME shared paths
          const scenarioMaxSpending = findMaxSustainableSpendingWithPaths(scenarioParams, safeSpendingSimulations, sharedSafeSpendingPaths);
          
          setScenarioMonteCarloResults({
            successRate: mcResults.scenarioSuccessRate,
            liquidationRisk: mcResults.scenarioLiquidationRisk,
            maxSustainableSpending: scenarioMaxSpending,
            numSimulations: mcResults.numSimulations,
            liquidationAffected, // Flag to indicate if liquidation comparison is meaningful
          });
        }
      } catch (error) {
        console.error('Monte Carlo error:', error);
      } finally {
        setMonteCarloRunning(false);
      }
    }, 50);
  }, [buildProjectionParams, runMonteCarloComparison, findMaxSustainableSpendingWithPaths, selectedScenario, scenarioAffectsLiquidation]);

  // Clear Monte Carlo results when scenario changes
  useEffect(() => {
    setScenarioMonteCarloResults(null);
  }, [selectedScenarioId]);

  // Format currency helper (moved up for use in holdingsOptions)
  const formatCurrency = (num) => {
    if (num === null || num === undefined) return '-';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
    return `$${num.toLocaleString()}`;
  };

  // Holdings options for asset reallocation dropdown
  const holdingsOptions = useMemo(() => {
    return holdings.map(h => {
      const price = h.asset_type === 'btc' ? (btcPrice || 0) : (h.current_price || 0);
      const value = h.quantity * price;
      return {
        id: h.id,
        label: `${h.asset_name}${h.ticker ? ` (${h.ticker})` : ''} - ${formatCurrency(value)}`,
        assetType: h.asset_type,
        quantity: h.quantity,
        value: value,
        costBasis: h.cost_basis_total || 0
      };
    }).filter(h => h.value > 0);
  }, [holdings, btcPrice]);

  // Build comparison chart data
  const chartData = useMemo(() => {
    if (!baselineProjection?.yearByYear) return [];
    
    return baselineProjection.yearByYear.map((baseYear, index) => {
      const scenarioYear = scenarioProjection?.yearByYear?.[index];
      return {
        age: baseYear.age,
        year: baseYear.year,
        baseline: baseYear.total,
        scenario: scenarioYear?.total || null,
        baselineRetired: baseYear.isRetired,
        scenarioRetired: scenarioYear?.isRetired || false,
      };
    });
  }, [baselineProjection, scenarioProjection]);

  // CRUD operations for scenarios
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      if (selectedScenarioId === id) setSelectedScenarioId(null);
    },
  });

  const resetForm = () => {
    setForm({
      name: '', description: '',
      retirement_age_override: '', life_expectancy_override: '',
      annual_retirement_spending_override: '', state_override: '',
      btc_cagr_override: '', stocks_cagr_override: '', bonds_cagr_override: '',
      real_estate_cagr_override: '', cash_cagr_override: '',
      inflation_override: '', income_growth_override: '',
      social_security_start_age_override: '', social_security_amount_override: '',
      savings_allocation_btc_override: '', savings_allocation_stocks_override: '',
      savings_allocation_bonds_override: '', savings_allocation_cash_override: '',
      savings_allocation_other_override: '',
      btc_return_model_override: '',
      custom_return_periods_override: {},
      ticker_returns_override: {},
      gross_annual_income_override: '',
      current_annual_spending_override: '',
      dividend_income_override: '',
      dividend_income_qualified: true,
      one_time_events: [],
      asset_reallocations: [],
      hypothetical_btc_loan: { enabled: false, loan_amount: '', interest_rate: '', collateral_btc: '', ltv: '' }
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Clean up hypothetical_btc_loan - only include if actually enabled and has valid loan_amount
    let cleanedHypotheticalLoan = null;
    if (form.hypothetical_btc_loan?.enabled && form.hypothetical_btc_loan?.loan_amount) {
      cleanedHypotheticalLoan = {
        enabled: true,
        loan_amount: parseFloat(form.hypothetical_btc_loan.loan_amount) || null,
        interest_rate: parseFloat(form.hypothetical_btc_loan.interest_rate) || 12,
        collateral_btc: parseFloat(form.hypothetical_btc_loan.collateral_btc) || null,
        ltv: parseFloat(form.hypothetical_btc_loan.ltv) || 50,
        start_age: form.hypothetical_btc_loan.start_age !== '' && form.hypothetical_btc_loan.start_age !== null 
          ? parseFloat(form.hypothetical_btc_loan.start_age) 
          : null,
        pay_off_age: form.hypothetical_btc_loan.pay_off_age !== '' && form.hypothetical_btc_loan.pay_off_age !== null 
          ? parseFloat(form.hypothetical_btc_loan.pay_off_age) 
          : null,
        use_of_proceeds: form.hypothetical_btc_loan.use_of_proceeds || 'cash',
      };
    }
    
    const data = {
      name: form.name,
      description: form.description,
      retirement_age_override: form.retirement_age_override ? parseInt(form.retirement_age_override) : null,
      life_expectancy_override: form.life_expectancy_override ? parseInt(form.life_expectancy_override) : null,
      annual_retirement_spending_override: form.annual_retirement_spending_override ? parseFloat(form.annual_retirement_spending_override) : null,
      state_override: form.state_override || null,
      btc_cagr_override: form.btc_cagr_override !== '' ? parseFloat(form.btc_cagr_override) : null,
      stocks_cagr_override: form.stocks_cagr_override !== '' ? parseFloat(form.stocks_cagr_override) : null,
      bonds_cagr_override: form.bonds_cagr_override !== '' ? parseFloat(form.bonds_cagr_override) : null,
      real_estate_cagr_override: form.real_estate_cagr_override !== '' ? parseFloat(form.real_estate_cagr_override) : null,
      cash_cagr_override: form.cash_cagr_override !== '' ? parseFloat(form.cash_cagr_override) : null,
      inflation_override: form.inflation_override !== '' ? parseFloat(form.inflation_override) : null,
      income_growth_override: form.income_growth_override !== '' ? parseFloat(form.income_growth_override) : null,
      social_security_start_age_override: form.social_security_start_age_override ? parseInt(form.social_security_start_age_override) : null,
      social_security_amount_override: form.social_security_amount_override !== '' ? parseFloat(form.social_security_amount_override) : null,
      savings_allocation_btc_override: form.savings_allocation_btc_override !== '' ? parseFloat(form.savings_allocation_btc_override) : null,
      savings_allocation_stocks_override: form.savings_allocation_stocks_override !== '' ? parseFloat(form.savings_allocation_stocks_override) : null,
      savings_allocation_bonds_override: form.savings_allocation_bonds_override !== '' ? parseFloat(form.savings_allocation_bonds_override) : null,
      savings_allocation_cash_override: form.savings_allocation_cash_override !== '' ? parseFloat(form.savings_allocation_cash_override) : null,
      savings_allocation_other_override: form.savings_allocation_other_override !== '' ? parseFloat(form.savings_allocation_other_override) : null,
      btc_return_model_override: form.btc_return_model_override || null,
      custom_return_periods_override: (form.custom_return_periods_override && Object.keys(form.custom_return_periods_override).length > 0) ? form.custom_return_periods_override : null,
      ticker_returns_override: (form.ticker_returns_override && Object.keys(form.ticker_returns_override).length > 0) ? form.ticker_returns_override : null,
      gross_annual_income_override: form.gross_annual_income_override !== '' ? parseFloat(form.gross_annual_income_override) : null,
      current_annual_spending_override: form.current_annual_spending_override !== '' ? parseFloat(form.current_annual_spending_override) : null,
      dividend_income_override: form.dividend_income_override !== '' ? parseFloat(form.dividend_income_override) : null,
      dividend_income_qualified: form.dividend_income_qualified,
      one_time_events: form.one_time_events || [],
      asset_reallocations: form.asset_reallocations || [],
      hypothetical_btc_loan: cleanedHypotheticalLoan,
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
      retirement_age_override: scenario.retirement_age_override || '',
      life_expectancy_override: scenario.life_expectancy_override || '',
      annual_retirement_spending_override: scenario.annual_retirement_spending_override || '',
      state_override: scenario.state_override || '',
      btc_cagr_override: scenario.btc_cagr_override ?? '',
      stocks_cagr_override: scenario.stocks_cagr_override ?? '',
      bonds_cagr_override: scenario.bonds_cagr_override ?? '',
      real_estate_cagr_override: scenario.real_estate_cagr_override ?? '',
      cash_cagr_override: scenario.cash_cagr_override ?? '',
      inflation_override: scenario.inflation_override ?? '',
      income_growth_override: scenario.income_growth_override ?? '',
      social_security_start_age_override: scenario.social_security_start_age_override || '',
      social_security_amount_override: scenario.social_security_amount_override ?? '',
      savings_allocation_btc_override: scenario.savings_allocation_btc_override ?? '',
      savings_allocation_stocks_override: scenario.savings_allocation_stocks_override ?? '',
      savings_allocation_bonds_override: scenario.savings_allocation_bonds_override ?? '',
      savings_allocation_cash_override: scenario.savings_allocation_cash_override ?? '',
      savings_allocation_other_override: scenario.savings_allocation_other_override ?? '',
      btc_return_model_override: scenario.btc_return_model_override || '',
      custom_return_periods_override: scenario.custom_return_periods_override || {},
      ticker_returns_override: scenario.ticker_returns_override || {},
      gross_annual_income_override: scenario.gross_annual_income_override ?? '',
      current_annual_spending_override: scenario.current_annual_spending_override ?? '',
      dividend_income_override: scenario.dividend_income_override ?? '',
      dividend_income_qualified: scenario.dividend_income_qualified ?? true,
      one_time_events: scenario.one_time_events || [],
      asset_reallocations: scenario.asset_reallocations || [],
      hypothetical_btc_loan: scenario.hypothetical_btc_loan || { enabled: false, loan_amount: '', interest_rate: '', collateral_btc: '', ltv: '' }
    });
    setFormOpen(true);
  };

  // Format helpers
  const formatDelta = (baseline, scenario) => {
    if (baseline === null || scenario === null) return '-';
    const diff = scenario - baseline;
    const prefix = diff >= 0 ? '+' : '-';
    return prefix + formatCurrency(Math.abs(diff));
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-zinc-100">Scenario Builder</h1>
          <p className="text-zinc-400 mt-1">Compare different financial futures using real projections</p>
        </div>
        <Button 
          onClick={() => { resetForm(); setEditingScenario(null); setFormOpen(true); }} 
          className="bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Scenario
        </Button>
      </div>

      {/* Baseline Summary */}
      <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-orange-400" />
          <h3 className="font-semibold text-zinc-100">Baseline (Your Current Plan)</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="p-3 rounded-xl bg-zinc-800/50">
            <p className="text-xs text-zinc-400">Retire at</p>
            <p className="text-lg font-bold text-zinc-100">{baselineRetirementAge}</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/50">
            <p className="text-xs text-zinc-400">Spending</p>
            <p className="text-lg font-bold text-zinc-100">{formatCurrency(settings.annual_retirement_spending || 100000)}/yr</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/50">
            <p className="text-xs text-zinc-400">State</p>
            <p className="text-lg font-bold text-zinc-100">{settings.state_of_residence || 'TX'}</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/50">
            <p className="text-xs text-zinc-400">At Retirement</p>
            <p className="text-lg font-bold text-emerald-400">{formatCurrency(baselineMetrics?.portfolioAtRetirement)}</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/50">
            <p className="text-xs text-zinc-400">Depletion Age</p>
            <p className={cn("text-lg font-bold", baselineMetrics?.survives ? "text-emerald-400" : "text-rose-400")}>
              {baselineMetrics?.survives ? 'Never' : `Age ${baselineMetrics?.depleteAge}`}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/50">
            <p className="text-xs text-zinc-400">Final Net Worth</p>
            <p className="text-lg font-bold text-zinc-100">{formatCurrency(baselineMetrics?.finalNetWorth)}</p>
          </div>
        </div>
      </div>

      {/* Scenario Selector */}
      <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-orange-400" />
            Compare Scenario
          </h3>
        </div>
        
        {scenarios.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-zinc-300 mb-4">No scenarios created yet. Create one to compare against your baseline.</p>
            <Button 
              onClick={() => { resetForm(); setEditingScenario(null); setFormOpen(true); }}
              className="bg-zinc-800 border border-zinc-600 text-white hover:bg-zinc-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Scenario
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {scenarios.map((scenario) => (
                <div key={scenario.id} className="flex items-center gap-1">
                  <Button
                    variant={selectedScenarioId === scenario.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedScenarioId(selectedScenarioId === scenario.id ? null : scenario.id)}
                    className={cn(
                      selectedScenarioId === scenario.id 
                        ? "bg-orange-500 hover:bg-orange-600 text-white" 
                        : "border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 hover:text-white"
                    )}
                  >
                    {scenario.name}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
                    onClick={() => handleEdit(scenario)}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-rose-400 hover:text-rose-300"
                    onClick={() => deleteScenario.mutate(scenario.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>

            {selectedScenario && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedScenario.retirement_age_override && (
                  <Badge variant="outline" className="border-zinc-600 text-zinc-200">Retire: {selectedScenario.retirement_age_override}</Badge>
                )}
                {selectedScenario.annual_retirement_spending_override && (
                  <Badge variant="outline" className="border-zinc-600 text-zinc-200">Spend: {formatCurrency(selectedScenario.annual_retirement_spending_override)}/yr</Badge>
                )}
                {selectedScenario.state_override && (
                  <Badge variant="outline" className="border-zinc-600 text-zinc-200">State: {selectedScenario.state_override}</Badge>
                )}
                {selectedScenario.btc_cagr_override !== null && selectedScenario.btc_cagr_override !== undefined && (
                  <Badge variant="outline" className="border-orange-500/50 text-orange-400">BTC: {selectedScenario.btc_cagr_override}%</Badge>
                )}
                {selectedScenario.stocks_cagr_override !== null && selectedScenario.stocks_cagr_override !== undefined && (
                  <Badge variant="outline" className="border-blue-500/50 text-blue-400">Stocks: {selectedScenario.stocks_cagr_override}%</Badge>
                )}
                {selectedScenario.inflation_override !== null && selectedScenario.inflation_override !== undefined && (
                  <Badge variant="outline" className="border-rose-500/50 text-rose-400">Inflation: {selectedScenario.inflation_override}%</Badge>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Comparison Chart */}
      {selectedScenario && chartData.length > 0 && (
        <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-zinc-100">Projection Comparison</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowChart(!showChart)} className="text-zinc-400 hover:text-zinc-200">
              {showChart ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
          
          {showChart && (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="age" stroke="#71717a" fontSize={12} />
                  <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                    formatter={(value, name) => [formatCurrency(value), name === 'baseline' ? 'Baseline' : selectedScenario.name]}
                    labelFormatter={(age) => `Age ${age}`}
                  />
                  <Legend formatter={(value) => value === 'baseline' ? 'Baseline' : selectedScenario.name} />
                  <ReferenceLine x={baselineRetirementAge} stroke="#F7931A" strokeDasharray="5 5" label={{ value: 'Retire', position: 'top', fill: '#F7931A', fontSize: 10 }} />
                  <Line type="monotone" dataKey="baseline" stroke="#71717a" strokeWidth={2} dot={false} strokeDasharray="5 5" name="baseline" />
                  <Line type="monotone" dataKey="scenario" stroke="#F7931A" strokeWidth={2} dot={false} name="scenario" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Comparison Metrics */}
      {selectedScenario && baselineMetrics && scenarioMetrics && (
        <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-zinc-100">Comparison Metrics</h3>
            <Button
              onClick={handleRunMonteCarlo}
              disabled={monteCarloRunning}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              size="sm"
            >
              {monteCarloRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Monte Carlo
                </>
              )}
            </Button>
          </div>

          <div className="space-y-4">
            {/* Section 1: PLAN OVERVIEW */}
            <CollapsibleSection title="PLAN OVERVIEW" defaultOpen={true}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-3 px-4 text-zinc-300 font-medium">Metric</th>
                      <th className="text-right py-3 px-4 text-zinc-300 font-medium">Baseline</th>
                      <th className="text-right py-3 px-4 text-zinc-300 font-medium">{selectedScenario.name}</th>
                      <th className="text-right py-3 px-4 text-zinc-300 font-medium">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-zinc-800/50">
                      <td className="py-3 px-4 text-zinc-200">Net Worth at Retirement</td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-200">{formatCurrency(baselineMetrics.portfolioAtRetirement)}</td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-200">{formatCurrency(scenarioMetrics.portfolioAtRetirement)}</td>
                      <td className={cn("py-3 px-4 text-right font-mono", scenarioMetrics.portfolioAtRetirement >= baselineMetrics.portfolioAtRetirement ? "text-emerald-400" : "text-rose-400")}>
                        {formatDelta(baselineMetrics.portfolioAtRetirement, scenarioMetrics.portfolioAtRetirement)}
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-800/50">
                      <td className="py-3 px-4 text-zinc-200">Depletion Age</td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-200">{baselineMetrics.survives ? 'Never' : `Age ${baselineMetrics.depleteAge}`}</td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-200">{scenarioMetrics.survives ? 'Never' : `Age ${scenarioMetrics.depleteAge}`}</td>
                      <td className={cn("py-3 px-4 text-right font-mono", 
                        scenarioMetrics.survives && !baselineMetrics.survives ? "text-emerald-400" :
                        !scenarioMetrics.survives && baselineMetrics.survives ? "text-rose-400" :
                        (scenarioMetrics.depleteAge || lifeExpectancy + 1) >= (baselineMetrics.depleteAge || lifeExpectancy + 1) ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {baselineMetrics.survives && scenarioMetrics.survives ? '—' :
                         !baselineMetrics.survives && !scenarioMetrics.survives ? `${(scenarioMetrics.depleteAge - baselineMetrics.depleteAge) >= 0 ? '+' : ''}${scenarioMetrics.depleteAge - baselineMetrics.depleteAge} years` :
                         scenarioMetrics.survives ? '✓ Now survives' : '✗ Now depletes'}
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-800/50">
                      <td className="py-3 px-4 text-zinc-200">Final Net Worth</td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-200">{formatCurrency(baselineMetrics.finalNetWorth)}</td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-200">{formatCurrency(scenarioMetrics.finalNetWorth)}</td>
                      <td className={cn("py-3 px-4 text-right font-mono", scenarioMetrics.finalNetWorth >= baselineMetrics.finalNetWorth ? "text-emerald-400" : "text-rose-400")}>
                        {formatDelta(baselineMetrics.finalNetWorth, scenarioMetrics.finalNetWorth)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 text-zinc-200">Lifetime Taxes Paid</td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-200">{formatCurrency(baselineMetrics.lifetimeTaxes)}</td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-200">{formatCurrency(scenarioMetrics.lifetimeTaxes)}</td>
                      <td className={cn("py-3 px-4 text-right font-mono", scenarioMetrics.lifetimeTaxes <= baselineMetrics.lifetimeTaxes ? "text-emerald-400" : "text-rose-400")}>
                        {formatDelta(baselineMetrics.lifetimeTaxes, scenarioMetrics.lifetimeTaxes)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>

            {/* Section 2: BITCOIN HOLDINGS OVER TIME */}
            <CollapsibleSection title="BITCOIN HOLDINGS OVER TIME" defaultOpen={true}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-3 px-4 text-zinc-300 font-medium">Milestone</th>
                      <th className="text-right py-3 px-4 text-zinc-300 font-medium">Baseline</th>
                      <th className="text-right py-3 px-4 text-zinc-300 font-medium">{selectedScenario.name}</th>
                      <th className="text-right py-3 px-4 text-zinc-300 font-medium">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {btcMilestones.map((milestone, idx) => {
                      const baselineBtc = getBtcAtAge(baselineProjection?.yearByYear, milestone.age, currentAge);
                      const scenarioBtc = getBtcAtAge(scenarioProjection?.yearByYear, milestone.age, currentAge);

                      const baselineDisplay = baselineBtc.depleted
                        ? <span className="text-rose-400">Plan Depleted</span>
                        : <><span className="text-orange-400">{baselineBtc.quantity?.toFixed(2) || '0.00'} BTC</span> <span className="text-zinc-500 text-xs">({formatCurrency(baselineBtc.value)})</span></>;
                      
                      const scenarioDisplay = scenarioBtc.depleted
                        ? <span className="text-rose-400">Plan Depleted</span>
                        : <><span className="text-orange-400">{scenarioBtc.quantity?.toFixed(2) || '0.00'} BTC</span> <span className="text-zinc-500 text-xs">({formatCurrency(scenarioBtc.value)})</span></>;

                      const diffQuantity = (scenarioBtc.quantity || 0) - (baselineBtc.quantity || 0);

                      return (
                        <tr key={milestone.age} className={cn(idx < btcMilestones.length - 1 && "border-b border-zinc-800/50")}>
                          <td className="py-3 px-4 text-zinc-200">{milestone.label} (Age {milestone.age})</td>
                          <td className="py-3 px-4 text-right font-mono text-zinc-200">{baselineDisplay}</td>
                          <td className="py-3 px-4 text-right font-mono text-zinc-200">{scenarioDisplay}</td>
                          <td className={cn("py-3 px-4 text-right font-mono", diffQuantity >= 0 ? "text-emerald-400" : "text-rose-400")}>
                            {
                              baselineBtc.depleted && !scenarioBtc.depleted ? <span className="text-emerald-400">✓ Now holds</span> :
                              !baselineBtc.depleted && scenarioBtc.depleted ? <span className="text-rose-400">✗ Now depleted</span> :
                              Math.abs(diffQuantity) < 0.01 ? <span className="text-zinc-500">≈ same</span> :
                              <>{diffQuantity >= 0 ? '▲' : '▼'} {Math.abs(diffQuantity).toFixed(2)} BTC</>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>

            {/* Section 3: PLAN CONFIDENCE */}
            {baselineMonteCarloResults && (
              <CollapsibleSection title={`PLAN CONFIDENCE (${baselineMonteCarloResults?.numSimulations?.toLocaleString() || '500'} scenarios)`} defaultOpen={true}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-3 px-4 text-zinc-300 font-medium">Metric</th>
                        <th className="text-right py-3 px-4 text-zinc-300 font-medium">Baseline</th>
                        <th className="text-right py-3 px-4 text-zinc-300 font-medium">{selectedScenario.name}</th>
                        <th className="text-right py-3 px-4 text-zinc-300 font-medium">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-zinc-800/50">
                        <td className="py-3 px-4 text-zinc-200">Plan Success Rate</td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-200">
                          {monteCarloRunning && !baselineMonteCarloResults ? (
                            <Loader2 className="w-4 h-4 animate-spin inline" />
                          ) : baselineMonteCarloResults ? (
                            <span className={baselineMonteCarloResults.successRate >= 85 ? "text-emerald-400" : baselineMonteCarloResults.successRate >= 70 ? "text-amber-400" : "text-orange-500"}>
                              {baselineMonteCarloResults.successRate.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-200">
                          {monteCarloRunning && !scenarioMonteCarloResults ? (
                            <Loader2 className="w-4 h-4 animate-spin inline" />
                          ) : scenarioMonteCarloResults ? (
                            <span className={scenarioMonteCarloResults.successRate >= 85 ? "text-emerald-400" : scenarioMonteCarloResults.successRate >= 70 ? "text-amber-400" : "text-orange-500"}>
                              {scenarioMonteCarloResults.successRate.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {baselineMonteCarloResults && scenarioMonteCarloResults ? (() => {
                            const diff = scenarioMonteCarloResults.successRate - baselineMonteCarloResults.successRate;
                            if (Math.abs(diff) < 3) {
                              return <span className="text-zinc-500">≈ same</span>;
                            }
                            return (
                              <span className={diff > 0 ? "text-emerald-400" : "text-rose-400"}>
                                {diff > 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(1)}%
                              </span>
                            );
                          })() : '—'}
                        </td>
                      </tr>
                      <tr className="border-b border-zinc-800/50">
                        <td className="py-3 px-4 text-zinc-200">
                          <div className="flex items-center gap-1">
                            Catastrophic Liquidation Risk
                            <span className="text-zinc-500 cursor-help" title="The probability that a loan liquidation causes your plan to run out of money before your life expectancy. Liquidations that don't cause plan failure are not counted.">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {monteCarloRunning && !baselineMonteCarloResults ? (
                            <Loader2 className="w-4 h-4 animate-spin inline" />
                          ) : baselineMonteCarloResults ? (
                            <span className={getLiquidationRiskDisplay(baselineMonteCarloResults.liquidationRisk).color}>
                              {getLiquidationRiskDisplay(baselineMonteCarloResults.liquidationRisk).label}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {monteCarloRunning && !scenarioMonteCarloResults ? (
                            <Loader2 className="w-4 h-4 animate-spin inline" />
                          ) : scenarioMonteCarloResults ? (
                            <span className={getLiquidationRiskDisplay(scenarioMonteCarloResults.liquidationRisk).color}>
                              {getLiquidationRiskDisplay(scenarioMonteCarloResults.liquidationRisk).label}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {baselineMonteCarloResults && scenarioMonteCarloResults ? (() => {
                            const diff = scenarioMonteCarloResults.liquidationRisk - baselineMonteCarloResults.liquidationRisk;
                            if (!scenarioMonteCarloResults.liquidationAffected && Math.abs(diff) < 1) {
                              return <span className="text-zinc-500">—</span>;
                            }
                            if (Math.abs(diff) < 3) {
                              return <span className="text-zinc-500">≈ same</span>;
                            }
                            return (
                              <span className={diff < 0 ? "text-emerald-400" : "text-rose-400"}>
                                {diff < 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(0)}%
                              </span>
                            );
                          })() : '—'}
                        </td>
                      </tr>
                      <tr className="border-b border-zinc-800/50">
                        <td className="py-3 px-4 text-zinc-200">
                          <div className="flex items-center gap-1">
                            Max Drawdown Survived
                            <span className="text-zinc-500 cursor-help" title="The maximum BTC price drop your loans can survive based on current LTV and liquidation thresholds. This is a simple calculation and doesn't account for top-up protection or portfolio adjustments.">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-200">
                          {maxDrawdownSurvived === null ? (
                            <span className="text-zinc-500">N/A</span>
                          ) : (
                            <span className={maxDrawdownSurvived >= 50 ? "text-emerald-400" : maxDrawdownSurvived >= 30 ? "text-amber-400" : "text-rose-400"}>
                              {maxDrawdownSurvived.toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-200">
                          {maxDrawdownSurvived === null ? (
                            <span className="text-zinc-500">N/A</span>
                          ) : (
                            <span className={maxDrawdownSurvived >= 50 ? "text-emerald-400" : maxDrawdownSurvived >= 30 ? "text-amber-400" : "text-rose-400"}>
                              {maxDrawdownSurvived.toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-500">
                          {maxDrawdownSurvived === null ? '—' : '≈ same'}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 text-zinc-200">
                          <div className="flex items-center gap-1">
                            90% Safe Spending at Retirement
                            <span className="text-zinc-500 cursor-help" title="The maximum annual spending (in today's dollars) where your plan succeeds in at least 90% of simulated market scenarios. Based on 500 market scenarios reflecting Bitcoin's volatility patterns.">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-200">
                          {monteCarloRunning && !baselineMonteCarloResults ? (
                            <Loader2 className="w-4 h-4 animate-spin inline" />
                          ) : baselineMonteCarloResults ? (
                            formatCurrency(baselineMonteCarloResults.maxSustainableSpending) + '/yr'
                          ) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-200">
                          {monteCarloRunning && !scenarioMonteCarloResults ? (
                            <Loader2 className="w-4 h-4 animate-spin inline" />
                          ) : scenarioMonteCarloResults ? (
                            formatCurrency(scenarioMonteCarloResults.maxSustainableSpending) + '/yr'
                          ) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {baselineMonteCarloResults && scenarioMonteCarloResults ? (() => {
                            const diff = scenarioMonteCarloResults.maxSustainableSpending - baselineMonteCarloResults.maxSustainableSpending;
                            if (Math.abs(diff) <= 5000) {
                              return <span className="text-zinc-500">≈ same</span>;
                            }
                            return (
                              <span className={diff >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                {diff >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(diff))}
                              </span>
                            );
                          })() : '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CollapsibleSection>
            )}
          </div>
        </div>
      )}

      {/* Custom Periods Modal */}
      <CustomPeriodsModal
        open={customPeriodsModalOpen}
        onOpenChange={setCustomPeriodsModalOpen}
        customReturnPeriods={form.custom_return_periods_override || {}}
        onSave={(periods) => setForm({ ...form, custom_return_periods_override: periods })}
        currentAge={settings.current_age || 35}
        lifeExpectancy={settings.life_expectancy || 90}
        holdings={holdings}
        tickerReturns={form.ticker_returns_override || {}}
        onTickerReturnsSave={(tickerReturns) => setForm({ ...form, ticker_returns_override: tickerReturns })}
      />

      {/* Create/Edit Scenario Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">{editingScenario ? 'Edit Scenario' : 'Create New Scenario'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info - Always visible */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-200">Scenario Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Early Retirement, Move to Texas..."
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-200">Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe what this scenario tests..."
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  rows={2}
                />
              </div>
            </div>

            {/* Retirement Settings */}
            <CollapsibleFormSection title="RETIREMENT SETTINGS" defaultOpen={true}>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">Retirement Age</Label>
                  <Input
                    type="number"
                    value={form.retirement_age_override}
                    onChange={(e) => setForm({ ...form, retirement_age_override: e.target.value })}
                    placeholder={String(settings.retirement_age || 65)}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">Life Expectancy</Label>
                  <Input
                    type="number"
                    value={form.life_expectancy_override}
                    onChange={(e) => setForm({ ...form, life_expectancy_override: e.target.value })}
                    placeholder={String(settings.life_expectancy || 90)}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">Annual Spending</Label>
                  <Input
                    type="number"
                    value={form.annual_retirement_spending_override}
                    onChange={(e) => setForm({ ...form, annual_retirement_spending_override: e.target.value })}
                    placeholder={String(settings.annual_retirement_spending || 100000)}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300 text-xs">State of Residence</Label>
                <Select value={form.state_override} onValueChange={(v) => setForm({ ...form, state_override: v })}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200">
                    <SelectValue placeholder={`Current: ${settings.state_of_residence || 'TX'}`} className="text-zinc-200" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700 max-h-60">
                    <SelectItem value={null} className="text-zinc-200 focus:text-white">Use current ({settings.state_of_residence || 'TX'})</SelectItem>
                    {US_STATES.map(state => (
                      <SelectItem key={state.value} value={state.value} className="text-zinc-200 focus:text-white">{state.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CollapsibleFormSection>

            {/* Income Settings */}
            <CollapsibleFormSection title="INCOME SETTINGS" defaultOpen={false}>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">Gross Annual Income ($)</Label>
                  <Input 
                    type="number" 
                    placeholder={String(settings.gross_annual_income || "Current income")}
                    value={form.gross_annual_income_override} 
                    onChange={(e) => setForm({ ...form, gross_annual_income_override: e.target.value })} 
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">Income Growth Rate (%)</Label>
                  <Input 
                    type="number" 
                    placeholder={String(settings.income_growth_rate || 3)}
                    value={form.income_growth_override} 
                    onChange={(e) => setForm({ ...form, income_growth_override: e.target.value })} 
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">Pre-Retirement Spending ($)</Label>
                  <Input 
                    type="number" 
                    placeholder={String(settings.current_annual_spending || "Current spending")}
                    value={form.current_annual_spending_override} 
                    onChange={(e) => setForm({ ...form, current_annual_spending_override: e.target.value })} 
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
              </div>
            </CollapsibleFormSection>

            {/* Dividend Income */}
            <CollapsibleFormSection title="DIVIDEND INCOME" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">Annual Dividend Income ($)</Label>
                  <Input 
                    type="number" 
                    placeholder="0"
                    value={form.dividend_income_override} 
                    onChange={(e) => setForm({ ...form, dividend_income_override: e.target.value })} 
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">Qualified Dividends?</Label>
                  <Select 
                    value={form.dividend_income_qualified ? "yes" : "no"} 
                    onValueChange={(v) => setForm({ ...form, dividend_income_qualified: v === "yes" })}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      <SelectItem value="yes" className="text-zinc-200 focus:text-white">Yes (lower tax rate)</SelectItem>
                      <SelectItem value="no" className="text-zinc-200 focus:text-white">No (ordinary income)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-zinc-500 mt-2">Model additional dividend income from investments outside your current holdings.</p>
            </CollapsibleFormSection>

            {/* Return Assumptions */}
            <CollapsibleFormSection title="RETURN ASSUMPTIONS" defaultOpen={false}>
              <div className="space-y-4">
                {/* BTC Return Model Section */}
                <div className="space-y-3">
                  <Label className="text-zinc-300 text-sm font-medium">Bitcoin Return Model</Label>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {[
                      { value: '', label: 'Use Default', desc: 'From settings' },
                      { value: 'custom', label: 'Custom %', desc: 'Set fixed CAGR' },
                      { value: 'saylor24', label: 'Saylor Model', desc: '50%→20%' },
                      { value: 'powerlaw', label: 'Power Law', desc: '40%→24%' },
                      { value: 'custom_periods', label: 'Custom Periods', desc: 'Time-based' },
                    ].map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setForm({ ...form, btc_return_model_override: option.value })}
                        className={cn(
                          "p-3 rounded-lg border text-left transition-all",
                          form.btc_return_model_override === option.value
                            ? "border-orange-500 bg-orange-500/10"
                            : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                        )}
                      >
                        <p className="text-sm font-medium text-zinc-200">{option.label}</p>
                        <p className="text-xs text-zinc-500">{option.desc}</p>
                      </button>
                    ))}
                  </div>

                  {/* Custom CAGR input - only show for 'custom' model */}
                  {form.btc_return_model_override === 'custom' && (
                    <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                      <Label className="text-zinc-300 text-xs">BTC CAGR (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.btc_cagr_override}
                        onChange={(e) => setForm({ ...form, btc_cagr_override: e.target.value })}
                        placeholder={String(settings.btc_cagr_assumption || 25)}
                        className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 mt-1"
                      />
                    </div>
                  )}

                  {/* Custom Periods - show configure button */}
                  {form.btc_return_model_override === 'custom_periods' && (
                    <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-zinc-200">Custom Return Periods</p>
                          <p className="text-xs text-zinc-500">
                            {Object.keys(form.custom_return_periods_override || {}).length > 0 
                              ? `${Object.values(form.custom_return_periods_override || {}).reduce((sum, periods) => sum + (periods?.length || 0), 0)} periods defined`
                              : 'No periods configured yet'}
                          </p>
                        </div>
                        <Button
                          type="button"
                          onClick={() => setCustomPeriodsModalOpen(true)}
                          size="sm"
                          className="bg-orange-500/20 border border-orange-500/30 text-orange-400 hover:bg-orange-500/30"
                        >
                          <Settings2 className="w-4 h-4 mr-2" />
                          Configure
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Other Asset Returns */}
                <div className="pt-3 border-t border-zinc-800">
                  <Label className="text-zinc-300 text-sm font-medium mb-3 block">Other Asset Returns</Label>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-zinc-300 text-xs">Stocks CAGR (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.stocks_cagr_override}
                        onChange={(e) => setForm({ ...form, stocks_cagr_override: e.target.value })}
                        placeholder={String(settings.stocks_cagr || 7)}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-300 text-xs">Bonds CAGR (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.bonds_cagr_override}
                        onChange={(e) => setForm({ ...form, bonds_cagr_override: e.target.value })}
                        placeholder={String(settings.bonds_cagr || 3)}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-300 text-xs">Real Estate CAGR (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.real_estate_cagr_override}
                        onChange={(e) => setForm({ ...form, real_estate_cagr_override: e.target.value })}
                        placeholder={String(settings.real_estate_cagr || 4)}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-300 text-xs">Cash CAGR (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.cash_cagr_override}
                        onChange={(e) => setForm({ ...form, cash_cagr_override: e.target.value })}
                        placeholder={String(settings.cash_cagr || 0)}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-300 text-xs">Inflation Rate (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.inflation_override}
                        onChange={(e) => setForm({ ...form, inflation_override: e.target.value })}
                        placeholder={String(settings.inflation_rate || 3)}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Per-Holding Returns (quick access) */}
                {Object.keys(form.ticker_returns_override || {}).length > 0 && (
                  <div className="pt-3 border-t border-zinc-800">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-zinc-300 text-sm font-medium">Per-Holding Overrides</Label>
                      <Button
                        type="button"
                        onClick={() => setCustomPeriodsModalOpen(true)}
                        size="sm"
                        variant="ghost"
                        className="text-zinc-400 hover:text-zinc-200"
                      >
                        Edit
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(form.ticker_returns_override || {}).map(([ticker, rate]) => (
                        <Badge key={ticker} variant="outline" className="border-zinc-600 text-zinc-300">
                          {ticker}: {rate}%
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleFormSection>

            {/* Social Security */}
            <CollapsibleFormSection title="SOCIAL SECURITY" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">Start Age</Label>
                  <Input
                    type="number"
                    value={form.social_security_start_age_override}
                    onChange={(e) => setForm({ ...form, social_security_start_age_override: e.target.value })}
                    placeholder={String(settings.social_security_start_age || 67)}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">Annual Amount ($)</Label>
                  <Input
                    type="number"
                    value={form.social_security_amount_override}
                    onChange={(e) => setForm({ ...form, social_security_amount_override: e.target.value })}
                    placeholder={String(settings.social_security_amount || 0)}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
              </div>
            </CollapsibleFormSection>

            {/* Savings Allocation */}
            <CollapsibleFormSection title="SAVINGS ALLOCATION" defaultOpen={false}>
              <div className="grid grid-cols-5 gap-3">
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">BTC</Label>
                  <Input
                    type="number"
                    value={form.savings_allocation_btc_override}
                    onChange={(e) => setForm({ ...form, savings_allocation_btc_override: e.target.value })}
                    placeholder={String(settings.savings_allocation_btc || 80)}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">Stocks</Label>
                  <Input
                    type="number"
                    value={form.savings_allocation_stocks_override}
                    onChange={(e) => setForm({ ...form, savings_allocation_stocks_override: e.target.value })}
                    placeholder={String(settings.savings_allocation_stocks || 20)}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">Bonds</Label>
                  <Input
                    type="number"
                    value={form.savings_allocation_bonds_override}
                    onChange={(e) => setForm({ ...form, savings_allocation_bonds_override: e.target.value })}
                    placeholder={String(settings.savings_allocation_bonds || 0)}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">Cash</Label>
                  <Input
                    type="number"
                    value={form.savings_allocation_cash_override}
                    onChange={(e) => setForm({ ...form, savings_allocation_cash_override: e.target.value })}
                    placeholder={String(settings.savings_allocation_cash || 0)}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">Other</Label>
                  <Input
                    type="number"
                    value={form.savings_allocation_other_override}
                    onChange={(e) => setForm({ ...form, savings_allocation_other_override: e.target.value })}
                    placeholder={String(settings.savings_allocation_other || 0)}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-400">Leave empty to use current allocation. Total should equal 100%.</p>
            </CollapsibleFormSection>

            {/* One-Time Events */}
            <CollapsibleFormSection title="ONE-TIME EVENTS" defaultOpen={false}>
              <p className="text-xs text-zinc-500 mb-4">Model windfalls, large expenses, inheritance, or bonuses at specific ages.</p>
              
              {/* List existing events */}
              {form.one_time_events && form.one_time_events.length > 0 && (
                <div className="space-y-2 mb-4">
                  {form.one_time_events.map((event) => (
                    <div key={event.id} className="flex items-center gap-2 p-3 bg-zinc-800/50 rounded-lg">
                      <div className="grid grid-cols-4 gap-2 flex-1">
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">Year/Age</Label>
                          <Input
                            type="number"
                            placeholder="Age"
                            value={event.year}
                            onChange={(e) => updateOneTimeEvent(event.id, 'year', e.target.value)}
                            className="bg-zinc-800 border-zinc-700 h-8 text-sm text-zinc-100"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">Amount ($)</Label>
                          <Input
                            type="number"
                            placeholder="+/- amount"
                            value={event.amount}
                            onChange={(e) => updateOneTimeEvent(event.id, 'amount', e.target.value)}
                            className="bg-zinc-800 border-zinc-700 h-8 text-sm text-zinc-100"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">Type</Label>
                          <Select
                            value={event.event_type}
                            onValueChange={(v) => updateOneTimeEvent(event.id, 'event_type', v)}
                          >
                            <SelectTrigger className="bg-zinc-800 border-zinc-700 h-8 text-sm text-zinc-200">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-700">
                              <SelectItem value="windfall" className="text-zinc-200 focus:text-white">Windfall</SelectItem>
                              <SelectItem value="expense" className="text-zinc-200 focus:text-white">Expense</SelectItem>
                              <SelectItem value="inheritance" className="text-zinc-200 focus:text-white">Inheritance</SelectItem>
                              <SelectItem value="income" className="text-zinc-200 focus:text-white">Income</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-zinc-400 text-xs">Description</Label>
                          <Input
                            type="text"
                            placeholder="Description"
                            value={event.description}
                            onChange={(e) => updateOneTimeEvent(event.id, 'description', e.target.value)}
                            className="bg-zinc-800 border-zinc-700 h-8 text-sm text-zinc-100"
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOneTimeEvent(event.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-8 w-8 p-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Add event button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOneTimeEvent}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Event
              </Button>
              
              <p className="text-xs text-zinc-500 mt-3">Use positive amounts for income (inheritance, bonus). Use negative amounts for expenses (-50000 for a large purchase).</p>
            </CollapsibleFormSection>

            {/* Asset Reallocation */}
            <CollapsibleFormSection title="ASSET REALLOCATION" defaultOpen={false}>
              <p className="text-xs text-zinc-500 mb-4">Model selling one asset to buy another. Tax implications are estimated based on your cost basis.</p>
              
              {/* List existing reallocations */}
              {form.asset_reallocations && form.asset_reallocations.length > 0 && (
                <div className="space-y-4 mb-4">
                  {form.asset_reallocations.map((realloc) => {
                    const selectedHolding = holdingsOptions.find(h => h.id === realloc.sell_holding_id);
                    return (
                      <div key={realloc.id} className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-sm font-medium text-zinc-200">Reallocation</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAssetReallocation(realloc.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-6 w-6 p-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        {/* SELL Section */}
                        <div className="mb-4">
                          <Label className="text-orange-400 text-xs font-semibold mb-2 block">SELL</Label>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <Label className="text-zinc-400 text-xs">Asset to Sell</Label>
                              <Select
                                value={realloc.sell_holding_id}
                                onValueChange={(v) => updateAssetReallocation(realloc.id, 'sell_holding_id', v)}
                              >
                                <SelectTrigger className="bg-zinc-800 border-zinc-700 h-9 text-sm text-zinc-200">
                                  <SelectValue placeholder="Select holding" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-700">
                                  {holdingsOptions.map(h => (
                                    <SelectItem key={h.id} value={h.id} className="text-zinc-200 focus:text-white">{h.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-zinc-400 text-xs">Amount to Sell ($)</Label>
                              <Input
                                type="number"
                                placeholder="Amount"
                                value={realloc.sell_amount}
                                onChange={(e) => updateAssetReallocation(realloc.id, 'sell_amount', e.target.value)}
                                className="bg-zinc-800 border-zinc-700 h-9 text-sm text-zinc-100"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-zinc-400 text-xs">Execution Year/Age</Label>
                              <Input
                                type="number"
                                placeholder="Age"
                                value={realloc.execution_year}
                                onChange={(e) => updateAssetReallocation(realloc.id, 'execution_year', e.target.value)}
                                className="bg-zinc-800 border-zinc-700 h-9 text-sm text-zinc-100"
                              />
                            </div>
                          </div>
                        </div>
                        
                        {/* BUY Section */}
                        <div>
                          <Label className="text-emerald-400 text-xs font-semibold mb-2 block">BUY</Label>
                          <div className="grid grid-cols-2 gap-3 mb-2">
                            <div className="space-y-1">
                              <Label className="text-zinc-400 text-xs">Asset Name</Label>
                              <Input
                                type="text"
                                placeholder="e.g., Dividend ETF"
                                value={realloc.buy_asset_name}
                                onChange={(e) => updateAssetReallocation(realloc.id, 'buy_asset_name', e.target.value)}
                                className="bg-zinc-800 border-zinc-700 h-9 text-sm text-zinc-100"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-zinc-400 text-xs">Asset Type</Label>
                              <Select
                                value={realloc.buy_asset_type}
                                onValueChange={(v) => updateAssetReallocation(realloc.id, 'buy_asset_type', v)}
                              >
                                <SelectTrigger className="bg-zinc-800 border-zinc-700 h-9 text-sm text-zinc-200">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-700">
                                  <SelectItem value="stocks" className="text-zinc-200 focus:text-white">Stocks</SelectItem>
                                  <SelectItem value="bonds" className="text-zinc-200 focus:text-white">Bonds</SelectItem>
                                  <SelectItem value="real_estate" className="text-zinc-200 focus:text-white">Real Estate</SelectItem>
                                  <SelectItem value="cash" className="text-zinc-200 focus:text-white">Cash</SelectItem>
                                  <SelectItem value="other" className="text-zinc-200 focus:text-white">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <Label className="text-zinc-400 text-xs">Expected CAGR (%)</Label>
                              <Input
                                type="number"
                                placeholder="7"
                                value={realloc.buy_cagr}
                                onChange={(e) => updateAssetReallocation(realloc.id, 'buy_cagr', e.target.value)}
                                className="bg-zinc-800 border-zinc-700 h-9 text-sm text-zinc-100"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-zinc-400 text-xs">Dividend Yield (%)</Label>
                              <Input
                                type="number"
                                placeholder="0"
                                value={realloc.buy_dividend_yield}
                                onChange={(e) => updateAssetReallocation(realloc.id, 'buy_dividend_yield', e.target.value)}
                                className="bg-zinc-800 border-zinc-700 h-9 text-sm text-zinc-100"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-zinc-400 text-xs">Qualified Dividends</Label>
                              <Select
                                value={realloc.buy_dividend_qualified ? "yes" : "no"}
                                onValueChange={(v) => updateAssetReallocation(realloc.id, 'buy_dividend_qualified', v === "yes")}
                              >
                                <SelectTrigger className="bg-zinc-800 border-zinc-700 h-9 text-sm text-zinc-200">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-700">
                                  <SelectItem value="yes" className="text-zinc-200 focus:text-white">Yes</SelectItem>
                                  <SelectItem value="no" className="text-zinc-200 focus:text-white">No</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Add reallocation button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addAssetReallocation}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Reallocation
              </Button>
            </CollapsibleFormSection>

            {/* BTC Loan Strategy */}
            <CollapsibleFormSection title="BTC LOAN STRATEGY" defaultOpen={false}>
              <p className="text-xs text-zinc-500 mb-4">Model adding a hypothetical BTC-backed loan to see how it affects your plan.</p>
              
              {/* Enable toggle */}
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg mb-4">
                <div>
                  <Label className="text-zinc-200 text-sm">Add Hypothetical BTC Loan</Label>
                  <p className="text-xs text-zinc-500">Simulate taking a new BTC-backed loan</p>
                </div>
                <Switch
                  checked={form.hypothetical_btc_loan?.enabled || false}
                  onCheckedChange={(checked) => setForm({
                    ...form,
                    hypothetical_btc_loan: { ...form.hypothetical_btc_loan, enabled: checked }
                  })}
                />
              </div>
              
              {/* Loan details - only show if enabled */}
              {form.hypothetical_btc_loan?.enabled && (
                <div className="p-4 border border-zinc-700 rounded-lg space-y-4">
                  {/* Row 1: Loan Amount, Interest Rate */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-zinc-300 text-xs">Loan Amount ($)</Label>
                      <Input
                        type="number"
                        placeholder="100000"
                        value={form.hypothetical_btc_loan?.loan_amount || ''}
                        onChange={(e) => setForm({
                          ...form,
                          hypothetical_btc_loan: { ...form.hypothetical_btc_loan, loan_amount: e.target.value }
                        })}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-300 text-xs">Interest Rate (%)</Label>
                      <Input
                        type="number"
                        placeholder="12"
                        value={form.hypothetical_btc_loan?.interest_rate || ''}
                        onChange={(e) => setForm({
                          ...form,
                          hypothetical_btc_loan: { ...form.hypothetical_btc_loan, interest_rate: e.target.value }
                        })}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100"
                      />
                    </div>
                  </div>

                  {/* Row 2: Collateral BTC, Starting LTV */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-zinc-300 text-xs">Collateral BTC</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="2.0"
                        value={form.hypothetical_btc_loan?.collateral_btc || ''}
                        onChange={(e) => setForm({
                          ...form,
                          hypothetical_btc_loan: { ...form.hypothetical_btc_loan, collateral_btc: e.target.value }
                        })}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-300 text-xs">Starting LTV (%)</Label>
                      <Input
                        type="number"
                        placeholder="50"
                        value={form.hypothetical_btc_loan?.ltv || ''}
                        onChange={(e) => setForm({
                          ...form,
                          hypothetical_btc_loan: { ...form.hypothetical_btc_loan, ltv: e.target.value }
                        })}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100"
                      />
                    </div>
                  </div>

                  {/* Row 3: Take Loan at Age, Pay Off at Age */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-zinc-300 text-xs">Take Loan at Age</Label>
                      <Input
                        type="number"
                        placeholder={String(settings?.current_age || "Current age")}
                        value={form.hypothetical_btc_loan?.start_age || ''}
                        onChange={(e) => setForm({
                          ...form,
                          hypothetical_btc_loan: { ...form.hypothetical_btc_loan, start_age: e.target.value }
                        })}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100"
                      />
                      <p className="text-xs text-zinc-500">Leave blank to take loan immediately</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-300 text-xs">Pay Off at Age (Optional)</Label>
                      <Input
                        type="number"
                        placeholder="Never (perpetual)"
                        value={form.hypothetical_btc_loan?.pay_off_age || ''}
                        onChange={(e) => setForm({
                          ...form,
                          hypothetical_btc_loan: { ...form.hypothetical_btc_loan, pay_off_age: e.target.value }
                        })}
                        className="bg-zinc-800 border-zinc-700 text-zinc-100"
                      />
                      <p className="text-xs text-zinc-500">Leave blank for perpetual loan</p>
                    </div>
                  </div>

                  {/* Row 4: Use of Proceeds (full width) */}
                  <div className="space-y-2">
                    <Label className="text-zinc-300 text-xs">Use of Proceeds</Label>
                    <Select
                      value={form.hypothetical_btc_loan?.use_of_proceeds || 'cash'}
                      onValueChange={(v) => setForm({
                        ...form,
                        hypothetical_btc_loan: { ...form.hypothetical_btc_loan, use_of_proceeds: v }
                      })}
                    >
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="cash" className="text-zinc-200 focus:text-white">Add to Cash (for spending)</SelectItem>
                        <SelectItem value="btc" className="text-zinc-200 focus:text-white">Buy More BTC (leverage)</SelectItem>
                        <SelectItem value="stocks" className="text-zinc-200 focus:text-white">Buy Stocks</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* LTV indicator */}
                  {form.hypothetical_btc_loan?.ltv && (
                    <div className="mt-2">
                      <div className={`text-xs px-2 py-1 rounded inline-block ${
                        parseFloat(form.hypothetical_btc_loan.ltv) <= 40 ? 'bg-emerald-900/50 text-emerald-400' :
                        parseFloat(form.hypothetical_btc_loan.ltv) <= 60 ? 'bg-amber-900/50 text-amber-400' :
                        'bg-red-900/50 text-red-400'
                      }`}>
                        {parseFloat(form.hypothetical_btc_loan.ltv) <= 40 ? 'Conservative LTV' :
                         parseFloat(form.hypothetical_btc_loan.ltv) <= 60 ? 'Moderate LTV' :
                         'Aggressive LTV'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CollapsibleFormSection>

            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white">
                Cancel
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-orange-500 to-amber-500 text-white">
                {editingScenario ? 'Update Scenario' : 'Create Scenario'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}