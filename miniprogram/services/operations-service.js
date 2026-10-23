'use strict';
const defaultSettings = require('../config/operations');
function createOperationsService(wxApi, auth, settings = defaultSettings) {
  let session = null, pending = null, generation = 0, invite = '';
  const configured = () => /^https:\/\/[^/]+\/?$/.test(settings.baseUrl || '');
  const origin = () => settings.baseUrl.replace(/\/$/, '');
  function request(route, data, header = {},method='POST') {
    return new Promise((resolve, reject) => wxApi.request({ url: origin() + route, method, data, timeout: settings.timeoutMs || 15000, header: { 'Content-Type': 'application/json', ...header }, success: response => response.statusCode >= 200 && response.statusCode < 300 ? resolve(response.data) : reject(Error(response.data && response.data.error || '运营服务暂时不可用')), fail: () => reject(Error('无法连接运营服务')) }));
  }
  function reset() {
    const old=session;generation++;session=null;pending=null;
    if(old&&configured()&&!auth.getOperationsSession)void request('/api/session/logout',{}, {Authorization:'Bearer '+old.token}).catch(()=>{});
  }
  auth.subscribe(value => { if (value.status !== 'authenticated' || (session && session.userId !== value.user.id)) reset(); });
  function prepare() {
    if (!configured() || !auth.getSnapshot().user) return Promise.reject(Error('运营服务未配置或尚未登录'));
    if (session && session.expiresAt > Date.now()) return Promise.resolve(session);
    if (!pending) {
      const revision = generation;
      const task = Promise.resolve().then(()=>auth.getOperationsSession?auth.getOperationsSession():auth.callWithSession('account', { action: 'operations-session', invite })).then(result => {
        if (revision !== generation) {if(result&&result.token&&!auth.getOperationsSession)void request('/api/session/logout',{}, {Authorization:'Bearer '+result.token}).catch(()=>{});throw Error('账号已切换');}
        if (!result || (!auth.getOperationsSession&&!result.ok) || !result.token || result.userId !== auth.getSnapshot().user?.id) throw Error('运营会话无效');
        session = result; return result;
      }).finally(() => { if (pending === task) pending = null; });
      pending = task;
    }
    return pending;
  }
  const eventId = () => (settings.platform==='douyin'?'tt-':'wx-') + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  async function track(kind, book = '') {
    if (!configured()) return false;
    const revision=generation;
    try { const value = await prepare();if(revision!==generation)return false;await request('/api/events', { id: eventId(), kind, book }, { Authorization: 'Bearer ' + value.token }); return revision===generation; }
    catch (_) { return false; }
  }
  async function submitPdf({ filePath, bookId, title, requestKey, consent = false }) {
    if (!consent) throw Error('须先确认将个性化PDF发送给运营方及保存期限');
    if (!requestKey || !/^[a-zA-Z0-9-]{16,100}$/.test(requestKey)) throw Error('打印请求编号无效');
    const revision = generation, value = await prepare();
    const data = await new Promise((resolve, reject) => wxApi.getFileSystemManager().readFile({ filePath, success: result => resolve(result.data), fail: reject }));
    if (generation !== revision) throw Error('账号已切换，请重新提交');
    const result=await request('/api/prints?book=' + encodeURIComponent(bookId) + '&title=' + encodeURIComponent(title), data, { Authorization: 'Bearer ' + value.token, 'Content-Type': 'application/pdf', 'Idempotency-Key': requestKey, 'X-Print-Consent': 'operator-file-v1' });
    if(generation!==revision)throw Error('账号已切换，已提交结果请在原账号下查看');return result;
  }
  async function createPrintOrder({consent=false,...input}){
    if(!consent)throw Error('须先确认订单联系信息的用途与保存期限');const revision=generation,value=await prepare();if(revision!==generation)throw Error('账号已切换');
    const result=await request('/api/print-orders',{...input,consentVersion:'print-order-v1'},{Authorization:'Bearer '+value.token});if(revision!==generation)throw Error('账号已切换，请在原账号下查看订单');return result;
  }
  async function getPrintOrder(id){const revision=generation,value=await prepare();if(revision!==generation)throw Error('账号已切换');const result=await request('/api/print-orders'+(id?'/'+encodeURIComponent(id):''),undefined,{Authorization:'Bearer '+value.token},'GET');if(revision!==generation)throw Error('账号已切换，不能显示原账号的订单');return result;}
  async function paymentRequest(route,input,method){const revision=generation,value=await prepare();if(revision!==generation)throw Error('账号已切换');const result=await request(route,input,{Authorization:'Bearer '+value.token},method);if(revision!==generation)throw Error('账号已切换，不能显示原账号付款单');return result;}
  const preparePaymentIntent=(orderId,input)=>paymentRequest('/api/print-orders/'+encodeURIComponent(orderId)+'/payment-intents',input,'POST');
  const getPaymentIntent=id=>paymentRequest('/api/payment-intents/'+encodeURIComponent(id),undefined,'GET');
  return { configured, prepare, track, submitPdf,createPrintOrder,getPrintOrder,preparePaymentIntent,getPaymentIntent, reset, setInvite(value) { invite = typeof value === 'string' ? value.slice(0, 50) : ''; }, sharePath() { void track('share'); return '/pages/home/home' + (session ? '?invite=' + encodeURIComponent(session.inviteCode) : ''); } };
}
module.exports = { createOperationsService };
