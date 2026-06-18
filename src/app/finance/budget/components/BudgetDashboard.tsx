import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { BudgetPlan, BudgetCategory, BudgetSubCategory } from '@/types';
import { useBudgetRealisasi } from '../hooks/useBudgetRealisasi';
import RealokasiModal from './RealokasiModal';
import AdjustmentModal from './AdjustmentModal';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, ArrowRightLeft, Settings, AlertTriangle, AlertCircle, RefreshCw, User, Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface BudgetDashboardProps {
  plan: BudgetPlan;
}

// Simple Card UI fallback because Dialog's Card import might not have clean layout exports
function CustomCard({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-3xl shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

export default function BudgetDashboard({ plan }: BudgetDashboardProps) {
  const categories = useAppStore(state => state.budgetCategories).filter(c => c.planId === plan.id);
  const subCategories = useAppStore(state => state.budgetSubCategories);
  const adjustments = useAppStore(state => state.budgetAdjustments).filter(a => a.planId === plan.id);
  const deleteBudgetPlan = useAppStore(state => state.deleteBudgetPlan);

  const {
    subCategoryRealisasi,
    categoryRealisasi,
    totalRealisasi,
    uncategorizedTransactions,
    uncategorizedTotal
  } = useBudgetRealisasi(plan.month, plan.id);

  // Modal states
  const [realokasiOpen, setRealokasiOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [targetSubId, setTargetSubId] = useState<string | null>(null);

  // Accordion state
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Keep track of warning toasts triggered this session to prevent spamming
  const [warnedSubIds, setWarnedSubIds] = useState<Set<string>>(new Set());

  const catIds = new Set(categories.map(c => c.id));
  const planSubCategories = subCategories.filter(sc => catIds.has(sc.categoryId));

  const toggleExpand = (catId: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  // Warning calculations
  const globalPct = plan.totalPlanned > 0 ? (totalRealisasi / plan.totalPlanned) * 100 : 0;
  const isOverBudgetGlobal = totalRealisasi >= plan.totalPlanned && plan.totalPlanned > 0;

  // Process sub-category warnings (95% - 99% gets a toast notification 1x per session per sub-category)
  useEffect(() => {
    planSubCategories.forEach(sc => {
      if (sc.plannedAmount <= 0) return;
      const real = subCategoryRealisasi[sc.id] || 0;
      const pct = (real / sc.plannedAmount) * 100;

      if (pct >= 95 && pct < 100 && !warnedSubIds.has(sc.id)) {
        toast.warning(`⚠️ Anggaran sub-pos "${sc.name}" hampir habis! Penggunaan saat ini mencapai ${pct.toFixed(1)}%.`, {
          duration: 7000
        });
        setWarnedSubIds(prev => {
          const next = new Set(prev);
          next.add(sc.id);
          return next;
        });
      }
    });
  }, [subCategoryRealisasi, planSubCategories, warnedSubIds]);

  // Determine progress bar color based on percentage
  const getProgressBarStyles = (pct: number) => {
    if (pct < 80) return { bg: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' };
    if (pct < 95) return { bg: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' };
    if (pct < 100) return { bg: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' };
    return { bg: 'bg-rose-800 dark:bg-rose-950', text: 'text-rose-800 dark:text-rose-300' };
  };

  // Find any categories that are strictly >= 100% to display the top banner
  const overBudgetCategories = categories.filter(c => {
    const real = categoryRealisasi[c.id] || 0;
    return real >= c.plannedAmount && c.plannedAmount > 0;
  });

  const handleAdjustClick = (subId: string | null) => {
    setTargetSubId(subId);
    setAdjustOpen(true);
  };

  const handleRealokasiClick = () => {
    setRealokasiOpen(true);
  };

  const handleDeletePlan = async () => {
    if (window.confirm('Apakah Anda yakin ingin menghapus perencanaan budget bulan ini? Tindakan ini tidak dapat dibatalkan.')) {
      try {
        await deleteBudgetPlan(plan.id);
        toast.success('Perencanaan budget berhasil dihapus');
      } catch (err: any) {
        toast.error('Gagal menghapus: ' + err.message);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Overbudget Top Banner Alert */}
      {overBudgetCategories.length > 0 && (
        <div className="flex items-start gap-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 p-4 rounded-2xl animate-pulse">
          <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-rose-800 dark:text-rose-300">Peringatan: Over-budget Terdeteksi!</h4>
            <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">
              Pengeluaran pada pos utama <span className="font-semibold">{overBudgetCategories.map(c => c.name).join(', ')}</span> telah melebihi atau menyamai rencana anggaran awal bulan ini. Harap lakukan realokasi budget atau penyesuaian plafond.
            </p>
          </div>
        </div>
      )}

      {/* 2. Month & Plan Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl">
            <Calendar className="w-6 h-6 text-slate-700 dark:text-slate-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Budget Bulan {plan.month}</h2>
              <Badge variant={plan.status === 'Active' ? 'default' : plan.status === 'Closed' ? 'secondary' : 'outline'} className="rounded-full px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider">
                {plan.status === 'Active' ? 'Aktif' : plan.status === 'Closed' ? 'Ditutup' : 'Draft'}
              </Badge>
            </div>
            {plan.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{plan.notes}</p>}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleRealokasiClick} variant="outline" className="rounded-xl flex items-center gap-1.5 border-slate-200 dark:border-slate-800">
            <ArrowRightLeft className="w-4 h-4" />
            <span>Realokasi</span>
          </Button>
          <Button onClick={() => handleAdjustClick(null)} variant="outline" className="rounded-xl flex items-center gap-1.5 border-slate-200 dark:border-slate-800">
            <Settings className="w-4 h-4" />
            <span>Adjust Plafond</span>
          </Button>
          <Button onClick={handleDeletePlan} variant="destructive" className="rounded-xl bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/50">
            Hapus Plan
          </Button>
        </div>
      </div>

      {/* 3. Global Budget Summary Card */}
      <CustomCard className="bg-gradient-to-b from-slate-50 to-white dark:from-slate-900/30 dark:to-slate-900">
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Rencana Anggaran</p>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Rp {plan.totalPlanned.toLocaleString('id-ID')}</h3>
            </div>
            <div className="space-y-1 md:pl-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Realisasi</p>
              <h3 className={`text-2xl font-bold ${isOverBudgetGlobal ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}`}>
                Rp {totalRealisasi.toLocaleString('id-ID')}
              </h3>
            </div>
            <div className="space-y-1 md:pl-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Selisih Anggaran (Sisa)</p>
              <h3 className={`text-2xl font-bold ${isOverBudgetGlobal ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                Rp {(plan.totalPlanned - totalRealisasi).toLocaleString('id-ID')}
              </h3>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span className="font-semibold">Persentase Pemakaian Global</span>
              <span className={`font-bold ${isOverBudgetGlobal ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}`}>
                {globalPct.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${isOverBudgetGlobal ? 'bg-rose-700 dark:bg-rose-800' : globalPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, globalPct)}%` }}
              />
            </div>
          </div>
        </div>
      </CustomCard>

      {/* 4. Category and Sub-category Breakdown */}
      <div className="space-y-4">
        <h3 className="text-md font-bold text-slate-800 dark:text-slate-200 tracking-tight">Rincian Pos Anggaran</h3>
        
        {categories.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-sm">
            Belum ada pos anggaran utama dalam perencanaan ini.
          </div>
        ) : (
          categories.map(cat => {
            const catReal = categoryRealisasi[cat.id] || 0;
            const catPct = cat.plannedAmount > 0 ? (catReal / cat.plannedAmount) * 100 : 0;
            const style = getProgressBarStyles(catPct);
            const isExpanded = expandedCategories[cat.id] || false;
            const catSubCategories = planSubCategories.filter(sc => sc.categoryId === cat.id);

            return (
              <CustomCard key={cat.id} className="transition-all duration-300">
                {/* Category Header Row */}
                <div 
                  onClick={() => toggleExpand(cat.id)}
                  className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors duration-300"
                >
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                    {/* Main Name */}
                    <div className="flex items-center gap-3">
                      <div className="text-lg">{cat.icon || '💼'}</div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{cat.name}</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{catSubCategories.length} sub-pos</p>
                      </div>
                    </div>
                    {/* Planned */}
                    <div>
                      <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Anggaran</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Rp {cat.plannedAmount.toLocaleString('id-ID')}</span>
                    </div>
                    {/* Realized */}
                    <div>
                      <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Realisasi</span>
                      <span className={`text-sm font-bold ${catReal >= cat.plannedAmount && cat.plannedAmount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}`}>
                        Rp {catReal.toLocaleString('id-ID')}
                      </span>
                    </div>
                    {/* Progress Bar & Badges */}
                    <div className="pr-4">
                      <div className="flex justify-between items-center text-[11px] mb-1">
                        <span className={`font-semibold ${style.text}`}>{catPct.toFixed(1)}%</span>
                        {catPct >= 80 && catPct < 95 && <span className="text-amber-500">⚠️</span>}
                        {catPct >= 95 && catPct < 100 && <span className="text-rose-500">🚨</span>}
                        {catPct >= 100 && <Badge variant="destructive" className="text-[9px] px-1 rounded-sm">Over</Badge>}
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div 
                          className={`h-full ${style.bg} transition-all duration-500`}
                          style={{ width: `${Math.min(100, catPct)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="text-slate-400">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>

                {/* Collapsible Sub-category Section */}
                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/30 p-5 space-y-4 animate-in fade-in duration-300">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200/50 dark:border-slate-800/50 text-slate-400 uppercase font-semibold tracking-wider text-[10px]">
                            <th className="py-2.5">Sub-Pos</th>
                            <th className="py-2.5">Anggaran Plafond</th>
                            <th className="py-2.5">Realisasi Belanja</th>
                            <th className="py-2.5">Sisa Budget</th>
                            <th className="py-2.5">Progress</th>
                            <th className="py-2.5 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                          {catSubCategories.map(sc => {
                            const scReal = subCategoryRealisasi[sc.id] || 0;
                            const scPct = sc.plannedAmount > 0 ? (scReal / sc.plannedAmount) * 100 : 0;
                            const scStyle = getProgressBarStyles(scPct);
                            const remaining = sc.plannedAmount - scReal;

                            return (
                              <tr key={sc.id} className="group hover:bg-slate-100/30 dark:hover:bg-slate-800/10">
                                <td className="py-3.5 font-semibold text-slate-700 dark:text-slate-300">{sc.name}</td>
                                <td className="py-3.5 font-semibold">Rp {sc.plannedAmount.toLocaleString('id-ID')}</td>
                                <td className={`py-3.5 font-semibold ${scReal >= sc.plannedAmount && sc.plannedAmount > 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                                  Rp {scReal.toLocaleString('id-ID')}
                                </td>
                                <td className={`py-3.5 font-semibold ${remaining < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                  Rp {remaining.toLocaleString('id-ID')}
                                </td>
                                <td className="py-3.5 w-1/5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                      <div 
                                        className={`h-full ${scStyle.bg}`}
                                        style={{ width: `${Math.min(100, scPct)}%` }}
                                      />
                                    </div>
                                    <span className={`font-semibold text-[10px] min-w-8 text-right ${scStyle.text}`}>
                                      {scPct.toFixed(0)}%
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3.5 text-right">
                                  <div className="flex justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                    <Button 
                                      onClick={() => handleAdjustClick(sc.id)}
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-8 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
                                    >
                                      Adjust
                                    </Button>
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
              </CustomCard>
            );
          })
        )}
      </div>

      {/* 5. Uncategorized Transactions Panel */}
      {uncategorizedTransactions.length > 0 && (
        <CustomCard className="border-amber-200 dark:border-amber-900/50 bg-amber-50/10 dark:bg-amber-950/5">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <h4 className="text-sm font-bold tracking-tight">Tidak Terkategorikan ({uncategorizedTransactions.length} Transaksi)</h4>
              </div>
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/30 px-3 py-1 rounded-full">
                Total: Rp {uncategorizedTotal.toLocaleString('id-ID')}
              </span>
            </div>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
              Transaksi pengeluaran di bawah ini belum dicocokkan ke sub-pos budget manapun. Edit pemetaan kategori sub-pos budget Anda agar transaksi di bawah ini terserap ke dalam monitoring budget.
            </p>

            <div className="overflow-x-auto max-h-60 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100/50 dark:bg-slate-800/40 text-slate-500 uppercase font-semibold text-[9px] tracking-wider border-b border-slate-200/40 dark:border-slate-800/30">
                    <th className="p-2.5">Tanggal</th>
                    <th className="p-2.5">Sumber</th>
                    <th className="p-2.5">Kategori Transaksi</th>
                    <th className="p-2.5">Deskripsi</th>
                    <th className="p-2.5 text-right">Nominal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-slate-600 dark:text-slate-300">
                  {uncategorizedTransactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                      <td className="p-2.5 whitespace-nowrap">{tx.date?.substring(0, 10) || '-'}</td>
                      <td className="p-2.5">
                        <Badge variant="outline" className="text-[9px] px-1 rounded-sm uppercase tracking-wide">
                          {tx.source}
                        </Badge>
                      </td>
                      <td className="p-2.5 font-medium text-slate-800 dark:text-slate-200">{tx.category}</td>
                      <td className="p-2.5 max-w-[200px] truncate">{tx.description}</td>
                      <td className="p-2.5 text-right font-bold text-slate-800 dark:text-slate-200">Rp {tx.amount.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CustomCard>
      )}

      {/* 6. Adjustment and Reallocation Log History Feed */}
      <CustomCard>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 dark:border-slate-800/50 pb-3">
            <RefreshCw className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Log Adjustment & Realokasi</h4>
          </div>

          {adjustments.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              Belum ada perubahan plafond atau realokasi budget yang tercatat untuk bulan ini.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/30 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200/50 dark:border-slate-800/50">
                    <th className="p-3">Tanggal</th>
                    <th className="p-3">Tipe</th>
                    <th className="p-3">Rincian Perubahan</th>
                    <th className="p-3">Alasan</th>
                    <th className="p-3">Oleh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-slate-600 dark:text-slate-300">
                  {adjustments.map(adj => {
                    const fromCatName = categories.find(c => c.id === adj.fromCategoryId)?.name || '';
                    const toCatName = categories.find(c => c.id === adj.toCategoryId)?.name || '';
                    const subName = subCategories.find(sc => sc.id === adj.subCategoryId)?.name || '';

                    let details = '';
                    if (adj.type === 'Reallocation') {
                      details = `Pindah Rp ${adj.amount.toLocaleString('id-ID')} dari sub-pos "${subName}" (${fromCatName}) ke pos "${toCatName}"`;
                    } else {
                      const prefix = adj.amount > 0 ? 'Tambah plafond Rp' : 'Kurangi plafond Rp';
                      details = `${prefix} ${Math.abs(adj.amount).toLocaleString('id-ID')} pada sub-pos "${subName}"`;
                    }

                    return (
                      <tr key={adj.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                        <td className="p-3 whitespace-nowrap">{new Date(adj.date).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="p-3">
                          <Badge className={adj.type === 'Reallocation' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400' : adj.amount > 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400'}>
                            {adj.type === 'Reallocation' ? 'Realokasi' : 'Adjustment'}
                          </Badge>
                        </td>
                        <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{details}</td>
                        <td className="p-3 italic max-w-xs truncate" title={adj.reason}>{adj.reason}</td>
                        <td className="p-3 flex items-center gap-1.5 whitespace-nowrap">
                          <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <span>{adj.createdBy}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CustomCard>

      {/* 7. Modals */}
      <RealokasiModal 
        isOpen={realokasiOpen} 
        onClose={() => setRealokasiOpen(false)} 
        planId={plan.id}
        subCategoryRealisasi={subCategoryRealisasi}
      />
      <AdjustmentModal 
        isOpen={adjustOpen} 
        onClose={() => {
          setAdjustOpen(false);
          setTargetSubId(null);
        }} 
        planId={plan.id}
        subCategoryId={targetSubId}
      />
    </div>
  );
}
