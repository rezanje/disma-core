"""Disposable PostgreSQL fixture only; no app credentials or network targets."""
import concurrent.futures
import subprocess
import os
import json

CONTAINER = 'disma-repair-tests-20261016'
DATABASE = os.environ.get('DISMA_TEST_DB', '')
assert DATABASE.startswith('disma_verify_'), 'Set DISMA_TEST_DB to a disposable disma_verify_ database'
container=json.loads(subprocess.run(['docker','inspect',CONTAINER],capture_output=True,text=True,check=True).stdout)[0]
assert container['HostConfig']['NetworkMode']=='none' and not container['HostConfig'].get('PortBindings'), 'Fixture must have no network or exposed ports'
def sql(body):
    return subprocess.run(['docker','exec','-i',CONTAINER,'psql','-U','postgres','-d',DATABASE,'-v','ON_ERROR_STOP=1','-At'],input=body,text=True,capture_output=True)
def checked(body):
    result=sql(body)
    assert result.returncode==0, result.stderr
    return result.stdout.strip()
def statement(letter):
    return f"jsonb_build_object('id','statement:'||repeat('{letter}',64),'contentHash',repeat('{letter}',64),'bankAccountId','recon-concurrent-bank','fileName','concurrent.csv','rows','[{{\"date\":\"2026-10-01\",\"description\":\"Client\",\"amount\":100,\"type\":\"CR\"}}]'::jsonb)"
try:
    checked("""
    INSERT INTO public.coas(id,account_code,account_name,account_type) VALUES ('recon-concurrent-coa','1-1097','Concurrent bank','Asset');
    INSERT INTO public.bank_accounts(id,name,account_code,balance) VALUES ('recon-concurrent-bank','Concurrent bank','1-1097',0);
    INSERT INTO public.journal_entries(id,transaction_date,description,reference_type,reference_id) VALUES ('recon-concurrent-je','2026-10-01','Concurrent','Manual','recon-concurrent');
    INSERT INTO public.journal_lines(id,journal_entry_id,account_id,debit_amount,credit_amount) VALUES ('recon-concurrent-line','recon-concurrent-je','recon-concurrent-coa',100,0);
    """)
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        imports=list(pool.map(lambda _:sql(f"SELECT public.import_bank_reconciliation({statement('c')},'finance');"),range(2)))
    assert all(result.returncode==0 for result in imports), [r.stderr for r in imports]
    checked(f"SELECT public.import_bank_reconciliation({statement('d')},'finance');")
    def match(letter):
        return sql(f"SELECT public.match_bank_reconciliation(jsonb_build_object('eventId','concurrent-{letter}','statementId','statement:'||repeat('{letter}',64),'rowId','statement:'||repeat('{letter}',64)||':1','journalLineId','recon-concurrent-line'),'finance');")
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        matches=list(pool.map(match,['c','d']))
    assert sorted(result.returncode==0 for result in matches)==[False,True], [r.stderr for r in matches]
    assert checked("SELECT count(*) FROM public.bank_reconciliation_matches WHERE journal_line_id='recon-concurrent-line';")=='1'
    assert checked("SELECT count(*) FROM public.bank_reconciliation_statements WHERE bank_account_id='recon-concurrent-bank';")=='2'
    print('Concurrent duplicate imports and cross-session GL reuse checks passed')
finally:
    checked("""
    DELETE FROM public.bank_reconciliation_matches WHERE journal_line_id='recon-concurrent-line';
    DELETE FROM public.bank_reconciliation_rows WHERE statement_id IN (SELECT id FROM public.bank_reconciliation_statements WHERE bank_account_id='recon-concurrent-bank');
    DELETE FROM public.bank_reconciliation_statements WHERE bank_account_id='recon-concurrent-bank';
    DELETE FROM public.journal_lines WHERE id='recon-concurrent-line';
    DELETE FROM public.journal_entries WHERE id='recon-concurrent-je';
    DELETE FROM public.bank_accounts WHERE id='recon-concurrent-bank';
    DELETE FROM public.coas WHERE id='recon-concurrent-coa';
    """)
