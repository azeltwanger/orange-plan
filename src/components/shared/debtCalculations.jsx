export const calculateCurrentMonthlyDebtPayments = (liabilities, currentYear, currentMonth) => {
  let totalCurrentMonthlyDebtPayment = 0;

  for (const liability of liabilities) {
    if (liability.monthly_payment && liability.monthly_payment > 0) {
      // Simulate month-by-month from start of year to current month
      let remainingBalance = liability.current_balance || 0;
      const hasInterest = liability.interest_rate && liability.interest_rate > 0;

      for (let month = 0; month <= currentMonth; month++) {
        if (remainingBalance <= 0) break;

        const monthlyInterest = hasInterest
          ? remainingBalance * (liability.interest_rate / 100 / 12)
          : 0;

        const principalPayment = Math.max(0, liability.monthly_payment - monthlyInterest);
        const paymentThisMonth = Math.min(remainingBalance + monthlyInterest, liability.monthly_payment);

        if (month === currentMonth) {
          totalCurrentMonthlyDebtPayment += paymentThisMonth;
        }
        remainingBalance = Math.max(0, remainingBalance - principalPayment);
      }
    }
  }
  return totalCurrentMonthlyDebtPayment;
};

export const calculateAnnualDebtPayments = (liabilities, year, currentYear, currentMonth) => {
  let totalAnnualDebtPayment = 0;
  const tempDebt = {};
  
  // Initialize debt tracking
  liabilities.forEach(liability => {
    tempDebt[liability.id] = { 
      ...liability, 
      current_balance: liability.current_balance || 0,
      paid_off: false,
    };
  });

  // Simulate previous years if needed
  for (let y = currentYear; y < year; y++) {
    Object.values(tempDebt).forEach(liability => {
      if (!liability.paid_off && liability.monthly_payment && liability.monthly_payment > 0) {
        const hasInterest = liability.interest_rate && liability.interest_rate > 0;
        let remainingBalance = liability.current_balance;
        const startMonth = (y === currentYear) ? currentMonth : 0;

        for (let month = startMonth; month < 12; month++) {
          if (remainingBalance <= 0) {
            liability.paid_off = true;
            break;
          }
          const monthlyInterest = hasInterest ? remainingBalance * (liability.interest_rate / 100 / 12) : 0;
          const principalPayment = Math.max(0, liability.monthly_payment - monthlyInterest);
          remainingBalance = Math.max(0, remainingBalance - principalPayment);
        }
        liability.current_balance = remainingBalance;
      }
    });
  }

  // Calculate for target year
  Object.values(tempDebt).forEach(liability => {
    if (!liability.paid_off && liability.monthly_payment && liability.monthly_payment > 0) {
      const hasInterest = liability.interest_rate && liability.interest_rate > 0;
      let remainingBalance = liability.current_balance;
      const startMonth = (year === currentYear) ? currentMonth : 0;

      for (let month = startMonth; month < 12; month++) {
        if (remainingBalance <= 0) break;
        const monthlyInterest = hasInterest ? remainingBalance * (liability.interest_rate / 100 / 12) : 0;
        const principalPayment = Math.max(0, liability.monthly_payment - monthlyInterest);
        const paymentThisMonth = Math.min(remainingBalance + monthlyInterest, liability.monthly_payment);
        totalAnnualDebtPayment += paymentThisMonth;
        remainingBalance = Math.max(0, remainingBalance - principalPayment);
      }
    }
  });

  return totalAnnualDebtPayment;
};