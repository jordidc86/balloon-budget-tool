"""Load controlled test identities without logging passwords or access tokens."""
from pathlib import Path
import json,urllib.request
def qa_environment(environment):
 if environment.get('QA_ACCESS_TOKEN') and environment.get('QA_OTHER_TOKEN'):return environment
 path=Path(__file__).resolve().parents[2]/'.private-backups/qa-auth-accounts.json'
 accounts=json.loads(path.read_text())
 for i,account in enumerate(accounts):
  req=urllib.request.Request(environment['SUPABASE_URL']+'/auth/v1/token?grant_type=password',data=json.dumps({'email':account['email'],'password':account['password']}).encode(),headers={'apikey':environment['SUPABASE_ANON_KEY'],'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=20) as response:session=json.load(response)
  environment['QA_ACCESS_TOKEN' if i==0 else 'QA_OTHER_TOKEN']=session['access_token']
  environment['QA_USER_ID' if i==0 else 'QA_OTHER_ID']=account['id']
 return environment
