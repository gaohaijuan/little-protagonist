'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createOperationsService}=require('../miniprogram/services/operations-service');
const ID='usr_'+'a'.repeat(40);
function setup(settings={baseUrl:'https://operations.example.test'}){
  let state={status:'authenticated',user:{id:ID}},listener,releaseFile,resolveExchange;
  const calls=[],exchanges=[];
  const auth={getSnapshot:()=>state,subscribe:fn=>{listener=fn;},callWithSession:async(name,data)=>{
    exchanges.push({name,data});if(settings.holdExchange)return new Promise(resolve=>{resolveExchange=resolve;});
    return {ok:true,userId:ID,token:'b'.repeat(64),inviteCode:'invite123',expiresAt:Date.now()+60000};
  }};
  const wxApi={request:options=>{calls.push(options);options.success({statusCode:200,data:{id:'receipt'}});},getFileSystemManager:()=>({readFile:options=>{releaseFile=()=>options.success({data:new ArrayBuffer(50)});if(!settings.holdFile)releaseFile();}})};
  const service=createOperationsService(wxApi,auth,settings);
  return {service,calls,exchanges,logout(){state={status:'guest',user:null};listener(state);},release(){releaseFile();},exchange(){resolveExchange({ok:true,userId:ID,token:'b'.repeat(64),expiresAt:Date.now()+60000});}};
}
test('operations reuse the verified parent account, deduplicate exchange and send no child profile',async()=>{
  const f=setup();f.service.setInvite('from-friend');
  assert.deepEqual(await Promise.all([f.service.track('visit'),f.service.track('read','intro')]),[true,true]);
  assert.equal(f.exchanges.length,1);assert.equal(f.exchanges[0].name,'account');assert.deepEqual(f.exchanges[0].data,{action:'operations-session',invite:'from-friend'});
  assert.equal(f.calls.length,2);assert.equal(f.calls[0].header.Authorization,'Bearer '+'b'.repeat(64));
  assert.deepEqual(Object.keys(f.calls[1].data).sort(),['book','id','kind']);
  assert.match(f.service.sharePath(),/invite=invite123/);
});
test('unconfigured analytics never calls a network and does not block reading',async()=>{
  const f=setup({baseUrl:''});assert.equal(await f.service.track('visit'),false);assert.equal(f.calls.length,0);assert.equal(f.exchanges.length,0);
});
test('submission needs consent and account switch while reading PDF prevents upload',async()=>{
  const f=setup({baseUrl:'https://operations.example.test',holdFile:true});
  const request={filePath:'local.pdf',bookId:'intro',title:'绘本',requestKey:'stable-request-key-123'};
  await assert.rejects(f.service.submitPdf(request),/确认/);
  const promise=f.service.submitPdf({...request,consent:true});
  await new Promise(resolve=>setImmediate(resolve));f.logout();f.release();await assert.rejects(promise,/账号已切换/);
  assert.equal(f.calls.filter(c=>c.url.includes('/api/prints')).length,0);
  assert.equal(f.calls.filter(c=>c.url.endsWith('/api/session/logout')).length,1,'discarded token is revoked');
});
test('late account exchange after logout cannot establish an operations identity',async()=>{
  const f=setup({baseUrl:'https://operations.example.test',holdExchange:true});
  const pending=f.service.track('visit');await new Promise(resolve=>setImmediate(resolve));f.logout();f.exchange();assert.equal(await pending,false);assert.equal(f.calls.length,1);assert.ok(f.calls[0].url.endsWith('/api/session/logout'));
});
test('native PDF submission uses binary PDF and the original idempotency key',async()=>{
  const f=setup();const result=await f.service.submitPdf({filePath:'local.pdf',bookId:'intro',title:'绘本',requestKey:'stable-request-key-123',consent:true});
  assert.equal(result.id,'receipt');const call=f.calls[0];assert.equal(call.header['Idempotency-Key'],'stable-request-key-123');assert.equal(call.header['X-Print-Consent'],'operator-file-v1');assert.equal(call.header['Content-Type'],'application/pdf');assert.ok(call.data instanceof ArrayBuffer);
});
test('payment helpers prepare or read a local intent with the verified account and never call a payment API',async()=>{
  const f=setup(),input={quoteId:'quote-id',channel:'wechat',requestKey:'stable-payment-request-123'};
  await f.service.preparePaymentIntent('order-id',input);await f.service.getPaymentIntent('intent-id');
  assert.equal(f.calls[0].url,'https://operations.example.test/api/print-orders/order-id/payment-intents');assert.equal(f.calls[0].method,'POST');assert.deepEqual(f.calls[0].data,input);assert.equal(f.calls[1].url,'https://operations.example.test/api/payment-intents/intent-id');assert.equal(f.calls[1].method,'GET');assert.equal(f.calls[1].header.Authorization,'Bearer '+'b'.repeat(64));
});
