"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { Plus, Pencil, Truck } from "lucide-react"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Vendor } from "@/types"

export default function VendorsPage() {
  const vendors = useAppStore(state => state.vendors)
  const addVendor = useAppStore(state => state.addVendor)
  const updateVendor = useAppStore(state => state.updateVendor)
  
  const [isOpen, setIsOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  
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
              <TableHead>Address</TableHead>
              <TableHead>Metode Pembayaran</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No vendors found.
                </TableCell>
              </TableRow>
            ) : (
              vendors.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.companyName}</TableCell>
                  <TableCell>{v.picName}</TableCell>
                  <TableCell>{v.phone}</TableCell>
                  <TableCell className="text-sm">{v.address}</TableCell>
                  <TableCell className="text-sm font-semibold">
                    {v.isTempo ? (
                      <span className="text-blue-600">Tempo ({v.paymentTermDays || 14} hari)</span>
                    ) : (
                      <span className="text-emerald-600">Cash Langsung</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(v)}>
                      <Pencil className="h-4 w-4 text-slate-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
