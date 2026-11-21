from pathlib import Path
import sys,subprocess,os,json,shutil
ROOT=Path(__file__).resolve().parents[1]
from admin_common import project_environment
from database import connect
with connect() as conn:
 before=conn.execute('select year,last_value from public.quotation_counters order by year').fetchall()
 # Install the same identity guard on QA only; production cutover is later.
 sql=(ROOT/'migrations/002-lock-issued-identities.sql').read_text();head=sql[:sql.index('drop trigger')];tail=sql[sql.index('drop trigger if exists pasha_managed_identity on quote_qa'):].split('-- Production-only')[0]
 conn.execute(head+tail,prepare=False)
env=dict(os.environ);env.update(project_environment());env['QUOTATION_MODE']='qa'
if '--deployed' in sys.argv:env['QA_BASE_URL']=json.loads((ROOT/'evidence/deploy-qa.json').read_text())['deploy_ssl_url']
node=os.environ.get('NODE_BIN') or shutil.which('node') or '/Users/jordi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
result=subprocess.run([node,str(ROOT/'tests/qa-live.mjs')],env=env)
with connect() as conn:
 after=conn.execute('select year,last_value from public.quotation_counters order by year').fetchall();assert before==after
 guard=[]
 from psycopg.errors import InsufficientPrivilege,InvalidParameterValue
 try:
  with conn.transaction():conn.execute("insert into quote_qa.quotations(vendor,quotation_number,date_of_issue) values('SCHROEDER','MANUAL-999',current_date)")
 except InsufficientPrivilege:guard.append('Direct manual INSERT rejected')
 row=conn.execute('select id from quote_qa.quotations limit 1').fetchone()
 try:
  with conn.transaction():conn.execute("update quote_qa.quotations set quotation_number='MANUAL-999' where id=%s",row)
 except InvalidParameterValue:guard.append('Direct reference UPDATE rejected')
 assert len(guard)==2
 version_count=conn.execute('select count(*) from quote_qa.quotation_versions').fetchone()[0]
 print('Database guards:',guard,'saved revision snapshots:',version_count,'official counters unchanged:',after)
 (ROOT/'evidence/database-guards.json').write_text(json.dumps({'guards':guard,'versions':version_count,'officialBefore':before,'officialAfter':after},indent=2))
sys.exit(result.returncode)
