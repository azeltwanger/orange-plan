import { 
  calculateComprehensiveAnnualSavings, 
  deriveEffectiveSocialSecurity, 
  createBtcGrowthRateFunction,
  getTaxTreatmentFromHolding
} from '@/components/shared/projectionHelpers';

/**
 * Build projection parameters from UserSettings and optional scenario overrides.
 * 
 * This is the SINGLE SOURCE OF TRUTH for projection parameters used by both:
 * - FinancialPlan.jsx (baseline projections)
 * - Scenarios.jsx (baseline + scenario comparison)
 * 
 * @param {Object} settings - UserSettings entity record
 * @param {Object} overrides - Scenario overrides (defaults to {})
 * @param {Object} data - Required data dependencies
 * @returns {Object} - Complete params object for runUnifiedProjection
 */
const DEBUG = false; // Set to true to enable debug logging

export function buildProjectionParams(settings, overrides = {}, data) {
  
  const {
    holdings,
    accounts,
    liabilities,
    btcCollateralizedLoans,
    goals,
    lifeEvents,
    activeTaxLots,
    currentPrice,
  } = data;

  // Merge settings with overrides - overrides take precedence
  const effectiveSettings = { ...settings, ...overrides };
  
  // Extract all parameters with fallback defaults
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

  const investmentMode = effectiveSettings.investment_mode_override || effectiveSettings.investment_mode || 'all_surplus';
  const monthlyInvestmentAmount = effectiveSettings.monthly_investment_amount_override ?? effectiveSettings.monthly_investment_amount ?? 0;

  // Income and spending
  const grossAnnualIncome = effectiveSettings.gross_annual_income_override ?? effectiveSettings.gross_annual_income ?? 100000;
  const currentAnnualSpending = effectiveSettings.current_annual_spending_override ?? effectiveSettings.current_annual_spending ?? 80000;
  const filingStatus = effectiveSettings.filing_status || 'single';
  const contribution401k = effectiveSettings.contribution_401k ?? 0;
  const contribution401kEndAge = effectiveSettings.contribution_401k_end_age || null;
  const employer401kMatch = effectiveSettings.employer_401k_match ?? 0;
  const contributionRothIRA = effectiveSettings.contribution_roth_ira ?? 0;
  const contributionRothIRAEndAge = effectiveSettings.contribution_roth_ira_end_age || null;
  const contributionTraditionalIRA = effectiveSettings.contribution_traditional_ira ?? 0;
  const contributionTraditionalIRAEndAge = effectiveSettings.contribution_traditional_ira_end_age || null;
  const contributionHSA = effectiveSettings.contribution_hsa ?? 0;
  const contributionHSAEndAge = effectiveSettings.contribution_hsa_end_age || null;
  const hsaFamilyCoverage = effectiveSettings.hsa_family_coverage || false;
  const coveredByEmployerPlan = effectiveSettings.covered_by_employer_plan || false;
  const spouseCoveredByEmployerPlan = effectiveSettings.spouse_covered_by_employer_plan || false;

  // Solo 401k settings
  const solo401kEnabled = effectiveSettings.solo_401k_enabled || false;
  const solo401kType = effectiveSettings.solo_401k_type || 'traditional';
  const solo401kEmployeeContribution = effectiveSettings.solo_401k_employee_contribution ?? 0;
  const solo401kEmployerContributionPercent = effectiveSettings.solo_401k_employer_contribution_percent ?? 0;
  const solo401kEndAge = effectiveSettings.solo_401k_end_age || null;

  // Dividend income parameters
  const dividendIncome = effectiveSettings.dividend_income_override ?? 0;
  const dividendIncomeQualified = effectiveSettings.dividend_income_qualified ?? true;

  // Process one-time events from scenario into lifeEvents format
  // IMPORTANT: one_time_events use AGE (e.g., 50), but lifeEvents use CALENDAR YEAR
  const currentYear = new Date().getFullYear();
  const scenarioOneTimeEvents = (effectiveSettings.one_time_events || []).map(event => {
    const originalAmount = parseFloat(event.amount) || 0;
    const eventType = event.event_type || (originalAmount >= 0 ? 'income_change' : 'expense_change');

    // Convert age to calendar year: event.year is AGE, we need CALENDAR YEAR
    const eventAge = parseInt(event.year) || currentAge;
    const eventCalendarYear = currentYear + (eventAge - currentAge);

    // Determine if this is an expense (negative amount OR expense event type)
    const isExpense = originalAmount < 0 || eventType === 'expense';

    // For inheritance, windfall, gift - preserve event_type so runUnifiedProjection handles correctly
    const preserveEventType = ['inheritance', 'windfall', 'gift', 'asset_sale'].includes(eventType);

    // Determine final event_type and affects
    let finalEventType, finalAffects;
    if (preserveEventType) {
      finalEventType = eventType;
      finalAffects = 'assets';
    } else if (isExpense) {
      finalEventType = 'expense_change';
      finalAffects = 'expenses';
    } else {
      // Positive income (windfall, income, etc.)
      finalEventType = eventType === 'income' ? 'income_change' : eventType;
      finalAffects = 'assets'; // Income adds to assets
    }

    if (DEBUG) {
      console.log(`🟡 Building one-time event: ${event.description || eventType}`, {
        originalAmount,
        eventType,
        isExpense,
        preserveEventType,
        finalEventType,
        finalAffects,
        eventAge,
        eventCalendarYear
      });
    }

    return {
      id: `scenario_event_${event.id || Date.now()}`,
      name: event.description || `${eventType} at age ${eventAge}`,
      event_type: finalEventType,
      year: eventCalendarYear,
      amount: Math.abs(originalAmount), // Always positive - sign determined by event_type/affects
      is_recurring: false,
      affects: finalAffects,
      _isOneTime: true,
      _originalAmount: originalAmount,
      _originalAge: eventAge
    };
  });
  
  // Combine with existing life events
  const combinedLifeEvents = [...(lifeEvents || []), ...scenarioOneTimeEvents];
  
  // DEBUG: Log life events being combined
  if (DEBUG || true) {
    console.log('🟡 buildProjectionParams - Life Events:', {
      baseline_count: lifeEvents?.length || 0,
      scenario_events_count: scenarioOneTimeEvents?.length || 0,
      combined_count: combinedLifeEvents?.length || 0,
      baseline_events: lifeEvents?.map(e => ({
        name: e.name,
        event_type: e.event_type,
        year: e.year,
        amount: e.amount,
        is_recurring: e.is_recurring,
        recurring_years: e.recurring_years
      })),
      combined_events: combinedLifeEvents?.map(e => ({
        name: e.name,
        event_type: e.event_type,
        year: e.year,
        amount: e.amount,
        is_recurring: e.is_recurring,
        recurring_years: e.recurring_years
      }))
    });
  }

  // Process liabilities - filter OUT btc_collateralized since they're in btcCollateralizedLoans
  // This prevents double-counting debt and collateral
  let scenarioLiabilities = [...(liabilities || [])].filter(l => l.type !== 'btc_collateralized');
  let scenarioCollateralizedLoans = [...(btcCollateralizedLoans || [])];

  // Asset reallocations for future processing
  const assetReallocations = effectiveSettings.asset_reallocations || [];

  // Use shared helper for comprehensive annual savings (accounts for taxes, retirement contributions)
  const savingsResult = calculateComprehensiveAnnualSavings({
    grossAnnualIncome,
    currentAnnualSpending,
    filingStatus,
    contribution401k,
    contribution401kEndAge,
    employer401kMatch,
    contributionRothIRA,
    contributionRothIRAEndAge,
    contributionTraditionalIRA,
    contributionTraditionalIRAEndAge,
    contributionHSA,
    contributionHSAEndAge,
    hsaFamilyCoverage,
    currentAge,
  });

  // Use shared helper for effective Social Security
  const effectiveSocialSecurity = deriveEffectiveSocialSecurity({
    grossAnnualIncome,
    socialSecurityStartAge: ssStartAge,
    socialSecurityAmount: ssAmount,
    useCustomSocialSecurity,
    currentAge,
  });

  // Use shared helper for BTC growth rate function
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
    otherRetirementIncome: (effectiveSettings.other_retirement_income ?? 0) + dividendIncome,
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
    solo401kEnabled,
    solo401kType,
    solo401kEmployeeContribution,
    solo401kEmployerContributionPercent,
    solo401kEndAge,
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
    investmentMode,
    monthlyInvestmentAmount,
    autoTopUpBtcCollateral: effectiveSettings.auto_top_up_btc_collateral ?? settings.auto_top_up_btc_collateral ?? true,
    btcTopUpTriggerLtv: effectiveSettings.btc_top_up_trigger_ltv ?? settings.btc_top_up_trigger_ltv ?? 70,
    btcTopUpTargetLtv: effectiveSettings.btc_top_up_target_ltv ?? settings.btc_top_up_target_ltv ?? 50,
    btcLiquidationLtv: effectiveSettings.btc_liquidation_ltv ?? settings.btc_liquidation_ltv ?? 80,
    btcReleaseTriggerLtv: effectiveSettings.btc_release_trigger_ltv ?? settings.btc_release_trigger_ltv ?? 30,
    btcReleaseTargetLtv: effectiveSettings.btc_release_target_ltv ?? settings.btc_release_target_ltv ?? 40,
    goals: goals || [],
    lifeEvents: combinedLifeEvents,
    getTaxTreatmentFromHolding: (holding) => getTaxTreatmentFromHolding(holding, accounts),
    customReturnPeriods: effectiveSettings.custom_return_periods_override || effectiveSettings.custom_return_periods || {},
    tickerReturns: effectiveSettings.ticker_returns_override || effectiveSettings.ticker_returns || {},
    dividendIncomeQualified,
    assetReallocations,
    hypothetical_btc_loan: effectiveSettings.hypothetical_btc_loan ?? null,
    futureBtcLoanRate: effectiveSettings.future_btc_loan_rate ?? settings.future_btc_loan_rate ?? null,
    futureBtcLoanRateYears: effectiveSettings.future_btc_loan_rate_years ?? settings.future_btc_loan_rate_years ?? 0,
    taxLots: activeTaxLots,
    assetWithdrawalStrategy: effectiveSettings.asset_withdrawal_strategy ?? settings.asset_withdrawal_strategy ?? 'proportional',
    withdrawalPriorityOrder: effectiveSettings.withdrawal_priority_order ?? settings.withdrawal_priority_order ?? ['cash', 'bonds', 'stocks', 'other', 'btc'],
    withdrawalBlendPercentages: effectiveSettings.withdrawal_blend_percentages ?? settings.withdrawal_blend_percentages ?? { cash: 0, bonds: 25, stocks: 35, other: 10, btc: 30 },
    costBasisMethod: effectiveSettings.cost_basis_method ?? settings.cost_basis_method ?? 'HIFO',
    roth_conversions: effectiveSettings.roth_conversions || null,
  };
}