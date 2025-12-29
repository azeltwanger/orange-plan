// ===========================================
// STATE TAX CONFIGURATION - COMPLETE VERSION
// Last updated: 2025
// Includes: brackets, standard deductions, LTCG treatment
// ===========================================

export const STATE_TAX_CONFIG = {
  // ===== NO STATE INCOME TAX =====
  AK: { 
    name: 'Alaska', 
    hasIncomeTax: false, 
    brackets: [],
    standardDeduction: { single: 0, married: 0 },
    ltcgTreatment: 'none',
    taxesSS: false, 
    taxesRetirement: false, 
    taxesPension: false 
  },
  FL: { 
    name: 'Florida', 
    hasIncomeTax: false, 
    brackets: [],
    standardDeduction: { single: 0, married: 0 },
    ltcgTreatment: 'none',
    taxesSS: false, 
    taxesRetirement: false, 
    taxesPension: false 
  },
  NV: { 
    name: 'Nevada', 
    hasIncomeTax: false, 
    brackets: [],
    standardDeduction: { single: 0, married: 0 },
    ltcgTreatment: 'none',
    taxesSS: false, 
    taxesRetirement: false, 
    taxesPension: false 
  },
  NH: { 
    name: 'New Hampshire', 
    hasIncomeTax: false, 
    brackets: [],
    standardDeduction: { single: 0, married: 0 },
    ltcgTreatment: 'none',
    taxesSS: false, 
    taxesRetirement: false, 
    taxesPension: false 
  },
  SD: { 
    name: 'South Dakota', 
    hasIncomeTax: false, 
    brackets: [],
    standardDeduction: { single: 0, married: 0 },
    ltcgTreatment: 'none',
    taxesSS: false, 
    taxesRetirement: false, 
    taxesPension: false 
  },
  TN: { 
    name: 'Tennessee', 
    hasIncomeTax: false, 
    brackets: [],
    standardDeduction: { single: 0, married: 0 },
    ltcgTreatment: 'none',
    taxesSS: false, 
    taxesRetirement: false, 
    taxesPension: false 
  },
  TX: { 
    name: 'Texas', 
    hasIncomeTax: false, 
    brackets: [],
    standardDeduction: { single: 0, married: 0 },
    ltcgTreatment: 'none',
    taxesSS: false, 
    taxesRetirement: false, 
    taxesPension: false 
  },
  WA: { 
    name: 'Washington', 
    hasIncomeTax: false, 
    brackets: [],
    standardDeduction: { single: 0, married: 0 },
    ltcgTreatment: 'special', // 7% on gains over threshold
    ltcgSpecialRate: 0.07,
    ltcgSpecialThreshold: 270000,
    taxesSS: false, 
    taxesRetirement: false, 
    taxesPension: false 
  },
  WY: { 
    name: 'Wyoming', 
    hasIncomeTax: false, 
    brackets: [],
    standardDeduction: { single: 0, married: 0 },
    ltcgTreatment: 'none',
    taxesSS: false, 
    taxesRetirement: false, 
    taxesPension: false 
  },

  // ===== HIGH-POPULATION STATES WITH COMPLETE BRACKETS =====
  CA: { 
    name: 'California', 
    hasIncomeTax: true,
    brackets: [
      { min: 0, max: 10412, rate: 1.0 },
      { min: 10412, max: 24684, rate: 2.0 },
      { min: 24684, max: 38959, rate: 4.0 },
      { min: 38959, max: 54081, rate: 6.0 },
      { min: 54081, max: 68350, rate: 8.0 },
      { min: 68350, max: 349137, rate: 9.3 },
      { min: 349137, max: 418961, rate: 10.3 },
      { min: 418961, max: 698271, rate: 11.3 },
      { min: 698271, max: 1000000, rate: 12.3 },
      { min: 1000000, max: Infinity, rate: 13.3 }
    ],
    bracketsMarried: [
      { min: 0, max: 20824, rate: 1.0 },
      { min: 20824, max: 49368, rate: 2.0 },
      { min: 49368, max: 77918, rate: 4.0 },
      { min: 77918, max: 108162, rate: 6.0 },
      { min: 108162, max: 136700, rate: 8.0 },
      { min: 136700, max: 698274, rate: 9.3 },
      { min: 698274, max: 837922, rate: 10.3 },
      { min: 837922, max: 1396542, rate: 11.3 },
      { min: 1396542, max: 1000000, rate: 12.3 },
      { min: 1000000, max: Infinity, rate: 13.3 }
    ],
    standardDeduction: { single: 5363, married: 10726 },
    ltcgTreatment: 'ordinary', // taxed as ordinary income
    taxesSS: false, 
    taxesRetirement: true, 
    taxesPension: true 
  },
  NY: { 
    name: 'New York', 
    hasIncomeTax: true,
    brackets: [
      { min: 0, max: 8500, rate: 4.0 },
      { min: 8500, max: 11700, rate: 4.5 },
      { min: 11700, max: 13900, rate: 5.25 },
      { min: 13900, max: 80650, rate: 5.5 },
      { min: 80650, max: 215400, rate: 6.0 },
      { min: 215400, max: 1077550, rate: 6.85 },
      { min: 1077550, max: 5000000, rate: 9.65 },
      { min: 5000000, max: 25000000, rate: 10.3 },
      { min: 25000000, max: Infinity, rate: 10.9 }
    ],
    bracketsMarried: [
      { min: 0, max: 17150, rate: 4.0 },
      { min: 17150, max: 23600, rate: 4.5 },
      { min: 23600, max: 27900, rate: 5.25 },
      { min: 27900, max: 161550, rate: 5.5 },
      { min: 161550, max: 323200, rate: 6.0 },
      { min: 323200, max: 2155350, rate: 6.85 },
      { min: 2155350, max: 5000000, rate: 9.65 },
      { min: 5000000, max: 25000000, rate: 10.3 },
      { min: 25000000, max: Infinity, rate: 10.9 }
    ],
    standardDeduction: { single: 8000, married: 16050 },
    ltcgTreatment: 'ordinary',
    taxesSS: false, 
    taxesRetirement: true,
    retirementDeduction: 20000,
    retirementDeductionAge: 59.5, 
    taxesPension: false 
  },

  // ===== REMAINING STATES WITH COMPLETE DATA =====
  AL: { name: 'Alabama', hasIncomeTax: true, brackets: [{ min: 0, max: 500, rate: 2 }, { min: 500, max: 3000, rate: 4 }, { min: 3000, max: Infinity, rate: 5 }], standardDeduction: { single: 3000, married: 8500 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, retirementDeduction: 6000, retirementDeductionAge: 65, taxesPension: false },
  AZ: { name: 'Arizona', hasIncomeTax: true, brackets: [{ min: 0, max: Infinity, rate: 2.5 }], standardDeduction: { single: 14600, married: 29200 }, ltcgTreatment: 'ordinary', ltcgDeductionPercent: 25, taxesSS: false, taxesRetirement: true, taxesPension: true },
  AR: { name: 'Arkansas', hasIncomeTax: true, brackets: [{ min: 0, max: 5100, rate: 0 }, { min: 5100, max: 10300, rate: 2 }, { min: 10300, max: 15400, rate: 3 }, { min: 15400, max: 26800, rate: 3.4 }, { min: 26800, max: Infinity, rate: 3.9 }], standardDeduction: { single: 2340, married: 4680 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, retirementDeduction: 6000, taxesPension: true },
  CO: { name: 'Colorado', hasIncomeTax: true, brackets: [{ min: 0, max: Infinity, rate: 4.4 }], standardDeduction: { single: 15000, married: 30000 }, ltcgTreatment: 'ordinary', taxesSS: true, ssExemptAge: 55, ssExemptSingleAGI: 75000, ssExemptJointAGI: 95000, taxesRetirement: true, retirementDeduction: 24000, retirementDeductionAge: 65, taxesPension: true },
  CT: { name: 'Connecticut', hasIncomeTax: true, brackets: [{ min: 0, max: 10000, rate: 3 }, { min: 10000, max: 50000, rate: 5 }, { min: 50000, max: 100000, rate: 5.5 }, { min: 100000, max: 200000, rate: 6 }, { min: 200000, max: 250000, rate: 6.5 }, { min: 250000, max: 500000, rate: 6.9 }, { min: 500000, max: Infinity, rate: 6.99 }], standardDeduction: { single: 0, married: 0 }, personalExemption: { single: 15000, married: 24000 }, ltcgTreatment: 'ordinary', taxesSS: true, ssExemptSingleAGI: 75000, ssExemptJointAGI: 100000, ssPartialExemptPct: 75, taxesRetirement: true, taxesPension: true },
  DE: { name: 'Delaware', hasIncomeTax: true, brackets: [{ min: 0, max: 2000, rate: 0 }, { min: 2000, max: 5000, rate: 2.2 }, { min: 5000, max: 10000, rate: 3.9 }, { min: 10000, max: 20000, rate: 4.8 }, { min: 20000, max: 25000, rate: 5.2 }, { min: 25000, max: 60000, rate: 5.55 }, { min: 60000, max: Infinity, rate: 6.6 }], standardDeduction: { single: 3250, married: 6500 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, retirementDeduction: 12500, retirementDeductionAge: 60, taxesPension: true },
  GA: { name: 'Georgia', hasIncomeTax: true, brackets: [{ min: 0, max: Infinity, rate: 5.39 }], standardDeduction: { single: 12000, married: 24000 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, retirementDeduction: 65000, retirementDeductionAge: 65, taxesPension: true },
  HI: { name: 'Hawaii', hasIncomeTax: true, brackets: [{ min: 0, max: 2400, rate: 1.4 }, { min: 2400, max: 4800, rate: 3.2 }, { min: 4800, max: 9600, rate: 5.5 }, { min: 9600, max: 14400, rate: 6.4 }, { min: 14400, max: 19200, rate: 6.8 }, { min: 19200, max: 24000, rate: 7.2 }, { min: 24000, max: 36000, rate: 7.6 }, { min: 36000, max: 48000, rate: 7.9 }, { min: 48000, max: 150000, rate: 8.25 }, { min: 150000, max: 175000, rate: 9 }, { min: 175000, max: 200000, rate: 10 }, { min: 200000, max: Infinity, rate: 11 }], standardDeduction: { single: 2200, married: 4400 }, ltcgTreatment: 'special', ltcgRate: 7.25, taxesSS: false, taxesRetirement: true, taxesPension: false },
  ID: { name: 'Idaho', hasIncomeTax: true, brackets: [{ min: 0, max: Infinity, rate: 5.8 }], standardDeduction: { single: 14600, married: 29200 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, taxesPension: true },
  IL: { name: 'Illinois', hasIncomeTax: true, brackets: [{ min: 0, max: Infinity, rate: 4.95 }], standardDeduction: { single: 0, married: 0 }, personalExemption: { single: 2625, married: 5250 }, ltcgTreatment: 'exempt', taxesSS: false, taxesRetirement: false, taxesPension: false },
  IN: { name: 'Indiana', hasIncomeTax: true, brackets: [{ min: 0, max: Infinity, rate: 3.0 }], standardDeduction: { single: 0, married: 0 }, personalExemption: { single: 1000, married: 2000 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, taxesPension: true },
  IA: { name: 'Iowa', hasIncomeTax: true, brackets: [{ min: 0, max: Infinity, rate: 3.8 }], standardDeduction: { single: 0, married: 0 }, ltcgTreatment: 'exempt', taxesSS: false, taxesRetirement: false, taxesPension: false },
  KS: { name: 'Kansas', hasIncomeTax: true, brackets: [{ min: 0, max: 15000, rate: 3.1 }, { min: 15000, max: 30000, rate: 5.25 }, { min: 30000, max: Infinity, rate: 5.7 }], standardDeduction: { single: 3500, married: 8000 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, taxesPension: true },
  KY: { name: 'Kentucky', hasIncomeTax: true, brackets: [{ min: 0, max: Infinity, rate: 4.0 }], standardDeduction: { single: 3160, married: 6320 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, retirementDeduction: 31110, taxesPension: true },
  LA: { name: 'Louisiana', hasIncomeTax: true, brackets: [{ min: 0, max: Infinity, rate: 3.0 }], standardDeduction: { single: 12500, married: 25000 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, retirementDeduction: 6000, retirementDeductionAge: 65, taxesPension: true },
  ME: { name: 'Maine', hasIncomeTax: true, brackets: [{ min: 0, max: 26050, rate: 5.8 }, { min: 26050, max: 61600, rate: 6.75 }, { min: 61600, max: Infinity, rate: 7.15 }], standardDeduction: { single: 14600, married: 29200 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, retirementDeduction: 35000, taxesPension: true },
  MD: { name: 'Maryland', hasIncomeTax: true, brackets: [{ min: 0, max: 1000, rate: 2 }, { min: 1000, max: 2000, rate: 3 }, { min: 2000, max: 3000, rate: 4 }, { min: 3000, max: 100000, rate: 4.75 }, { min: 100000, max: 125000, rate: 5 }, { min: 125000, max: 150000, rate: 5.25 }, { min: 150000, max: 250000, rate: 5.5 }, { min: 250000, max: Infinity, rate: 5.75 }], standardDeduction: { single: 2550, married: 5150 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, retirementDeduction: 34300, retirementDeductionAge: 65, taxesPension: true },
  MA: { name: 'Massachusetts', hasIncomeTax: true, brackets: [{ min: 0, max: 1000000, rate: 5.0 }, { min: 1000000, max: Infinity, rate: 9.0 }], standardDeduction: { single: 0, married: 0 }, personalExemption: { single: 4400, married: 8800 }, ltcgTreatment: 'special', ltcgShortTermRate: 8.5, ltcgLongTermRate: 5.0, ltcgMillionaireSurtax: 4.0, taxesSS: false, taxesRetirement: true, taxesPension: true },
  MI: { name: 'Michigan', hasIncomeTax: true, brackets: [{ min: 0, max: Infinity, rate: 4.25 }], standardDeduction: { single: 0, married: 0 }, personalExemption: { single: 5600, married: 11200 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, retirementDeduction: 20000, retirementDeductionAge: 67, taxesPension: true },
  MN: { name: 'Minnesota', hasIncomeTax: true, brackets: [{ min: 0, max: 31690, rate: 5.35 }, { min: 31690, max: 104090, rate: 6.8 }, { min: 104090, max: 193240, rate: 7.85 }, { min: 193240, max: Infinity, rate: 9.85 }], standardDeduction: { single: 14575, married: 29150 }, ltcgTreatment: 'ordinary', taxesSS: true, ssExemptSingleAGI: 84490, ssExemptJointAGI: 108320, taxesRetirement: true, taxesPension: true },
  MS: { name: 'Mississippi', hasIncomeTax: true, brackets: [{ min: 0, max: 10000, rate: 0 }, { min: 10000, max: Infinity, rate: 4.4 }], standardDeduction: { single: 2300, married: 4600 }, ltcgTreatment: 'exempt', taxesSS: false, taxesRetirement: false, taxesPension: false },
  MO: { name: 'Missouri', hasIncomeTax: true, brackets: [{ min: 0, max: 1207, rate: 0 }, { min: 1207, max: 2414, rate: 2.0 }, { min: 2414, max: 3621, rate: 2.5 }, { min: 3621, max: 4828, rate: 3.0 }, { min: 4828, max: 6035, rate: 3.5 }, { min: 6035, max: 7242, rate: 4.0 }, { min: 7242, max: 8449, rate: 4.5 }, { min: 8449, max: Infinity, rate: 4.8 }], standardDeduction: { single: 14600, married: 29200 }, ltcgTreatment: 'exempt', ltcgExemptionNote: 'MO exempts all capital gains starting 2025', taxesSS: false, taxesRetirement: true, taxesPension: true },
  MT: { name: 'Montana', hasIncomeTax: true, brackets: [{ min: 0, max: 20500, rate: 4.7 }, { min: 20500, max: Infinity, rate: 5.9 }], standardDeduction: { single: 14600, married: 29200 }, ltcgTreatment: 'credit', ltcgCreditPercent: 2, taxesSS: true, ssExemptSingleAGI: 25000, ssExemptJointAGI: 32000, taxesRetirement: true, retirementDeduction: 5500, taxesPension: true },
  NE: { name: 'Nebraska', hasIncomeTax: true, brackets: [{ min: 0, max: 3700, rate: 2.46 }, { min: 3700, max: 22170, rate: 3.51 }, { min: 22170, max: 35730, rate: 5.01 }, { min: 35730, max: Infinity, rate: 5.2 }], standardDeduction: { single: 8100, married: 16100 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, taxesPension: true },
  NJ: { name: 'New Jersey', hasIncomeTax: true, brackets: [{ min: 0, max: 20000, rate: 1.4 }, { min: 20000, max: 35000, rate: 1.75 }, { min: 35000, max: 40000, rate: 3.5 }, { min: 40000, max: 75000, rate: 5.525 }, { min: 75000, max: 500000, rate: 6.37 }, { min: 500000, max: 1000000, rate: 8.97 }, { min: 1000000, max: Infinity, rate: 10.75 }], standardDeduction: { single: 0, married: 0 }, personalExemption: { single: 1000, married: 2000 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, retirementDeduction: 100000, retirementDeductionAge: 62, taxesPension: true },
  NM: { name: 'New Mexico', hasIncomeTax: true, brackets: [{ min: 0, max: 5500, rate: 1.7 }, { min: 5500, max: 11000, rate: 3.2 }, { min: 11000, max: 16000, rate: 4.7 }, { min: 16000, max: 210000, rate: 4.9 }, { min: 210000, max: Infinity, rate: 5.9 }], standardDeduction: { single: 14600, married: 29200 }, ltcgTreatment: 'deduction', ltcgDeductionMax: 1000, taxesSS: true, ssExemptSingleAGI: 100000, ssExemptJointAGI: 150000, taxesRetirement: true, taxesPension: true },
  NC: { name: 'North Carolina', hasIncomeTax: true, brackets: [{ min: 0, max: Infinity, rate: 4.25 }], standardDeduction: { single: 12750, married: 25500 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, taxesPension: true },
  ND: { name: 'North Dakota', hasIncomeTax: true, brackets: [{ min: 0, max: 44725, rate: 1.95 }, { min: 44725, max: Infinity, rate: 2.5 }], standardDeduction: { single: 14600, married: 29200 }, ltcgTreatment: 'deduction', ltcgDeductionPercent: 40, taxesSS: false, taxesRetirement: true, taxesPension: true },
  OH: { name: 'Ohio', hasIncomeTax: true, brackets: [{ min: 0, max: 26050, rate: 0 }, { min: 26050, max: 100000, rate: 2.75 }, { min: 100000, max: Infinity, rate: 3.5 }], standardDeduction: { single: 0, married: 0 }, personalExemption: { single: 2400, married: 4800 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, retirementDeduction: 200, taxesPension: true },
  OK: { name: 'Oklahoma', hasIncomeTax: true, brackets: [{ min: 0, max: 1000, rate: 0.25 }, { min: 1000, max: 2500, rate: 0.75 }, { min: 2500, max: 3750, rate: 1.75 }, { min: 3750, max: 4900, rate: 2.75 }, { min: 4900, max: 7200, rate: 3.75 }, { min: 7200, max: Infinity, rate: 4.75 }], standardDeduction: { single: 6350, married: 12700 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, retirementDeduction: 10000, taxesPension: true },
  OR: { name: 'Oregon', hasIncomeTax: true, brackets: [{ min: 0, max: 4300, rate: 4.75 }, { min: 4300, max: 10750, rate: 6.75 }, { min: 10750, max: 125000, rate: 8.75 }, { min: 125000, max: Infinity, rate: 9.9 }], standardDeduction: { single: 2745, married: 5495 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, retirementDeduction: 7500, taxesPension: true },
  PA: { name: 'Pennsylvania', hasIncomeTax: true, brackets: [{ min: 0, max: Infinity, rate: 3.07 }], standardDeduction: { single: 0, married: 0 }, ltcgTreatment: 'exempt', taxesSS: false, taxesRetirement: false, taxesPension: false },
  RI: { name: 'Rhode Island', hasIncomeTax: true, brackets: [{ min: 0, max: 77450, rate: 3.75 }, { min: 77450, max: 176050, rate: 4.75 }, { min: 176050, max: Infinity, rate: 5.99 }], standardDeduction: { single: 10550, married: 21150 }, ltcgTreatment: 'ordinary', taxesSS: true, ssExemptSingleAGI: 107000, ssExemptJointAGI: 133750, ssRequiresFullRetirementAge: true, taxesRetirement: true, taxesPension: true },
  SC: { name: 'South Carolina', hasIncomeTax: true, brackets: [{ min: 0, max: 3460, rate: 0 }, { min: 3460, max: 17330, rate: 3.0 }, { min: 17330, max: Infinity, rate: 6.2 }], standardDeduction: { single: 14600, married: 29200 }, ltcgTreatment: 'deduction', ltcgDeductionPercent: 44, taxesSS: false, taxesRetirement: true, retirementDeduction: 10000, retirementDeductionAge: 65, taxesPension: true },
  UT: { name: 'Utah', hasIncomeTax: true, brackets: [{ min: 0, max: Infinity, rate: 4.65 }], standardDeduction: { single: 0, married: 0 }, personalExemption: { single: 0, married: 0 }, taxpayerCredit: { single: 876, married: 1752 }, ltcgTreatment: 'ordinary', taxesSS: true, ssExemptSingleAGI: 45000, ssExemptJointAGI: 75000, ssCreditPhaseout: true, taxesRetirement: true, taxesPension: true },
  VT: { name: 'Vermont', hasIncomeTax: true, brackets: [{ min: 0, max: 45400, rate: 3.35 }, { min: 45400, max: 110050, rate: 6.6 }, { min: 110050, max: 229550, rate: 7.6 }, { min: 229550, max: Infinity, rate: 8.75 }], standardDeduction: { single: 7000, married: 14050 }, ltcgTreatment: 'exclusion', ltcgExclusionPercent: 40, ltcgExclusionCap: 350000, taxesSS: true, ssExemptSingleAGI: 50000, ssExemptJointAGI: 65000, taxesRetirement: true, taxesPension: true },
  VA: { name: 'Virginia', hasIncomeTax: true, brackets: [{ min: 0, max: 3000, rate: 2 }, { min: 3000, max: 5000, rate: 3 }, { min: 5000, max: 17000, rate: 5 }, { min: 17000, max: Infinity, rate: 5.75 }], standardDeduction: { single: 8000, married: 16000 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, retirementDeduction: 12000, retirementDeductionAge: 65, taxesPension: true },
  WV: { name: 'West Virginia', hasIncomeTax: true, brackets: [{ min: 0, max: 10000, rate: 2.36 }, { min: 10000, max: 25000, rate: 3.15 }, { min: 25000, max: 40000, rate: 3.54 }, { min: 40000, max: 60000, rate: 4.72 }, { min: 60000, max: Infinity, rate: 5.12 }], standardDeduction: { single: 0, married: 0 }, personalExemption: { single: 2000, married: 4000 }, ltcgTreatment: 'ordinary', taxesSS: true, ssPhaseoutYear: 2026, ssExemptSingleAGI: 50000, ssExemptJointAGI: 100000, taxesRetirement: true, taxesPension: true },
  WI: { name: 'Wisconsin', hasIncomeTax: true, brackets: [{ min: 0, max: 14320, rate: 3.5 }, { min: 14320, max: 28640, rate: 4.4 }, { min: 28640, max: 315310, rate: 5.3 }, { min: 315310, max: Infinity, rate: 7.65 }], standardDeduction: { single: 13230, married: 24470 }, ltcgTreatment: 'deduction', ltcgDeductionPercent: 30, ltcgDeductionMax: 500, taxesSS: false, taxesRetirement: true, taxesPension: true },
  DC: { name: 'Washington D.C.', hasIncomeTax: true, brackets: [{ min: 0, max: 10000, rate: 4 }, { min: 10000, max: 40000, rate: 6 }, { min: 40000, max: 60000, rate: 6.5 }, { min: 60000, max: 250000, rate: 8.5 }, { min: 250000, max: 500000, rate: 9.25 }, { min: 500000, max: 1000000, rate: 9.75 }, { min: 1000000, max: Infinity, rate: 10.75 }], standardDeduction: { single: 14600, married: 29200 }, ltcgTreatment: 'ordinary', taxesSS: false, taxesRetirement: true, retirementDeduction: 3000, taxesPension: true },
};


// ===========================================
// CALCULATION FUNCTIONS
// ===========================================

// Calculate state income tax using progressive brackets
export function calculateStateIncomeTax({
  income,
  filingStatus = 'single',
  state,
  year = 2025
}) {
  const config = STATE_TAX_CONFIG[state];
  if (!config || !config.hasIncomeTax) return 0;

  const isMarried = filingStatus === 'married_filing_jointly' || filingStatus === 'married';
  
  // Get standard deduction or personal exemption
  let deduction = 0;
  if (config.standardDeduction) {
    deduction = isMarried ? config.standardDeduction.married : config.standardDeduction.single;
  }
  if (config.personalExemption) {
    deduction += isMarried ? config.personalExemption.married : config.personalExemption.single;
  }
  
  const taxableIncome = Math.max(0, income - deduction);
  if (taxableIncome <= 0) return 0;
  
  // Get appropriate brackets
  const brackets = (isMarried && config.bracketsMarried) ? config.bracketsMarried : config.brackets;
  if (!brackets || brackets.length === 0) return 0;
  
  // Calculate progressive tax
  let tax = 0;
  let remainingIncome = taxableIncome;
  
  for (let i = 0; i < brackets.length && remainingIncome > 0; i++) {
    const bracket = brackets[i];
    const bracketMin = bracket.min;
    const bracketMax = bracket.max;
    const bracketSize = bracketMax === Infinity ? remainingIncome : Math.min(remainingIncome, bracketMax - bracketMin);
    
    if (taxableIncome > bracketMin) {
      const incomeInBracket = Math.min(bracketSize, taxableIncome - bracketMin);
      tax += incomeInBracket * (bracket.rate / 100);
      remainingIncome -= incomeInBracket;
    }
  }
  
  // Apply taxpayer credit if exists (Utah)
  if (config.taxpayerCredit) {
    const credit = isMarried ? config.taxpayerCredit.married : config.taxpayerCredit.single;
    tax = Math.max(0, tax - credit);
  }
  
  return Math.round(tax);
}


// Calculate state capital gains tax with special treatments
export function calculateStateCapitalGainsTax({
  longTermGains = 0,
  shortTermGains = 0,
  otherIncome = 0,
  filingStatus = 'single',
  state,
  year = 2025
}) {
  const config = STATE_TAX_CONFIG[state];
  if (!config || !config.hasIncomeTax) return { tax: 0, effectiveRate: 0 };

  const isMarried = filingStatus === 'married_filing_jointly' || filingStatus === 'married';
  
  // Handle special LTCG treatments
  let taxableLTCG = longTermGains;
  
  switch (config.ltcgTreatment) {
    case 'none':
    case 'exempt':
      // No tax on capital gains
      taxableLTCG = 0;
      break;
      
    case 'deduction':
      // Percentage deduction (SC 44%, ND 40%, WI 30%, etc.)
      if (config.ltcgDeductionPercent) {
        taxableLTCG = longTermGains * (1 - config.ltcgDeductionPercent / 100);
      }
      if (config.ltcgDeductionMax) {
        const deduction = Math.min(longTermGains * (config.ltcgDeductionPercent / 100), config.ltcgDeductionMax);
        taxableLTCG = longTermGains - deduction;
      }
      break;
      
    case 'exclusion':
      // Vermont-style exclusion with cap
      if (config.ltcgExclusionPercent) {
        const exclusion = longTermGains * (config.ltcgExclusionPercent / 100);
        const cappedExclusion = config.ltcgExclusionCap ? Math.min(exclusion, config.ltcgExclusionCap) : exclusion;
        taxableLTCG = longTermGains - cappedExclusion;
      }
      break;
      
    case 'credit':
      // Montana gives a credit instead of deduction
      // Will apply after tax calculation
      break;
      
    case 'special':
      // Washington's 7% on gains over threshold
      if (state === 'WA') {
        const threshold = config.ltcgSpecialThreshold || 270000;
        if (longTermGains > threshold) {
          const taxableGains = longTermGains - threshold;
          return { 
            tax: Math.round(taxableGains * config.ltcgSpecialRate),
            effectiveRate: taxableGains > 0 ? config.ltcgSpecialRate : 0
          };
        }
        return { tax: 0, effectiveRate: 0 };
      }
      // Hawaii's special 7.25% rate
      if (state === 'HI' && config.ltcgRate) {
        const tax = calculateStateIncomeTax({
          income: otherIncome + shortTermGains,
          filingStatus,
          state,
          year
        });
        const ltcgTax = Math.round(longTermGains * (config.ltcgRate / 100));
        return { 
          tax: tax + ltcgTax,
          effectiveRate: longTermGains > 0 ? config.ltcgRate / 100 : 0
        };
      }
      // Massachusetts dual rate system
      if (state === 'MA') {
        const shortTermTax = shortTermGains * ((config.ltcgShortTermRate || 8.5) / 100);
        const longTermTax = longTermGains * ((config.ltcgLongTermRate || 5.0) / 100);
        const ordinaryTax = calculateStateIncomeTax({ income: otherIncome, filingStatus, state, year });
        const totalTax = ordinaryTax + shortTermTax + longTermTax;
        
        // Add millionaire surtax if applicable
        if (config.ltcgMillionaireSurtax && otherIncome + shortTermGains + longTermGains > 1000000) {
          const surtaxBase = otherIncome + shortTermGains + longTermGains - 1000000;
          const surtax = surtaxBase * (config.ltcgMillionaireSurtax / 100);
          return {
            tax: Math.round(totalTax + surtax),
            effectiveRate: (totalTax + surtax) / (otherIncome + shortTermGains + longTermGains)
          };
        }
        
        return {
          tax: Math.round(totalTax),
          effectiveRate: (shortTermGains + longTermGains) > 0 
            ? (shortTermTax + longTermTax) / (shortTermGains + longTermGains)
            : 0
        };
      }
      break;
      
    case 'ordinary':
    default:
      // Taxed as ordinary income (most states)
      taxableLTCG = longTermGains;
      break;
  }
  
  // Calculate combined tax (ordinary income + short-term + adjusted LTCG)
  const totalIncome = otherIncome + shortTermGains + taxableLTCG;
  const tax = calculateStateIncomeTax({
    income: totalIncome,
    filingStatus,
    state,
    year
  });
  
  // Apply Montana credit if applicable
  if (config.ltcgTreatment === 'credit' && config.ltcgCreditPercent && longTermGains > 0) {
    const credit = longTermGains * (config.ltcgCreditPercent / 100);
    return {
      tax: Math.max(0, tax - Math.round(credit)),
      effectiveRate: longTermGains > 0 ? (tax - credit) / (otherIncome + shortTermGains + longTermGains) : 0
    };
  }
  
  // Calculate what the tax would be WITHOUT the gains for marginal rate
  const taxWithoutGains = calculateStateIncomeTax({
    income: otherIncome,
    filingStatus,
    state,
    year
  });
  
  const taxOnGains = tax - taxWithoutGains;
  const totalGains = shortTermGains + longTermGains;
  
  return {
    tax: Math.round(tax),
    taxOnGains: Math.round(taxOnGains),
    effectiveRate: totalGains > 0 ? taxOnGains / totalGains : 0
  };
}


// Get sorted list of states for dropdown
export function getStateOptions() {
  return Object.entries(STATE_TAX_CONFIG)
    .map(([code, config]) => {
      let taxInfo = 'No income tax';
      if (config.hasIncomeTax) {
        const topRate = config.brackets?.length > 0 
          ? config.brackets[config.brackets.length - 1].rate 
          : 0;
        taxInfo = config.taxesSS 
          ? `${topRate}% (taxes SS)` 
          : `${topRate}%`;
        if (config.ltcgTreatment === 'exempt') {
          taxInfo += ' (no cap gains)';
        } else if (config.ltcgDeductionPercent) {
          taxInfo += ` (${config.ltcgDeductionPercent}% LTCG deduction)`;
        }
      }
      return {
        value: code,
        label: config.name,
        topRate: config.brackets?.length > 0 ? config.brackets[config.brackets.length - 1].rate : 0,
        taxInfo
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}


// Get summary for display
export function getStateTaxSummary(state) {
  const config = STATE_TAX_CONFIG[state];
  if (!config) return null;
  
  if (!config.hasIncomeTax) {
    return { rate: 0, summary: 'No state income tax', details: [] };
  }
  
  const topRate = config.brackets?.length > 0 
    ? config.brackets[config.brackets.length - 1].rate 
    : 0;
  
  const details = [];
  
  // SS treatment
  if (!config.taxesSS) details.push('SS exempt');
  else details.push('Taxes SS');
  
  // Retirement treatment
  if (!config.taxesRetirement) details.push('401k/IRA exempt');
  else if (config.retirementDeduction) details.push(`$${config.retirementDeduction.toLocaleString()} retirement deduction`);
  
  // Capital gains treatment
  switch (config.ltcgTreatment) {
    case 'exempt':
      details.push('No capital gains tax');
      break;
    case 'deduction':
      if (config.ltcgDeductionPercent) details.push(`${config.ltcgDeductionPercent}% LTCG deduction`);
      break;
    case 'exclusion':
      if (config.ltcgExclusionPercent) details.push(`${config.ltcgExclusionPercent}% LTCG exclusion`);
      break;
    case 'special':
      if (state === 'WA') details.push('7% on LTCG over $270k');
      if (state === 'HI') details.push('7.25% flat LTCG rate');
      break;
  }
  
  // Standard deduction
  if (config.standardDeduction?.single > 0) {
    details.push(`$${config.standardDeduction.single.toLocaleString()} std deduction`);
  }
  
  return {
    rate: topRate,
    summary: `${topRate}% top rate`,
    details
  };
}


// Legacy function for backward compatibility
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

  // Use new calculation functions
  const ordinaryIncome = taxDeferredWithdrawal + pensionIncome;
  const gains = taxableGainPortion;
  
  // Calculate tax on retirement income (ordinary)
  let taxableRetirement = ordinaryIncome;
  if (config.retirementDeduction && (!config.retirementDeductionAge || age >= config.retirementDeductionAge)) {
    taxableRetirement = Math.max(0, ordinaryIncome - config.retirementDeduction);
  }
  
  // Social Security
  let taxableSS = 0;
  if (config.taxesSS && socialSecurityIncome > 0) {
    const isJoint = filingStatus === 'married_filing_jointly' || filingStatus === 'married';
    const threshold = isJoint ? config.ssExemptJointAGI : config.ssExemptSingleAGI;
    
    if (config.ssPhaseoutYear && year >= config.ssPhaseoutYear) {
      taxableSS = 0;
    } else if (config.ssExemptAge && age >= config.ssExemptAge && (!threshold || totalAGI <= threshold)) {
      taxableSS = 0;
    } else if (threshold && totalAGI <= threshold) {
      taxableSS = 0;
    } else {
      taxableSS = config.ssPartialExemptPct 
        ? socialSecurityIncome * (1 - config.ssPartialExemptPct / 100)
        : socialSecurityIncome;
    }
  }
  
  // Calculate using new functions
  const { tax } = calculateStateCapitalGainsTax({
    longTermGains: gains,
    shortTermGains: 0,
    otherIncome: taxableRetirement + taxableSS,
    filingStatus,
    state,
    year
  });
  
  return tax;
}