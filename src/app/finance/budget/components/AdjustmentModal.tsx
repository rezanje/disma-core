import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { BudgetCategory, BudgetSubCategory, BudgetPlan, BudgetAdjustment } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface AdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  subCategoryId?: string | null;
}

export default function AdjustmentModal({ isOpen, onClose, planId, subCategoryId }: AdjustmentModalProps) {
  const plans = useAppStore(state => state.budgetPlans);
  const categories = useAppStore(state => state.budgetCategories).filter(c => c.planId === planId);
  const subCategories = useAppStore(state => state.budgetSubCategories);
  
  const upsertBudgetSubCategory = useAppStore(state => state.upsertBudgetSubCategory);
  const upsertBudgetCategory = useAppStore(state => state.upsertBudgetCategory);
  const upsertBudgetPlan = useAppStore(state => state.upsertBudgetPlan);
  const upsertBudgetAdjustment = useAppStore(state => state.upsertBudgetAdjustment);
  const currentUser = useAppStore(state => state.currentUser);

  // Get only sub-categories belonging to this plan
  const catIds = new Set(categories.map(c => c.id));
  const planSubCategories = subCategories.filter(sc => catIds.has(sc.categoryId));

  const [selectedSubId, setSelectedSubId] = useState('');
  const [adjustType, setAdjustType] = useState<'Add' | 'Subtract'>('Add');
  const [amountInput, setAmountInput] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset inputs when opened
  useEffect(() => {
    if (isOpen) {
      setSelectedSubId(subCategoryId || '');
      setAdjustType('Add');
      setAmountInput('');
      setReason('');
    }
  }, [isOpen, subCategoryId]);

  const activePlan = plans.find(p => p.id === planId);
  const targetSub = planSubCategories.find(sc => sc.id === selectedSubId);
  const targetCat = targetSub ? categories.find(c => c.id === targetSub.categoryId) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubId) {
      toast.error('Mohon pilih sub-pos belanja');
      return;
    }

    const amount = Number(amountInput);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Jumlah penyesuaian harus lebih dari 0');
      return;
    }

    if (!reason.trim()) {
      toast.error('Alasan penyesuaian wajib diisi');
      return;
    }

    if (!targetSub || !targetCat || !activePlan) {
      toast.error('Data budget tidak lengkap');
      return;
    }

    // Validation for subtracting
    if (adjustType === 'Subtract' && targetSub.plannedAmount - amount < 0) {
      toast.error(`Plafond baru tidak boleh kurang dari 0. Plafond saat ini: Rp ${targetSub.plannedAmount.toLocaleString('id-ID')}`);
      return;
    }

    setLoading(true);
    try {
      const delta = adjustType === 'Add' ? amount : -amount;

      // 1. Update Sub-category
      const updatedSub: BudgetSubCategory = {
        ...targetSub,
        plannedAmount: targetSub.plannedAmount + delta
      };

      // 2. Update Category
      const updatedCat: BudgetCategory = {
        ...targetCat,
        plannedAmount: targetCat.plannedAmount + delta
      };

      // 3. Update Plan
      const updatedPlan: BudgetPlan = {
        ...activePlan,
        totalPlanned: activePlan.totalPlanned + delta,
        updatedAt: new Date().toISOString()
      };

      // 4. Create Adjustment record
      const adjustment: BudgetAdjustment = {
        id: `adj-adjust-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        planId,
        date: new Date().toISOString(),
        type: 'Adjustment',
        subCategoryId: targetSub.id,
        amount: delta, // signed amount (negative for subtraction)
        reason,
        createdBy: currentUser?.name || 'Finance Admin'
      };

      // Save to store (syncs with Supabase)
      await upsertBudgetSubCategory(updatedSub);
      await upsertBudgetCategory(updatedCat);
      await upsertBudgetPlan(updatedPlan);
      await upsertBudgetAdjustment(adjustment);

      toast.success('Plafond budget berhasil diperbarui!');
      onClose();
    } catch (err: any) {
      toast.error('Gagal memperbarui plafond: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[440px] p-6 rounded-3xl border-none shadow-[0_24px_64px_rgba(0,0,0,0.15)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Adjust Plafond Budget</DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
            Tambah atau kurangi plafond anggaran untuk sub-pos terpilih di tengah jalan.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Sub-Pos Belanja</Label>
            {subCategoryId ? (
              <div className="bg-slate-100 dark:bg-slate-800/80 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {targetCat?.name} - {targetSub?.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Plafond saat ini: Rp {targetSub?.plannedAmount.toLocaleString('id-ID')}
                </p>
              </div>
            ) : (
              <Select value={selectedSubId} onValueChange={(v) => setSelectedSubId(v ?? '')}>
                <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl h-11">
                  <SelectValue placeholder="Pilih sub-pos belanja" />
                </SelectTrigger>
                <SelectContent className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-slate-200 dark:border-slate-800 rounded-xl">
                  {planSubCategories.map(sc => {
                    const parentCatName = categories.find(c => c.id === sc.categoryId)?.name || '';
                    return (
                      <SelectItem key={sc.id} value={sc.id} className="rounded-lg">
                        {parentCatName} - {sc.name} (Plafond: Rp {sc.plannedAmount.toLocaleString('id-ID')})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tipe Aksi</Label>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setAdjustType('Add')}
                className={`flex-1 text-center py-2 text-xs font-semibold rounded-lg transition-all duration-300 ${
                  adjustType === 'Add'
                    ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Tambah Plafond (+)
              </button>
              <button
                type="button"
                onClick={() => setAdjustType('Subtract')}
                className={`flex-1 text-center py-2 text-xs font-semibold rounded-lg transition-all duration-300 ${
                  adjustType === 'Subtract'
                    ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Kurangi Plafond (-)
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Nominal Penyesuaian (Rp)</Label>
            <Input
              id="amount"
              type="number"
              placeholder="Masukkan jumlah nominal"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl h-11"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Alasan Penyesuaian</Label>
            <Input
              id="reason"
              placeholder="Contoh: Kebutuhan mendesak pengiriman outlet baru"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl h-11"
              required
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border-slate-200 dark:border-slate-800"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className={`rounded-xl text-white ${
                adjustType === 'Add'
                  ? 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700'
                  : 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-700'
              }`}
            >
              {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
