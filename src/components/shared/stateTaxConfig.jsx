// ===========================================
// STATE TAX CONFIGURATION
// Last updated: 2025
// ===========================================

export const STATE_TAX_CONFIG = {
  // ===== NO STATE INCOME TAX =====
  AK: { name: 'Alaska', hasIncomeTax: false, rate: 0, taxesSS: false, taxesRetirement: false, taxesPension: false },
  FL: { name: 'Florida', hasIncomeTax: false, rate: 0, taxesSS: false, taxesRetirement: false, taxesPension: false },
  NV: { name: 'Nevada', hasIncomeTax: false, rate: 0, taxesSS: false, taxesRetirement: false, taxesPension: false },
  NH: { name: 'New Hampshire', hasIncomeTax: false, rate: 0, taxesSS: false, taxesRetirement: false, taxesPension: false },
  SD: { name: 'South Dakota', hasIncomeTax: false, rate: 0, taxesSS: false, taxesRetirement: false, taxesPension: false },
  TN: { name: 'Tennessee', hasIncomeTax: false, rate: 0, taxesSS: false, taxesRetirement: false, taxesPension: false },
  TX: { name: 'Texas', hasIncomeTax: false, rate: 0, taxesSS: false, taxesRetirement: false, taxesPension: false },
  WA: { name: 'Washington', hasIncomeTax: false, rate: 0, taxesSS: false, taxesRetirement: false, taxesPension: false },
  WY: { name: 'Wyoming', hasIncomeTax: false, rate: 0, taxesSS: false, taxesRetirement: false, taxesPension: false },

  // ===== NO TAX ON RETIREMENT INCOME (but has income tax) =====
  IL: { name: 'Illinois', hasIncomeTax: true, rate: 4.95, taxesSS: false, taxesRetirement: false, taxesPension: false },
  IA: { name: 'Iowa', hasIncomeTax: true, rate: 3.8, taxesSS: false, taxesRetirement: false, taxesPension: false },
  MS: { name: 'Mississippi', hasIncomeTax: true, rate: 4.4, taxesSS: false, taxesRetirement: false, taxesPension: false },
  PA: { name: 'Pennsylvania', hasIncomeTax: true, rate: 3.07, taxesSS: false, taxesRetirement: false, taxesPension: false },

  // ===== STATES THAT TAX SOCIAL SECURITY (with exemptions) =====
  CO: { name: 'Colorado', hasIncomeTax: true, rate: 4.4, taxesSS: true, ssExemptAge: 55, ssExemptSingleAGI: 75000, ssExemptJointAGI: 95000, taxesRetirement: true, retirementDeduction: 24000, retirementDeductionAge: 65, taxesPension: true },
  CT: { name: 'Connecticut', hasIncomeTax: true, rate: 6.99, taxesSS: true, ssExemptSingleAGI: 75000, ssExemptJointAGI: 100000, ssPartialExemptPct: 75, taxesRetirement: true, taxesPension: true },
  MN: { name: 'Minnesota', hasIncomeTax: true, rate: 9.85, taxesSS: true, ssExemptSingleAGI: 84490, ssExemptJointAGI: 108320, taxesRetirement: true, taxesPension: true },
  MT: { name: 'Montana', hasIncomeTax: true, rate: 5.9, taxesSS: true, ssExemptSingleAGI: 25000, ssExemptJointAGI: 32000, taxesRetirement: true, retirementDeduction: 5500, taxesPension: true },
  NM: { name: 'New Mexico', hasIncomeTax: true, rate: 5.9, taxesSS: true, ssExemptSingleAGI: 100000, ssExemptJointAGI: 150000, taxesRetirement: true, taxesPension: true },
  RI: { name: 'Rhode Island', hasIncomeTax: true, rate: 5.99, taxesSS: true, ssExemptSingleAGI: 107000, ssExemptJointAGI: 133750, ssRequiresFullRetirementAge: true, taxesRetirement: true, taxesPension: true },
  UT: { name: 'Utah', hasIncomeTax: true, rate: 4.65, taxesSS: true, ssExemptSingleAGI: 45000, ssExemptJointAGI: 75000, ssCreditPhaseout: true, taxesRetirement: true, taxesPension: true },
  VT: { name: 'Vermont', hasIncomeTax: true, rate: 8.75, taxesSS: true, ssExemptSingleAGI: 50000, ssExemptJointAGI: 65000, taxesRetirement: true, taxesPension: true },
  WV: { name: 'West Virginia', hasIncomeTax: true, rate: 5.12, taxesSS: true, ssPhaseoutYear: 2026, ssExemptSingleAGI: 50000, ssExemptJointAGI: 100000, taxesRetirement: true, taxesPension: true },

  // ===== STATES WITH RETIREMENT DEDUCTIONS =====
  AL: { name: 'Alabama', hasIncomeTax: true, rate: 5.0, taxesSS: false, taxesRetirement: true, retirementDeduction: 6000, retirementDeductionAge: 65, taxesPension: false },
  AZ: { name: 'Arizona', hasIncomeTax: true, rate: 2.5, taxesSS: false, taxesRetirement: true, taxesPension: true },
  AR: { name: 'Arkansas', hasIncomeTax: true, rate: 3.9, taxesSS: false, taxesRetirement: true, retirementDeduction: 6000, taxesPension: true },
  CA: { name: 'California', hasIncomeTax: true, rate: 13.3, taxesSS: false, taxesRetirement: true, taxesPension: true },
  DE: { name: 'Delaware', hasIncomeTax: true, rate: 6.6, taxesSS: false, taxesRetirement: true, retirementDeduction: 12500, retirementDeductionAge: 60, taxesPension: true },
  GA: { name: 'Georgia', hasIncomeTax: true, rate: 5.39, taxesSS: false, taxesRetirement: true, retirementDeduction: 65000, retirementDeductionAge: 65, taxesPension: true },
  HI: { name: 'Hawaii', hasIncomeTax: true, rate: 11.0, taxesSS: false, taxesRetirement: true, taxesPension: false },
  ID: { name: 'Idaho', hasIncomeTax: true, rate: 5.8, taxesSS: false, taxesRetirement: true, taxesPension: true },
  IN: { name: 'Indiana', hasIncomeTax: true, rate: 3.0, taxesSS: false, taxesRetirement: true, taxesPension: true },
  KS: { name: 'Kansas', hasIncomeTax: true, rate: 5.7, taxesSS: false, taxesRetirement: true, taxesPension: true },
  KY: { name: 'Kentucky', hasIncomeTax: true, rate: 4.0, taxesSS: false, taxesRetirement: true, retirementDeduction: 31110, taxesPension: true },
  LA: { name: 'Louisiana', hasIncomeTax: true, rate: 3.0, taxesSS: false, taxesRetirement: true, retirementDeduction: 6000, retirementDeductionAge: 65, taxesPension: true },
  ME: { name: 'Maine', hasIncomeTax: true, rate: 7.15, taxesSS: false, taxesRetirement: true, retirementDeduction: 35000, taxesPension: true },
  MD: { name: 'Maryland', hasIncomeTax: true, rate: 5.75, taxesSS: false, taxesRetirement: true, retirementDeduction: 34300, retirementDeductionAge: 65, taxesPension: true },
  MA: { name: 'Massachusetts', hasIncomeTax: true, rate: 9.0, taxesSS: false, taxesRetirement: true, taxesPension: true },
  MI: { name: 'Michigan', hasIncomeTax: true, rate: 4.25, taxesSS: false, taxesRetirement: true, retirementDeduction: 20000, retirementDeductionAge: 67, taxesPension: true },
  MO: { name: 'Missouri', hasIncomeTax: true, rate: 4.8, taxesSS: false, taxesRetirement: true, taxesPension: true },
  NE: { name: 'Nebraska', hasIncomeTax: true, rate: 5.2, taxesSS: false, taxesRetirement: true, taxesPension: true },
  NJ: { name: 'New Jersey', hasIncomeTax: true, rate: 10.75, taxesSS: false, taxesRetirement: true, retirementDeduction: 100000, retirementDeductionAge: 62, taxesPension: true },
  NY: { name: 'New York', hasIncomeTax: true, rate: 10.9, taxesSS: false, taxesRetirement: true, retirementDeduction: 20000, retirementDeductionAge: 59.5, taxesPension: false },
  NC: { name: 'North Carolina', hasIncomeTax: true, rate: 4.25, taxesSS: false, taxesRetirement: true, taxesPension: true },
  ND: { name: 'North Dakota', hasIncomeTax: true, rate: 2.5, taxesSS: false, taxesRetirement: true, taxesPension: true },
  OH: { name: 'Ohio', hasIncomeTax: true, rate: 3.5, taxesSS: false, taxesRetirement: true, retirementDeduction: 200, taxesPension: true },
  OK: { name: 'Oklahoma', hasIncomeTax: true, rate: 4.75, taxesSS: false, taxesRetirement: true, retirementDeduction: 10000, taxesPension: true },
  OR: { name: 'Oregon', hasIncomeTax: true, rate: 9.9, taxesSS: false, taxesRetirement: true, retirementDeduction: 7500, taxesPension: true },
  SC: { name: 'South Carolina', hasIncomeTax: true, rate: 6.2, taxesSS: false, taxesRetirement: true, retirementDeduction: 10000, retirementDeductionAge: 65, taxesPension: true },
  VA: { name: 'Virginia', hasIncomeTax: true, rate: 5.75, taxesSS: false, taxesRetirement: true, retirementDeduction: 12000, retirementDeductionAge: 65, taxesPension: true },
  WI: { name: 'Wisconsin', hasIncomeTax: true, rate: 7.65, taxesSS: false, taxesRetirement: true, taxesPension: true },
  DC: { name: 'Washington D.C.', hasIncomeTax: true, rate: 10.75, taxesSS: false, taxesRetirement: true, retirementDeduction: 3000, taxesPension: true },
};

// Calculate state tax on retirement withdrawals
export function calculateStateTaxOnRetirement({
  state,
  age,
  filingStatus,
  totalAGI,
  socialSecurityIncome = 0,
  taxDeferredWithdrawal = 0,
  taxableWithdrawal = 0,
  taxableGainPortion = 0,
  pensionIncome = 0,
  year = new Date().getFullYear()
}) {
  const config = STATE_TAX_CONFIG[state];
  if (!config || !config.hasIncomeTax) return 0;

  let taxableAmount = 0;
  const isJoint = filingStatus === 'married_filing_jointly' || filingStatus === 'married';

  // 1. Social Security taxation
  if (config.taxesSS && socialSecurityIncome > 0) {
    let ssTaxable = true;
    
    if (config.ssPhaseoutYear && year >= config.ssPhaseoutYear) {
      ssTaxable = false;
    } else if (config.ssExemptAge && age >= config.ssExemptAge) {
      const threshold = isJoint ? config.ssExemptJointAGI : config.ssExemptSingleAGI;
      if (!threshold || totalAGI <= threshold) {
        ssTaxable = false;
      }
    } else {
      const threshold = isJoint ? config.ssExemptJointAGI : config.ssExemptSingleAGI;
      if (threshold && totalAGI <= threshold) {
        ssTaxable = false;
      }
    }
    
    if (ssTaxable) {
      if (config.ssPartialExemptPct) {
        taxableAmount += socialSecurityIncome * (1 - config.ssPartialExemptPct / 100);
      } else {
        taxableAmount += socialSecurityIncome;
      }
    }
  }

  // 2. Retirement distribution taxation (401k/IRA)
  if (config.taxesRetirement && taxDeferredWithdrawal > 0) {
    let taxableRetirement = taxDeferredWithdrawal;
    
    if (config.retirementDeduction) {
      const meetsAgeRequirement = !config.retirementDeductionAge || age >= config.retirementDeductionAge;
      if (meetsAgeRequirement) {
        taxableRetirement = Math.max(0, taxDeferredWithdrawal - config.retirementDeduction);
      }
    }
    taxableAmount += taxableRetirement;
  }

  // 3. Capital gains (most states tax as ordinary income)
  if (config.hasIncomeTax && taxableGainPortion > 0) {
    taxableAmount += taxableGainPortion;
  }

  // 4. Pension income
  if (config.taxesPension && pensionIncome > 0) {
    taxableAmount += pensionIncome;
  }

  return Math.round(taxableAmount * (config.rate / 100));
}

// Get sorted list of states for dropdown
export function getStateOptions() {
  return Object.entries(STATE_TAX_CONFIG)
    .map(([code, config]) => ({
      value: code,
      label: config.name,
      rate: config.rate,
      taxInfo: !config.hasIncomeTax 
        ? 'No income tax' 
        : config.taxesSS 
          ? `${config.rate}% (taxes SS)` 
          : `${config.rate}%`
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Get summary for display
export function getStateTaxSummary(state) {
  const config = STATE_TAX_CONFIG[state];
  if (!config) return null;
  
  if (!config.hasIncomeTax) {
    return { rate: 0, summary: 'No state income tax', details: [] };
  }
  
  const details = [];
  if (!config.taxesSS) details.push('SS exempt');
  else details.push('Taxes SS');
  
  if (!config.taxesRetirement) details.push('401k/IRA exempt');
  else if (config.retirementDeduction) details.push(`$${config.retirementDeduction.toLocaleString()} deduction`);
  
  if (!config.taxesPension) details.push('Pension exempt');
  
  return {
    rate: config.rate,
    summary: `${config.rate}% top rate`,
    details
  };
}