"""Provision approved representatives without sending or printing passwords.

An administrator must explicitly request each email. Activation links are
written to a private local file for delivery to that same recipient.
"""
from pathlib import Path
import argparse,json,os,urllib.request,urllib.parse
from admin_common import project_environment
from database import connect,ROOT

def auth_request(path,payload):
 env=project_environment();request=urllib.request.Request(env['SUPABASE_URL']+'/auth/v1/'+path,data=json.dumps(payload).encode(),headers={'apikey':env['SUPABASE_SERVICE_ROLE_KEY'],'Authorization':'Bearer '+env['SUPABASE_SERVICE_ROLE_KEY'],'Content-Type':'application/json'})
 with urllib.request.urlopen(request,timeout=25) as response:return json.load(response)
def enable(email,assign_unowned=False):
 with connect() as conn:row=conn.execute('select id from auth.users where lower(email)=lower(%s)',(email,)).fetchone()
 uid=str(row[0]) if row else auth_request('admin/users',{'email':email,'email_confirm':True})['id']
 with connect() as conn:
  conn.execute('insert into public.quotation_members(user_id,enabled) values(%s,true) on conflict(user_id) do update set enabled=true',(uid,))
  if assign_unowned:
   conn.execute("select set_config('pasha.managed_quote','1',true),set_config('pasha.assign_owner','1',true)")
   conn.execute('update public.quotations set owner_id=%s where owner_id is null',(uid,))
 return uid
def activation(email):
 response=auth_request('admin/generate_link',{'type':'recovery','email':email})
 token=response.get('hashed_token') or response.get('properties',{}).get('hashed_token')
 if not token:raise RuntimeError('Authentication provider did not return an activation token')
 return 'https://pashaquotes.netlify.app/#'+urllib.parse.urlencode({'type':'recovery','token_hash':token})
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('email');p.add_argument('--assign-unowned',action='store_true');p.add_argument('--activation',action='store_true');args=p.parse_args()
 if '@' not in args.email:raise ValueError('An approved email is required')
 uid=enable(args.email,args.assign_unowned);print('Approved representative enabled')
 if args.activation:
  target=ROOT.parent/'.private-backups/account-activation.json';target.parent.mkdir(mode=0o700,exist_ok=True)
  fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
  with os.fdopen(fd,'w') as output:json.dump({'email':args.email,'url':activation(args.email)},output)
  print('One-time activation link written to a private local file; no email sent')
