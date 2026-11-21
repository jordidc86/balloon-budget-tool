"""Consistent application backup and transactional restoration check.

No public HTTP export endpoint; run using the existing administrator session.
The archive contains quotation data and ownership identities, never passwords,
session tokens, environment variables or database connection strings.
"""
from pathlib import Path
import argparse,datetime,hashlib,json,os,sys,uuid,zipfile
from database import connect,ROOT
from psycopg import sql
from psycopg.types.json import Jsonb

TABLES=['quotations','quotation_counters','quotation_registry','quotation_versions','Quotation','pasha_legacy_archive','quotation_members']
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
def snapshot(conn):
 data={}
 for table in TABLES:
  exists=conn.execute('select to_regclass(%s)',('public."'+table+'"',)).fetchone()[0]
  if exists:
   data[table]=conn.execute(sql.SQL("select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.{} t").format(sql.Identifier(table))).fetchone()[0]
   data[table].sort(key=lambda row:canonical(row))
 identities=conn.execute("select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'emailConfirmedAt',email_confirmed_at)),'[]'::jsonb) from auth.users where id in (select (to_jsonb(q)->>'owner_id')::uuid from public.quotations q where to_jsonb(q)->>'owner_id' is not null)").fetchone()[0]
 return {'format':'pashaquotes-backup','version':1,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tables':data,'ownerIdentities':identities}
def create(directory):
 directory=Path(directory).resolve();directory.mkdir(parents=True,exist_ok=True,mode=0o700);directory.chmod(0o700)
 with connect() as conn:
  conn.execute('set transaction isolation level repeatable read, read only');data=snapshot(conn)
 payload=canonical(data);entries={'application.json':payload}
 for path in sorted((ROOT/'migrations').glob('*.sql')):entries['migrations/'+path.name]=path.read_bytes()
 manifest={'formatVersion':1,'createdAt':data['createdAt'],'rows':{k:len(v) for k,v in data['tables'].items()},'sha256':{k:hashlib.sha256(v).hexdigest() for k,v in entries.items()},'excluded':['passwords','session tokens','runtime secrets','QA records']}
 name='pashaquotes-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]+'.zip';path=directory/name
 # O_EXCL avoids replacing an existing recovery point, even with concurrent runs.
 descriptor=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(descriptor,'wb') as output:
  with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
   for name,content in entries.items():archive.writestr(name,content)
   archive.writestr('manifest.json',canonical(manifest))
 return path
def inspect(path):
 with zipfile.ZipFile(path) as archive:
  if sum(v.file_size for v in archive.infolist())>100_000_000:raise ValueError('Backup exceeds safety limit')
  manifest=json.loads(archive.read('manifest.json'))
  for name,digest in manifest['sha256'].items():
   if hashlib.sha256(archive.read(name)).hexdigest()!=digest:raise ValueError('Backup checksum mismatch')
  data=json.loads(archive.read('application.json'))
 if data['format']!='pashaquotes-backup' or data['version']!=1:raise ValueError('Unrecognized backup format')
 if set(data['tables'])-set(TABLES):raise ValueError('Unexpected table')
 for table,rows in data['tables'].items():
  if len(rows)!=manifest['rows'][table]:raise ValueError('Row count mismatch')
 refs={q['quotation_number'] for q in data['tables']['quotations']}
 if len(refs)!=len(data['tables']['quotations']):raise ValueError('Duplicate quotation reference')
 registry=data['tables']['quotation_registry'];counters={r['year']:r['last_value'] for r in data['tables']['quotation_counters']}
 if refs-{r['reference'] for r in registry}:raise ValueError('Unreserved reference')
 if any(counters.get(r['year'],-1)<r['sequence'] for r in registry):raise ValueError('Counter would reuse an issued number')
 return data,manifest
def verify_restore(path):
 data,manifest=inspect(path);schema='backup_check_'+uuid.uuid4().hex
 conn=connect()
 try:
  conn.execute(sql.SQL('create schema {}').format(sql.Identifier(schema)))
  for table,rows in data['tables'].items():
   source=table
   if table=='Quotation' and conn.execute("select to_regclass('public.\"Quotation\"')").fetchone()[0] is None:source='pasha_legacy_archive'
   conn.execute(sql.SQL('create table {}.{} (like public.{} including defaults including constraints)').format(sql.Identifier(schema),sql.Identifier(table),sql.Identifier(source)))
   conn.execute(sql.SQL('insert into {}.{} select * from jsonb_populate_recordset(null::{}.{},%s)').format(sql.Identifier(schema),sql.Identifier(table),sql.Identifier(schema),sql.Identifier(table)),(Jsonb(rows),))
   restored=conn.execute(sql.SQL("select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from {}.{} t").format(sql.Identifier(schema),sql.Identifier(table))).fetchone()[0]
   restored.sort(key=lambda row:canonical(row))
   if canonical(restored)!=canonical(rows):raise ValueError('Restored rows differ: '+table)
 finally:
  conn.rollback();conn.close()
 return {'verified':True,'archive':Path(path).name,'rowCounts':manifest['rows'],'method':'Restore into a separate transactional schema and compare every row; rollback; no production writes'}
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('command',choices=['create','verify']);parser.add_argument('--directory',default=str(ROOT.parent/'.private-backups'));parser.add_argument('--archive');args=parser.parse_args()
 path=create(args.directory) if args.command=='create' else Path(args.archive)
 result=verify_restore(path);result['path']=str(path);print(json.dumps(result,ensure_ascii=False))
