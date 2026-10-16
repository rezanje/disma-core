"""Real row-lock regression, restricted to the named disposable Docker database."""
import json
import os
import re
import subprocess

DB = os.environ.get('DISMA_TEST_DB', 'disma_audit_test')
if DB != 'disma_audit_test' and not re.fullmatch(r'disma_verify_[0-9_]+', DB):
    raise RuntimeError('Refusing non-fixture database')
fixture=json.loads(subprocess.check_output(['docker','inspect','disma-repair-tests-20261016'],text=True))[0]
if fixture['HostConfig']['NetworkMode']!='none' or fixture['HostConfig'].get('PortBindings'):
    raise RuntimeError('Refusing non-isolated container')

CMD = ['docker', 'exec', '-i', 'disma-repair-tests-20261016', 'psql', '-qAt', '-U', 'postgres', '-d', DB, '-v', 'ON_ERROR_STOP=1']

def sql(statement, check=True):
    result = subprocess.run(CMD, input=statement, text=True, capture_output=True)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result

setup = """
INSERT INTO public.users(id,name,role,pin) VALUES ('finance','Race Finance','finance','race-fixture-pin');
INSERT INTO public.coas(id,account_code,account_name,account_type) VALUES
 ('race-ar','1-2000','AR','Asset'),('race-bank','1-1000','Bank','Asset'),('race-ap','2-1000','AP','Liability');
INSERT INTO public.bank_accounts(id,name,account_code,balance) VALUES ('race-bank','Bank','1-1000',0),('race-ap-bank','AP bank','1-1000',200000),('race-other-bank','Other bank','1-1000',0),('race-ap-other-bank','Other AP bank','1-1000',200000);
INSERT INTO public.clients(id,company_name,pic_name,created_at) VALUES ('race-client','Client','PIC','2026-10-16');
INSERT INTO public.tukar_faktur(id,tf_number,client_id,period_start,period_end,issue_date,status,total_amount) VALUES ('90000000-0000-0000-0000-000000009001','TF-RACE','race-client','2026-10-01','2026-10-16','2026-10-16','Issued',200000);
INSERT INTO public.vendors(id,company_name,pic_name,created_at) VALUES ('race-vendor','Vendor','PIC','2026-10-16');
INSERT INTO public.vendor_bills(id,bill_number,vendor_id,vendor_name,issue_date,due_date,description,total_amount,status,created_at) VALUES ('race-bill','VB-RACE','race-vendor','Vendor','2026-10-16','2026-10-30','Test',150000,'Pending','2026-10-16');
INSERT INTO public.invoices(id,client_id,issue_date,due_date,total_amount,amount_paid,status) VALUES
 ('race-invoice','client','2026-10-01','2026-10-15',100000,0,'Unpaid'),
 ('race-retry','client','2026-10-01','2026-10-15',100000,0,'Unpaid'),
 ('race-tf-a','race-client','2026-10-01','2026-10-15',100000,0,'Unpaid'),
 ('race-tf-b','race-client','2026-10-01','2026-10-15',100000,0,'Unpaid');
UPDATE public.invoices SET tukar_faktur_id='90000000-0000-0000-0000-000000009001' WHERE id IN ('race-tf-a','race-tf-b');
"""
cleanup = """
DELETE FROM public.client_receipt_allocations WHERE invoice_id LIKE 'race-%';
DELETE FROM public.client_receipts WHERE id LIKE 'race-%';
DELETE FROM public.financial_events WHERE id LIKE 'race-%';
DELETE FROM public.journal_lines WHERE journal_entry_id LIKE 'receipt:race-%' OR journal_entry_id LIKE 'financial:race-%';
DELETE FROM public.journal_entries WHERE id LIKE 'receipt:race-%' OR id LIKE 'financial:race-%';
DELETE FROM public.cash_transactions WHERE id LIKE 'receipt:race-%' OR id LIKE 'financial:race-%';
DELETE FROM public.vendor_bills WHERE id='race-bill';
DELETE FROM public.vendors WHERE id='race-vendor';
DELETE FROM public.invoices WHERE id LIKE 'race-%';
DELETE FROM public.tukar_faktur WHERE id='90000000-0000-0000-0000-000000009001';
DELETE FROM public.clients WHERE id='race-client';
DELETE FROM public.bank_accounts WHERE id IN ('race-bank','race-ap-bank','race-other-bank','race-ap-other-bank');
DELETE FROM public.coas WHERE id IN ('race-ar','race-bank','race-ap');
DELETE FROM public.users WHERE id='finance';
"""
def receipt(event, invoice, bank="race-bank"):
    data = json.dumps(dict(paymentId=event, date='2026-10-16',bankAccountId=bank,amount=100000,allocations=[dict(invoiceId=invoice,amount=100000)]))
    return "SELECT public.record_client_receipt('" + data + "'::jsonb,'finance')->>'already_posted';"

def race(first, second):
    # Hold first transaction's invoice/event locks until the second client starts.
    a = subprocess.Popen(CMD, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    a.stdin.write('BEGIN;' + first + 'SELECT pg_sleep(0.4);COMMIT;')
    a.stdin.close()
    first_result = a.stdout.readline()
    assert first_result.strip() == 'false', first_result
    b = sql(second, check=False)
    a.wait(timeout=20)
    output = a.stdout.read(); error = a.stderr.read()
    if a.returncode:
        raise AssertionError(error)
    return b, output

sql(setup)
try:
    result, _ = race(receipt('race-a', 'race-invoice'), receipt('race-b', 'race-invoice','race-other-bank'))
    assert result.returncode != 0 and 'eligible' in result.stderr, result
    result, _ = race(receipt('race-lost-response', 'race-retry'), receipt('race-lost-response', 'race-retry'))
    assert result.returncode == 0 and result.stdout.strip() == 'true', result
    totals=sql("SELECT (SELECT count(*) FROM public.client_receipts WHERE id LIKE 'race-%'),(SELECT balance FROM public.bank_accounts WHERE id='race-bank'),(SELECT sum(amount_paid) FROM public.invoices WHERE id LIKE 'race-%');").stdout.strip()
    assert totals == '2|200000|200000', totals
    def vendor_payment(event, bank="race-ap-bank"):
        data=json.dumps(dict(eventId=event,kind='vendor-payment',date='2026-10-16',bankAccountId=bank,billId='race-bill',amount=100000))
        return "SELECT public.post_financial_event('" + data + "'::jsonb,'finance')->>'already_posted';"
    result,_=race(vendor_payment('race-ap1'),vendor_payment('race-ap2','race-ap-other-bank'))
    assert result.returncode != 0 and 'outstanding' in result.stderr, result
    assert sql("SELECT amount_paid FROM public.vendor_bills WHERE id='race-bill';").stdout.strip() == '100000'
    assert sql("SELECT balance FROM public.bank_accounts WHERE id='race-ap-bank';").stdout.strip() == '100000'
    assert sql("SELECT balance FROM public.bank_accounts WHERE id='race-ap-other-bank';").stdout.strip() == '200000'
    result,_=race(receipt('race-tf-payment-a','race-tf-a'),receipt('race-tf-payment-b','race-tf-b','race-other-bank'))
    assert result.returncode == 0, result.stderr
    assert sql("SELECT status FROM public.tukar_faktur WHERE id='90000000-0000-0000-0000-000000009001';").stdout.strip() == 'Paid', 'Concurrent last invoice receipts must close the TF'
    print('PASS concurrent receipts on different banks update shared TF status')
    print('PASS real concurrent AP payments from different banks cannot overpay')
    print('PASS real concurrent receipts into different banks cannot overpay; concurrent identical lost-response retries post once')
finally:
    sql(cleanup)
