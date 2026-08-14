"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { hasLocation, moveItem, sortStops } from "@/lib/delivery-route"
import type { RoutePin } from "@/components/map/DeliveryMap"
import { MapPin, Save, Search, GripVertical, Route, Loader2 } from "lucide-react"
import { toast } from "sonner"

// Leaflet menyentuh `window` saat diimpor, jadi peta tidak boleh dirender di peladen.
const DeliveryMap = dynamic(() => import("@/components/map/DeliveryMap"), {
  ssr: false,
  loading: () => <div className="h-[520px] rounded-2xl bg-slate-100 animate-pulse" />,
})

const COURIER_COLORS = ['#0284c7', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0d9488']
const UNASSIGNED_COLOR = '#94a3b8'

type Plan = { courierId: string | null; routeOrder: number }
type GeoResult = { label: string; lat: number; lng: number }

export default function DeliveryRoutesPage() {
  const salesOrders = useAppStore(state => state.salesOrders) || []
  const clients = useAppStore(state => state.clients) || []
  const users = useAppStore(state => state.users) || []
  const assignRoute = useAppStore(state => state.assignRoute)
  const setClientLocation = useAppStore(state => state.setClientLocation)

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  // Rencana ditahan di layar sampai ditekan Simpan, supaya menggeser perhentian
  // tidak memicu satu penyimpanan per gerakan.
  const [draft, setDraft] = useState<Record<string, Plan>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  // Dialog pasang titik
  const [pinTarget, setPinTarget] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<GeoResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null)
  const [note, setNote] = useState("")
  const [isPinning, setIsPinning] = useState(false)

  const couriers = useMemo(() => users.filter(u => u.role === 'kurir'), [users])

  const dayOrders = useMemo(
    () => salesOrders.filter(so => (so.targetDeliveryDate || '').slice(0, 10) === date),
    [salesOrders, date]
  )

  const planOf = (soId: string): Plan => {
    const so = salesOrders.find(s => s.id === soId)
    return draft[soId] ?? {
      courierId: so?.assignedCourierId ?? null,
      routeOrder: so?.routeOrder ?? Number.MAX_SAFE_INTEGER,
    }
  }

  const colorOf = (courierId: string | null) => {
    if (!courierId) return UNASSIGNED_COLOR
    const i = couriers.findIndex(c => c.id === courierId)
    return i >= 0 ? COURIER_COLORS[i % COURIER_COLORS.length] : UNASSIGNED_COLOR
  }

  const clientOf = (soId: string) => {
    const so = salesOrders.find(s => s.id === soId)
    return clients.find(c => c.id === so?.clientId)
  }

  const located = dayOrders.filter(so => {
    const c = clients.find(cl => cl.id === so.clientId)
    return c && hasLocation(c)
  })
  const unlocated = dayOrders.filter(so => !located.includes(so))

  // Satu pin per klien, walaupun kliennya punya beberapa PO hari itu.
  const pins: RoutePin[] = useMemo(() => {
    const byClient = new Map<string, RoutePin>()
    located.forEach(so => {
      const c = clients.find(cl => cl.id === so.clientId)
      if (!c || byClient.has(c.id)) return
      byClient.set(c.id, {
        id: c.id,
        lat: c.latitude!,
        lng: c.longitude!,
        label: c.companyName,
        color: colorOf(planOf(so.id).courierId),
      })
    })
    return Array.from(byClient.values())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located, clients, draft, couriers])

  const stopsFor = (courierId: string) =>
    sortStops(
      dayOrders
        .filter(so => planOf(so.id).courierId === courierId)
        .map(so => ({ so, routeOrder: planOf(so.id).routeOrder }))
    )

  const assign = (soId: string, courierId: string | null) => {
    setDraft(prev => {
      const next = { ...prev }
      const count = courierId
        ? dayOrders.filter(so => (next[so.id] ?? planOf(so.id)).courierId === courierId).length
        : 0
      next[soId] = { courierId, routeOrder: courierId ? count : Number.MAX_SAFE_INTEGER }
      return next
    })
  }

  // Satu klien bisa punya beberapa PO di hari yang sama; alamatnya satu, jadi
  // semuanya jatuh ke kurir yang sama.
  const assignClient = (clientId: string, courierId: string | null) => {
    dayOrders.filter(so => so.clientId === clientId).forEach(so => assign(so.id, courierId))
  }

  const reorder = (courierId: string, from: number, to: number) => {
    const current = stopsFor(courierId)
    const moved = moveItem(current, from, to)
    setDraft(prev => {
      const next = { ...prev }
      moved.forEach((entry, i) => {
        next[entry.so.id] = { courierId, routeOrder: i }
      })
      return next
    })
  }

  const handleSave = async () => {
    const updates = Object.entries(draft).map(([salesOrderId, p]) => ({
      salesOrderId,
      courierId: p.courierId,
      routeOrder: p.routeOrder === Number.MAX_SAFE_INTEGER ? 0 : p.routeOrder,
    }))
    if (updates.length === 0) return
    setIsSaving(true)
    try {
      await assignRoute(updates)
      setDraft({})
      toast.success("Rencana rute tersimpan.")
    } catch (e) {
      // Draft sengaja tidak dikosongkan: kerja menyusun rute jangan hilang.
      const message = e instanceof Error ? e.message : String(e)
      toast.error(`Gagal menyimpan: ${message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const runSearch = async () => {
    if (query.trim().length < 3) {
      toast.error("Ketik minimal 3 huruf.")
      return
    }
    setIsSearching(true)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { cache: 'no-store' })
      const json = await res.json()
      setResults(Array.isArray(json.results) ? json.results : [])
      if ((json.results || []).length === 0) {
        toast.info("Tidak ketemu. Klik langsung di peta untuk pasang titik.")
      }
    } catch {
      toast.error("Pencarian gagal. Klik langsung di peta untuk pasang titik.")
    } finally {
      setIsSearching(false)
    }
  }

  const openPinDialog = (clientId: string) => {
    const c = clients.find(cl => cl.id === clientId)
    setPinTarget(clientId)
    setQuery(c?.companyName || "")
    setResults([])
    setPicked(c && hasLocation(c) ? { lat: c.latitude!, lng: c.longitude! } : null)
    setNote(c?.locationNote || "")
  }

  const handleSavePin = async () => {
    if (!pinTarget || !picked || isPinning) return
    setIsPinning(true)
    try {
      await setClientLocation(pinTarget, picked.lat, picked.lng, note)
      toast.success("Titik lokasi tersimpan.")
      setPinTarget(null)
    } catch {
      toast.error("Gagal menyimpan titik lokasi.")
    } finally {
      setIsPinning(false)
    }
  }

  const pinDialogPins: RoutePin[] = picked
    ? [{ id: 'picked', lat: picked.lat, lng: picked.lng, label: 'Titik dipilih', color: '#0284c7' }]
    : []

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white uppercase">
            Rencana <span className="text-sky-600">Rute</span>
          </h2>
          <p className="text-slate-500 font-bold">
            Bagi pengiriman hari itu ke kurir, lalu susun urutan mampirnya.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Tanggal Kirim</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setDraft({}) }}
              className="h-11 rounded-xl font-bold mt-1 w-[170px]"
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={Object.keys(draft).length === 0 || isSaving}
            className="h-11 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-extrabold text-[10px] uppercase tracking-wider disabled:opacity-40"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Simpan Rencana{Object.keys(draft).length > 0 ? ` (${Object.keys(draft).length})` : ''}
          </Button>
        </div>
      </div>

      {dayOrders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center">
          <Route className="w-8 h-8 mx-auto opacity-20 mb-2" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Tidak ada pengiriman di tanggal ini
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Peta */}
          <div className="lg:col-span-3 space-y-4">
            <Card className="liquid-card overflow-hidden">
              <CardContent className="p-0">
                <DeliveryMap
                  pins={pins}
                  onPinClick={(clientId) => setSelectedClientId(clientId)}
                  className="h-[520px] w-full"
                />
              </CardContent>
            </Card>

            {selectedClientId && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                  {clients.find(c => c.id === selectedClientId)?.companyName}
                </p>
                <div className="flex flex-wrap gap-2">
                  {couriers.map(c => (
                    <Button
                      key={c.id}
                      onClick={() => { assignClient(selectedClientId, c.id); setSelectedClientId(null) }}
                      className="h-9 rounded-xl text-[10px] font-extrabold uppercase tracking-wider text-white"
                      style={{ backgroundColor: colorOf(c.id) }}
                    >
                      {c.name}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() => { assignClient(selectedClientId, null); setSelectedClientId(null) }}
                    className="h-9 rounded-xl text-[10px] font-extrabold uppercase tracking-wider"
                  >
                    Kosongkan
                  </Button>
                </div>
              </div>
            )}

            {/* Klien tanpa titik. Ini yang bikin layar ini kepakai sejak hari
                pertama, karena lokasi klien memang diisi bertahap. */}
            <Card className="liquid-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Belum Ada Lokasi ({unlocated.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {unlocated.length === 0 ? (
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                    Semua klien hari ini sudah punya titik
                  </p>
                ) : unlocated.map(so => {
                  const client = clientOf(so.id)
                  const plan = planOf(so.id)
                  return (
                    <div key={so.id} className="flex items-center justify-between gap-2 flex-wrap rounded-xl border border-slate-200 bg-white dark:bg-slate-900 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 dark:text-white truncate">
                          {client?.companyName || 'Klien'}
                        </p>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{so.poNumber}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <select
                          value={plan.courierId || ''}
                          onChange={(e) => assign(so.id, e.target.value || null)}
                          className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-wider"
                        >
                          <option value="">Belum ditugaskan</option>
                          {couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <Button
                          variant="outline"
                          onClick={() => client && openPinDialog(client.id)}
                          className="h-9 rounded-xl text-[10px] font-extrabold uppercase tracking-wider border-sky-200 text-sky-600"
                        >
                          <MapPin className="w-3.5 h-3.5 mr-1" /> Pasang Titik
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>

          {/* Kolom per kurir */}
          <div className="lg:col-span-2 space-y-4">
            {couriers.length === 0 && (
              <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                  Belum ada pengguna dengan peran kurir
                </p>
              </div>
            )}
            {couriers.map(courier => {
              const stops = stopsFor(courier.id)
              return (
                <Card key={courier.id} className="liquid-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colorOf(courier.id) }} />
                        <CardTitle className="text-sm font-black uppercase tracking-tight truncate">
                          {courier.name}
                        </CardTitle>
                      </div>
                      <Badge className="bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest shrink-0">
                        {stops.length} titik
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {stops.length === 0 ? (
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                        Belum ada tugas
                      </p>
                    ) : stops.map((entry, index) => {
                      const client = clientOf(entry.so.id)
                      return (
                        <div
                          key={entry.so.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', String(index))}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault()
                            const from = Number(e.dataTransfer.getData('text/plain'))
                            if (Number.isFinite(from)) reorder(courier.id, from, index)
                          }}
                          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white dark:bg-slate-900 px-2.5 py-2 cursor-grab active:cursor-grabbing"
                        >
                          <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          <span className="text-[10px] font-black text-slate-400 w-4 shrink-0">{index + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-slate-800 dark:text-white truncate">
                              {client?.companyName || 'Klien'}
                            </p>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                              {entry.so.poNumber}
                              {client && !hasLocation(client) ? ' • belum ada titik' : ''}
                            </p>
                          </div>
                          <button
                            onClick={() => assign(entry.so.id, null)}
                            className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-600 shrink-0"
                          >
                            Lepas
                          </button>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Dialog pasang titik */}
      <Dialog open={!!pinTarget} onOpenChange={(open) => { if (!open && !isPinning) setPinTarget(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-wider">
              Pasang Titik — {clients.find(c => c.id === pinTarget)?.companyName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch() } }}
                placeholder="Cari nama tempat, mis. Holycow Kebon Jeruk"
                className="h-11 rounded-xl font-bold"
              />
              <Button
                onClick={runSearch}
                disabled={isSearching}
                className="h-11 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-[10px] uppercase tracking-wider shrink-0"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            {results.length > 0 && (
              <div className="max-h-[120px] overflow-y-auto space-y-1 rounded-xl border border-slate-200 p-2">
                {results.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => setPicked({ lat: r.lat, lng: r.lng })}
                    className={cn(
                      "w-full text-left text-[11px] font-bold px-2 py-1.5 rounded-lg hover:bg-sky-50",
                      picked?.lat === r.lat && picked?.lng === r.lng && "bg-sky-100"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}

            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
              Klik peta untuk geser titiknya
            </p>
            <DeliveryMap
              pins={pinDialogPins}
              onMapClick={(lat, lng) => setPicked({ lat, lng })}
              center={picked ? [picked.lat, picked.lng] : undefined}
              className="h-[280px] w-full rounded-2xl overflow-hidden"
            />

            <div>
              <Label className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                Patokan (opsional)
              </Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Gang sebelah Indomaret, pagar hijau"
                className="h-11 rounded-xl font-bold mt-1"
              />
            </div>

            <Button
              onClick={handleSavePin}
              disabled={!picked || isPinning}
              className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider disabled:opacity-40"
            >
              {isPinning ? 'Menyimpan...' : picked ? 'Simpan Titik' : 'Pilih titik dulu'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
