"""Import 'historical belanja juli sampai 27.xlsx' into DISMA CORE.

Writes through the app's own /api/db endpoint (camelCase in, snake_case stored).
Run with --dry to print the plan without writing anything.

Decisions behind every rule live in docs/import-belanja-juli-2026/ADR-001.
"""
import sys, json, uuid, datetime, collections, urllib.request, urllib.error
from xlsx_dump import load, rows_of

DRY = '--dry' in sys.argv
API = 'http://localhost:3000/api/db'
SHEET = '/Users/rezanje/Downloads/historical belanja juli sampai 27.xlsx'
SOURCE_TAG = 'Import belanja Juli 2026'
SOURCER = '22222222-2222-2222-2222-222222222222'   # Hilman (Sourcing)
COA_PERSEDIAAN = 'coa-3'        # 1-3000 Persediaan Barang Dagang
COA_HUTANG = 'coa-10'           # 2-1000 Utang Usaha (Vendor)
COA_BANK = 'coa-1'              # Bank Jago (Belanja) carries accountCode 1-1000
BANK_ID = 'bank-1780130179663'

FRESH = {'sayuran', 'buah'}
LADDER_FRESH = [50, 30, 20, 10, 15]
LADDER_PACKAGED = [30, 25, 20, 10, 15]


def tiers_for(base, category):
    ladder = LADDER_FRESH if (category or '').strip().lower() in FRESH else LADDER_PACKAGED
    return [-(-int(base * (1 + m / 100)) // 1000) * 1000 for m in ladder]


def post(table, data, batch=40):
    """Upsert in small batches — a single 333-product body (with priceHistory) 500s."""
    if DRY:
        print(f'   [dry] {table}: {len(data) if isinstance(data, list) else 1} baris')
        return
    items = data if isinstance(data, list) else [data]
    done = 0
    for i in range(0, len(items), batch):
        chunk = items[i:i + batch]
        body = json.dumps({'table': table, 'data': chunk}).encode()
        req = urllib.request.Request(API, body, {'Content-Type': 'application/json'}, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                res = json.loads(r.read())
        except urllib.error.HTTPError as e:
            raise SystemExit(f'gagal {table} batch {i}: {e.code} {e.read().decode()[:400]}')
        if not res.get('success'):
            raise SystemExit(f'gagal menulis {table}: {res}')
        done += res.get('count', len(chunk))
    print(f'   {table}: {done} baris')


# ---------------------------------------------------------------- read sheet
z, shared, sheets = load(SHEET)
raw = rows_of(z, shared, sheets[0][1])
cols = {n: i for i, n in enumerate(raw[2]) if n}
data_rows = [r for r in raw[3:] if any(c.strip() for c in r)]


def cell(r, n):
    i = cols.get(n)
    return (r[i].strip() if i is not None and i < len(r) else '')


def num(r, n):
    try:
        return float(cell(r, n) or 0)
    except ValueError:
        return 0.0


def xdate(v):
    try:
        return datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(v)))
    except ValueError:
        return None


def classify(r):
    sup, pay, tgl = cell(r, 'SUPPLIER'), cell(r, 'PAYMENT').upper(), cell(r, 'TGL BAYAR')
    if sup and 'TRANSFER' in pay and not tgl.isdigit():
        return 'hutang'
    return 'lunas'


items = []
for r in data_rows:
    name, d = cell(r, 'NAMA BARANG').upper(), xdate(cell(r, 'TANGGAL'))
    if not name or not d:
        continue
    items.append({
        'name': name, 'date': d, 'qty': num(r, 'QUANTITY'),
        'unit': num(r, 'HARGA SATUAN'), 'total': num(r, 'HARGA TOTAL'),
        'uom': (r[4].strip() if len(r) > 4 else '') or 'Pcs',
        'supplier': cell(r, 'SUPPLIER').upper(), 'payment': cell(r, 'PAYMENT'),
        'paidDate': cell(r, 'TGL BAYAR'), 'status': classify(r),
        'note': cell(r, 'TGL BAYAR') if not cell(r, 'TGL BAYAR').isdigit() else '',
    })
print(f'baris terbaca: {len(items)}')

# ---------------------------------------------------------------- masters
g1, g4 = json.load(open('g1.json')), json.load(open('g4.json'))
products = {p['id']: dict(p) for p in g1['products']}
vendors = {v['companyName'].strip().upper(): v for v in g4['vendors']}
resolution = json.load(open('resolution.json'))

VENDOR_ALIAS = {'ALFATIH FORZEN': 'ALFATIH FROZEN'}
new_vendors = []
for sup in sorted({i['supplier'] for i in items if i['supplier']}):
    key = VENDOR_ALIAS.get(sup, sup)
    if key not in vendors:
        v = {'id': str(uuid.uuid4()), 'companyName': key, 'picName': '', 'email': '', 'phone': '',
             'address': '', 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
             'isTempo': True, 'kind': 'vendor'}
        vendors[key] = v
        new_vendors.append(v)


def vendor_id(sup):
    if not sup:
        return None
    return vendors[VENDOR_ALIAS.get(sup, sup)]['id']


# ------------------------------------------------- new SKUs + price per SKU
next_sku = max(int(p['skuCode'].replace('PRD-', '')) for p in products.values()
               if p.get('skuCode', '').startswith('PRD-') and
               p['skuCode'].replace('PRD-', '').isdigit()) + 1
by_pname = {p['name'].strip().upper(): p for p in products.values()}
new_products = []
for name, res in resolution.items():
    if not res.get('new'):
        continue
    already = by_pname.get(name.title().upper())   # re-run safe: reuse what a prior run made
    if already:
        res['productId'] = already['id']
        continue
    pid = str(uuid.uuid4())
    p = {'id': pid, 'skuCode': f'PRD-{next_sku}', 'name': name.title(), 'uom': res['uom'],
         'basePrice': 0, 'sellingPrice': 0, 'currentStock': 0, 'b2cStock': 0,
         'category': res['category'], 'priceHistory': [], 'defaultVendorId': None}
    next_sku += 1
    products[pid] = p
    new_products.append(p)
    res['productId'] = pid

per_product = collections.defaultdict(list)
for it in items:
    per_product[resolution[it['name']]['productId']].append(it)

updated, price_report = [], []
for pid, rows_ in per_product.items():
    p = products[pid]
    weeks = collections.defaultdict(list)
    for it in rows_:
        weeks[it['date'].isocalendar()[:2]].append(it)
    last_week = max(weeks)
    hpp = max(it['unit'] for it in weeks[last_week] if it['unit'] > 0) if any(
        it['unit'] > 0 for it in weeks[last_week]) else p.get('basePrice', 0)
    prices = [it['unit'] for it in rows_ if it['unit'] > 0]
    old = p.get('basePrice') or 0
    t1, t2, t3, t4, t5 = tiers_for(hpp, p.get('category'))
    history = list(p.get('priceHistory') or [])
    for it in sorted(rows_, key=lambda x: x['date']):
        history.append({'date': it['date'].isoformat() + 'T00:00:00.000Z',
                        'price': it['unit'], 'source': SOURCE_TAG})
    vendor_freq = collections.Counter(it['supplier'] for it in rows_ if it['supplier'])
    p.update({
        'basePrice': hpp, 'tier1Price': t1, 'tier2Price': t2, 'tier3Price': t3,
        'tier4Price': t4, 'tier5Price': t5, 'priceHistory': history,
        'weeklyPriceRange': {'min': min(prices) if prices else hpp,
                             'max': max(prices) if prices else hpp,
                             'lastUpdated': max(it['date'] for it in rows_).isoformat() + 'T00:00:00.000Z'},
        'currentStock': (p.get('currentStock') or 0) + sum(it['qty'] for it in rows_),
        'defaultVendorId': vendor_id(vendor_freq.most_common(1)[0][0]) if vendor_freq else p.get('defaultVendorId'),
    })
    if not p.get('sellingPrice'):
        p['sellingPrice'] = hpp
    updated.append(p)
    price_report.append((p['name'], old, hpp, len(rows_)))

# ------------------------------------------------------- purchases + journal
purchases, purchase_items, vprices, jentries, jlines = [], [], [], [], []
by_date = collections.defaultdict(list)
for it in items:
    by_date[it['date']].append(it)

for d in sorted(by_date):
    day = by_date[d]
    pur_id = str(uuid.uuid4())
    spent = sum(it['total'] for it in day)
    purchases.append({
        'id': pur_id, 'date': d.isoformat() + 'T00:00:00.000Z', 'purchaserId': SOURCER,
        'status': 'Selesai', 'actualSpent': spent, 'budgetAmount': spent,
        'budgetBankAccountId': BANK_ID,
        'reconciliationNote': f'{SOURCE_TAG} — {len(day)} item',
    })
    for it in day:
        purchase_items.append({
            'id': str(uuid.uuid4()), 'purchaseId': pur_id,
            'productId': resolution[it['name']]['productId'],
            'qtyTarget': it['qty'], 'qtyPurchased': it['qty'],
            'estimatedUnitPrice': it['unit'], 'actualUnitPrice': it['unit'],
            'isChecked': True, 'isQCed': True, 'vendorId': vendor_id(it['supplier']),
            'notes': ' '.join(x for x in [it['payment'], it['note']] if x).strip() or None,
        })
    je_id = str(uuid.uuid4())
    jentries.append({'id': je_id, 'transactionDate': d.isoformat(),
                     'description': f'{SOURCE_TAG} — belanja {d.isoformat()}',
                     'referenceType': 'Purchase', 'referenceId': pur_id})
    jlines.append({'id': str(uuid.uuid4()), 'journalEntryId': je_id, 'accountId': COA_PERSEDIAAN,
                   'debitAmount': spent, 'creditAmount': 0})
    paid = sum(it['total'] for it in day if it['status'] == 'lunas')
    if paid:
        jlines.append({'id': str(uuid.uuid4()), 'journalEntryId': je_id, 'accountId': COA_BANK,
                       'debitAmount': 0, 'creditAmount': paid})
    debt = collections.defaultdict(float)
    for it in day:
        if it['status'] == 'hutang':
            debt[it['supplier']] += it['total']
    for sup, amt in debt.items():
        jlines.append({'id': str(uuid.uuid4()), 'journalEntryId': je_id, 'accountId': COA_HUTANG,
                       'debitAmount': 0, 'creditAmount': amt, 'vendorId': vendor_id(sup)})

# vendor price list: latest price each vendor charged for each SKU
latest = {}
for it in items:
    if not it['supplier']:
        continue
    key = (vendor_id(it['supplier']), resolution[it['name']]['productId'])
    if key not in latest or it['date'] > latest[key]['date']:
        latest[key] = it
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
for (vid, pid), it in latest.items():
    vprices.append({'id': str(uuid.uuid4()), 'vendorId': vid, 'productId': pid,
                    'price': it['unit'], 'uom': it['uom'],
                    'validFrom': it['date'].isoformat(), 'validTo': '2026-08-31',
                    'status': 'active', 'source': 'admin', 'notes': SOURCE_TAG,
                    'lastUpdated': now, 'createdAt': now})

total_debt = sum(l['creditAmount'] for l in jlines if l['accountId'] == COA_HUTANG)
print(f"""
RENCANA TULIS
  vendor baru        : {len(new_vendors)}   {[v['companyName'] for v in new_vendors]}
  produk baru        : {len(new_products)}
  produk di-update   : {len(updated)}
  purchases          : {len(purchases)}
  purchase_items     : {len(purchase_items)}
  vendor_prices      : {len(vprices)}
  journal_entries    : {len(jentries)}  ({len(jlines)} baris jurnal)
  total hutang       : Rp{total_debt:,.0f}
  total belanja      : Rp{sum(p['actualSpent'] for p in purchases):,.0f}""")

naik = sorted([r for r in price_report if r[1] and r[2] > r[1] * 1.3], key=lambda r: -(r[2] / r[1]))
print(f'\n  HPP naik >30%: {len(naik)} SKU (10 teratas)')
for n, o, new, c in naik[:10]:
    print(f'    {n[:44]:44s} {o:>10,.0f} -> {new:>10,.0f}  ({c}x beli)')

if DRY:
    json.dump({'newProducts': new_products, 'updated': len(updated)}, open('plan.json', 'w'))
    raise SystemExit('\n(dry run, tidak ada yang ditulis)')

print('\nMENULIS...')
if new_vendors:
    post('vendors', new_vendors)
post('products', new_products + updated)
post('purchases', purchases)
post('purchase_items', purchase_items)
post('vendor_prices', vprices)
post('journal_entries', jentries)
post('journal_lines', jlines)
print('selesai.')
