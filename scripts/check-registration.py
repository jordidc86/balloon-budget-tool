"""Exercise confirmation and ownership transitions without persisting fixtures."""
import uuid,json
from database import connect,ROOT
from psycopg.types.json import Jsonb
from psycopg.errors import NoDataFound
conn=connect();checks=[]
try:
 before=conn.execute('select year,last_value from public.quotation_counters order by year').fetchall()
 conn.execute((ROOT/'migrations/005-self-registration.sql').read_text(),prepare=False)
 user=uuid.uuid4();conn.execute('insert into auth.users(id,email) values(%s,%s)',(user,'rollback-register@example.invalid'))
 assert not conn.execute('select public.pasha_member_access(%s)',(user,)).fetchone()[0];checks.append('Unconfirmed registration has no quotation access')
 conn.execute('update auth.users set email_confirmed_at=now() where id=%s',(user,));assert conn.execute('select public.pasha_member_access(%s)',(user,)).fetchone()[0];checks.append('Verified email automatically enables the account')
 owner_quote=conn.execute('select id from public.quotations limit 1').fetchone()[0]
 assert conn.execute('select public.pasha_private_quote(%s,%s)',(user,owner_quote)).fetchone()[0] is None;checks.append('New account cannot read any existing owner quotation')
 rejected=False
 try:
  with conn.transaction():conn.execute('select public.pasha_private_history(%s,%s)',(user,owner_quote))
 except NoDataFound:rejected=True
 assert rejected;checks.append('New account cannot view existing owner history')
 payload=conn.execute("select payload from quote_qa.quotations where source='pashaquotes-v2' limit 1").fetchone()[0]
 quote=conn.execute('select public.pasha_private_save(%s,%s,%s,null,null,true)',(user,Jsonb(payload),uuid.uuid4())).fetchone()[0]
 assert conn.execute('select public.pasha_private_quote(%s,%s,p_test=>true)',(user,quote['id'])).fetchone()[0]['id']==quote['id'];checks.append('New verified account can create and read its own QA quotation')
 conn.execute('update public.quotation_members set enabled=false where user_id=%s',(user,));conn.execute('update auth.users set email_confirmed_at=now() where id=%s',(user,));assert not conn.execute('select public.pasha_member_access(%s)',(user,)).fetchone()[0];checks.append('Reconfirmation does not reactivate a blocked account')
 anonymous=uuid.uuid4();conn.execute('insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(%s,%s,now(),true)',(anonymous,'rollback-anonymous@example.invalid'));assert not conn.execute('select public.pasha_member_access(%s)',(anonymous,)).fetchone()[0];checks.append('Anonymous users are not enrolled')
 conn.rollback();after=conn.execute('select year,last_value from public.quotation_counters order by year').fetchall();assert before==after;checks.append('All fixtures rolled back and official numbering unchanged')
 result={'passed':len(checks),'checks':checks,'officialBefore':before,'officialAfter':after};(ROOT/'evidence/registration-checks.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:conn.rollback();conn.close()
