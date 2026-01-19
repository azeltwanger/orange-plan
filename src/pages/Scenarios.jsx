import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { runUnifiedProjection } from '@/components/shared/runProjection';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Area, ComposedChart } from 'recharts';
import { Plus, Pencil, Trash2, Target, TrendingUp, TrendingDown, ArrowRight, RefreshCw, ChevronDown, ChevronUp, Sparkles, DollarSign, Calendar, MapPin, PiggyBank, Loader2, Play } from 'lucide-react';
import { getPowerLawCAGR } from '@/components/shared/bitcoinPowerLaw';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useBtcPrice } from '@/components/shared/useBtcPrice';
import { 
  calculateComprehensiveAnnualSavings, 
  deriveEffectiveSocialSecurity, 
  createBtcGrowthRateFunction,
  getTaxTreatmentFromHolding as sharedGetTaxTreatment
} from '@/components/shared/projectionHelpers';

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
  });

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

  const { data: collateralizedLoans = [], isLoading: loansLoading } = useQuery({
    queryKey: ['collateralizedLoans'],
    queryFn: () => base44.entities.CollateralizedLoan.list(),
    staleTime: 5 * 60 * 1000,
  });

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

  const isLoading = holdingsLoading || accountsLoading || liabilitiesLoading || loansLoading || goalsLoading || eventsLoading || settingsLoading || scenariosLoading || priceLoading;

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
    const grossAnnualIncome = effectiveSettings.gross_annual_income ?? 100000;
    const currentAnnualSpending = effectiveSettings.current_annual_spending ?? 80000;
    const filingStatus = effectiveSettings.filing_status || 'single';
    const contribution401k = effectiveSettings.contribution_401k ?? 0;
    const employer401kMatch = effectiveSettings.employer_401k_match ?? 0;
    const contributionRothIRA = effectiveSettings.contribution_roth_ira ?? 0;
    const contributionTraditionalIRA = effectiveSettings.contribution_traditional_ira ?? 0;
    const contributionHSA = effectiveSettings.contribution_hsa ?? 0;
    const hsaFamilyCoverage = effectiveSettings.hsa_family_coverage || false;

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
    const getBtcGrowthRate = createBtcGrowthRateFunction(
      btcReturnModel, 
      btcCagr, 
      effectiveSettings.custom_return_periods || {}
    );

    return {
      holdings,
      accounts,
      liabilities: liabilities || [],
      collateralizedLoans: collateralizedLoans || [],
      currentPrice,
      currentAge,
      retirementAge,
      lifeExpectancy,
      retirementAnnualSpending: retirementSpending,
      effectiveSocialSecurity,
      socialSecurityStartAge: ssStartAge,
      otherRetirementIncome: effectiveSettings.other_retirement_income || 0,
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
      lifeEvents: lifeEvents || [],
      getTaxTreatmentFromHolding: (holding) => sharedGetTaxTreatment(holding, accounts),
      customReturnPeriods: effectiveSettings.custom_return_periods || {},
      tickerReturns: effectiveSettings.ticker_returns || {},
    };
  };

  // Run baseline projection
  const baselineProjection = useMemo(() => {
    if (!holdings.length || !accounts.length || !userSettings.length || !currentPrice || !collateralizedLoans) return null;
    try {
      const params = buildProjectionParams();
      return runUnifiedProjection(params);
    } catch (error) {
      console.error('Baseline projection error:', error);
      return null;
    }
  }, [holdings, accounts, liabilities, collateralizedLoans, goals, lifeEvents, userSettings, budgetItems, currentPrice]);

  // Run scenario projection
  const selectedScenario = scenarios.find(s => s.id === selectedScenarioId);
  
  const scenarioProjection = useMemo(() => {
    if (!selectedScenario || !holdings.length || !accounts.length || !userSettings.length || !currentPrice || !collateralizedLoans) return null;
    try {
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
      };
      const params = buildProjectionParams(overrides);
      return runUnifiedProjection(params);
    } catch (error) {
      console.error('Scenario projection error:', error);
      return null;
    }
  }, [selectedScenario, holdings, accounts, liabilities, collateralizedLoans, goals, lifeEvents, userSettings, budgetItems, currentPrice]);

  // Calculate max drawdown BTC can survive without liquidation
  const calculateMaxDrawdownSurvived = useCallback(() => {
    if (!collateralizedLoans || collateralizedLoans.length === 0) {
      return null; // No BTC loans
    }

    // Find the loan with highest LTV (most at risk)
    let worstDrawdown = 100; // Start with best case
    
    for (const loan of collateralizedLoans) {
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
  }, [collateralizedLoans, currentPrice]);

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

  // BTC volatility model - starts high and decays over time (same as FinancialPlan.jsx)
  const getBtcVolatilityForMonteCarlo = useCallback((yearsFromNow) => {
    const initialVolatility = 55;
    const minimumVolatility = 20;
    const decayRate = 0.05;
    return minimumVolatility + (initialVolatility - minimumVolatility) * Math.exp(-decayRate * yearsFromNow);
  }, []);

  // Generate random paths ONCE for consistent A/B comparison
  const generateRandomPaths = useCallback((numSimulations, projectionYears, baseParams) => {
    const paths = [];
    
    // Helper: Generate random normal using Box-Muller with seeded values
    const randomNormal = () => {
      const u1 = Math.max(0.0001, Math.random());
      const u2 = Math.random();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };

    for (let sim = 0; sim < numSimulations; sim++) {
      const yearlyReturnOverrides = {
        btc: [],
        stocks: [],
        bonds: [],
        realEstate: [],
        cash: [],
        other: [],
        // Store the random Z-scores so we can reconstruct with different expected returns
        zScores: []
      };

      for (let year = 0; year <= projectionYears; year++) {
        const z1 = randomNormal();
        const z2 = randomNormal();
        const z3 = randomNormal();
        const z4 = randomNormal();
        const z5 = randomNormal();
        const z6 = randomNormal();

        yearlyReturnOverrides.zScores.push({ z1, z2, z3, z4, z5, z6 });

        // BTC: Use getBtcGrowthRate as expected return, add volatility
        const expectedBtcReturn = baseParams.getBtcGrowthRate(year, baseParams.effectiveInflation);
        const btcVolatility = getBtcVolatilityForMonteCarlo(year);
        const btcReturn = Math.max(-60, Math.min(200, expectedBtcReturn + btcVolatility * z1));

        // Stocks
        const stocksVolatilityVal = 18;
        const stocksReturn = Math.max(-40, Math.min(50, baseParams.effectiveStocksCagr + stocksVolatilityVal * z2));

        // Real Estate (+/- 5%)
        const realEstateReturn = baseParams.realEstateCagr + 5 * z3;

        // Bonds (+/- 2%)
        const bondsReturn = baseParams.bondsCagr + 2 * z4;

        // Cash (+/- 1%)
        const cashReturn = baseParams.cashCagr + 1 * z5;

        // Other (+/- 3%)
        const otherReturn = baseParams.otherCagr + 3 * z6;

        yearlyReturnOverrides.btc.push(btcReturn);
        yearlyReturnOverrides.stocks.push(stocksReturn);
        yearlyReturnOverrides.bonds.push(bondsReturn);
        yearlyReturnOverrides.realEstate.push(realEstateReturn);
        yearlyReturnOverrides.cash.push(cashReturn);
        yearlyReturnOverrides.other.push(otherReturn);
      }

      paths.push(yearlyReturnOverrides);
    }

    return paths;
  }, [getBtcVolatilityForMonteCarlo]);

  // Regenerate return overrides for a different parameter set using same Z-scores
  const regenerateReturnsForParams = useCallback((path, params) => {
    const newOverrides = {
      btc: [],
      stocks: [],
      bonds: [],
      realEstate: [],
      cash: [],
      other: []
    };

    for (let year = 0; year < path.zScores.length; year++) {
      const { z1, z2, z3, z4, z5, z6 } = path.zScores[year];

      // BTC with scenario's expected return
      const expectedBtcReturn = params.getBtcGrowthRate(year, params.effectiveInflation);
      const btcVolatility = getBtcVolatilityForMonteCarlo(year);
      const btcReturn = Math.max(-60, Math.min(200, expectedBtcReturn + btcVolatility * z1));

      // Stocks with scenario's expected return
      const stocksVolatilityVal = 18;
      const stocksReturn = Math.max(-40, Math.min(50, params.effectiveStocksCagr + stocksVolatilityVal * z2));

      // Real Estate
      const realEstateReturn = params.realEstateCagr + 5 * z3;

      // Bonds
      const bondsReturn = params.bondsCagr + 2 * z4;

      // Cash
      const cashReturn = params.cashCagr + 1 * z5;

      // Other
      const otherReturn = params.otherCagr + 3 * z6;

      newOverrides.btc.push(btcReturn);
      newOverrides.stocks.push(stocksReturn);
      newOverrides.bonds.push(bondsReturn);
      newOverrides.realEstate.push(realEstateReturn);
      newOverrides.cash.push(cashReturn);
      newOverrides.other.push(otherReturn);
    }

    return newOverrides;
  }, [getBtcVolatilityForMonteCarlo]);

  // Check if scenario affects loan/liquidation parameters
  const scenarioAffectsLiquidation = useCallback((scenario) => {
    if (!scenario) return false;
    // Only these overrides affect liquidation risk
    return (
      scenario.btc_cagr_override !== null && scenario.btc_cagr_override !== undefined ||
      scenario.savings_allocation_btc_override !== null && scenario.savings_allocation_btc_override !== undefined
    );
  }, []);

  // Run Monte Carlo comparison with SAME random paths for both baseline and scenario
  const runMonteCarloComparison = useCallback((baselineParams, scenarioParams, numSimulations = 1000) => {
    const projectionYears = Math.max(
      baselineParams.lifeExpectancy - baselineParams.currentAge + 1,
      scenarioParams ? scenarioParams.lifeExpectancy - scenarioParams.currentAge + 1 : 0
    );

    // Generate paths once using baseline params
    const paths = generateRandomPaths(numSimulations, projectionYears, baselineParams);

    let baselineSuccess = 0;
    let scenarioSuccess = 0;
    let baselineLiquidations = 0;
    let scenarioLiquidations = 0;

    for (let i = 0; i < paths.length; i++) {
      // Run baseline with original path
      const baseResult = runUnifiedProjection({
        ...baselineParams,
        yearlyReturnOverrides: paths[i],
        DEBUG: false,
      });

      if (baseResult.survives) baselineSuccess++;
      const baseHasLiquidation = baseResult.yearByYear?.some(y => 
        y.liquidations?.some(l => l.type !== 'top_up' && l.type !== 'release')
      );
      if (baseHasLiquidation) baselineLiquidations++;

      // Run scenario with regenerated returns (same Z-scores, different expected returns if changed)
      if (scenarioParams) {
        const scenarioOverrides = regenerateReturnsForParams(paths[i], scenarioParams);
        const scenResult = runUnifiedProjection({
          ...scenarioParams,
          yearlyReturnOverrides: scenarioOverrides,
          DEBUG: false,
        });

        if (scenResult.survives) scenarioSuccess++;
        const scenHasLiquidation = scenResult.yearByYear?.some(y => 
          y.liquidations?.some(l => l.type !== 'top_up' && l.type !== 'release')
        );
        if (scenHasLiquidation) scenarioLiquidations++;
      }
    }

    return {
      baselineSuccessRate: (baselineSuccess / numSimulations) * 100,
      scenarioSuccessRate: scenarioParams ? (scenarioSuccess / numSimulations) * 100 : null,
      baselineLiquidationRisk: (baselineLiquidations / numSimulations) * 100,
      scenarioLiquidationRisk: scenarioParams ? (scenarioLiquidations / numSimulations) * 100 : null,
      numSimulations,
    };
  }, [generateRandomPaths, regenerateReturnsForParams]);

  // Binary search for max sustainable spending with shared paths
  const findMaxSustainableSpendingWithPaths = useCallback((baseParams, numSimulations = 200) => {
    let low = 10000;
    let high = 500000;
    let maxSpending = low;

    // Generate paths once for all iterations
    const projectionYears = baseParams.lifeExpectancy - baseParams.currentAge + 1;
    const paths = generateRandomPaths(numSimulations, projectionYears, baseParams);

    for (let iteration = 0; iteration < 15; iteration++) {
      const testSpending = Math.round((low + high) / 2);
      const testParams = { ...baseParams, retirementAnnualSpending: testSpending };
      
      let successCount = 0;
      for (let i = 0; i < paths.length; i++) {
        const result = runUnifiedProjection({
          ...testParams,
          yearlyReturnOverrides: paths[i],
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
  }, [generateRandomPaths]);

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
          };
          scenarioParams = buildProjectionParams(overrides);
        }

        // Run comparison with shared random paths (1000 simulations)
        const mcResults = runMonteCarloComparison(baselineParams, scenarioParams, 1000);

        // Find max sustainable spending for baseline
        const baselineMaxSpending = findMaxSustainableSpendingWithPaths(baselineParams, 200);
        
        // Check if liquidation difference is meaningful
        const liquidationAffected = scenarioAffectsLiquidation(selectedScenario);

        setBaselineMonteCarloResults({
          successRate: mcResults.baselineSuccessRate,
          liquidationRisk: mcResults.baselineLiquidationRisk,
          maxSustainableSpending: baselineMaxSpending,
          numSimulations: mcResults.numSimulations,
        });

        if (scenarioParams) {
          // Find max sustainable spending for scenario
          const scenarioMaxSpending = findMaxSustainableSpendingWithPaths(scenarioParams, 200);
          
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
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
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
    });
    setFormOpen(true);
  };

  // Format helpers
  const formatCurrency = (num) => {
    if (num === null || num === undefined) return '-';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
    return `$${num.toLocaleString()}`;
  };

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
                    (scenarioMetrics.depleteAge || 999) >= (baselineMetrics.depleteAge || 999) ? "text-emerald-400" : "text-rose-400"
                  )}>
                    {baselineMetrics.survives && scenarioMetrics.survives ? '-' :
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
                <tr className="border-b border-zinc-800/50">
                  <td className="py-3 px-4 text-zinc-200">Lifetime Taxes Paid</td>
                  <td className="py-3 px-4 text-right font-mono text-zinc-200">{formatCurrency(baselineMetrics.lifetimeTaxes)}</td>
                  <td className="py-3 px-4 text-right font-mono text-zinc-200">{formatCurrency(scenarioMetrics.lifetimeTaxes)}</td>
                  <td className={cn("py-3 px-4 text-right font-mono", scenarioMetrics.lifetimeTaxes <= baselineMetrics.lifetimeTaxes ? "text-emerald-400" : "text-rose-400")}>
                    {formatDelta(baselineMetrics.lifetimeTaxes, scenarioMetrics.lifetimeTaxes)}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-zinc-200">BTC at Retirement</td>
                  <td className="py-3 px-4 text-right font-mono text-zinc-200">{baselineMetrics.btcAtRetirement?.toFixed(2) || '0'} BTC</td>
                  <td className="py-3 px-4 text-right font-mono text-zinc-200">{scenarioMetrics.btcAtRetirement?.toFixed(2) || '0'} BTC</td>
                  <td className={cn("py-3 px-4 text-right font-mono", (scenarioMetrics.btcAtRetirement || 0) >= (baselineMetrics.btcAtRetirement || 0) ? "text-emerald-400" : "text-rose-400")}>
                    {(() => {
                      const diff = (scenarioMetrics.btcAtRetirement || 0) - (baselineMetrics.btcAtRetirement || 0);
                      if (Math.abs(diff) < 0.01) return <span className="text-zinc-500">≈ same</span>;
                      return <>{diff >= 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(2)} BTC</>;
                    })()}
                  </td>
                </tr>
                
                {/* Plan Confidence Section */}
                {(baselineMonteCarloResults || monteCarloRunning) && (
                  <>
                    <tr className="border-t-2 border-purple-500/30">
                      <td colSpan={4} className="py-2 px-4 text-xs text-purple-400 font-semibold uppercase tracking-wide">
                        Plan Confidence ({baselineMonteCarloResults?.numSimulations?.toLocaleString() || '1,000'} scenarios)
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-800/50">
                      <td className="py-3 px-4 text-zinc-200">Plan Success Rate</td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-200">
                        {monteCarloRunning && !baselineMonteCarloResults ? (
                          <Loader2 className="w-4 h-4 animate-spin inline" />
                        ) : baselineMonteCarloResults ? (
                          <span className={baselineMonteCarloResults.successRate >= 85 ? "text-emerald-400" : baselineMonteCarloResults.successRate >= 70 ? "text-amber-400" : "text-orange-500"}>
                            {baselineMonteCarloResults.successRate.toFixed(1)}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-200">
                        {monteCarloRunning && !scenarioMonteCarloResults ? (
                          <Loader2 className="w-4 h-4 animate-spin inline" />
                        ) : scenarioMonteCarloResults ? (
                          <span className={scenarioMonteCarloResults.successRate >= 85 ? "text-emerald-400" : scenarioMonteCarloResults.successRate >= 70 ? "text-amber-400" : "text-orange-500"}>
                            {scenarioMonteCarloResults.successRate.toFixed(1)}%
                          </span>
                        ) : '-'}
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
                        })() : '-'}
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-800/50">
                      <td className="py-3 px-4 text-zinc-200">Liquidation Risk</td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-200">
                        {monteCarloRunning && !baselineMonteCarloResults ? (
                          <Loader2 className="w-4 h-4 animate-spin inline" />
                        ) : baselineMonteCarloResults ? (() => {
                          const risk = baselineMonteCarloResults.liquidationRisk;
                          if (risk === 0) return <span className="text-emerald-400">None</span>;
                          if (risk <= 20) return <span className="text-amber-400">Low ({risk.toFixed(0)}%)</span>;
                          if (risk <= 50) return <span className="text-orange-500">Moderate ({risk.toFixed(0)}%)</span>;
                          return <span className="text-rose-400">High ({risk.toFixed(0)}%)</span>;
                        })() : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-200">
                        {monteCarloRunning && !scenarioMonteCarloResults ? (
                          <Loader2 className="w-4 h-4 animate-spin inline" />
                        ) : scenarioMonteCarloResults ? (() => {
                          const risk = scenarioMonteCarloResults.liquidationRisk;
                          if (risk === 0) return <span className="text-emerald-400">None</span>;
                          if (risk <= 20) return <span className="text-amber-400">Low ({risk.toFixed(0)}%)</span>;
                          if (risk <= 50) return <span className="text-orange-500">Moderate ({risk.toFixed(0)}%)</span>;
                          return <span className="text-rose-400">High ({risk.toFixed(0)}%)</span>;
                        })() : '-'}
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
                        })() : '-'}
                      </td>
                    </tr>
                    <tr className="border-b border-zinc-800/50">
                      <td className="py-3 px-4 text-zinc-200">Max Drawdown Survived</td>
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
                      <td className="py-3 px-4 text-zinc-200">Safe Spending Level</td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-200">
                        {monteCarloRunning && !baselineMonteCarloResults ? (
                          <Loader2 className="w-4 h-4 animate-spin inline" />
                        ) : baselineMonteCarloResults ? (
                          formatCurrency(baselineMonteCarloResults.maxSustainableSpending) + '/yr'
                        ) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-200">
                        {monteCarloRunning && !scenarioMonteCarloResults ? (
                          <Loader2 className="w-4 h-4 animate-spin inline" />
                        ) : scenarioMonteCarloResults ? (
                          formatCurrency(scenarioMonteCarloResults.maxSustainableSpending) + '/yr'
                        ) : '-'}
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
                        })() : '-'}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Scenario Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">{editingScenario ? 'Edit Scenario' : 'Create New Scenario'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
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
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-zinc-100 border-b border-zinc-800 pb-2">Retirement Settings</h4>
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
            </div>

            {/* State Override */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-zinc-100 border-b border-zinc-800 pb-2">Location</h4>
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
            </div>

            {/* Return Assumptions */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-zinc-100 border-b border-zinc-800 pb-2">Return Assumptions</h4>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300 text-xs">BTC CAGR (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.btc_cagr_override}
                    onChange={(e) => setForm({ ...form, btc_cagr_override: e.target.value })}
                    placeholder={String(settings.btc_cagr_assumption || 25)}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
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

            {/* Social Security */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-zinc-100 border-b border-zinc-800 pb-2">Social Security</h4>
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
            </div>

            {/* Savings Allocation */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-zinc-100 border-b border-zinc-800 pb-2">Savings Allocation (%)</h4>
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
            </div>

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