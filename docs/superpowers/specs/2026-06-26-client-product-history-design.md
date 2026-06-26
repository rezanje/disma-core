# Spesifikasi Desain: Histori Pemesanan & Komposisi Produk Klien

Menambahkan tab analisis **"Histori Produk"** pada detail Klien di modul Client Management untuk melacak histori pembelian produk, kuantitas terkirim, serta komposisi produk yang paling sering dipesan oleh klien/cabangnya.

---

## 1. Kebutuhan Bisnis (Goals)
1. **Analisis Komposisi**: Membantu CEO dan Admin menganalisis produk apa saja yang paling dominan dipesan oleh klien tertentu (dan seluruh cabangnya jika klien adalah sebuah Brand Induk).
2. **Histori Pembelian**: Menyajikan daftar lengkap kuantitas pesanan, harga rata-rata, total transaksi per produk, serta tanggal pemesanan terakhir.
3. **Optimasi Supply**: Memudahkan admin merencanakan penawaran harga khusus atau alokasi stok berdasarkan preferensi produk klien.

---

## 2. Rancangan UI & Komponen

Tab baru **"Histori Produk"** akan disisipkan di panel detail Klien setelah tab *Invoices*. Tab ini terdiri dari:

### A. Kontrol Filter & Pencarian
* **Filter Jangka Waktu**:
  * Dropdown pilihan: All-Time, 7 Hari Terakhir, 30 Hari Terakhir, Bulan Ini, dan Custom Date Range (dengan input Start & End Date).
* **Filter Outlet Cabang (Khusus Tipe Brand Induk)**:
  * Dropdown untuk menyaring data: "Semua Outlet (Gabungan)", "Brand Induk Saja", atau memilih outlet cabang tertentu secara spesifik.
* **Pencarian Produk**:
  * Input pencarian berdasarkan nama produk atau kode SKU.
* **Pengurutan (Sort)**:
  * Pilihan sortir: Kuantitas Terbanyak (default), Total Belanja Terbesar, Nama Produk.

### B. Komposisi Visual (Horizontal Bar Chart)
* Menampilkan **Top 5 Produk** terlaris berdasarkan kuantitas yang berhasil terpenuhi.
* Menggunakan komponen `BarChart` horizontal dari pustaka `recharts` agar sesuai dengan visual premium minimalis dashboard lainnya.

### C. Tabel Detail Histori Produk
Tabel responsif dengan kolom:
1. **Produk & SKU**: Nama produk, kategori, dan kode SKU.
2. **Kuantitas Terkirim (Fulfilled Qty)**: Akumulasi `qtyFinal`. Jika berbeda dengan original `qty`, tampilkan perbandingan kecil (misal: `100 unit (Order: 120)`).
3. **Harga Rata-Rata (Avg Price)**: Rata-rata harga bersih per unit setelah diskon/markup (`Total Nilai / Total Qty Final`).
4. **Total Belanja**: Akumulasi nilai nominal transaksi untuk produk tersebut.
5. **Terakhir Dipesan**: Tanggal pemesanan terakhir berdasarkan PO.

---

## 3. Logika Agregasi Data (Client-Side)

Agregasi data dilakukan secara real-time pada store client-side menggunakan react `useMemo`:

```typescript
const clientProductHistory = useMemo(() => {
  if (!selectedClient) return [];
  
  // 1. Tentukan clientId target (termasuk cabang jika terpilih opsi "Semua Outlet")
  const targetClientIds = new Set<string>();
  if (selectedClient.isBrand && outletFilter === 'all') {
    targetClientIds.add(selectedClient.id);
    clients.filter(c => c.parentId === selectedClient.id).forEach(c => targetClientIds.add(c.id));
  } else if (selectedClient.isBrand && outletFilter !== 'all' && outletFilter !== 'parent_only') {
    targetClientIds.add(outletFilter);
  } else {
    targetClientIds.add(selectedClient.id);
  }

  // 2. Filter Sales Orders berdasarkan Client ID & Filter Tanggal
  const filteredOrders = salesOrders.filter(so => {
    if (!targetClientIds.has(so.clientId)) return false;
    if (so.status === 'Batal') return false; // Abaikan pesanan yang dibatalkan
    return isDateInSelectedRange(so.orderDate);
  });

  const orderIds = new Set(filteredOrders.map(so => so.id));

  // 3. Agregasikan item pesanan (SalesOrderItem)
  const aggregation: {
    [productId: string]: {
      productId: string;
      totalQtyFinal: number;
      totalQtyOriginal: number;
      totalValue: number;
      lastOrderDate: string;
    }
  } = {};

  salesOrderItems.forEach(item => {
    if (!orderIds.has(item.salesOrderId)) return;

    const qtyFinal = item.qtyFinal !== undefined && item.qtyFinal !== null ? item.qtyFinal : item.qty;
    const value = item.subtotalFinal !== undefined && item.subtotalFinal !== null ? item.subtotalFinal : item.subtotal;
    const order = filteredOrders.find(so => so.id === item.salesOrderId);
    const orderDate = order ? order.orderDate : '';

    if (!aggregation[item.productId]) {
      aggregation[item.productId] = {
        productId: item.productId,
        totalQtyFinal: qtyFinal,
        totalQtyOriginal: item.qty,
        totalValue: value,
        lastOrderDate: orderDate
      };
    } else {
      const agg = aggregation[item.productId];
      agg.totalQtyFinal += qtyFinal;
      agg.totalQtyOriginal += item.qty;
      agg.totalValue += value;
      if (orderDate && (!agg.lastOrderDate || new Date(orderDate) > new Date(agg.lastOrderDate))) {
        agg.lastOrderDate = orderDate;
      }
    }
  });

  // 4. Petakan ke detail Produk & filter pencarian
  return Object.values(aggregation)
    .map(agg => {
      const product = products.find(p => p.id === agg.productId);
      return {
        ...agg,
        productName: product?.name || 'Produk Tidak Dikenal',
        skuCode: product?.skuCode || '-',
        category: product?.category || '-',
        uom: product?.uom || 'pcs',
        avgPrice: agg.totalQtyFinal > 0 ? agg.totalValue / agg.totalQtyFinal : 0
      };
    })
    .filter(item => {
      if (!productSearch) return true;
      const term = productSearch.toLowerCase();
      return item.productName.toLowerCase().includes(term) || item.skuCode.toLowerCase().includes(term);
    });
}, [selectedClient, outletFilter, timeFilter, startDate, endDate, salesOrders, salesOrderItems, products, clients, productSearch]);
```

---

## 4. Rencana Pengujian & Verifikasi

### Pengujian Manual
1. **Akses Tab**: Buka modul Client Management, pilih salah satu klien, dan pastikan tab **"Histori Produk"** muncul di panel detail.
2. **Kalkulasi Klien Tunggal**: Lakukan verifikasi kalkulasi total quantity, avg price, dan total belanja terhadap riwayat PO klien tersebut.
3. **Roll-up Outlet**: Pilih klien bertipe Brand Induk, pastikan histori mencakup seluruh data outlet di bawahnya ketika filter diset ke "Semua Outlet".
4. **Verifikasi Grafik**: Pastikan grafik Recharts menampilkan visualisasi Top 5 produk dengan benar sesuai data kuantitas.
5. **Uji Filter Waktu & Pencarian**: Lakukan filter waktu dan pencarian kata kunci nama produk, pastikan daftar produk ter-update secara real-time.
