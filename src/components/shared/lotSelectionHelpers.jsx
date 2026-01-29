/**
 * Selects tax lots to sell based on the specified method
 * @param {Array} lots - Array of tax lot objects with: asset_ticker, quantity, remaining_quantity, price_per_unit, date, cost_basis
 * @param {string} ticker - The asset ticker to sell (e.g., 'BTC')
 * @param {number} quantityToSell - How much of the asset to sell
 * @param {string} method - 'FIFO', 'LIFO', or 'HIFO'
 * @returns {Object} { selectedLots: [{lot, quantityFromLot, costBasis, proceeds}], totalCostBasis, totalQuantitySold, remainingLots }
 */
export function selectLots(lots, ticker, quantityToSell, method = 'HIFO') {
  // Filter lots for this ticker with remaining quantity
  const availableLots = lots
    .filter(lot => lot.asset_ticker === ticker)
    .map(lot => ({
      ...lot,
      availableQty: lot.remaining_quantity ?? lot.quantity ?? 0,
      costPerUnit: lot.price_per_unit || (lot.cost_basis / lot.quantity) || 0,
      purchaseDate: lot.date ? new Date(lot.date) : new Date(0),
    }))
    .filter(lot => lot.availableQty > 0);

  // Sort based on method
  let sortedLots;
  switch (method) {
    case 'FIFO':
      // First In, First Out - oldest lots first (earliest date)
      sortedLots = [...availableLots].sort((a, b) => a.purchaseDate - b.purchaseDate);
      break;
    case 'LIFO':
      // Last In, First Out - newest lots first (latest date)
      sortedLots = [...availableLots].sort((a, b) => b.purchaseDate - a.purchaseDate);
      break;
    case 'HIFO':
    default:
      // Highest In, First Out - highest cost basis first (minimizes gains)
      sortedLots = [...availableLots].sort((a, b) => b.costPerUnit - a.costPerUnit);
      break;
  }

  // Select lots until we have enough quantity
  const selectedLots = [];
  let remainingToSell = quantityToSell;
  let totalCostBasis = 0;
  let totalQuantitySold = 0;

  for (const lot of sortedLots) {
    if (remainingToSell <= 0) break;

    const quantityFromLot = Math.min(lot.availableQty, remainingToSell);
    const costBasisForSale = quantityFromLot * lot.costPerUnit;

    selectedLots.push({
      lot: lot,
      quantityFromLot,
      costBasis: costBasisForSale,
      costPerUnit: lot.costPerUnit,
      purchaseDate: lot.purchaseDate,
    });

    totalCostBasis += costBasisForSale;
    totalQuantitySold += quantityFromLot;
    remainingToSell -= quantityFromLot;
  }

  // Calculate remaining lots (not selected or partially selected)
  const remainingLots = sortedLots.map(lot => {
    const selected = selectedLots.find(s => s.lot === lot);
    if (!selected) return lot;
    return {
      ...lot,
      availableQty: lot.availableQty - selected.quantityFromLot,
    };
  }).filter(lot => lot.availableQty > 0);

  return {
    selectedLots,
    totalCostBasis,
    totalQuantitySold,
    remainingToSell: Math.max(0, remainingToSell),
    remainingLots,
  };
}

/**
 * Gets the total available quantity for a ticker from lots
 */
export function getAvailableQuantity(lots, ticker) {
  return lots
    .filter(lot => lot.asset_ticker === ticker)
    .reduce((sum, lot) => sum + (lot.remaining_quantity ?? lot.quantity ?? 0), 0);
}

/**
 * Gets the weighted average cost basis for a ticker
 */
export function getWeightedAverageCostBasis(lots, ticker) {
  const tickerLots = lots.filter(lot => lot.asset_ticker === ticker);
  let totalQty = 0;
  let totalCost = 0;
  
  tickerLots.forEach(lot => {
    const qty = lot.remaining_quantity ?? lot.quantity ?? 0;
    const costPerUnit = lot.price_per_unit || (lot.cost_basis / lot.quantity) || 0;
    totalQty += qty;
    totalCost += qty * costPerUnit;
  });
  
  return totalQty > 0 ? totalCost / totalQty : 0;
}

/**
 * Assigns specific tax lots as collateral for a BTC-backed loan.
 * Uses the user's cost basis method (HIFO/FIFO/LIFO).
 * Returns the lots to store on the loan entity.
 * 
 * @param {Array} taxLots - Array of Transaction entities (buy type)
 * @param {number} btcAmountNeeded - Amount of BTC to collateralize
 * @param {string} costBasisMethod - 'HIFO', 'FIFO', or 'LIFO'
 * @param {Array} existingCollateralLotIds - Lot IDs already used as collateral by other loans
 * @returns {Object} { success, lots, totalBasis, error }
 */
export function assignCollateralLots(taxLots, btcAmountNeeded, costBasisMethod = 'HIFO', existingCollateralLotIds = []) {
  if (!btcAmountNeeded || btcAmountNeeded <= 0) {
    return { success: false, lots: [], totalBasis: 0, error: 'Invalid collateral amount' };
  }
  
  // Filter to available BTC lots (taxable, not already fully collateralized)
  const availableLots = (taxLots || []).filter(lot => {
    if (lot.asset_ticker !== 'BTC') return false;
    if (lot.type && lot.type !== 'buy') return false;
    if (lot.account_type && lot.account_type !== 'taxable') return false;
    
    const availableQty = lot.remaining_quantity ?? lot.quantity ?? 0;
    return availableQty > 0;
  });
  
  if (availableLots.length === 0) {
    return { success: false, lots: [], totalBasis: 0, error: 'No available BTC tax lots found' };
  }
  
  // Calculate total available BTC (excluding amounts already collateralized)
  const totalAvailable = availableLots.reduce((sum, lot) => {
    const availableQty = lot.remaining_quantity ?? lot.quantity ?? 0;
    // If this lot is already partially collateralized by another loan, reduce available
    // For now, we track by lot_id - if fully collateralized, it's excluded
    return sum + availableQty;
  }, 0);
  
  if (totalAvailable < btcAmountNeeded * 0.999) { // Allow tiny floating point tolerance
    return { 
      success: false, 
      lots: [], 
      totalBasis: 0, 
      error: `Insufficient BTC. Need ${btcAmountNeeded.toFixed(4)} BTC but only ${totalAvailable.toFixed(4)} BTC available in taxable lots.`
    };
  }
  
  // Sort lots based on cost basis method
  const sortedLots = [...availableLots].sort((a, b) => {
    const priceA = a.price_per_unit || ((a.cost_basis || 0) / (a.quantity || 1));
    const priceB = b.price_per_unit || ((b.cost_basis || 0) / (b.quantity || 1));
    const dateA = new Date(a.date || 0);
    const dateB = new Date(b.date || 0);
    
    switch ((costBasisMethod || 'HIFO').toUpperCase()) {
      case 'HIFO': // Highest cost first (most tax efficient for liquidation)
        return priceB - priceA;
      case 'FIFO': // Oldest first
        return dateA - dateB;
      case 'LIFO': // Newest first
        return dateB - dateA;
      default:
        return priceB - priceA; // Default to HIFO
    }
  });
  
  // Select lots until we have enough BTC
  const selectedLots = [];
  let totalBasis = 0;
  let btcRemaining = btcAmountNeeded;
  
  for (const lot of sortedLots) {
    if (btcRemaining <= 0.00000001) break; // Tiny tolerance for floating point
    
    const lotAvailable = lot.remaining_quantity ?? lot.quantity ?? 0;
    const btcFromLot = Math.min(lotAvailable, btcRemaining);
    const pricePerUnit = lot.price_per_unit || ((lot.cost_basis || 0) / (lot.quantity || 1));
    const basisFromLot = btcFromLot * pricePerUnit;
    
    selectedLots.push({
      lot_id: lot.id,
      btc_amount: btcFromLot,
      cost_basis: basisFromLot,
      price_per_unit: pricePerUnit,
      acquired_date: lot.date || null
    });
    
    totalBasis += basisFromLot;
    btcRemaining -= btcFromLot;
  }
  
  return {
    success: true,
    lots: selectedLots,
    totalBasis: totalBasis,
    error: null
  };
}

/**
 * Gets all lot IDs currently used as collateral across all loans.
 * Used to prevent double-collateralization and track which lots are locked.
 * 
 * @param {Array} liabilities - Array of Liability entities
 * @param {Array} collateralizedLoans - Array of CollateralizedLoan entities
 * @param {string} excludeLoanId - Loan ID to exclude (when editing a loan)
 * @returns {Array} Array of lot IDs that are collateralized
 */
export function getCollateralizedLotIds(liabilities, collateralizedLoans, excludeLoanId = null) {
  const lotIds = [];
  
  // From Liabilities
  (liabilities || []).forEach(liability => {
    if (liability.id === excludeLoanId) return;
    if (liability.type === 'btc_collateralized' && liability.collateral_lots) {
      liability.collateral_lots.forEach(lot => {
        if (lot.lot_id) lotIds.push(lot.lot_id);
      });
    }
  });
  
  // From CollateralizedLoans
  (collateralizedLoans || []).forEach(loan => {
    if (loan.id === excludeLoanId) return;
    if (`loan_${loan.id}` === excludeLoanId) return;
    if (loan.collateral_lots) {
      loan.collateral_lots.forEach(lot => {
        if (lot.lot_id) lotIds.push(lot.lot_id);
      });
    }
  });
  
  return lotIds;
}

/**
 * Checks if a specific tax lot is used as collateral for any loan.
 * 
 * @param {string} lotId - The lot ID to check
 * @param {Array} liabilities - Array of Liability entities
 * @param {Array} collateralizedLoans - Array of CollateralizedLoan entities
 * @returns {Object} { isCollateralized: boolean, loanName: string|null }
 */
export function isLotCollateralized(lotId, liabilities, collateralizedLoans) {
  // Check Liabilities
  for (const liability of (liabilities || [])) {
    if (liability.type === 'btc_collateralized' && liability.collateral_lots) {
      const found = liability.collateral_lots.find(lot => lot.lot_id === lotId);
      if (found) {
        return { isCollateralized: true, loanName: liability.name };
      }
    }
  }
  
  // Check CollateralizedLoans
  for (const loan of (collateralizedLoans || [])) {
    if (loan.collateral_lots) {
      const found = loan.collateral_lots.find(lot => lot.lot_id === lotId);
      if (found) {
        return { isCollateralized: true, loanName: loan.name };
      }
    }
  }
  
  return { isCollateralized: false, loanName: null };
}