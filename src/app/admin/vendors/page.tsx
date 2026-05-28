"use client"

import { useState, useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { Plus, Pencil, History } from "lucide-react"
import { v4 as uuidv4 } from "uuid"
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
import { format, parseISO, differenceInDays } from "date-fns"
import { id as localeId } from "date-fns/locale"
import { formatRupiah } from "@/lib/utils"
import { Vendor, VendorBill } from "@/types"

export default function VendorsPage() {
  const vendors = useAppStore(state => state.vendors)
  const vendorBills = useAppStore(state => state.vendorBills)
  const addVendor = useAppStore(state => state.addVendor)
  const updateVendor = useAppStore(state => state.updateVendor)

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
    </div>
  )
}
