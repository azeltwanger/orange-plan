export const calculateCurrentMonthlyDebtPayments = (liabilities, currentYear, currentMonth) => {
  let totalCurrentMonthlyDebtPayment = 0;

  for (const liability of liabilities) {
    if (liability.monthly_payment && liability.monthly_payment > 0) {
      // Simulate month-by-month for the current year up to the current month
      let remainingBalance = liability.current_balance || 0;
      const hasInterest = liability.interest_rate && liability.interest_rate > 0;

      for (let month = 0; month <= currentMonth; month++) {
        if (remainingBalance <= 0) {
          break; // Liability already paid off
        }

        const monthlyInterest = hasInterest
          ? remainingBalance * (liability.interest_rate / 100 / 12)
          : 0;

        const principalPayment = Math.max(0, liability.monthly_payment - monthlyInterest);
        const paymentThisMonth = Math.min(remainingBalance + monthlyInterest, liability.monthly_payment);

        if (month === currentMonth) {
          // This is the payment for the current month
          totalCurrentMonthlyDebtPayment += paymentThisMonth;
        }
        remainingBalance = Math.max(0, remainingBalance - principalPayment);
      }
    }
  }
  return totalCurrentMonthlyDebtPayment;
};

export const calculateCurrentYearDebtPayments = (liabilities, currentYear, currentMonth) => {
  let totalYearDebtPayments = 0;

  for (const liability of liabilities) {
    if (liability.monthly_payment && liability.monthly_payment > 0) {
      let remainingBalance = liability.current_balance || 0;
      const hasInterest = liability.interest_rate && liability.interest_rate > 0;

      // Simulate from the start of the year up through the end of the year
      for (let month = 0; month < 12; month++) {
        if (remainingBalance <= 0) {
          break; // Liability already paid off
        }

        const monthlyInterest = hasInterest
          ? remainingBalance * (liability.interest_rate / 100 / 12)
          : 0;

        const principalPayment = Math.max(0, liability.monthly_payment - monthlyInterest);
        const paymentThisMonth = Math.min(remainingBalance + monthlyInterest, liability.monthly_payment);

        totalYearDebtPayments += paymentThisMonth;
        remainingBalance = Math.max(0, remainingBalance - principalPayment);
      }
    }
  }
  return totalYearDebtPayments;
};