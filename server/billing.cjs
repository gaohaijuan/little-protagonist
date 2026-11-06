'use strict';
const {uid,hash}=require('./store.cjs');
const {listBooks}=require('../miniprogram/lib/stories');
const failure=(status,message)=>Object.assign(Error(message),{status});
const fen=(value,name,{zero=true}={})=>{if(!Number.isSafeInteger(value)||value<(zero?0:1)||value>100000000)throw failure(400,name+'必须是有效的整数分');return value;};
const note=(value,max=500)=>{if(typeof value!=='string'||!value.trim()||Array.from(value.trim()).length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value))throw failure(400,'请填写有效的说明');return value.trim();};
function createBilling(store,orders){
  const {db,get,all,run,now}=store;
  db.exec(`CREATE TABLE IF NOT EXISTS billing_products(id TEXT PRIMARY KEY,book_id TEXT UNIQUE NOT NULL,name TEXT NOT NULL,unit_fen INTEGER,status TEXT NOT NULL DEFAULT 'draft',version INTEGER NOT NULL DEFAULT 1,updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS billing_quotes(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES print_orders(id),state TEXT NOT NULL,items_json TEXT NOT NULL,order_signature TEXT NOT NULL,subtotal INTEGER NOT NULL,shipping INTEGER NOT NULL,discount INTEGER NOT NULL,total INTEGER NOT NULL,note TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS billing_intents(id TEXT PRIMARY KEY,merchant_order_id TEXT UNIQUE NOT NULL,print_order_id TEXT NOT NULL REFERENCES print_orders(id),quote_id TEXT NOT NULL REFERENCES billing_quotes(id),user_id TEXT NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,channel TEXT NOT NULL,amount INTEGER NOT NULL,currency TEXT NOT NULL DEFAULT 'CNY',state TEXT NOT NULL DEFAULT 'prepared',review TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL,expires INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1,UNIQUE(user_id,request_key));
    CREATE TABLE IF NOT EXISTS billing_refund_requests(id TEXT PRIMARY KEY,intent_id TEXT NOT NULL REFERENCES billing_intents(id),request_key TEXT UNIQUE NOT NULL,amount INTEGER NOT NULL,reason TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'requested',created INTEGER NOT NULL,updated INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS billing_quotes_order ON billing_quotes(order_id,created);
    CREATE INDEX IF NOT EXISTS billing_intents_print_order ON billing_intents(print_order_id);
    CREATE INDEX IF NOT EXISTS billing_refunds_intent ON billing_refund_requests(intent_id);`);
  db.exec(`CREATE TABLE IF NOT EXISTS billing_intent_requests(user_id TEXT NOT NULL,request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,intent_id TEXT NOT NULL REFERENCES billing_intents(id),PRIMARY KEY(user_id,request_key));
    INSERT OR IGNORE INTO billing_intent_requests SELECT user_id,request_key,fingerprint,id FROM billing_intents;`);
  if(!all('PRAGMA table_info(billing_refund_requests)').some(c=>c.name==='cancel_reason'))db.exec("ALTER TABLE billing_refund_requests ADD COLUMN cancel_reason TEXT NOT NULL DEFAULT ''");
  const edition=require('../miniprogram/lib/current-edition');
  for(const book of [...listBooks(undefined,undefined,{includeApproved:true}),...edition.listBooks(),{id:edition.PRINT_ID,title:'第1级15篇阅读合集'}])run('INSERT OR IGNORE INTO billing_products(id,book_id,name,unit_fen,status,updated) VALUES(?,?,?,NULL,?,?)','print-'+book.id,book.id,book.title+' · 绘本打印','draft',now());
  run('INSERT OR IGNORE INTO billing_products(id,book_id,name,unit_fen,status,updated) VALUES(?,?,?,NULL,?,?)','print-level-1','level-1','第1级阅读故事集（现有'+listBooks(undefined,undefined,{includeApproved:true}).length+'个故事样册）','draft',now());
  function tx(work){db.exec('BEGIN IMMEDIATE');try{const result=work();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
  function requireOrder(id,userId){const order=get('SELECT * FROM print_orders WHERE id=?',id);if(!order||(userId&&order.user_id!==userId))throw failure(404,'打印订单不存在');return order;}
  function signature(orderId){const order=requireOrder(orderId);return hash(JSON.stringify({method:order.method,address:order.address,items:all('SELECT print_id,copies FROM print_order_items WHERE order_id=? ORDER BY position',orderId)}));}
  function productList(){return {rows:all('SELECT * FROM billing_products ORDER BY rowid'),currency:'CNY'};}
  function updateProduct(id,input){return tx(()=>{const product=get('SELECT * FROM billing_products WHERE id=?',id);if(!product)throw failure(404,'商品不存在');if(input.version!==product.version)throw failure(409,'商品价格已更新，请刷新');if(!['draft','active'].includes(input.status))throw failure(400,'商品状态无效');const name=note(input.name,80),price=input.unitFen===null?null:fen(input.unitFen,'单价',{zero:false});if(input.status==='active'&&price===null)throw failure(400,'填写单价后才能启用商品');run('UPDATE billing_products SET name=?,unit_fen=?,status=?,version=version+1,updated=? WHERE id=?',name,price,input.status,now(),id);store.audit('update-product',id);return get('SELECT * FROM billing_products WHERE id=?',id);});}
  function quoteValue(row){return row?{...row,items:JSON.parse(row.items_json),items_json:undefined,order_signature:undefined,effective:row.state==='active'&&row.expires>now()}:null;}
  function paymentState(intent){
    const paid=get("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE order_id=? AND kind='paid'",intent.merchant_order_id).n,refunded=get("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE order_id=? AND kind='refund'",intent.merchant_order_id).n;
    const reserved=get("SELECT COALESCE(SUM(amount),0) n FROM billing_refund_requests WHERE intent_id=? AND state IN ('requested','needs_review')",intent.id).n;
    return {paidFen:paid,refundedFen:refunded,netFen:paid-refunded,pendingRefundFen:reserved,refundableFen:Math.max(0,paid-refunded-reserved),canFulfill:paid>0&&refunded===0&&!reserved&&!intent.review};
  }
  function summary(orderId){
    const quote=get('SELECT * FROM billing_quotes WHERE order_id=? ORDER BY created DESC,rowid DESC LIMIT 1',orderId),intents=all('SELECT * FROM billing_intents WHERE print_order_id=? ORDER BY created DESC,rowid DESC',orderId);
    const payments=intents.map(intent=>({...intent,...paymentState(intent),request_key:undefined,fingerprint:undefined}));
    const paid=payments.reduce((n,p)=>n+p.paidFen,0),refunded=payments.reduce((n,p)=>n+p.refundedFen,0);
    let label=quote?'待付款':'待报价';if(quote&&(!quoteValue(quote).effective)&&!paid)label='报价已失效';if(paid)label=refunded>=paid?'已全额退款':refunded?'部分退款':'已核验付款';if(payments.some(p=>p.pendingRefundFen))label='退款申请待渠道处理';if(payments.some(p=>p.review))label='异常收款待核对';
    return {quote:quoteValue(quote),intents:payments,paidFen:paid,refundedFen:refunded,netFen:paid-refunded,label,hasBilling:!!quote,canFulfill:paid>0&&refunded===0&&!payments.some(p=>p.pendingRefundFen||p.review),gatewayReady:false};
  }
  function quote(orderId,input){return tx(()=>{
    const order=requireOrder(orderId);if(order.version!==input.version)throw failure(409,'订单已更新，请刷新后报价');if(!['pending_confirmation','awaiting_payment','confirmed'].includes(order.state)||order.contact_deleted)throw failure(409,'当前订单不能报价');
    if(orders.detail(orderId).items.some(i=>!i.available))throw failure(410,'订单PDF已清理，请用户重新提交后再报价');
    if(summary(orderId).paidFen)throw failure(409,'已有付款记录，不能修改原报价；需要退款或重新下单');
    const shipping=fen(input.shippingFen,'运费'),discount=fen(input.discountFen,'优惠金额'),reason=note(input.note),hours=input.validHours??24;
    if(!Number.isInteger(hours)||hours<1||hours>168)throw failure(400,'报价有效期应为1至168小时');if(order.method==='pickup'&&shipping)throw failure(400,'自取订单不能收取运费');
    const lines=all('SELECT i.print_id,i.copies,p.book FROM print_order_items i JOIN prints p ON p.id=i.print_id WHERE i.order_id=? ORDER BY i.position',orderId).map(item=>{const product=get("SELECT * FROM billing_products WHERE book_id=? AND status='active'",item.book);if(!product||product.unit_fen===null)throw failure(409,'请先启用对应绘本的商品价格：'+item.book);return {receiptId:item.print_id,bookId:item.book,productId:product.id,productName:product.name,productVersion:product.version,unitFen:product.unit_fen,copies:item.copies,lineFen:product.unit_fen*item.copies};});
    const subtotal=fen(lines.reduce((n,item)=>n+item.lineFen,0),'商品合计'),total=fen(subtotal+shipping-discount,'应付金额',{zero:false});
    const id=uid();run("UPDATE billing_quotes SET state='superseded' WHERE order_id=? AND state='active'",orderId);run("UPDATE billing_intents SET state='closed',version=version+1 WHERE print_order_id=? AND state='prepared'",orderId);
    run('INSERT INTO billing_quotes VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,orderId,'active',JSON.stringify(lines),signature(orderId),subtotal,shipping,discount,total,reason,now(),now()+hours*3600000);
    run("UPDATE print_orders SET state='awaiting_payment',version=version+1,updated=? WHERE id=?",now(),orderId);run('INSERT INTO print_order_events VALUES(?,?,?,?,?,?,?)',uid(),orderId,'system',order.state,'awaiting_payment','已生成报价，等待支付核验',now());store.audit('quote-print-order',orderId);return summary(orderId);
  });}
  function prepareIntent(user,orderId,input){return tx(()=>{
    const order=requireOrder(orderId,user.id);if(!/^[A-Za-z0-9-]{16,100}$/.test(input.requestKey||'')||!['wechat','douyin'].includes(input.channel))throw failure(400,'付款单请求编号或渠道无效');
    if(user.source!=='browser'&&input.channel!==user.source)throw failure(400,'付款渠道与当前平台不一致');
    const fingerprint=hash(JSON.stringify({orderId,quoteId:input.quoteId,channel:input.channel})),old=get('SELECT * FROM billing_intent_requests WHERE user_id=? AND request_key=?',user.id,input.requestKey);
    if(old){if(old.fingerprint!==fingerprint)throw failure(409,'付款请求编号对应内容已变化');return {...intentDetail(old.intent_id,user.id),duplicate:true};}
    const price=get("SELECT * FROM billing_quotes WHERE id=? AND order_id=? AND state='active'",input.quoteId||'',orderId);
    if(order.state!=='awaiting_payment'||order.contact_deleted||!price||price.expires<=now()||price.order_signature!==signature(orderId))throw failure(409,'报价已失效或订单状态已变化，请重新确认报价');
    if(orders.detail(orderId).items.some(i=>!i.available))throw failure(410,'订单PDF已清理，不能准备付款单');
    const current=get("SELECT id FROM billing_intents WHERE print_order_id=? AND quote_id=? AND state='prepared' AND expires>? AND channel=?",orderId,price.id,now(),input.channel);if(current){run('INSERT INTO billing_intent_requests VALUES(?,?,?,?)',user.id,input.requestKey,fingerprint,current.id);return {...intentDetail(current.id,user.id),duplicate:true};}
    const id=uid(),merchant='PAY'+id.replaceAll('-','').toUpperCase();run('INSERT INTO billing_intents(id,merchant_order_id,print_order_id,quote_id,user_id,request_key,fingerprint,channel,amount,created,expires) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,merchant,orderId,price.id,user.id,input.requestKey,fingerprint,input.channel,price.total,now(),Math.min(price.expires,now()+15*60000));run('INSERT INTO billing_intent_requests VALUES(?,?,?,?)',user.id,input.requestKey,fingerprint,id);store.audit('prepare-payment-order',id);return {...intentDetail(id,user.id),duplicate:false};
  });}
  function intentDetail(id,userId){const row=get('SELECT i.*,o.number FROM billing_intents i JOIN print_orders o ON o.id=i.print_order_id WHERE i.id=?',id);if(!row||(userId&&row.user_id!==userId))throw failure(404,'付款单不存在');return {...row,request_key:undefined,fingerprint:undefined,...paymentState(row),quote:quoteValue(get('SELECT * FROM billing_quotes WHERE id=?',row.quote_id)),events:all('SELECT event_id,transaction_id,kind,amount,created FROM payments WHERE order_id=? ORDER BY created,rowid',row.merchant_order_id),refundRequests:userId?undefined:all('SELECT * FROM billing_refund_requests WHERE intent_id=? ORDER BY created DESC,rowid DESC',id),gatewayReady:false,notice:'当前仅准备付款单，支付渠道尚未接通，不能在此发起扣款'};}
  function recordPayment(value,fingerprint){
    for(const key of ['eventId','orderId','transactionId'])if(typeof value[key]!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(value[key]))throw failure(400,'付款编号无效');
    return tx(()=>{
    const intent=get('SELECT * FROM billing_intents WHERE merchant_order_id=?',value.orderId||'');
    if(!intent)return store.payment(value,fingerprint);
    if(value.userId!==intent.user_id||value.currency!=='CNY'||value.channel!==intent.channel)throw failure(409,'付款用户、币种或渠道与付款单不一致');
    if(value.kind==='paid'&&value.amountFen!==intent.amount)throw failure(409,'实付金额与锁定报价不一致');
    const prior=get('SELECT fingerprint FROM payments WHERE event_id=?',value.eventId||'');if(prior){if(prior.fingerprint!==fingerprint)throw failure(409,'事件编号对应内容发生变化');return {duplicate:true};}
    const request=value.refundRequestId?get('SELECT * FROM billing_refund_requests WHERE id=?',value.refundRequestId):null;
    if(value.refundRequestId&&(value.kind!=='refund'||!request||request.intent_id!==intent.id||request.amount!==value.amountFen))throw failure(409,'退款申请与渠道核验金额不一致');
    const result=store.payment(value,fingerprint);if(result.duplicate)return result;
    const order=requireOrder(intent.print_order_id),price=get('SELECT * FROM billing_quotes WHERE id=?',intent.quote_id);
    if(value.kind==='paid'){
      const invalid=intent.state!=='prepared'||intent.expires<=now()||price.state!=='active'||price.expires<=now()||price.order_signature!==signature(order.id)||order.state!=='awaiting_payment'||order.contact_deleted||orders.detail(order.id).items.some(i=>!i.available);
      run("UPDATE billing_intents SET state='paid',review=?,version=version+1 WHERE id=?",invalid?'付款到达时订单或报价已变化，请核对并安排退款':'',intent.id);
      if(!invalid){run("UPDATE print_orders SET state='confirmed',version=version+1,updated=? WHERE id=?",now(),order.id);run('INSERT INTO print_order_events VALUES(?,?,?,?,?,?,?)',uid(),order.id,'system',order.state,'confirmed','付款已由服务端核验',now());}
    }else{
      if(request)run("UPDATE billing_refund_requests SET state='recorded',updated=? WHERE id=?",now(),request.id);
      const stats=paymentState(intent);if(stats.pendingRefundFen>stats.netFen)run("UPDATE billing_refund_requests SET state='needs_review',updated=? WHERE intent_id=? AND state='requested'",now(),intent.id);
      run('UPDATE billing_intents SET version=version+1 WHERE id=?',intent.id);
      run('UPDATE print_orders SET version=version+1,updated=? WHERE id=?',now(),order.id);run('INSERT INTO print_order_events VALUES(?,?,?,?,?,?,?)',uid(),order.id,'system',order.state,order.state,'退款已由服务端核验',now());
    }
    store.audit('linked-payment-'+value.kind,intent.id);return {...result,paymentOrderId:intent.id};
  });}
  function refundRequest(id,input){return tx(()=>{
    const intent=get('SELECT * FROM billing_intents WHERE id=?',id);if(!intent)throw failure(404,'付款单不存在');const reason=note(input.reason),amount=fen(input.amountFen,'退款金额',{zero:false});
    if(!/^[A-Za-z0-9-]{16,100}$/.test(input.requestKey||''))throw failure(400,'退款请求编号无效');const old=get('SELECT * FROM billing_refund_requests WHERE request_key=?',input.requestKey);
    if(old){if(old.intent_id!==id||old.amount!==amount||old.reason!==reason)throw failure(409,'退款请求编号对应信息已变化');return {...old,duplicate:true};}
    if(input.version!==intent.version)throw failure(409,'付款单已更新，请刷新');if(amount>paymentState(intent).refundableFen)throw failure(409,'退款金额超过尚可退款金额，或已有待处理申请');
    const requestId=uid();run('INSERT INTO billing_refund_requests(id,intent_id,request_key,amount,reason,created,updated) VALUES(?,?,?,?,?,?,?)',requestId,id,input.requestKey,amount,reason,now(),now());run('UPDATE billing_intents SET version=version+1 WHERE id=?',id);store.audit('request-refund',requestId);return {...get('SELECT * FROM billing_refund_requests WHERE id=?',requestId),duplicate:false,notice:'仅登记申请，尚未向支付渠道执行退款'};
  });}
  function cancelRefund(id,input){return tx(()=>{const row=get('SELECT * FROM billing_refund_requests WHERE id=?',id);if(!row)throw failure(404,'退款申请不存在');if(!['requested','needs_review'].includes(row.state))throw failure(409,'此申请已结束');const reason=note(input.reason);run("UPDATE billing_refund_requests SET state='cancelled',cancel_reason=?,updated=? WHERE id=?",reason,now(),id);run('UPDATE billing_intents SET version=version+1 WHERE id=?',row.intent_id);store.audit('cancel-refund-request',id);return {ok:true};});}
  function structuralChange(order,input){
    if(input.recipient){const r=input.recipient;if(r.method!==order.method||r.name.trim()!==order.recipient_name||r.phone.trim()!==order.phone||(r.method==='shipping'?(r.address||'').trim():'')!==order.address)return true;}
    return !!input.items&&input.items.some(item=>get('SELECT copies FROM print_order_items WHERE order_id=? AND print_id=?',order.id,item.receiptId)?.copies!==item.copies);
  }
  function allowed(order,target){const bill=summary(order.id);return !(bill.hasBilling&&['confirmed','producing','shipped','completed'].includes(target)&&!bill.canFulfill)&&!(bill.netFen>0&&target==='cancelled');}
  function beforeOrderUpdate(order,input,target){
    const bill=summary(order.id),structural=structuralChange(order,input);
    input.billingStructural=structural;
    if(bill.paidFen&&structural)throw failure(409,'已付款订单不能直接修改联系人或份数，请走异常与退款流程');
    if(bill.hasBilling&&target!==order.state&&['confirmed','producing','shipped','completed'].includes(target)&&!bill.canFulfill)throw failure(409,'该订单尚未核验付款，或正在退款/异常处理中，不能推进制作交付');
    if(bill.paidFen>bill.refundedFen&&target==='cancelled')throw failure(409,'订单仍有实付余额，请先完成退款核验再取消');
  }
  function afterOrderUpdate(order,input,target){
    const structural=input.billingStructural;
    if(structural&&target!=='cancelled'&&get("SELECT id FROM billing_quotes WHERE order_id=? AND state='active'",order.id)){
      run("UPDATE billing_quotes SET state='invalidated' WHERE order_id=? AND state='active'",order.id);run("UPDATE billing_intents SET state='closed',version=version+1 WHERE print_order_id=? AND state='prepared'",order.id);run("UPDATE print_orders SET state='pending_confirmation' WHERE id=?",order.id);run('INSERT INTO print_order_events VALUES(?,?,?,?,?,?,?)',uid(),order.id,'system',target,'pending_confirmation','联系人、配送或份数已变更，原报价作废',now());
    }
    if(target==='cancelled'){run("UPDATE billing_quotes SET state='invalidated' WHERE order_id=? AND state='active'",order.id);run("UPDATE billing_intents SET state='closed',version=version+1 WHERE print_order_id=? AND state='prepared'",order.id);}
  }
  function cleanup(){
    run("UPDATE billing_quotes SET state='expired' WHERE state='active' AND expires<=?",now());
    run("UPDATE billing_quotes SET state='invalidated' WHERE state='active' AND order_id IN(SELECT id FROM print_orders WHERE contact_deleted IS NOT NULL OR state='cancelled')");
    run("UPDATE billing_intents SET state='closed',version=version+1 WHERE state='prepared' AND (expires<=? OR quote_id IN(SELECT id FROM billing_quotes WHERE state<>'active'))",now());
    run("UPDATE billing_quotes SET note='' WHERE order_id IN(SELECT id FROM print_orders WHERE contact_deleted IS NOT NULL)");
    run("UPDATE billing_refund_requests SET reason='',cancel_reason='' WHERE intent_id IN(SELECT i.id FROM billing_intents i JOIN print_orders o ON o.id=i.print_order_id WHERE o.contact_deleted IS NOT NULL)");
  }
  function listIntents({days='30',q='',page=1}={}){if(!['7','30','90','all'].includes(days)||typeof q!=='string'||q.length>100||!Number.isSafeInteger(page)||page<1)throw failure(400,'付款单筛选条件无效');const since=days==='all'?0:Date.parse(new Date(now()+8*3600000).toISOString().slice(0,10)+'T00:00:00+08:00')-(Number(days)-1)*86400000,term='%'+q+'%',args=[since,term,term,term],where='i.created>=? AND (i.merchant_order_id LIKE ? OR i.user_id LIKE ? OR o.number LIKE ?)';const total=get('SELECT COUNT(*) n FROM billing_intents i JOIN print_orders o ON o.id=i.print_order_id WHERE '+where,...args).n;return {total,page,pageSize:25,rows:all('SELECT i.*,o.number FROM billing_intents i JOIN print_orders o ON o.id=i.print_order_id WHERE '+where+' ORDER BY i.created DESC,i.rowid DESC LIMIT 25 OFFSET ?',...args,(page-1)*25).map(row=>({...row,request_key:undefined,fingerprint:undefined,...paymentState(row)}))};}
  return {productList,updateProduct,summary,quote,prepareIntent,intentDetail,recordPayment,refundRequest,cancelRefund,beforeOrderUpdate,afterOrderUpdate,listIntents,allowed,cleanup};
}
module.exports={createBilling};
