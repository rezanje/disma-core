# Mode Salin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin PO dan Finance bisa menyalin kertas kerja tim lapangan ke aplikasi tanpa meminjam identitas siapa pun, dan setiap baris hasil salinan tetap bisa dilacak sampai ke orang yang benar-benar mengerjakannya di lapangan.

**Architecture:** Tiap perubahan memisahkan aturannya jadi fungsi murni di `src/lib/<nama>.ts` dengan berkas uji `src/lib/<nama>.check.ts` di sebelahnya, lalu halamannya memanggil fungsi itu. Pola ini sudah dipakai 15 kali di repo ini (`backorder.ts`, `delivery-qty.ts`, `tf-window.ts`, dst.) — ikuti, jangan bikin pola baru. Halaman React di `src/app/**/page.tsx` tidak diuji langsung; yang diuji adalah aturannya.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Zustand (`src/lib/store.ts`), Supabase Postgres, jsPDF, sonner (toast). Uji dijalankan dengan `npx tsx <file>` memakai `node:assert/strict` — **tidak ada** jest/vitest di repo ini, jangan menambahkannya.

## Global Constraints

- Uji memakai `node:assert/strict` dan dijalankan `npx tsx src/lib/<nama>.check.ts`. Berhasil = keluar kode 0 dan mencetak baris `<nama>: OK`.
- Fungsi murni tidak boleh mengimpor `@/lib/store`, `sonner`, atau React. Kalau butuh data, terima sebagai argumen.
- `npx tsc --noEmit` punya **4 error lama** di `src/app/admin/loss-analytics/page.tsx` dan `src/app/finance/disbursements/page.tsx` (TS2322, `Dispatch<SetStateAction<string>>`). Itu baseline. Tugas dianggap gagal kalau jumlah error bertambah dari 4.
- `npx tsx src/lib/nav-permissions.check.ts` wajib tetap lulus setelah setiap tugas.
- Komentar kode ditulis dalam bahasa Inggris (ikuti berkas sekitarnya). Teks yang dilihat pemakai ditulis bahasa Indonesia.
- Perubahan izin peran harus dilakukan di **dua** tempat: `src/lib/store.ts` dan baris `app_settings.role_permissions` di database. Yang di database menimpa yang di kode saat aplikasi dijalankan.
- Migrasi database ditaruh di `supabase/migrations/YYYYMMDDNNNNNN_<nama>.sql` dan dijalankan lewat Supabase MCP `apply_migration`.
- Peran yang dipakai: `admin_po`, `finance`, `sourcing`, `gudang`, `kurir`, `ceo`, `coo`, `cmo`, `super_admin`.

---

### Task 1: Akses 9 layar lapangan untuk Admin PO dan Finance

Tanpa ini seluruh rencana buntu: dua orang yang ditugasi menyalin tidak bisa membuka satu pun layar yang harus mereka isi.

**Files:**
- Modify: `src/lib/store.ts` (blok `initialRolePermissions`, sekitar baris 640-690)
- Modify: `src/lib/nav-permissions.check.ts` (blok `mustHave`, sekitar baris 85-95)
- Database: baris `app_settings` dengan `id = 'global-settings'`

**Interfaces:**
- Consumes: —
- Produces: peran `admin_po` dan `finance` memuat 9 kunci izin: `sourcing_list`, `sourcing_expenses`, `warehouse_inbound`, `warehouse_qc`, `warehouse_outbound`, `warehouse_opname`, `courier_list`, `courier_handover`, `courier_expenses`.

- [ ] **Step 1: Tulis uji yang gagal**

Di `src/lib/nav-permissions.check.ts`, di dalam objek `mustHave`, ganti baris `finance` dan `admin_po` menjadi:

```ts
const mustHave: Record<string, string[]> = {
  finance: ['finance_approvals', 'finance_invoices', 'finance_cash_bank', 'admin_purchase_requests',
    // Mode Salin: Finance mengetikkan hasil kerja lapangan, jadi harus bisa membuka layarnya.
    'sourcing_list', 'sourcing_expenses', 'warehouse_inbound', 'warehouse_qc',
    'warehouse_outbound', 'warehouse_opname', 'courier_list', 'courier_handover', 'courier_expenses'],
  gudang: ['warehouse_inbound', 'warehouse_qc', 'warehouse_outbound', 'warehouse_opname'],
  sourcing: ['sourcing_list', 'sourcing_expenses'],
  kurir: ['courier_list', 'courier_handover'],
  admin_po: ['admin_sales_orders', 'admin_shopping_list', 'admin_tukar_faktur',
    'sourcing_list', 'sourcing_expenses', 'warehouse_inbound', 'warehouse_qc',
    'warehouse_outbound', 'warehouse_opname', 'courier_list', 'courier_handover', 'courier_expenses'],
};
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx tsx src/lib/nav-permissions.check.ts`
Expected: FAIL dengan `peran finance kehilangan izin wajib: sourcing_list`

- [ ] **Step 3: Tambahkan izin di kode**

Di `src/lib/store.ts`, pada `initialRolePermissions`, sisipkan 9 kunci itu ke dalam array `finance` dan array `admin_po`. Contoh untuk `admin_po` — tambahkan sebelum `'tasks_global'`:

```ts
  // Mode Salin (16 Agu 2026): tim lapangan mencatat di kertas, Admin PO dan Finance
  // yang menyalin. Tanpa izin ini satu-satunya jalan adalah meminjam PIN mereka,
  // dan itu membuat seluruh jejak audit menunjuk orang yang salah.
  'sourcing_list', 'sourcing_expenses',
  'warehouse_inbound', 'warehouse_qc', 'warehouse_outbound', 'warehouse_opname',
  'courier_list', 'courier_handover', 'courier_expenses',
```

Lakukan hal yang sama untuk array `finance`.

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npx tsx src/lib/nav-permissions.check.ts`
Expected: PASS, mencetak `nav-permissions: all checks passed`

- [ ] **Step 5: Terapkan ke database**

Jalankan lewat Supabase MCP `execute_sql` pada project `ckkohudfuisgzlrjipev`:

```sql
update app_settings set role_permissions = (
  select jsonb_object_agg(k,
    case when k in ('admin_po','finance')
      then v || '["sourcing_list","sourcing_expenses","warehouse_inbound","warehouse_qc","warehouse_outbound","warehouse_opname","courier_list","courier_handover","courier_expenses"]'::jsonb
      else v end)
  from jsonb_each(role_permissions::jsonb) as e(k, v)
) where id = 'global-settings';
```

Verifikasi:

```sql
select k as role, jsonb_array_length(v) as jml, (v ? 'warehouse_qc') as bisa_qc
from app_settings, lateral jsonb_each(role_permissions::jsonb) as e(k, v)
where k in ('admin_po','finance');
```

Expected: `admin_po` dan `finance` dua-duanya `bisa_qc = true`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.ts src/lib/nav-permissions.check.ts
git commit -m "feat(roles): let Admin PO and Finance open the field screens they transcribe into"
```

---

### Task 2: Status vendor (approved / suspended / blocked)

**Files:**
- Create: `supabase/migrations/20260816000001_vendor_status.sql`
- Create: `src/lib/vendor-status.ts`
- Create: `src/lib/vendor-status.check.ts`
- Modify: `src/types/index.ts` (interface `Vendor`)
- Modify: `src/app/admin/shopping-list/page.tsx` (daftar pilihan vendor)
- Modify: `src/app/sourcing/list/page.tsx` (daftar pilihan vendor)

**Interfaces:**
- Consumes: —
- Produces: `export type VendorStatus = 'approved' | 'suspended' | 'blocked'`; `export function selectableVendors<T extends { status?: VendorStatus | null }>(vendors: T[], currentVendorId?: string, idOf?: (v: T) => string): T[]`

- [ ] **Step 1: Tulis uji yang gagal**

Create `src/lib/vendor-status.check.ts`:

```ts
import assert from 'node:assert/strict';
import { selectableVendors } from './vendor-status';

const V = [
  { id: 'a', status: 'approved' as const },
  { id: 'b', status: 'suspended' as const },
  { id: 'c', status: 'blocked' as const },
  { id: 'd' },                                  // belum diisi = dianggap approved
];
const ids = (list: { id: string }[]) => list.map(v => v.id);

// blocked disembunyikan; suspended masih boleh dipilih (peringatan, bukan larangan)
assert.deepEqual(ids(selectableVendors(V, undefined, v => v.id)), ['a', 'b', 'd']);

// vendor yang SUDAH terpasang di baris tetap muncul walau kini blocked — kalau tidak,
// membuka baris lama diam-diam mengosongkan vendornya dan riwayatnya hilang.
assert.deepEqual(ids(selectableVendors(V, 'c', v => v.id)), ['a', 'b', 'c', 'd']);

// tanpa idOf, dipakai properti .id
assert.deepEqual(ids(selectableVendors(V)), ['a', 'b', 'd']);

// daftar kosong tidak meledak
assert.deepEqual(selectableVendors([]), []);

console.log('vendor-status: OK');
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx tsx src/lib/vendor-status.check.ts`
Expected: FAIL dengan `Cannot find module './vendor-status'`

- [ ] **Step 3: Tulis fungsinya**

Create `src/lib/vendor-status.ts`:

```ts
// Which vendors may still be picked. Pure — no store import — so vendor-status.check.ts
// can run it directly.
//
// 'blocked' hides the vendor from every picker. 'suspended' does not: it is a warning
// state for a vendor under review, and hiding it would silently break in-flight work.
// A vendor already attached to the row stays selectable whatever its status — dropping
// it would blank the field on open and lose which vendor the goods actually came from.

export type VendorStatus = 'approved' | 'suspended' | 'blocked';

export function selectableVendors<T extends { status?: VendorStatus | null }>(
  vendors: T[],
  currentVendorId?: string,
  idOf: (v: T) => string = (v) => (v as unknown as { id: string }).id,
): T[] {
  return (vendors || []).filter(v =>
    v.status !== 'blocked' || (currentVendorId != null && idOf(v) === currentVendorId));
}
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npx tsx src/lib/vendor-status.check.ts`
Expected: PASS, mencetak `vendor-status: OK`

- [ ] **Step 5: Tambahkan kolom di database**

Create `supabase/migrations/20260816000001_vendor_status.sql`:

```sql
-- Approved Vendor List (playbook §5.4). Tanpa penanda ini, vendor yang barangnya
-- berulang kali gagal QC tetap muncul di setiap daftar pilihan dan tidak ada cara
-- menghentikannya selain mengingatkan orang satu per satu.
alter table vendors add column if not exists status text not null default 'approved';
alter table vendors drop constraint if exists vendors_status_check;
alter table vendors add constraint vendors_status_check
  check (status in ('approved', 'suspended', 'blocked'));
```

Terapkan lewat Supabase MCP `apply_migration` dengan nama `vendor_status`.

Verifikasi:

```sql
select status, count(*) from vendors group by status;
```

Expected: satu baris, `approved | 33`.

- [ ] **Step 6: Tambahkan field di tipe**

Di `src/types/index.ts`, pada interface `Vendor`, tambahkan:

```ts
  status?: 'approved' | 'suspended' | 'blocked';
```

- [ ] **Step 7: Pakai di dua daftar pilihan vendor**

Di `src/app/admin/shopping-list/page.tsx` dan `src/app/sourcing/list/page.tsx`, impor:

```ts
import { selectableVendors } from "@/lib/vendor-status"
```

lalu setiap tempat yang me-render seluruh `vendors` sebagai opsi, bungkus dengan `selectableVendors(vendors, <vendorId baris ini>)`. Cari dengan:

```bash
grep -n "vendors.map(" src/app/admin/shopping-list/page.tsx src/app/sourcing/list/page.tsx
```

- [ ] **Step 8: Pastikan tidak ada error tipe baru**

Run: `npx tsc --noEmit 2>&1 | tail -3`
Expected: tetap `TypeScript: 4 errors in 2 files`

- [ ] **Step 9: Commit**

```bash
git add src/lib/vendor-status.ts src/lib/vendor-status.check.ts src/types/index.ts supabase/migrations/20260816000001_vendor_status.sql src/app/admin/shopping-list/page.tsx src/app/sourcing/list/page.tsx
git commit -m "feat(vendors): add an approved/suspended/blocked status and honour it in pickers"
```

---

### Task 3: Parkir PIN akun lapangan

⚠️ **Baca ini sebelum mulai.** Layar login **tidak** membaca tabel `users` di database. Ia mencocokkan PIN terhadap `MOCK_USERS` di `src/lib/constants.ts`, dan malah menimpa daftar user di store dengan konstanta itu setiap kali halaman login dibuka (`src/components/auth/login-form.tsx`, `React.useEffect` sekitar baris 41). Menambahkan kolom `is_active` di database **tidak akan berpengaruh apa pun** terhadap login. Penandanya harus ada di `MOCK_USERS`.

**Files:**
- Create: `src/lib/auth-pin.ts`
- Create: `src/lib/auth-pin.check.ts`
- Modify: `src/lib/constants.ts` (`MOCK_USERS`)
- Modify: `src/components/auth/login-form.tsx` (sekitar baris 53)

**Interfaces:**
- Consumes: —
- Produces: `export type PinCandidate = { pin?: string | null; isActive?: boolean }`; `export function findActiveUserByPin<T extends PinCandidate>(users: T[], pin: string): T | null`

- [ ] **Step 1: Tulis uji yang gagal**

Create `src/lib/auth-pin.check.ts`:

```ts
import assert from 'node:assert/strict';
import { findActiveUserByPin } from './auth-pin';

const U = [
  { pin: '1111', name: 'aktif tanpa penanda' },
  { pin: '2222', name: 'diparkir', isActive: false },
  { pin: '3333', name: 'aktif eksplisit', isActive: true },
];

assert.equal(findActiveUserByPin(U, '1111')?.name, 'aktif tanpa penanda');
assert.equal(findActiveUserByPin(U, '3333')?.name, 'aktif eksplisit');

// akun yang diparkir ditolak — inti dari tugas ini
assert.equal(findActiveUserByPin(U, '2222'), null);

// PIN tidak dikenal, kosong, dan spasi
assert.equal(findActiveUserByPin(U, '9999'), null);
assert.equal(findActiveUserByPin(U, ''), null);
assert.equal(findActiveUserByPin([], '1111'), null);

// PIN kosong di daftar user tidak boleh cocok dengan input kosong
assert.equal(findActiveUserByPin([{ pin: '' }], ''), null);

console.log('auth-pin: OK');
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx tsx src/lib/auth-pin.check.ts`
Expected: FAIL dengan `Cannot find module './auth-pin'`

- [ ] **Step 3: Tulis fungsinya**

Create `src/lib/auth-pin.ts`:

```ts
// PIN lookup for the login screen. Pure so auth-pin.check.ts can cover the rule that
// matters: a parked account must not be able to sign in.
//
// isActive is optional and absent means active, so existing entries keep working
// without being touched.

export type PinCandidate = { pin?: string | null; isActive?: boolean };

export function findActiveUserByPin<T extends PinCandidate>(users: T[], pin: string): T | null {
  if (!pin) return null;
  const match = (users || []).find(u => u.pin === pin && u.isActive !== false);
  return match ?? null;
}
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npx tsx src/lib/auth-pin.check.ts`
Expected: PASS, mencetak `auth-pin: OK`

- [ ] **Step 5: Parkir tiga akun lapangan**

Di `src/lib/constants.ts`, tambahkan `"isActive": false` pada tiga entri `MOCK_USERS`: PIN `2222` (Hilman/Sourcing), `3333` (Sandi/Gudang), `4444` (Rivai/Logistik). Contoh:

```ts
  {
    "id": "22222222-2222-2222-2222-222222222222",
    "pin": "2222",
    "name": "Hilman (Sourcing)",
    "role": "sourcing",
    // Mode Salin: tim lapangan mencatat di kertas dan tidak memakai aplikasi. Selama
    // PIN-nya hidup, satu-satunya kegunaannya adalah dipinjam penyalin — dan itu
    // membuat setiap jejak audit menunjuk orang yang salah. Hidupkan lagi saat
    // mereka mulai memakai aplikasi sendiri.
    "isActive": false
  },
```

- [ ] **Step 6: Pakai di layar login**

Di `src/components/auth/login-form.tsx`, ganti baris pencarian user:

```ts
    const matchedUser = MOCK_USERS.find(u => u.pin === values.pin)
```

menjadi:

```ts
    const matchedUser = findActiveUserByPin(MOCK_USERS, values.pin)
```

dan tambahkan impornya di atas:

```ts
import { findActiveUserByPin } from "@/lib/auth-pin"
```

- [ ] **Step 7: Uji manual di browser**

```bash
npx next dev
```

Buka `http://localhost:3000/login`, masukkan PIN `2222`.
Expected: ditolak, pesan gagal yang sama seperti PIN salah.
Lalu masukkan PIN `5555`.
Expected: masuk sebagai Sifa (Admin Finance).

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth-pin.ts src/lib/auth-pin.check.ts src/lib/constants.ts src/components/auth/login-form.tsx
git commit -m "feat(auth): park the field-team PINs so nobody transcribes under their name"
```

---

### Task 4: Belanja atas nama orang lain

**Files:**
- Create: `src/lib/sourcing-pocket.ts`
- Create: `src/lib/sourcing-pocket.check.ts`
- Modify: `src/app/sourcing/list/page.tsx` (baris 103 `myPocket`, baris 213 penjaga belanja tunai, baris 255 `recordPocketPurchase`, baris 480 `addTutupHariKantong`)

**Interfaces:**
- Consumes: —
- Produces: `export type PocketBank = { id: string; purpose?: string | null; ownerUserId?: string | null; name?: string; balance?: number }`; `export function pocketOwners<T extends PocketBank>(banks: T[]): T[]`; `export function resolvePocket<T extends PocketBank>(banks: T[], currentUserId?: string | null, onBehalfOfUserId?: string | null): T | null`

- [ ] **Step 1: Tulis uji yang gagal**

Create `src/lib/sourcing-pocket.check.ts`:

```ts
import assert from 'node:assert/strict';
import { pocketOwners, resolvePocket } from './sourcing-pocket';

const BANKS = [
  { id: 'jago', purpose: 'sourcing', ownerUserId: null },
  { id: 'pocket-hilman', purpose: 'sourcing_pocket', ownerUserId: 'u-hilman' },
  { id: 'pocket-bagja', purpose: 'sourcing_pocket', ownerUserId: 'u-bagja' },
  { id: 'bca', purpose: 'umum', ownerUserId: null },
];

// hanya rekening kantong yang punya pemilik yang bisa dipilih
assert.deepEqual(pocketOwners(BANKS).map(b => b.id), ['pocket-hilman', 'pocket-bagja']);

// orang sourcing sendiri: kantongnya sendiri, tanpa memilih apa pun
assert.equal(resolvePocket(BANKS, 'u-hilman')?.id, 'pocket-hilman');

// penyalin (tidak punya kantong) memilih atas nama siapa
assert.equal(resolvePocket(BANKS, 'u-sifa', 'u-hilman')?.id, 'pocket-hilman');

// penyalin tanpa memilih: tidak ada kantong — pemanggil wajib menolak laporannya
assert.equal(resolvePocket(BANKS, 'u-sifa'), null);

// pilihan atas nama menang atas kantong sendiri: kalau orang sourcing menyalin
// belanja rekannya, uangnya harus keluar dari kantong rekannya
assert.equal(resolvePocket(BANKS, 'u-hilman', 'u-bagja')?.id, 'pocket-bagja');

// atas nama orang yang tidak punya kantong tetap null, bukan diam-diam jatuh ke sendiri
assert.equal(resolvePocket(BANKS, 'u-hilman', 'u-entah'), null);

assert.equal(resolvePocket([], 'u-hilman'), null);
assert.equal(resolvePocket(BANKS, null), null);

console.log('sourcing-pocket: OK');
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx tsx src/lib/sourcing-pocket.check.ts`
Expected: FAIL dengan `Cannot find module './sourcing-pocket'`

- [ ] **Step 3: Tulis fungsinya**

Create `src/lib/sourcing-pocket.ts`:

```ts
// Which cash pocket a shopping report draws from. Pure — no store import — so the rule
// is testable on its own.
//
// Before transcription mode the answer was always "the pocket owned by whoever is
// logged in", and a cash purchase typed by anyone else was refused outright. Now
// Finance types on the sourcer's behalf, so the money still has to leave the sourcer's
// pocket rather than nobody's. The on-behalf-of choice therefore wins over the typist's
// own pocket, and an unknown choice returns null instead of quietly falling back —
// falling back is how cash leaves the wrong pocket without anyone noticing.

export type PocketBank = {
  id: string;
  purpose?: string | null;
  ownerUserId?: string | null;
  name?: string;
  balance?: number;
};

export function pocketOwners<T extends PocketBank>(banks: T[]): T[] {
  return (banks || []).filter(b => b.purpose === 'sourcing_pocket' && !!b.ownerUserId);
}

export function resolvePocket<T extends PocketBank>(
  banks: T[],
  currentUserId?: string | null,
  onBehalfOfUserId?: string | null,
): T | null {
  const pockets = pocketOwners(banks);
  if (onBehalfOfUserId) {
    return pockets.find(b => b.ownerUserId === onBehalfOfUserId) ?? null;
  }
  if (!currentUserId) return null;
  return pockets.find(b => b.ownerUserId === currentUserId) ?? null;
}
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npx tsx src/lib/sourcing-pocket.check.ts`
Expected: PASS, mencetak `sourcing-pocket: OK`

- [ ] **Step 5: Pasang pilihan "Atas nama" di halaman belanja**

Di `src/app/sourcing/list/page.tsx`:

Tambahkan impor:

```ts
import { pocketOwners, resolvePocket } from "@/lib/sourcing-pocket"
```

Tambahkan state di dekat state lain di komponen:

```ts
const [onBehalfOfUserId, setOnBehalfOfUserId] = useState<string>("")
```

Ganti baris 103 (`const myPocket = derivedBanks.find(...)`) menjadi:

```ts
  const pocketChoices = pocketOwners(derivedBanks)
  const myPocket = resolvePocket(derivedBanks, currentUser?.id, onBehalfOfUserId || undefined)
```

Render pilihannya tepat di atas tombol kirim laporan, hanya kalau yang login bukan pemilik kantong:

```tsx
{!resolvePocket(derivedBanks, currentUser?.id) && pocketChoices.length > 0 && (
  <div className="mb-4">
    <label className="text-xs font-bold text-slate-500 uppercase">Belanja atas nama</label>
    <select
      className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold"
      value={onBehalfOfUserId}
      onChange={(e) => setOnBehalfOfUserId(e.target.value)}
    >
      <option value="">— Pilih orang yang belanja —</option>
      {pocketChoices.map(p => (
        <option key={p.id} value={p.ownerUserId as string}>
          {users.find(u => u.id === p.ownerUserId)?.name || p.name}
        </option>
      ))}
    </select>
    <p className="text-[11px] text-slate-500 mt-1">
      Uangnya dipotong dari kantong orang yang dipilih, bukan kantong kamu.
    </p>
  </div>
)}
```

Kalau `users` belum ada di komponen, ambil dengan `const users = useAppStore(state => state.users)`.

- [ ] **Step 6: Perbaiki pesan penolakan**

Di baris 213, ganti isi pesan `toast.error` menjadi:

```ts
        toast.error("Pilih dulu belanja ini atas nama siapa — uangnya harus dipotong dari kantong orang yang belanja. Kalau belum ada kantongnya, minta Finance membuatkan di Cash & Bank (purpose \"Kantong Sourcing\" + owner orangnya).")
```

Penjaganya sendiri (`if (cashSpendTotal > 0 && !myPocket)`) **tidak diubah** — tanpa kantong, uangnya tidak keluar dari mana pun.

- [ ] **Step 7: Catat pemilik kantong yang benar di tutup hari**

Di baris ~480, ganti `sourcerId: currentUser?.id || 'unknown'` menjadi:

```ts
              sourcerId: myPocket?.ownerUserId || currentUser?.id || 'unknown',
```

- [ ] **Step 8: Pastikan tidak ada error tipe baru**

Run: `npx tsc --noEmit 2>&1 | tail -3`
Expected: tetap `TypeScript: 4 errors in 2 files`

- [ ] **Step 9: Commit**

```bash
git add src/lib/sourcing-pocket.ts src/lib/sourcing-pocket.check.ts src/app/sourcing/list/page.tsx
git commit -m "feat(sourcing): record a cash purchase on someone else's behalf, drawing their pocket"
```

---

### Task 5: Pisahkan "dikerjakan oleh" dari "diinput oleh"

**Files:**
- Create: `src/lib/actor.ts`
- Create: `src/lib/actor.check.ts`
- Create: `src/components/pelaku-picker.tsx`
- Modify: `src/app/warehouse/qc/page.tsx` (`handleProcessQC`, field `inboundVerifiedBy`)
- Modify: `src/app/sourcing/list/page.tsx` (`handleSubmitLaporan`, field `purchaserId`)

**Interfaces:**
- Consumes: `resolvePocket` dari Task 4 (hanya di halaman sourcing, tidak dipakai di sini)
- Produces: `export function resolveActor(performedByUserId: string | null | undefined, currentUserId: string | null | undefined): string`; `export function transcriptionNote(performedByName?: string | null, typedByName?: string | null): string | undefined`; komponen `<PelakuPicker value onChange roles />`

- [ ] **Step 1: Tulis uji yang gagal**

Create `src/lib/actor.check.ts`:

```ts
import assert from 'node:assert/strict';
import { resolveActor, transcriptionNote } from './actor';

// yang dipilih menang; kalau tidak memilih, jatuh ke yang login
assert.equal(resolveActor('u-sandi', 'u-sifa'), 'u-sandi');
assert.equal(resolveActor(null, 'u-sifa'), 'u-sifa');
assert.equal(resolveActor(undefined, 'u-sifa'), 'u-sifa');
assert.equal(resolveActor('', 'u-sifa'), 'u-sifa');

// tidak ada dua-duanya: 'system', bukan string kosong yang menyamar jadi nama
assert.equal(resolveActor(null, null), 'system');

// catatan hanya muncul kalau memang disalin orang lain
assert.equal(transcriptionNote('Sandi', 'Sifa'), 'Dikerjakan Sandi, disalin Sifa');
assert.equal(transcriptionNote(null, 'Sifa'), undefined);
assert.equal(transcriptionNote('Sifa', 'Sifa'), undefined);
assert.equal(transcriptionNote('Sandi', null), undefined);

console.log('actor: OK');
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx tsx src/lib/actor.check.ts`
Expected: FAIL dengan `Cannot find module './actor'`

- [ ] **Step 3: Tulis fungsinya**

Create `src/lib/actor.ts`:

```ts
// Who did the work, as opposed to who typed it in. Pure so the fallback order is
// testable.
//
// Under transcription mode the field team works on paper and Admin PO or Finance type
// it in later. Every one of these fields used to be filled with the logged-in user, so
// an audit trail built to answer "who received these goods" answered "Sifa" for
// everything. record_history separately records the typist, so the two never collapse
// into one name again.

export function resolveActor(
  performedByUserId: string | null | undefined,
  currentUserId: string | null | undefined,
): string {
  return performedByUserId || currentUserId || 'system';
}

export function transcriptionNote(
  performedByName?: string | null,
  typedByName?: string | null,
): string | undefined {
  if (!performedByName || !typedByName) return undefined;
  if (performedByName === typedByName) return undefined;
  return `Dikerjakan ${performedByName}, disalin ${typedByName}`;
}
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npx tsx src/lib/actor.check.ts`
Expected: PASS, mencetak `actor: OK`

- [ ] **Step 5: Buat komponen pemilih pelaku**

Create `src/components/pelaku-picker.tsx`:

```tsx
"use client"

import { useAppStore } from "@/lib/store"

/**
 * Who actually did this in the field. Shown wherever a transcriber records work that
 * someone else performed — without it every field record is attributed to the typist.
 */
export function PelakuPicker({
  value,
  onChange,
  roles,
  label = "Dikerjakan oleh",
}: {
  value: string
  onChange: (userId: string) => void
  roles: string[]
  label?: string
}) {
  const users = useAppStore(state => state.users)
  const choices = users.filter(u => roles.includes(u.role))
  if (choices.length === 0) return null

  return (
    <div className="mb-3">
      <label className="text-xs font-bold text-slate-500 uppercase">{label}</label>
      <select
        className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— Saya sendiri —</option>
        {choices.map(u => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
    </div>
  )
}
```

- [ ] **Step 6: Pakai di layar QC**

Di `src/app/warehouse/qc/page.tsx`, tambahkan impor:

```ts
import { PelakuPicker } from "@/components/pelaku-picker"
import { resolveActor } from "@/lib/actor"
```

Tambahkan state:

```ts
const [qcPerformedBy, setQcPerformedBy] = useState("")
```

Render `<PelakuPicker value={qcPerformedBy} onChange={setQcPerformedBy} roles={['gudang']} />` di dalam kartu QC, tepat di atas tombol proses.

Lalu di `handleProcessQC`, pada pemanggilan `updatePurchaseItem` yang mengisi `inboundVerifiedBy`, ganti nilainya menjadi:

```ts
      inboundVerifiedBy: resolveActor(qcPerformedBy, currentUser?.id),
```

Tambahkan `setQcPerformedBy("")` ke blok pembersihan state di akhir fungsi.

- [ ] **Step 7: Pakai di layar belanja**

Di `src/app/sourcing/list/page.tsx`, `handleSubmitLaporan`, pada `updatePurchase(...)`, ganti:

```ts
          purchaserId: currentUser?.id,
```

menjadi:

```ts
          purchaserId: resolveActor(onBehalfOfUserId, currentUser?.id),
```

dan tambahkan impor `import { resolveActor } from "@/lib/actor"`. Halaman ini sudah punya pilihan orang dari Task 4, jadi tidak perlu `PelakuPicker` lagi.

- [ ] **Step 8: Pastikan tidak ada error tipe baru**

Run: `npx tsc --noEmit 2>&1 | tail -3`
Expected: tetap `TypeScript: 4 errors in 2 files`

- [ ] **Step 9: Commit**

```bash
git add src/lib/actor.ts src/lib/actor.check.ts src/components/pelaku-picker.tsx src/app/warehouse/qc/page.tsx src/app/sourcing/list/page.tsx
git commit -m "feat(audit): record who did the work separately from who typed it in"
```

---

### Task 6: Harga pasar harian ikut tercatat saat menyalin

**Files:**
- Create: `src/lib/market-price.ts`
- Create: `src/lib/market-price.check.ts`
- Modify: `src/app/sourcing/list/page.tsx` (`handleSubmitLaporan`)
- Modify: `src/lib/store.ts` (pakai `addVendorPrice` yang sudah ada)

**Interfaces:**
- Consumes: —
- Produces: `export type PricedLine = { productId: string; vendorId?: string | null; actualUnitPrice?: number | null; qtyPurchased?: number | null; isChecked?: boolean }`; `export function buildMarketPriceRows(lines: PricedLine[], date: string, source: string): Array<{ vendorId: string; productId: string; price: number; validFrom: string; validTo: string; status: string; source: string }>`

- [ ] **Step 1: Tulis uji yang gagal**

Create `src/lib/market-price.check.ts`:

```ts
import assert from 'node:assert/strict';
import { buildMarketPriceRows } from './market-price';

const D = '2026-08-16';
const rows = buildMarketPriceRows([
  { productId: 'P1', vendorId: 'V1', actualUnitPrice: 30000, qtyPurchased: 10, isChecked: true },
  { productId: 'P2', vendorId: 'V1', actualUnitPrice: 12000, qtyPurchased: 5, isChecked: true },
  { productId: 'P3', vendorId: 'V2', actualUnitPrice: 0, qtyPurchased: 5, isChecked: true },   // harga 0 dilewati
  { productId: 'P4', vendorId: null, actualUnitPrice: 9000, qtyPurchased: 5, isChecked: true },// tanpa vendor dilewati
  { productId: 'P5', vendorId: 'V2', actualUnitPrice: 8000, qtyPurchased: 0, isChecked: true },// tidak jadi dibeli
  { productId: 'P6', vendorId: 'V2', actualUnitPrice: 7000, qtyPurchased: 5, isChecked: false },// tidak dicentang
], D, 'salin-belanja');

assert.equal(rows.length, 2);
assert.deepEqual(rows.map(r => r.productId), ['P1', 'P2']);
assert.equal(rows[0].price, 30000);
assert.equal(rows[0].vendorId, 'V1');
assert.equal(rows[0].validFrom, D);
assert.equal(rows[0].validTo, D);      // harga pasar berlaku sehari
assert.equal(rows[0].status, 'actual');
assert.equal(rows[0].source, 'salin-belanja');

// baris kembar vendor+produk di hari yang sama: ambil yang terakhir, jangan dobel
const dup = buildMarketPriceRows([
  { productId: 'P1', vendorId: 'V1', actualUnitPrice: 30000, qtyPurchased: 5, isChecked: true },
  { productId: 'P1', vendorId: 'V1', actualUnitPrice: 31000, qtyPurchased: 5, isChecked: true },
], D, 'salin-belanja');
assert.equal(dup.length, 1);
assert.equal(dup[0].price, 31000);

assert.deepEqual(buildMarketPriceRows([], D, 'x'), []);

console.log('market-price: OK');
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx tsx src/lib/market-price.check.ts`
Expected: FAIL dengan `Cannot find module './market-price'`

- [ ] **Step 3: Tulis fungsinya**

Create `src/lib/market-price.ts`:

```ts
// Daily market prices, harvested from what was already typed.
//
// The playbook asks for a daily price capture per supplier and SKU, and vendor_prices
// has existed for it since the table was created without ever being written to. The
// actual price paid per vendor per item is already entered when a shopping report is
// copied in, so no extra typing is needed — the rows fall out of the transcription.
//
// This is the data a purchase price ceiling would need later. Without collecting from
// today there is still nothing to calibrate against in three months.

export type PricedLine = {
  productId: string;
  vendorId?: string | null;
  actualUnitPrice?: number | null;
  qtyPurchased?: number | null;
  isChecked?: boolean;
};

export function buildMarketPriceRows(
  lines: PricedLine[],
  date: string,
  source: string,
) {
  const byKey = new Map<string, { vendorId: string; productId: string; price: number; validFrom: string; validTo: string; status: string; source: string }>();
  for (const l of lines || []) {
    if (l.isChecked === false) continue;
    if (!l.vendorId) continue;
    const price = Number(l.actualUnitPrice || 0);
    if (price <= 0) continue;
    if (Number(l.qtyPurchased || 0) <= 0) continue;
    // A market price is good for the day it was paid, nothing longer — produce prices
    // move daily and a stale ceiling is worse than none.
    byKey.set(`${l.vendorId}::${l.productId}`, {
      vendorId: l.vendorId, productId: l.productId, price,
      validFrom: date, validTo: date, status: 'actual', source,
    });
  }
  return [...byKey.values()];
}
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npx tsx src/lib/market-price.check.ts`
Expected: PASS, mencetak `market-price: OK`

- [ ] **Step 5: Tulis barisnya saat laporan belanja dikirim**

Di `src/app/sourcing/list/page.tsx`, tambahkan impor:

```ts
import { buildMarketPriceRows } from "@/lib/market-price"
```

Di `handleSubmitLaporan`, setelah perulangan `for (const p of activePurchases)` selesai dan sebelum `toast.success` terakhir, tambahkan:

```ts
      // Harga pasar hari ini ikut tercatat dari angka yang barusan diketik — tidak ada
      // ketikan tambahan, dan ini bahan untuk batas harga beli nanti.
      const today = new Date().toISOString().slice(0, 10)
      const addVendorPrice = useAppStore.getState().addVendorPrice
      for (const row of buildMarketPriceRows(currentItems, today, 'salin-belanja')) {
        await addVendorPrice({
          id: uuidv4(),
          vendorId: row.vendorId,
          productId: row.productId,
          price: row.price,
          uom: products.find(p => p.id === row.productId)?.uom || 'Kg',
          validFrom: row.validFrom,
          validTo: row.validTo,
          status: row.status,
          source: row.source,
          lastUpdated: new Date().toISOString(),
        } as never)
      }
```

- [ ] **Step 6: Verifikasi lewat database**

Kirim satu laporan belanja dari `http://localhost:3000/sourcing/list`, lalu jalankan lewat Supabase MCP:

```sql
select vendor_id, product_id, price, valid_from, status, source
from vendor_prices order by created_at desc limit 5;
```

Expected: satu baris per barang yang dibelanjakan, harga sama dengan yang diketik.

- [ ] **Step 7: Commit**

```bash
git add src/lib/market-price.ts src/lib/market-price.check.ts src/app/sourcing/list/page.tsx
git commit -m "feat(sourcing): capture the day's market price from the shopping report"
```

---

### Task 7: Lembar kerja cetak dengan kolom tulis tangan

**Files:**
- Create: `src/lib/worksheet-columns.ts`
- Create: `src/lib/worksheet-columns.check.ts`
- Modify: `src/lib/pdf.ts` (fungsi `buildShoppingListPDF`, dipanggil oleh `generateShoppingListPDFDataUrl` baris 546)

**Interfaces:**
- Consumes: —
- Produces: `export type WorksheetKind = 'belanja' | 'qc' | 'serah-terima'`; `export function worksheetColumns(kind: WorksheetKind): Array<{ header: string; handwritten: boolean }>`

- [ ] **Step 1: Tulis uji yang gagal**

Create `src/lib/worksheet-columns.check.ts`:

```ts
import assert from 'node:assert/strict';
import { worksheetColumns } from './worksheet-columns';

const belanja = worksheetColumns('belanja');
const headers = belanja.map(c => c.header);

// kolom tulis tangan harus ada, dan urutannya sama dengan urutan pengisian di layar
assert.deepEqual(
  belanja.filter(c => c.handwritten).map(c => c.header),
  ['Harga Beli Asli', 'Qty Asli', 'Vendor', 'Catatan'],
);

// kolom cetak mendahului kolom tulis tangan — orang mengisi ke kanan, tidak melompat
const firstHandwritten = belanja.findIndex(c => c.handwritten);
assert.ok(belanja.slice(0, firstHandwritten).every(c => !c.handwritten));
assert.ok(headers.includes('SKU') && headers.includes('Nama Barang') && headers.includes('Qty Beli'));

assert.deepEqual(
  worksheetColumns('qc').filter(c => c.handwritten).map(c => c.header),
  ['Qty Lolos', 'Qty Reject', 'Alasan', 'Tujuan Reject'],
);
assert.deepEqual(
  worksheetColumns('serah-terima').filter(c => c.handwritten).map(c => c.header),
  ['Qty Diterima', 'Qty Ditolak', 'Alasan'],
);

console.log('worksheet-columns: OK');
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx tsx src/lib/worksheet-columns.check.ts`
Expected: FAIL dengan `Cannot find module './worksheet-columns'`

- [ ] **Step 3: Tulis fungsinya**

Create `src/lib/worksheet-columns.ts`:

```ts
// Column layout for the printed field worksheets.
//
// Kept as data rather than inlined in the PDF builder so the order can be asserted:
// the whole point is that the paper's column order matches the transcription screen's.
// When they drift, copying stops being copying and becomes interpreting, and typos
// become routine.

export type WorksheetKind = 'belanja' | 'qc' | 'serah-terima';

const COLUMNS: Record<WorksheetKind, Array<{ header: string; handwritten: boolean }>> = {
  belanja: [
    { header: 'SKU', handwritten: false },
    { header: 'Nama Barang', handwritten: false },
    { header: 'Qty Beli', handwritten: false },
    { header: 'Harga Patokan', handwritten: false },
    { header: 'Harga Beli Asli', handwritten: true },
    { header: 'Qty Asli', handwritten: true },
    { header: 'Vendor', handwritten: true },
    { header: 'Catatan', handwritten: true },
  ],
  qc: [
    { header: 'SKU', handwritten: false },
    { header: 'Nama Barang', handwritten: false },
    { header: 'Qty Datang', handwritten: false },
    { header: 'Qty Lolos', handwritten: true },
    { header: 'Qty Reject', handwritten: true },
    { header: 'Alasan', handwritten: true },
    { header: 'Tujuan Reject', handwritten: true },
  ],
  'serah-terima': [
    { header: 'PO', handwritten: false },
    { header: 'Nama Barang', handwritten: false },
    { header: 'Qty Kirim', handwritten: false },
    { header: 'Qty Diterima', handwritten: true },
    { header: 'Qty Ditolak', handwritten: true },
    { header: 'Alasan', handwritten: true },
  ],
};

export function worksheetColumns(kind: WorksheetKind) {
  return COLUMNS[kind];
}
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npx tsx src/lib/worksheet-columns.check.ts`
Expected: PASS, mencetak `worksheet-columns: OK`

- [ ] **Step 5: Pakai di PDF daftar belanja**

Di `src/lib/pdf.ts`, cari `function buildShoppingListPDF`:

```bash
grep -n "function buildShoppingListPDF" src/lib/pdf.ts
```

Tambahkan impor di atas berkas:

```ts
import { worksheetColumns } from './worksheet-columns'
```

Di dalam `buildShoppingListPDF`, ganti definisi header dan baris tabelnya menjadi pola berikut. Nama variabel tabel di berkas itu mungkin berbeda — sesuaikan, yang penting header dan sel dibangun dari `cols` yang sama sehingga tidak bisa berbeda urutan:

```ts
  const cols = worksheetColumns('belanja')

  const head = [cols.map(c => c.header)]

  const body = items.map(item => cols.map(c => {
    // Kolom tulis tangan sengaja dikosongkan — ini yang diisi pulpen di pasar.
    if (c.handwritten) return ''
    switch (c.header) {
      case 'SKU': return item.skuCode
      case 'Nama Barang': return item.productName
      case 'Qty Beli': return `${item.totalQty} ${item.uom || ''}`.trim()
      case 'Harga Patokan': return formatRupiah(item.estimatedPrice)
      default: return ''
    }
  }))
```

Kalau `formatRupiah` belum diimpor di `src/lib/pdf.ts`, pakai pemformat angka yang sudah dipakai berkas itu — jangan menambah impor baru hanya untuk ini.

- [ ] **Step 6: Uji manual**

Jalankan `npx next dev`, buka `http://localhost:3000/admin/shopping-list` sebagai Admin PO (PIN 1111), buat satu dokumen belanja, dan periksa pratinjau PDF-nya.
Expected: empat kolom paling kanan tercetak kosong untuk ditulis tangan, urutannya Harga Beli Asli → Qty Asli → Vendor → Catatan.

- [ ] **Step 7: Commit**

```bash
git add src/lib/worksheet-columns.ts src/lib/worksheet-columns.check.ts src/lib/pdf.ts
git commit -m "feat(print): give the shopping worksheet handwriting columns in screen order"
```

---

### Task 8: Foto kertas wajib untuk baris yang disalin

**Files:**
- Create: `src/lib/transcription-proof.ts`
- Create: `src/lib/transcription-proof.check.ts`
- Modify: `src/app/sourcing/list/page.tsx` (`handleSubmitLaporan`, sekitar penjaga belanja tunai baris 213)

**Interfaces:**
- Consumes: —
- Produces: `export function requiresProof(performedByUserId: string | null | undefined, currentUserId: string | null | undefined): boolean`; `export function proofBlocker(performedByUserId: string | null | undefined, currentUserId: string | null | undefined, proofUrl?: string | null): string | null`

- [ ] **Step 1: Tulis uji yang gagal**

Create `src/lib/transcription-proof.check.ts`:

```ts
import assert from 'node:assert/strict';
import { requiresProof, proofBlocker } from './transcription-proof';

// dikerjakan orang lain = hasil salinan = butuh foto kertasnya
assert.equal(requiresProof('u-hilman', 'u-sifa'), true);
// dikerjakan sendiri = bukan salinan
assert.equal(requiresProof('u-hilman', 'u-hilman'), false);
assert.equal(requiresProof(null, 'u-hilman'), false);
assert.equal(requiresProof('', 'u-hilman'), false);

assert.equal(proofBlocker('u-hilman', 'u-sifa', 'https://x/foto.jpg'), null);
assert.equal(proofBlocker('u-hilman', 'u-hilman', null), null);
assert.equal(typeof proofBlocker('u-hilman', 'u-sifa', null), 'string');
assert.equal(typeof proofBlocker('u-hilman', 'u-sifa', ''), 'string');
assert.match(proofBlocker('u-hilman', 'u-sifa', null) as string, /foto/i);

console.log('transcription-proof: OK');
```

- [ ] **Step 2: Jalankan uji, pastikan gagal**

Run: `npx tsx src/lib/transcription-proof.check.ts`
Expected: FAIL dengan `Cannot find module './transcription-proof'`

- [ ] **Step 3: Tulis fungsinya**

Create `src/lib/transcription-proof.ts`:

```ts
// Proof rule for transcribed work. Pure so the condition is testable.
//
// A line the typist performed themselves needs no photo — they were there. A line
// copied off someone else's paper does: the paper is the only original, it lives in a
// pocket, and once it is lost the number in the system has nothing behind it.

export function requiresProof(
  performedByUserId: string | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  if (!performedByUserId) return false;
  return performedByUserId !== currentUserId;
}

export function proofBlocker(
  performedByUserId: string | null | undefined,
  currentUserId: string | null | undefined,
  proofUrl?: string | null,
): string | null {
  if (!requiresProof(performedByUserId, currentUserId)) return null;
  if (proofUrl) return null;
  return 'Lampirkan foto kertas belanjanya dulu. Laporan salinan tanpa foto tidak punya bukti apa pun kalau angkanya dipertanyakan nanti.';
}
```

- [ ] **Step 4: Jalankan uji, pastikan lulus**

Run: `npx tsx src/lib/transcription-proof.check.ts`
Expected: PASS, mencetak `transcription-proof: OK`

- [ ] **Step 5: Pasang penjaganya**

Di `src/app/sourcing/list/page.tsx`, tambahkan impor:

```ts
import { proofBlocker } from "@/lib/transcription-proof"
```

Di `handleSubmitLaporan`, tepat setelah penjaga kantong (baris ~213) dan sebelum `const loadingToast = toast.loading(...)`, tambahkan:

```ts
    const proofProblem = proofBlocker(onBehalfOfUserId, currentUser?.id, proofImage)
    if (proofProblem) {
      toast.error(proofProblem)
      return
    }
```

- [ ] **Step 6: Uji manual**

Login sebagai Finance (PIN 5555), buka `/sourcing/list`, pilih "Belanja atas nama" seseorang, isi satu baris, kirim laporan **tanpa** melampirkan foto.
Expected: ditolak dengan pesan yang menyebut foto. Setelah foto dilampirkan, laporan terkirim.

- [ ] **Step 7: Commit**

```bash
git add src/lib/transcription-proof.ts src/lib/transcription-proof.check.ts src/app/sourcing/list/page.tsx
git commit -m "feat(sourcing): require the paper photo when a report is transcribed for someone else"
```

---

### Task 9: Jalankan simulasi ulang dan tutup Bagian 1

**Files:**
- Modify: tidak ada berkas produksi
- Test: seluruh `src/lib/*.check.ts`

- [ ] **Step 1: Jalankan semua uji**

```bash
for f in src/lib/*.check.ts; do printf "%-30s " "$(basename $f)"; npx tsx "$f" >/dev/null 2>&1 && echo OK || echo FAIL; done
```

Expected: semuanya OK, termasuk enam berkas baru (`vendor-status`, `auth-pin`, `sourcing-pocket`, `actor`, `market-price`, `worksheet-columns`, `transcription-proof`).

- [ ] **Step 2: Periksa tipe**

Run: `npx tsc --noEmit 2>&1 | tail -3`
Expected: `TypeScript: 4 errors in 2 files` — sama dengan baseline, tidak bertambah.

- [ ] **Step 3: Telusuri satu hari penuh sebagai penyalin**

Jalankan `npx next dev`, login sebagai Finance (PIN 5555), lalu kerjakan satu PO dari awal sampai tertagih **tanpa berpindah akun**: buat dokumen belanja → laporan belanja atas nama orang sourcing dengan foto → QC dengan pemilih pelaku → barang keluar → serah terima → audit pengiriman.

Expected: seluruhnya bisa dikerjakan dari satu akun; PIN 2222/3333/4444 ditolak di layar login.

- [ ] **Step 4: Periksa jejaknya di database**

```sql
select p.advance_code, u.name as dikerjakan_oleh
from purchases p left join users u on u.id = p.purchaser_id
order by p.date desc limit 3;

select rh.table_name, rh.action, rh.user_name, rh.user_role, rh.created_at
from record_history rh order by rh.created_at desc limit 5;
```

Expected: `dikerjakan_oleh` menunjuk orang sourcing, sementara riwayat aktivitas menunjuk Sifa sebagai pengetik. Dua nama berbeda — itu seluruh maksud Bagian 1.

- [ ] **Step 5: Commit catatan hasil**

```bash
git add docs/superpowers/plans/2026-08-16-mode-salin.md
git commit -m "docs: mark mode salin plan complete"
```
