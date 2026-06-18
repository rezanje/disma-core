import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { BudgetCategory, BudgetSubCategory, BudgetAdjustment } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface RealokasiModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  subCategoryRealisasi: Record<string, number>;
}

export default function RealokasiModal({ isOpen, onClose, planId, subCategoryRealisasi }: RealokasiModalProps) {
  const categories = useAppStore(state => state.budgetCategories).filter(c => c.planId === planId);
  const subCategories = useAppStore(state => state.budgetSubCategories);
  const upsertBudgetSubCategory = useAppStore(state => state.upsertBudgetSubCategory);
  const upsertBudgetCategory = useAppStore(state => state.upsertBudgetCategory);
  const upsertBudgetAdjustment = useAppStore(state => state.upsertBudgetAdjustment);
  const currentUser = useAppStore(state => state.currentUser);

  // Get only sub-categories belonging to this plan's categories
  const catIds = new Set(categories.map(c => c.id));
  const planSubCategories = subCategories.filter(sc => catIds.has(sc.categoryId));

  const [fromSubId, setFromSubId] = useState('');
  const [toSubId, setToSubId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset inputs when opened/closed
  useEffect(() => {
    if (isOpen) {
      setFromSubId('');
      setToSubId('');
      setAmountInput('');
      setReason('');
    }
  }, [isOpen]);

  const fromSub = planSubCategories.find(sc => sc.id === fromSubId);
  const toSub = planSubCategories.find(sc => sc.id === toSubId);

  // Calculate remaining balance for the source sub-category
  const fromReal = fromSub ? (subCategoryRealisasi[fromSub.id] || 0) : 0;
  const fromPlanned = fromSub ? fromSub.plannedAmount : 0;
  const remainingSource = Math.max(0, fromPlanned - fromReal);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromSubId || !toSubId) {
      toast.error('Mohon pilih sub-pos asal dan tujuan');
      return;
    }
    if (fromSubId === toSubId) {
      toast.error('Sub-pos asal dan tujuan tidak boleh sama');
      return;
    }

    const amount = Number(amountInput);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Jumlah realokasi harus lebih dari 0');
      return;
    }

    if (amount > remainingSource) {
      toast.error(`Saldo budget sisa tidak cukup. Sisa saldo: Rp ${remainingSource.toLocaleString('id-ID')}`);
      return;
    }

    if (!reason.trim()) {
      toast.error('Alasan realokasi wajib diisi');
      return;
    }

    setLoading(true);
    try {
      if (!fromSub || !toSub) throw new Error('Sub-pos tidak valid');

      // 1. Update Sub-categories planned amounts
      const updatedFromSub: BudgetSubCategory = {
        ...fromSub,
        plannedAmount: fromSub.plannedAmount - amount
      };

      const updatedToSub: BudgetSubCategory = {
        ...toSub,
        plannedAmount: toSub.plannedAmount + amount
      };

      // 2. Update parent Categories if they differ
      if (fromSub.categoryId === toSub.categoryId) {
        // Same category, parent total planned doesn't change
        await upsertBudgetSubCategory(updatedFromSub);
        await upsertBudgetSubCategory(updatedToSub);
      } else {
        const fromCat = categories.find(c => c.id === fromSub.categoryId);
        const toCat = categories.find(c => c.id === toSub.categoryId);

        if (fromCat && toCat) {
          const updatedFromCat: BudgetCategory = {
            ...fromCat,
            plannedAmount: fromCat.plannedAmount - amount
          };
          const updatedToCat: BudgetCategory = {
            ...toCat,
            plannedAmount: toCat.plannedAmount + amount
          };

          await upsertBudgetSubCategory(updatedFromSub);
          await upsertBudgetSubCategory(updatedToSub);
          await upsertBudgetCategory(updatedFromCat);
          await upsertBudgetCategory(updatedToCat);
        } else {
          await upsertBudgetSubCategory(updatedFromSub);
          await upsertBudgetSubCategory(updatedToSub);
        }
      }

      // 3. Log adjustment
      const adjustment: BudgetAdjustment = {
        id: `adj-realloc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        planId,
        date: new Date().toISOString(),
        type: 'Reallocation',
        fromCategoryId: fromSub.categoryId,
        toCategoryId: toSub.categoryId,
        subCategoryId: fromSub.id,
        amount,
        reason,
        createdBy: currentUser?.name || 'Finance Admin'
      };

      await upsertBudgetAdjustment(adjustment);
      toast.success('Realokasi budget berhasil dilakukan!');
      onClose();
    } catch (err: any) {
      toast.error('Gagal melakukan realokasi: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] p-6 rounded-3xl border-none shadow-[0_24px_64px_rgba(0,0,0,0.15)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Realokasi Budget</DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
            Pindahkan budget dari satu sub-pos belanja ke sub-pos belanja lainnya.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Dari Sub-Pos (Sumber)</Label>
            <Select value={fromSubId} onValueChange={(v) => setFromSubId(v ?? '')}>
              <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl h-11">
                <SelectValue placeholder="Pilih sub-pos asal" />
              </SelectTrigger>
              <SelectContent className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-slate-200 dark:border-slate-800 rounded-xl">
                {planSubCategories.map(sc => {
                  const parentCatName = categories.find(c => c.id === sc.categoryId)?.name || '';
                  const real = subCategoryRealisasi[sc.id] || 0;
                  const rem = Math.max(0, sc.plannedAmount - real);
                  return (
                    <SelectItem key={sc.id} value={sc.id} className="rounded-lg">
                      {parentCatName} - {sc.name} (Sisa: Rp {rem.toLocaleString('id-ID')})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Ke Sub-Pos (Tujuan)</Label>
            <Select value={toSubId} onValueChange={(v) => setToSubId(v ?? '')}>
              <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl h-11">
                <SelectValue placeholder="Pilih sub-pos tujuan" />
              </SelectTrigger>
              <SelectContent className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-slate-200 dark:border-slate-800 rounded-xl">
                {planSubCategories
                  .filter(sc => sc.id !== fromSubId)
                  .map(sc => {
                    const parentCatName = categories.find(c => c.id === sc.categoryId)?.name || '';
                    return (
                      <SelectItem key={sc.id} value={sc.id} className="rounded-lg">
                        {parentCatName} - {sc.name} (Platfond: Rp {sc.plannedAmount.toLocaleString('id-ID')})
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Jumlah Realokasi (Rp)</Label>
            <Input
              id="amount"
              type="number"
              placeholder="Masukkan jumlah nominal"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl h-11"
              required
            />
            {fromSub && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Maksimal realokasi: <span className="font-semibold text-emerald-600">Rp {remainingSource.toLocaleString('id-ID')}</span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Alasan Realokasi</Label>
            <Input
              id="reason"
              placeholder="Contoh: Penyesuaian HPP tak terduga"
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
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-50 dark:hover:bg-slate-100 dark:text-slate-900"
            >
              {loading ? 'Menyimpan...' : 'Konfirmasi Realokasi'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
