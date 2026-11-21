"""Administrative Netlify access. Never persists or logs runtime secrets."""
from pathlib import Path
import os,json,urllib.request,urllib.error
SITE_ID=os.environ.get('NETLIFY_SITE_ID','d126e35e-2605-4037-9fbf-99b5bd0ae579')
def token():
 if os.environ.get('NETLIFY_AUTH_TOKEN'):return os.environ['NETLIFY_AUTH_TOKEN']
 config=json.loads((Path.home()/'Library/Preferences/netlify/config.json').read_text());u=config['users'][config['userId']];return u['auth']['token'] if isinstance(u['auth'],dict) else u['auth']
def netlify(path,method='GET',payload=None):
 data=json.dumps(payload).encode() if payload is not None else None
 req=urllib.request.Request('https://api.netlify.com/api/v1'+path,data=data,method=method,headers={'Authorization':'Bearer '+token(),'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=45) as response:return json.load(response)
 except urllib.error.HTTPError as e:
  body=e.read().decode(errors='replace')
  if payload:
   for v in payload.get('environment',[]):
    if v.get('value'):body=body.replace(v['value'],'[redacted]')
  raise RuntimeError(f'Netlify HTTP {e.code}: {body[:1500]}') from None

def project_environment():
 site=netlify('/sites/'+SITE_ID);variables=netlify('/accounts/'+site['account_id']+'/env?site_id='+SITE_ID);values={}
 for variable in variables:
  candidates=variable.get('values',[]);chosen=next((v for v in candidates if v.get('context')=='production'),None) or next((v for v in candidates if v.get('context')=='all'),None)
  if chosen:values[variable['key']]=chosen.get('value','')
 return values
