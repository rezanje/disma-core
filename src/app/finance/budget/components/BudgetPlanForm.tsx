import React, { useState, useRef, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { BudgetPlan, BudgetCategory, BudgetSubCategory } from '@/types';
import { useBudgetSuggestions } from '../hooks/useBudgetSuggestions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Plus, Trash2, ChevronDown, ChevronUp,
  Tag, Sparkles, X, Search,
} from 'lucide-react';
import { toast } from 'sonner';

interface BudgetPlanFormProps {
  onCancel: () => void;
  onSave: () => void;
}

interface SubItem {
  id: string;
  name: string;
  plannedAmount: string;
  mappedTxCategories: string[];
}

interface CatItem {
  id: string;
  name: string;
  icon: string;
  color: string;
  subs: SubItem[];
}

const DEFAULT_TEMPLATE: CatItem[] = [
  {
    id: 'operasional', name: 'Operasional', icon: '🏭', color: 'bg-indigo-500',
    subs: [
      { id: 'bensin', name: 'Bensin & Transport', plannedAmount: '0', mappedTxCategories: ['Bensin', 'Tol', 'Parkir', 'Bensin/Transport'] },
      { id: 'perawatan', name: 'Perawatan Kendaraan', plannedAmount: '0', mappedTxCategories: ['Cuci/Perawatan', 'Perawatan'] },
      { id: 'ongkir', name: 'Ongkir & Kurir', plannedAmount: '0', mappedTxCategories: ['Ongkir'] },
      { id: 'atk', name: 'ATK & Packing', plannedAmount: '0', mappedTxCategories: ['ATK/Kantor', 'ATK & Packing'] },
    ],
  },
  {
    id: 'gaji', name: 'Gaji', icon: '💵', color: 'bg-emerald-500',
    subs: [
      { id: 'gaji-karyawan', name: 'Gaji Karyawan', plannedAmount: '0', mappedTxCategories: ['Beban Gaji', 'Gaji'] },
    ],
  },
  {
    id: 'marketing', name: 'Marketing', icon: '📣', color: 'bg-pink-500',
    subs: [
      { id: 'iklan', name: 'Iklan & Promosi', plannedAmount: '0', mappedTxCategories: ['Marketing', 'Iklan/Promosi'] },
    ],
  },
  {
    id: 'admin', name: 'Administrasi', icon: '🏦', color: 'bg-slate-500',
    subs: [
      { id: 'admin-bank', name: 'Biaya Admin Bank', plannedAmount: '0', mappedTxCategories: ['Biaya Admin', 'Admin Bank'] },
    ],
  },
  {
    id: 'lainnya', name: 'Lainnya', icon: '❓', color: 'bg-amber-500',
    subs: [
      { id: 'tak-terduga', name: 'Pengeluaran Tak Terduga', plannedAmount: '0', mappedTxCategories: ['Lainnya'] },
    ],
  },
];

const EMOJI_OPTIONS = ['🏭','💵','📣','🏦','❓','🚗','🔧','📦','📎','🛒','🏠','💊','🎓','⚡','🌐','🎯','🧾','🔑','💡','🛠️','👷','🚀','💼','🖥️'];

const COLOR_OPTIONS = [
  { label: 'Indigo',   value: 'bg-indigo-500'  },
  { label: 'Emerald',  value: 'bg-emerald-500' },
  { label: 'Pink',     value: 'bg-pink-500'    },
  { label: 'Slate',    value: 'bg-slate-500'   },
  { label: 'Amber',    value: 'bg-amber-500'   },
  { label: 'Rose',     value: 'bg-rose-500'    },
  { label: 'Violet',   value: 'bg-violet-500'  },
  { label: 'Cyan',     value: 'bg-cyan-500'    },
];

// Fixed categories from OperationalExpense type
const EXPENSE_CATEGORIES = [
  'Bensin', 'Tol', 'Parkir', 'Kuli', 'Makan', 'Lainnya',
  'Belanja Online', 'Sourcing (HPP)', 'Sales Revenue', 'Setoran Pengembalian',
];

function genId() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── TagInput with live autocomplete ───────────────────────────────────────────
function TagInput({
  tags,
  onChange,
  availableCategories,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  availableCategories: string[];
}) {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!input.trim()) {
      // Show all not yet added
      return availableCategories.filter(c => !tags.includes(c));
    }
    const q = input.toLowerCase();
    return availableCategories.filter(
      c => c.toLowerCase().includes(q) && !tags.includes(c)
    );
  }, [input, availableCategories, tags]);

  const add = (val: string) => {
    const v = val.trim();
    if (!v) return;
    if (!tags.includes(v)) onChange([...tags, v]);
    setInput('');
    inputRef.current?.focus();
  };

  const addFromInput = () => {
    const v = input.trim();
    if (v) add(v);
  };

  return (
    <div ref={wrapperRef} className="relative">
      {/* Chip container */}
      <div
        className="flex flex-wrap gap-1.5 min-h-[40px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 cursor-text transition-colors focus-within:border-indigo-400 dark:focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-400/30"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map(t => (
          <span
            key={t}
            className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-lg"
          >
            {t}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(tags.filter(x => x !== t)); }}
              className="text-indigo-400 hover:text-rose-500 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addFromInput(); }
            if (e.key === 'Backspace' && !input && tags.length) onChange(tags.slice(0, -1));
            if (e.key === 'Escape') { setInput(''); setFocused(false); inputRef.current?.blur(); }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={tags.length === 0 ? 'Pilih atau ketik nama kategori...' : ''}
          className="flex-1 min-w-[140px] bg-transparent text-xs outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
        />
      </div>

      {/* Dropdown suggestions */}
      {focused && (
        <div className="absolute z-50 mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden">
          {/* Search hint */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-[10px] text-slate-400 font-medium">
              {input ? `Hasil untuk "${input}"` : 'Semua kategori transaksi tersedia'}
            </span>
          </div>

          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-center">
                <p className="text-xs text-slate-400">Tidak ditemukan.</p>
                {input.trim() && (
                  <button
                    type="button"
                    onMouseDown={() => add(input.trim())}
                    className="mt-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    + Tambah &quot;{input.trim()}&quot; sebagai custom tag
                  </button>
                )}
              </div>
            ) : (
              <>
                {filtered.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onMouseDown={() => add(cat)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors group"
                  >
                    <Tag className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
                      {cat}
                    </span>
                  </button>
                ))}
                {input.trim() && !filtered.some(c => c.toLowerCase() === input.toLowerCase()) && (
                  <button
                    type="button"
                    onMouseDown={() => add(input.trim())}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors border-t border-slate-100 dark:border-slate-800"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      Tambah &quot;{input.trim()}&quot; sebagai custom tag
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function BudgetPlanForm({ onCancel, onSave }: BudgetPlanFormProps) {
  const plans                   = useAppStore(s => s.budgetPlans);
  const cashTransactions        = useAppStore(s => s.cashTransactions);
  const reimbursements          = useAppStore(s => s.reimbursements);
  const expenses                = useAppStore(s => s.expenses);
  const upsertBudgetPlan        = useAppStore(s => s.upsertBudgetPlan);
  const upsertBudgetCategory    = useAppStore(s => s.upsertBudgetCategory);
  const upsertBudgetSubCategory = useAppStore(s => s.upsertBudgetSubCategory);
  const currentUser             = useAppStore(s => s.currentUser);

  // Build the live category list from real transactions in the store
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();

    // From OperationalExpense fixed categories
    EXPENSE_CATEGORIES.forEach(c => cats.add(c));

    // From actual cash transactions (live categories used in the system)
    cashTransactions
      .filter(tx => tx.type === 'Out')
      .forEach(tx => { if (tx.category) cats.add(tx.category); });

    // From actual expenses
    expenses.forEach(e => { if (e.category) cats.add(e.category); });

    // Reimbursement tag
    cats.add('Reimbursement');

    return Array.from(cats).sort((a, b) => a.localeCompare(b, 'id'));
  }, [cashTransactions, expenses, reimbursements]);

  const getInitialMonth = () => {
    const d = new Date();
    if (plans.length > 0) d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const [selectedMonth, setSelectedMonth] = useState(getInitialMonth());
  const [notes, setNotes]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [categories, setCategories]       = useState<CatItem[]>(() => JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)));
  const [expandedCats, setExpandedCats]   = useState<Record<string, boolean>>({});
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null);

  const { suggestions } = useBudgetSuggestions(selectedMonth);

  // ── Category CRUD ──────────────────────────────────────────────────────────
  const addCategory = () => {
    const id = genId();
    setCategories(prev => [...prev, { id, name: 'Kategori Baru', icon: '💼', color: 'bg-slate-500', subs: [] }]);
    setExpandedCats(prev => ({ ...prev, [id]: true }));
  };

  const updateCategory = (catId: string, patch: Partial<Omit<CatItem, 'id' | 'subs'>>) =>
    setCategories(prev => prev.map(c => c.id === catId ? { ...c, ...patch } : c));

  const removeCategory = (catId: string) =>
    setCategories(prev => prev.filter(c => c.id !== catId));

  // ── Sub-category CRUD ──────────────────────────────────────────────────────
  const addSub = (catId: string) =>
    setCategories(prev => prev.map(c =>
      c.id === catId
        ? { ...c, subs: [...c.subs, { id: genId(), name: 'Sub-pos Baru', plannedAmount: '0', mappedTxCategories: [] }] }
        : c
    ));

  const updateSub = (catId: string, subId: string, patch: Partial<SubItem>) =>
    setCategories(prev => prev.map(c =>
      c.id === catId ? { ...c, subs: c.subs.map(s => s.id === subId ? { ...s, ...patch } : s) } : c
    ));

  const removeSub = (catId: string, subId: string) =>
    setCategories(prev => prev.map(c =>
      c.id === catId ? { ...c, subs: c.subs.filter(s => s.id !== subId) } : c
    ));

  // ── Suggestions ────────────────────────────────────────────────────────────
  const handleApplySuggestions = () => {
    let applied = 0;
    setCategories(prev => prev.map(c => ({
      ...c,
      subs: c.subs.map(s => {
        const key = s.name.toLowerCase().trim();
        if (suggestions[key] !== undefined) { applied++; return { ...s, plannedAmount: String(suggestions[key]) }; }
        return s;
      }),
    })));
    if (applied > 0) toast.success(`${applied} saran anggaran diterapkan!`);
    else toast.info('Belum ada saran historis untuk bulan ini.');
  };

  const totalPlanned = categories.reduce(
    (sum, c) => sum + c.subs.reduce((s2, sub) => s2 + Number(sub.plannedAmount || 0), 0), 0
  );

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (status: 'Draft' | 'Active') => {
    if (plans.some(p => p.month === selectedMonth)) {
      toast.error(`Perencanaan budget untuk bulan ${selectedMonth} sudah ada!`); return;
    }
    if (categories.length === 0) { toast.error('Tambahkan minimal satu POS terlebih dahulu.'); return; }
    for (const cat of categories) {
      if (!cat.name.trim()) { toast.error('Nama kategori tidak boleh kosong.'); return; }
      if (cat.subs.length === 0) { toast.error(`Kategori "${cat.name}" harus punya minimal satu sub-pos.`); return; }
      for (const sub of cat.subs) {
        if (!sub.name.trim()) { toast.error(`Sub-pos di "${cat.name}" tidak boleh kosong.`); return; }
      }
    }

    setLoading(true);
    try {
      const planId = `bp-${selectedMonth}`;
      await upsertBudgetPlan({
        id: planId, month: selectedMonth, status, totalPlanned,
        notes: notes.trim() || undefined,
        createdBy: currentUser?.name || 'System',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as BudgetPlan);

      for (let ci = 0; ci < categories.length; ci++) {
        const cat = categories[ci];
        const catPlanned = cat.subs.reduce((s, sub) => s + Number(sub.plannedAmount || 0), 0);
        const catId = `bc-${selectedMonth}-${cat.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${ci}`;

        await upsertBudgetCategory({
          id: catId, planId, name: cat.name.trim(),
          icon: cat.icon, color: cat.color,
          plannedAmount: catPlanned, orderIndex: ci + 1,
        } as BudgetCategory);

        for (let si = 0; si < cat.subs.length; si++) {
          const sub = cat.subs[si];
          const subId = `bsc-${selectedMonth}-${sub.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${ci}-${si}`;
          await upsertBudgetSubCategory({
            id: subId, categoryId: catId, name: sub.name.trim(),
            plannedAmount: Number(sub.plannedAmount || 0),
            mappedTxCategories: sub.mappedTxCategories,
            orderIndex: si + 1,
          } as BudgetSubCategory);
        }
      }

      toast.success(status === 'Active' ? 'Budget bulanan berhasil diaktifkan!' : 'Draft budget disimpan.');
      onSave();
    } catch (err: any) {
      toast.error('Gagal menyimpan: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-300" onClick={() => setEmojiPickerFor(null)}>
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Button onClick={onCancel} variant="ghost" size="icon" className="rounded-xl border border-slate-200 dark:border-slate-800">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Buat Perencanaan Budget Baru</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Definisikan POS, sub-pos, dan plafond anggaran bulanan Anda sendiri.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left Panel ── */}
        <div className="space-y-5 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 h-fit lg:sticky lg:top-6">
          <div className="space-y-2">
            <Label htmlFor="month" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pilih Bulan Perencanaan</Label>
            <Input
              id="month" type="month" value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Catatan (Opsional)</Label>
            <Textarea
              id="notes" placeholder="Tujuan perencanaan budget bulan ini..."
              value={notes} onChange={e => setNotes(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl min-h-[80px]"
            />
          </div>

          {/* Total */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Plafond Bulanan</p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100">Rp {totalPlanned.toLocaleString('id-ID')}</p>
            <p className="text-[10px] text-slate-400">
              {categories.length} POS · {categories.reduce((s, c) => s + c.subs.length, 0)} sub-pos
            </p>
          </div>

          {/* Available categories info */}
          <div className="bg-indigo-50 dark:bg-indigo-950/20 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-indigo-500" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                {availableCategories.length} Kategori Transaksi Tersedia
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {availableCategories.slice(0, 8).map(cat => (
                <span key={cat} className="text-[10px] bg-white dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-md font-medium">
                  {cat}
                </span>
              ))}
              {availableCategories.length > 8 && (
                <span className="text-[10px] text-indigo-400 dark:text-indigo-500 px-1 py-0.5">
                  +{availableCategories.length - 8} lainnya
                </span>
              )}
            </div>
            <p className="text-[10px] text-indigo-500/80 dark:text-indigo-400/70 leading-relaxed">
              Klik field &quot;Mapped Kategori&quot; di sub-pos untuk memilih.
            </p>
          </div>

          <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">💡 Tips:</h4>
            <ul className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1.5 list-disc pl-4">
              <li>Klik <span className="font-semibold text-slate-700 dark:text-slate-300">+ Tambah POS</span> untuk menambah kategori baru.</li>
              <li><span className="font-semibold text-slate-700 dark:text-slate-300">Mapped Kategori</span> = nama kategori transaksi di sistem (Cash/Expense) yang otomatis dihitung ke sub-pos ini.</li>
              <li>Bisa tambah custom tag jika kategori belum ada di daftar.</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleApplySuggestions} variant="outline"
              className="rounded-xl border-indigo-200 hover:bg-indigo-50 text-indigo-600 dark:border-indigo-900/50 dark:hover:bg-indigo-950/20 dark:text-indigo-400 h-9 w-full"
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              Saran Historis (+10%)
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onCancel} disabled={loading} className="rounded-xl border-slate-200 dark:border-slate-800 flex-1">Batal</Button>
              <Button variant="outline" onClick={() => handleSubmit('Draft')} disabled={loading} className="rounded-xl border-slate-200 dark:border-slate-800 flex-1">Draft</Button>
            </div>
            <Button
              onClick={() => handleSubmit('Active')} disabled={loading}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-50 dark:hover:bg-slate-100 dark:text-slate-900 w-full"
            >
              {loading ? 'Menyimpan...' : '✅ Aktifkan Budget'}
            </Button>
          </div>
        </div>

        {/* ── Right Panel: Categories ── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Daftar POS Anggaran</h3>
            <Button
              onClick={addCategory} size="sm"
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white h-9 gap-1.5"
            >
              <Plus className="w-4 h-4" /> Tambah POS
            </Button>
          </div>

          {categories.length === 0 && (
            <div className="text-center py-16 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl text-slate-400 text-sm">
              Belum ada POS. Klik <span className="font-semibold text-slate-600 dark:text-slate-300">Tambah POS</span> untuk mulai.
            </div>
          )}

          {categories.map((cat) => {
            const isExpanded = expandedCats[cat.id] !== false;
            const catTotal = cat.subs.reduce((s, sub) => s + Number(sub.plannedAmount || 0), 0);

            return (
              <div key={cat.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 overflow-hidden shadow-sm">
                {/* Category Header */}
                <div className="p-4 flex items-center gap-3">
                  {/* Emoji picker */}
                  <div className="relative" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setEmojiPickerFor(prev => prev === cat.id ? null : cat.id)}
                      className="text-2xl p-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 transition-colors cursor-pointer"
                      title="Pilih ikon"
                    >
                      {cat.icon}
                    </button>
                    {emojiPickerFor === cat.id && (
                      <div className="absolute top-12 left-0 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-xl grid grid-cols-6 gap-1.5 w-52">
                        {EMOJI_OPTIONS.map(e => (
                          <button key={e} type="button"
                            onClick={() => { updateCategory(cat.id, { icon: e }); setEmojiPickerFor(null); }}
                            className="text-xl p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >{e}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Name + Color */}
                  <div className="flex-1 min-w-0">
                    <Input
                      value={cat.name}
                      onChange={e => updateCategory(cat.id, { name: e.target.value })}
                      placeholder="Nama Kategori (POS)"
                      className="font-bold text-sm bg-transparent border-0 border-b border-slate-200 dark:border-slate-700 rounded-none px-0 h-8 focus-visible:ring-0 focus-visible:border-indigo-400 text-slate-800 dark:text-slate-100"
                    />
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">Warna:</span>
                      <div className="flex gap-1">
                        {COLOR_OPTIONS.map(col => (
                          <button key={col.value} type="button"
                            onClick={() => updateCategory(cat.id, { color: col.value })}
                            className={`w-4 h-4 rounded-full ${col.value} border-2 transition-all ${cat.color === col.value ? 'border-slate-800 dark:border-white scale-125' : 'border-transparent'}`}
                            title={col.label}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-black text-slate-800 dark:text-slate-100">Rp {catTotal.toLocaleString('id-ID')}</p>
                    <p className="text-[10px] text-slate-400">{cat.subs.length} sub-pos</p>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button type="button"
                      onClick={() => setExpandedCats(prev => ({ ...prev, [cat.id]: !isExpanded }))}
                      className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button type="button"
                      onClick={() => removeCategory(cat.id)}
                      className="p-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Sub-categories */}
                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/30 p-4 space-y-3">
                    {cat.subs.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-3">
                        Belum ada sub-pos. Klik tombol di bawah untuk menambah.
                      </p>
                    )}

                    {cat.subs.map(sub => {
                      const suggest = suggestions[sub.name.toLowerCase().trim()];
                      return (
                        <div key={sub.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 space-y-3 min-w-0">
                              {/* Sub name */}
                              <div className="space-y-1">
                                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Nama Sub-Pos</label>
                                <Input
                                  value={sub.name}
                                  onChange={e => updateSub(cat.id, sub.id, { name: e.target.value })}
                                  placeholder="Nama sub-pos belanja"
                                  className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl h-9 text-sm font-semibold text-slate-800 dark:text-slate-100"
                                />
                              </div>

                              {/* Mapped categories with autocomplete */}
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <Tag className="w-3 h-3 text-indigo-400" />
                                    <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                      Mapped Kategori Transaksi
                                    </label>
                                  </div>
                                  <span className="text-[10px] text-slate-400">
                                    {sub.mappedTxCategories.length} tag terpasang
                                  </span>
                                </div>
                                <TagInput
                                  tags={sub.mappedTxCategories}
                                  onChange={tags => updateSub(cat.id, sub.id, { mappedTxCategories: tags })}
                                  availableCategories={availableCategories}
                                />
                                <p className="text-[10px] text-slate-400 leading-relaxed">
                                  Pilih dari daftar, atau ketik nama baru → Enter untuk custom tag.
                                </p>
                              </div>
                            </div>

                            {/* Amount */}
                            <div className="flex-shrink-0 w-36 space-y-1">
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Plafond (Rp)</label>
                              <Input
                                type="text" placeholder="0"
                                value={Number(sub.plannedAmount || 0).toLocaleString('id-ID')}
                                onChange={e => updateSub(cat.id, sub.id, { plannedAmount: e.target.value.replace(/[^0-9]/g, '') })}
                                className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-xl text-right font-bold text-slate-800 dark:text-slate-100 h-9"
                              />
                              {suggest !== undefined && (
                                <button type="button"
                                  onClick={() => updateSub(cat.id, sub.id, { plannedAmount: String(suggest) })}
                                  className="w-full text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline text-right leading-tight"
                                >
                                  💡 Rp {suggest.toLocaleString('id-ID')}
                                </button>
                              )}
                            </div>

                            {/* Remove sub */}
                            <button type="button"
                              onClick={() => removeSub(cat.id, sub.id)}
                              className="mt-6 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-300 hover:text-rose-500 transition-colors flex-shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Add sub-pos button */}
                    <button type="button" onClick={() => addSub(cat.id)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 dark:hover:border-indigo-700 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Sub-Pos
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {categories.length > 0 && (
            <button type="button" onClick={addCategory}
              className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl text-sm font-semibold text-slate-400 hover:border-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all"
            >
              <Plus className="w-4 h-4" /> Tambah POS Baru
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
