# ERP & ACCOUNTING FLOW AUDIT SPECIFICATION
## Disma Fresh ERP

Version: 1.0

Purpose:
Dokumen ini digunakan sebagai acuan audit desain sistem ERP dan Accounting Disma Fresh. Fokus audit adalah memastikan seluruh alur operasional, inventory, procurement, sales, cash management, dan accounting sudah konsisten, tidak terjadi double posting, tidak ada transaksi yang hilang, dan seluruh laporan keuangan dapat ditelusuri kembali ke transaksi operasional sumbernya.

---

# TUJUAN SISTEM

Sistem ERP Disma Fresh harus memenuhi prinsip:

1. Setiap transaksi operasional memiliki dampak keuangan yang jelas.
2. Tidak ada jurnal manual yang diperlukan untuk transaksi normal.
3. Seluruh laporan keuangan berasal dari transaksi operasional.
4. Inventory menjadi pusat pergerakan bisnis.
5. Accounting menjadi lapisan pencatatan otomatis.
6. Semua angka pada Neraca, Laba Rugi, dan Arus Kas harus dapat ditelusuri sampai transaksi sumber.

---

# ARSITEKTUR MODUL

## MASTER DATA

- Supplier
- Customer
- Product
- Category
- Warehouse
- Bank Account
- Chart Of Account (COA)
- Tax Configuration
- User & Permission

## MODUL OPERASIONAL

### Procurement
- Purchase Request
- Purchase Order
- Vendor Bill
- Supplier Return

### Inventory
- Inbound Receiving
- QC Inspection
- Stock Movement
- Stock Adjustment
- Stock Opname
- Batch Tracking
- Expired Tracking

### Sales
- Sales Order
- Delivery Order
- Invoice
- Customer Return

### Cash & Bank
- Cash In
- Cash Out
- Bank Transfer
- Reconciliation

### Accounting
- Journal Engine
- General Ledger
- Trial Balance
- Financial Report

---

# FLOW PROCUREMENT

Purchase Request
→ Purchase Order
→ Supplier Delivery
→ Receiving
→ QC
→ Inventory
→ Vendor Bill
→ Account Payable

Audit:
- Apakah PO bisa dibuat tanpa PR?
- Apakah receiving wajib mereferensikan PO?
- Apakah inventory bertambah sebelum QC approve?
- Apakah reject inventory masuk ke stock?
- Apakah AP terbentuk dari Vendor Bill?
- Apakah Vendor Bill wajib mereferensikan receiving?

Rule:
Inventory hanya bertambah setelah QC approved.

---

# FLOW QC

Barang Datang
→ QC Inspection
→ Pass / Fail

PASS:
QC Approved
→ Inventory Available

FAIL:
QC Rejected
→ Return Supplier / Disposal

Audit:
- Apakah barang rejected tetap masuk stock?
- Apakah sistem menyimpan foto QC?
- Apakah sistem menyimpan berat aktual?
- Apakah sistem menyimpan batch dan expiry?

---

# FLOW INVENTORY

Inbound → Inventory Ledger
Outbound → Inventory Ledger

Inventory Ledger wajib menyimpan:
- Date
- Product
- Warehouse
- Batch
- Expiry Date
- Qty In
- Qty Out
- Unit Cost
- Reference Transaction
- User

Audit:
- Apakah seluruh movement menghasilkan ledger?
- Apakah stock dihitung dari ledger?
- Apakah stock opname menghasilkan adjustment transaction?

---

# FLOW SALES

Customer Order
→ Sales Order
→ Stock Reservation
→ Picking
→ Packing
→ Delivery
→ Invoice
→ Account Receivable

Rule:
Inventory berkurang saat Delivery, bukan Invoice.

---

# FLOW ACCOUNT RECEIVABLE

Invoice
→ AR Outstanding
→ Payment
→ AR Settlement

Status:
- Open
- Partial
- Paid
- Overdue

---

# FLOW ACCOUNT PAYABLE

Vendor Bill
→ AP Outstanding
→ Supplier Payment
→ AP Settlement

Status:
- Open
- Partial
- Paid
- Overdue

---

# FLOW CASH IN

Sumber:
- Customer Payment
- Other Income
- Owner Capital
- Refund Supplier
- Loan

Flow:
Cash In
→ Cash/Bank Ledger
→ Journal Engine

---

# FLOW CASH OUT

Sumber:
- Supplier Payment
- Payroll
- Operational Expense
- Tax
- Asset Purchase
- Other Expense

Flow:
Cash Out
→ Cash/Bank Ledger
→ Journal Engine

---

# ACCOUNTING ENGINE

User tidak membuat jurnal manual untuk transaksi operasional.

Semua jurnal dibuat otomatis oleh sistem.

Required Auto Journal:

## Barang Diterima
Debit Inventory
Credit AP Accrual

## Vendor Bill
Debit AP Accrual
Credit Account Payable

## Bayar Supplier
Debit Account Payable
Credit Cash/Bank

## Invoice Customer
Debit Account Receivable
Credit Sales Revenue

## Customer Payment
Debit Cash/Bank
Credit Account Receivable

## Delivery Barang
Debit Cost Of Goods Sold (COGS)
Credit Inventory

---

# HPP / COST OF GOODS SOLD

Purchase
→ Inventory
→ Delivery
→ COGS
→ Profit & Loss

Audit:
- Kapan HPP terbentuk?
- FIFO atau Moving Average?
- Apakah konsisten dengan inventory valuation?

---

# REPORTING LAYER

General Ledger harus menjadi single source of truth.

Laporan:
- Profit & Loss
- Balance Sheet
- Cash Flow
- Aging Receivable
- Aging Payable

---

# TRACEABILITY TEST

Verifikasi:

Invoice Customer
→ Journal
→ General Ledger
→ Profit & Loss

Vendor Bill
→ Journal
→ General Ledger
→ Balance Sheet

Supplier Payment
→ Journal
→ Cash Ledger
→ Cash Flow

Delivery
→ Inventory Movement
→ COGS
→ Profit & Loss

Tidak boleh ada angka laporan yang tidak dapat ditelusuri ke transaksi sumber.

---

# RED FLAGS

1. Inventory bertambah sebelum QC.
2. Invoice dibuat tanpa delivery.
3. Delivery tidak mengurangi stock.
4. Customer bayar tidak mengurangi AR.
5. Supplier dibayar tidak mengurangi AP.
6. Jurnal dapat diposting ganda.
7. HPP tidak sinkron dengan inventory.
8. Cash Flow tidak sinkron dengan Cash Ledger.
9. General Ledger tidak sinkron dengan subledger.
10. Laporan keuangan bypass General Ledger.

---

# OUTPUT YANG DIMINTA DARI AI AUDITOR

Audit:
- Database Schema
- Business Logic
- API
- Event Flow
- Accounting Flow
- Journal Engine
- Inventory Valuation
- Financial Reporting

Klasifikasi temuan:
- PASS
- WARNING
- CRITICAL ISSUE

Untuk setiap temuan:
- Modul
- Penyebab
- Dampak
- Contoh Kasus
- Rekomendasi Perbaikan

Target:
ERP Disma Fresh harus menghasilkan laporan keuangan yang akurat, audit-ready, scalable, dan tanpa ketergantungan jurnal manual.
