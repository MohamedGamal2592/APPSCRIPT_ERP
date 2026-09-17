'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),path=require('path');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'Code.js'),'utf8');
function grab(source,name){const start=source.indexOf('function '+name+'(');assert(start>=0,name);const end=source.indexOf('\nfunction ',start+10);return source.slice(start,end<0?source.length:end);}
const names=['requestGuardIsWrite_','requestGuardCanonical_','requestGuardHash_','requestGuardReply_','requestGuardNotApplied_','requestGuardFailedReply_','requestGuardSheet_','requestGuardFind_','requestGuardExecute_','executeCompanyAction_'];
function grabVar(source){const start=source.indexOf('var REQUEST_RECEIPT_HEADERS_');assert(start>=0,'receipt headers');const end=source.indexOf(';\n',start);return source.slice(start,end+1);}
const headerVar=grabVar(source);
function server(shared){
  shared=shared||{sheets:{},business:[],fail:''};
  function makeSheet(){
    const rows=[];let max=100;
    return {rows,hideSheet(){},getLastRow:()=>rows.length,getMaxRows:()=>max,insertRowsAfter:(at,n)=>{max+=n;},getRange:(r,c,n=1,w=1)=>({
      getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>(rows[r-1+i]||[])[c-1+j]===undefined?'':rows[r-1+i][c-1+j])),
      setValues:values=>{
        if(shared.fail==='claim-before'&&r>1&&c===1)throw Error('claim failure');
        if(shared.fail==='finish-before'&&c===6)throw Error('receipt completion failure');
        values.forEach((row,i)=>{rows[r-1+i]=rows[r-1+i]||[];row.forEach((v,j)=>{rows[r-1+i][c-1+j]=v;});});
        if(shared.fail==='claim-after'&&r>1&&c===1)throw Error('claim reply lost');
      },
      createTextFinder:key=>({matchEntireCell(){return this;},matchCase(){return this;},findAll:()=>rows.map((row,i)=>({row,i})).filter(x=>x.i>=r-1&&x.i<r-1+n&&x.row[c-1]===key).map(x=>({getRow:()=>x.i+1}))})
    })};
  }
  const ctx={console,noteMutation_(){},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,text)=>Array.from(crypto.createHash('sha256').update(text).digest())},SpreadsheetApp:{flush(){}},executeWithLock_:fn=>fn(),rearmRecordCache_(){},jsonSafe_:x=>JSON.parse(JSON.stringify(x)),getSpreadsheet_:db=>({getSheetByName:name=>shared.sheets[db+'/'+name],insertSheet:name=>(shared.sheets[db+'/'+name]=makeSheet())}),COMPANY_SA_ONLY_RE:/^(edit_|delete_|remove_|update_|toggle_|close_|make_)/,ERP_MESSAGES:{NOT_AUTHORIZED:'denied'},canCompanyAction_:user=>!user.denied,checkPageAccess_:user=>{if(user.denied)throw Error('denied');},getCompanySpreadsheetId_:id=>id};
  ctx.COMPANY_REGISTRY={company:{pageForAction:()=> 'page',dispatch:payload=>{assert(!('__request_id' in payload.data));assert(!('__request_owner' in payload.data));shared.business.push(payload.data);return {status:'success',record:{id:shared.business.length,amount:payload.data.amount}};}}};
  vm.createContext(ctx);vm.runInContext(headerVar+'\n'+names.map(n=>grab(source,n)).join('\n'),ctx);
  return {ctx,shared};
}
const user={email:'user@example.test',company:'company'};
function request(id='r'.repeat(24),amount=10){return {target_system:'company',module_action:'add_cash',data:{amount,__request_id:id,__request_owner:user.email}};}
const S=server();
const first=S.ctx.executeCompanyAction_(request(),'',user);
assert.strictEqual(first.record.id,1);
const replay=S.ctx.executeCompanyAction_(request(),'',user);
assert.strictEqual(replay.record.id,1);assert.strictEqual(replay.deduped,true);assert.strictEqual(S.shared.business.length,1);
const reboot=server(S.shared);assert.strictEqual(reboot.ctx.executeCompanyAction_(request(),'',user).record.id,1,'receipt survives a fresh execution and cache eviction');
assert.strictEqual(S.ctx.executeCompanyAction_(request('r'.repeat(24),11),'',user).code,'REQUEST_ID_CONFLICT');
assert.strictEqual(S.shared.business.length,1);
S.ctx.executeCompanyAction_(request('n'.repeat(24)),'',user);assert.strictEqual(S.shared.business.length,2,'distinct requests may have identical values');
assert.throws(()=>S.ctx.executeCompanyAction_(request(),'',Object.assign({},user,{denied:true})),/denied/,'authorization must run before replay');
assert.throws(()=>S.ctx.executeCompanyAction_(request(),'',Object.assign({},user,{company:'other'})),/Denied/);
assert.strictEqual(S.ctx.executeCompanyAction_(request(),'',{email:'other@example.test',company:'company'}).code,'REQUEST_OWNER_MISMATCH');
assert.strictEqual(S.ctx.executeCompanyAction_({target_system:'company',module_action:'add_cash',data:{amount:4}},'',user).code,'REQUEST_ID_REQUIRED');
let calls=0,nested;
const C=server();const concurrent=C.ctx.requestGuardExecute_(request(),user,'company',p=>{calls++;nested=C.ctx.requestGuardExecute_(request(),user,'company',()=>{calls++;});return {status:'success',record:{id:1}};});
assert.strictEqual(nested.code,'REQUEST_IN_PROGRESS');assert.strictEqual(calls,1);assert.strictEqual(concurrent.status,'success');
const U=server();calls=0;
let uncertain=U.ctx.requestGuardExecute_(request(),user,'company',()=>{calls++;U.shared.business.push({id:1});throw Error('response interrupted after write');});
assert.strictEqual(uncertain.code,'REQUEST_UNCERTAIN');
assert.strictEqual(U.ctx.requestGuardExecute_(request(),user,'company',()=>{calls++;}).code,'REQUEST_UNCERTAIN');assert.strictEqual(calls,1);
const P=server();P.shared.fail='finish-before';calls=0;
assert.strictEqual(P.ctx.requestGuardExecute_(request(),user,'company',()=>{calls++;return {status:'success'};}).code,'REQUEST_UNCERTAIN');
P.shared.fail='';const receipt=P.shared.sheets['company/ERP_Request_Receipts'].rows[1];receipt[7]=new Date(0);
assert.strictEqual(P.ctx.requestGuardExecute_(request(),user,'company',()=>{calls++;}).code,'REQUEST_UNCERTAIN','old pending claims must never execute again');assert.strictEqual(calls,1);
for(const mode of ['claim-before','claim-after']){const F=server();F.shared.fail=mode;calls=0;assert.strictEqual(F.ctx.requestGuardExecute_(request(),user,'company',()=>{calls++;}).code,'REQUEST_GUARD_UNAVAILABLE');assert.strictEqual(calls,0);}
const R=server();assert.strictEqual(R.ctx.requestGuardExecute_({module_action:'get_cash'},user,'company',()=>42),42);assert.strictEqual(Object.keys(R.shared.sheets).length,0,'reads create no ledger');
 const dataSource=fs.readFileSync(path.join(root,'02_DataAccess.js'),'utf8');let appends=0;
const appendCtx={noteMutation_(){}};vm.createContext(appendCtx);vm.runInContext(grab(dataSource,'appendRowWithRetry_'),appendCtx);
assert.throws(()=>appendCtx.appendRowWithRetry_({appendRow(){appends++;throw Error('committed but reply lost');}},[1]),/uncertain/);assert.strictEqual(appends,1,'ambiguous append must never be retried');

// 'failed': proven pre-mutation errors replay the stored failure, never uncertain.
function notAppliedError(message){const e=Error(message);e.notApplied=true;e.code='REQUEST_NOT_APPLIED';throw e;}
const F2=server();let fCalls=0;
const frej=F2.ctx.requestGuardExecute_(request('f'.repeat(24)),user,'company',()=>{fCalls++;notAppliedError('نوع الملف غير مسموح');});
assert.strictEqual(frej.code,'REQUEST_NOT_APPLIED');assert.strictEqual(frej.notApplied,true);assert(!frej.uncertain);
assert.strictEqual(F2.ctx.requestGuardExecute_(request('f'.repeat(24)),user,'company',()=>{fCalls++;}).code,'REQUEST_NOT_APPLIED');
assert.strictEqual(fCalls,1,'failed receipts never re-execute the handler');
assert.strictEqual(F2.ctx.requestGuardExecute_(request('f'.repeat(24),12),user,'company',()=>{fCalls++;}).code,'REQUEST_ID_CONFLICT');
const F3=server();
assert.strictEqual(F3.ctx.requestGuardExecute_(request(),user,'company',()=>({status:'error',message:'bad',notApplied:true})).code,'REQUEST_NOT_APPLIED','returned notApplied errors finalize failed too');
// stale receipt + opt-in recovery reconciles through the handler without mutating again.
const RC=server();let rcCalls=0,rcRows=0;
const rcInvoke=()=>{rcCalls++;if(rcRows===0){rcRows++;throw Error('response interrupted after write');}return {status:'success',recovered:true};};
assert.strictEqual(RC.ctx.requestGuardExecute_(request('r'.repeat(24)),user,'company',rcInvoke,{recovery:'request-id'}).code,'REQUEST_UNCERTAIN');
assert.strictEqual(rcRows,1);
RC.shared.sheets['company/ERP_Request_Receipts'].rows[1][7]=new Date(0);
const rcDone=RC.ctx.requestGuardExecute_(request('r'.repeat(24)),user,'company',rcInvoke,{recovery:'request-id'});
assert.strictEqual(rcDone.status,'success');assert.strictEqual(rcDone.recovered,true);assert.strictEqual(rcRows,1,'recovery must not mutate again');
assert.strictEqual(RC.ctx.requestGuardExecute_(request('r'.repeat(24)),user,'company',rcInvoke,{recovery:'request-id'}).deduped,true);
const RU=server();let ruCalls=0;
assert.strictEqual(RU.ctx.requestGuardExecute_(request(),user,'company',()=>{ruCalls++;throw Error('x');}).code,'REQUEST_UNCERTAIN');
RU.shared.sheets['company/ERP_Request_Receipts'].rows[1][7]=new Date(0);
assert.strictEqual(RU.ctx.requestGuardExecute_(request(),user,'company',()=>{ruCalls++;}).code,'REQUEST_UNCERTAIN','recovery needs the opt-in flag');
assert.strictEqual(ruCalls,1);

// Real shared client API, with controllable lost responses and persistent tab storage.
const clientSource=fs.readFileSync(path.join(root,'Client_Helpers.html'),'utf8');
const clientSlice=clientSource.slice(clientSource.indexOf('API._requestGuard ='),clientSource.indexOf('/* F-18:'));
function client(store=new Map(),identity=user.email){
  const sent=[];let serial=0;
  const browser={API:{getSession:()=>({user:{email:identity}})},crypto:{randomUUID:()=>crypto.randomUUID()},sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},location:{}};
  function runner(success,failure){return {withSuccessHandler:fn=>runner(fn,failure),withFailureHandler:fn=>runner(success,fn),apiRouter:req=>{sent.push({req,success,failure});}};}
  const ctx={window:browser,API:browser.API,google:{script:{run:runner()}},console,Uint32Array,Promise};vm.createContext(ctx);vm.runInContext(clientSlice,ctx);
  return {browser,sent,store,call:(data={amount:10})=>browser.API.call('company_action',{target_system:'company',module_action:'add_cash',data},'fake-token')};
}
(async()=>{
 const A=client();const p=A.call(),p2=A.call();assert.strictEqual(p,p2,'concurrent identical saves share a single request');assert.strictEqual(A.sent.length,1);
 const sentId=A.sent[0].req.payload.data.__request_id;assert(sentId);assert.strictEqual(A.sent[0].req.payload.data.__request_owner,user.email);
 A.sent[0].failure(Error('reply lost'));await assert.rejects(p,e=>e.transport&&e.uncertain);await assert.rejects(p2);
 const B=client(A.store);const retry=B.call();assert.strictEqual(B.sent[0].req.payload.data.__request_id,sentId,'reload must reuse the original ID');
 const live=server();const original=live.ctx.executeCompanyAction_(A.sent[0].req.payload,'',user);assert.strictEqual(original.record.id,1);
 const recovered=live.ctx.executeCompanyAction_(B.sent[0].req.payload,'',user);assert.strictEqual(recovered.deduped,true);B.sent[0].success(recovered);await retry;assert.strictEqual(live.shared.business.length,1,'lost response then reload inserts only one row');
 const again=B.call();assert.notStrictEqual(B.sent[1].req.payload.data.__request_id,sentId,'new completed form may deliberately add identical data');B.sent[1].success({status:'success'});await again;
 const ownerMismatch=B.call({amount:10,__request_id:sentId,__request_owner:'other@example.test'});await assert.rejects(ownerMismatch,e=>e.code==='REQUEST_OWNER_MISMATCH');assert.strictEqual(B.sent.length,2);
 const blocked=client();blocked.browser.sessionStorage.setItem=()=>{throw Error('storage full');};await assert.rejects(blocked.call(),e=>e.code==='REQUEST_STORAGE_UNAVAILABLE');assert.strictEqual(blocked.sent.length,0);
 const read=blocked.browser.API.call('company_action',{target_system:'company',module_action:'get_cash',data:{}},'fake');assert.strictEqual(blocked.sent.length,1);blocked.sent[0].success({status:'success'});await read;
 const expired=client();const ep=expired.call();const originalId=expired.sent[0].req.payload.data.__request_id;expired.sent[0].success({status:'error',code:'SESSION_EXPIRED'});await assert.rejects(ep);const resumed=client(expired.store);const rp=resumed.call();assert.strictEqual(resumed.sent[0].req.payload.data.__request_id,originalId,'auth rejection must not discard an uncertain earlier request identity');resumed.sent[0].success({status:'success'});await rp;
 const uiSource=fs.readFileSync(path.join(root,'UI_Components.html'),'utf8');
 const queueCtx={window:{API:{_requestGuard:{}}},API:{_requestGuard:{}},queue:{},Promise};vm.createContext(queueCtx);vm.runInContext(uiSource.slice(uiSource.indexOf('function callFor('),uiSource.indexOf('\n  }',uiSource.indexOf('function callFor('))+4),queueCtx);
 const legacyCall=queueCtx.callFor({target_system:'company',data:{amount:10}});await assert.rejects(legacyCall(),e=>e.code==='LEGACY_RETRY_REVIEW','old queued writes must not receive a new ID and replay');
 const F=client(),form={};
 const fd1=F.browser.API._requestGuard.formData(form,{amount:12});fd1.unique_id='generated-a';
 const fd2=F.browser.API._requestGuard.formData(form,{amount:12});fd2.unique_id='generated-b';
 assert.strictEqual(fd1.__request_form_id,fd2.__request_form_id,'same form keeps intent despite subsequent generated IDs');
 const fp1=F.call(fd1),fp2=F.call(fd2);
 assert.strictEqual(F.sent[0].req.payload.data.__request_id,F.sent[1].req.payload.data.__request_id);
 assert(!('__request_form_id' in F.sent[0].req.payload.data),'internal form marker never reaches business handler');
 const formServer=server();const fr=formServer.ctx.executeCompanyAction_(F.sent[0].req.payload,'',user);
 const fr2=formServer.ctx.executeCompanyAction_(F.sent[1].req.payload,'',user);
 assert.strictEqual(fr2.code,'REQUEST_ID_CONFLICT');assert.strictEqual(formServer.shared.business.length,1);
 F.sent[0].success(fr);F.sent[1].success(fr2);await fp1;await assert.rejects(fp2);
 const fd3=F.browser.API._requestGuard.formData(form,{amount:12});assert.notStrictEqual(fd3.__request_form_id,fd1.__request_form_id,'confirmed success permits a new form intent');
 const fd4=F.browser.API._requestGuard.formData(form,{amount:13});assert.notStrictEqual(fd4.__request_form_id,fd3.__request_form_id,'edited form receives a distinct intent');
 // confirmed non-mutation releases the retained request; transport loss keeps it.
 const NA=client();const nap=NA.call();const naId=NA.sent[0].req.payload.data.__request_id;
 NA.sent[0].success({status:'error',code:'REQUEST_NOT_APPLIED',notApplied:true});await assert.rejects(nap,e=>e.code==='REQUEST_NOT_APPLIED');
 const NA2=client(NA.store);const nap2=NA2.call();
 assert.notStrictEqual(NA2.sent[0].req.payload.data.__request_id,naId,'confirmed non-mutation releases the retained ID');
 NA2.sent[0].success({status:'success'});await nap2;
 console.log('request_guard: PASS (lost responses, reloads, duplicate/concurrent requests, authorization, payload conflicts, distinct saves, durable uncertainty, storage failures, no blind append retry, confirmed failures, request-id recovery)');
})().catch(err=>{console.error(err);process.exitCode=1;});
