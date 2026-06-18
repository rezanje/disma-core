import { useMemo } from 'react';
import { useAppStore } from '@/lib/store';

export function useBudgetSuggestions(currentMonth: string) {
  const budgetPlans = useAppStore(state => state.budgetPlans);
  const categories = useAppStore(state => state.budgetCategories);
  const subCategories = useAppStore(state => state.budgetSubCategories);
  const cashTransactions = useAppStore(state => state.cashTransactions);
  const reimbursements = useAppStore(state => state.reimbursements);
  const expenses = useAppStore(state => state.expenses);

  return useMemo(() => {
    // 1. Find up to 3 prior active/closed budget plans (months before currentMonth)
    const priorPlans = budgetPlans
      .filter(p => p.month < currentMonth && (p.status === 'Active' || p.status === 'Closed'))
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 3);

    // If no prior plans exist, return empty suggestions
    if (priorPlans.length === 0) {
      return { suggestions: {} as Record<string, number>, averages: {} as Record<string, number> };
    }

    // Map to keep track of realisasi sums per sub-category name per prior month
    // Format: { 'Bensin & Transport': [month1Spent, month2Spent, ...] }
    const historyMap: Record<string, number[]> = {};

    priorPlans.forEach(plan => {
      const planMonth = plan.month;
      const planCategories = categories.filter(c => c.planId === plan.id);
      const planCatIds = new Set(planCategories.map(c => c.id));
      const planSubCategories = subCategories.filter(sc => planCatIds.has(sc.categoryId));

      // Filter transactions for this prior month
      const activeCashTxs = cashTransactions.filter(tx => 
        tx.type === 'Out' && 
        tx.referenceType === 'Manual' && 
        tx.date && 
        tx.date.substring(0, 7) === planMonth
      );

      const activeReimbursements = reimbursements.filter(r => 
        r.status === 'Paid' && 
        r.paymentDate && 
        r.paymentDate.substring(0, 7) === planMonth
      );

      const activeExpenses = expenses.filter(e => 
        e.status === 'Approved' && 
        e.date && 
        e.date.substring(0, 7) === planMonth
      );

      // Track spent per sub-category ID for this month
      const monthSubSpent: Record<string, number> = {};
      planSubCategories.forEach(sc => {
        monthSubSpent[sc.id] = 0;
      });

      const findMatchingSubCategory = (txCategory: string) => {
        const normalizedTxCat = txCategory.toLowerCase().trim();
        return planSubCategories.find(sc => 
          sc.mappedTxCategories?.some(mc => mc.toLowerCase().trim() === normalizedTxCat)
        );
      };

      // Sum transactions
      activeCashTxs.forEach(tx => {
        const match = findMatchingSubCategory(tx.category);
        if (match) monthSubSpent[match.id] += tx.amount;
      });

      activeReimbursements.forEach(r => {
        const match = findMatchingSubCategory('Reimbursement') || findMatchingSubCategory(r.title);
        if (match) monthSubSpent[match.id] += r.amount;
      });

      activeExpenses.forEach(e => {
        const match = findMatchingSubCategory(e.category);
        if (match) monthSubSpent[match.id] += e.amount;
      });

      // Map sub-category spent to their NAMES
      planSubCategories.forEach(sc => {
        const spent = monthSubSpent[sc.id] || 0;
        const nameKey = sc.name.toLowerCase().trim();
        if (!historyMap[nameKey]) {
          historyMap[nameKey] = [];
        }
        historyMap[nameKey].push(spent);
      });
    });

    // 2. Compute averages and suggestions
    const suggestions: Record<string, number> = {};
    const averages: Record<string, number> = {};

    Object.keys(historyMap).forEach(nameKey => {
      const spents = historyMap[nameKey];
      const sum = spents.reduce((a, b) => a + b, 0);
      const avg = sum / spents.length;
      averages[nameKey] = avg;

      // Suggestion = avg * 1.10, rounded to nearest Rp 50,000
      const suggestedVal = avg * 1.10;
      const rounded = Math.round(suggestedVal / 50000) * 50000;
      suggestions[nameKey] = (rounded === 0 && suggestedVal > 0) ? 50000 : rounded;
    });

    return { suggestions, averages };
  }, [budgetPlans, categories, subCategories, cashTransactions, reimbursements, expenses, currentMonth]);
}
