"""Resolve every sheet item name to exactly one master product id (or NEW).

SKU codes are NOT unique in the master (24 collisions), product names are, so
every decision is pinned to a product id via its name.
"""
import csv, json, re, difflib, collections
from overrides import OVERRIDES

g1 = json.load(open('g1.json'))
products = g1['products']
by_id = {p['id']: p for p in products}
by_name = {}
for p in products:
    by_name.setdefault(p['name'].strip().upper(), []).append(p)

# decisions revised after checking the actual purchase prices, plus the owner's call
REVISED = {
    'BAWANG MERAH': 'NEW',                              # SKU generik, jangan tarik HPP varian
    'DIAMOND UHT MILK PLAIN @1LT': 'Diamond UHT Full Cream',
    'OREGANO DRY': 'NEW',
    'CHILI FLAKES @ 1KG': 'Chili Flakes',
    'PLASTIK WRAPPING MAKANAN UK 30 CM': 'NEW',
    'DELMONTE SAUCE SAMBAL @5,5KG': 'Delmonte Chilli Extra Hot @5.5Kg',
    'DELMONTE SAUCE SAMBAL @5.5KG': 'Delmonte Chilli Extra Hot @5.5Kg',
    'DELMONTE SAUCE SAMBAL @1KG': 'Delmonte Chilli Extra Hot @1Kg',
    'KANTONG PLASTIK BAWANG @1KG': 'Plastik Pex Bawang 35',
    'KANTONG PLASTIK PE UK 15X30 (1KG)': 'Plastik Tomat 15x30 (1Kg)',
    'GRATED  PARMESAN CHEESE PREMIUM@200GR': 'Cheese Parmesan Green Valley @200GR',
    'UDANG VANAME KUPAS (ISI 91/120) @1KG NON COOKED': 'NEW',
    'SPONS': 'NEW',
}

# categories for the new SKUs that are fresh produce — the margin ladder differs
NEW_CATEGORY = {
    'BAWANG MERAH': 'Sayuran',
    'PETAI BESAR': 'Sayuran',
    'OREGANO DRY': 'Dry Goods',
    'UDANG VANAME KUPAS (ISI 91/120) @1KG NON COOKED': 'Frozen food',
    'LAPCHIONG AROMA MALIA SOSIS AYAM@1KG': 'Frozen food',
    'SOSIS SAPI AKAI@1KG': 'Frozen food',
    'PAPER PLATE': 'ATK',
    'PLASTIK ROLL UK 25X40': 'ATK',
    'KANTONG PLASTIK PE UK 6X20': 'ATK',
    'PLASTIK WRAPPING MAKANAN UK 30 CM': 'ATK',
    'SPONS': 'ATK',
    'BAKING PAPER LABAKER 10MX40CM': 'ATK',
    'SUNLIGHT @4.5LTR': 'ATK',
}


def pick(sku_or_name, sheet_name):
    """Return the product dict for an override value that may be a SKU code."""
    if not sku_or_name.startswith('PRD-'):
        hits = by_name.get(sku_or_name.strip().upper(), [])
        assert len(hits) == 1, f'nama tidak unik / tidak ada: {sku_or_name} -> {len(hits)}'
        return hits[0]
    hits = [p for p in products if p['skuCode'] == sku_or_name]
    if len(hits) == 1:
        return hits[0]
    # SKU code collision: keep the candidate whose name is closest to the sheet name
    best = max(hits, key=lambda p: difflib.SequenceMatcher(
        None, re.sub(r'[^A-Z0-9]', '', sheet_name.upper()),
        re.sub(r'[^A-Z0-9]', '', p['name'].upper())).ratio())
    print(f'   [kode dobel] {sku_or_name} untuk "{sheet_name}" -> dipilih "{best["name"]}" '
          f'(kandidat lain: {[h["name"] for h in hits if h is not best]})')
    return best


rows = list(csv.DictReader(open(
    '/Users/rezanje/Gen_Dev_Studio/disma-core/docs/import-belanja-juli-2026/pencocokan-nama-barang.csv')))

resolution = {}   # sheet name -> {'productId': ..} | {'new': True, 'uom':.., 'category':..}
print('--- menyelesaikan tabrakan kode SKU ---')
for r in rows:
    name = r['nama_di_file']
    decision = REVISED.get(name, OVERRIDES.get(name))
    if decision is None:
        # auto-matched earlier (exact or >=0.95); pin it by the master name we recorded
        hits = by_name.get(r['nama_database'].strip().upper(), [])
        assert len(hits) == 1, f'auto-match ambigu: {name} -> {r["nama_database"]}'
        resolution[name] = {'productId': hits[0]['id'], 'via': 'auto'}
    elif decision == 'NEW':
        resolution[name] = {'new': True, 'uom': r['uom_file'] or 'Pcs',
                            'category': NEW_CATEGORY.get(name, 'Dry Goods'), 'via': 'baru'}
    elif decision == 'ASK':
        raise SystemExit(f'masih ASK, belum diputuskan: {name}')
    else:
        p = pick(decision, name)
        resolution[name] = {'productId': p['id'], 'via': 'manual'}

json.dump(resolution, open('resolution.json', 'w'), indent=1)
c = collections.Counter(v['via'] for v in resolution.values())
print('\nRESOLUSI:', dict(c), '| total', len(resolution))

# every mapped product must be distinct unless the sheet genuinely repeats a product
mapped = [v['productId'] for v in resolution.values() if 'productId' in v]
dupes = [k for k, n in collections.Counter(mapped).items() if n > 1]
if dupes:
    print('\ncatatan: beberapa nama file menunjuk produk yang sama (wajar, ejaan beda):')
    for d in dupes:
        names = [k for k, v in resolution.items() if v.get('productId') == d]
        print(f'   {by_id[d]["name"]}  <-  {names}')
