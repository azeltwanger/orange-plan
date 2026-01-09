const BTC_GENESIS_DATE = new Date('2009-01-03');
const POWER_LAW_A = 5.85;
const POWER_LAW_B = -17.2;
const LOWER_BAND_OFFSET = -0.6;
const UPPER_BAND_OFFSET = 0.6;

// Calculate days since Bitcoin genesis
export function daysSinceGenesis(targetDate) {
  const target = new Date(targetDate);
  const diffTime = target.getTime() - BTC_GENESIS_DATE.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

// Calculate Power Law price bands for a given date
export function bitcoinPowerLaw(targetDate) {
  const days = daysSinceGenesis(targetDate);
  const logPrice = (POWER_LAW_A * Math.log10(days)) + POWER_LAW_B;
  
  return {
    date: targetDate,
    days_since_genesis: days,
    fair_value_usd: Math.pow(10, logPrice),
    lower_band_usd: Math.pow(10, logPrice + LOWER_BAND_OFFSET),
    upper_band_usd: Math.pow(10, logPrice + UPPER_BAND_OFFSET)
  };
}

// Get Power Law price for a specific band
export function getPowerLawPrice(targetDate, band = 'middle') {
  const result = bitcoinPowerLaw(targetDate);
  if (band === 'lower') return result.lower_band_usd;
  if (band === 'upper') return result.upper_band_usd;
  return result.fair_value_usd;
}

// Project Power Law prices from current age to target age
export function projectPowerLawByAge(currentAge, targetAge, currentDate = new Date()) {
  const projections = [];
  for (let age = currentAge; age <= targetAge; age++) {
    const yearsFromNow = age - currentAge;
    const projectionDate = new Date(currentDate);
    projectionDate.setFullYear(projectionDate.getFullYear() + yearsFromNow);
    projections.push({
      age,
      ...bitcoinPowerLaw(projectionDate)
    });
  }
  return projections;
}

// Get Power Law implied CAGR for a specific year from now
export function getPowerLawCAGR(yearFromNow = 0, currentDate = new Date()) {
  const startDate = new Date(currentDate);
  startDate.setFullYear(startDate.getFullYear() + yearFromNow);
  
  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + 1);
  
  const startPrice = bitcoinPowerLaw(startDate).fair_value_usd;
  const endPrice = bitcoinPowerLaw(endDate).fair_value_usd;
  
  // Calculate implied annual growth rate for this specific year
  const impliedCAGR = ((endPrice / startPrice) - 1) * 100;
  
  return impliedCAGR;
}

export default { daysSinceGenesis, bitcoinPowerLaw, getPowerLawPrice, projectPowerLawByAge, getPowerLawCAGR };