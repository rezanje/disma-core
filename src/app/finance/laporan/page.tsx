"use client"

/**
 * Laporan keuangan jadi satu layar.
 *
 * Dulu ada dua menu yang sama-sama bernama "Laporan" — satu ringkasan, satu laporan
 * resmi — ditambah Buku Besar dan Untung Rugi per Barang berdiri sendiri. Empat pintu
 * untuk satu pertanyaan: "bulan ini untung berapa, dan dari mana angkanya".
 */

import AuthGuard from "@/components/auth/auth-guard"
import { TabHost } from "@/components/layout/tab-host"
import FinancialReportsPage from "../reports/page"
import LedgerPage from "../ledger/page"
import SkuPnlPage from "../sku-pnl/page"

export default function LaporanPage() {
  return (
    <AuthGuard allowedRoles={['finance', 'super_admin', 'ceo', 'coo']}>
      <TabHost
        title="Laporan keuangan"
        context="Laporan resmi, buku besar, dan untung rugi per barang"
        tabs={[
          { key: 'laba-rugi', title: 'Laba rugi & neraca', render: () => <FinancialReportsPage embedded /> },
          { key: 'buku-besar', title: 'Buku besar', render: () => <LedgerPage embedded /> },
          { key: 'per-barang', title: 'Untung rugi per barang', render: () => <SkuPnlPage embedded /> },
        ]}
      />
    </AuthGuard>
  )
}
