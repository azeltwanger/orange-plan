// Import centralized tax configuration
import { 
  getTaxConfigForYear,
  getIncomeTaxRate,
  getLTCGRate,
  getSTCGRate,
  calculateProgressiveIncomeTax,
  getStandardDeduction,
  STANDARD_DEDUCTIONS,
  INCOME_TAX_BRACKETS,
  getTaxDataForYear
} from '@/components/shared/taxConfig';

/**
 * Estimate Social Security benefit based on current income.
 * Uses simplified PIA (Primary Insurance Amount) calculation with bend points.
 * 
 * Formula:
 * 1. Calculate AIME (Average Indexed Monthly Earnings) from current income
 * 2. Apply bend points to determine PIA:
 *    - 90% of first $1,226
 *    - 32% of amount between $1,226 and $7,391
 *    - 15% of amount above $7,391
 * 3. Adjust for claiming age (reductions if early, increases if delayed)
 * 
 * @param {number} currentIncome - Current gross annual income (capped at SS wage base)
 * @param {number} claimingAge - Age to start SS (62-70). FRA=67 for those born 1960+
 * @param {number} currentAge - Current age (not used in simplified calculation)
 * @returns {number} - Estimated annual SS benefit in today's dollars
 */
export function estimateSocialSecurityBenefit(currentIncome, claimingAge = 67, currentAge = 35) {
  // SS wage base cap (2024) - income above this doesn't count
  const ssWageBase = 168600;
  const cappedIncome = Math.min(currentIncome, ssWageBase);
  
  // Estimate AIME (Average Indexed Monthly Earnings)
  // Simplified: assume current income represents career average
  const aime = cappedIncome / 12;
  
  // 2024 bend points for PIA calculation
  const bendPoint1 = 1174;
  const bendPoint2 = 7078;
  
  // Calculate PIA (Primary Insurance Amount) using bend point formula
  let pia = 0;
  if (aime <= bendPoint1) {
    pia = aime * 0.90;
  } else if (aime <= bendPoint2) {
    pia = (bendPoint1 * 0.90) + ((aime - bendPoint1) * 0.32);
  } else {
    pia = (bendPoint1 * 0.90) + ((bendPoint2 - bendPoint1) * 0.32) + ((aime - bendPoint2) * 0.15);
  }
  
  // Adjust for claiming age (Full Retirement Age = 67 for those born 1960+)
  const fra = 67;
  let adjustmentFactor = 1.0;
  
  if (claimingAge < fra) {
    // Reduced benefits: ~6.67% per year before FRA (up to 3 years), then 5% per year
    const yearsEarly = fra - claimingAge;
    if (yearsEarly <= 3) {
      adjustmentFactor = 1 - (yearsEarly * 0.0667);
    } else {
      adjustmentFactor = 1 - (3 * 0.0667) - ((yearsEarly - 3) * 0.05);
    }
  } else if (claimingAge > fra) {
    // Delayed credits: 8% per year after FRA (up to age 70)
    const yearsDelayed = Math.min(claimingAge - fra, 3);
    adjustmentFactor = 1 + (yearsDelayed * 0.08);
  }
  
  // Annual benefit
  const monthlyBenefit = pia * adjustmentFactor;
  const annualBenefit = Math.round(monthlyBenefit * 12);
  
  return annualBenefit;
}

/**
 * Calculate the taxable portion of Social Security benefits using IRS provisional income rules.
 * 
 * IRS uses a "provisional income" test to determine how much of SS is taxable:
 * - Provisional Income = Other Income + 50% of SS benefits
 * 
 * Tier 1 (0% taxable): Provisional income ≤ base threshold ($25k single, $32k married)
 * Tier 2 (up to 50% taxable): Provisional income between base and upper threshold
 * Tier 3 (up to 85% taxable): Provisional income > upper threshold ($34k single, $44k married)
 * 
 * NOTE: These thresholds are NOT inflation-adjusted - they are statutory since 1984/1993.
 * 
 * @param {number} socialSecurityBenefits - Total SS benefits received this year
 * @param {number} otherIncome - AGI excluding SS (wages, withdrawals, pensions, etc.)
 * @param {string} filingStatus - 'single', 'married_filing_jointly', 'married', etc.
 * @returns {number} - Taxable portion of SS benefits (0 to 85% of benefits)
 */
export function calculateTaxableSocialSecurity(socialSecurityBenefits, otherIncome, filingStatus) {
  if (socialSecurityBenefits <= 0) return 0;
  
  // Provisional income thresholds (these are statutory and NOT inflation-adjusted)
  const isMarried = filingStatus === 'married_filing_jointly' || filingStatus === 'married';
  const thresholds = isMarried 
    ? { base: 32000, upper: 44000 }
    : { base: 25000, upper: 34000 }; // Single, HoH, MFS
  
  // Provisional income = other income + 50% of SS benefits
  const provisionalIncome = otherIncome + (socialSecurityBenefits * 0.5);
  
  // Tier 1: Below base threshold - 0% taxable
  if (provisionalIncome <= thresholds.base) {
    return 0;
  }
  
  // Tier 2: Between base and upper - up to 50% taxable
  if (provisionalIncome <= thresholds.upper) {
    // Taxable = lesser of: 50% of SS OR 50% of (provisional income - base threshold)
    const tier1Taxable = Math.min(
      socialSecurityBenefits * 0.5,
      (provisionalIncome - thresholds.base) * 0.5
    );
    return tier1Taxable;
  }
  
  // Tier 3: Above upper threshold - up to 85% taxable
  // Taxable = lesser of:
  //   85% of SS benefits, OR
  //   85% of (provisional income - upper threshold) + lesser of:
  //     $4,500 (single) / $6,000 (MFJ), OR
  //     50% of SS benefits
  const maxTier1 = isMarried ? 6000 : 4500;
  const tier1Portion = Math.min(maxTier1, socialSecurityBenefits * 0.5);
  const tier2Portion = (provisionalIncome - thresholds.upper) * 0.85;
  
  const totalTaxable = Math.min(
    socialSecurityBenefits * 0.85,
    tier1Portion + tier2Portion
  );
  
  return Math.max(0, totalTaxable);
}

import { 
  FEDERAL_LTCG_BRACKETS, 
  getStandardDeduction as getStandardDeductionFromData,
  getYearData,
  getFederalBrackets
} from '@/components/shared/taxData';

// Re-export for backward compatibility
export { 
  STANDARD_DEDUCTIONS, 
  INCOME_TAX_BRACKETS,
  getTaxConfigForYear,
  getIncomeTaxRate,
  getLTCGRate,
  getSTCGRate,
  calculateProgressiveIncomeTax,
  getStandardDeduction,
  getTaxDataForYear
};

/**
 * Calculate Net Investment Income Tax (NIIT) - 3.8% surtax on investment income.
 * 
 * NIIT applies when MAGI exceeds thresholds:
 * - Single: $200,000
 * - Married Filing Jointly: $250,000
 * - Married Filing Separately: $125,000
 * 
 * Tax is 3.8% of the LESSER of:
 * 1. Net Investment Income (NII), OR
 * 2. MAGI exceeding the threshold
 * 
 * Net Investment Income includes:
 * - Capital gains (short-term and long-term)
 * - Dividends (qualified and non-qualified)
 * - Interest income (not from tax-exempt bonds)
 * - Rental and royalty income
 * - Passive business income
 * 
 * @param {number} netInvestmentIncome - Total NII (gains + dividends + investment interest)
 * @param {number} magi - Modified Adjusted Gross Income
 * @param {string} filingStatus - 'single', 'married', or 'married_filing_jointly'
 * @returns {number} - NIIT amount owed
 */
export const calculateNIIT = (netInvestmentIncome, magi, filingStatus) => {
  // NIIT thresholds (these are statutory and NOT inflation-adjusted)
  const thresholds = {
    single: 200000,
    married: 250000,
    married_filing_jointly: 250000,
    married_filing_separately: 125000,
    head_of_household: 200000,
  };
  
  const normalizedStatus = filingStatus === 'married' ? 'married_filing_jointly' : filingStatus;
  const threshold = thresholds[normalizedStatus] || thresholds.single;
  
  // No NIIT if MAGI is at or below threshold
  if (magi <= threshold) return 0;
  
  // NIIT is 3.8% of the lesser of NII or excess MAGI
  const excessMagi = magi - threshold;
  const niitableAmount = Math.min(netInvestmentIncome, excessMagi);
  
  return Math.max(0, niitableAmount * 0.038);
};

// Backward compatibility
export const STANDARD_DEDUCTION_2024 = { single: 14600, married: 29200 };
export const STANDARD_DEDUCTION_2025 = { single: 15000, married: 30000 };
export const TAX_BRACKETS_2024 = {
  single: {
    income: [
      { min: 0, max: 11925, rate: 0.10, label: '10%' },
      { min: 11925, max: 48475, rate: 0.12, label: '12%' },
      { min: 48475, max: 103350, rate: 0.22, label: '22%' },
      { min: 103350, max: 197300, rate: 0.24, label: '24%' },
      { min: 197300, max: 250525, rate: 0.32, label: '32%' },
      { min: 250525, max: 626350, rate: 0.35, label: '35%' },
      { min: 626350, max: Infinity, rate: 0.37, label: '37%' },
    ],
    ltcg: [
      { min: 0, max: 48350, rate: 0, label: '0%' },
      { min: 48350, max: 533400, rate: 0.15, label: '15%' },
      { min: 533400, max: Infinity, rate: 0.20, label: '20%' },
    ],
  },
  married: {
    income: [
      { min: 0, max: 23850, rate: 0.10, label: '10%' },
      { min: 23850, max: 96950, rate: 0.12, label: '12%' },
      { min: 96950, max: 206700, rate: 0.22, label: '22%' },
      { min: 206700, max: 394600, rate: 0.24, label: '24%' },
      { min: 394600, max: 501050, rate: 0.32, label: '32%' },
      { min: 501050, max: 751600, rate: 0.35, label: '35%' },
      { min: 751600, max: Infinity, rate: 0.37, label: '37%' },
    ],
    ltcg: [
      { min: 0, max: 96700, rate: 0, label: '0%' },
      { min: 96700, max: 600050, rate: 0.15, label: '15%' },
      { min: 600050, max: Infinity, rate: 0.20, label: '20%' },
    ],
  },
};

/**
 * Calculate federal capital gains tax on a realized gain.
 * 
 * Short-term gains (held ≤ 1 year): Taxed as ordinary income at marginal rate
 * Long-term gains (held > 1 year): Taxed at preferential LTCG rates (0%, 15%, or 20%)
 * 
 * @param {number} gain - Realized capital gain amount
 * @param {boolean} isLongTerm - True if held > 365 days
 * @param {number} taxableIncome - Taxpayer's taxable income (for determining rate)
 * @param {string} filingStatus - 'single' or 'married_filing_jointly'
 * @param {number} year - Tax year (for inflation-adjusted brackets)
 * @returns {number} - Tax owed on the gain
 */
export const calculateCapitalGainsTax = (gain, isLongTerm, taxableIncome, filingStatus = 'single', year = 2025) => {
  if (gain <= 0) return 0;
  
  const rate = isLongTerm 
    ? getLTCGRate(taxableIncome + gain, filingStatus, year)
    : getSTCGRate(taxableIncome + gain, filingStatus, year);
  
  return gain * rate;
};

/**
 * Calculate federal tax on retirement account withdrawals.
 * 
 * Account types:
 * - tax_free: Roth IRA/401k, HSA (qualified) → No tax
 * - tax_deferred: Traditional IRA/401k → Taxed as ordinary income
 * - taxable: Brokerage accounts → Only gains taxed (at LTCG or STCG rates)
 * 
 * @param {Object} params - Withdrawal parameters
 * @param {number} params.withdrawalAmount - Total amount withdrawn
 * @param {string} params.accountType - 'taxable', 'tax_deferred', or 'tax_free'
 * @param {number} params.capitalGainAmount - Gain portion (for taxable accounts)
 * @param {boolean} params.isLongTermGain - True if held > 1 year
 * @param {number} params.otherIncome - Other taxable income this year
 * @param {string} params.filingStatus - 'single' or 'married'
 * @param {number} params.year - Tax year
 * @returns {number} - Tax owed on the withdrawal
 */
export const calculateWithdrawalTax = ({
  withdrawalAmount,
  accountType, // 'taxable', 'tax_deferred', 'tax_free'
  capitalGainAmount = 0, // For taxable accounts - the gain portion
  isLongTermGain = true, // For taxable accounts
  otherIncome = 0,
  filingStatus = 'single',
  year = 2025,
}) => {
  const { standardDeductions } = getTaxDataForYear(year);
  const standardDeduction = standardDeductions[filingStatus] || standardDeductions.single;
  
  if (accountType === 'tax_free') {
    // Roth IRA, Roth 401k, HSA (qualified) - no tax
    return 0;
  }
  
  if (accountType === 'tax_deferred') {
    // Traditional IRA, Traditional 401k - taxed as ordinary income
    const taxableIncome = Math.max(0, otherIncome + withdrawalAmount - standardDeduction);
    return calculateProgressiveIncomeTax(taxableIncome, filingStatus, year) - 
           calculateProgressiveIncomeTax(Math.max(0, otherIncome - standardDeduction), filingStatus, year);
  }
  
  if (accountType === 'taxable') {
    // Taxable brokerage - only gains are taxed
    if (capitalGainAmount <= 0) return 0;
    
    const taxableIncome = Math.max(0, otherIncome - standardDeduction);
    return calculateCapitalGainsTax(capitalGainAmount, isLongTermGain, taxableIncome, filingStatus, year);
  }
  
  return 0;
};

/**
 * Estimate total taxes for a retirement withdrawal using tax-optimized withdrawal order.
 * 
 * Withdrawal priority (age 59.5+):
 * 1. Taxable accounts (LTCG rates: 0%, 15%, 20%)
 * 2. Tax-deferred (ordinary income rates: 10%-37%)
 * 3. Tax-free (no tax - preserve for last)
 * 
 * Withdrawal priority (before 59.5):
 * 1. Taxable accounts
 * 2. Tax-free (Roth contributions accessible penalty-free)
 * 3. Tax-deferred (ordinary income + 10% penalty - avoid if possible)
 * 
 * Dividend Tax Treatment:
 * - Qualified dividends: Taxed at LTCG rates (0%, 15%, 20%) - stacks on top of ordinary income
 * - Non-qualified dividends: Taxed as ordinary income (10%-37%)
 * - NIIT (3.8%): Applies to NII (gains + dividends) when MAGI > threshold
 * 
 * @param {Object} params - Withdrawal scenario parameters
 * @param {number} params.withdrawalNeeded - Total amount needed (pre-tax)
 * @param {number} params.taxableBalance - Available in taxable accounts
 * @param {number} params.taxDeferredBalance - Available in traditional IRA/401k
 * @param {number} params.taxFreeBalance - Available in Roth/HSA
 * @param {number} params.rothContributions - Roth contribution basis (accessible penalty-free)
 * @param {number} params.taxableGainPercent - Portion of taxable that is gains (0-1) - LEGACY, use shortTermGain/longTermGain
 * @param {number} params.shortTermGain - Pre-calculated short-term capital gains (taxed as ordinary income)
 * @param {number} params.longTermGain - Pre-calculated long-term capital gains (preferential rates)
 * @param {boolean} params.isLongTermGain - True if taxable gains held > 1 year - LEGACY fallback
 * @param {number} params.qualifiedDividends - Qualified dividend income (taxed at LTCG rates)
 * @param {number} params.nonQualifiedDividends - Non-qualified dividend income (taxed as ordinary income)
 * @param {string} params.filingStatus - 'single' or 'married'
 * @param {number} params.age - Current age (determines penalty)
 * @param {number} params.otherIncome - Other income this year (pension, SS, etc.)
 * @param {number} params.year - Tax year
 * @param {number} params.inflationRate - For projecting brackets (optional)
 * @returns {Object} - Detailed breakdown of withdrawal sources, taxes, and penalties
 */
export const estimateRetirementWithdrawalTaxes = ({
  withdrawalNeeded,
  taxableBalance,
  taxDeferredBalance,
  taxFreeBalance,
  rothContributions = null, // Actual Roth contribution basis (accessible penalty-free)
  taxableGainPercent = 0.5, // LEGACY: Portion of taxable account that is gains (dynamically calculated)
  shortTermGain = null, // NEW: Pre-calculated short-term gain from lot selection
  longTermGain = null, // NEW: Pre-calculated long-term gain from lot selection  
  isLongTermGain = true, // LEGACY: Fallback when gain breakdown not provided
  qualifiedDividends = 0, // Qualified dividends - taxed at LTCG rates
  nonQualifiedDividends = 0, // Non-qualified dividends - taxed as ordinary income (REITs, MLPs)
  filingStatus = 'single',
  age = 65,
  otherIncome = 0, // Social Security, pension, etc.
  year = 2025,
  inflationRate = null,
}) => {
  const PENALTY_FREE_AGE = 59.5;
  const canAccessPenaltyFree = age >= PENALTY_FREE_AGE;
  
  // Normalize filing status and get inflation-adjusted tax data
  const normalizedStatus = filingStatus === 'married' ? 'married_filing_jointly' : filingStatus;
  const standardDeduction = getStandardDeductionFromData(year, normalizedStatus, age, false, inflationRate);

  // Get inflation-adjusted LTCG brackets
  const ltcgBracketsData = getYearData(FEDERAL_LTCG_BRACKETS, year, inflationRate);
  const ltcgThresholds = ltcgBracketsData[normalizedStatus] || ltcgBracketsData.single;

  // Build LTCG bracket array for iteration (0%/15%/20%)
  const ltcgBrackets = [
    { max: ltcgThresholds.zeroMax, rate: 0 },
    { max: ltcgThresholds.fifteenMax, rate: 0.15 },
    { max: Infinity, rate: 0.20 }
  ];

  // Get inflation-adjusted income brackets for tax-deferred withdrawals AND short-term gains
  const incomeBracketsData = getFederalBrackets(year, normalizedStatus, inflationRate);
  const incomeBrackets = incomeBracketsData.map(b => ({
    max: b.max,
    rate: b.rate / 100
  }));
  
  let totalTax = 0;
  let totalPenalty = 0;
  let remainingWithdrawal = withdrawalNeeded;
  
  const withdrawalBreakdown = {
    fromTaxable: 0,
    fromTaxDeferred: 0,
    fromTaxFree: 0,
    taxOnTaxable: 0,
    taxOnTaxDeferred: 0,
    taxOnShortTermGains: 0,
    taxOnLongTermGains: 0,
    taxOnQualifiedDividends: 0,
    taxOnNonQualifiedDividends: 0,
    niitTax: 0,
    penalty: 0,
  };
  
  // Track cumulative taxable income for accurate bracket calculation
  // Start with other income + non-qualified dividends AFTER standard deduction
  // Non-qualified dividends are taxed as ordinary income
  const totalOrdinaryIncome = otherIncome + nonQualifiedDividends;
  let cumulativeTaxableIncome = Math.max(0, totalOrdinaryIncome - standardDeduction);
  
  // Tax non-qualified dividends as ordinary income
  if (nonQualifiedDividends > 0) {
    let nonQualDivTax = 0;
    let remainingNonQualDiv = nonQualifiedDividends;
    // Calculate tax on non-qualified dividends at ordinary income rates
    // They fill brackets after other income
    const incomeBeforeDividends = Math.max(0, otherIncome - standardDeduction);
    let tempIncome = incomeBeforeDividends;
    for (const bracket of incomeBrackets) {
      if (remainingNonQualDiv <= 0) break;
      const roomInBracket = Math.max(0, bracket.max - tempIncome);
      const divInBracket = Math.min(remainingNonQualDiv, roomInBracket);
      nonQualDivTax += divInBracket * bracket.rate;
      tempIncome += divInBracket;
      remainingNonQualDiv -= divInBracket;
    }
    withdrawalBreakdown.taxOnNonQualifiedDividends = nonQualDivTax;
    totalTax += nonQualDivTax;
  }
  
  // Optimal withdrawal order depends on age and tax situation
  if (canAccessPenaltyFree) {
    // After 59.5: Withdraw from taxable first (lower tax on gains), then tax-deferred, then tax-free last
    
    // 1. Taxable first - capital gains taxed
    const fromTaxable = Math.min(remainingWithdrawal, taxableBalance);
    if (fromTaxable > 0) {
      let taxOnTaxable = 0;
      
      // Check if we have pre-calculated gain breakdown (new method)
      if (shortTermGain !== null || longTermGain !== null) {
        const stGain = shortTermGain || 0;
        const ltGain = longTermGain || 0;
        
        // Short-term gains are taxed as ordinary income
        if (stGain > 0) {
          let remainingStGain = stGain;
          for (const bracket of incomeBrackets) {
            if (remainingStGain <= 0) break;
            const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
            const gainInBracket = Math.min(remainingStGain, roomInBracket);
            taxOnTaxable += gainInBracket * bracket.rate;
            cumulativeTaxableIncome += gainInBracket;
            remainingStGain -= gainInBracket;
          }
          withdrawalBreakdown.taxOnShortTermGains = taxOnTaxable;
        }
        
        // Long-term gains use preferential LTCG rates, stacking on top of ordinary income
        if (ltGain > 0) {
          let ltcgTax = 0;
          let remainingLtGain = ltGain;
          for (const bracket of ltcgBrackets) {
            if (remainingLtGain <= 0) break;
            const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
            const gainInBracket = Math.min(remainingLtGain, roomInBracket);
            ltcgTax += gainInBracket * bracket.rate;
            cumulativeTaxableIncome += gainInBracket;
            remainingLtGain -= gainInBracket;
          }
          withdrawalBreakdown.taxOnLongTermGains = ltcgTax;
          taxOnTaxable += ltcgTax;
        }
      } else {
        // Legacy path: use taxableGainPercent and isLongTermGain
        const gainPortion = fromTaxable * taxableGainPercent;
        
        if (isLongTermGain) {
          // Calculate LTCG tax considering 0% bracket
          let remainingGain = gainPortion;
          for (const bracket of ltcgBrackets) {
            if (remainingGain <= 0) break;
            const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
            const gainInBracket = Math.min(remainingGain, roomInBracket);
            taxOnTaxable += gainInBracket * bracket.rate;
            cumulativeTaxableIncome += gainInBracket;
            remainingGain -= gainInBracket;
          }
        } else {
          // Short-term: tax as ordinary income
          let remainingGain = gainPortion;
          for (const bracket of incomeBrackets) {
            if (remainingGain <= 0) break;
            const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
            const gainInBracket = Math.min(remainingGain, roomInBracket);
            taxOnTaxable += gainInBracket * bracket.rate;
            cumulativeTaxableIncome += gainInBracket;
            remainingGain -= gainInBracket;
          }
        }
      }
      
      withdrawalBreakdown.fromTaxable = fromTaxable;
      withdrawalBreakdown.taxOnTaxable = taxOnTaxable;
      totalTax += taxOnTaxable;
      remainingWithdrawal -= fromTaxable;
    }
    
    // 2. Tax-deferred second - taxed as ordinary income
    const fromTaxDeferred = Math.min(remainingWithdrawal, taxDeferredBalance);
    if (fromTaxDeferred > 0) {
      // Calculate progressive income tax on the withdrawal
      let taxOnTaxDeferred = 0;
      let remainingAmount = fromTaxDeferred;
      
      for (const bracket of incomeBrackets) {
        if (remainingAmount <= 0) break;
        const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
        const amountInBracket = Math.min(remainingAmount, roomInBracket);
        taxOnTaxDeferred += amountInBracket * bracket.rate;
        cumulativeTaxableIncome += amountInBracket;
        remainingAmount -= amountInBracket;
      }
      
      withdrawalBreakdown.fromTaxDeferred = fromTaxDeferred;
      withdrawalBreakdown.taxOnTaxDeferred = taxOnTaxDeferred;
      totalTax += taxOnTaxDeferred;
      remainingWithdrawal -= fromTaxDeferred;
    }
    
    // 3. Tax-free last
    const fromTaxFree = Math.min(remainingWithdrawal, taxFreeBalance);
    withdrawalBreakdown.fromTaxFree = fromTaxFree;
    remainingWithdrawal -= fromTaxFree;
    
  } else {
    // Before 59.5: Taxable first, then tax-free (Roth contributions), avoid tax-deferred (10% penalty)
    
    // 1. Taxable first
    const fromTaxable = Math.min(remainingWithdrawal, taxableBalance);
    if (fromTaxable > 0) {
      let taxOnTaxable = 0;
      
      // Check if we have pre-calculated gain breakdown (new method)
      if (shortTermGain !== null || longTermGain !== null) {
        const stGain = shortTermGain || 0;
        const ltGain = longTermGain || 0;
        
        // Short-term gains are taxed as ordinary income
        if (stGain > 0) {
          let remainingStGain = stGain;
          for (const bracket of incomeBrackets) {
            if (remainingStGain <= 0) break;
            const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
            const gainInBracket = Math.min(remainingStGain, roomInBracket);
            taxOnTaxable += gainInBracket * bracket.rate;
            cumulativeTaxableIncome += gainInBracket;
            remainingStGain -= gainInBracket;
          }
          withdrawalBreakdown.taxOnShortTermGains = taxOnTaxable;
        }
        
        // Long-term gains use preferential LTCG rates
        if (ltGain > 0) {
          let ltcgTax = 0;
          let remainingLtGain = ltGain;
          for (const bracket of ltcgBrackets) {
            if (remainingLtGain <= 0) break;
            const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
            const gainInBracket = Math.min(remainingLtGain, roomInBracket);
            ltcgTax += gainInBracket * bracket.rate;
            cumulativeTaxableIncome += gainInBracket;
            remainingLtGain -= gainInBracket;
          }
          withdrawalBreakdown.taxOnLongTermGains = ltcgTax;
          taxOnTaxable += ltcgTax;
        }
      } else {
        // Legacy path
        const gainPortion = fromTaxable * taxableGainPercent;
        let remainingGain = gainPortion;
        
        for (const bracket of ltcgBrackets) {
          if (remainingGain <= 0) break;
          const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
          const gainInBracket = Math.min(remainingGain, roomInBracket);
          taxOnTaxable += gainInBracket * bracket.rate;
          cumulativeTaxableIncome += gainInBracket;
          remainingGain -= gainInBracket;
        }
      }
      
      withdrawalBreakdown.fromTaxable = fromTaxable;
      withdrawalBreakdown.taxOnTaxable = taxOnTaxable;
      totalTax += taxOnTaxable;
      remainingWithdrawal -= fromTaxable;
    }
    
    // 2. Tax-free (Roth contributions accessible)
    // Use actual Roth contributions if provided, otherwise estimate 50%
    const taxFreeContributions = rothContributions !== null 
      ? Math.min(rothContributions, taxFreeBalance) 
      : taxFreeBalance * 0.5;
    const fromTaxFree = Math.min(remainingWithdrawal, taxFreeContributions);
    withdrawalBreakdown.fromTaxFree = fromTaxFree;
    remainingWithdrawal -= fromTaxFree;
    
    // 3. Tax-deferred with penalty as last resort
    if (remainingWithdrawal > 0) {
      const fromTaxDeferred = Math.min(remainingWithdrawal, taxDeferredBalance);
      if (fromTaxDeferred > 0) {
        const penalty = fromTaxDeferred * 0.10;
        
        // Calculate progressive income tax
        let taxOnTaxDeferred = 0;
        let remainingAmount = fromTaxDeferred;
        
        for (const bracket of incomeBrackets) {
          if (remainingAmount <= 0) break;
          const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
          const amountInBracket = Math.min(remainingAmount, roomInBracket);
          taxOnTaxDeferred += amountInBracket * bracket.rate;
          cumulativeTaxableIncome += amountInBracket;
          remainingAmount -= amountInBracket;
        }
        
        withdrawalBreakdown.fromTaxDeferred = fromTaxDeferred;
        withdrawalBreakdown.taxOnTaxDeferred = taxOnTaxDeferred;
        withdrawalBreakdown.penalty = penalty;
        totalTax += taxOnTaxDeferred;
        totalPenalty += penalty;
        remainingWithdrawal -= fromTaxDeferred;
      }
    }
  }
  
  // Tax qualified dividends at LTCG rates (stacks on top of ordinary income)
  if (qualifiedDividends > 0) {
    let qualDivTax = 0;
    let remainingQualDiv = qualifiedDividends;
    // Qualified dividends use LTCG brackets, stacking on top of all ordinary income
    for (const bracket of ltcgBrackets) {
      if (remainingQualDiv <= 0) break;
      const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
      const divInBracket = Math.min(remainingQualDiv, roomInBracket);
      qualDivTax += divInBracket * bracket.rate;
      cumulativeTaxableIncome += divInBracket;
      remainingQualDiv -= divInBracket;
    }
    withdrawalBreakdown.taxOnQualifiedDividends = qualDivTax;
    totalTax += qualDivTax;
  }
  
  // Calculate NIIT (Net Investment Income Tax) - 3.8% surtax
  // NII includes: capital gains + all dividends
  const netInvestmentIncome = (shortTermGain || 0) + (longTermGain || 0) + qualifiedDividends + nonQualifiedDividends;
  // MAGI for NIIT purposes includes all income
  const magiForNIIT = otherIncome + (withdrawalBreakdown.fromTaxDeferred || 0) + netInvestmentIncome;
  const niitTax = calculateNIIT(netInvestmentIncome, magiForNIIT, filingStatus);
  withdrawalBreakdown.niitTax = niitTax;
  totalTax += niitTax;

  return {
    ...withdrawalBreakdown,
    totalTax,
    totalPenalty,
    totalCost: totalTax + totalPenalty,
    netWithdrawal: withdrawalNeeded - totalTax - totalPenalty,
    effectiveTaxRate: withdrawalNeeded > 0 ? (totalTax + totalPenalty) / withdrawalNeeded : 0,
  };
};

/**
 * Calculate federal long-term capital gains tax with accurate bracket stacking.
 * 
 * LTCG brackets (2025 single): 0% up to $48,350 | 15% up to $533,400 | 20% above
 * LTCG brackets (2025 married): 0% up to $96,700 | 15% up to $600,050 | 20% above
 * 
 * Key insight: Standard deduction applies to ordinary income FIRST, then remaining
 * deduction can offset LTCG. Ordinary income "fills" lower brackets before LTCG stacks on top.
 * 
 * Example: Single filer, $20k wages, $40k LTCG, $15k std deduction
 * - Taxable ordinary: $20k - $15k = $5k
 * - LTCG stacks on top: Room in 0% bracket = $48,350 - $5k = $43,350
 * - First $40k of LTCG taxed at 0%
 * 
 * @param {Object} params - Tax calculation parameters
 * @param {number} params.longTermGains - Long-term capital gains amount
 * @param {number} params.shortTermGains - Short-term gains (taxed as ordinary income)
 * @param {number} params.ordinaryIncome - Wages, pension, etc.
 * @param {string} params.filingStatus - 'single', 'married_filing_jointly', 'married'
 * @param {number} params.age - Age (for extra standard deduction if 65+)
 * @param {number} params.year - Tax year
 * @param {number} params.inflationRate - For projecting future years (optional)
 * @returns {Object} - Detailed LTCG tax breakdown by bracket
 */
export function calculateFederalLTCGTax({
  longTermGains = 0,
  shortTermGains = 0,
  ordinaryIncome = 0,
  filingStatus = 'single',
  age = 65,
  year = 2025,
  inflationRate = null
}) {
  // Normalize filing status
  const normalizedStatus = filingStatus === 'married' ? 'married_filing_jointly' : filingStatus;
  
  // Get standard deduction (includes extra for 65+, inflation-adjusted)
  const standardDeduction = getStandardDeductionFromData(year, normalizedStatus, age, false, inflationRate);
  
  // Get LTCG brackets (inflation-adjusted for future years)
  const ltcgBrackets = getYearData(FEDERAL_LTCG_BRACKETS, year, inflationRate);
  const brackets = ltcgBrackets[normalizedStatus] || ltcgBrackets.single;
  
  // Short-term gains taxed as ordinary income
  const totalOrdinaryIncome = ordinaryIncome + shortTermGains;
  
  // Apply standard deduction to ordinary income first
  const taxableOrdinaryIncome = Math.max(0, totalOrdinaryIncome - standardDeduction);
  
  // Remaining deduction can offset LTCG
  const remainingDeduction = Math.max(0, standardDeduction - totalOrdinaryIncome);
  const taxableLTCG = Math.max(0, longTermGains - remainingDeduction);
  
  if (taxableLTCG <= 0) {
    return {
      ltcgTax: 0,
      taxableLTCG: 0,
      gainsAt0Percent: 0,
      gainsAt15Percent: 0,
      gainsAt20Percent: 0,
      effectiveLTCGRate: 0,
      standardDeductionUsed: standardDeduction,
      remainingDeductionAppliedToGains: Math.min(remainingDeduction, longTermGains)
    };
  }
  
  // Calculate LTCG tax using bracket stacking
  // Ordinary income "fills" brackets first, LTCG stacks on top
  let ltcgTax = 0;
  let remainingGains = taxableLTCG;
  
  // 0% bracket space remaining after ordinary income
  const zeroRateSpace = Math.max(0, brackets.zeroMax - taxableOrdinaryIncome);
  const gainsAt0 = Math.min(remainingGains, zeroRateSpace);
  remainingGains -= gainsAt0;
  // 0% = $0 tax
  
  // 15% bracket space
  const fifteenRateStart = Math.max(taxableOrdinaryIncome, brackets.zeroMax);
  const fifteenRateSpace = Math.max(0, brackets.fifteenMax - fifteenRateStart);
  const gainsAt15 = Math.min(remainingGains, fifteenRateSpace);
  ltcgTax += gainsAt15 * 0.15;
  remainingGains -= gainsAt15;
  
  // 20% on remainder
  const gainsAt20 = remainingGains;
  ltcgTax += gainsAt20 * 0.20;
  
  return {
    ltcgTax: Math.round(ltcgTax),
    taxableLTCG,
    gainsAt0Percent: gainsAt0,
    gainsAt15Percent: gainsAt15,
    gainsAt20Percent: gainsAt20,
    effectiveLTCGRate: taxableLTCG > 0 ? ltcgTax / taxableLTCG : 0,
    standardDeductionUsed: standardDeduction,
    remainingDeductionAppliedToGains: Math.min(remainingDeduction, longTermGains)
  };
}