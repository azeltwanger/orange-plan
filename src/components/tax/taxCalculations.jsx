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

// Backward compatibility
export const STANDARD_DEDUCTION_2024 = STANDARD_DEDUCTIONS[2025];
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

export const STANDARD_DEDUCTION_2025 = STANDARD_DEDUCTIONS[2025];

// Calculate capital gains tax (simplified - uses marginal rate)
export const calculateCapitalGainsTax = (gain, isLongTerm, taxableIncome, filingStatus = 'single', year = 2025) => {
  if (gain <= 0) return 0;
  
  const rate = isLongTerm 
    ? getLTCGRate(taxableIncome + gain, filingStatus, year)
    : getSTCGRate(taxableIncome + gain, filingStatus, year);
  
  return gain * rate;
};

// Calculate tax on withdrawal from different account types
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

// Estimate taxes for a retirement withdrawal scenario
export const estimateRetirementWithdrawalTaxes = ({
  withdrawalNeeded,
  taxableBalance,
  taxDeferredBalance,
  taxFreeBalance,
  rothContributions = null, // Actual Roth contribution basis (accessible penalty-free)
  taxableGainPercent = 0.5, // Portion of taxable account that is gains (dynamically calculated)
  isLongTermGain = true,
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

  // Get inflation-adjusted income brackets for tax-deferred withdrawals
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
    penalty: 0,
  };
  
  // Track cumulative taxable income for accurate bracket calculation
  let cumulativeTaxableIncome = Math.max(0, otherIncome - standardDeduction);
  
  // Optimal withdrawal order depends on age and tax situation
  if (canAccessPenaltyFree) {
    // After 59.5: Withdraw from taxable first (lower tax on gains), then tax-deferred, then tax-free last
    
    // 1. Taxable first - capital gains taxed at preferential rates (0%, 15%, 20%)
    const fromTaxable = Math.min(remainingWithdrawal, taxableBalance);
    if (fromTaxable > 0) {
      const gainPortion = fromTaxable * taxableGainPercent;
      
      // Calculate LTCG tax considering 0% bracket
      let taxOnTaxable = 0;
      let remainingGain = gainPortion;
      
      for (const bracket of ltcgBrackets) {
        if (remainingGain <= 0) break;
        const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
        const gainInBracket = Math.min(remainingGain, roomInBracket);
        taxOnTaxable += gainInBracket * bracket.rate;
        cumulativeTaxableIncome += gainInBracket;
        remainingGain -= gainInBracket;
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
      const gainPortion = fromTaxable * taxableGainPercent;
      
      // Calculate LTCG tax considering 0% bracket
      let taxOnTaxable = 0;
      let remainingGain = gainPortion;
      
      for (const bracket of ltcgBrackets) {
        if (remainingGain <= 0) break;
        const roomInBracket = Math.max(0, bracket.max - cumulativeTaxableIncome);
        const gainInBracket = Math.min(remainingGain, roomInBracket);
        taxOnTaxable += gainInBracket * bracket.rate;
        cumulativeTaxableIncome += gainInBracket;
        remainingGain -= gainInBracket;
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
  
  return {
    ...withdrawalBreakdown,
    totalTax,
    totalPenalty,
    totalCost: totalTax + totalPenalty,
    netWithdrawal: withdrawalNeeded - totalTax - totalPenalty,
    effectiveTaxRate: withdrawalNeeded > 0 ? (totalTax + totalPenalty) / withdrawalNeeded : 0,
  };
};

// Calculate federal long-term capital gains tax with 0%/15%/20% brackets
// Uses actual bracket stacking and standard deduction
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