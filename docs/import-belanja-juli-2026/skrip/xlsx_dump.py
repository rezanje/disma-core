"""Minimal xlsx reader: stdlib only (zipfile + ElementTree). Enough to inspect a sheet."""
import sys, zipfile, re
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def load(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall(f"{NS}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rel_map = {r.get("Id"): r.get("Target") for r in rels}
    sheets = []
    for sh in wb.find(f"{NS}sheets"):
        rid = sh.get(f"{REL}id")
        target = rel_map[rid].lstrip("/")
        if not target.startswith("xl/"):
            target = "xl/" + target
        sheets.append((sh.get("name"), target))
    return z, shared, sheets


def rows_of(z, shared, target):
    root = ET.fromstring(z.read(target))
    out = []
    for row in root.iter(f"{NS}row"):
        cells = {}
        auto = 0  # cells may omit their ref; they then follow in order
        for c in row.findall(f"{NS}c"):
            v = c.find(f"{NS}v")
            if v is None:
                is_el = c.find(f"{NS}is")
                val = "".join(t.text or "" for t in is_el.iter(f"{NS}t")) if is_el is not None else ""
            elif c.get("t") == "s":
                val = shared[int(v.text)]
            else:
                val = v.text or ""
            ref = c.get("ref")
            idx = col_index(ref) if ref else auto
            auto = idx + 1
            cells[idx] = val
        width = max(cells) + 1 if cells else 0
        out.append([cells.get(i, "") for i in range(width)])
    return out


if __name__ == "__main__":
    path = sys.argv[1]
    z, shared, sheets = load(path)
    print("SHEETS:", [s[0] for s in sheets])
    for name, target in sheets:
        rows = rows_of(z, shared, target)
        print(f"\n=== {name} | {len(rows)} rows")
        for i, r in enumerate(rows[: int(sys.argv[2]) if len(sys.argv) > 2 else 8]):
            print(i, r)
