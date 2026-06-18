import React from 'react';
import { useAppStore } from '@/lib/store';
import { BudgetPlan } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Archive, CheckCircle, RefreshCw, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface BudgetHistoryProps {
  onViewPlan: (plan: BudgetPlan) => void;
}

export default function BudgetHistory({ onViewPlan }: BudgetHistoryProps) {
  const plans = useAppStore(state => state.budgetPlans);
  const upsertBudgetPlan = useAppStore(state => state.upsertBudgetPlan);
  
  const cashTransactions = useAppStore(state => state.cashTransactions);
  const reimbursements = useAppStore(state => state.reimbursements);
  const expenses = useAppStore(state => state.expenses);

  // Compute realisasi for a given month
  const getRealisasiForMonth = (month: string) => {
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

    const cashSum = activeCashTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const reimbSum = activeReimbursements.reduce((sum, r) => sum + r.amount, 0);
    const expenseSum = activeExpenses.reduce((sum, e) => sum + e.amount, 0);

    return cashSum + reimbSum + expenseSum;
  };

  const handleClosePlan = async (plan: BudgetPlan) => {
    try {
      const updated: BudgetPlan = {
        ...plan,
        status: 'Closed',
        updatedAt: new Date().toISOString()
      };
      await upsertBudgetPlan(updated);
      toast.success(`Budget bulan ${plan.month} berhasil ditutup!`);
    } catch (err: any) {
      toast.error('Gagal menutup budget: ' + err.message);
    }
  };

  const handleReopenPlan = async (plan: BudgetPlan) => {
    try {
      // Deactivate any currently active plans to ensure only one is active
      const currentlyActive = plans.find(p => p.status === 'Active' && p.id !== plan.id);
      if (currentlyActive) {
        if (window.confirm(`Perencanaan budget ${currentlyActive.month} saat ini sedang aktif. Apakah Anda ingin menonaktifkannya (menutupnya) dan mengaktifkan kembali bulan ${plan.month}?`)) {
          const closedActive: BudgetPlan = {
            ...currentlyActive,
            status: 'Closed',
            updatedAt: new Date().toISOString()
          };
          await upsertBudgetPlan(closedActive);
        } else {
          return;
        }
      }

      const updated: BudgetPlan = {
        ...plan,
        status: 'Active',
        updatedAt: new Date().toISOString()
      };
      await upsertBudgetPlan(updated);
      toast.success(`Budget bulan ${plan.month} berhasil dibuka kembali!`);
    } catch (err: any) {
      toast.error('Gagal membuka kembali budget: ' + err.message);
    }
  };

  const activeOrClosedPlans = plans
    .filter(p => p.status === 'Active' || p.status === 'Closed')
    .sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl">
          <Archive className="w-6 h-6 text-slate-700 dark:text-slate-300" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Riwayat Perencanaan Budget</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Daftar perencanaan budget bulanan dan evaluasi realisasi pengeluaran.</p>
        </div>
      </div>

      {activeOrClosedPlans.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 text-slate-400">
          <FileText className="w-10 h-10 mx-auto opacity-30 mb-3" />
          <p className="text-sm font-semibold">Belum ada riwayat budget yang aktif atau ditutup.</p>
          <p className="text-xs mt-1">Buat perencanaan budget baru untuk memulainya.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/30 text-slate-500 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200/50 dark:border-slate-800/50">
                  <th className="p-4">Bulan</th>
                  <th className="p-4">Total Anggaran</th>
                  <th className="p-4">Realisasi</th>
                  <th className="p-4">Selisih (Sisa)</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-slate-600 dark:text-slate-300">
                {activeOrClosedPlans.map(plan => {
                  const real = getRealisasiForMonth(plan.month);
                  const diff = plan.totalPlanned - real;

                  return (
                    <tr key={plan.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="p-4 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span>{plan.month}</span>
                      </td>
                      <td className="p-4 font-semibold">Rp {plan.totalPlanned.toLocaleString('id-ID')}</td>
                      <td className="p-4 font-semibold">Rp {real.toLocaleString('id-ID')}</td>
                      <td className={`p-4 font-bold ${diff < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        Rp {diff.toLocaleString('id-ID')}
                      </td>
                      <td className="p-4">
                        <Badge variant={plan.status === 'Active' ? 'default' : 'secondary'} className="rounded-full px-2.5 py-0.5 text-[9px] uppercase font-bold tracking-wide">
                          {plan.status === 'Active' ? 'Aktif' : 'Ditutup'}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end items-center gap-2">
                          <Button 
                            onClick={() => onViewPlan(plan)}
                            variant="outline" 
                            size="sm" 
                            className="rounded-xl h-9 border-slate-200 dark:border-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300"
                          >
                            Lihat Detail
                          </Button>
                          {plan.status === 'Active' ? (
                            <Button 
                              onClick={() => handleClosePlan(plan)}
                              variant="ghost" 
                              size="sm" 
                              className="rounded-xl h-9 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/20"
                            >
                              Tutup Budget
                            </Button>
                          ) : (
                            <Button 
                              onClick={() => handleReopenPlan(plan)}
                              variant="ghost" 
                              size="sm" 
                              className="rounded-xl h-9 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
                            >
                              Buka Kembali
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
