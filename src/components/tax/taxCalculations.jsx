// 2024 Tax Brackets and Standard Deductions
export const STANDARD_DEDUCTION_2024 = {
  single: 14600,
  married: 29200,
};

export const TAX_BRACKETS_2024 = {
  single: {
    income: [
      { min: 0, max: 11600, rate: 0.10, label: '10%' },
      { min: 11600, max: 47150, rate: 0.12, label: '12%' },
      { min: 47150, max: 100525, rate: 0.22, label: '22%' },
      { min: 100525, max: 191950, rate: 0.24, label: '24%' },
      { min: 191950, max: 243725, rate: 0.32, label: '32%' },
      { min: 243725, max: 609350, rate: 0.35, label: '35%' },
      { min: 609350, max: Infinity, rate: 0.37, label: '37%' },
    ],
    ltcg: [
      { min: 0, max: 47025, rate: 0, label: '0%' },
      { min: 47025, max: 518900, rate: 0.15, label: '15%' },
      { min: 518900, max: Infinity, rate: 0.20, label: '20%' },
    ],
  },
  married: {
    income: [
      { min: 0, max: 23200, rate: 0.10, label: '10%' },
      { min: 23200, max: 94300, rate: 0.12, label: '12%' },
      { min: 94300, max: 201050, rate: 0.22, label: '22%' },
      { min: 201050, max: 383900, rate: 0.24, label: '24%' },
      { min: 383900, max: 487450, rate: 0.32, label: '32%' },
      { min: 487450, max: 731200, rate: 0.35, label: '35%' },
      { min: 731200, max: Infinity, rate: 0.37, label: '37%' },
    ],
    ltcg: [
      { min: 0, max: 94050, rate: 0, label: '0%' },
      { min: 94050, max: 583750, rate: 0.15, label: '15%' },
      { min: 583750, max: Infinity, rate: 0.20, label: '20%' },
    ],
  },
};

// Get marginal income tax rate for a given taxable income
export const getIncomeTaxRate = (taxableIncome, filingStatus = 'single') => {
  const brackets = TAX_BRACKETS_2024[filingStatus]?.income || TAX_BRACKETS_2024.single.income;
  for (const bracket of brackets) {
    if (taxableIncome <= bracket.max) return bracket.rate;
  }
  return 0.37;
};

// Get long-term capital gains rate for a given taxable income
export const getLTCGRate = (taxableIncome, filingStatus = 'single') => {
  const brackets = TAX_BRACKETS_2024[filingStatus]?.ltcg || TAX_BRACKETS_2024.single.ltcg;
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
  const brackets = TAX_BRACKETS_2024[filingStatus]?.income || TAX_BRACKETS_2024.single.income;
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
  const standardDeduction = STANDARD_DEDUCTION_2024[filingStatus] || STANDARD_DEDUCTION_2024.single;
  
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
  taxableGainPercent = 0.5, // Assume 50% of taxable account is gains
  isLongTermGain = true,
  filingStatus = 'single',
  age = 65,
}) => {
  const PENALTY_FREE_AGE = 59.5;
  const canAccessPenaltyFree = age >= PENALTY_FREE_AGE;
  
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
  
  // Optimal withdrawal order depends on age and tax situation
  if (canAccessPenaltyFree) {
    // After 59.5: Withdraw from taxable first (lower tax on gains), then tax-deferred, then tax-free last
    
    // 1. Taxable first
    const fromTaxable = Math.min(remainingWithdrawal, taxableBalance);
    if (fromTaxable > 0) {
      const gainPortion = fromTaxable * taxableGainPercent;
      const taxOnTaxable = calculateWithdrawalTax({
        withdrawalAmount: fromTaxable,
        accountType: 'taxable',
        capitalGainAmount: gainPortion,
        isLongTermGain,
        filingStatus,
      });
      withdrawalBreakdown.fromTaxable = fromTaxable;
      withdrawalBreakdown.taxOnTaxable = taxOnTaxable;
      totalTax += taxOnTaxable;
      remainingWithdrawal -= fromTaxable;
    }
    
    // 2. Tax-deferred second
    const fromTaxDeferred = Math.min(remainingWithdrawal, taxDeferredBalance);
    if (fromTaxDeferred > 0) {
      const taxOnTaxDeferred = calculateWithdrawalTax({
        withdrawalAmount: fromTaxDeferred,
        accountType: 'tax_deferred',
        otherIncome: withdrawalBreakdown.fromTaxable * taxableGainPercent,
        filingStatus,
      });
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
      const taxOnTaxable = calculateWithdrawalTax({
        withdrawalAmount: fromTaxable,
        accountType: 'taxable',
        capitalGainAmount: gainPortion,
        isLongTermGain,
        filingStatus,
      });
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
        const taxOnTaxDeferred = calculateWithdrawalTax({
          withdrawalAmount: fromTaxDeferred,
          accountType: 'tax_deferred',
          otherIncome: withdrawalBreakdown.fromTaxable * taxableGainPercent,
          filingStatus,
        });
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