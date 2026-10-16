"use client"

/**
 * Satu layar, beberapa tab — dipakai untuk menyatukan halaman yang selama ini
 * berdiri sendiri padahal satu pekerjaan (Piutang/Penagihan/Umur piutang,
 * Laporan/Buku besar/Untung rugi, Pengeluaran/Reimbursement/biaya lapangan).
 *
 * Tab aktif nempel di alamat (`?tab=`), bukan cuma di ingatan komponen: menu
 * samping menunjuk langsung ke tab tertentu, dan orang yang menyimpan tautan atau
 * menekan tombol back tetap mendarat di tab yang sama. Pola `?tab=` ini sudah
 * dipakai halaman Persetujuan, jadi tidak ada aturan baru yang harus dihafal.
 *
 * Hanya tab yang aktif yang dirender. Beberapa halaman di dalamnya berisi ribuan
 * baris dan menarik seluruh isi store — memasang empat sekaligus membuat layar ini
 * lebih berat daripada empat halaman yang digantikannya.
 */

import { Suspense } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {tabHref} from "@/lib/navigation-tabs"
import { PageHeader } from "@/components/ui/page-header"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export type LayarTab = {
  /** Nilai `?tab=`. Dipakai juga sebagai kunci menu samping. */
  key: string
  title: string
  render: () => React.ReactNode
}

type Props = {
  title: string
  context?: React.ReactNode
  tabs: LayarTab[]
  queryKey?: string
}

function TabHostInner({ title, context, tabs, queryKey = "tab" }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const diminta = params.get(queryKey)
  // Tab yang tidak dikenal jatuh ke tab pertama, bukan layar kosong: tautan lama
  // dan salah ketik tetap mendarat di sesuatu yang bisa dibaca.
  const aktif = tabs.some((t) => t.key === diminta) ? (diminta as string) : tabs[0].key
  const isi = tabs.find((t) => t.key === aktif) ?? tabs[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        context={context}
        actions={
          <Tabs
            value={aktif}
            onValueChange={(nilai) =>
              nilai && router.replace(tabHref(pathname,params.toString(),queryKey,nilai), { scroll: false })
            }
          >
            <TabsList variant="line">
              {tabs.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.title}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />
      <div>{isi.render()}</div>
    </div>
  )
}

export function TabHost(props: Props) {
  // useSearchParams butuh Suspense supaya halaman ini tetap bisa di-prerender.
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Memuat…</div>}>
      <TabHostInner {...props} />
    </Suspense>
  )
}
