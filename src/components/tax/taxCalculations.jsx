// 2025 Tax Brackets and Standard Deductions
export const STANDARD_DEDUCTION_2025 = {
  single: 15000,
  married: 30000,
};

export const TAX_BRACKETS_2025 = {
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

// Aliases for backward compatibility
export const STANDARD_DEDUCTION_2024 = STANDARD_DEDUCTION_2025;
export const TAX_BRACKETS_2024 = TAX_BRACKETS_2025;

// Get marginal income tax rate for a given taxable income
export const getIncomeTaxRate = (taxableIncome, filingStatus = 'single') => {
  const brackets = TAX_BRACKETS_2025[filingStatus]?.income || TAX_BRACKETS_2025.single.income;
  for (const bracket of brackets) {
    if (taxableIncome <= bracket.max) return bracket.rate;
  }
  return 0.37;
};

// Get long-term capital gains rate for a given taxable income
export const getLTCGRate = (taxableIncome, filingStatus = 'single') => {
  const brackets = TAX_BRACKETS_2025[filingStatus]?.ltcg || TAX_BRACKETS_2025.single.ltcg;
  for (const bracket of brackets) {
    if (taxableIncome <= bracket.max) return bracket.rate;
  }
  return 0.20;
};

// Get short-term capital gains rate (same as income tax)
export const getSTCGRate = (taxableIncome, filingStatus = 'single') => {
  return getIncomeTaxRate(taxableIncome, filingStatus);
};

// Calculate progressive income tax on a given amount
export const calculateProgressiveIncomeTax = (taxableIncome, filingStatus = 'single') => {
  const brackets = TAX_BRACKETS_2025[filingStatus]?.income || TAX_BRACKETS_2025.single.income;
  let totalTax = 0;
  let remainingIncome = taxableIncome;
  let previousMax = 0;

  for (const bracket of brackets) {
    if (remainingIncome <= 0) break;
    const taxableInBracket = Math.min(remainingIncome, bracket.max - previousMax);
    totalTax += taxableInBracket * bracket.rate;
    remainingIncome -= taxableInBracket;
    previousMax = bracket.max;
  }

  return totalTax;
};

// Calculate capital gains tax (simplified - uses marginal rate)
export const calculateCapitalGainsTax = (gain, isLongTerm, taxableIncome, filingStatus = 'single') => {
  if (gain <= 0) return 0;
  
  const rate = isLongTerm 
    ? getLTCGRate(taxableIncome + gain, filingStatus)
    : getSTCGRate(taxableIncome + gain, filingStatus);
  
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
}) => {
  const standardDeduction = STANDARD_DEDUCTION_2025[filingStatus] || STANDARD_DEDUCTION_2025.single;
  
  if (accountType === 'tax_free') {
    // Roth IRA, Roth 401k, HSA (qualified) - no tax
    return 0;
  }
  
  if (accountType === 'tax_deferred') {
    // Traditional IRA, Traditional 401k - taxed as ordinary income
    const taxableIncome = Math.max(0, otherIncome + withdrawalAmount - standardDeduction);
    return calculateProgressiveIncomeTax(taxableIncome, filingStatus) - 
           calculateProgressiveIncomeTax(Math.max(0, otherIncome - standardDeduction), filingStatus);
  }
  
  if (accountType === 'taxable') {
    // Taxable brokerage - only gains are taxed
    if (capitalGainAmount <= 0) return 0;
    
    const taxableIncome = Math.max(0, otherIncome - standardDeduction);
    return calculateCapitalGainsTax(capitalGainAmount, isLongTermGain, taxableIncome, filingStatus);
  }
  
  return 0;
};

// Estimate taxes for a retirement withdrawal scenario
export const estimateRetirementWithdrawalTaxes = ({
  withdrawalNeeded,
  taxableBalance,
  taxDeferredBalance,
  taxFreeBalance,
  taxableGainPercent = 0.5, // Portion of taxable account that is gains (dynamically calculated)
  isLongTermGain = true,
  filingStatus = 'single',
  age = 65,
  otherIncome = 0, // Social Security, pension, etc.
}) => {
  const PENALTY_FREE_AGE = 59.5;
  const canAccessPenaltyFree = age >= PENALTY_FREE_AGE;
  const standardDeduction = STANDARD_DEDUCTION_2025[filingStatus] || STANDARD_DEDUCTION_2025.single;
  
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
      // 0% LTCG applies if total taxable income (including gains) stays below threshold
      const ltcgBrackets = TAX_BRACKETS_2025[filingStatus]?.ltcg || TAX_BRACKETS_2025.single.ltcg;
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
      const incomeBrackets = TAX_BRACKETS_2025[filingStatus]?.income || TAX_BRACKETS_2025.single.income;
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
      const ltcgBrackets = TAX_BRACKETS_2025[filingStatus]?.ltcg || TAX_BRACKETS_2025.single.ltcg;
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
    const taxFreeContributions = taxFreeBalance * 0.5; // Assume 50% is contributions
    const fromTaxFree = Math.min(remainingWithdrawal, taxFreeContributions);
    withdrawalBreakdown.fromTaxFree = fromTaxFree;
    remainingWithdrawal -= fromTaxFree;
    
    // 3. Tax-deferred with penalty as last resort
    if (remainingWithdrawal > 0) {
      const fromTaxDeferred = Math.min(remainingWithdrawal, taxDeferredBalance);
      if (fromTaxDeferred > 0) {
        const penalty = fromTaxDeferred * 0.10;
        
        // Calculate progressive income tax
        const incomeBrackets = TAX_BRACKETS_2025[filingStatus]?.income || TAX_BRACKETS_2025.single.income;
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