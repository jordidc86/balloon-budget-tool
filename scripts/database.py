"""Admin migrations: credentials from environment or the existing Netlify CLI session."""
from pathlib import Path
import os,sys,json,re,uuid,hashlib,datetime
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'tooling/python'))
import psycopg

def database_url():
 if os.environ.get('DATABASE_URL'):return os.environ['DATABASE_URL']
 from admin_common import project_environment
 return project_environment()['DATABASE_URL']
def connect():return psycopg.connect(database_url(),connect_timeout=20,prepare_threshold=None)
def doc(row):
 return dict(id=str(row['id']),vendor=row['vendor'],quotationNumber=row['quotation_number'],dateOfIssue=str(row['date_of_issue']),customerData=row.get('customer_data') or {},conditions=row.get('conditions') or '',discount=float(row.get('discount_percent') or 0),grossTotal=float(row.get('gross_total') or 0),netTotal=float(row.get('net_total') or 0),items=row.get('items') or [],revision=row.get('revision') or 1)

def migrate():
 from psycopg.types.json import Jsonb
 from psycopg.rows import dict_row
 with connect() as conn:
  with conn.cursor(row_factory=dict_row) as c:
   c.execute('select * from public.quotations');modern=c.fetchall();c.execute('select * from public."Quotation"');legacy=c.fetchall()
   backup=ROOT.parent/'.private-backups';backup.mkdir(exist_ok=True);backup.chmod(0o700)
   path=backup/f'quotations-before-v2-{datetime.datetime.now().strftime("%Y%m%d-%H%M%S")}.json'
   path.write_text(json.dumps({'quotations':modern,'Quotation':legacy},default=str,ensure_ascii=False,indent=2));path.chmod(0o600)
   c.execute((ROOT/'migrations/001-managed-quotations.sql').read_text(),prepare=False)
   for row in legacy:
    number=row['quotationNumber'];c.execute('select id from public.quotations where quotation_number=%s',(number,))
    if c.fetchone():continue
    selected=row['items'];vendor='PASHA' if any(str(s.get('item',{}).get('id','')).startswith('pasha') for s in selected) else 'SCHROEDER'
    gross=round(sum(float(s.get('customPrice',s['item'].get('price',0)) or 0)*float(s.get('quantity',1)) for s in selected),2);net=float(row['total']);discount=round((1-net/gross)*100,8) if gross else 0
    customer=row['customerData'];uid=uuid.uuid5(uuid.NAMESPACE_URL,'pashaquotes:legacy:'+str(row['id']))
    c.execute('''insert into public.quotations(id,vendor,quotation_number,date_of_issue,customer_name,customer_country,contact_person,customer_phone,customer_email,customer_data,conditions,discount_percent,gross_total,net_total,items,payload,source,created_at,updated_at) values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',(uid,vendor,number,row['createdAt'].date(),customer.get('name'),customer.get('country'),customer.get('contactPerson'),customer.get('phone'),customer.get('email'),Jsonb(customer),row.get('conditions') or '',discount,gross,net,Jsonb(selected),Jsonb({'legacyId':row['id']}),'legacy-import-v2',row['createdAt'],row['updatedAt']))
   c.execute('select * from public.quotations');allrows=c.fetchall();maxima={}
   for row in allrows:
    reference=row['quotation_number'];match=re.fullmatch(r'(\d{4})[-/]?(\d+)',reference)
    if not match:raise RuntimeError('Unrecognized historical reference; review before migration')
    year,seq=map(int,match.groups());maxima[year]=max(maxima.get(year,0),seq)
    c.execute('insert into public.quotation_registry(reference,year,sequence,quotation_id,source) values(%s,%s,%s,%s,%s) on conflict(reference) do nothing',(reference,year,seq,row['id'],'historical'))
    c.execute('insert into public.quotation_versions(quotation_id,revision,document) values(%s,%s,%s) on conflict do nothing',(row['id'],row['revision'],Jsonb(doc(row))))
   for year,seq in maxima.items():c.execute('insert into public.quotation_counters(year,last_value) values(%s,%s) on conflict(year) do update set last_value=greatest(public.quotation_counters.last_value,excluded.last_value)',(year,seq))
   print('Historical records preserved:',len(allrows),'counter high-water marks:',maxima,'private backup created')
if __name__=='__main__':
 if len(sys.argv)>1 and sys.argv[1]=='cutover':
  with connect() as conn:conn.execute((ROOT/'migrations/002-lock-issued-identities.sql').read_text(),prepare=False)
  print('Immutable managed identities enforced')
 else:migrate()
