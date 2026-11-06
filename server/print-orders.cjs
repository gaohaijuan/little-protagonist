'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { uid, hash } = require('./store.cjs');
const CONSENT_VERSION = 'print-order-v1';
const LABELS = { pending_confirmation:'待确认', awaiting_payment:'待付款', confirmed:'待制作', producing:'制作中', shipped:'已发货', completed:'已完成', cancelled:'已取消', exception:'异常待处理' };
const TRANSITIONS = { pending_confirmation:['awaiting_payment','confirmed','cancelled','exception'], awaiting_payment:['confirmed','cancelled','exception'], confirmed:['producing','cancelled','exception'], producing:['shipped','completed','exception'], shipped:['completed','exception'], completed:[], cancelled:[], exception:['cancelled'] };
const error = (status,message) => Object.assign(Error(message),{status});
function text(value,name,max,{required=false}={}) {
  if(value===undefined&&!required)return '';
  if(typeof value!=='string')throw error(400,name+'格式不正确');
  const result=value.trim();if((required&&!result)||Array.from(result).length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(result))throw error(400,name+'不能为空或超出长度限制');return result;
}
function recipient(value) {
  if(!value||!['shipping','pickup'].includes(value.method))throw error(400,'请选择快递寄送或到店自取');
  const name=text(value.name,'联系人',40,{required:true}),phone=text(value.phone,'联系电话',24,{required:true}),address=text(value.address,'收货地址',300,{required:value.method==='shipping'});
  if(/[\r\n\t]/.test(name))throw error(400,'联系人不能包含换行');
  const digits=phone.replace(/\D/g,'');if(!/^\+?[\d ()-]+$/.test(phone)||digits.length<6||digits.length>20)throw error(400,'请填写有效的联系电话');
  if(value.method==='shipping'&&Array.from(address).length<5)throw error(400,'请填写完整的收货地址');
  return {method:value.method,name,phone,address:value.method==='shipping'?address:''};
}
function items(value) {
  if(!Array.isArray(value)||value.length<1||value.length>40)throw error(400,'每单应包含1至40份绘本文件');
  const seen=new Set();return value.map(item=>{
    if(!item||!/^[0-9a-f-]{36}$/.test(item.receiptId||'')||!Number.isSafeInteger(item.copies)||item.copies<1||item.copies>100||seen.has(item.receiptId))throw error(400,'文件编号、打印份数或重复文件不正确');
    seen.add(item.receiptId);return {receiptId:item.receiptId,copies:item.copies};
  });
}
function printPlan(value) {
  if(value===undefined)return null;
  const current=require('../miniprogram/lib/current-edition');
  if(value?.edition===current.EDITION){
    if(value.level!==1||value.storyCount!==15||value.volumeCount!==1)throw error(400,'当前第1级为15个故事、1册合集，请刷新打印清单');
    return current.orderPlan();
  }
  if(value?.edition)throw error(400,'打印版本已变化，请刷新打印清单');
  // Keep the unversioned six-story plan for legacy clients and order retries.
  // The current fifteen-story edition above has a separate product and snapshot.
  if(!value||value.level!==1||value.storyCount!==6||value.volumeCount!==1)throw error(400,'当前仅开放第1级6个故事、1册样册的打印清单');
  return {level:1,storyCount:6,volumeCount:1,sample:true,volumes:[{number:1,firstStory:1,lastStory:6,storyCount:6,bookId:'level-1'}]};
}
const savedPlan=value=>value?JSON.parse(value):null;
function csvCell(value) { let result=String(value??'');if(/^[\s\uFEFF]*[=+@-]/.test(result))result="'"+result;return '"'+result.replace(/"/g,'""')+'"'; }
function createPrintOrders(store,{contactRetentionDays=90}={}) {
  if(!Number.isInteger(contactRetentionDays)||contactRetentionDays<1||contactRetentionDays>365)throw Error('订单联系信息保存天数须为1–365');
  const {db,get,all,run,now}=store;
  let billing=null;
  db.exec(`CREATE TABLE IF NOT EXISTS print_orders(id TEXT PRIMARY KEY,number TEXT UNIQUE NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending_confirmation',resume_state TEXT,method TEXT NOT NULL,recipient_name TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,customer_note TEXT NOT NULL DEFAULT '',operator_note TEXT NOT NULL DEFAULT '',carrier TEXT NOT NULL DEFAULT '',tracking_number TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL,updated INTEGER NOT NULL,contact_expires INTEGER NOT NULL,contact_deleted INTEGER,UNIQUE(user_id,request_key));
    CREATE TABLE IF NOT EXISTS print_order_items(order_id TEXT NOT NULL REFERENCES print_orders(id),print_id TEXT NOT NULL REFERENCES prints(id),copies INTEGER NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(order_id,print_id));
    CREATE TABLE IF NOT EXISTS print_order_events(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES print_orders(id),actor TEXT NOT NULL,from_state TEXT NOT NULL,to_state TEXT NOT NULL,note TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS print_orders_created ON print_orders(created);
    CREATE INDEX IF NOT EXISTS print_order_items_print ON print_order_items(print_id);`);
  if(!all('PRAGMA table_info(print_orders)').some(column=>column.name==='print_plan'))db.exec("ALTER TABLE print_orders ADD COLUMN print_plan TEXT NOT NULL DEFAULT ''");
  function transaction(work) { db.exec('BEGIN IMMEDIATE');try{const result=work();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;} }
  function event(orderId,actor,from,to,note) {run('INSERT INTO print_order_events VALUES(?,?,?,?,?,?,?)',uid(),orderId,actor,from,to,note,now());}
  function requireOrder(id,userId) {const order=get('SELECT * FROM print_orders WHERE id=?',id);if(!order||(userId&&order.user_id!==userId))throw error(404,'打印订单不存在');return order;}
  function nextStates(order) {
    let choices=order.state==='exception'?[...TRANSITIONS.exception,...(order.resume_state?[order.resume_state]:[])]:TRANSITIONS[order.state]||[];
    if(order.method==='shipping')choices=choices.filter(s=>s!=='completed'||order.state==='shipped'||order.state==='exception'&&order.resume_state==='completed');
    else choices=choices.filter(s=>s!=='shipped');
    if(billing)choices=choices.filter(target=>billing.allowed(order,target));
    if(order.contact_deleted)return choices.filter(s=>s==='cancelled').map(value=>({value,label:LABELS[value]}));
    return [...new Set(choices)].map(value=>({value,label:LABELS[value]}));
  }
  function detail(id,userId) {
    const row=requireOrder(id,userId),entry=all('SELECT i.print_id AS receiptId,i.copies,p.book,p.title,p.bytes,p.expires,p.deleted FROM print_order_items i JOIN prints p ON p.id=i.print_id WHERE i.order_id=? ORDER BY i.position',id);
    return {...row,print_plan:undefined,printPlan:savedPlan(row.print_plan),billing:billing?.summary(id),fingerprint:undefined,request_key:undefined,operator_note:userId?undefined:row.operator_note,stateLabel:LABELS[row.state],recipient:{method:row.method,name:row.recipient_name,phone:row.phone,address:row.address},items:entry.map(i=>({...i,available:!i.deleted&&i.expires>now()&&fs.existsSync(path.join(store.directory,'files',i.receiptId+'.pdf'))})),events:all('SELECT actor,from_state,to_state,note,created FROM print_order_events WHERE order_id=? ORDER BY created,rowid',id).map(event=>userId&&event.actor==='admin'?{...event,note:''}:event),nextStates:nextStates(row),editable:['pending_confirmation','awaiting_payment','confirmed'].includes(row.state)&&!row.contact_deleted&&!billing?.summary(id).paidFen,paymentNotice:'订单处理状态不代表支付成功，真实支付尚需商户系统核验'};
  }
  function create(user,input) {
    if(!input||input.consentVersion!==CONSENT_VERSION)throw error(400,'请先确认打印订单信息用途与保存期限');
    if(!/^[a-zA-Z0-9-]{16,100}$/.test(input.requestKey||''))throw error(400,'订单请求编号无效');
    const delivery=recipient(input.recipient),selected=items(input.items),note=text(input.note,'订单备注',500),plan=printPlan(input.printPlan);
    const fingerprint=hash(JSON.stringify({recipient:delivery,items:selected,note,...(plan?{printPlan:plan}:{})}));
    return transaction(()=>{
      const existing=get('SELECT id,fingerprint FROM print_orders WHERE user_id=? AND request_key=?',user.id,input.requestKey);
      if(existing){if(existing.fingerprint!==fingerprint)throw error(409,'重试编号对应的订单信息发生变化，请刷新订单后重试');return {...detail(existing.id,user.id),duplicate:true};}
      for(const item of selected){const file=get('SELECT * FROM prints WHERE id=? AND user_id=?',item.receiptId,user.id);if(!file)throw error(400,'只能使用本人已提交的绘本文件');if(file.deleted||file.expires<=now()||!fs.existsSync(path.join(store.directory,'files',file.id+'.pdf')))throw error(410,'绘本文件已清理，请重新生成并提交');}
      if(plan&&(selected.length!==plan.volumeCount||selected.some((item,index)=>get('SELECT book FROM prints WHERE id=?',item.receiptId).book!==plan.volumes[index].bookId)))throw error(400,'绘本文件与打印分册清单不一致，请重新生成');
      const id=uid(),stamp=new Date(now()+8*3600000).toISOString().slice(0,10).replaceAll('-',''),number='PO'+stamp+id.replaceAll('-','').slice(0,10).toUpperCase();
      run('INSERT INTO print_orders(id,number,user_id,request_key,fingerprint,method,recipient_name,phone,address,customer_note,created,updated,contact_expires) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',id,number,user.id,input.requestKey,fingerprint,delivery.method,delivery.name,delivery.phone,delivery.address,note,now(),now(),now()+contactRetentionDays*86400000);
      if(plan)run('UPDATE print_orders SET print_plan=? WHERE id=?',JSON.stringify(plan),id);
      selected.forEach((item,index)=>run('INSERT INTO print_order_items VALUES(?,?,?,?)',id,item.receiptId,item.copies,index));
      event(id,'user','','pending_confirmation','提交打印申请');store.audit('create-print-order',id);return {...detail(id,user.id),duplicate:false};
    });
  }
  function update(id,input,{userId=null}={}) {
    if(!input||!Number.isSafeInteger(input.version))throw error(400,'缺少订单版本，请刷新订单后再操作');
    return transaction(()=>{
      const order=requireOrder(id,userId);if(order.version!==input.version)throw error(409,'订单已被更新，请刷新后再操作');
      const actor=userId?'user':'admin',note=text(input.note,'处理说明',500),target=input.state||order.state;
      if(userId&&(target!=='cancelled'||!['pending_confirmation','awaiting_payment'].includes(order.state)||input.recipient||input.items||input.shipment||input.operatorNote!==undefined))throw error(409,'当前订单不能由用户修改，请联系运营方');
      if(!Object.hasOwn(LABELS,target))throw error(400,'订单状态无效');
      const changedState=target!==order.state;
      if(changedState&&!nextStates(order).some(s=>s.value===target))throw error(409,'当前状态不能执行此操作');
      if(changedState&&['cancelled','exception'].includes(target)&&!note)throw error(400,'取消或异常订单须填写处理原因');
      if(order.contact_deleted&&target!=='cancelled')throw error(410,'订单联系信息已到期清理，不能继续处理');
      const delivery=input.recipient?recipient(input.recipient):{method:order.method,name:order.recipient_name,phone:order.phone,address:order.address};
      const selected=input.items?items(input.items):null;
      if((input.recipient||selected)&&!['pending_confirmation','awaiting_payment','confirmed'].includes(order.state))throw error(409,'制作开始后不能直接改动联系人或份数，请先记录异常处理');
      if(selected){const previous=all('SELECT print_id FROM print_order_items WHERE order_id=?',id);if(previous.length!==selected.length||selected.some(i=>!previous.some(p=>p.print_id===i.receiptId)))throw error(400,'不能替换订单中的文件，只能调整份数');}
      billing?.beforeOrderUpdate(order,input,target);
      let carrier=order.carrier,tracking=order.tracking_number;
      if(input.shipment){carrier=text(input.shipment.carrier,'快递公司',60,{required:true});tracking=text(input.shipment.trackingNumber,'快递单号',80,{required:true});if(!/^[A-Za-z0-9-]{4,80}$/.test(tracking))throw error(400,'快递单号格式不正确');}
      if(target==='shipped'&&(delivery.method!=='shipping'||!carrier||!tracking))throw error(400,'快递发货须填写快递公司和单号');
      if(changedState&&target==='producing'&&detail(id).items.some(i=>!i.available))throw error(410,'订单包含已清理的PDF，无法开始制作');
      const operatorNote=input.operatorNote===undefined?order.operator_note:text(input.operatorNote,'内部备注',1000);
      run('UPDATE print_orders SET state=?,resume_state=?,method=?,recipient_name=?,phone=?,address=?,operator_note=?,carrier=?,tracking_number=?,version=version+1,updated=? WHERE id=?',target,target==='exception'&&changedState?order.state:target===order.resume_state?null:order.resume_state,delivery.method,delivery.name,delivery.phone,delivery.address,operatorNote,carrier,tracking,now(),id);
      if(selected)selected.forEach(i=>run('UPDATE print_order_items SET copies=? WHERE order_id=? AND print_id=?',i.copies,id,i.receiptId));
      event(id,actor,order.state,target,note||(changedState?LABELS[target]:'更新联系人、份数或内部备注'));store.audit(changedState?'order-state-'+target:'update-print-order',id);billing?.afterOrderUpdate(order,input,target);return detail(id,userId);
    });
  }
  function conditions({days='30',q='',state='',source='',userId=null}={}) {
    if(!['7','30','90','all'].includes(days)||typeof q!=='string'||q.length>100||(state&&!Object.hasOwn(LABELS,state))||(source&&!['browser','wechat','douyin'].includes(source)))throw error(400,'订单筛选条件无效');
    const since=days==='all'?0:Date.parse(new Date(now()+8*3600000).toISOString().slice(0,10)+'T00:00:00+08:00')-(Number(days)-1)*86400000;
    const term='%'+q+'%',args=[since,term,term,term,term,term,term,state,state,source,source];
    let where="o.created>=? AND (o.number LIKE ? OR o.user_id LIKE ? OR o.recipient_name LIKE ? OR o.phone LIKE ? OR o.tracking_number LIKE ? OR EXISTS(SELECT 1 FROM print_order_items oi JOIN prints p ON p.id=oi.print_id WHERE oi.order_id=o.id AND p.title LIKE ?)) AND (?='' OR o.state=?) AND (?='' OR u.source=?)";
    if(userId){where+=' AND o.user_id=?';args.push(userId);}return {where,args};
  }
  function list(options={}) {
    const page=options.page??1;if(!Number.isSafeInteger(page)||page<1)throw error(400,'订单页码无效');
    const {where,args}=conditions(options),total=get('SELECT COUNT(*) n FROM print_orders o JOIN users u ON u.id=o.user_id WHERE '+where,...args).n;
    const rows=all(`SELECT o.id,o.number,o.user_id,o.state,o.method,o.recipient_name,o.phone,o.created,o.updated,o.contact_deleted,u.source,(SELECT SUM(copies) FROM print_order_items WHERE order_id=o.id) totalCopies,(SELECT COUNT(*) FROM print_order_items WHERE order_id=o.id) bookCount FROM print_orders o JOIN users u ON u.id=o.user_id WHERE ${where} ORDER BY o.created DESC,o.rowid DESC LIMIT 25 OFFSET ?`,...args,(page-1)*25).map(row=>({...row,stateLabel:LABELS[row.state]}));
    return {rows,total,page,pageSize:25};
  }
  function exportCsv(options) {
    const {where,args}=conditions(options),rows=all(`SELECT o.*,u.source FROM print_orders o JOIN users u ON u.id=o.user_id WHERE ${where} ORDER BY o.created DESC LIMIT 10001`,...args);
    if(rows.length>10000)throw error(400,'导出超过10000单，请缩小日期或搜索范围');
    const lines=[['订单号','用户编号','来源','处理状态','配送方式','联系人','电话','地址','绘本及份数','快递公司','快递单号','用户备注','内部备注','提交时间','联系信息到期时间']];
    for(const row of rows){const books=all('SELECT p.title,i.copies FROM print_order_items i JOIN prints p ON p.id=i.print_id WHERE i.order_id=? ORDER BY i.position',row.id);lines.push([row.number,row.user_id,row.source,LABELS[row.state],row.method==='shipping'?'快递寄送':'到店自取',row.recipient_name,row.phone,row.address,books.map(b=>b.title+' × '+b.copies).join('；'),row.carrier,row.tracking_number,row.customer_note,row.operator_note,new Date(row.created).toISOString(),new Date(row.contact_expires).toISOString()]);}
    store.audit('export-print-orders',String(rows.length));return '\uFEFF'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n');
  }
  function cleanup() {
    for(const row of all('SELECT id,state FROM print_orders WHERE contact_deleted IS NULL AND contact_expires<=?',now()))transaction(()=>{
      const terminal=['completed','cancelled'].includes(row.state),target=terminal?row.state:'exception';
      run("UPDATE print_orders SET recipient_name='',phone='',address='',customer_note='',operator_note='',carrier='',tracking_number='',contact_deleted=?,state=?,resume_state=NULL,version=version+1,updated=? WHERE id=?",now(),target,now(),row.id);
      run("UPDATE print_order_events SET note='' WHERE order_id=?",row.id);event(row.id,'system',row.state,target,'联系信息已按保存期限清理');store.audit('expire-order-contact',row.id);
    });
    billing?.cleanup();
  }
  return {setBilling(value){billing=value;},create,update,detail,list,exportCsv,cleanup,contactRetentionDays,labels:LABELS};
}
module.exports={createPrintOrders,CONSENT_VERSION,LABELS};
