// components/shared/monteCarloSimulation.js
// Professional Monte Carlo Simulation Module with Seeded Random Numbers
// Ensures reproducible results for scenario comparisons

import { runUnifiedProjection, getCustomReturnForYear } from './runProjection';
import { getPowerLawCAGR } from './bitcoinPowerLaw';

// --- VERSION TRACKING ---
export const MONTE_CARLO_VERSION = "2.0"; // Seeded RNG implementation

// --- 1. SEEDED RANDOM NUMBER GENERATOR ---
// Creates a deterministic pseudo-random number generator from a seed
// Returns a function that produces the same sequence of "random" numbers for the same seed
export function createSeededRNG(seed) {
  let a = seed;
  return function() {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) | 0;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// --- 2. HASH FUNCTION FOR SEED GENERATION ---
// Converts user inputs into a consistent seed for reproducible Monte Carlo runs
// Same inputs → Same seed → Same simulation results
export function generateMonteCarloSeed(
  settings, 
  scenario, 
  holdings, 
  liabilities, 
  accounts, 
  btcPrice
) {
  let hashString = '';

  // Core settings
  hashString += `CA${settings.current_age || 0}`;
  hashString += `RA${settings.retirement_age || 0}`;
  hashString += `LE${settings.life_expectancy || 0}`;
  hashString += `CARS${settings.annual_retirement_spending || 0}`;
  hashString += `GNI${settings.gross_annual_income || 0}`;
  hashString += `FS${settings.filing_status || ''}`;
  hashString += `SoR${settings.state_of_residence || ''}`;
  hashString += `BCAGR${settings.btc_cagr_assumption || 0}`;
  hashString += `SCAGR${settings.stocks_cagr || 0}`;
  hashString += `ICR${settings.income_growth_rate || 0}`;
  hashString += `IR${settings.inflation_rate || 0}`;
  hashString += `BRM${settings.btc_return_model || ''}`;
  hashString += `ASM${settings.asset_withdrawal_strategy || ''}`;
  hashString += `CBM${settings.cost_basis_method || ''}`;

  // Include custom return periods in hash (affects BTC growth when btc_return_model is 'custom_periods')
  if (settings.custom_return_periods) {
    hashString += `CRP${JSON.stringify(settings.custom_return_periods)}`;
  }

  // Include ticker returns in hash (affects per-holding growth rates)
  if (settings.ticker_returns) {
    hashString += `TR${JSON.stringify(settings.ticker_returns)}`;
  }

  // Scenario-specific overrides
  if (scenario) {
    hashString += `SN${scenario.name || ''}`;
    hashString += `RAO${scenario.retirement_age_override || 0}`;
    hashString += `LEO${scenario.life_expectancy_override || 0}`;
    hashString += `CARSO${scenario.annual_retirement_spending_override || 0}`;
    hashString += `SoRO${scenario.state_override || ''}`;
    hashString += `BCAGRO${scenario.btc_cagr_override || 0}`;
    hashString += `SCAGRO${scenario.stocks_cagr_override || 0}`;
    hashString += `ICRO${scenario.income_growth_override || 0}`;
    hashString += `IRO${scenario.inflation_override || 0}`;
    hashString += `BRMO${scenario.btc_return_model_override || ''}`;
    hashString += `DIVIO${scenario.dividend_income_override || 0}`;
    hashString += `HYPL${scenario.hypothetical_btc_loan?.enabled ? 'T' : 'F'}`;
    // DETERMINISTIC: Sort arrays before stringifying to ensure consistent hash
    const sortedOTE = [...(scenario.one_time_events || [])].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    const sortedAR = [...(scenario.asset_reallocations || [])].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    hashString += `OTE${JSON.stringify(sortedOTE)}`;
    hashString += `AR${JSON.stringify(sortedAR)}`;
  }

  // Financial snapshot data
  hashString += `HOLD${holdings.length}`;
  holdings.forEach(h => {
    hashString += `${h.asset_name}${h.quantity}${h.current_price}${h.asset_type}`;
  });
  hashString += `LIAB${liabilities.length}`;
  liabilities.forEach(l => {
    hashString += `${l.name}${l.current_balance}${l.interest_rate}${l.type}`;
  });
  hashString += `ACCT${accounts.length}`;
  accounts.forEach(a => {
    hashString += `${a.name}${a.current_balance}${a.account_type}`;
  });
  hashString += `BTCP${btcPrice || 0}`;

  // Simple hash function (FNV-1a variant)
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < hashString.length; i++) {
    hash ^= hashString.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}

// --- 3. CONSTANTS AND HELPERS ---

// BTC volatility model - starts high and decays over time
export const getBtcVolatilityForMonteCarlo = (yearsFromNow) => {
  const initialVolatility = 55;
  const minimumVolatility = 20;
  const decayRate = 0.05;
  return minimumVolatility + (initialVolatility - minimumVolatility) * Math.exp(-decayRate * yearsFromNow);
};

// Bitcoin distribution parameters based on academic research
// Swan Research: Skewness +2.8, Kurtosis ~105
export const BTC_SKEW_PARAM = 1.15;  // Positive skew (>1 = more upside outcomes)
export const BTC_DEGREES_OF_FREEDOM = 5;  // Fat tails (lower = fatter, 5 is typical for crypto)

// Asset correlation matrix based on historical data (2018-2024)
// Order: [BTC, Stocks, Bonds, RealEstate, Cash, Other]
export const ASSET_CORRELATIONS = [
  [1.00,  0.40, -0.10,  0.20,  0.00,  0.30],  // BTC
  [0.40,  1.00, -0.20,  0.50,  0.00,  0.60],  // Stocks
  [-0.10, -0.20, 1.00, -0.10,  0.30, -0.10],  // Bonds
  [0.20,  0.50, -0.10,  1.00,  0.00,  0.40],  // Real Estate
  [0.00,  0.00,  0.30,  0.00,  1.00,  0.00],  // Cash
  [0.30,  0.60, -0.10,  0.40,  0.00,  1.00],  // Other
];

// Cholesky decomposition for generating correlated random numbers
// Returns lower triangular matrix L where L * L^T = correlation matrix
export const choleskyDecomposition = (matrix) => {
  const n = matrix.length;
  const L = Array(n).fill(null).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(0, matrix[i][i] - sum));
      } else {
        L[i][j] = (matrix[i][j] - sum) / (L[j][j] || 1);
      }
    }
  }
  return L;
};

// Pre-compute Cholesky matrix once (it's constant)
const CHOLESKY_L = choleskyDecomposition(ASSET_CORRELATIONS);

// Generate correlated random numbers from independent ones
// independentZ = [z1, z2, z3, z4, z5, z6] (independent standard normals)
// Returns correlated values in same order: [btc, stocks, bonds, realEstate, cash, other]
export const generateCorrelatedReturns = (independentZ) => {
  const correlated = [];
  for (let i = 0; i < independentZ.length; i++) {
    let sum = 0;
    for (let j = 0; j <= i; j++) {
      sum += CHOLESKY_L[i][j] * independentZ[j];
    }
    correlated.push(sum);
  }
  return correlated;
};

// --- 4. DISTRIBUTION FUNCTIONS (SEEDED) ---
// All distribution functions now accept a seeded random function

// Generate random normal using Box-Muller transform
export const randomNormal = (random) => {
  const u1 = Math.max(0.0001, random());
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};

// Chi-squared random variate generator (sum of squared normals)
export const randomChiSquared = (random, df) => {
  let sum = 0;
  for (let i = 0; i < df; i++) {
    const z = randomNormal(random);
    sum += z * z;
  }
  return sum;
};

// Standard Student-t random variate
export const randomStudentT = (random, df) => {
  const z = randomNormal(random);
  const chi2 = randomChiSquared(random, df);
  return z / Math.sqrt(chi2 / df);
};

// Skewed Student-t using Fernández-Steel transformation
// skew > 1 means positive skew (more upside), skew < 1 means negative skew
export const randomSkewedStudentT = (random, df, skew) => {
  const t = randomStudentT(random, df);
  const u = random();
  
  // Fernández-Steel skewing: flip sign based on skew parameter
  const threshold = 1 / (1 + skew * skew);
  if (u < threshold) {
    return -Math.abs(t) / skew;
  } else {
    return Math.abs(t) * skew;
  }
};

// --- 5. GENERATE RANDOM PATHS (SEEDED) ---
// Generates consistent random market scenarios using seeded RNG
export function generateRandomPaths(numSimulations, projectionYears, baseParams, seededRandom) {
  const paths = [];
  
  for (let sim = 0; sim < numSimulations; sim++) {
    const yearlyReturnOverrides = {
      btc: [],
      stocks: [],
      bonds: [],
      realEstate: [],
      cash: [],
      other: [],
      zScores: [] // Store Z-scores to regenerate scenario-specific returns
    };

    for (let year = 0; year <= projectionYears; year++) {
      // Generate independent random numbers using seeded RNG
      // Use Skewed Student-t for BTC (fat tails + positive skew), normal for others
      const independentZ = [
        randomSkewedStudentT(seededRandom, BTC_DEGREES_OF_FREEDOM, BTC_SKEW_PARAM), // BTC
        randomNormal(seededRandom), // Stocks
        randomNormal(seededRandom), // Bonds
        randomNormal(seededRandom), // Real Estate
        randomNormal(seededRandom), // Cash
        randomNormal(seededRandom), // Other
      ];
      
      // Apply correlation matrix to generate correlated shocks
      const correlatedZ = generateCorrelatedReturns(independentZ);
      const [zBtc, zStocks, zBonds, zRealEstate, zCash, zOther] = correlatedZ;

      // Store Z-scores for regeneration with different expected returns
      yearlyReturnOverrides.zScores.push({ 
        zBtc, zStocks, zBonds, zRealEstate, zCash, zOther,
        independent: independentZ 
      });

      // Calculate asset returns using baseline parameters and generated Z-scores
      const expectedBtcReturn = baseParams.getBtcGrowthRate(year, baseParams.effectiveInflation);
      const btcVolatility = getBtcVolatilityForMonteCarlo(year);
      // Expanded caps: -75% (worst year was -73%), +250% (allow fat tail upside)
      const btcReturn = Math.max(-75, Math.min(250, expectedBtcReturn + btcVolatility * zBtc));

      const stocksVolatilityVal = 18;
      const stocksReturn = Math.max(-40, Math.min(50, baseParams.effectiveStocksCagr + stocksVolatilityVal * zStocks));

      const realEstateReturn = baseParams.realEstateCagr + 5 * zRealEstate;
      const bondsReturn = baseParams.bondsCagr + 2 * zBonds;
      const cashReturn = baseParams.cashCagr + 1 * zCash;
      const otherReturn = baseParams.otherCagr + 3 * zOther;

      yearlyReturnOverrides.btc.push(btcReturn);
      yearlyReturnOverrides.stocks.push(stocksReturn);
      yearlyReturnOverrides.bonds.push(bondsReturn);
      yearlyReturnOverrides.realEstate.push(realEstateReturn);
      yearlyReturnOverrides.cash.push(cashReturn);
      yearlyReturnOverrides.other.push(otherReturn);
    }

    paths.push(yearlyReturnOverrides);
  }

  return paths;
}

// --- 6. REGENERATE RETURNS FOR SCENARIO ---
// Uses the same Z-scores but applies scenario-specific expected returns
// This ensures fair comparison: same market conditions, different strategy
export function regenerateReturnsForParams(path, params) {
  const newOverrides = {
    btc: [], stocks: [], bonds: [], realEstate: [], cash: [], other: []
  };

  for (let year = 0; year < path.zScores.length; year++) {
    const { zBtc, zStocks, zBonds, zRealEstate, zCash, zOther } = path.zScores[year];

    // BTC with scenario's expected return
    const expectedBtcReturn = params.getBtcGrowthRate(year, params.effectiveInflation);
    const btcVolatility = getBtcVolatilityForMonteCarlo(year);
    const btcReturn = Math.max(-75, Math.min(250, expectedBtcReturn + btcVolatility * zBtc));

    // Stocks with scenario's expected return
    const stocksVolatilityVal = 18;
    const stocksReturn = Math.max(-40, Math.min(50, params.effectiveStocksCagr + stocksVolatilityVal * zStocks));

    const realEstateReturn = params.realEstateCagr + 5 * zRealEstate;
    const bondsReturn = params.bondsCagr + 2 * zBonds;
    const cashReturn = params.cashCagr + 1 * zCash;
    const otherReturn = params.otherCagr + 3 * zOther;

    newOverrides.btc.push(btcReturn);
    newOverrides.stocks.push(stocksReturn);
    newOverrides.bonds.push(bondsReturn);
    newOverrides.realEstate.push(realEstateReturn);
    newOverrides.cash.push(cashReturn);
    newOverrides.other.push(otherReturn);
  }

  return newOverrides;
}

// --- 7. MONTE CARLO SIMULATION RUNNER ---
// Runs Monte Carlo simulations for baseline and optional scenario comparison
// Uses seeded RNG for reproducible results
export function runMonteCarloSimulation(
  numSimulations, 
  baseParams, 
  scenarioParams = null,
  seed
) {
  const seededRandom = createSeededRNG(seed);
  const projectionYears = Math.max(
    baseParams.lifeExpectancy - baseParams.currentAge + 1,
    scenarioParams ? scenarioParams.lifeExpectancy - scenarioParams.currentAge + 1 : 0
  );

  // Generate paths once using baseline params and the seeded RNG
  const paths = generateRandomPaths(numSimulations, projectionYears, baseParams, seededRandom);

  let baselineSuccess = 0;
  let scenarioSuccess = 0;
  let baselineLiquidations = 0;
  let scenarioLiquidations = 0;

  for (let i = 0; i < paths.length; i++) {
    // Run baseline with original path
    const baseResult = runUnifiedProjection({
      ...baseParams,
      yearlyReturnOverrides: paths[i],
      taxLots: [], // Use aggregate basis for Monte Carlo speed
      DEBUG: false,
    });

    if (baseResult.survives) baselineSuccess++;
    
    // Check for liquidation events (excluding top_up and release)
    const baseHasLiquidation = baseResult.yearByYear?.some(y => 
      y.liquidations?.some(l => l.type !== 'top_up' && l.type !== 'release')
    );
    
    // Only count as catastrophic liquidation if BOTH liquidation happened AND plan failed
    if (baseHasLiquidation && !baseResult.survives) baselineLiquidations++;

    // Run scenario with regenerated returns (same Z-scores, different expected returns if changed)
    if (scenarioParams) {
      const scenarioOverrides = regenerateReturnsForParams(paths[i], scenarioParams);
      const scenResult = runUnifiedProjection({
        ...scenarioParams,
        yearlyReturnOverrides: scenarioOverrides,
        taxLots: [], // Use aggregate basis for Monte Carlo speed
        DEBUG: false,
      });

      if (scenResult.survives) scenarioSuccess++;
      
      const scenHasLiquidation = scenResult.yearByYear?.some(y => 
        y.liquidations?.some(l => l.type !== 'top_up' && l.type !== 'release')
      );
      
      if (scenHasLiquidation && !scenResult.survives) scenarioLiquidations++;
    }
  }

  return {
    baselineSuccessRate: (baselineSuccess / numSimulations) * 100,
    scenarioSuccessRate: scenarioParams ? (scenarioSuccess / numSimulations) * 100 : null,
    baselineLiquidationRisk: (baselineLiquidations / numSimulations) * 100,
    scenarioLiquidationRisk: scenarioParams ? (scenarioLiquidations / numSimulations) * 100 : null,
    numSimulations,
  };
}

// --- 8. CALCULATE SAFE SPENDING (SEEDED) ---
// Binary search for maximum spending with 90% success rate
// Uses seeded RNG for reproducible results
export function calculateSafeSpending(baseParams, numSimulations, seed) {
  const seededRandom = createSeededRNG(seed);
  const projectionYears = baseParams.lifeExpectancy - baseParams.currentAge + 1;
  
  // Generate paths once using the seeded RNG
  const paths = generateRandomPaths(numSimulations, projectionYears, baseParams, seededRandom);

  let low = 10000;
  let high = 500000;
  let maxSpending = low;

  // Binary search for max sustainable spending
  for (let iteration = 0; iteration < 15; iteration++) {
    const testSpending = Math.round((low + high) / 2);
    const testParams = { ...baseParams, retirementAnnualSpending: testSpending };
    
    let successCount = 0;
    for (let i = 0; i < paths.length; i++) {
      const result = runUnifiedProjection({
        ...testParams,
        yearlyReturnOverrides: paths[i],
        taxLots: [],
        DEBUG: false,
      });
      if (result.survives) successCount++;
    }
    
    const successRate = (successCount / numSimulations) * 100;

    if (successRate >= 90) {
      maxSpending = testSpending;
      low = testSpending;
    } else {
      high = testSpending;
    }

    if (high - low <= 5000) break;
  }

  return maxSpending;
}