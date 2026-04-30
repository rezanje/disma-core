"use client"

import { useState, useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { recordDepreciation } from "@/lib/accounting"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Plus, Truck, Monitor, Building, Wrench, 
  Trash2, Calculator, ArrowUpRight, TrendingDown, Package,
  History, ShieldAlert
} from "lucide-react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { 
  Dialog, DialogContent, DialogHeader, 
  DialogTitle, DialogTrigger 
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { 
  Select, SelectContent, SelectItem, 
  SelectTrigger, SelectValue 
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export default function FixedAssetsPage() {
  const fixedAssets = useAppStore(state => state.fixedAssets)
  const addFixedAsset = useAppStore(state => state.addFixedAsset)
  const updateFixedAsset = useAppStore(state => state.updateFixedAsset)
  const deleteFixedAsset = useAppStore(state => state.deleteFixedAsset)
  
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newAsset, setNewAsset] = useState({
    name: "",
    category: "Kendaraan" as const,
    purchaseDate: new Date().toISOString().split('T')[0],
    purchasePrice: 0,
    economicLifeMonths: 48, // 4 Years default
    salvageValue: 0
  })

  const handleAddAsset = () => {
    if (!newAsset.name || newAsset.purchasePrice <= 0) {
      toast.error("Data aset belum lengkap!")
      return
    }

    addFixedAsset({
      id: uuidv4(),
      ...newAsset,
      currentValue: newAsset.purchasePrice,
      accumulatedDepreciation: 0,
      status: 'Active'
    })
    
    setIsAddOpen(false)
    toast.success(`${newAsset.name} berhasil didaftarkan sebagai aset tetap.`)
  }

  // Calculate AUTO DEPRECIATION based on Today's Date
  const assetAnalytics = useMemo(() => {
    const today = new Date()
    return fixedAssets.map(asset => {
      const purchase = new Date(asset.purchaseDate)
      const monthsElapsed = (today.getFullYear() - purchase.getFullYear()) * 12 + (today.getMonth() - purchase.getMonth())
      const safeMonths = Math.max(0, Math.min(monthsElapsed, asset.economicLifeMonths))
      
      const monthlyDep = (asset.purchasePrice - asset.salvageValue) / asset.economicLifeMonths
      const autoAccumulated = monthlyDep * safeMonths
      const autoCurrentValue = Math.max(asset.salvageValue, asset.purchasePrice - autoAccumulated)
      
      return {
        ...asset,
        autoAccumulated,
        autoCurrentValue,
        monthsElapsed: safeMonths,
        isDepreciatedToDate: asset.accumulatedDepreciation >= autoAccumulated
      }
    })
  }, [fixedAssets])

  const handleSyncDepreciation = (id: string) => {
    const analytic = assetAnalytics.find(a => a.id === id)
    if (!analytic) return

    const gap = analytic.autoAccumulated - analytic.accumulatedDepreciation
    if (gap <= 0) {
      toast.info("Aset sudah tercatat penyusutannya sesuai tanggal hari ini.")
      return
    }

    const success = recordDepreciation(id, gap, `${analytic.name} (Sync to ${new Date().toLocaleDateString()})`)
    if (success) {
      updateFixedAsset(id, {
        accumulatedDepreciation: analytic.autoAccumulated,
        currentValue: analytic.autoCurrentValue
      })
      toast.success(`Jurnal penyusutan disingkronkan. Nilai terkini: Rp ${analytic.autoCurrentValue.toLocaleString()}`)
    }
  }

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Hapus data aset ${name}? Langkah ini tidak bisa dibatalkan.`)) {
      deleteFixedAsset(id)
      toast.success(`${name} telah dihapus dari inventaris.`)
    }
  }

  const getIcon = (category: string) => {
    switch (category) {
      case 'Kendaraan': return <Truck className="w-5 h-5" />
      case 'Elektronik': return <Monitor className="w-5 h-5" />
      case 'Bangunan': return <Building className="w-5 h-5" />
      default: return <Wrench className="w-5 h-5" />
    }
  }

  const totalAssetValue = fixedAssets.reduce((sum, a) => sum + a.purchasePrice, 0)
  const totalNetBookValue = assetAnalytics.reduce((sum, a) => sum + a.autoCurrentValue, 0)

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-500 pb-20">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Manajemen Aset Tetap</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Estimasi Nilai Aset Real-time (Berdasarkan Umur)</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={
            <Button className="h-12 bg-slate-900 hover:bg-black text-white px-6 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all active:scale-95">
              <Plus className="w-4 h-4 mr-2" /> Registrasi Aset Baru
            </Button>
          } />
          <DialogContent className="rounded-[2rem] p-8 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-black uppercase text-slate-800 tracking-tight mb-4 text-center">Detil Inventaris Aset</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Nama Aset</label>
                <Input 
                  placeholder="Misal: Mobil Box Colt L300" 
                  className="rounded-xl h-12"
                  value={newAsset.name}
                  onChange={e => setNewAsset({ ...newAsset, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Kategori</label>
                    <Select 
                      value={newAsset.category} 
                      onValueChange={(v: any) => {
                        let months = 48; // Default Kelompok 1 (Elektronik)
                        if (v === 'Kendaraan') months = 96; // Kelompok 2 (Mobil/Motor)
                        if (v === 'Bangunan') months = 240; // Kelompok 4 (Permanen)
                        if (v === 'Peralatan') months = 60; // Custom Kelompok 1.5
                        setNewAsset({...newAsset, category: v, economicLifeMonths: months})
                      }}
                    >
                      <SelectTrigger className="rounded-xl h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Kendaraan">Kendaraan (8 Thn)</SelectItem>
                        <SelectItem value="Elektronik">Elektronik (4 Thn)</SelectItem>
                        <SelectItem value="Peralatan">Peralatan (5 Thn)</SelectItem>
                        <SelectItem value="Bangunan">Bangunan (20 Thn)</SelectItem>
                      </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Tgl Pembelian</label>
                  <Input 
                    type="date"
                    className="rounded-xl h-12"
                    value={newAsset.purchaseDate}
                    onChange={e => setNewAsset({ ...newAsset, purchaseDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Harga Perolehan (IDR)</label>
                <Input 
                  type="number"
                  placeholder="0"
                  className="rounded-xl h-12 font-bold"
                  value={newAsset.purchasePrice || ''}
                  onChange={e => setNewAsset({ ...newAsset, purchasePrice: Number(e.target.value) })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Umur (Bulan)</label>
                  <Input 
                    type="number"
                    className="rounded-xl h-12"
                    value={newAsset.economicLifeMonths}
                    onChange={e => setNewAsset({ ...newAsset, economicLifeMonths: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Nilai Sisa</label>
                  <Input 
                    type="number"
                    className="rounded-xl h-12"
                    value={newAsset.salvageValue}
                    onChange={e => setNewAsset({ ...newAsset, salvageValue: Number(e.target.value) })}
                  />
                </div>
              </div>
              <Button onClick={handleAddAsset} className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest mt-4">
                Daftarkan Aset
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-white flex items-center gap-6">
          <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center">
            <TrendingDown className="w-8 h-8 text-slate-400" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Asset Cost</p>
            <h3 className="text-2xl font-black text-slate-800">Rp {totalAssetValue.toLocaleString()}</h3>
          </div>
        </Card>
        
        <Card className="p-6 rounded-[2rem] border-none shadow-xl shadow-emerald-100/50 bg-emerald-50/30 flex items-center gap-6">
          <div className="w-16 h-16 bg-emerald-100 rounded-3xl flex items-center justify-center">
            <ArrowUpRight className="w-8 h-8 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-emerald-600/60 tracking-widest">Est. Current Value</p>
            <h3 className="text-2xl font-black text-emerald-600">Rp {totalNetBookValue.toLocaleString()}</h3>
          </div>
        </Card>

        <Card className="p-6 rounded-[2rem] border-none shadow-xl shadow-rose-100/50 bg-white flex items-center gap-6">
          <div className="w-16 h-16 bg-rose-50 rounded-3xl flex items-center justify-center">
            <Calculator className="w-8 h-8 text-rose-500" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-rose-400 tracking-widest">Aset Berumur</p>
            <h3 className="text-2xl font-black text-slate-800">{fixedAssets.length} Unit</h3>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {assetAnalytics.length === 0 ? (
          <div className="col-span-2 py-20 bg-slate-100/50 rounded-[3rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center">
            <Package className="w-16 h-16 text-slate-300 mb-4" />
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em]">Belum ada inventaris aset tetap</p>
          </div>
        ) : (
          assetAnalytics.map(asset => {
             const progress = (asset.autoAccumulated / (asset.purchasePrice - asset.salvageValue)) * 100

             return (
               <Card key={asset.id} className="p-8 rounded-[2.5rem] border-none shadow-xl hover:shadow-2xl transition-all duration-300 bg-white group relative overflow-hidden">
                 {asset.isDepreciatedToDate && (
                    <div className="absolute top-0 right-0 bg-emerald-500 text-white px-6 py-1 pr-12 rounded-bl-full text-[8px] font-black uppercase tracking-widest rotate-45 translate-x-8 translate-y-2">Synced</div>
                 )}
                 
                 <div className="flex items-start justify-between mb-8">
                   <div className="flex items-center gap-5">
                     <div className="w-16 h-16 bg-slate-900 text-white rounded-3xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-all">
                       {getIcon(asset.category)}
                     </div>
                     <div>
                       <h3 className="font-black text-xl text-slate-800 tracking-tight leading-tight">{asset.name}</h3>
                       <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                          Beli: {new Date(asset.purchaseDate).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })} • Umur: {asset.monthsElapsed}/{asset.economicLifeMonths} bln
                       </p>
                     </div>
                   </div>
                   <div className="flex flex-col items-end gap-2">
                     <Badge variant="outline" className="text-[10px] font-black uppercase border-slate-100 text-slate-400">{asset.category}</Badge>
                   </div>
                 </div>

                 <div className="space-y-6 mb-10">
                   <div className="flex justify-between items-end">
                     <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Market Value (Today)</p>
                        <p className="text-3xl font-black text-emerald-600 tracking-tighter">Rp {asset.autoCurrentValue.toLocaleString()}</p>
                     </div>
                     <div className="text-right">
                        <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Total Penyusutan</p>
                        <p className="text-lg font-black text-slate-300 line-through tracking-tighter">Rp {asset.autoAccumulated.toLocaleString()}</p>
                     </div>
                   </div>
                   <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-1 shadow-inner">
                     <div 
                       className={cn(
                          "h-full rounded-full transition-all duration-1000",
                          progress > 80 ? "bg-rose-500" : "bg-emerald-500"
                        )}
                       style={{ width: `${Math.max(0, 100 - progress)}%` }}
                     />
                   </div>
                   <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-50">
                     <div className="flex flex-col gap-1">
                       <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Initial Investment</p>
                       <p className="font-black text-slate-800">Rp {asset.purchasePrice.toLocaleString()}</p>
                     </div>
                     <div className="flex flex-col gap-1 text-right">
                       <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Salvage Value</p>
                       <p className="font-black text-slate-400">Rp {asset.salvageValue.toLocaleString()}</p>
                     </div>
                   </div>
                 </div>

                 <div className="flex gap-4">
                    {!asset.isDepreciatedToDate && (
                       <Button 
                         onClick={() => handleSyncDepreciation(asset.id)}
                         className="flex-1 h-16 bg-slate-900 hover:bg-black text-white rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl transition-all flex items-center justify-center gap-3"
                       >
                         <Calculator className="w-5 h-5 text-emerald-400" />
                         Singkron Nilai Hari Ini
                       </Button>
                    )}
                    {asset.isDepreciatedToDate && (
                        <div className="flex-1 h-16 bg-emerald-50 text-emerald-600 rounded-[1.5rem] flex items-center justify-center gap-3 border border-emerald-100">
                           <ShieldAlert className="w-5 h-5" />
                           <span className="text-[10px] font-black uppercase tracking-widest">Data Sudah Sinkron</span>
                        </div>
                    )}
                    <Button 
                      onClick={() => handleDelete(asset.id, asset.name)}
                      variant="outline"
                      className="w-16 h-16 rounded-[1.5rem] border-slate-100 text-slate-300 hover:text-rose-500 hover:bg-rose-50 p-0 transition-all flex items-center justify-center"
                    >
                      <Trash2 className="w-6 h-6" />
                    </Button>
                 </div>
               </Card>
             )
          })
        )}
      </div>
    </div>
  )
}
