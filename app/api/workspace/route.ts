import { getChatGPTUser } from '../../chatgpt-auth';
import { getDb } from '../../../db';
import { agencies,members,records,audit } from '../../../db/schema';
import { and,eq,or } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { modules,permitted,fieldApplies,policyFrequency } from '../../../lib/modules';
export const dynamic='force-dynamic';
const now=()=>new Date().toISOString();
function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
function parseMember(m:any){return {...m,permissions:JSON.parse(m.permissions||'{}')};}
async function context(){
 const user=await getChatGPTUser();if(!user)fail('יש להתחבר כדי להמשיך',401);
 const db=getDb();
 const found=await db.select().from(members).where(eq(members.email,user.email.toLowerCase()));
 const member=found.find(m=>m.userId===user.userId)||found.find(m=>!m.userId);
 if(member&&!member.active)fail('הגישה לחשבון הושבתה',403);
 if(member&&!member.userId)await db.update(members).set({userId:user.userId}).where(eq(members.id,member.id));
 return {db,user,member:member?parseMember(member):null};
}
function allow(m:any,module:string,action:string){if(!m||!permitted(m,module,action))fail('אין הרשאה לפעולה זו',403);}
async function rows(c:any){return (await c.db.select().from(records).where(eq(records.agency,c.member.agency))).map((r:any)=>({...r,data:JSON.parse(r.data)}));}
function visible(c:any,all:any[],r:any){if(!c.member.assignedOnly||c.member.role==='admin')return true;const client=r.module==='clients'?r:all.find(x=>x.id===r.clientId&&x.module==='clients');return client?.data.assignee===c.member.id;}
async function log(c:any,action:string,id:string){await c.db.insert(audit).values({id:crypto.randomUUID(),agency:c.member.agency,actor:c.user.email,action,recordId:id,at:now()});}
function safeData(module:string,input:any,all:any[],prior?:any){
 const cfg=modules[module];if(!cfg)fail('מודול לא תקין');
 const custom=all.filter(x=>x.module==='settings'&&x.data.target===module&&x.data.active).map(x=>({key:'custom_'+x.id,label:x.data.name,type:x.data.kind,required:x.data.required,options:x.data.kind==='select'?String(x.data.options||'').split(',').map((v:string)=>v.trim()):undefined}));
 const fields=[...cfg.fields,...custom];const out:any={...prior?.data};
 for(const f of fields){if(!fieldApplies(f,input))continue;let value=module==='policies'&&f.key==='frequency'?(policyFrequency(input?.branch)||input?.[f.key]):input?.[f.key];if(value===undefined||value===null)value=f.type==='checkbox'?false:'';
 if(f.required&&(value===''||(Array.isArray(value)&&!value.length)))fail('יש למלא '+f.label);
 if(f.type==='number'&&value!==''){value=Number(value);if(!Number.isFinite(value)||value<0)fail('ערך מספרי לא תקין: '+f.label);}
 if(f.type==='coverages'){
 if(!Array.isArray(value))value=[];
 if(value.length>100)fail('ניתן להוסיף עד 100 כיסויים');
 value=value.map((x:any)=>{const amount=Number(x.amount||0),deductible=Number(x.deductible||0);if(typeof x.name!=='string'||x.name.length>500||!Number.isFinite(amount)||!Number.isFinite(deductible)||amount<0||deductible<0)fail('פרטי כיסוי לא תקינים');return {name:x.name,amount,deductible};});
 }
 else if(f.type==='checkbox')value=!!value;
 else if(f.type==='multi'){if(!Array.isArray(value))value=[];value=value.map(String);}
 else if(f.type!=='number'){if(typeof value!=='string')fail('ערך לא תקין');if(value.length>20000)fail('טקסט ארוך מדי');}
 const additional=all.filter(x=>x.module==='categories'&&x.data.target===module&&x.data.field===f.key&&x.data.active).map(x=>x.data.name);
 if(f.options&&value&&!f.options.includes(value)&&!additional.includes(value)&&prior?.data?.[f.key]!==value)fail('בחירה לא תקינה: '+f.label);
 if(f.type==='date'&&value&&!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('תאריך לא תקין');
 out[f.key]=value;
 }
 if(out.start&&out.end&&out.start>out.end)fail('תאריך הסיום חייב להיות אחרי תאריך ההתחלה');
 return out;
}
async function handleGet(req:Request){
 const c=await context();if(!c.member)return Response.json({setup:true,name:c.user.displayName,email:c.user.email});
 const all=await rows(c);const u=new URL(req.url);const op=u.searchParams.get('op');
 if(op==='download'){
 allow(c.member,'documents','download');const r=all.find((x:any)=>x.id===u.searchParams.get('id')&&x.module==='documents');if(!r||!visible(c,all,r))fail('המסמך לא נמצא',404);
 const object=await env.BUCKET!.get(c.member.agency+'/'+r.id);if(!object)fail('הקובץ לא נמצא',404);await log(c,'הורדת מסמך',r.id);
 return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(r.data.fileName||r.data.name)}`,'X-Content-Type-Options':'nosniff'}});
 }
 if(op==='export'){
 const module=u.searchParams.get('module')||'';allow(c.member,module,'export');await log(c,'ייצוא '+(modules[module]?.label||module),module);
 return Response.json(all.filter((r:any)=>r.module===module&&visible(c,all,r)),{headers:{'Content-Disposition':`attachment; filename="${module}.json"`}});
 }
 if(op==='backup'){
 allow(c.member,'backup','export');const files:any[]=[];let total=0;
 for(const r of all.filter((r:any)=>r.module==='documents')){const obj=await env.BUCKET!.get(c.member.agency+'/'+r.id);if(obj){total+=obj.size;if(total>30*1024*1024)fail('גיבוי גדול מ־30MB. יש לגבות מסמכים בהורדה נפרדת.');const bytes=new Uint8Array(await obj.arrayBuffer());let bin='';for(const b of bytes)bin+=String.fromCharCode(b);files.push({id:r.id,base64:btoa(bin)});}}
 await log(c,'גיבוי מלא',c.member.agency);return Response.json({version:1,agency:c.member.agency,at:now(),records:all,files},{headers:{'Content-Disposition':'attachment; filename="bituach-backup.json"'}});
 }
 const agency=(await c.db.select().from(agencies).where(eq(agencies.id,c.member.agency)))[0];
 const team=await c.db.select().from(members).where(eq(members.agency,c.member.agency));
 const accessible=all.filter((r:any)=>permitted(c.member,r.module,'view')&&visible(c,all,r));
 const allowedIds=new Set(accessible.map((r:any)=>r.id));
 const history=(await c.db.select().from(audit).where(eq(audit.agency,c.member.agency))).filter((a:any)=>c.member.role==='admin'||allowedIds.has(a.recordId));
 const definitions=all.filter((r:any)=>['settings','categories'].includes(r.module));
 return Response.json({agency,member:c.member,team:c.member.role==='admin'?team.map(parseMember):team.map((m:any)=>({id:m.id,name:m.name,role:m.role})),records:[...accessible,...definitions.filter((r:any)=>!allowedIds.has(r.id))],audit:history.sort((a:any,b:any)=>b.at.localeCompare(a.at)).slice(0,500)}, {headers:{'Cache-Control':'no-store'}});
}
async function handlePost(req:Request){
 if(req.headers.get('origin')&&new URL(req.headers.get('origin')!).host!==new URL(req.url).host)fail('בקשה לא מורשית',403);
 const c=await context();const b:any=await req.json();
 if(b.op==='setup'){
 if(c.member)fail('הסוכנות כבר הוגדרה');if(typeof b.name!=='string'||!b.name.trim()||b.name.length>150)fail('יש להזין שם סוכנות');
 const agency=crypto.randomUUID();const member=crypto.randomUUID();
 await c.db.batch([c.db.insert(agencies).values({id:agency,owner:c.user.userId,name:b.name.trim()}),c.db.insert(members).values({id:member,agency,email:c.user.email.toLowerCase(),userId:c.user.userId,name:c.user.displayName,role:'admin'})]);return Response.json({ok:true});
 }
 if(!c.member)fail('יש להגדיר סוכנות תחילה',403);
 if(b.op==='member'){
 allow(c.member,'users','edit');if(!['admin','agent','operations','viewer'].includes(b.role))fail('תפקיד לא תקין');
 if(typeof b.email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email))fail('כתובת דוא״ל לא תקינה');
 const existing=b.id?(await c.db.select().from(members).where(and(eq(members.id,b.id),eq(members.agency,c.member.agency))))[0]:null;
 const owner=(await c.db.select().from(agencies).where(eq(agencies.id,c.member.agency)))[0];
 if(existing?.userId===owner.owner&&(b.role!=='admin'||!b.active||b.assignedOnly))fail('לא ניתן להשבית או להגביל את בעל הסוכנות');
 if(b.id&&!existing)fail('משתמש לא נמצא',404);
 if(!existing){const other=await c.db.select().from(members).where(eq(members.email,b.email.toLowerCase()));if(other.length)fail('כתובת זו כבר שייכת לחשבון קיים');}
 const values={name:String(b.name||b.email).slice(0,150),role:b.role,active:b.active?1:0,assignedOnly:b.assignedOnly?1:0,permissions:JSON.stringify(b.permissions||{})};
 const id=existing?.id||crypto.randomUUID();if(existing)await c.db.update(members).set(values).where(eq(members.id,id));else await c.db.insert(members).values({...values,id,agency:c.member.agency,email:b.email.toLowerCase()});
 await log(c,'עדכון משתמש והרשאות',id);return Response.json({ok:true});
 }
 const all=await rows(c);
 if(b.op==='restore'){
 allow(c.member,'backup','edit');const backup=b.backup;if(backup?.version!==1||backup.agency!==c.member.agency||!Array.isArray(backup.records)||!Array.isArray(backup.files))fail('הגיבוי אינו מתאים לסוכנות');
 const ids=new Set(backup.records.map((r:any)=>r.id));
 for(const r of backup.records){if(r.agency!==c.member.agency||!modules[r.module]||typeof r.id!=='string'||!r.data)fail('גיבוי לא תקין');if(r.clientId&&!ids.has(r.clientId))fail('קישור לקוח חסר בגיבוי');const foreign=await c.db.select().from(records).where(eq(records.id,r.id));if(foreign.length&&foreign[0].agency!==c.member.agency)fail('מזהה לא תקין');}
 for(const f of backup.files){if(!ids.has(f.id)||!backup.records.some((r:any)=>r.id===f.id&&r.module==='documents'))fail('מסמך לא תקין');const binary=atob(f.base64);await env.BUCKET!.put(c.member.agency+'/'+f.id,Uint8Array.from(binary,(x:string)=>x.charCodeAt(0)));}
 if(backup.records.length)await c.db.batch(backup.records.map((r:any)=>c.db.insert(records).values({id:r.id,agency:c.member.agency,module:r.module,clientId:r.clientId||null,data:JSON.stringify(r.data),updated:now()}).onConflictDoUpdate({target:records.id,set:{data:JSON.stringify(r.data),clientId:r.clientId||null,updated:now()}})));
 await log(c,'שחזור מגיבוי',c.member.agency);return Response.json({ok:true});
 }
 const module=b.module;if(!modules[module])fail('מודול לא תקין');
 const old=b.id?all.find((r:any)=>r.id===b.id&&r.module===module):null;if(b.id&&(!old||!visible(c,all,old)))fail('הרשומה לא נמצאה',404);
 allow(c.member,module,b.op==='delete'?'delete':old?'edit':'create');
 if(b.op==='delete'){
 if(['settings','categories'].includes(module))fail('ניתן להשבית ערך בהגדרות כדי לשמור מידע קיים');
 if(all.some((r:any)=>r.id!==b.id&&[r.clientId,r.data.policyId,r.data.claimId,...(r.data.insured||[])].includes(b.id)))fail('הרשומה מקושרת למידע נוסף. יש להסיר קישורים תחילה');
 await c.db.batch([c.db.delete(records).where(eq(records.id,b.id)),c.db.insert(audit).values({id:crypto.randomUUID(),agency:c.member.agency,actor:c.user.email,action:'מחיקה: '+modules[module].singular,recordId:b.id,at:now()})]);if(module==='documents')await env.BUCKET!.delete(c.member.agency+'/'+b.id);return Response.json({ok:true});
 }
 const data=safeData(module,b.data,all,old);const clientId=module==='clients'?null:data.clientId||null;
 if(module==='clients'&&!old)data.createdAt=now();
 if(module==='categories'&&!modules[data.target]?.fields.some(f=>f.key===data.field&&f.options))fail('יש לבחור רשימת בחירה תקינה');
 if(module==='settings'&&old&&data.kind!==old.data.kind&&all.some((r:any)=>r.module===old.data.target&&r.data['custom_'+old.id]!==undefined))fail('לשדה יש נתונים קיימים. יש להוסיף שדה חדש במקום לשנות את סוגו');
 if(clientId){const client=all.find((r:any)=>r.id===clientId&&r.module==='clients');if(!client||!visible(c,all,client))fail('לקוח לא מורשה',403);}
 if(module==='clients'&&c.member.assignedOnly&&c.member.role!=='admin')data.assignee=c.member.id;
 if(data.assignee&&!(await c.db.select().from(members).where(and(eq(members.id,data.assignee),eq(members.agency,c.member.agency)))).length)fail('אחראי לא תקין');
 for(const [key,target] of [['policyId','policies'],['claimId','claims']] as const){if(data[key]){const r=all.find((r:any)=>r.id===data[key]&&r.module===target);if(!r||r.clientId!==clientId||!visible(c,all,r))fail('הקישור אינו שייך ללקוח');}}
 for(const id of data.insured||[]){if(!all.some((r:any)=>r.id===id&&r.module==='family'&&r.clientId===clientId))fail('המבוטח אינו שייך למשפחה');}
 const id=old?.id||crypto.randomUUID();
 if(module==='documents'){
 if(b.file){if(typeof b.file.base64!=='string'||b.file.base64.length>14*1024*1024)fail('הקובץ גדול מדי (עד 10MB)');const binary=atob(b.file.base64);await env.BUCKET!.put(c.member.agency+'/'+id,Uint8Array.from(binary,(x:string)=>x.charCodeAt(0)));data.fileName=String(b.file.name).slice(0,255);data.size=binary.length;}
 else if(old){data.fileName=old.data.fileName;data.size=old.data.size;}else fail('יש לבחור קובץ');
 }
 const row={id,agency:c.member.agency,module,clientId,data:JSON.stringify(data),updated:now()};
 await c.db.batch([old?c.db.update(records).set(row).where(eq(records.id,id)):c.db.insert(records).values(row),c.db.insert(audit).values({id:crypto.randomUUID(),agency:c.member.agency,actor:c.user.email,action:(old?'עריכה: ':'יצירה: ')+modules[module].singular,recordId:id,at:now()})]);return Response.json({ok:true,id});
}
export async function GET(req:Request){try{return await handleGet(req);}catch(e:any){return Response.json({error:e.status?e.message:'אירעה שגיאה בטעינת המידע'}, {status:e.status||500});}}
export async function POST(req:Request){try{return await handlePost(req);}catch(e:any){return Response.json({error:e.status?e.message:'שמירת המידע נכשלה. יש לבדוק את הפרטים ולנסות שוב.'},{status:e.status||500});}}
