'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const labels = { system:['运行与备份','检查服务状态、文件空间与备份下载。'],audit:['操作记录','查看订单、文件、价格与付款相关操作。'], products:['商品价格','设置绘本打印单价，按册数生成报价。'],billing:['支付订单','查看关联报价的付款单与退款申请。'], orders:['打印订单','从收到需求，到制作、发货和交付。'], overview: ['运营概览', '从阅读开始，看见每一次成长。'], prints: ['打印收件箱', '接收家长提交的个性化绘本，下载后跟进处理。'], users: ['用户管理', '查看新用户、来源和付费记录。'], payments: ['资金流水', '仅展示服务端核验后写入的实付与退款。'], referrals: ['邀请与裂变', '从分享发起，到新用户加入和首次付款。'] };
  const sourceLabel = source => ({wechat:'微信登录',douyin:'抖音登录',browser:'浏览器设备'}[source] || '其他来源');
  const states = { received: '待处理', processing: '处理中', completed: '已完成', cancelled: '已取消' };
  let orderId=null,billingId=null,userId=null,userSection='activity',userPage=1;
  let tab = 'overview', page = 1, query = '', filterState = '', csrf = '', revision = 0, timer, config;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = ms => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
  const money = fen => '¥' + (fen / 100).toFixed(2);
  const short = value => `<button class="subtle-link" title="${esc(value)}" data-user-open="${esc(value)}">${esc(value.slice(0, 8))}…</button>`;
  function message(text) { $('#message').hidden = false; $('#message').textContent = text; clearTimeout(timer); timer = setTimeout(() => { $('#message').hidden = true; }, 5000); }
  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'X-Admin-CSRF': csrf, ...options.headers } });
    const value = await response.json();
    if (!response.ok) { if (response.status === 401 && !url.endsWith('/login')) showLogin(); const error=Error(value.error||'请求失败');error.status=response.status;throw error; }
    return value;
  }
  const systemUI=window.SystemAdmin.create({api,esc,date,message,reload:load});
  const billingUI=window.BillingAdmin.create({api,esc,date,money,message,reload:load,open:id=>{billingId=id;tab='billing';void load();},back:()=>{billingId=null;void load();}});
  const usersUI=window.UserAdmin.create({esc,date,money,sourceLabel,open:id=>{userId=id;userSection='activity';userPage=1;tab='users';void load();},section:(section,p)=>{if(section)userSection=section;userPage=p;void load();},back:()=>{userId=null;void load();}});
  const ordersUI=window.PrintOrders.create({api,esc,date,sourceLabel,message,open:id=>{orderId=id;tab='orders';void load();},back:()=>{orderId=null;void load();},reload:load,getConfig:()=>config,billingUI});
  function showLogin() { $('#login').hidden = false; $('#workspace').hidden = true; csrf = ''; revision++; }
  function card(label, value, hint, emphasis = false) { return `<article class="card${emphasis ? ' emphasis' : ''}"><span class="label">${label}</span><strong>${esc(value)}</strong><small>${hint}</small></article>`; }
  function table(headers, rows) { return `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${headers.length}"><div class="empty">这里还没有记录<br><small>连接阅读端后，真实数据会出现在这里。</small></div></td></tr>`}</tbody></table></div>`; }
  function overview(value) {
    const max = Math.max(1, ...value.trend.map(d => d.users));
    return `<div class="cards">${card('累计用户', value.totalUsers, '所选范围新增 ' + value.newUsers + ' 位', true)}${card('活跃用户', value.activeUsers, '范围内至少访问或阅读一次')}${card('实付收入', money(value.paidFen), '来自 ' + value.paidOrders + ' 笔已核验付款')}${card('打印申请', value.printRequests, '一份PDF对应一条收件记录')}</div><div class="split"><section class="panel"><div class="panel-head"><div><h2>新用户趋势</h2><p>按北京时间记录每日新增设备 / 平台用户</p></div><span class="pill">真实数据</span></div>${value.trend.some(d=>d.users>0) ? `<div class="trend">${value.trend.map((d,i) => `<div class="column" title="${d.day}：${d.users}位"><b>${d.users||''}</b><svg width="25" height="125" viewBox="0 0 25 125" aria-hidden="true"><rect x="0" y="${125-Math.max(3,d.users/max*120)}" width="25" height="${Math.max(3,d.users/max*120)}" rx="3" fill="#99b59b"/></svg><small>${i%Math.max(1,Math.ceil(value.trend.length/6))===0||i===value.trend.length-1?d.day.slice(5):''}</small></div>`).join('')}</div>` : '<div class="empty">等待第一位读者到来</div>'}</section><section class="panel"><h2>阅读与邀请</h2><dl class="facts"><div><dt>开始阅读</dt><dd>${value.reads} 次</dd></div><div><dt>分享发起</dt><dd>${value.shares} 次</dd></div><div><dt>邀请新增用户</dt><dd>${value.referredUsers} 位</dd></div><div><dt>受邀用户中已付款</dt><dd>${value.referredPayers} 位</dd></div></dl></section></div><section class="panel"><div class="panel-head"><h2>收支概况</h2><button class="subtle-link" data-go="payments">查看付费记录 →</button></div><div class="cards">${card('付费用户', value.payingUsers, '所选范围付款去重人数')}${card('实付', money(value.paidFen), '按本系统收到核验事件的时间统计')}${card('退款', money(value.refundedFen), '包含部分退款')}${card('收支净额', money(value.netFen), '实付减退款，尚未扣渠道费用')}</div></section>`;
  }
  function row(kind, item) {
    if (kind === 'prints') return `<tr><td><strong>${esc(item.title)}</strong><div class="small">${esc(item.id.slice(0,8))}… · ${(item.bytes / 1048576).toFixed(2)} MB</div></td><td>${short(item.user_id)}</td><td>${date(item.created)}<div class="small">到期 ${date(item.expires)}</div></td><td><select aria-label="${esc(item.title)}处理状态" data-status="${item.id}">${Object.entries(states).map(([key, label]) => `<option value="${key}"${key === item.state ? ' selected' : ''}>${label}</option>`).join('')}</select></td><td><div class="actions">${item.available ? `<a href="/api/admin/prints/${item.id}/file">下载 PDF</a><button class="danger" data-delete="${item.id}">删除文件</button>` : '<span class="muted">文件已清理</span>'}</div></td></tr>`;
    if (kind === 'users') return `<tr><td>${short(item.id)}</td><td><span class="pill">${sourceLabel(item.source)}</span></td><td>${date(item.created)}<div class="small">最近活跃 ${date(item.seen)}</div></td><td>${item.prints} 份 / ${item.paidOrders} 笔</td><td>${item.inviter ? short(item.inviter) : '自然进入'}</td></tr>`;
    if (kind === 'payments') return `<tr><td>${esc(item.order_id)}<div class="small">${esc(item.transaction_id)}</div></td><td>${short(item.user_id)}</td><td><span class="pill">${item.kind === 'paid' ? '已付款' : '已退款'}</span></td><td>${item.kind === 'refund' ? '−' : ''}${money(item.amount)}</td><td>${date(item.created)}</td></tr>`;
    return `<tr><td>${short(item.inviter)}</td><td>${short(item.id)}</td><td>${sourceLabel(item.source)}</td><td>${date(item.created)}</td><td>${item.paidOrders ? '<span class="pill">已转化</span>' : '尚未付款'}</td></tr>`;
  }
  function list(kind, data) {
    const headings = { prints: ['绘本 / 收件编号', '提交用户', '提交 / 保存期限', '处理状态', '文件'], users: ['用户编号', '识别方式', '加入时间', '打印 / 付款', '邀请人'], payments: ['订单 / 支付流水', '用户', '类型', '金额', '核验入账时间'], referrals: ['邀请人', '新用户', '来源', '加入时间', '付费转化'] };
    const hints = { prints: `个性化PDF保存 ${config.retentionDays} 天；删除文件保留收件记录。提交打印不代表已付款或已安排印厂。`, users: '浏览器按设备识别；清除站点数据或更换设备会计为新用户。列表日期按加入时间筛选。', payments: '支付对接尚需商户系统：先完成渠道验签、核对订单金额，再以服务端密钥推送事件。此后台不发起扣款。', referrals: '仅新用户首次进入时绑定邀请人；分享发起不代表分享成功，不自动发放奖励。转化表示这些新用户截至当前有已核验付款。' };
    const summary=data.summary;const metrics=summary?`<div class="cards">${card('分享发起',summary.shares,'分享返回不代表对方打开')}${card('受邀新用户',summary.referredUsers,'首次进入绑定邀请人')}${card('受邀付费用户',summary.referredPayers,'这些新用户截至当前曾付款')}${card('邀请付费转化',summary.referredUsers?(summary.referredPayers/summary.referredUsers*100).toFixed(1)+'%':'—','曾付款受邀用户 / 受邀新用户')}</div>`:'';
    return metrics+`<section class="panel"><div class="panel-head"><div><h2>${labels[kind][0]}</h2><p>共 ${data.total} 条符合筛选条件的记录</p></div><form id="filter-form" class="filter"><input id="query" aria-label="搜索" placeholder="搜索用户、绘本或订单编号" value="${esc(query)}">${kind === 'prints' ? `<select id="state" aria-label="处理状态筛选"><option value="">全部状态</option>${Object.entries(states).map(([k, v]) => `<option value="${k}"${filterState === k ? ' selected' : ''}>${v}</option>`).join('')}</select>` : ''}<button>查询</button></form></div>${table(headings[kind], data.rows.map(item => row(kind, item)))}<div class="pager"><span>第 ${page} / ${Math.max(1, Math.ceil(data.total / 25))} 页</span><button class="secondary" data-page="${page - 1}"${page <= 1 ? ' disabled' : ''}>上一页</button><button class="secondary" data-page="${page + 1}"${page * 25 >= data.total ? ' disabled' : ''}>下一页</button></div></section><p class="tips">${hints[kind]}</p>`;
  }
  async function load() {
    const current = ++revision, kind = tab;
    $('#page-title').textContent = labels[kind][0]; $('#subtitle').textContent = labels[kind][1];
    document.querySelectorAll('[data-tab]').forEach(n => n.classList.toggle('selected', n.dataset.tab === kind));
    $('#content').innerHTML = '<div class="panel empty">正在加载运营数据…</div>';
    try {
      if(kind==='orders'&&orderId){const order=await api('/api/admin/print-orders/'+orderId);if(current===revision)$('#content').innerHTML=ordersUI.detail(order);return;}
      if(kind==='billing'&&billingId){const data=await api('/api/admin/billing/'+billingId);if(current===revision)$('#content').innerHTML=billingUI.detail(data);return;}
      if(kind==='users'&&userId){const data=await api('/api/admin/users/'+userId+'?'+new URLSearchParams({section:userSection,page:userPage}));if(current===revision)$('#content').innerHTML=usersUI.detail(data);return;}
      const params=new URLSearchParams({days:$('#days').value,q:query,page,state:filterState,action:filterState});
      const [data,summary]=await Promise.all([api(`/api/admin/${kind==='orders'?'print-orders':kind}?`+params),kind==='referrals'?api('/api/admin/overview?days='+$('#days').value):Promise.resolve(null)]);if(summary)data.summary=summary;
      if (current !== revision) return;
      $('#content').innerHTML = kind === 'overview' ? overview(data) : kind==='system'?systemUI.overview(data):kind==='audit'?systemUI.audit(data,{query,action:filterState,page}):kind==='products'?billingUI.products(data):kind==='billing'?billingUI.list(data,{query,page}):kind==='orders'?ordersUI.list(data,{query,state:filterState,days:$('#days').value,page}):list(kind, data);
      if (kind === 'overview') $('#print-count').textContent = data.printRequests || '';
    } catch (error) { if (current === revision) $('#content').innerHTML = '<div class="panel empty">加载失败，请点击刷新重试。</div>'; message(error.message); }
  }
  async function enter() {
    config = await api('/api/admin/config'); $('#login').hidden = true; $('#workspace').hidden = false;
    $('#connection').textContent = `打印文件仅管理员可下载，保存 ${config.retentionDays} 天。${config.wechatConnected ? '微信登录已配置。' : '微信登录未配置。'}${config.douyinConnected?'抖音登录已配置。':'抖音登录未配置。'}${config.paymentConnected ? '支付事件接口已配置；需商户服务完成核验后推送。' : '支付尚未接通，收入与付费记录仅在接入真实核验后产生。'}`;
    await load();
  }
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true;
    try { const value = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#password').value }) }); csrf = value.csrf; $('#password').value = ''; await enter(); }
    catch (error) { message(error.message); } finally { button.disabled = false; }
  });
  $('#logout').addEventListener('click', async () => { try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); showLogin(); } catch (error) { message(error.message); } });
  $('#days').addEventListener('change', () => { page = 1; void load(); }); $('#refresh').addEventListener('click', () => void load());
  document.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.tab || button.dataset.go) { tab = button.dataset.tab || button.dataset.go;orderId=null;billingId=null;userId=null; page = 1; query = ''; filterState = ''; void load(); }
    if (button.dataset.page) { page = Number(button.dataset.page); void load(); }
    if (button.dataset.delete && confirm('立即删除这份个性化PDF？收件记录仍保留，文件无法恢复。')) {
      try { button.disabled = true; await api('/api/admin/prints/' + button.dataset.delete, { method: 'DELETE' }); message('文件已删除'); await load(); } catch (error) { message(error.message); button.disabled = false; }
    }
  });
  document.addEventListener('submit', event => { if (event.target.id === 'filter-form') { event.preventDefault(); query = $('#query').value; filterState = $('#state')?.value || ''; page = 1; void load(); } });
  document.addEventListener('change', async event => {
    if (!event.target.dataset.status) return; const element = event.target; element.disabled = true;
    try { await api('/api/admin/prints/' + element.dataset.status, { method: 'PATCH', body: JSON.stringify({ state: element.value }) }); message('处理状态已更新'); }
    catch (error) { message(error.message); await load(); } finally { element.disabled = false; }
  });
  api('/api/admin/session').then(value => { csrf = value.csrf; return enter(); }).catch(() => showLogin());
})();
