"use client"

import { useState, useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { Plus, Pencil, History, Check, X, Copy } from "lucide-react"
import { v4 as uuidv4 } from "uuid"
import GlobalUndoButton from "@/components/global-undo-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { format, parseISO, differenceInDays, isAfter, addDays } from "date-fns"
import { id as localeId } from "date-fns/locale"
import { formatRupiah } from "@/lib/utils"
import { Vendor, VendorBill, VendorPrice } from "@/types"

export default function VendorsPage() {
  const vendors = useAppStore(state => state.vendors)
  const vendorBills = useAppStore(state => state.vendorBills)
  const products = useAppStore(state => state.products)
  const addVendor = useAppStore(state => state.addVendor)
  const updateVendor = useAppStore(state => state.updateVendor)
  const vendorPrices = useAppStore(state => state.vendorPrices)
  const addVendorPrice = useAppStore(state => state.addVendorPrice)
  const updateVendorPrice = useAppStore(state => state.updateVendorPrice)

  const [copiedLink, setCopiedLink] = useState(false)
  const [isAddPriceOpen, setIsAddPriceOpen] = useState(false)
  const [priceForm, setPriceForm] = useState({
    productId: '',
    proposedName: '',
    price: 0,
    uom: '',
    validFrom: format(new Date(), 'yyyy-MM-dd'),
    validTo: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
    notes: '',
  })
  const [priceProductSearch, setPriceProductSearch] = useState('')

  const [isOpen, setIsOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [detailVendor, setDetailVendor] = useState<Vendor | null>(null)

  // Hutang & jatuh tempo per vendor, derived from vendorBills (AP ledger)
  const billsByVendor = useMemo(() => {
    const map = new Map<string, VendorBill[]>()
    for (const b of vendorBills) {
      if (!map.has(b.vendorId)) map.set(b.vendorId, [])
      map.get(b.vendorId)!.push(b)
    }
    return map
  }, [vendorBills])

  const vendorStats = useMemo(() => {
    const today = new Date()
    const m = new Map<string, {
      outstanding: number
      nearestDue: string | null
      nearestAging: number | null
      unpaidCount: number
      totalBills: number
      everSpent: number
    }>()
    for (const v of vendors) {
      const bills = billsByVendor.get(v.id) || []
      let outstanding = 0, unpaidCount = 0, everSpent = 0
      let nearestDue: string | null = null
      for (const b of bills) {
        everSpent += b.totalAmount
        if (b.status === 'Paid' || b.status === 'Cancelled') continue
        const out = b.totalAmount - (b.amountPaid || 0)
        if (out <= 0) continue
        outstanding += out
        unpaidCount++
        if (!nearestDue || b.dueDate < nearestDue) nearestDue = b.dueDate
      }
      const nearestAging = nearestDue ? differenceInDays(today, parseISO(nearestDue)) : null
      m.set(v.id, { outstanding, nearestDue, nearestAging, unpaidCount, totalBills: bills.length, everSpent })
    }
    return m
  }, [vendors, billsByVendor])

  const detailBills = useMemo(() => {
    if (!detailVendor) return []
    const bills = billsByVendor.get(detailVendor.id) || []
    return [...bills].sort((a, b) => parseISO(b.issueDate).getTime() - parseISO(a.issueDate).getTime())
  }, [detailVendor, billsByVendor])

  const detailStats = detailVendor ? vendorStats.get(detailVendor.id) : undefined

  // Products whose default ("langganan") vendor is this one — what they supply.
  const suppliedProducts = useMemo(() => {
    if (!detailVendor) return []
    return products
      .filter(p => p.defaultVendorId === detailVendor.id)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [detailVendor, products])

  const detailVendorPrices = useMemo(() => {
    if (!detailVendor) return []
    return vendorPrices
      .filter(vp => vp.vendorId === detailVendor.id)
      .sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated))
  }, [detailVendor, vendorPrices])

  const pendingPricesCount = useMemo(
    () => detailVendorPrices.filter(vp => vp.status === 'pending').length,
    [detailVendorPrices]
  )

  const handleCopyLink = () => {
    const link = `${window.location.origin}/supply/${detailVendor?.id}`
    navigator.clipboard.writeText(link)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
    toast.success('Link portal disalin!')
  }

  const handleApprovePrice = async (vp: VendorPrice, applyToProduct: boolean) => {
    const vendorName = detailVendor?.companyName ?? ''
    await updateVendorPrice(vp.id, { status: 'active', lastUpdated: new Date().toISOString() })
    if (applyToProduct && vp.productId) {
      const productsState = useAppStore.getState().products
      const updateProduct = useAppStore.getState().updateProduct
      const product = productsState.find(p => p.id === vp.productId)
      if (product) {
        const priceHistory = [...(product.priceHistory || []), {
          date: new Date().toISOString(),
          price: vp.price,
          source: `vendor:${vendorName}`
        }]
        await updateProduct(vp.productId, { basePrice: vp.price, priceHistory })
        toast.success(`Harga ${product.name} diupdate ke ${formatRupiah(vp.price)}`)
      }
    } else {
      toast.success('Harga vendor disetujui')
    }
  }

  const handleRejectPrice = async (vpId: string) => {
    await updateVendorPrice(vpId, { status: 'rejected', lastUpdated: new Date().toISOString() })
    toast.success('Penawaran harga ditolak')
  }

  const handleAddAdminPrice = async () => {
    if (!detailVendor || !priceForm.price || (!priceForm.productId && !priceForm.proposedName)) {
      toast.error('Pilih produk dan isi harga')
      return
    }
    const selectedProduct = products.find(p => p.id === priceForm.productId)
    await addVendorPrice({
      id: uuidv4(),
      vendorId: detailVendor.id,
      productId: priceForm.productId || undefined,
      proposedName: priceForm.productId ? undefined : priceForm.proposedName,
      price: priceForm.price,
      uom: priceForm.uom || selectedProduct?.uom || '',
      validFrom: priceForm.validFrom,
      validTo: priceForm.validTo,
      status: 'active',
      source: 'admin',
      notes: priceForm.notes || undefined,
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })
    setIsAddPriceOpen(false)
    setPriceForm({
      productId: '', proposedName: '', price: 0, uom: '',
      validFrom: format(new Date(), 'yyyy-MM-dd'),
      validTo: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      notes: '',
    })
    setPriceProductSearch('')
    toast.success('Harga vendor ditambahkan')
  }

  const [formData, setFormData] = useState({
    companyName: "",
    picName: "",
    email: "",
    phone: "",
    address: "",
    isTempo: true,
    paymentTermDays: 14
  })

  const resetForm = () => {
    setFormData({
      companyName: "",
      picName: "",
      email: "",
      phone: "",
      address: "",
      isTempo: true,
      paymentTermDays: 14
    })
    setEditingVendor(null)
  }

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor)
    setFormData({
      companyName: vendor.companyName,
      picName: vendor.picName,
      email: vendor.email,
      phone: vendor.phone,
      address: vendor.address,
      isTempo: vendor.isTempo !== false,
      paymentTermDays: vendor.paymentTermDays ?? 14
    })
    setIsOpen(true)
  }

  const handleSave = () => {
    if (!formData.companyName || !formData.picName) {
      toast.error("Company name and PIC are required")
      return
    }

    const payload = {
      ...formData,
      paymentTermDays: formData.isTempo ? formData.paymentTermDays : 0
    }

    if (editingVendor) {
      updateVendor(editingVendor.id, payload)
      toast.success("Vendor updated successfully")
    } else {
      addVendor({
        id: uuidv4(),
        ...payload,
        createdAt: new Date().toISOString()
      })
      toast.success("Vendor added successfully")
    }
    
    setIsOpen(false)
    resetForm()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Vendor Master</h2>
          <p className="text-muted-foreground">Manage your suppliers and sourcing partners.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <GlobalUndoButton inline />
          <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open)
            if (!open) resetForm()
          }}>
            <DialogTrigger render={
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Add Vendor
              </Button>
            } />
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{editingVendor ? "Edit Vendor" : "Add New Vendor"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input 
                    id="companyName" 
                    value={formData.companyName}
                    onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                    placeholder="Supplier Sayur Maju" 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="picName">PIC Name</Label>
                  <Input 
                    id="picName" 
                    value={formData.picName}
                    onChange={(e) => setFormData({...formData, picName: e.target.value})}
                    placeholder="Pak Budi" 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="budi@supplier.com" 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input 
                    id="phone" 
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="0812345678" 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address">Address</Label>
                  <Input 
                    id="address" 
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    placeholder="Pasar Induk Kramat Jati" 
                  />
                </div>
                
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox 
                    id="isTempo" 
                    checked={formData.isTempo} 
                    onCheckedChange={(checked) => setFormData({...formData, isTempo: !!checked})}
                  />
                  <Label htmlFor="isTempo" className="cursor-pointer">Pembayaran Tempo</Label>
                </div>

                {formData.isTempo && (
                  <div className="grid gap-2">
                    <Label htmlFor="paymentTermDays">Jatuh Tempo (Hari)</Label>
                    <Input 
                      id="paymentTermDays" 
                      type="number"
                      value={formData.paymentTermDays}
                      onChange={(e) => setFormData({...formData, paymentTermDays: parseInt(e.target.value) || 0})}
                      placeholder="14" 
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button onClick={handleSave}>Save Vendor</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-md border bg-white dark:bg-slate-950">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor Company</TableHead>
              <TableHead>PIC</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Metode Pembayaran</TableHead>
              <TableHead className="text-right">Hutang</TableHead>
              <TableHead>Jatuh Tempo</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No vendors found.
                </TableCell>
              </TableRow>
            ) : (
              vendors.map((v) => {
                const stats = vendorStats.get(v.id)
                const outstanding = stats?.outstanding ?? 0
                const aging = stats?.nearestAging
                return (
                <TableRow
                  key={v.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setDetailVendor(v)}
                >
                  <TableCell className="font-medium">{v.companyName}</TableCell>
                  <TableCell>{v.picName}</TableCell>
                  <TableCell>{v.phone}</TableCell>
                  <TableCell className="text-sm font-semibold">
                    {v.isTempo ? (
                      <span className="text-blue-600">Tempo ({v.paymentTermDays || 14} hari)</span>
                    ) : (
                      <span className="text-emerald-600">Cash Langsung</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {outstanding > 0 ? (
                      <span className="text-purple-700">{formatRupiah(outstanding)}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {stats?.nearestDue ? (
                      <div>
                        <div className="font-medium">
                          {format(parseISO(stats.nearestDue), 'd MMM yy', { locale: localeId })}
                        </div>
                        {aging != null && (
                          aging > 0 ? (
                            <div className="text-[10px] font-black text-rose-500">+{aging}h lewat</div>
                          ) : (
                            <div className="text-[10px] font-bold text-emerald-600">sisa {Math.abs(aging)}h</div>
                          )
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setDetailVendor(v)} title="Riwayat belanja">
                        <History className="h-4 w-4 text-slate-500" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(v)} title="Edit vendor">
                        <Pencil className="h-4 w-4 text-slate-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )})
            )}
          </TableBody>
        </Table>
      </div>

      {/* VENDOR DETAIL / HISTORY DIALOG */}
      <Dialog open={!!detailVendor} onOpenChange={(open) => { if (!open) setDetailVendor(null) }}>
        <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailVendor?.companyName}</DialogTitle>
            <DialogDescription>
              Riwayat belanja & hutang ke vendor ini.
            </DialogDescription>
          </DialogHeader>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 py-2">
            <div className="rounded-xl border bg-purple-50 border-purple-100 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-purple-700">Total Hutang</p>
              <p className="text-lg font-black text-purple-700">{formatRupiah(detailStats?.outstanding ?? 0)}</p>
            </div>
            <div className="rounded-xl border bg-rose-50 border-rose-100 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">Tagihan Belum Lunas</p>
              <p className="text-lg font-black text-rose-700">{detailStats?.unpaidCount ?? 0}</p>
            </div>
            <div className="rounded-xl border bg-slate-50 border-slate-200 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Total Pernah Belanja</p>
              <p className="text-lg font-black text-slate-700">{formatRupiah(detailStats?.everSpent ?? 0)}</p>
            </div>
          </div>

          {/* Vendor Price Catalog */}
          <div className="rounded-md border">
            <div className="flex items-center justify-between px-3 py-2 bg-emerald-50/60 border-b">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                  Katalog Harga ({detailVendorPrices.length})
                </p>
                {pendingPricesCount > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-black">
                    {pendingPricesCount} pending
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] font-black gap-1"
                  onClick={handleCopyLink}
                >
                  {copiedLink ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedLink ? 'Tersalin!' : 'Link Portal'}
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-[10px] font-black gap-1"
                  onClick={() => setIsAddPriceOpen(true)}
                >
                  <Plus className="h-3 w-3" /> Tambah Harga
                </Button>
              </div>
            </div>
            {detailVendorPrices.length === 0 ? (
              <p className="h-16 flex items-center justify-center text-xs text-muted-foreground italic">
                Belum ada katalog harga. Bagikan link portal ke vendor atau tambah manual.
              </p>
            ) : (
              <div className="max-h-[240px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-[9px] uppercase font-black">Produk</TableHead>
                      <TableHead className="text-[9px] uppercase font-black text-right">Harga Beli</TableHead>
                      <TableHead className="text-[9px] uppercase font-black">Berlaku s/d</TableHead>
                      <TableHead className="text-[9px] uppercase font-black">Update</TableHead>
                      <TableHead className="text-[9px] uppercase font-black text-center">Status</TableHead>
                      <TableHead className="text-[9px] uppercase font-black w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailVendorPrices.map(vp => {
                      const product = products.find(p => p.id === vp.productId)
                      const productName = product?.name ?? vp.proposedName ?? '—'
                      const isExpiredEntry = vp.status === 'active' && isAfter(new Date(), parseISO(vp.validTo))
                      const displayStatus = isExpiredEntry ? 'expired' : vp.status
                      return (
                        <TableRow key={vp.id}>
                          <TableCell className="text-xs font-bold">
                            {productName}
                            {!vp.productId && (
                              <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-600 font-black">request</span>
                            )}
                            <div className="text-[9px] text-slate-400">{vp.uom}</div>
                          </TableCell>
                          <TableCell className="text-right text-xs font-black text-emerald-700">
                            {formatRupiah(vp.price)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {format(parseISO(vp.validTo), 'd MMM yy', { locale: localeId })}
                          </TableCell>
                          <TableCell className="text-[10px] text-slate-400">
                            {format(parseISO(vp.lastUpdated), 'd MMM yy', { locale: localeId })}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-black ${
                              displayStatus === 'active' ? 'bg-emerald-100 text-emerald-700' :
                              displayStatus === 'pending' ? 'bg-amber-100 text-amber-700' :
                              displayStatus === 'expired' ? 'bg-slate-100 text-slate-500' :
                              'bg-rose-100 text-rose-700'
                            }`}>
                              {displayStatus}
                            </span>
                          </TableCell>
                          <TableCell>
                            {vp.status === 'pending' && (
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-emerald-600 hover:bg-emerald-50"
                                  title="Approve & apply ke base price"
                                  onClick={() => handleApprovePrice(vp, !!vp.productId)}
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-rose-500 hover:bg-rose-50"
                                  title="Tolak"
                                  onClick={() => handleRejectPrice(vp.id)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Bill history */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-[10px] uppercase font-black">No. Tagihan</TableHead>
                  <TableHead className="text-[10px] uppercase font-black">Tgl Tagihan</TableHead>
                  <TableHead className="text-[10px] uppercase font-black">Jatuh Tempo</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-right">Total</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-right">Terbayar</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-right">Sisa</TableHead>
                  <TableHead className="text-[10px] uppercase font-black text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailBills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-20 text-center text-sm text-muted-foreground italic">
                      Belum ada riwayat belanja ke vendor ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  detailBills.map((b) => {
                    const outstanding = b.totalAmount - (b.amountPaid || 0)
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-xs font-bold">{b.billNumber}</TableCell>
                        <TableCell className="text-xs">{format(parseISO(b.issueDate), 'd MMM yy', { locale: localeId })}</TableCell>
                        <TableCell className="text-xs">{format(parseISO(b.dueDate), 'd MMM yy', { locale: localeId })}</TableCell>
                        <TableCell className="text-right text-xs font-medium">{formatRupiah(b.totalAmount)}</TableCell>
                        <TableCell className="text-right text-xs text-slate-500">{formatRupiah(b.amountPaid || 0)}</TableCell>
                        <TableCell className="text-right text-xs font-black text-purple-700">{formatRupiah(outstanding > 0 ? outstanding : 0)}</TableCell>
                        <TableCell className="text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-lg font-black ${
                            b.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                            b.status === 'PartialPaid' ? 'bg-yellow-100 text-yellow-700' :
                            b.status === 'Cancelled' ? 'bg-slate-100 text-slate-500' :
                            'bg-rose-100 text-rose-700'
                          }`}>
                            {b.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add admin price dialog */}
      <Dialog open={isAddPriceOpen} onOpenChange={setIsAddPriceOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Tambah Harga Vendor Manual</DialogTitle>
            <DialogDescription>{detailVendor?.companyName}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>Produk</Label>
              <Input
                placeholder="Cari nama produk..."
                value={priceProductSearch}
                onChange={e => {
                  setPriceProductSearch(e.target.value)
                  setPriceForm(f => ({ ...f, productId: '', proposedName: e.target.value }))
                }}
              />
              {priceProductSearch && (
                <div className="border rounded-md max-h-32 overflow-y-auto divide-y bg-white shadow">
                  {products
                    .filter(p => p.name.toLowerCase().includes(priceProductSearch.toLowerCase()))
                    .slice(0, 6)
                    .map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50"
                        onMouseDown={e => {
                          e.preventDefault()
                          setPriceForm(f => ({ ...f, productId: p.id, uom: p.uom }))
                          setPriceProductSearch(p.name)
                        }}
                      >
                        <span className="font-bold">{p.name}</span>
                        <span className="text-slate-400 ml-1">({p.uom})</span>
                      </button>
                    ))
                  }
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>Harga Beli (Rp)</Label>
                <Input
                  type="number"
                  value={priceForm.price || ''}
                  onChange={e => setPriceForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                  placeholder="15000"
                />
              </div>
              <div className="grid gap-1">
                <Label>UOM</Label>
                <Input
                  value={priceForm.uom}
                  onChange={e => setPriceForm(f => ({ ...f, uom: e.target.value }))}
                  placeholder="kg"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>Berlaku Dari</Label>
                <Input
                  type="date"
                  value={priceForm.validFrom}
                  onChange={e => setPriceForm(f => ({ ...f, validFrom: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <Label>Berlaku Sampai</Label>
                <Input
                  type="date"
                  value={priceForm.validTo}
                  onChange={e => setPriceForm(f => ({ ...f, validTo: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setIsAddPriceOpen(false)}>Batal</Button>
            <Button onClick={handleAddAdminPrice}>Simpan</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
