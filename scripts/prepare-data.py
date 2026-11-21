from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1];old=root.parent/'auditoria-web-2026-11-21/published-backup'
raw={v:json.loads((old/f'catalog-{v}.json').read_text()) for v in ['schroeder','pasha']};rules=json.loads((old/'compatibility.json').read_text());kits=json.loads((old/'predefined-kits.json').read_text());out={};aliases={'item_50':'item_51'}
headers={'BASKET','BASKET SUPPLEMENTS','BURNER','BURNER SUPPLEMENTS','ENVELOPE','SCOOP','ROTATION VENTS','FAST DEFLATION SYSTEM','ENVELOPE SUPPLEMENTS','FUELTANK','FUELTANK SUPPLEMENTS','ANCILLARY','SPARE PARTS','TRAINING','SHIPMENT','LEGALIZATION','MODEL BALLOONS'}
for vendor,catalog in raw.items():
 groups={};items=[];originalNames={}
 for cat in catalog['categories']:
  category=cat['name'].upper()
  for i in cat['items']:
   i=dict(i);originalNames[i['id']]=i['name'];name=i['name'];desc=i.get('description','')
   if name in headers and not desc.strip() and i['price']==0:
    if category not in ['BASKET','BURNER']:category=name
    continue
   if vendor=='schroeder' and i['id']=='item_50':continue
   if vendor=='pasha' and cat['name']=='BASKET':
    category='BASKET' if re.match(r'^S-\d+\w* Basket$',name) else ('MODEL BALLOONS' if 'BALLOON' in name else 'BASKET SUPPLEMENTS')
   if i['id']=='pasha_s-22_basket':i['name']='S-22 Basket (Partition)'
   if i['id']=='pasha_s-22_single_t_basket':i['name']='S-22 Basket (Single T)'
   if category=='BASKET' and vendor=='pasha':
    line=desc.split('\n')[0]
    i['frameType']=next((token for text,token in [('Double TT','DTT'),('Double T','TT'),('Single T','T'),('Partition','P'),('Open','O')] if text in line),None)
   if category=='BURNER FRAME' and vendor=='pasha':i['frameType']=name.split()[0]
   if vendor=='schroeder' and i['id']=='item_51':i['price']=8350
   i['category']=category;i['allowCustomPrice']='ARTWORK' in name.upper()
   if i['price']==0 and not i['allowCustomPrice'] and i['id']!='item_33':i['priceOnRequest']=True;i['allowCustomPrice']=True
   items.append(i);groups.setdefault(category,[]).append(i)
 # ID-based mapping preserves the original matrix, including explicitly distinct S-22 types.
 matrix={}
 for envelope,r in rules[vendor].items():
  e=next((i for i in items if originalNames[i['id']]==envelope and i['category']=='ENVELOPE'),None)
  if not e:continue
  matrix[e['id']]={kind:[i['id'] for i in items if i['category']==cat and originalNames[i['id']] in r[kind]] for kind,cat in [('baskets','BASKET'),('burners','BURNER')]}
 fixedkits=[]
 for k in kits[vendor]:
  selected=[]
  for field,cat in [('envelope','ENVELOPE'),('basket','BASKET'),('burner','BURNER')]:
   name=k[field]
   match=next((i for i in items if i['category']==cat and ' '.join(i['name'].split())==' '.join(name.split())),None)
   assert match,(vendor,k['name'],field,name)
   selected.append({'itemId':match['id'],'quantity':1})
  for extra in k.get('items',[]):
   identifier=extra['id'];identifier={'pasha_dropline_40m':'pasha_dropline___40m','pasha_quick_release_w_type':'pasha_quick_release_w_type_'}.get(identifier,identifier)
   identifier=aliases.get(identifier,identifier)
   match=next((i for i in items if i['id']==identifier),None)
   if not match:
    target='Dropline / 40m' if 'dropline' in identifier else ('Quick Release "W" Type' if 'quick_release' in identifier else None)
    match=next((i for i in items if i['name']==target),None)
   assert match,(k['name'],identifier)
   selected.append({'itemId':match['id'],**{a:b for a,b in extra.items() if a!='id'}})
  fixedkits.append({'id':k['id'],'name':k['name'].replace('Complete Kit','Configured Kit' if k.get('items') else 'Base Kit'),'description':k.get('description','')+(' - envelope, basket and burner only' if not k.get('items') else ''),'items':selected})
 out[vendor.upper()]={'categories':[{'name':k,'items':v} for k,v in groups.items()],'compatibility':matrix,'kits':fixedkits}
(root/'data/catalogs.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
(root/'data/aliases.json').write_text(json.dumps(aliases,indent=2)+'\n')
issuers={'SCHROEDER':{'name':'THEO SCHROEDER fire balloons GmbH','address':['Gewerbegebiet - Am Bahnhof 12','D-54338 Schweich, Germany'],'phone':'+49 6502 930-4','email':'mail@schroederballon.de'},'PASHA':{'name':'Pasha Balloons Üretimi Anonim Şirketi','address':['Bahçelievler Mah. Atatürk Cad. No:18','50650 Ortahisar - Ürgüp / Nevşehir, Türkiye'],'phone':'+90 384 343 3400','email':'design@pashaballoons.com','sources':['https://www.pashaballoons.com/contact/','https://www.pashaballoons.com/downloads/TYPE%20CERTIFICATE%20DATA%20SHEET%20-%20PASHA%20SERIES%20REV.5.pdf']}}
(root/'data/issuers.json').write_text(json.dumps(issuers,ensure_ascii=False,indent=2)+'\n')
print('Prepared corrected catalogs and issuers',sum(len(c['items']) for v in out.values() for c in v['categories']),'items')
