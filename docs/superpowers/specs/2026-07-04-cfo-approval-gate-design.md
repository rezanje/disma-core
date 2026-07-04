# Design: Gate approval CFO berdasarkan rekening, bukan berdasarkan flow

## Masalah

Sekarang **semua** disbursement (`finance/disbursements`) wajib lewat approval CFO
(`Draft` → `Pending_CFO` → `Approved` → `Transferred`), gak peduli rekening asal
mana. Ini bikin transfer rutin sehari-hari (BCA → Bank Jago, isi kantong sourcing,
dll — yang sepenuhnya ranah admin finance) ikut kehambat nunggu CFO, padahal CFO
gak perlu ikut campur di situ.

Terpisah, halaman Purchase Request (`admin/purchase-requests`) punya jalur approval
CFO sendiri (`Pending_CFO`/`handleCfoApprove`, digate berdasar kategori PR
Sourcing/non-Sourcing) — tapi jalur ini sudah **dead code**: `handleFinanceVerify`
selalu langsung set status `Approved` begitu Finance verifikasi, gak pernah transisi
ke `Pending_CFO`. PR juga punya cap nominal (`amount > activePR.amount` ditolak) yang
gak fleksibel buat admin finance nyesuain harga real.

## Pembagian peran (dikonfirmasi user)

- **CFO** = strategic. Nentuin pos budgeting awal bulan, approve pemindahan dana dari
  rekening strategis (BRI, Mandiri) ke rekening lain.
- **Admin Finance** = operasional. Begitu duit ada di BCA/Bank Jago/Cash/pocket, itu
  udah tanggung jawab admin finance — bebas transfer, gak perlu approval lagi.
- Alur rekening riil: **BRI** nerima revenue penjualan → dioper ke **Mandiri**
  (tabungan/reserve) → dicairkan ke **BCA** (operasional) → dibelanjakan lewat
  **Bank Jago** (sourcing).
- Jadi **BRI dan Mandiri** = rekening strategis (butuh approval CFO buat transfer
  KELUAR dari situ). **BCA, Bank Jago, Cash, pocket, dll** = bebas, cukup admin
  finance.

## Aturan inti

> **Approval CFO dibutuhkan HANYA kalau rekening ASAL transfer adalah rekening
> strategis (BRI/Mandiri). Rekening TUJUAN tidak relevan buat aturan ini.**

Contoh: BCA → BRI (nyimpen balik ke tabungan) tetap dianggap **bebas approval**,
karena dilihat dari sisi rekening asal (BCA).

## Perubahan Data Model

Tambah 1 field baru di `BankAccount` (`src/types/index.ts`):

```ts
export interface BankAccount {
  // ...existing fields
  cfoApprovalRequired?: boolean; // true = transfer KELUAR dari rekening ini butuh approval CFO
}
```

Migration SQL: tambah kolom `cfo_approval_required BOOLEAN DEFAULT false` di tabel
`bank_accounts`. Default `false` (bebas) — rekening baru yang lupa di-tag otomatis
jadi bebas approval, ini konsisten sama constraint sekarang. Tag manual di prod:
set `true` untuk BRI dan Mandiri, biarkan `false`/`null` untuk yang lain.

Helper baru di `src/lib/accounting.ts`:

```ts
export const bankRequiresCfoApproval = (bankAccountId: string) =>
  useAppStore.getState().bankAccounts.find(b => b.id === bankAccountId)?.cfoApprovalRequired === true
```

Ini satu-satunya sumber kebenaran buat aturan gate. Dipanggil dari 2 halaman
(Disbursement + Purchase Request) — gak ada logic approval yang diduplikat.

Cash & Bank page (rekening list) dikasih badge kecil "Butuh Approval CFO" di
rekening yang ditag `cfoApprovalRequired`, biar keliatan eksplisit, gak nebak dari
nama rekening.

## Perubahan Flow: Disbursement (`finance/disbursements`)

Status enum (`DisbursementStatus`) gak berubah: `Draft | Pending_CFO | Approved |
Transferred`. Yang berubah adalah tombol aksi yang muncul setelah Draft dibuat,
tergantung `bankRequiresCfoApproval(fromBankAccountId)`:

- **Butuh approval** (BRI/Mandiri) — flow SAMA PERSIS kayak sekarang: Draft →
  "Ajukan Approval ke CFO" → CFO approve/reject → admin finance klik "Eksekusi
  Transfer" → `Transferred`.
- **Bebas** (BCA/Jago/Cash/dll) — tombol "Ajukan Approval ke CFO" diganti tombol
  **"Eksekusi Transfer"** langsung dari status `Draft`. Status lompat langsung
  `Draft` → `Transferred` saat dieksekusi. Tetap 2 langkah (bikin draft dulu, baru
  pencet eksekusi terpisah) — bukan auto-submit sekali klik.

Gate dicek ulang di titik eksekusi (bukan cuma pas form dibuka), buat jaga-jaga
kalau tag rekening berubah di antara draft dibuat dan dieksekusi.

Role gate gak berubah: yang boleh pencet "Eksekusi Transfer" tetap harus role
finance/super_admin, sama kayak sekarang. Bebas dari approval CFO bukan berarti
bebas dari role-gate.

## Perubahan Flow: Purchase Request (`admin/purchase-requests`)

Tahap pengajuan gak berubah: `Pending_Finance` → admin finance verifikasi →
`Approved`/`Rejected`. Ini murni cek kelayakan pengajuan, belum nyentuh uang.

Yang berubah di tahap **cairkan dana** (`handleDisburse`):

1. **Cap nominal dihapus.** Cek `amount > activePR.amount` yang sekarang menolak
   nominal cair lebih dari nominal pengajuan — dihapus. Nominal cair tetap default
   pre-fill sesuai nominal pengajuan (`disburseAmountRaw` sudah begini), tapi admin
   finance bebas ubah naik/turun sesuai harga real pas eksekusi.

2. **Gate CFO pindah ke rekening yang dipilih saat cairkan dana, bukan ke status PR.**
   Pas admin finance pilih `disburseBankId` di dialog cairkan dana, pakai
   `bankRequiresCfoApproval()` yang sama:
   - Rekening bebas (BCA/Jago — kasus normal/mayoritas) → tombol "Cairkan Dana"
     langsung jalan, gak ada approval tambahan.
   - Rekening strategis (BRI/Mandiri — kasus jarang) → tombol "Cairkan Dana"
     diganti tombol "Ajukan ke CFO" dulu, yang men-transisikan PR itu sendiri ke
     status `Pending_CFO` miliknya (field yang sudah ada di `PurchaseRequestStatus`,
     sekarang dead code — tinggal di-rewire triggernya dari "berdasar kategori PR"
     jadi "berdasar rekening yang dipilih"). Setelah CFO approve (`handleCfoApprove`
     yang sudah ada, statusnya balik ke `Approved`), admin finance baru bisa
     eksekusi `handleDisburse` seperti biasa. PR tidak membuat objek Disbursement
     terpisah — approval tetap murni di dalam PR itu sendiri, cuma helper
     `bankRequiresCfoApproval()` yang di-share dengan Disbursement.

3. Bersihin kode lama `Pending_CFO`/`handleCfoApprove`/`isCfoRole` gate yang
   berdasar kategori PR Sourcing/non-Sourcing (`handleFinanceVerify`'s dead
   `Pending_CFO` transition, related UI badge/dialog) — diganti logic di atas.

## Yang TIDAK berubah

- Mekanisme pencatatan ledger (`recordBudgetTransfer`, `recordPRExpensePayment`)
  tetap dipakai apa adanya — cuma titik pemanggilannya yang gate-nya berubah.
- PR tetap sebagai satu alur "ngajuin → dicek finance → di-approve → dieksekusi",
  gak dipecah/digabung ke Disbursement (approach unifikasi ditolak, lihat
  alternatif di bawah).
- Data lama (disbursement/PR yang sudah berstatus apapun) gak kepengaruh — kolom
  baru nullable/default false, cuma jalur baru ke depan yang beda.

## Alternatif yang dipertimbangkan, tidak dipilih

- **Unifikasi PR → Disbursement** (PR cuma jadi catatan justifikasi budget, semua
  eksekusi uang lewat Disbursement): lebih arsitektural bersih jangka panjang,
  tapi refactor besar (nyentuh status machine PR, field `budgetTransferDate`/
  `budgetBankAccountId` yang dibaca dari PR-disbursement) untuk fix yang
  sebenarnya cuma soal approval-gating. Ditolak — di luar scope.
- **Gate by account name/id matching** ("BRI"/"Mandiri" string match): gak butuh
  field/migration baru, tapi rapuh — kalau rekening di-rename atau rekening baru
  dibikin dengan nama beda, gate diam-diam salah. Ditolak — ini gate duit, gak mau
  bergantung ke string matching.
- **Gate cek rekening tujuan juga** (bukan cuma asal): ditolak eksplisit oleh
  user — BCA→BRI (setor balik ke tabungan) dianggap bebas kalau dilihat dari BCA.

## Verifikasi

Gak ada test harness di repo ini. Verifikasi via:
- `npx tsc --noEmit` balik ke baseline (5 error pre-existing, gak nambah)
- Manual browser walkthrough:
  - Disbursement BCA → Jago: draft → langsung "Eksekusi Transfer" (gak ada step
    CFO) → `Transferred`, saldo kecatet bener di kedua rekening
  - Disbursement Mandiri → BCA: draft → "Ajukan ke CFO" → approve → eksekusi
    (flow lama, pastikan gak somehow ke-skip)
  - PR cair dana ke rekening bebas: nominal bisa diubah lebih/kurang dari
    pengajuan, langsung cair tanpa approval tambahan
  - PR cair dana ke rekening strategis: kena gate, harus lewat CFO dulu sebelum
    bisa eksekusi
