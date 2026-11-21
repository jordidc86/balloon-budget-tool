"""Atomic Netlify API deploy, always draft until an explicit publish action."""
from pathlib import Path
import sys,json,hashlib,zipfile,io,time,urllib.request,urllib.error,concurrent.futures
ROOT=Path(__file__).resolve().parents[1]
from admin_common import netlify,project_environment,SITE_ID,token
token_value=token()
def raw(path,method,content):
 req=urllib.request.Request('https://api.netlify.com/api/v1'+path,data=content,method=method,headers={'Authorization':'Bearer '+token_value,'Content-Type':'application/octet-stream'})
 try:
  with urllib.request.urlopen(req,timeout=45) as r:return r.read()
 except urllib.error.HTTPError as e:raise RuntimeError(f'Upload failed HTTP {e.code}')
def deploy(mode):
 if mode not in ('qa','production'):raise ValueError('Expected qa or production')
 env=project_environment();files={};blobs={};zips={};functions={}
 for p in (ROOT/'dist').rglob('*'):
  if p.is_file():data=p.read_bytes();digest=hashlib.sha1(data).hexdigest();files['/'+str(p.relative_to(ROOT/'dist'))]=digest;blobs[digest]=(p,data)
 for p in (ROOT/'.deploy/functions').glob('*.js'):
  buf=io.BytesIO()
  with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
   # Make mode part of the artifact digest: Netlify may reuse a function with
   # the same digest, including its deploy-scoped environment configuration.
   info=zipfile.ZipInfo(p.name);info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,('process.env.QUOTATION_MODE='+json.dumps(mode)+';\n').encode()+p.read_bytes())
  data=buf.getvalue();digest=hashlib.sha256(data).hexdigest();functions[p.stem]=digest;zips[digest]=(p.stem,data)
 environment=[{'key':'QUOTATION_MODE','value':mode,'scopes':['functions'],'is_secret':False},{'key':'SUPABASE_URL','value':env['SUPABASE_URL'],'scopes':['functions'],'is_secret':False},{'key':'SUPABASE_SERVICE_ROLE_KEY','value':env['SUPABASE_SERVICE_ROLE_KEY'],'scopes':['functions'],'is_secret':True}]
 manifest={'files':files,'functions':functions,'draft':True,'async':True,'title':'Managed immutable quotation references - '+mode,'environment':environment,'functions_config':{n:{'display_name':'Quotation API' if n=='quotes' else 'Quotation database health','generator':'pashaquotes-v2'} for n in functions}}
 deployment=netlify('/sites/'+SITE_ID+'/deploys','POST',manifest);identifier=deployment['id'];print('Created draft',identifier,mode,flush=True)
 for _ in range(45):
  d=netlify('/deploys/'+identifier)
  if d['state'] in ['prepared','uploading','uploaded','ready']:break
  if d['state']=='error':raise RuntimeError('Deploy preparation failed')
  time.sleep(1)
 def upload_file(digest):p,data=blobs[digest];name=str(p.relative_to(ROOT/'dist'));raw('/deploys/'+identifier+'/files/'+name,'PUT',data)
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(upload_file,d.get('required',[])))
 for digest in d.get('required_functions',[]):
  name,data=zips[digest];raw('/deploys/'+identifier+'/functions/'+name+'?runtime=js','PUT',data)
 for _ in range(80):
  d=netlify('/deploys/'+identifier)
  if d['state']=='ready':break
  if d['state']=='error':raise RuntimeError('Deployment failed: '+str(d.get('error_message')))
  time.sleep(1)
 else:raise RuntimeError('Deploy still processing; resume from existing identifier')
 receipt={k:d.get(k) for k in ['id','state','deploy_ssl_url','published_at','title']};receipt['mode']=mode
 (ROOT/'evidence').mkdir(exist_ok=True);(ROOT/f'evidence/deploy-{mode}.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt,indent=2))
if __name__=='__main__':
 if sys.argv[1]=='publish':
  receipt=json.loads((ROOT/'evidence/deploy-production.json').read_text());identifier=receipt['id']
  with urllib.request.urlopen(receipt['deploy_ssl_url']+'/api/db-test',timeout=25) as response:health=json.load(response)
  if health.get('ok') is not True or health.get('testMode') is not False:raise RuntimeError('Publication blocked: production database routing is not verified')
  d=netlify('/sites/'+SITE_ID+'/deploys/'+identifier+'/restore','POST',{});print('Published verified deployment',identifier)
 else:deploy(sys.argv[1])
