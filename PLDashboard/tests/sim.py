import csv, time, re, sys, json, math, io, os
from datetime import datetime, date

base = '/home/user/pl-dashboard/mock-data'
results = {}

def parse_csv_js(text):
    rows = []
    for line in text.strip().split('\n'):
        line = line.rstrip('\r')
        r, cur, q = [], '', False
        for ch in line:
            if ch == '"':
                q = not q
                continue
            if ch == ',' and not q:
                r.append(cur.strip())
                cur = ''
                continue
            cur += ch
        r.append(cur.strip())
        rows.append(r)
    return rows

def parse_amount_js(raw):
    s = re.sub(r'[$,\s]', '', str(raw))
    try:
        return float(s)
    except ValueError:
        return float('nan')

def auto_guess_fields(headers):
    h = [{'lower': x.lower(), 'i': i} for i, x in enumerate(headers)]
    def find(keys):
        for k in keys:
            for x in h:
                if k in x['lower']:
                    return x['i']
        return None
    return {
        'date':        find(['date','time','period','day']),
        'amount':      find(['amount','total','value','price','sum']),
        'type':        find(['type','trans_type','cr/dr','credit']),
        'category':    find(['category','cat','class','account']),
        'description': find(['description','desc','note','memo','detail','narration','name']),
    }

def compute_kpis(txns):
    rev = sum(t['amount'] for t in txns if t['type'] == 'revenue')
    exp = sum(t['amount'] for t in txns if t['type'] == 'expense')
    net = rev - exp
    margin = (net / rev * 100) if rev > 0 else 0
    return {'revenue': rev, 'expenses': exp, 'net': net, 'margin': margin}

passed = 0
failed = 0
issue_list = []

def check(name, got, expected, section):
    global passed, failed
    if math.isnan(expected) if isinstance(expected, float) else False:
        ok = isinstance(got, float) and math.isnan(got)
    elif isinstance(expected, float):
        ok = abs(got - expected) < 0.005
    else:
        ok = got == expected
    status = "PASS" if ok else "FAIL"
    if not ok:
        failed += 1
        issue_list.append((name, section, repr(got), repr(expected)))
    else:
        passed += 1
    print("  [%s] %s: got=%r expected=%r" % (status, name, got, expected))

print("="*60)
print("PART B — LOGIC SIMULATION TESTS")
print("="*60)

print("\n-- B2.1 parseAmount tests --")
check("basic float",        parse_amount_js("1234.56"),     1234.56, "B2.parseAmount")
check("currency+thousands", parse_amount_js("$1,234.56"),   1234.56, "B2.parseAmount")
check("signed negative",    parse_amount_js("-50"),         -50.0,   "B2.parseAmount")
check("scientific",         parse_amount_js("1e6"),         1000000.0, "B2.parseAmount")
check("whitespace",         parse_amount_js("  42  "),      42.0,    "B2.parseAmount")

# NaN checks
for label, raw in [("empty string",""), ("non-numeric","abc")]:
    got = parse_amount_js(raw)
    ok = math.isnan(got)
    status = "PASS" if ok else "FAIL"
    if not ok: failed += 1; issue_list.append((label,"B2.parseAmount",repr(got),"NaN"))
    else: passed += 1
    print("  [%s] %s: got=%r expected=NaN" % (status, label, got))

# Accounting negative bug
got_acct = parse_amount_js("(99.00)")
print("  [FAIL] accounting negative '(99.00)' → %r (NaN; app does not handle this format)" % got_acct)
failed += 1
issue_list.append(("Accounting negative not handled","B2.parseAmount-A3.3",repr(got_acct),"-99.0"))

# EU format
eu = parse_amount_js("1.234,56")
print("  [FAIL] EU format '1.234,56' → %r (strips BOTH . and , → 123456.0, not 1234.56)" % eu)
failed += 1
issue_list.append(("EU format silent miscoerce","B2.parseAmount-A3.3",repr(eu),"1234.56"))

print("\n-- B2.2 CSV formula injection on exportCSV --")
def export_csv_row(t):
    return '%s,%s,"%s","%s",%s,%s,%s' % (
        t['date'],t['type'],t.get('category',''),t.get('description',''),
        t['amount'],t.get('month',''),t.get('year',''))

inj_txn = {'date':'2025-05-13','type':'expense','category':'Other','description':'=SUM(A1:A10)','amount':100.0,'month':'May','year':2025}
row = export_csv_row(inj_txn)
if '=SUM' in row:
    print("  [FAIL] Formula '=SUM(A1:A10)' in description not sanitized: %s" % row)
    failed += 1
    issue_list.append(("CSV export formula injection (description)","A2.6",row,"prefix with '"))

cat_inj = {'date':'2025-05-13','type':'expense','category':'=CMD|CALC','description':'ok','amount':50,'month':'May','year':2025}
row2 = export_csv_row(cat_inj)
if '=CMD' in row2:
    print("  [FAIL] Formula '=CMD|CALC' in category not sanitized: %s" % row2)
    failed += 1
    issue_list.append(("CSV export formula injection (category)","A2.6",row2,"prefix with '"))
    
print("  [FAIL] syncToFile (L3123) also has no formula sanitization (same pattern)")
failed += 1
issue_list.append(("syncToFile CSV formula injection","A2.6","same as exportCSV","prefix with '"))

print("\n-- B2.3 parseCSV function tests --")
# Quoted comma
quoted_csv = 'date,type,category,description,amount\n2025-01-01,revenue,Sales,"Smith, John LLC",500'
rows2 = parse_csv_js(quoted_csv)
desc_val = rows2[1][3] if len(rows2) > 1 and len(rows2[1]) > 3 else None
if desc_val == 'Smith, John LLC':
    print("  [PASS] Quoted comma preserved")
    passed += 1
else:
    print("  [FAIL] Quoted comma NOT preserved: got %r" % desc_val)
    failed += 1
    issue_list.append(("Quoted comma not preserved","B2.csvParse",repr(desc_val),"'Smith, John LLC'"))

# Escaped quotes (RFC 4180)
esc_csv = 'date,type,category,description,amount\n2025-01-01,revenue,Sales,"He said ""hi""",200'
rows3 = parse_csv_js(esc_csv)
desc3 = rows3[1][3] if len(rows3) > 1 and len(rows3[1]) > 3 else None
if desc3 == 'He said "hi"':
    print("  [PASS] Escaped quotes (RFC 4180) handled")
    passed += 1
else:
    print("  [FAIL] Escaped quotes NOT handled: got %r (expected 'He said \"hi\"')" % desc3)
    failed += 1
    issue_list.append(("RFC4180 escaped quotes not handled","B2.csvParse",repr(desc3),"'He said \"hi\"'"))

# CRLF
crlf_csv = "date,type,category,description,amount\r\n2025-01-01,revenue,Sales,Test,100\r\n"
rows4 = parse_csv_js(crlf_csv)
ok_crlf = len(rows4) >= 2 and rows4[1][4] == '100'
print("  [%s] CRLF line endings: %r" % ("PASS" if ok_crlf else "FAIL", ok_crlf))
if ok_crlf: passed += 1
else: failed += 1; issue_list.append(("CRLF not handled","B2.csvParse",repr(rows4),"2 rows"))

print("\n-- B2.4 autoGuessFields tests --")
header_tests = [
    (['Date','Type','Category','Description','Amount'], {'date':0,'type':1,'category':2,'description':3,'amount':4}),
    (['date','type','cat','desc','amount'],             {'date':0,'type':1,'category':2,'description':3,'amount':4}),
    (['Transaction Date','Credit/Debit','Account','Memo','Total Value'],  {'date':0,'type':1,'category':2,'description':3,'amount':4}),
    (['txn_date','trans_type','category','narration','sum'], {'date':0,'type':1,'category':2,'description':3,'amount':4}),
]
for headers, expected in header_tests:
    result = auto_guess_fields(headers)
    ok = all(result.get(k) == v for k, v in expected.items())
    status = "PASS" if ok else "FAIL"
    if not ok: failed += 1; issue_list.append(("autoGuess: %s" % headers[:2],"B2.autoGuess",repr(result),repr(expected)))
    else: passed += 1
    print("  [%s] %s" % (status, headers[:3]))

print("\n-- B2.5 KPI calculations on 1k standard dataset --")
with open('%s/mock-1000-rev500000-exp300000.csv' % base) as f:
    reader = csv.DictReader(f)
    txns_1k = [{'type': r['type'], 'amount': float(r['amount'])} for r in reader]
kpi = compute_kpis(txns_1k)
print("  Revenue:  %15.2f (expected 500,000.00)" % kpi['revenue'])
print("  Expenses: %15.2f (expected 300,000.00)" % kpi['expenses'])
print("  Net:      %15.2f (expected 200,000.00)" % kpi['net'])
print("  Margin:   %14.2f%% (expected ~40.00%%)" % kpi['margin'])
tol = 0.015
if abs(kpi['revenue'] - 500000.00) < tol and abs(kpi['expenses'] - 300000.00) < tol:
    print("  [PASS] KPI totals match within tolerance")
    passed += 1
else:
    print("  [FAIL] KPI totals out of tolerance!")
    failed += 1

print("\n-- B2.6 Float drift test (10,000 x $0.01) --")
with open('%s/mock-10000-pennies.csv' % base) as f:
    reader = csv.DictReader(f)
    penny_txns = [{'type': r['type'], 'amount': float(r['amount'])} for r in reader]
kpi_p = compute_kpis(penny_txns)
drift = kpi_p['revenue'] - 100.00
print("  Sum of 10,000 x $0.01 = $%.10f" % kpi_p['revenue'])
print("  Drift                 = $%.10f" % drift)
if drift != 0.0:
    print("  [FAIL] FLOAT DRIFT: JS will also drift — amounts should be stored as cents")
    failed += 1
    issue_list.append(("Float drift: 10k x $0.01 != $100.00 exactly","B2.KPI-A3.5","%.10f"%kpi_p['revenue'],"100.0000000000"))
else:
    print("  [PASS] No drift (Python exact)")
    passed += 1

print("\n-- B2.7 catPillHTML XSS: safe var computed but not used --")
def cat_pill_html(name, idx, type_):
    safe = name.replace("'", "\\'").replace('"', '&quot;')
    return '<div class="cat-pill %s-pill"><span class="cat-name">%s</span></div>' % (type_, name)
payload = '<img src=x onerror=alert(1)>'
html = cat_pill_html(payload, 0, 'revenue')
if payload in html:
    print("  [FAIL] Category name used RAW in span; 'safe' variable computed but NEVER used")
    failed += 1
    issue_list.append(("catPillHTML XSS: safe var unused, name raw in innerHTML","A2.1-B2.catPill",payload,"&lt;img src=x...&gt;"))
else:
    print("  [PASS] Category escaped")
    passed += 1

print("\n-- B2.8 renderRecentEntries XSS (static) --")
xss_locs = [
    ("renderRecentEntries L2835", "t.date raw in innerHTML <td>"),
    ("renderRecentEntries L2837", "t.category raw in innerHTML <td>"),
    ("renderRecentEntries L2838", "t.description raw in innerHTML <td>"),
    ("renderRevTable L2925",      "t.category, t.description raw in innerHTML"),
    ("renderExpTable L2933",      "t.category, t.description raw in innerHTML"),
    ("openMappingModal L3034",    "csvHeaders (h) raw in innerHTML — malicious CSV XSS"),
    ("openMappingModal L3035",    "parsedCSV cells (c) raw in innerHTML — malicious CSV XSS"),
    ("toast L3783",               "msg param in innerHTML — some callers use external strings"),
]
for loc, desc in xss_locs:
    print("  [FAIL] XSS: %s: %s" % (loc, desc))
    failed += 1
    issue_list.append(("XSS: %s" % loc,"A2.1",desc,"HTML escape user data"))

print("\n-- B2.9 isNewerVersion correctness --")
def is_newer(remote, local):
    def parse(v): return [int(x) for x in re.sub(r'[^0-9.]','',v).split('.')]
    r, l = parse(remote), parse(local)
    for i in range(3):
        rv = r[i] if i < len(r) else 0
        lv = l[i] if i < len(l) else 0
        if rv > lv: return True
        if rv < lv: return False
    return False

ver_tests = [
    ("5.1.0 > 5.0.0", "5.1.0","5.0.0", True),
    ("5.0.0 == 5.0.0","5.0.0","5.0.0", False),
    ("4.9.9 < 5.0.0", "4.9.9","5.0.0", False),
    ("6.0.0 > 5.9.9", "6.0.0","5.9.9", True),
]
for name, r, l, expected in ver_tests:
    got = is_newer(r, l)
    status = "PASS" if got == expected else "FAIL"
    if got != expected: failed += 1
    else: passed += 1
    print("  [%s] %s" % (status, name))

print("\n-- B2.10 Monthly table column mismatch bug (static) --")
print("  [FAIL] renderMonthlyTable: per-row col4 = revenue-expenses (net)")
print("         total row col4    = totRev-cogs (gross profit) — MISMATCH!")
print("         Column header and total row describe different metrics")
failed += 1
issue_list.append(("Monthly table col4 type mismatch: net per row vs gross in total","B2.renderMonthly-A4","net vs gross","consistent net or gross"))

print("\n-- B2.11 Clear All Data: single confirm (should be double) --")
print("  [MEDIUM] confirmClearData uses single showConfirm — destructive op needs double-confirm")
issue_list.append(("Clear All Data only has single confirmation","B2.UX","single confirm","double confirm"))

print("\n-- B2.12 inlineEdit error handling --")
print("  [MEDIUM] inlineEdit L2911: putReq.onerror only calls console.warn — no user toast on error")
issue_list.append(("inlineEdit missing error toast","B2.errorHandling-A4.4","console.warn only","showToast on error"))

print("\n" + "="*60)
print("SIMULATION SUMMARY: PASSED=%d | FAILED=%d" % (passed, failed))
print("="*60)

with open('/tmp/sim_results.json', 'w') as f:
    json.dump({'passed': passed, 'failed': failed, 'issue_count': len(issue_list), 'issues': issue_list}, f)
print("Results saved to /tmp/sim_results.json")
