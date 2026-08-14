"use client"

import { useEffect, useRef } from "react"
import type { Map as LeafletMap, CircleMarker } from "leaflet"
import "leaflet/dist/leaflet.css"

export type RoutePin = { id: string; lat: number; lng: number; label: string; color: string }

export type DeliveryMapProps = {
  pins: RoutePin[]
  onPinClick?: (id: string) => void
  onMapClick?: (lat: number, lng: number) => void
  center?: [number, number]
  className?: string
}

// Jakarta — dipakai saat belum ada satu pin pun, yang akan sering terjadi di
// awal karena lokasi klien diisi bertahap.
const DEFAULT_CENTER: [number, number] = [-6.2088, 106.8456]

export default function DeliveryMap({ pins, onPinClick, onMapClick, center, className }: DeliveryMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markersRef = useRef<CircleMarker[]>([])
  // Simpan callback di ref supaya efek peta tidak dibangun ulang tiap render.
  const clickRef = useRef({ onPinClick, onMapClick })
  clickRef.current = { onPinClick, onMapClick }

  useEffect(() => {
    let cancelled = false

    // Impor dinamis: Leaflet menyentuh `window` saat diimpor.
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return
      const map = L.map(containerRef.current).setView(center || DEFAULT_CENTER, 11)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        clickRef.current.onMapClick?.(e.latlng.lat, e.latlng.lng)
      })
      mapRef.current = map
    })

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markersRef.current = []
    }
    // Sengaja hanya sekali: peta dibangun satu kali, isinya diperbarui di efek
    // berikutnya. `center` cuma titik awal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Gambar ulang penanda setiap daftar pin berubah.
  useEffect(() => {
    let cancelled = false
    import("leaflet").then((L) => {
      const map = mapRef.current
      if (cancelled || !map) return
      markersRef.current.forEach(m => m.remove())
      markersRef.current = pins.map(pin => {
        const marker = L.circleMarker([pin.lat, pin.lng], {
          radius: 9, color: "#ffffff", weight: 2, fillColor: pin.color, fillOpacity: 1,
        })
          .bindTooltip(pin.label, { direction: "top" })
          .on("click", () => clickRef.current.onPinClick?.(pin.id))
        marker.addTo(map)
        return marker
      })
      if (pins.length > 0) {
        map.fitBounds(
          L.latLngBounds(pins.map(p => [p.lat, p.lng] as [number, number])),
          { padding: [40, 40], maxZoom: 15 }
        )
      }
    })
    return () => { cancelled = true }
  }, [pins])

  return <div ref={containerRef} className={className} />
}
