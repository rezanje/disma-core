/**
 * Definisi alur panduan (guided tour).
 *
 * Semua teks panduan ada di file ini — tidak ada copy yang tersebar di komponen.
 * Untuk mengubah kalimat panduan, cukup edit `title` / `body` di bawah.
 *
 * Cara kerja:
 * - Satu alur = beberapa `segments`, satu segment = satu halaman.
 * - Satu segment berisi beberapa `steps`. Tiap step menunjuk elemen lewat
 *   atribut `data-tour="..."` di markup halaman.
 * - Step yang elemennya tidak ada di halaman (karena datanya kosong, layar HP,
 *   atau role user tidak punya tombol itu) otomatis dilewati.
 * - `handoff` adalah kartu penutup segment: menjelaskan siapa yang melanjutkan.
 */

export interface TourStep {
  /** Nilai atribut data-tour pada elemen target. */
  target: string
  title: string
  body: string
}

export interface TourSegment {
  /** Pathname halaman untuk segment ini. */
  path: string
  steps: TourStep[]
  /** Kartu penutup segment — muncul tanpa menunjuk elemen apa pun. */
  handoff: { title: string; body: string }
}

export interface Flow {
  id: string
  /** Nama alur di daftar tombol Panduan. */
  name: string
  /** Penjelasan satu baris di daftar. */
  desc: string
  segments: TourSegment[]
}

// ---------------------------------------------------------------------------
// W2 — Purchase Request sampai pencairan dana
// ---------------------------------------------------------------------------

const W2_PR_TO_DISBURSEMENT: Flow = {
  id: 'pr-pencairan',
  name: 'Pengajuan Dana (PR) sampai Cair',
  desc: 'Dari buat Purchase Request, diverifikasi Finance & CFO, sampai dananya cair dan dipakai belanja.',
  segments: [
    {
      path: '/admin/purchase-requests',
      steps: [
        {
          target: 'pr-new',
          title: 'Mulai dari sini',
          body: 'Semua permintaan dana dimulai dari tombol ini. Klik untuk membuka form pengajuan baru.',
        },
        {
          target: 'pr-form',
          title: 'Isi pengajuannya',
          body: 'Isi judul, kategori, dan nominal. Bagian "Tujuan & Detail Penggunaan" yang paling menentukan — Finance dan CFO memutuskan berdasarkan penjelasan ini, jadi tulis sedetail mungkin.',
        },
        {
          target: 'pr-submit',
          title: 'Ajukan',
          body: 'Setelah diajukan, PR masuk antrian Finance. Statusnya berubah jadi "Pending Finance" dan belum bisa dipakai belanja.',
        },
        {
          target: 'pr-list',
          title: 'Pantau statusnya di sini',
          body: 'Semua pengajuan tampil di daftar ini beserta statusnya. Klik salah satu untuk membuka detail dan riwayat persetujuannya di panel sebelah.',
        },
        {
          target: 'pr-finance-actions',
          title: 'Tahap 1 — Verifikasi Finance',
          body: 'Finance memeriksa kelayakan anggaran, lalu Setujui atau Tolak. Catatan yang ditulis di sini ikut tersimpan di riwayat PR.',
        },
        {
          target: 'pr-cfo-actions',
          title: 'Tahap 2 — Persetujuan CFO',
          body: 'Setelah lolos Finance, PR menunggu keputusan CFO. Ini persetujuan terakhir sebelum dana boleh dicairkan.',
        },
        {
          target: 'pr-disburse',
          title: 'Tahap 3 — Pencairan',
          body: 'PR yang sudah Approved dicairkan Finance lewat tombol ini. Di dalamnya pilih sumber dana dan nominal, lalu tekan "Catat & Transfer" — transaksinya langsung tercatat di kas.',
        },
      ],
      handoff: {
        title: 'Tiga tahap, tiga orang berbeda',
        body:
          'Alur lengkapnya: pengaju bikin PR → Finance verifikasi → CFO setujui → Finance cairkan. ' +
          'Tombol tiap tahap hanya muncul buat yang berwenang, jadi kalau tadi ada tahap yang tidak terlihat, berarti bukan bagian Anda. ' +
          'Setelah dana cair, PR kategori Sourcing siap dipakai di halaman Shopping List.',
      },
    },
    {
      path: '/admin/shopping-list',
      steps: [
        {
          target: 'sl-picker',
          title: 'Pilih order yang mau dibelanjakan',
          body: 'Daftar ini berisi Sales Order yang belum dibelanjakan. Centang yang mau digabung — kebutuhan barangnya akan dijumlahkan otomatis jadi satu daftar belanja.',
        },
        {
          target: 'sl-generate',
          title: 'Buat dokumen belanja',
          body: 'Tombol ini mengunci pilihan tadi jadi satu dokumen list belanja. Setelah dibuat, order yang terpilih statusnya pindah ke "Belanja".',
        },
        {
          target: 'sl-send-finance',
          title: 'Kirim ke Finance',
          body: 'Langkah terakhir: kirim dokumennya ke Finance supaya dananya ditransfer ke tim sourcing. Setelah ditransfer, tim sourcing bisa mulai belanja.',
        },
      ],
      handoff: {
        title: 'Sampai sini bagian Anda selesai',
        body:
          'Dana yang sudah ditransfer dipakai tim sourcing untuk belanja. ' +
          'Mereka melaporkan hasil belanja beserta struknya, lalu Finance mencocokkan pengeluaran dengan dana yang diberikan. ' +
          'Anda akan terlibat lagi kalau ada barang yang ditolak QC dan perlu dibelanjakan susulan.',
      },
    },
  ],
}

// ---------------------------------------------------------------------------
// W4 — Disbursement (Kas Pindah): pindah dana antar rekening
// ---------------------------------------------------------------------------

const W4_DISBURSEMENT: Flow = {
  id: 'disbursement',
  name: 'Disbursement (Kas Pindah)',
  desc: 'Memindahkan dana dari kas utama ke kas operasional — termasuk kapan transfer wajib lewat persetujuan CFO.',
  segments: [
    {
      path: '/finance/disbursements',
      steps: [
        {
          target: 'disb-new',
          title: 'Buat request pemindahan dana',
          body: 'Semua kas pindah dimulai dari sini. Di formnya Anda pilih rekening asal, rekening tujuan, nominal, dan keperluannya. Isi keperluan sedetail mungkin — kalau transfernya butuh persetujuan CFO, itulah yang dibaca beliau.',
        },
        {
          target: 'disb-metrics',
          title: 'Tiga kotak ini = tiga tahap',
          body: 'Menunggu CFO Approval, Approved (Siap Transfer), dan Berhasil Ditransfer. Angkanya menunjukkan total dana yang sedang nyangkut di tiap tahap — kalau ada dana yang tertahan lama di kotak pertama, berarti ada yang menunggu keputusan CFO.',
        },
        {
          target: 'disb-table',
          title: 'Klik barisnya untuk bertindak',
          body: 'Tabel ini memuat semua request beserta statusnya. Tombol aksinya tidak ada di halaman ini — klik salah satu baris, lalu tombolnya muncul di jendela detail sesuai status request dan wewenang Anda.',
        },
      ],
      handoff: {
        title: 'Yang menentukan perlu CFO: rekening asalnya',
        body:
          'Ini bagian yang paling sering disalahpahami. Perlu-tidaknya persetujuan CFO ditentukan oleh REKENING ASAL, bukan besar nominalnya. ' +
          'Transfer keluar dari rekening strategis (BRI, Mandiri) wajib lewat CFO: statusnya jadi Draft → Ajukan Approval ke CFO → CFO setujui → Finance eksekusi transfer → Transferred. ' +
          'Transfer dari rekening lain langsung bisa dieksekusi Finance sendiri tanpa CFO, dari Draft langsung ke Transferred. ' +
          'Selama masih Draft, request masih bisa dihapus. Setelah ditransfer, dananya muncul di Cash & Bank dan siap dipakai belanja.',
      },
    },
  ],
}

export const FLOWS: Flow[] = [W2_PR_TO_DISBURSEMENT, W4_DISBURSEMENT]

export const getFlow = (id: string) => FLOWS.find(f => f.id === id)
