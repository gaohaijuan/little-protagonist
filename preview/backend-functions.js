  const operationsEnabled = !!window.LITTLE_STORY_BACKEND?.enabled;
  const printRetentionDays = Number(window.LITTLE_STORY_BACKEND?.retentionDays || 30);
  const orderContactRetentionDays=Number(window.LITTLE_STORY_BACKEND?.orderContactRetentionDays||90);
  let activeOrderDialog=null;
  const orderEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const operationRequestId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),value=>value.toString(16).padStart(2,'0')).join('');
  let operationsSession = null, submissionActive = false, pendingSubmission = null;
  async function operationsRequest(url, options = {}) {
    const response = await fetch(url, options), value = await response.json();
    if (!response.ok) throw Error(value.error || '后台连接失败，请稍后重试。');
    return value;
  }
  function prepareOperations() {
    if (!operationsEnabled) return Promise.reject(Error('请使用带后台服务的阅读地址。'));
    if (!operationsSession) operationsSession = operationsRequest('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invite: new URLSearchParams(location.search).get('invite') || '' }) }).catch(error => { operationsSession = null; throw error; });
    return operationsSession;
  }
  async function trackOperation(kind, book = '', id) {
    if (!operationsEnabled) return;
    try { await prepareOperations(); await operationsRequest('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id:id||operationRequestId(), kind, book }) }); } catch (_) { /* Analytics never blocks reading. */ }
  }
  function operationsPrintButton(scope) {
    if (!operationsEnabled) return '';
    return '<button type="button" class="ls-primary" data-action="submit-print" data-scope="' + scope + '">提交' + (scope === 'level' ? '本级合集' : '本书') + '打印 · 发送给运营方</button><button type="button" class="ls-secondary" data-action="retry-print-submission" ' + (pendingSubmission ? '' : 'hidden') + '>重试发送已生成的文件</button><button type="button" class="ls-secondary" data-operations-orders>我的打印订单</button><p class="ls-print-hint">PDF含孩子的照片与名字，保存 ' + printRetentionDays + ' 天；订单联系信息保存 '+orderContactRetentionDays+' 天。提交不代表已付款或已排印。</p>';
  }
  function refreshSubmissionButtons() {
    root.querySelectorAll('[data-action="submit-print"],[data-action="retry-print-submission"]').forEach(button => { button.disabled = submissionActive || printBusy; if (button.dataset.action === 'retry-print-submission') button.hidden = !pendingSubmission; });
  }
  function clearPendingSubmission() { pendingSubmission = null; refreshSubmissionButtons(); }
  function cancelPrintSubmission() {activeOrderDialog?.close();if (submissionActive) { printRevision++; pendingSubmission?.controller?.abort(); } pendingSubmission = null; }
  function orderDialog(content){
    activeOrderDialog?.close();
    document.querySelectorAll('dialog.ls-order-modal:not([open])').forEach(dialog=>dialog.remove());
    if(!document.getElementById('ls-order-style')){const style=document.createElement('style');style.id='ls-order-style';style.textContent='.ls-order-modal{box-sizing:border-box;width:min(560px,calc(100vw - 24px));max-height:90dvh;border:0;border-radius:16px;padding:24px;background:#fbfcf7;color:#344f40;font:14px "Microsoft YaHei",sans-serif;box-shadow:0 20px 70px #0003;overflow:auto}.ls-order-modal::backdrop{background:#10291b88}.ls-order-modal h2{font-size:22px;margin:0 0 12px}.ls-order-modal p{font-size:12px;line-height:1.9;color:#73806e}.ls-order-modal form{display:grid;gap:14px}.ls-order-modal label{display:grid;gap:6px;font-size:13px}.ls-order-modal input,.ls-order-modal select,.ls-order-modal textarea{box-sizing:border-box;width:100%;font:inherit;padding:11px;border:1px solid #d4dece;border-radius:8px;color:#344f40;background:white}.ls-order-modal textarea{resize:vertical}.ls-order-modal button{font:inherit;padding:12px;border:0;border-radius:8px;background:#315d49;color:white;cursor:pointer}.ls-order-modal .ls-order-secondary{background:#e7eddf;color:#53674f}.ls-order-modal .ls-order-consent{display:flex;gap:9px;align-items:flex-start;line-height:1.8;font-size:12px}.ls-order-modal .ls-order-consent input{width:auto;margin-top:5px}.ls-order-modal .ls-order-buttons{display:flex;gap:10px}.ls-order-modal .ls-order-buttons button{flex:1}.ls-order-modal .ls-order-list{display:grid;gap:10px;margin:15px 0}.ls-order-modal .ls-order-list button{text-align:left;background:#eaf0e3;color:#40563b}.ls-order-modal [hidden]{display:none!important}.ls-order-modal .ls-order-error{color:#a7583b}';document.head.appendChild(style);}
    const dialog=document.createElement('dialog');dialog.className='ls-order-modal';dialog.setAttribute('aria-label','打印订单');dialog.innerHTML=content;document.body.appendChild(dialog);activeOrderDialog=dialog;
    dialog.addEventListener('close',()=>{if(activeOrderDialog===dialog)activeOrderDialog=null;dialog.remove();},{once:true});
    dialog.addEventListener('click',event=>{if(event.target.closest('[data-order-dialog-close]')){dialog.close();dialog.remove();if(activeOrderDialog===dialog)activeOrderDialog=null;}});dialog.showModal();return dialog;
  }
  function collectOrderDetails(scope){
    return new Promise(resolve=>{
      const plan=scope==='level'?(typeof printServicePlan==='function'?printServicePlan():{level:1,storyCount:books.length,volumeCount:1,available:books.length===6}):null;
      if(plan&&(!plan.available||!Number.isInteger(plan.level)||plan.level<1||plan.level>10||!Number.isInteger(plan.storyCount)||plan.storyCount<1||plan.storyCount>30||plan.volumeCount!==(plan.edition===shared.currentEdition.EDITION?1:Math.ceil(plan.storyCount/10)))){printStatus('所选级别的打印内容尚未准备好，请选择已开放的样册。');resolve(null);return;}
      const description=plan?'本次为 '+plan.volumeCount+' 册第'+plan.level+'级阅读故事集，包含现有 '+plan.storyCount+' 个故事。每套 '+plan.volumeCount+' 册，每册有独立封面与目录。'+(plan.sample?'当前为样册，不是完整第'+plan.level+'级。':'当前第1级为15篇试用合集。'):'本次为 1 册绘本。份数应用于本书。';
      const dialog=orderDialog('<h2>确认打印需求</h2><p>'+description+'价格与交付由运营方确认。</p><form id="ls-order-form"><label>打印份数（套）<input name="copies" type="number" min="1" max="100" step="1" value="1" required></label><label>配送方式<select name="method"><option value="shipping">快递寄送</option><option value="pickup">到店自取（取货安排由运营方联系）</option></select></label><label>联系人<input name="name" maxlength="40" autocomplete="name" required></label><label>联系电话<input name="phone" type="tel" maxlength="24" autocomplete="tel" required></label><label id="ls-order-address-label">完整收货地址<textarea name="address" rows="3" maxlength="300" minlength="5" autocomplete="street-address" required></textarea></label><label>打印备注<textarea name="note" rows="2" maxlength="500" placeholder="例如需要联系确认的事项"></textarea></label><label class="ls-order-consent"><input name="consent" type="checkbox" required><span>同意向运营方提交含孩子照片与名字的绘本文件，用于下载和处理打印，文件保存 '+printRetentionDays+' 天；联系、地址及订单备注保存 '+orderContactRetentionDays+' 天后清理。此次仅提交需求，不付款、不自动排印。</span></label><div class="ls-order-buttons"><button type="button" class="ls-order-secondary" data-order-dialog-close>取消</button><button type="submit">确认打印并提交</button></div></form>');
      let result=null;const form=dialog.querySelector('form');
      form.elements.method.addEventListener('change',()=>{const shipping=form.elements.method.value==='shipping';form.elements.address.required=shipping;dialog.querySelector('#ls-order-address-label').hidden=!shipping;});
      form.elements.phone.addEventListener('input',()=>form.elements.phone.setCustomValidity(''));form.elements.name.addEventListener('input',()=>form.elements.name.setCustomValidity(''));
      form.addEventListener('submit',event=>{event.preventDefault();const phone=form.elements.phone.value.trim(),digits=phone.replace(/\D/g,'');if(!/^\+?[\d ()-]+$/.test(phone)||digits.length<6||digits.length>20){form.elements.phone.setCustomValidity('请填写有效的联系电话');form.elements.phone.reportValidity();return;}if(!form.elements.name.value.trim()){form.elements.name.setCustomValidity('请填写联系人');form.elements.name.reportValidity();return;}const data=new FormData(form);result={copies:Number(data.get('copies')),recipient:{method:data.get('method'),name:data.get('name'),phone:data.get('phone'),address:data.get('method')==='shipping'?data.get('address'):''},note:data.get('note')||'',consentVersion:'print-order-v1',...(plan?{printPlan:{edition:plan.edition,level:plan.level,storyCount:plan.storyCount,volumeCount:plan.volumeCount}}:{})};dialog.close();});
      dialog.addEventListener('close',()=>resolve(result),{once:true});
    });
  }
  async function sendPendingSubmission(check = () => {}) {
    const pending = pendingSubmission; if (!pending) return;
    await prepareOperations(); check();
    pending.controller = new AbortController();
    const completed = [];
    for (let i = 0; i < pending.files.length; i++) {
      const file = pending.files[i]; check();
      printStatus('正在提交第 ' + (i + 1) + ' 册绘本，共 ' + pending.files.length + ' 册…');
      const result = await operationsRequest('/api/prints?' + new URLSearchParams({ book: file.bookId, title: file.title }), { method: 'POST', signal: pending.controller.signal, headers: { 'Content-Type': 'application/pdf', 'Idempotency-Key': file.key, 'X-Print-Consent': 'operator-file-v1' }, body: file.bytes });
      if(result.available===false){pendingSubmission=null;throw Error('原收件的文件已到期清理，请重新点击提交打印。');}
      file.receipt = result; completed.push(result.id); check();
    }
    check();printStatus('文件已收到，正在保存订单信息…');
    const order=await operationsRequest('/api/print-orders',{method:'POST',signal:pending.controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({requestKey:pending.orderKey,recipient:pending.orderDetails.recipient,note:pending.orderDetails.note,consentVersion:pending.orderDetails.consentVersion,...(pending.orderDetails.printPlan?{printPlan:pending.orderDetails.printPlan}:{}),items:pending.files.map(file=>({receiptId:file.receipt.id,copies:pending.orderDetails.copies}))})});check();
    pendingSubmission = null;
    printStatus('运营后台已收到 ' + completed.length + ' 册绘本文件。订单号：'+order.number+'，状态：'+order.stateLabel+'。运营方可下载处理，尚未付款或排印。');
  }
  async function submitPrint(scope, retry = false) {
    if (submissionActive || printBusy || activeOrderDialog) return;
    if(!operationsEnabled){printStatus('此试用地址尚未连接打印收件后台，暂不能提交打印需求。');return;}
    const formRevision=printRevision,orderDetails=retry?pendingSubmission?.orderDetails:await collectOrderDetails(scope);
    if(!orderDetails||formRevision!==printRevision)return;
    if (retry && !pendingSubmission) return;
    const startingRevision=printRevision;
    submissionActive = true; refreshSubmissionButtons();
    try {
      await prepareOperations();
      if(startingRevision!==printRevision)return;
      if (!retry) {
        pendingSubmission = null;
        const files = await downloadPrintFiles(scope, { collectOnly: true });
        if (!files?.length) return;
        if(scope==='level'){const plan=orderDetails.printPlan;if(!plan||files.length!==plan.volumeCount||files.some((file,index)=>file.bookId!==(plan.edition===shared.currentEdition.EDITION?shared.currentEdition.PRINT_ID:plan.volumeCount===1?'level-'+plan.level:'level-'+plan.level+'-volume-'+(index+1))))throw Error('本级绘本文件与分册清单不一致，请刷新后重试。');}
        pendingSubmission = { files: files.map(file => ({ ...file, key: operationRequestId() })),orderDetails,orderKey:operationRequestId() };
      }
      const revision = printRevision;
      await sendPendingSubmission(() => { if (revision !== printRevision) throw Object.assign(Error('已取消发送，已接收的文件仍可在后台查看。'), { name: 'AbortError' }); });
    } catch (error) {
      const note = pendingSubmission ? ' 可点“重试发送”，已接收文件不会重复创建记录。离开或刷新后未发送文件不保留。' : '';
      printStatus((error.name === 'AbortError' ? '发送已取消，已接收的部分仍保留在后台。' : error.message || '发送失败。') + note);
    } finally { submissionActive = false; printStatusButtons(); }
  }
  async function shareInvitation() {
    try {
      const session = await prepareOperations(), link = new URL('/', location.href); link.searchParams.set('invite', session.inviteCode);
      if (navigator.share) await navigator.share({ title: '小小主角：一起读自己的故事', url: link.href });
      else await navigator.clipboard.writeText(link.href);
      void trackOperation('share'); live.textContent = navigator.share ? '已打开分享。' : '邀请链接已复制。';
    } catch (error) { if (error.name !== 'AbortError') live.textContent = '未能分享，请稍后重试。'; }
  }
  async function showMyPrintOrders(id){
    try{
      await prepareOperations();
      if(id){const order=await operationsRequest('/api/print-orders/'+id),dialog=orderDialog('<h2>'+orderEscape(order.number)+'</h2><p>状态：'+orderEscape(order.stateLabel)+(order.printPlan?'<br>打印清单：第'+orderEscape(order.printPlan.level)+'级 · '+orderEscape(order.printPlan.storyCount)+'个故事 · '+orderEscape(order.printPlan.volumeCount)+'册 / 套'+(order.printPlan.sample?'（样册）':''):'')+'<br>配送：'+(order.method==='shipping'?'快递寄送':'到店自取')+'<br>联系人：'+orderEscape(order.recipient_name||'已按期限清理')+'<br>'+orderEscape(order.phone)+'<br>'+orderEscape(order.address)+'</p><div class="ls-order-list">'+order.items.map(item=>'<p>'+orderEscape(item.title)+' × '+item.copies+' 册</p>').join('')+'</div>'+(order.carrier?'<p>快递：'+orderEscape(order.carrier)+'<br>单号：'+orderEscape(order.tracking_number)+'</p>':'')+(order.billing?.quote?'<p>报价：¥'+(order.billing.quote.total/100).toFixed(2)+' · '+orderEscape(order.billing.label)+'<br>商品 ¥'+(order.billing.quote.subtotal/100).toFixed(2)+' + 运费 ¥'+(order.billing.quote.shipping/100).toFixed(2)+' − 优惠 ¥'+(order.billing.quote.discount/100).toFixed(2)+'<br>'+orderEscape(order.billing.quote.note)+'</p><p>实付 ¥'+(order.billing.paidFen/100).toFixed(2)+' / 已退款 ¥'+(order.billing.refundedFen/100).toFixed(2)+'</p>':'')+'<p>支付渠道尚未接通，此处不能发起扣款。提交需求不代表付款或已安排制作。需要更改制作中的订单，请联系运营方。</p><div class="ls-order-buttons"><button type="button" class="ls-order-secondary" data-order-dialog-close>关闭</button>'+(['pending_confirmation','awaiting_payment'].includes(order.state)&&!order.billing?.netFen?'<button type="button" data-order-user-cancel>取消本次需求</button>':'')+'</div>');
        dialog.querySelector('[data-order-user-cancel]')?.addEventListener('click',async event=>{const reason=prompt('请填写取消原因：');if(!reason?.trim())return;event.target.disabled=true;try{await operationsRequest('/api/print-orders/'+id+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:order.version,note:reason})});dialog.close();void showMyPrintOrders(id);}catch(error){event.target.disabled=false;printStatus(error.message);}});
      }else{const data=await operationsRequest('/api/print-orders');const dialog=orderDialog('<h2>我的打印订单</h2><p>此列表属于当前浏览器设备。换设备或清除站点数据后不能自动找回。</p><div class="ls-order-list">'+(data.rows.length?data.rows.map(order=>'<button type="button" data-order-customer-open="'+order.id+'">'+orderEscape(order.number)+'<br>'+orderEscape(order.stateLabel)+' · '+order.bookCount+' 本 / '+order.totalCopies+' 册</button>').join(''):'<p>还没有订单。提交打印时填写联系人和份数后，会出现在这里。</p>')+'</div><button type="button" class="ls-order-secondary" data-order-dialog-close>关闭</button>');dialog.addEventListener('click',event=>{const button=event.target.closest('[data-order-customer-open]');if(button){dialog.close();void showMyPrintOrders(button.dataset.orderCustomerOpen);}});}
    }catch(error){printStatus(error.message||'订单暂时无法打开，请重试。');}
  }
  root.addEventListener('click',event=>{if(operationsEnabled&&event.target.closest('[data-operations-orders]'))void showMyPrintOrders();});
  if (operationsEnabled) void trackOperation('visit');
