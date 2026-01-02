SEARCH_MARKER_START
        // Calculate taxable portion of Social Security using federal provisional income rules
        // Provisional income uses other income (excluding SS) to determine what % of SS is taxable
        // Use estimated retirement withdrawal for provisional income calculation
        const estimatedWithdrawalForSS = retirementSpendingOnly || desiredWithdrawal || 0;
        const taxableSocialSecurity = calculateTaxableSocialSecurity(
          socialSecurityIncome, 
          otherRetirementIncome + estimatedWithdrawalForSS, 
          filingStatus
        );
        
        // For spending: use FULL Social Security income (user receives the entire benefit)
        const totalRetirementIncome = otherRetirementIncome + socialSecurityIncome;
        
        // For tax calculations: use only TAXABLE portion of Social Security
        const totalOtherIncomeForTax = otherRetirementIncome + taxableSocialSecurity;

        // Store UNCAPPED desired retirement spending (not capped yearWithdrawal)
        // This ensures remainingShortfall > 0 when liquid can't cover needs, triggering RE liquidation
        retirementSpendingOnly = desiredWithdrawal;

        // Reduce required withdrawal by FULL Social Security income (user receives entire benefit for spending)
        const netSpendingNeed = Math.max(0, retirementSpendingOnly - totalRetirementIncome);
        
        // Combine net spending (after SS) and goal withdrawal for tax estimation
        totalWithdrawalForTaxCalculation = netSpendingNeed + yearGoalWithdrawal;

        // Cap withdrawal to available balance
        const totalAvailableBalance = getTotalLiquid();
        const cappedWithdrawal = Math.min(totalWithdrawalForTaxCalculation, totalAvailableBalance);

        // Use tax calculation utility for accurate withdrawal taxes
        const taxEstimate = estimateRetirementWithdrawalTaxes({
          withdrawalNeeded: cappedWithdrawal,
          taxableBalance: getAccountTotal('taxable'),
          taxDeferredBalance: getAccountTotal('taxDeferred'),
          taxFreeBalance: getAccountTotal('taxFree'),
          rothContributions: totalRothContributions,
          taxableGainPercent: estimatedCurrentGainRatio,
          isLongTermGain: true,
          filingStatus,
          age: currentAgeInYear,
          otherIncome: totalOtherIncomeForTax,
          year: year,
          inflationRate: inflationRate / 100,
        });

        // Store initial withdrawal amounts (for spending only)
        const baseFromTaxable = taxEstimate.fromTaxable || 0;
        const baseFromTaxDeferred = taxEstimate.fromTaxDeferred || 0;
        const baseFromTaxFree = taxEstimate.fromTaxFree || 0;
        
        // Calculate state tax on retirement withdrawal
        const stateTax = calculateStateTaxOnRetirement({
          state: stateOfResidence,
          age: currentAgeInYear,
          filingStatus: filingStatus,
          totalAGI: totalOtherIncomeForTax + cappedWithdrawal,
          socialSecurityIncome: socialSecurityIncome,
          taxDeferredWithdrawal: withdrawFromTaxDeferred,
          taxableWithdrawal: withdrawFromTaxable,
          taxableGainPortion: withdrawFromTaxable * estimatedCurrentGainRatio,
          pensionIncome: 0,
          year: year,
        });
        
        if (currentAge + i === 70) {
          console.log('[SS TAX DEBUG Age 70]', {
            socialSecurityIncome,
            otherRetirementIncome,
            taxableSS: calculateTaxableSocialSecurity(socialSecurityIncome, otherRetirementIncome + cappedWithdrawal, filingStatus),
            totalOtherIncomeForTax,
            cappedWithdrawal,
            taxEstimate: taxEstimate?.totalTax,
            stateTax
          });
        }

        taxesPaid = (taxEstimate.totalTax || 0) + stateTax;
        penaltyPaid = taxEstimate.totalPenalty || 0;
SEARCH_MARKER_END

REPLACEMENT:
        // Calculate taxable portion of Social Security using federal provisional income rules
        // Provisional income uses other income (excluding SS) to determine what % of SS is taxable
        // Use estimated retirement withdrawal for provisional income calculation
        const estimatedWithdrawalForSS = retirementSpendingOnly || desiredWithdrawal || 0;
        const taxableSocialSecurity = calculateTaxableSocialSecurity(
          socialSecurityIncome, 
          otherRetirementIncome + estimatedWithdrawalForSS, 
          filingStatus
        );
        
        // For spending: use FULL Social Security income (user receives the entire benefit)
        const totalRetirementIncome = otherRetirementIncome + socialSecurityIncome;
        
        // For tax calculations: use only TAXABLE portion of Social Security
        const totalOtherIncomeForTax = otherRetirementIncome + taxableSocialSecurity;

        // Get year-specific standard deduction (age-adjusted)
        const currentYearStandardDeduction = getStandardDeductionFromData(year, filingStatus, currentAgeInYear, false, inflationRate / 100);

        // Calculate federal tax on other income (including taxable SS and pension) BEFORE withdrawals
        const federalTaxOnOtherIncome = calculateProgressiveIncomeTax(
          Math.max(0, totalOtherIncomeForTax - currentYearStandardDeduction),
          filingStatus,
          year
        );

        // Store UNCAPPED desired retirement spending (not capped yearWithdrawal)
        retirementSpendingOnly = desiredWithdrawal;

        // Reduce required withdrawal by FULL Social Security income (user receives entire benefit for spending)
        const netSpendingNeed = Math.max(0, retirementSpendingOnly - totalRetirementIncome);
        
        // Combine net spending (after SS) and goal withdrawal for tax estimation
        totalWithdrawalForTaxCalculation = netSpendingNeed + yearGoalWithdrawal;

        // Cap withdrawal to available balance
        const totalAvailableBalance = getTotalLiquid();
        const cappedWithdrawal = Math.min(totalWithdrawalForTaxCalculation, totalAvailableBalance);

        // Calculate tax on withdrawals, stacking on top of other income
        const taxEstimate = estimateRetirementWithdrawalTaxes({
          withdrawalNeeded: cappedWithdrawal,
          taxableBalance: getAccountTotal('taxable'),
          taxDeferredBalance: getAccountTotal('taxDeferred'),
          taxFreeBalance: getAccountTotal('taxFree'),
          rothContributions: totalRothContributions,
          taxableGainPercent: estimatedCurrentGainRatio,
          isLongTermGain: true,
          filingStatus,
          age: currentAgeInYear,
          otherIncome: totalOtherIncomeForTax,
          year: year,
          inflationRate: inflationRate / 100,
        });

        // Store initial withdrawal amounts (for spending only)
        const baseFromTaxable = taxEstimate.fromTaxable || 0;
        const baseFromTaxDeferred = taxEstimate.fromTaxDeferred || 0;
        const baseFromTaxFree = taxEstimate.fromTaxFree || 0;
        
        // Calculate state tax on retirement income AND withdrawal
        const stateTax = calculateStateTaxOnRetirement({
          state: stateOfResidence,
          age: currentAgeInYear,
          filingStatus: filingStatus,
          totalAGI: totalOtherIncomeForTax + cappedWithdrawal,
          socialSecurityIncome: socialSecurityIncome,
          taxDeferredWithdrawal: baseFromTaxDeferred,
          taxableWithdrawal: baseFromTaxable,
          taxableGainPortion: baseFromTaxable * estimatedCurrentGainRatio,
          pensionIncome: otherRetirementIncome,
          year: year,
        });
        
        if (currentAge + i === 70) {
          console.log('[SS TAX DEBUG Age 70]', {
            socialSecurityIncome,
            otherRetirementIncome,
            taxableSocialSecurity,
            totalOtherIncomeForTax,
            currentYearStandardDeduction,
            federalTaxOnOtherIncome,
            cappedWithdrawal,
            federalTaxOnWithdrawal: taxEstimate?.totalTax,
            stateTax,
            combinedFederalTax: federalTaxOnOtherIncome + (taxEstimate.totalTax || 0)
          });
        }

        taxesPaid = federalTaxOnOtherIncome + (taxEstimate.totalTax || 0) + stateTax;
        penaltyPaid = taxEstimate.totalPenalty || 0;