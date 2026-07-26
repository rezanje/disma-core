"use client"

import React, { useState, useMemo, useEffect } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah, parseNumber, formatNumber, getEffectiveBasePrice } from "@/lib/utils"
import { v4 as uuidv4 } from "uuid"
import { Product, ClientPriceTier, ClientPrice } from "@/types"
import { Search, Download, Calculator, Check, Plus, Trash2, ChevronsUpDown, FileText, Eye, Info } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { rescaleTiers } from "@/lib/tier-rescale"
import { generatePriceListPDF } from "@/lib/pdf"

const TIER_LABELS: Record<string, string> = {
  'Standard': 'Standard',
  'Tier 1': 'B2C (+30%)',
  'Tier 2': 'General (+25%)',
  'Tier 3': 'Cash (+20%)',
  'Tier 4': 'Bottom (+10%)',
  'Tier 5': 'Special Request (+15%)',
  'Custom': 'Custom Price'
}

export default function ClientPricesPage() {
  const clients = useAppStore(state => state.clients)
  const products = useAppStore(state => state.products)
  const clientPrices = useAppStore(state => state.clientPrices) || []
  
  const addClientPrice = useAppStore(state => state.addClientPrice)
  const updateClientPrice = useAppStore(state => state.updateClientPrice)
  const deleteClientPrice = useAppStore(state => state.deleteClientPrice)
  const deleteMultipleClientPrices = useAppStore(state => state.deleteMultipleClientPrices)
  const updateProduct = useAppStore(state => state.updateProduct)
  const currentUser = useAppStore(state => state.currentUser)
  const tierMargins = useAppStore(state => state.tierMargins)
  const priceBaseline = useAppStore(state => state.priceBaseline)

  const [selectedClientId, setSelectedClientId] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState("")
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false)
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50
  const [clientSearch, setClientSearch] = useState("")
  const [productAddSearch, setProductAddSearch] = useState("")

  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  
  // Period Selection
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().split('T')[0]
  })

  const activeClient = clients.find(c => c.id === selectedClientId)

  // Filter clients for dropdown
  const filteredClients = clients.filter(c => 
    c.companyName.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.picName.toLowerCase().includes(clientSearch.toLowerCase())
  ).slice(0, 50)

  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])

  useEffect(() => {
    setCurrentPage(1)
    setSelectedItemIds([])
  }, [selectedClientId, searchQuery])

  useEffect(() => {
    setSelectedItemIds([])
  }, [currentPage])

  // Only show products THAT ARE IN the price list for this client
  // Optimized indexing for fast lookups
  const existingIds = useMemo(() => {
    if (!selectedClientId) return new Set<string>()
    const set = new Set<string>()
    clientPrices.forEach(cp => {
      if (cp.clientId === selectedClientId) set.add(cp.productId)
    })
    return set
  }, [clientPrices, selectedClientId])

  const recordMap = useMemo(() => {
    if (!selectedClientId) return new Map<string, any>()
    const map = new Map<string, any>()
    clientPrices.forEach(cp => {
      if (cp.clientId === selectedClientId) map.set(cp.productId, cp)
    })
    return map
  }, [clientPrices, selectedClientId])

  const configuredProducts = useMemo(() => {
    if (!selectedClientId) return []
    const search = searchQuery.toLowerCase().trim()
    return products.filter(p => {
      if (!existingIds.has(p.id)) return false
      if (!search) return true
      return p.name.toLowerCase().includes(search) || p.skuCode.toLowerCase().includes(search)
    })
  }, [selectedClientId, existingIds, products, searchQuery])

  const totalPages = Math.ceil(configuredProducts.length / itemsPerPage)
  
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return configuredProducts.slice(start, start + itemsPerPage)
  }, [configuredProducts, currentPage, itemsPerPage])

  const availableToAdd = useMemo(() => {
    if (!selectedClientId) return []
    const search = productAddSearch.toLowerCase().trim()
    return products.filter(p => 
      !existingIds.has(p.id) &&
      (!search || p.name.toLowerCase().includes(search) || p.skuCode.toLowerCase().includes(search))
    ).slice(0, 50)
  }, [selectedClientId, existingIds, products, productAddSearch])

  // Grouped by Category for display (Only for items on CURRENT PAGE)
  const groupedProducts = useMemo(() => {
    const groups: Record<string, Product[]> = {}
    paginatedProducts.forEach(p => {
      const cat = p.category || "Tanpa Kategori"
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(p)
    })
    return Object.keys(groups).sort().reduce((acc, key) => {
      acc[key] = groups[key]
      return acc
    }, {} as Record<string, Product[]>)
  }, [paginatedProducts])

  // Get active price record for a product (Super fast Map lookup)
  const getRecord = (productId: string) => recordMap.get(productId)

  // Calculate dynamic price based on tier preference.
  // Base = weeklyPriceRange.min (current Thu-Wed window) if fresh, else master basePrice.
  // Keeps client pricelist anchored to lowest market HPP captured during reconciliation.
  const calculateEffectivePrice = (product: Product, record?: ClientPrice) => {
    const { price: basePrice, source: baseSource } = getEffectiveBasePrice(product)
    const activeTierMargins = tierMargins || { 'Tier 1': 30, 'Tier 2': 25, 'Tier 3': 20, 'Tier 4': 10, 'Tier 5': 15 }

    if (!record) {
      const defaultTier = activeClient?.defaultPriceTier
      if (defaultTier && defaultTier !== 'Standard') {
        const marginPct = activeTierMargins[defaultTier] || 0
        const price = (product[`tier${defaultTier.replace('Tier ', '')}Price` as keyof Product] as number) || Math.round(basePrice * (1 + marginPct / 100)) || product.sellingPrice
        const margin = price - basePrice
        const marginPctReal = (margin / (basePrice || 1)) * 100
        return { price, isCustom: false, margin, marginPct: marginPctReal, basePrice, baseSource }
      }

      const margin = product.sellingPrice - basePrice
      const marginPct = (margin / (basePrice || 1)) * 100
      return { price: product.sellingPrice, isCustom: false, margin, marginPct, basePrice, baseSource }
    }

    let price = product.sellingPrice
    if (record.tier === 'Custom') {
      price = record.agreedPrice
    } else {
      const marginPct = activeTierMargins[record.tier] || 0
      price = (product[`tier${record.tier.replace('Tier ', '')}Price` as keyof Product] as number) || Math.round(basePrice * (1 + marginPct / 100)) || product.sellingPrice
    }

    const margin = price - basePrice
    const marginPct = (margin / (basePrice || 1)) * 100

    return { price, isCustom: true, margin, marginPct, basePrice, baseSource }
  }

  const handleAddProduct = async (productId: string, initialTier: ClientPriceTier = 'Standard') => {
    const existing = clientPrices.find(cp => cp.clientId === selectedClientId && cp.productId === productId)
    if (existing) return

    await addClientPrice({
      id: uuidv4(),
      clientId: selectedClientId,
      productId,
      tier: initialTier,
      agreedPrice: 0,
      lastUpdated: new Date().toISOString(),
      updatedByUserId: currentUser?.id
    })
    setIsProductSearchOpen(false)
    setProductAddSearch("")
  }

  const handleBulkAddAll = async (tier: ClientPriceTier) => {
    if (!selectedClientId) return
    const existingIds = clientPrices
      .filter(cp => cp.clientId === selectedClientId)
      .map(cp => cp.productId)
    
    const toAdd = products.filter(p => !existingIds.includes(p.id))
    if (toAdd.length === 0) {
      toast.info("Semua barang sudah ada di daftar ini.")
      return
    }

    // Use setTimeout to allow the Popover to close before the browser modal appears
    // Chrome has a bug where confirm() closes immediately if the trigger element unmounts
    setTimeout(async () => {
      if (!confirm(`Tambahkan ${toAdd.length} barang ke list dengan tier ${TIER_LABELS[tier]}?`)) return

      toast.loading(`Sedang menambahkan ${toAdd.length} barang...`, { id: "bulk_op" })
      
      try {
        const chunkSize = 15
        for (let i = 0; i < toAdd.length; i += chunkSize) {
          const chunk = toAdd.slice(i, i + chunkSize)
          await Promise.all(chunk.map(p => addClientPrice({
            id: uuidv4(),
            clientId: selectedClientId,
            productId: p.id,
            tier: tier,
            agreedPrice: 0,
            lastUpdated: new Date().toISOString(),
            updatedByUserId: currentUser?.id
          })))
        }
        
        toast.success(`Berhasil menambahkan ${toAdd.length} barang!`, { id: "bulk_op" })
      } catch (err) {
        toast.error("Gagal melakukan aksi massal", { id: "bulk_op" })
      }
    }, 100)
  }

  const handleBulkSetTier = async (tier: ClientPriceTier) => {
    if (!selectedClientId) return
    const currentRecords = clientPrices.filter(cp => cp.clientId === selectedClientId)
    if (currentRecords.length === 0) return

    setTimeout(async () => {
      if (!confirm(`Ubah SEMUA (${currentRecords.length}) barang di list ini menjadi tier ${TIER_LABELS[tier]}?`)) return

      toast.loading(`Sedang mengupdate ${currentRecords.length} barang...`, { id: "bulk_op" })
      
      try {
        const chunkSize = 20
        for (let i = 0; i < currentRecords.length; i += chunkSize) {
          const chunk = currentRecords.slice(i, i + chunkSize)
          await Promise.all(chunk.map(record => updateClientPrice(record.id, {
            tier: tier,
            lastUpdated: new Date().toISOString(),
            updatedByUserId: currentUser?.id
          })))
        }
        
        toast.success("Update tier massal berhasil!", { id: "bulk_op" })
      } catch (err) {
        toast.error("Gagal melakukan update massal", { id: "bulk_op" })
      }
    }, 100)
  }

  const handleBulkDelete = async () => {
    if (!selectedClientId) return
    const currentRecords = clientPrices.filter(cp => cp.clientId === selectedClientId)
    if (currentRecords.length === 0) return

    setTimeout(async () => {
      if (!confirm(`Hapus SEMUA (${currentRecords.length}) barang dari list client ini? Tindakan ini tidak bisa dibatalkan.`)) return

      toast.loading(`Sedang menghapus ${currentRecords.length} barang...`, { id: "bulk_op" })
      
      try {
        const idsToDelete = currentRecords.map(r => r.id)
        await deleteMultipleClientPrices(idsToDelete)
        
        toast.success("Daftar harga client berhasil dikosongkan!", { id: "bulk_op" })
      } catch (err) {
        toast.error("Gagal menghapus massal", { id: "bulk_op" })
      }
    }, 100)
  }

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItemIds(paginatedProducts.map(p => p.id))
    } else {
      setSelectedItemIds([])
    }
  }

  const handleToggleSelectItem = (productId: string) => {
    setSelectedItemIds(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    )
  }

  const handleSelectedSetTier = async (tier: ClientPriceTier) => {
    if (!selectedClientId || selectedItemIds.length === 0) return
    const recordsToUpdate = clientPrices.filter(cp => cp.clientId === selectedClientId && selectedItemIds.includes(cp.productId))
    
    // For items that don't have override records yet, we need to create them
    const missingProductIds = selectedItemIds.filter(pid => !recordsToUpdate.some(r => r.productId === pid))

    setTimeout(async () => {
      if (!confirm(`Ubah ${selectedItemIds.length} barang terpilih menjadi tier ${TIER_LABELS[tier]}?`)) return

      toast.loading(`Sedang mengupdate ${selectedItemIds.length} barang...`, { id: "bulk_op" })
      
      try {
        // Update existing records
        if (recordsToUpdate.length > 0) {
          const chunkSize = 20
          for (let i = 0; i < recordsToUpdate.length; i += chunkSize) {
            const chunk = recordsToUpdate.slice(i, i + chunkSize)
            await Promise.all(chunk.map(record => updateClientPrice(record.id, {
              tier: tier,
              lastUpdated: new Date().toISOString(),
              updatedByUserId: currentUser?.id
            })))
          }
        }

        // Add missing records
        if (missingProductIds.length > 0) {
          const chunkSize = 15
          for (let i = 0; i < missingProductIds.length; i += chunkSize) {
            const chunk = missingProductIds.slice(i, i + chunkSize)
            await Promise.all(chunk.map(pid => addClientPrice({
              id: uuidv4(),
              clientId: selectedClientId,
              productId: pid,
              tier: tier,
              agreedPrice: 0,
              lastUpdated: new Date().toISOString(),
              updatedByUserId: currentUser?.id
            })))
          }
        }
        
        setSelectedItemIds([])
        toast.success("Update tier barang terpilih berhasil!", { id: "bulk_op" })
      } catch (err) {
        toast.error("Gagal melakukan update", { id: "bulk_op" })
      }
    }, 100)
  }

  const handleSelectedDelete = async () => {
    if (!selectedClientId || selectedItemIds.length === 0) return
    const recordsToDelete = clientPrices.filter(cp => cp.clientId === selectedClientId && selectedItemIds.includes(cp.productId))
    if (recordsToDelete.length === 0) {
      setSelectedItemIds([])
      toast.info("Barang terpilih tidak memiliki override harga khusus.")
      return
    }

    setTimeout(async () => {
      if (!confirm(`Hapus ${recordsToDelete.length} override harga khusus dari barang terpilih?`)) return

      toast.loading(`Sedang menghapus ${recordsToDelete.length} override...`, { id: "bulk_op" })
      
      try {
        const idsToDelete = recordsToDelete.map(r => r.id)
        await deleteMultipleClientPrices(idsToDelete)
        
        setSelectedItemIds([])
        toast.success("Berhasil menghapus override barang terpilih!", { id: "bulk_op" })
      } catch (err) {
        toast.error("Gagal menghapus override", { id: "bulk_op" })
      }
    }, 100)
  }

  /**
   * Publish-mingguan: snapshot `weeklyPriceRange.min` → `basePrice` for every product
   * that has a fresh weekly low. After this runs, every client pricelist is locked
   * to the lowest market HPP captured during the Thu-Wed window. Tier price overrides
   * are also cleared so future quotes recompute from the new master base.
   */
  const handlePublishWeeklyHPP = async () => {
    const candidates = products.filter(p => {
      const eff = getEffectiveBasePrice(p)
      return eff.source === 'weekly_low' && eff.price > 0 && eff.price !== p.basePrice
    })

    if (candidates.length === 0) {
      toast.info("Tidak ada HPP weekly low baru yang perlu disinkronkan.")
      return
    }

    setTimeout(async () => {
      if (!confirm(
        `Publish pricelist mingguan?\n\n` +
        `${candidates.length} barang akan di-update HPP master-nya ke harga terendah ` +
        `minggu berjalan. Semua pricelist client otomatis mengikuti.\n\n` +
        `Lanjutkan?`
      )) return

      toast.loading(`Sinkron HPP ${candidates.length} barang...`, { id: "publish_weekly" })

      try {
        const chunkSize = 15
        for (let i = 0; i < candidates.length; i += chunkSize) {
          const chunk = candidates.slice(i, i + chunkSize)
          await Promise.all(chunk.map(p => {
            const { price } = getEffectiveBasePrice(p)
            // Carry each product's own margin across the new base. The published
            // pricelist sets margins per item, so clearing the overrides here would
            // silently reprice every product whose margin is not the global default.
            // Slots that yield undefined fall back to the global margin, as before.
            const [t1, t2, t3, t4, t5] = rescaleTiers(p.basePrice, price, [
              p.tier1Price, p.tier2Price, p.tier3Price, p.tier4Price, p.tier5Price,
            ])
            return updateProduct(p.id, {
              basePrice: price,
              tier1Price: t1,
              tier2Price: t2,
              tier3Price: t3,
              tier4Price: t4,
              tier5Price: t5,
            })
          }))
        }
        toast.success(
          `${candidates.length} HPP master tersinkron. Pricelist client locked untuk minggu ini.`,
          { id: "publish_weekly" }
        )
      } catch (err) {
        console.error('[Publish Weekly HPP] failed:', err)
        toast.error("Gagal sinkron HPP mingguan", { id: "publish_weekly" })
      }
    }, 100)
  }

  const handleRemoveProduct = async (productId: string) => {
    const record = getRecord(productId)
    if (record) {
      await deleteClientPrice(record.id)
      toast.success("Produk dihapus dari daftar harga")
    }
  }

  const handleTierChange = async (productId: string, newTier: ClientPriceTier) => {
    const record = getRecord(productId)
    if (record) {
      await updateClientPrice(record.id, { 
        tier: newTier, 
        lastUpdated: new Date().toISOString(),
        updatedByUserId: currentUser?.id
      })
      toast.success("Tier berhasil diubah")
    }
  }

  const handleCustomPriceBlur = async (productId: string, val: string) => {
    const num = parseNumber(val)
    const record = getRecord(productId)
    if (!record) return // Shouldn't happen if they selected Custom first
    if (record.agreedPrice === num) return

    await updateClientPrice(record.id, {
      agreedPrice: num,
      lastUpdated: new Date().toISOString(),
      updatedByUserId: currentUser?.id
    })
    toast.success("Harga Custom tersimpan")
  }

  const handleBasePriceUpdate = async (productId: string, newVal: string) => {
    const num = parseNumber(newVal)
    const product = products.find(p => p.id === productId)
    if (!product || product.basePrice === num) return

    await updateProduct(productId, { basePrice: num })
    toast.success(`HPP ${product.name} berhasil di-update ke Master Data`)
  }

  const handlePreviewPdf = async () => {
    if (!activeClient) return
    toast.loading("Menyiapkan preview...", { id: "pdf-preview" })
    try {
      const doc = generatePriceListPDF(activeClient.id, 'blob', startDate, endDate) as any
      if (!doc) throw new Error("Gagal generate PDF")
      
      const blobUrl = doc.output('bloburl')
      setPdfPreviewUrl(blobUrl)
      setIsPreviewOpen(true)
      toast.success("Preview siap!", { id: "pdf-preview" })
    } catch(err) {
      console.error("PDF Preview Error:", err)
      toast.error("Gagal memuat preview", { id: "pdf-preview" })
    }
  }

  const exportPdf = () => {
    if (!activeClient) return
    generatePriceListPDF(activeClient.id, 'save', startDate, endDate)
    setIsPreviewOpen(false)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedClientId) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      const text = event.target?.result as string
      if (!text) return

      const lines = text.split('\n')
      // Skip header: SKU, Price
      let count = 0
      let errors = 0

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        
        const [sku, priceStr] = line.split(',')
        const product = products.find(p => p.skuCode.toLowerCase() === sku?.toLowerCase())
        const price = parseNumber(priceStr || "0")

        if (product) {
          const existing = clientPrices.find(cp => cp.clientId === selectedClientId && cp.productId === product.id)
          if (existing) {
             await updateClientPrice(existing.id, { tier: 'Custom', agreedPrice: price })
          } else {
             await addClientPrice({
               id: uuidv4(),
               clientId: selectedClientId,
               productId: product.id,
               tier: 'Custom',
               agreedPrice: price,
               lastUpdated: new Date().toISOString(),
               updatedByUserId: currentUser?.id
             })
          }
          count++
        } else {
          errors++
        }
      }

      toast.success(`Berhasil import ${count} item! ${errors > 0 ? `${errors} SKU tidak ditemukan.` : ""}`)
      // Clear input
      e.target.value = ""
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Client Price Lists</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Atur harga jual kustom berdasarkan masing-masing client dan download penawarannya.
          </p>
        </div>
        {priceBaseline && (
          <div className="w-full md:w-auto flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
            <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
              Data dasar: <span className="text-slate-800">{priceBaseline.label}</span>
              {" · "}{priceBaseline.productCount.toLocaleString('id-ID')} produk
              <br />
              Perubahan setelah ini mengikuti sistem.
            </p>
          </div>
        )}
        {activeClient && (
          <div className="flex gap-2">
            <div className="relative">
               <input 
                 type="file" 
                 accept=".csv" 
                 onChange={handleFileUpload} 
                 className="absolute inset-0 opacity-0 cursor-pointer"
                 id="csv-upload"
               />
               <Button variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">
                 Upload CSV (SKU, Price)
               </Button>
            </div>
            <Button onClick={handlePreviewPdf} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200">
              <Eye className="mr-2 h-4 w-4" /> Preview & Cetak
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
         <DialogContent className="sm:max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="p-4 border-b flex flex-row items-center justify-between">
               <div>
                 <DialogTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-emerald-600" />
                    Preview Price List: {activeClient?.companyName}
                 </DialogTitle>
                 <p className="text-xs text-slate-400 mt-0.5">Pastikan daftar item dan harga sudah sesuai sebelum di-download.</p>
               </div>
            </DialogHeader>
            <div className="flex-1 bg-slate-100 p-4 overflow-hidden">
               {pdfPreviewUrl ? (
                 <iframe 
                   src={pdfPreviewUrl} 
                   className="w-full h-full rounded-lg shadow-inner border border-slate-200 bg-white"
                   title="PDF Preview"
                 />
               ) : (
                 <div className="w-full h-full flex items-center justify-center text-slate-400 italic">
                    Memuat preview...
                 </div>
               )}
            </div>
            <DialogFooter className="p-4 border-t bg-white gap-3 sm:justify-between">
               <div className="text-[10px] text-slate-400 max-w-[200px] leading-tight flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  PDF Quote siap di-unduh dan dikirim ke Client.
               </div>
               <div className="flex gap-2">
                 <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>Batal</Button>
                 <Button onClick={exportPdf} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                   <Download className="mr-2 h-4 w-4" /> Download Sekarang
                 </Button>
               </div>
            </DialogFooter>
         </DialogContent>
      </Dialog>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col md:flex-row gap-6 items-end">
        <div className="grid gap-2 flex-1 w-full max-w-md">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Pilih Client</label>
          <Popover open={isClientSearchOpen} onOpenChange={setIsClientSearchOpen}>
            <PopoverTrigger render={
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={isClientSearchOpen}
                className="h-12 bg-slate-50 border-slate-200 text-base font-bold w-full justify-between"
              >
                <div className="flex items-center gap-2 truncate">
                  {activeClient ? (
                    <>
                      <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shrink-0">
                        {activeClient.companyName.charAt(0)}
                      </div>
                      <span className="truncate">{activeClient.companyName}</span>
                    </>
                  ) : (
                    <span className="text-slate-400 font-normal">-- Pilih Klien / Customer --</span>
                  )}
                </div>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            } />
            <PopoverContent className="w-[400px] p-0" align="start">
              <div className="flex items-center border-b px-3 h-12">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <input
                  placeholder="Cari PT atau Nama PIC..."
                  className="flex h-full w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto p-1">
                {filteredClients.length === 0 ? (
                  <div className="py-6 text-center text-sm text-slate-500">Klien tidak ditemukan.</div>
                ) : (
                  filteredClients.map((c) => (
                    <button
                      key={c.id}
                      className={cn(
                        "relative flex w-full cursor-default select-none items-center rounded-md py-3 pl-10 pr-3 text-sm outline-none hover:bg-slate-100 transition-colors",
                        selectedClientId === c.id && "bg-slate-100"
                      )}
                      onClick={() => {
                        setSelectedClientId(c.id)
                        setIsClientSearchOpen(false)
                        setClientSearch("")
                      }}
                    >
                      <span className="absolute left-3 flex h-4 w-4 items-center justify-center">
                        {selectedClientId === c.id && <Check className="h-4 w-4 text-emerald-600" />}
                      </span>
                      <div className="flex flex-col text-left">
                        <span className="font-bold text-slate-900">{c.companyName}</span>
                        <span className="text-[10px] text-slate-500 uppercase font-medium">{c.picName}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        
        {activeClient && (
          <div className="grid gap-2 flex-1 max-w-sm">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Cari di List</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-12 bg-slate-50"
              />
            </div>
          </div>
        )}
      </div>

      {!activeClient ? (
        <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center bg-slate-50">
          <Calculator className="w-16 h-16 text-slate-300 mb-4" />
          <h3 className="text-xl font-bold text-slate-700">Belum Ada Klien Terpilih</h3>
          <p className="text-slate-500 mt-2 max-w-md mx-auto">
            Pilih nama klien dari dropdown di atas untuk mulai mengatur harga khusus bagi mereka.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden border-slate-100">
          <div className="bg-slate-50/50 px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-black">
                {activeClient.companyName.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-black text-slate-800 leading-tight">{activeClient.companyName}</p>
                <p className="text-[10px] uppercase font-bold text-slate-400">Total: {configuredProducts.length} Items</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex flex-col gap-1 mr-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Periode Price List</span>
                <div className="flex items-center gap-2">
                  <Input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)} 
                    className="h-8 w-32 text-[10px] font-bold bg-white border-slate-200" 
                  />
                  <span className="text-[10px] font-bold text-slate-400">s/d</span>
                  <Input 
                    type="date" 
                    value={endDate} 
                    onChange={(e) => setEndDate(e.target.value)} 
                    className="h-8 w-32 text-[10px] font-bold bg-white border-slate-200" 
                  />
                </div>
              </div>

              <Popover>
                <PopoverTrigger render={
                  <Button variant="outline" size="sm" className={cn(
                    "h-9 font-bold transition-all",
                    selectedItemIds.length > 0 
                      ? "border-emerald-500 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 ring-2 ring-emerald-500/20"
                      : "border-amber-200 text-amber-700 bg-amber-50/50 hover:bg-amber-100"
                  )}>
                    <ChevronsUpDown className="mr-2 h-4 w-4" /> 
                    {selectedItemIds.length > 0 ? `Bulk Actions (${selectedItemIds.length})` : 'Bulk Actions'}
                  </Button>
                } />
                <PopoverContent className="w-64 p-3 bg-white shadow-xl border border-amber-100 rounded-xl" side="bottom" align="end">
                  <div className="space-y-3">
                    {selectedItemIds.length > 0 && (
                      <div className="pb-2 border-b border-emerald-50">
                        <h4 className="font-bold text-xs uppercase tracking-widest text-emerald-700">Aksi Terpilih ({selectedItemIds.length})</h4>
                        <p className="text-[10px] text-slate-400">Terapkan ke barang yang dicentang.</p>
                        <div className="grid grid-cols-1 gap-1 mt-2">
                          {Object.entries(TIER_LABELS).filter(([k]) => k !== 'Custom').map(([key, label]) => (
                            <Button 
                              key={`selected-set-${key}`}
                              variant="ghost" 
                              size="sm" 
                              className="h-7 text-[10px] justify-start px-2 hover:bg-emerald-50 hover:text-emerald-700 font-semibold"
                              onClick={() => handleSelectedSetTier(key as ClientPriceTier)}
                            >
                              Set Terpilih to {label}
                            </Button>
                          ))}
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-[10px] justify-start px-2 hover:bg-rose-50 hover:text-rose-700 font-bold border border-transparent hover:border-rose-100"
                            onClick={handleSelectedDelete}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Hapus Terpilih
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="pb-2 border-b border-amber-50">
                      <h4 className="font-bold text-xs uppercase tracking-widest text-slate-500">Massal Update Tier</h4>
                      <p className="text-[10px] text-slate-400">Terapkan tier ke semua barang di list ini.</p>
                      <div className="grid grid-cols-1 gap-1 mt-2">
                        {Object.entries(TIER_LABELS).filter(([k]) => k !== 'Custom' && k !== 'Standard').map(([key, label]) => (
                          <Button 
                            key={`bulk-set-${key}`}
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-[10px] justify-start px-2 hover:bg-amber-50 hover:text-amber-700 font-semibold"
                            onClick={() => handleBulkSetTier(key as ClientPriceTier)}
                          >
                            Set All to {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-widest text-slate-500">Input Massal (All SKU)</h4>
                      <p className="text-[10px] text-slate-400">Masukin SEMUA barang dari Master SKU.</p>
                      <div className="grid grid-cols-1 gap-1 mt-2">
                         {Object.entries(TIER_LABELS).filter(([k]) => k !== 'Custom' && k !== 'Standard').map(([key, label]) => (
                          <Button 
                            key={`bulk-add-${key}`}
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-[10px] justify-start px-2 hover:bg-emerald-50 hover:text-emerald-700 font-semibold border border-transparent hover:border-emerald-100"
                            onClick={() => handleBulkAddAll(key as ClientPriceTier)}
                          >
                            Add All as {label}
                          </Button>
                        ))}
                      </div>
                    <div className="pb-2 border-b border-emerald-50">
                      <h4 className="font-bold text-xs uppercase tracking-widest text-emerald-700">Publish Pricelist Mingguan</h4>
                      <p className="text-[10px] text-slate-400">Snapshot HPP terendah minggu ini ke Master. Semua pricelist client otomatis ikut.</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px] justify-start px-2 mt-2 w-full hover:bg-emerald-50 hover:text-emerald-700 font-bold border border-transparent hover:border-emerald-100"
                        onClick={handlePublishWeeklyHPP}
                      >
                        <Check className="mr-2 h-3 w-3" /> Sync HPP Weekly Low → Master
                      </Button>
                    </div>

                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-widest text-slate-500">Aksi Bahaya</h4>
                      <p className="text-[10px] text-slate-400">Gunakan dengan hati-hati.</p>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-[10px] justify-start px-2 mt-2 w-full hover:bg-rose-50 hover:text-rose-700 font-bold border border-transparent hover:border-rose-100"
                        onClick={handleBulkDelete}
                      >
                         <Trash2 className="mr-2 h-3 w-3" /> Kosongkan Daftar Ini
                      </Button>
                    </div>
                  </div>
                </div>
                </PopoverContent>
              </Popover>

              <Popover open={isProductSearchOpen} onOpenChange={setIsProductSearchOpen}>
                <PopoverTrigger render={
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 ring-offset-2">
                    <Plus className="mr-2 h-4 w-4" /> Tambah Barang
                  </Button>
                } />
              <PopoverContent className="w-[400px] p-0" align="end">
                <div className="flex items-center border-b px-3 h-12">
                  <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  <input
                    placeholder="Cari SKU atau Nama Barang..."
                    className="flex h-full w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                    value={productAddSearch}
                    onChange={(e) => setProductAddSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-[350px] overflow-y-auto p-1">
                  {availableToAdd.length === 0 ? (
                    <div className="py-6 text-center text-sm text-slate-500 italic">
                      {productAddSearch ? "Barang tidak ditemukan." : "Semua barang sudah masuk list."}
                    </div>
                  ) : (
                    availableToAdd.map((p) => (
                      <button
                        key={p.id}
                        className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-slate-50 transition-colors group"
                        onClick={() => handleAddProduct(p.id)}
                      >
                        <div className="flex flex-col items-start min-w-0">
                          <span className="font-bold text-slate-900 truncate w-full text-left">{p.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{p.skuCode} · {formatRupiah(p.sellingPrice)}</span>
                        </div>
                        <Plus className="h-4 w-4 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
            </div>
          </div>
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-[50px] text-center">
                  <input 
                    type="checkbox"
                    className="rounded border-slate-300 h-4 w-4 cursor-pointer accent-emerald-600"
                    checked={paginatedProducts.length > 0 && selectedItemIds.length === paginatedProducts.length}
                    onChange={(e) => handleToggleSelectAll(e.target.checked)}
                  />
                </TableHead>
                <TableHead className="w-[80px] uppercase text-[10px] font-bold tracking-wider">SKU</TableHead>
                <TableHead className="uppercase text-[10px] font-bold tracking-wider min-w-[150px]">Nama Produk</TableHead>
                <TableHead className="text-right uppercase text-[10px] font-bold tracking-wider">HPP (Modal)</TableHead>
                <TableHead className="uppercase text-[10px] font-bold tracking-wider text-center bg-emerald-50 text-emerald-700 border-l border-r border-emerald-100">Pricing Tier</TableHead>
                <TableHead className="text-right uppercase text-[10px] font-bold tracking-wider">Harga Penawaran</TableHead>
                <TableHead className="text-right uppercase text-[10px] font-bold tracking-wider w-[120px]">Est Margin</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configuredProducts.length === 0 ? (
                 <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-slate-400 italic font-medium">
                       Belum ada barang di daftar harga client ini.<br/>
                       Klik tombol "Tambah Barang" untuk memulai.
                    </TableCell>
                 </TableRow>
              ) : (
                Object.entries(groupedProducts).map(([category, items]) => (
                  <React.Fragment key={`cat-group-${category}`}>
                    <TableRow key={`cat-header-${category}`} className="bg-slate-50 border-y border-slate-200">
                      <TableCell colSpan={8} className="py-2.5 px-4 font-black text-[12px] uppercase tracking-wider text-slate-600">
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-1 bg-emerald-500 rounded-full" />
                          KATEGORI: {category} ({items.length} items)
                        </div>
                      </TableCell>
                    </TableRow>
                    {items.map((p) => {
                      const record = getRecord(p.id)
                      const { price, isCustom, margin, marginPct, basePrice: effectiveBase, baseSource } = calculateEffectivePrice(p, record)
                      return (
                        <TableRow key={p.id} className={cn(isCustom ? "bg-emerald-50/20" : "", selectedItemIds.includes(p.id) ? "bg-slate-100/50" : "")}>
                          <TableCell className="text-center w-[50px] py-2 px-3">
                            <input 
                              type="checkbox"
                              className="rounded border-slate-300 h-4 w-4 cursor-pointer accent-emerald-600"
                              checked={selectedItemIds.includes(p.id)}
                              onChange={() => handleToggleSelectItem(p.id)}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-[10px] font-bold text-slate-500">
                        <Popover>
                          <PopoverTrigger render={
                            <button className="hover:text-emerald-600 hover:underline transition-all">
                              {p.skuCode}
                            </button>
                          } />
                          <PopoverContent className="w-64 p-4 shadow-xl border-slate-200">
                             <div className="space-y-3">
                               <div className="space-y-1">
                                 <h4 className="text-xs font-black uppercase text-slate-400">Update Master Data</h4>
                                 <p className="text-[10px] text-slate-500 font-medium">Ubah harga beli dasar (HPP) barang ini secara global.</p>
                               </div>
                               <div className="grid gap-2">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">HPP Modal Baru (Rp)</label>
                                  <Input 
                                    key={`baseprice-${p.id}-${p.basePrice}`}
                                    defaultValue={formatNumber(p.basePrice)}
                                    onBlur={(e) => handleBasePriceUpdate(p.id, e.target.value)}
                                    className="h-9 text-xs font-mono font-bold"
                                  />
                               </div>
                               <p className="text-[9px] italic text-slate-400">Input otomatis tersimpan saat kursor keluar (blur).</p>
                             </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell className="font-medium text-xs text-slate-800">
                         <Popover>
                            <PopoverTrigger render={
                              <button className="text-left hover:text-emerald-600 transition-all">
                                {p.name}
                              </button>
                            } />
                            <PopoverContent className="w-64 p-4 shadow-xl border-slate-200">
                               <div className="space-y-3">
                                 <div className="space-y-1">
                                   <h4 className="text-xs font-black uppercase text-slate-400">Produk Detil</h4>
                                   <p className="text-sm font-bold text-slate-800">{p.name}</p>
                                   <p className="text-[10px] text-slate-400 font-mono italic">{p.skuCode}</p>
                                 </div>
                                 <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[10px] font-bold">
                                    <span className="text-slate-400">MASTER HPP:</span>
                                    <span className="text-slate-700">{formatRupiah(p.basePrice)}</span>
                                 </div>
                               </div>
                            </PopoverContent>
                         </Popover>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-500">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={baseSource === 'weekly_low' ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                            {formatRupiah(effectiveBase)}
                          </span>
                          <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                            baseSource === 'weekly_low'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {baseSource === 'weekly_low' ? 'Weekly Low' : 'Master'}
                          </span>
                          {baseSource === 'weekly_low' && p.basePrice !== effectiveBase && (
                            <span className="text-[8px] font-medium text-slate-400 italic">
                              Master: {formatRupiah(p.basePrice)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="bg-emerald-50/30 border-l border-r border-emerald-50">
                         <Select 
                            value={record?.tier || "Standard"} 
                            onValueChange={(val) => handleTierChange(p.id, val as ClientPriceTier)}
                         >
                           <SelectTrigger className="h-8 text-[11px] font-bold mx-auto w-[130px] border-slate-200">
                             {TIER_LABELS[record?.tier || "Standard"]}
                           </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Standard" className="text-slate-500 font-medium">Standard (Default)</SelectItem>
                            <SelectItem value="Tier 1" className="font-bold">B2C (+30%)</SelectItem>
                            <SelectItem value="Tier 2" className="font-bold">General (+25%)</SelectItem>
                            <SelectItem value="Tier 3" className="font-bold">Cash (+20%)</SelectItem>
                            <SelectItem value="Tier 4" className="font-bold">Bottom (+10%)</SelectItem>
                            <SelectItem value="Tier 5" className="font-bold text-emerald-600">Special Request (+15%)</SelectItem>
                            <SelectItem value="Custom" className="text-rose-600 font-bold">Custom Price</SelectItem>
                          </SelectContent>
                         </Select>
                      </TableCell>
                      <TableCell className="text-right">
                         {record?.tier === 'Custom' ? (
                            <div className="relative inline-block w-32">
                               <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">Rp</span>
                               <Input 
                                 key={`agreedprice-${p.id}-${record.agreedPrice || record.agreed_price}`}
                                 defaultValue={formatNumber(record.agreed_price || record.agreedPrice)} // Handle snake_case from DB if needed
                                 onBlur={(e) => handleCustomPriceBlur(p.id, e.target.value)}
                                 className="h-8 text-xs font-mono font-bold text-right pl-8 border-rose-200 focus-visible:ring-rose-500 bg-white shadow-inner"
                               />
                            </div>
                         ) : (
                            <span className={`font-mono text-sm font-black ${isCustom ? 'text-emerald-600' : 'text-slate-700'}`}>
                              {formatRupiah(price)}
                              {isCustom && <Check className="w-3 h-3 inline ml-1 text-emerald-500" />}
                            </span>
                         )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className={`text-[11px] font-bold font-mono ${margin < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                            {margin > 0 ? '+' : ''}{formatRupiah(margin)}
                          </span>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm mt-0.5 ${
                            marginPct < 10 && marginPct >= 0 ? 'bg-amber-100 text-amber-700' : 
                            marginPct < 0 ? 'bg-rose-100 text-rose-700' : 
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {marginPct.toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                         <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-slate-300 hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => handleRemoveProduct(p.id)}
                          >
                           <Trash2 className="h-4 w-4" />
                         </Button>
                      </TableCell>
                        </TableRow>
                      )
                    })}
                  </React.Fragment>
                ))
              )}
            </TableBody>
            </Table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="bg-slate-50 border-t border-slate-100 p-4 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">
                  Halaman {currentPage} dari {totalPages} ({configuredProducts.length} items)
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={currentPage === 1}
                    onClick={() => {
                        setCurrentPage(p => Math.max(1, p - 1))
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    className="h-8 font-bold border-slate-300 text-slate-600 bg-white hover:bg-slate-100 transition-colors"
                  >
                    Sebelumnya
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={currentPage === totalPages}
                    onClick={() => {
                        setCurrentPage(p => Math.min(totalPages, p + 1))
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    className="h-8 font-bold border-slate-300 text-slate-600 bg-white hover:bg-slate-100 transition-colors"
                  >
                    Selanjutnya
                  </Button>
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  )
}
