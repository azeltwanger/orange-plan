/**
 * Shared Projection Helper Functions
 * 
 * This file centralizes financial calculation logic used by both FinancialPlan.jsx and Scenarios.jsx
 * to ensure IDENTICAL projection results across pages.
 * 
 * All functions are extracted directly from FinancialPlan.jsx's working implementation.
 */

import { getPowerLawCAGR } from './bitcoinPowerLaw';
import { estimateSocialSecurityBenefit, calculateProgressiveIncomeTax } from '../tax/taxCalculations';
import { getTaxDataForYear, get401kLimit, getRothIRALimit, getTraditionalIRALimit, getHSALimit, getRothIRAIncomeLimit } from './taxConfig';
import { getCustomReturnForYear } from './runProjection';

/**
 * Determines the tax treatment for a given holding.
 * EXACT copy from FinancialPlan.jsx lines 251-266
 * 
 * @param {Object} holding - The holding object
 * @param {Array} accounts - Array of account objects
 * @returns {string} - Tax treatment: 'taxable', 'tax_deferred', 'tax_free', or 'real_estate'
 */
export function getTaxTreatmentFromHolding(holding, accounts) {
  if (holding.account_id && accounts?.length > 0) {
    const account = accounts.find(a => a.id === holding.account_id);
    if (account) {
      const accountType = account.account_type || '';
      if (accountType === 'taxable_real_estate' || account.tax_treatment === 'real_estate') return 'real_estate';
      if (['traditional_401k', 'traditional_ira', 'sep_ira', '403b', '401k_traditional', 'ira_traditional'].includes(accountType)) return 'tax_deferred';
      if (['roth_401k', 'roth_ira', 'hsa', '529', '401k_roth', 'ira_roth'].includes(accountType)) return 'tax_free';
      if (account.tax_treatment) return account.tax_treatment;
    }
  }
  const assetType = holding.asset_type || '';
  if (assetType === 'real_estate') return 'real_estate';
  if (holding.tax_treatment) return holding.tax_treatment;
  return 'taxable';
}

/**
 * Creates a BTC growth rate function with closure over model and parameters.
 * EXACT logic from FinancialPlan.jsx lines 524-575
 * 
 * This returns a FUNCTION that can be passed to runUnifiedProjection.
 * 
 * @param {string} btcReturnModel - 'custom', 'powerlaw', 'saylor24', 'custom_periods', 'conservative'
 * @param {number} effectiveBtcCagr - The custom BTC CAGR percentage
 * @param {Object} customReturnPeriods - Custom return periods object
 * @returns {Function} - Function(yearFromNow, inflationRate) => growth rate percentage
 */
export function createBtcGrowthRateFunction(btcReturnModel, effectiveBtcCagr, customReturnPeriods) {
  return (yearFromNow, inflationRate) => {
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
        rate = getPowerLawCAGR(yearFromNow);
        break;
      case 'saylor24':
        const currentYear = new Date().getFullYear();
        const absoluteYear = currentYear + yearFromNow;

        if (absoluteYear <= 2037) {
          const yearsFromStart = absoluteYear - 2025;
          rate = Math.max(20, 50 - (yearsFromStart * 2.5));
        } else if (absoluteYear <= 2045) {
          rate = 20;
        } else if (absoluteYear <= 2075) {
          const yearsIntoDecline = absoluteYear - 2045;
          const totalDeclineYears = 2075 - 2045;
          const targetRate = inflationRate + 3;
          const declineAmount = 20 - targetRate;
          rate = 20 - (declineAmount * (yearsIntoDecline / totalDeclineYears));
        } else {
          rate = inflationRate + 2;
        }
        break;
      case 'conservative':
        rate = 15;
        break;
      default:
        rate = effectiveBtcCagr;
    }
    
    return rate;
  };
}

/**
 * Calculates comprehensive annual savings considering taxes and retirement contributions.
 * EXACT logic from FinancialPlan.jsx lines 440-473
 * 
 * @param {Object} params - Calculation parameters
 * @returns {Object} - Contains annualSavings and all intermediate calculations
 */
export function calculateComprehensiveAnnualSavings({
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
}) {
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

  return {
    annualSavings,
    estimatedIncomeTax,
    netIncome,
    actual401k,
    actualRoth,
    actualTraditionalIRA,
    actualHSA,
    employer401kMatch: employer401kMatch || 0,
    totalRetirementContributions,
    rothIncomeEligible,
    rothInPhaseOut,
    currentStandardDeduction,
    currentLimit401k,
    currentLimitRoth,
    currentLimitTraditionalIRA,
    currentLimitHSA,
  };
}

/**
 * Derives the effective Social Security amount.
 * EXACT logic from FinancialPlan.jsx lines 436-437
 * 
 * @param {Object} params - Calculation parameters
 * @returns {number} - Effective annual Social Security benefit
 */
export function deriveEffectiveSocialSecurity({
  grossAnnualIncome,
  socialSecurityStartAge,
  socialSecurityAmount,
  useCustomSocialSecurity,
  currentAge,
}) {
  const estimatedSocialSecurity = estimateSocialSecurityBenefit(grossAnnualIncome, socialSecurityStartAge, currentAge);
  return useCustomSocialSecurity ? socialSecurityAmount : estimatedSocialSecurity;
}