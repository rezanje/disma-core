"""Rebuild and test only the explicitly isolated DISMA repair container.

No configured application connection strings are read. A new temporary database is
created on the named --network none Docker fixture; existing databases are untouched.
"""
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
CONTAINER = 'disma-repair-tests-20261016'
DB = 'disma_verify_' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d_%H%M%S')

def run(args, **kwargs):
    result = subprocess.run(args, text=True, capture_output=True, **kwargs)
    if result.returncode:
        raise RuntimeError(result.stderr[-5000:] or result.stdout[-5000:])
    return result

container = json.loads(run(['docker', 'inspect', CONTAINER]).stdout)[0]
if container['HostConfig']['NetworkMode'] != 'none' or container['HostConfig'].get('PortBindings'):
    raise SystemExit('Refusing database tests: fixture must have network none and no exposed host ports.')

PSQL = ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-q', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1']
run(PSQL + ['-d', 'postgres'], input=f'CREATE DATABASE {DB};')
results = []
try:
    for file in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        run(PSQL + ['-d', DB], input=file.read_text())
        results.append({'file':str(file.relative_to(ROOT)), 'passed':True})
        print('PASS migration', file.name, flush=True)
    for file in sorted((ROOT/'tests').rglob('*.sql')):
        # Every fixture is bounded even if it forgot its own outer transaction.
        run(PSQL + ['-d', DB], input='BEGIN;\n'+file.read_text()+'\nROLLBACK;')
        results.append({'file':str(file.relative_to(ROOT)), 'passed':True})
        print('PASS SQL', file.relative_to(ROOT), flush=True)
    env = dict(os.environ, DISMA_TEST_DB=DB)
    for file in sorted((ROOT/'tests').rglob('concurrent-*.py')):
        run([sys.executable, str(file)], cwd=ROOT, env=env)
        results.append({'file':str(file.relative_to(ROOT)), 'passed':True})
        print('PASS concurrent', file.relative_to(ROOT), flush=True)
    goods_race=ROOT/'tests/operations/goods-concurrency.cjs'
    run(['node',str(goods_race)],cwd=ROOT,env=env)
    results.append({'file':str(goods_race.relative_to(ROOT)),'passed':True})
    print('PASS concurrent',goods_race.relative_to(ROOT),flush=True)
    out=ROOT/'.superpowers/database-results.json'
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({'database':DB,'results':results},indent=2))
    print(f'{len(results)} database checks passed against a fresh schema', flush=True)
finally:
    run(PSQL + ['-d', 'postgres'], input=f'DROP DATABASE {DB} WITH (FORCE);')
