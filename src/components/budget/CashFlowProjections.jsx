import React, { useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { TrendingUp, Calendar, Target, DollarSign } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function CashFlowProjections({ 
  monthlyIncome, 
  monthlyBudgetExpenses, 
  lifeEvents = [], 
  goals = [], 
  liabilities = [],
  userSettings = {}
}) {
  const currentYear = new Date().getFullYear();
  const inflationRate = userSettings?.inflation_rate || 3;
  const incomeGrowthRate = userSettings?.income_growth_rate || 3;
  const projectionYears = 10;

  // Calculate year-by-year cash flow projections
  const projections = useMemo(() => {
    const data = [];
    
    // Track debt balances for amortization
    const runningDebt = {};
    liabilities.forEach(liability => {
      runningDebt[liability.id] = liability.current_balance || 0;
    });

    for (let i = 0; i <= projectionYears; i++) {
      const year = currentYear + i;
      
      // Base income and expenses with growth
      const yearIncome = monthlyIncome * 12 * Math.pow(1 + incomeGrowthRate / 100, i);
      const yearBaseExpenses = monthlyBudgetExpenses * 12 * Math.pow(1 + inflationRate / 100, i);
      
      // Life event impacts for this year
      let lifeEventIncome = 0;
      let lifeEventExpenses = 0;
      const yearEvents = [];

      // Calculate debt payoff goal extra monthly payments for this year
      const debtPayoffGoalMonthlyPayments = {}; // liability_id -> extra monthly payment
      goals.forEach(goal => {
        if (goal.goal_type === 'debt_payoff' && goal.linked_liability_id && goal.payoff_years > 0) {
          const startYear = goal.target_date ? new Date(goal.target_date).getFullYear() : currentYear;
          const endYear = startYear + goal.payoff_years;
          
          if (year >= startYear && year < endYear) {
            // Monthly extra payment = (total debt / payoff years) / 12
            const annualPayment = (goal.target_amount || 0) / goal.payoff_years;
            const monthlyExtraPayment = annualPayment / 12;
            debtPayoffGoalMonthlyPayments[goal.linked_liability_id] = monthlyExtraPayment;
          }
        }
      });

      // Calculate debt payments for this year with month-by-month amortization
      let yearDebtPayments = 0;

      liabilities.forEach(liability => {
        if (runningDebt[liability.id] > 0) {
          const hasPayment = liability.monthly_payment && liability.monthly_payment > 0;
          const hasInterest = liability.interest_rate && liability.interest_rate > 0;
          const hasExtraPayment = debtPayoffGoalMonthlyPayments[liability.id] > 0;
          const startingBalance = runningDebt[liability.id];

          if (hasPayment || hasExtraPayment) {
            // Simulate month-by-month with corrected amortization
            let remainingBalance = runningDebt[liability.id];
            const baseMonthlyPayment = liability.monthly_payment || 0;
            const extraMonthlyPayment = debtPayoffGoalMonthlyPayments[liability.id] || 0;
            const totalMonthlyPayment = baseMonthlyPayment + extraMonthlyPayment;
            const currentMonth = new Date().getMonth(); // 0-indexed (Jan=0, Dec=11)
            const startMonth = i === 0 ? currentMonth : 0; // Start from current month in current year

            for (let month = startMonth; month < 12; month++) {
              if (remainingBalance <= 0) break;

              // Calculate and add monthly interest first
              const monthlyInterest = hasInterest 
                ? remainingBalance * (liability.interest_rate / 100 / 12)
                : 0;
              
              remainingBalance += monthlyInterest;

              // Then deduct the full payment
              remainingBalance = Math.max(0, remainingBalance - totalMonthlyPayment);
              yearDebtPayments += totalMonthlyPayment;
            }

            runningDebt[liability.id] = remainingBalance;

            // Track if debt was paid off this year
            if (startingBalance > 0 && remainingBalance <= 0.01) {
              yearEvents.push(`✓ Paid off ${liability.name}`);
            }
          } else if (hasInterest) {
            // No payment, interest accrues
            const annualInterest = runningDebt[liability.id] * (liability.interest_rate / 100);
            runningDebt[liability.id] += annualInterest;
          }
        }
      });
      
      lifeEvents.forEach(event => {
        const yearsFromEventStart = year - event.year;
        const isActive = event.year === year || 
          (event.is_recurring && event.year <= year && year < event.year + (event.recurring_years || 1));
        
        if (isActive) {
          const growthMultiplier = (event.affects === 'income' || event.event_type === 'income_change') 
            ? Math.pow(1 + incomeGrowthRate / 100, Math.max(0, yearsFromEventStart))
            : 1;
          
          const eventAmount = event.amount * growthMultiplier;
          
          if (event.affects === 'income') {
            lifeEventIncome += eventAmount;
          } else if (event.affects === 'expenses') {
            lifeEventExpenses += Math.abs(eventAmount);
          } else if (event.affects === 'assets' && eventAmount > 0) {
            lifeEventIncome += eventAmount; // One-time income boost
          } else if (event.affects === 'assets' && eventAmount < 0) {
            lifeEventExpenses += Math.abs(eventAmount); // One-time expense
          }
          
          yearEvents.push(event.name);
        }
      });

      // Goal impacts (planned expenses)
      let goalExpenses = 0;
      const yearGoals = [];
      
      goals.forEach(goal => {
        if (goal.will_be_spent && goal.target_date) {
          const goalYear = new Date(goal.target_date).getFullYear();
          if (goalYear === year) {
            goalExpenses += goal.target_amount || 0;
            yearGoals.push(goal.name);
          }
        }
        
        // Debt payoff goals
        if (goal.goal_type === 'debt_payoff' && goal.linked_liability_id && goal.payoff_years > 0) {
          const startYear = goal.target_date ? new Date(goal.target_date).getFullYear() : currentYear;
          const endYear = startYear + goal.payoff_years;
          
          if (year >= startYear && year < endYear) {
            const annualPayment = (goal.target_amount || 0) / goal.payoff_years;
            goalExpenses += annualPayment;
            if (!yearGoals.includes(goal.name)) {
              yearGoals.push(`${goal.name} (extra payment)`);
            }
          }
        }
      });

      const totalIncome = yearIncome + lifeEventIncome;
      const totalExpenses = yearBaseExpenses + yearDebtPayments + lifeEventExpenses + goalExpenses;
      const netCashFlow = totalIncome - totalExpenses;

      data.push({
        year,
        totalIncome: Math.round(totalIncome),
        totalExpenses: Math.round(totalExpenses),
        baseExpenses: Math.round(yearBaseExpenses),
        debtPayments: Math.round(yearDebtPayments),
        lifeEventExpenses: Math.round(lifeEventExpenses),
        goalExpenses: Math.round(goalExpenses),
        netCashFlow: Math.round(netCashFlow),
        hasEvents: yearEvents.length > 0 || yearGoals.length > 0,
        eventNames: [...yearEvents, ...yearGoals],
      });
    }
    
    return data;
  }, [monthlyIncome, monthlyBudgetExpenses, lifeEvents, goals, liabilities, inflationRate, incomeGrowthRate, currentYear]);

  const formatCurrency = (value) => {
    if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
    return `$${value.toLocaleString()}`;
  };

  const avgNetCashFlow = projections.reduce((sum, p) => sum + p.netCashFlow, 0) / projections.length;
  const lowestYear = projections.reduce((min, p) => p.netCashFlow < min.netCashFlow ? p : min, projections[0]);
  const highestYear = projections.reduce((max, p) => p.netCashFlow > max.netCashFlow ? p : max, projections[0]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-zinc-500 uppercase tracking-wider">10-Year Avg</span>
          </div>
          <p className={cn("text-2xl font-bold", avgNetCashFlow >= 0 ? "text-emerald-400" : "text-rose-400")}>
            {avgNetCashFlow >= 0 ? '+' : ''}{formatCurrency(avgNetCashFlow)}/yr
          </p>
          <p className="text-xs text-zinc-500 mt-1">Average annual cash flow</p>
        </div>

        <div className="card-glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-rose-400" />
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Lowest Year</span>
          </div>
          <p className="text-2xl font-bold text-rose-400">{formatCurrency(lowestYear.netCashFlow)}</p>
          <p className="text-xs text-zinc-500 mt-1">In {lowestYear.year}</p>
        </div>

        <div className="card-glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Highest Year</span>
          </div>
          <p className="text-2xl font-bold text-emerald-400">{formatCurrency(highestYear.netCashFlow)}</p>
          <p className="text-xs text-zinc-500 mt-1">In {highestYear.year}</p>
        </div>
      </div>

      {/* Net Cash Flow Chart */}
      <div className="card-glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Net Annual Cash Flow</h3>
            <p className="text-sm text-zinc-500 mt-1">
              Projected savings after all expenses, debt, and life events
            </p>
          </div>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projections}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="year" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} tickFormatter={formatCurrency} />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-sm">
                      <p className="font-semibold text-zinc-200 mb-2">{data.year}</p>
                      <div className="space-y-1">
                        <div className="flex justify-between gap-4">
                          <span className="text-emerald-400">Income:</span>
                          <span className="text-zinc-200">${data.totalIncome.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-rose-400">Expenses:</span>
                          <span className="text-zinc-200">${data.totalExpenses.toLocaleString()}</span>
                        </div>
                        {data.baseExpenses > 0 && (
                         <div className="flex justify-between gap-4 text-xs">
                           <span className="text-zinc-500">• Budgeted Expenses:</span>
                           <span className="text-zinc-400">${data.baseExpenses.toLocaleString()}</span>
                         </div>
                        )}
                        {data.debtPayments > 0 && (
                         <div className="flex justify-between gap-4 text-xs">
                           <span className="text-zinc-500">• Debt Payments:</span>
                           <span className="text-zinc-400">${data.debtPayments.toLocaleString()}</span>
                         </div>
                        )}
                        {data.lifeEventExpenses > 0 && (
                          <div className="flex justify-between gap-4 text-xs">
                            <span className="text-zinc-500">• Life Events:</span>
                            <span className="text-zinc-400">${data.lifeEventExpenses.toLocaleString()}</span>
                          </div>
                        )}
                        {data.goalExpenses > 0 && (
                          <div className="flex justify-between gap-4 text-xs">
                            <span className="text-zinc-500">• Goal Funding:</span>
                            <span className="text-zinc-400">${data.goalExpenses.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="pt-2 mt-2 border-t border-zinc-700">
                          <div className="flex justify-between gap-4">
                            <span className={cn("font-semibold", data.netCashFlow >= 0 ? "text-cyan-400" : "text-rose-400")}>
                              Net Cash Flow:
                            </span>
                            <span className={cn("font-semibold", data.netCashFlow >= 0 ? "text-cyan-400" : "text-rose-400")}>
                              {data.netCashFlow >= 0 ? '+' : ''}${data.netCashFlow.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        {data.eventNames.length > 0 && (
                          <div className="pt-2 mt-2 border-t border-zinc-700/50">
                            <p className="text-xs text-zinc-500 mb-1">Events this year:</p>
                            {data.eventNames.map((name, i) => (
                              <p key={i} className="text-xs text-orange-400">• {name}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke="#71717a" strokeDasharray="3 3" />
              <Line 
                type="monotone" 
                dataKey="netCashFlow" 
                stroke="#06b6d4" 
                strokeWidth={3} 
                dot={(props) => {
                  const hasEvents = props.payload?.hasEvents;
                  if (hasEvents) {
                    return <circle cx={props.cx} cy={props.cy} r={5} fill="#F7931A" stroke="#0a0a0b" strokeWidth={2} />;
                  }
                  return <circle cx={props.cx} cy={props.cy} r={3} fill="#06b6d4" />;
                }}
                name="Net Cash Flow"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyan-400" />
            <span>Net Cash Flow</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-400" />
            <span>Life Event / Goal Impact</span>
          </div>
        </div>
      </div>

      {/* Income vs Expenses Stacked Bar Chart */}
      <div className="card-glass rounded-2xl p-6">
        <h3 className="font-semibold mb-4">Income vs Expenses Breakdown</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={projections}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="year" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} tickFormatter={formatCurrency} />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                formatter={(value) => [`$${value.toLocaleString()}`, '']}
              />
              <Legend />
              <Bar dataKey="totalIncome" fill="#10b981" name="Income" />
              <Bar dataKey="baseExpenses" stackId="expenses" fill="#ef4444" name="Budgeted Expenses" />
              <Bar dataKey="debtPayments" stackId="expenses" fill="#f97316" name="Debt Payments" />
              <Bar dataKey="lifeEventExpenses" stackId="expenses" fill="#a78bfa" name="Life Events" />
              <Bar dataKey="goalExpenses" stackId="expenses" fill="#F7931A" name="Goals" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Projections Table */}
      <div className="card-glass rounded-2xl p-6">
        <h3 className="font-semibold mb-4">Year-by-Year Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Year</th>
                <th className="text-right py-3 px-4 text-zinc-400 font-medium">Income</th>
                <th className="text-right py-3 px-4 text-zinc-400 font-medium">Budgeted Expenses</th>
                <th className="text-right py-3 px-4 text-zinc-400 font-medium">Debt Payments</th>
                <th className="text-right py-3 px-4 text-zinc-400 font-medium">Net Cash Flow</th>
                <th className="text-left py-3 px-4 text-zinc-400 font-medium">Events</th>
              </tr>
            </thead>
            <tbody>
              {projections.map((row, i) => (
                <tr key={i} className={cn("border-b border-zinc-800/50", row.hasEvents && "bg-orange-500/5")}>
                  <td className="py-3 px-4">{row.year}</td>
                  <td className="text-right py-3 px-4 text-emerald-400">${row.totalIncome.toLocaleString()}</td>
                  <td className="text-right py-3 px-4 text-rose-400">${row.baseExpenses.toLocaleString()}</td>
                  <td className="text-right py-3 px-4 text-orange-400">${row.debtPayments.toLocaleString()}</td>
                  <td className={cn("text-right py-3 px-4 font-semibold", row.netCashFlow >= 0 ? "text-cyan-400" : "text-rose-400")}>
                    {row.netCashFlow >= 0 ? '+' : ''}${row.netCashFlow.toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    {row.eventNames.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {row.eventNames.slice(0, 2).map((name, j) => (
                          <span key={j} className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                            {name}
                          </span>
                        ))}
                        {row.eventNames.length > 2 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400">
                            +{row.eventNames.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}