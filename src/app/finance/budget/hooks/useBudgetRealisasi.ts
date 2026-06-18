import { useMemo } from 'react';
import { useAppStore } from '@/lib/store';

export interface UncategorizedTx {
  id: string;
  date: string;
  source: 'Cash' | 'Reimbursement' | 'Expense';
  category: string;
  description: string;
  amount: number;
}

export function useBudgetRealisasi(month: string, planId: string | null) {
  const cashTransactions = useAppStore(state => state.cashTransactions);
  const reimbursements = useAppStore(state => state.reimbursements);
  const expenses = useAppStore(state => state.expenses);
  const categories = useAppStore(state => state.budgetCategories);
  const subCategories = useAppStore(state => state.budgetSubCategories);

  return useMemo(() => {
    // 1. Filter transactions for the target month
    const activeCashTxs = cashTransactions.filter(tx => 
      tx.type === 'Out' && 
      tx.referenceType === 'Manual' && 
      tx.date && 
      tx.date.substring(0, 7) === month
    );

    const activeReimbursements = reimbursements.filter(r => 
      r.status === 'Paid' && 
      r.paymentDate && 
      r.paymentDate.substring(0, 7) === month
    );

    const activeExpenses = expenses.filter(e => 
      e.status === 'Approved' && 
      e.date && 
      e.date.substring(0, 7) === month
    );

    // 2. Prepare mapping structures
    const subCategoryRealisasi: Record<string, number> = {};
    const categoryRealisasi: Record<string, number> = {};
    const uncategorizedTransactions: UncategorizedTx[] = [];

    // Initialize all sub-categories and categories to 0 realisasi
    const planCategories = categories.filter(c => c.planId === planId);
    const planCatIds = new Set(planCategories.map(c => c.id));
    const planSubCategories = subCategories.filter(sc => planCatIds.has(sc.categoryId));

    planSubCategories.forEach(sc => {
      subCategoryRealisasi[sc.id] = 0;
    });
    planCategories.forEach(c => {
      categoryRealisasi[c.id] = 0;
    });

    // Helper to find sub-category mapping for a transaction category string
    const findMatchingSubCategory = (txCategory: string) => {
      const normalizedTxCat = txCategory.toLowerCase().trim();
      return planSubCategories.find(sc => 
        sc.mappedTxCategories?.some(mc => mc.toLowerCase().trim() === normalizedTxCat)
      );
    };

    let totalRealisasi = 0;

    // Process Cash Transactions
    activeCashTxs.forEach(tx => {
      const match = findMatchingSubCategory(tx.category);
      if (match) {
        subCategoryRealisasi[match.id] += tx.amount;
        totalRealisasi += tx.amount;
      } else {
        uncategorizedTransactions.push({
          id: tx.id,
          date: tx.date,
          source: 'Cash',
          category: tx.category,
          description: tx.description,
          amount: tx.amount
        });
      }
    });

    // Process Reimbursements
    activeReimbursements.forEach(r => {
      // Reimbursements might map to their 'Reimbursement' tag, or kind, or description
      const match = findMatchingSubCategory('Reimbursement') || findMatchingSubCategory(r.title);
      if (match) {
        subCategoryRealisasi[match.id] += r.amount;
        totalRealisasi += r.amount;
      } else {
        uncategorizedTransactions.push({
          id: r.id,
          date: r.date,
          source: 'Reimbursement',
          category: 'Reimbursement',
          description: `${r.title} - ${r.description}`,
          amount: r.amount
        });
      }
    });

    // Process Expenses
    activeExpenses.forEach(e => {
      const match = findMatchingSubCategory(e.category);
      if (match) {
        subCategoryRealisasi[match.id] += e.amount;
        totalRealisasi += e.amount;
      } else {
        uncategorizedTransactions.push({
          id: e.id,
          date: e.date,
          source: 'Expense',
          category: e.category,
          description: e.description,
          amount: e.amount
        });
      }
    });

    // Sum up categories
    planSubCategories.forEach(sc => {
      const amount = subCategoryRealisasi[sc.id] || 0;
      categoryRealisasi[sc.categoryId] = (categoryRealisasi[sc.categoryId] || 0) + amount;
    });

    const uncategorizedTotal = uncategorizedTransactions.reduce((sum, tx) => sum + tx.amount, 0);

    return {
      subCategoryRealisasi,
      categoryRealisasi,
      totalRealisasi,
      uncategorizedTransactions,
      uncategorizedTotal
    };
  }, [cashTransactions, reimbursements, expenses, categories, subCategories, month, planId]);
}
