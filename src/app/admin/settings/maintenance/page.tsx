"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { 
  AlertTriangle, 
  Trash2, 
  ShieldAlert, 
  Database, 
  RotateCcw,
  CheckCircle2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppStore, clearAllOperationalCaches } from "@/lib/store"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

const DATA_CATEGORIES = [
  {
    title: "Transactional Data",
    description: "Sales mapping, POs, Purchases, Invoices, and Journal entries.",
    keys: ['salesOrders', 'salesOrderItems', 'purchases', 'purchaseItems', 'deliveries', 'invoices', 'journalEntries', 'journalLines'],
    severity: 'high' as const
  },
  {
    title: "Operational Expenses",
    description: "Beban operasional, reimbursement, and cash/bank transactions.",
    keys: ['expenses', 'reimbursements', 'cashTransactions'],
    severity: 'medium' as const
  },
  {
    title: "CRM & OKRs",
    description: "Leads, pipeline data, and OKR objectives.",
    keys: ['leads', 'okrObjectives'],
    severity: 'low' as const
  },
  {
    title: "Performance & HR",
    description: "KPI evaluations and employee records.",
    keys: ['kpiObjectives', 'employees'],
    severity: 'medium' as const
  },
  {
    title: "Tasks & Notifications",
    description: "Task lists and system notifications.",
    keys: ['tasks', 'notifications'],
    severity: 'low' as const
  },
  {
    title: "Fixed Assets",
    description: "Registered company assets and depreciation records.",
    keys: ['fixedAssets'],
    severity: 'medium' as const
  },
  {
    title: "MASTER DATA (WARNING)",
    description: "Client list, SKU/Products, and Vendor list.",
    keys: ['clients', 'products', 'vendors'],
    severity: 'critical' as const
  }
]

export default function MaintenancePage() {
  const resetSimulation = useAppStore(state => state.resetSimulation)
  const resetDb = useAppStore(state => state.resetDb)

  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isDoubleConfirmOpen, setIsDoubleConfirmOpen] = useState(false)
  const [resetInput, setResetInput] = useState("")
  const toggleCategory = (title: string) => {
    setSelectedCategories(prev => 
      prev.includes(title) 
        ? prev.filter(t => t !== title) 
        : [...prev, title]
    )
  }

  const handleStartReset = () => {
    if (selectedCategories.length === 0) {
      toast.error("Please select at least one category to reset.")
      return
    }
    setIsConfirmOpen(true)
  }

  const proceedToDoubleConfirm = () => {
    setIsConfirmOpen(false)
    setIsDoubleConfirmOpen(true)
  }

  const performReset = async () => {
    if (resetInput !== "RESET") {
      toast.error("Please type RESET exactly to continue.")
      return
    }

    try {
      const categoryMap: Record<string, string[]> = {
        "Transactional Data": ['sales_order_items', 'purchase_items', 'journal_lines', 'deliveries', 'invoices', 'sales_orders', 'purchases', 'journal_entries', 'stock_movements', 'rejected_items'],
        "Operational Expenses": ['expenses', 'reimbursements', 'cash_transactions'],
        "CRM & OKRs": ['leads', 'okr_objectives', 'okr_key_results'],
        "Performance & HR": ['kpis', 'employees'],
        "Tasks & Notifications": ['disma_tasks', 'notifications'],
        "Fixed Assets": ['fixed_assets'],
        "MASTER DATA (WARNING)": ['clients', 'products', 'vendors', 'client_prices']
      };

      const hasMasterData = selectedCategories.includes("MASTER DATA (WARNING)");
      const tablesToClear = selectedCategories.flatMap(cat => categoryMap[cat] || []);

      const res = await fetch('/api/db/reset', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ action: 'custom', tables: tablesToClear })
      });
      if (!res.ok) throw new Error('Reset failed');

      // Crucial: Clear local cache so it doesn't restore from localStorage on next init
      clearAllOperationalCaches();

      toast.success("Database has been reset successfully.")
      setIsDoubleConfirmOpen(false)
      setSelectedCategories([])
      setResetInput("")
      setTimeout(() => window.location.reload(), 1500)
    } catch {
      toast.error("An error occurred during reset.")
    }
  }

  // --- QUICK TOOLS ---
  const handleResetStock = async () => {
    if (!confirm("Reset SEMUA stok barang di katalog menjadi 0? Tindakan ini tidak bisa dibatalkan.")) return

    try {
      const res = await fetch('/api/db/reset', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ action: 'reset_stock' })
      });
      if (!res.ok) throw new Error('Reset failed');
      
      // Clear product cache so it fetches fresh stock: 0 from DB
      clearAllOperationalCaches();
      
      toast.success("Semua stok barang berhasil di-reset ke 0!")
      setTimeout(() => window.location.reload(), 1500)
    } catch {
      toast.error("Gagal melakukan reset stok.")
    }
  }

  const handleQuickWipeTransactions = async () => {
    if (!confirm("HAPUS SEMUA data transaksi (PO, Order, Invoice, Jurnal)? Katalog Produk & Client akan tetap aman.")) return
    await resetSimulation();
  }

  return (
    <div className="space-y-10 max-w-5xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            Database Maintenance <Database className="w-8 h-8 text-rose-500" />
          </h1>
          <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Global Data Control & Reset Center</p>
        </div>
        <div className="bg-rose-50 px-5 py-2.5 rounded-[1.5rem] border border-rose-100 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-500" />
          <span className="text-xs font-black text-rose-700 uppercase tracking-tighter">Super Admin Authorization Required</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
         <Card className="liquid-card border-none bg-emerald-900 text-white overflow-hidden group">
            <div className="p-8 relative">
               <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                     <RotateCcw className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                     <h3 className="text-lg font-black uppercase tracking-tight">Reset Semua Stok</h3>
                     <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest leading-none mt-1">Inventory Management</p>
                  </div>
               </div>
               <p className="text-xs text-white/60 mb-8 leading-relaxed">Nol-kan semua stok barang di Katalog Produk tanpa menghapus data produk itu sendiri.</p>
               <Button 
                 onClick={handleResetStock}
                 className="w-full h-12 bg-white text-emerald-900 hover:bg-emerald-50 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl"
               >
                 Reset Fisik Stok ke 0
               </Button>
            </div>
         </Card>

         <Card className="liquid-card border-none bg-slate-900 text-white overflow-hidden group">
            <div className="p-8 relative">
               <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                     <Trash2 className="w-6 h-6 text-rose-400" />
                  </div>
                  <div>
                     <h3 className="text-lg font-black uppercase tracking-tight">Wipe Transactions</h3>
                     <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest leading-none mt-1">Quick Data Reset</p>
                  </div>
               </div>
               <p className="text-xs text-white/60 mb-8 leading-relaxed">Hapus semua PO, Order, Invoice, dan Jurnal. Katalog Produk & Client tetep AMAN.</p>
               <Button 
                 onClick={handleQuickWipeTransactions}
                 className="w-full h-12 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl"
               >
                 Bersihkan Data Transaksi
               </Button>
            </div>
         </Card>
      </div>

      <Card className="liquid-card border-none bg-white shadow-xl overflow-hidden">
        <CardHeader className="p-8 border-b bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center">
              <RotateCcw className="w-6 h-6 text-rose-600" />
            </div>
            <div>
               <CardTitle className="text-xl font-black text-slate-900">Selective Data Reset</CardTitle>
               <CardDescription className="text-xs font-bold text-slate-400">Pilih kategori data yang ingin dihapus permanen dari sistem.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {DATA_CATEGORIES.map((cat) => (
              <div 
                key={cat.title} 
                className={cn(
                  "p-8 flex items-start justify-between transition-colors group cursor-pointer",
                  selectedCategories.includes(cat.title) ? "bg-rose-50/30" : "hover:bg-slate-50/50"
                )}
                onClick={() => toggleCategory(cat.title)}
              >
                <div className="flex gap-6">
                  <div className="mt-1">
                    <Checkbox 
                      checked={selectedCategories.includes(cat.title)} 
                      className="border-2 border-slate-300 data-[state=checked]:bg-rose-500 data-[state=checked]:border-rose-500 w-6 h-6 rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <h4 className={cn("font-black tracking-tight", 
                      cat.severity === 'critical' ? "text-rose-600" : "text-slate-900"
                    )}>
                      {cat.title}
                    </h4>
                    <p className="text-xs font-medium text-slate-500 max-w-md">{cat.description}</p>
                    <div className="flex gap-2 mt-3">
                      {cat.keys.slice(0, 4).map(k => (
                        <span key={k} className="text-[9px] font-black uppercase tracking-tighter bg-slate-100 text-slate-400 px-2 py-1 rounded-md">
                          {k}
                        </span>
                      ))}
                      {cat.keys.length > 4 && <span className="text-[9px] font-black italic text-slate-300">+{cat.keys.length - 4} more</span>}
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-2">
                   {cat.severity === 'critical' && (
                     <span className="text-[9px] font-black uppercase bg-rose-500 text-white px-3 py-1 rounded-full animate-pulse shadow-lg shadow-rose-500/20">Critical Data</span>
                   )}
                   {cat.severity === 'high' && (
                     <span className="text-[9px] font-black uppercase bg-orange-100 text-orange-600 px-3 py-1 rounded-full">High Impact</span>
                   )}
                </div>
              </div>
            ))}
          </div>

          <div className="p-10 bg-slate-900 flex flex-col md:flex-row items-center justify-between gap-8">
             <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-rose-500/20 rounded-[2rem] flex items-center justify-center border border-rose-500/30">
                  <AlertTriangle className="w-8 h-8 text-rose-500" />
                </div>
                <div>
                   <h3 className="text-2xl font-black text-white">Reset Selected Data</h3>
                   <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-1">
                     {selectedCategories.length} Categories Selected for Wipeout
                   </p>
                </div>
             </div>
             
             <Button 
               onClick={handleStartReset}
               disabled={selectedCategories.length === 0}
               className="bg-rose-600 hover:bg-rose-700 text-white font-black px-12 h-16 rounded-[2rem] shadow-2xl shadow-rose-500/20 transition-all flex items-center gap-3 active:scale-95 text-lg disabled:opacity-50"
             >
               <Trash2 className="w-6 h-6" /> Wipeout Data Now
             </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog 1 */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="liquid-card border-none bg-white p-10 max-w-xl">
          <DialogHeader className="items-center text-center space-y-4">
            <div className="w-20 h-20 bg-rose-100 rounded-[2.5rem] flex items-center justify-center mb-4">
              <AlertTriangle className="w-10 h-10 text-rose-600" />
            </div>
            <DialogTitle className="text-2xl font-black text-slate-900">Are you absolutely sure?</DialogTitle>
            <DialogDescription render={<div className="text-base font-bold text-slate-500" />}>
               This action will permanently delete all data in the selected categories. This cannot be undone.
               <div className="mt-6 bg-slate-50 p-4 rounded-2xl text-left font-normal">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Selected Categories:</p>
                  <ul className="grid grid-cols-2 gap-2">
                    {selectedCategories.map(cat => (
                      <li key={cat} className="text-xs font-black text-rose-600 flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3" /> {cat}
                      </li>
                    ))}
                  </ul>
               </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-4 mt-8">
            <Button variant="ghost" onClick={() => setIsConfirmOpen(false)} className="flex-1 h-14 rounded-2xl font-black text-slate-400 hover:bg-slate-50">
              Cancel
            </Button>
            <Button onClick={proceedToDoubleConfirm} className="flex-1 h-14 rounded-2xl font-black bg-rose-600 hover:bg-rose-700 text-white">
              Yes, I&apos;m Sure
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Double Confirmation Dialog 2 */}
      <Dialog open={isDoubleConfirmOpen} onOpenChange={setIsDoubleConfirmOpen}>
        <DialogContent className="liquid-card border-none bg-slate-900 text-white p-10 max-w-xl">
          <DialogHeader className="items-center text-center space-y-4">
             <div className="w-20 h-20 bg-white/10 rounded-[2.5rem] flex items-center justify-center border border-white/20 mb-4 animate-pulse">
                <ShieldAlert className="w-10 h-10 text-rose-500" />
             </div>
             <DialogTitle className="text-2xl font-black">Final Security Check</DialogTitle>
             <DialogDescription className="text-slate-400 font-bold">
                To confirm this high-stakes deletion, please type <span className="text-rose-500 font-black">RESET</span> below.
             </DialogDescription>
          </DialogHeader>
          
          <div className="mt-6 space-y-4">
            <Input 
              value={resetInput}
              onChange={(e) => setResetInput(e.target.value.toUpperCase())}
              placeholder="Type RESET here..."
              className="h-16 bg-white/10 border-white/20 rounded-2xl text-center text-xl font-black text-white focus-visible:ring-rose-500 placeholder:text-white/20"
            />
            
            <Button 
              onClick={performReset}
              disabled={resetInput !== "RESET"}
              className="w-full h-16 rounded-[2rem] font-black bg-rose-600 hover:bg-rose-700 text-white shadow-2xl shadow-rose-900/50 disabled:opacity-20"
            >
              PERMANENTLY WIPE DATABASE
            </Button>
            
            <p className="text-[10px] text-center text-slate-500 font-bold uppercase tracking-widest">
              Action will be logged and cannot be reversed.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
