export const calculateCurrentMonthlyDebtPayments = (liabilities, currentYear, currentMonth) => {
  let totalCurrentMonthlyDebtPayment = 0;

  for (const liability of liabilities) {
    if (liability.monthly_payment && liability.monthly_payment > 0) {
      // Calculate payment for current month based on current balance
      const remainingBalance = liability.current_balance || 0;
      
      if (remainingBalance <= 0) {
        continue; // Liability already paid off
      }

      const hasInterest = liability.interest_rate && liability.interest_rate > 0;
      const monthlyInterest = hasInterest
        ? remainingBalance * (liability.interest_rate / 100 / 12)
        : 0;

      const paymentThisMonth = Math.min(remainingBalance + monthlyInterest, liability.monthly_payment);
      totalCurrentMonthlyDebtPayment += paymentThisMonth;
    }
  }
  return totalCurrentMonthlyDebtPayment;
};

export const calculateCurrentYearDebtPayments = (liabilities, currentYear, currentMonth) => {
  let totalYearDebtPayments = 0;

  for (const liability of liabilities) {
    if (liability.monthly_payment && liability.monthly_payment > 0) {
      let tempBalance = liability.current_balance || 0;
      const hasInterest = liability.interest_rate && liability.interest_rate > 0;

      // Simulate payments from current month through end of year
      for (let month = currentMonth; month < 12; month++) {
        if (tempBalance <= 0) break;

        const monthlyInterest = hasInterest ? tempBalance * (liability.interest_rate / 100 / 12) : 0;
        const principalPayment = Math.max(0, liability.monthly_payment - monthlyInterest);
        const paymentThisMonth = Math.min(tempBalance + monthlyInterest, liability.monthly_payment);

        totalYearDebtPayments += paymentThisMonth;
        tempBalance = Math.max(0, tempBalance - principalPayment);
      }
    }
  }
  return totalYearDebtPayments;
};