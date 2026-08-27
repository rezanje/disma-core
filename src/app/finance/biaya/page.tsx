"use client"

/**
 * Biaya di luar barang jadi satu layar: yang sudah dibayar kantor (Pengeluaran) dan
 * yang ditalangi orang lalu ditagihkan balik (Reimbursement).
 *
 * Biaya jalan sourcing dan kurir sengaja TIDAK ditarik ke sini sebagai tab. Keduanya
 * form pencatatan milik orang lapangan yang menuliskan biaya atas nama dirinya
 * sendiri; memasangnya di layar Finance membuat biayanya tercatat atas nama yang
 * salah. Keduanya tetap terjangkau sebagai submenu di sebelah layar ini.
 */

import AuthGuard from "@/components/auth/auth-guard"
import { TabHost } from "@/components/layout/tab-host"
import PengeluaranUmumPage from "../expenses/page"
import ReimbursementManagementPage from "../reimbursements/page"

export default function BiayaPage() {
  return (
    <AuthGuard allowedRoles={['finance', 'super_admin', 'ceo', 'coo']}>
      <TabHost
        title="Biaya"
        context="Overhead kantor dan pengajuan talangan karyawan"
        tabs={[
          { key: 'pengeluaran', title: 'Pengeluaran', render: () => <PengeluaranUmumPage embedded /> },
          { key: 'reimbursement', title: 'Reimbursement', render: () => <ReimbursementManagementPage embedded /> },
        ]}
      />
    </AuthGuard>
  )
}
