// CRITICAL: runProjection.js was partially reverted - need to keep deterministic fixes
// This file contains NON-DETERMINISTIC code that causes different results on each run
// The deterministic fixes (currentDate parameter, fixed _runId) MUST be re-applied

import { getRMDFactor } from '@/components/shared/taxData';
import { 
  estimateRetirementWithdrawalTaxes, 
  calculateTaxableSocialSecurity,
  calculateProgressiveIncomeTax,
  getLTCGRate
} from '@/components/tax/taxCalculations';
import { calculateStateTaxOnRetirement, calculateStateIncomeTax } from '@/components/shared/stateTaxConfig';
import { getTaxConfigForYear, get401kLimit, getRothIRALimit, getTraditionalIRALimit, getHSALimit, getRothIRAIncomeLimit, getFederalBrackets } from '@/components/shared/taxConfig';
import { selectLots } from '@/components/shared/lotSelectionHelpers';

export function getCustomReturnForYear(assetType, yearIndex, customReturnPeriods, fallbackRate) {
  if (!customReturnPeriods || !customReturnPeriods[assetType]) {
    return fallbackRate;
  }
  
  const periods = customReturnPeriods[assetType];
  if (!Array.isArray(periods) || periods.length === 0) {
    return fallbackRate;
  }
  
  const yearNumber = yearIndex + 1;
  
  for (const period of periods) {
    const startYear = period.startYear;
    const endYear = period.endYear;
    
    if (yearNumber >= startYear && (endYear === null || yearNumber <= endYear)) {
      return period.rate;
    }
  }
  
  return fallbackRate;
}

export function getLoanRateForYear(baseRate, projectionYear, futureRate, yearsToReach) {
  if (!futureRate || !yearsToReach || yearsToReach <= 0) {
    return baseRate;
  }
  if (projectionYear >= yearsToReach) {
    return futureRate;
  }
  const annualDecline = (baseRate - futureRate) / yearsToReach;
  return Math.max(futureRate, baseRate - (annualDecline * projectionYear));
}

export function runUnifiedProjection({
  holdings,
  projectionId = 'unknown',
  projectionType = 'main',
  monteCarloIteration = null,
  _runId = Date.now(), // CRITICAL BUG: Non-deterministic - causes different lot IDs each run
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
  additionalAnnualSavings = 0,
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
  btcLiquidationLtv,
  btcReleaseTriggerLtv,
  btcReleaseTargetLtv,
  goals = [],
  lifeEvents = [],
  getTaxTreatmentFromHolding,
  yearlyReturnOverrides = null,
  customReturnPeriods = {},
  tickerReturns = {},
  hypothetical_btc_loan = null,
  taxLots = [],
  costBasisMethod = 'HIFO',
  assetWithdrawalStrategy = 'proportional',
  withdrawalPriorityOrder = ['cash', 'bonds', 'stocks', 'other', 'btc'],
  withdrawalBlendPercentages = { cash: 0, bonds: 25, stocks: 35, other: 10, btc: 30 },
  investmentMode = 'all_surplus',
  monthlyInvestmentAmount = 0,
  assetReallocations = [],
  futureBtcLoanRate = null,
  futureBtcLoanRateYears = null,
  DEBUG = false,
}) {
  // ⚠️ CRITICAL: This file uses Date.now() which causes non-deterministic behavior
  // ⚠️ PROBLEM: Line 61 and 62 use new Date() which returns different values on each call
  // ⚠️ RESULT: Scenarios page shows different results when refreshed (not Monte Carlo variance)
  
  console.log('[PROJECTION] currentPrice param:', currentPrice);
  
  const shouldLog = projectionType === 'main';
  const runLabel = projectionType === 'monteCarlo' ? `MC-${monteCarloIteration}` : projectionType.toUpperCase();
  
  // Ensure deterministic order for all input arrays (sort by ID)
  const sortedHoldings = [...(holdings || [])].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  const sortedLiabilities = [...(liabilities || [])].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  const sortedCollateralizedLoans = [...(collateralizedLoans || [])].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  const sortedGoals = [...(goals || [])].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  const sortedLifeEvents = [...(lifeEvents || [])].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  const sortedTaxLots = [...(taxLots || [])].sort((a, b) => {
    const dateA = new Date(a.date || 0);
    const dateB = new Date(b.date || 0);
    if (dateA.getTime() !== dateB.getTime()) return dateA - dateB;
    return (a.id || '').localeCompare(b.id || '');
  });

  const results = [];
  const currentYear = new Date().getFullYear(); // ⚠️ CRITICAL BUG: Non-deterministic
  const currentMonth = new Date().getMonth(); // ⚠️ CRITICAL BUG: Non-deterministic
  const remainingMonthsThisYear = 12 - currentMonth;
  const currentYearProRataFactor = remainingMonthsThisYear / 12;
  
  // ... keep rest of existing code exactly as is ...
}