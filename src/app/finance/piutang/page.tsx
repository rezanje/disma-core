"use client"

/**
 * Piutang jadi satu layar.
 *
 * Tagihan, penagihan harian, dan umur piutang selama ini tiga menu terpisah padahal
 * satu pekerjaan dengan tiga sudut pandang atas data yang sama — dan tiga menu berarti
 * tiga kali orang harus menebak mana yang dia butuhkan. Halaman aslinya tidak disalin,
 * cuma dipasang sebagai tab, jadi tidak ada logika uang yang berpindah tempat.
 */

import AuthGuard from "@/components/auth/auth-guard"
import { TabHost } from "@/components/layout/tab-host"
import InvoicesPage from "../invoices/page"
import ARCollectionsPage from "../collections/page"
import ARAgingPage from "../ar-aging/page"

export default function PiutangPage() {
  return (
    <AuthGuard allowedRoles={['finance', 'super_admin', 'ceo', 'coo']}>
      <TabHost
        title="Piutang"
        context="Tagihan klien, penagihan harian, dan umurnya"
        tabs={[
          { key: 'tagihan', title: 'Tagihan', render: () => <InvoicesPage embedded /> },
          { key: 'penagihan', title: 'Penagihan', render: () => <ARCollectionsPage embedded /> },
          { key: 'umur', title: 'Umur piutang', render: () => <ARAgingPage embedded /> },
        ]}
      />
    </AuthGuard>
  )
}
