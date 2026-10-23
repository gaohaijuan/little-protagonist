'use strict';
const defaults = require('../config/platforms');
const { createPlatformAuthService } = require('./platform-auth-service');
const { createOperationsService } = require('./operations-service');
function createPlatformSDK(platform, api, settings = defaults[platform]) {
  const options = { ...defaults[platform], ...settings, platform };
  const auth = createPlatformAuthService(platform, api, options);
  const operations = createOperationsService(api, auth, options);
  function setInvite(value) { auth.setInvite(value); operations.setInvite(value); }
  async function prepareOperations(value) { if (value.status === 'authenticated') await operations.prepare(); return value; }
  return {
    platform, auth, operations,
    configured: auth.configured, getSnapshot: auth.getSnapshot,
    async login(options) { const result = await prepareOperations(await auth.login(options)); void operations.track('visit'); return result; },
    async restore() { return prepareOperations(await auth.restore()); },
    logout: auth.logout, setInvite,
    onLaunch(options) { setInvite(options?.query?.invite); return auth.restore().then(prepareOperations); },
    async onShow(options) { if (options?.query?.invite) setInvite(options.query.invite); const result = await auth.restore(); if (result.status === 'authenticated') { await operations.prepare(); void operations.track('visit'); } return result; },
    track: operations.track, submitPdf: operations.submitPdf,createPrintOrder:operations.createPrintOrder,getPrintOrder:operations.getPrintOrder,preparePaymentIntent:operations.preparePaymentIntent,getPaymentIntent:operations.getPaymentIntent,
    onShareAppMessage({ title = '小小主角：一起读自己的故事', imageUrl } = {}) {
      // Called only by the native Page share hook / user share button. Neither
      // platform needs the unrelated H5 JS SDK or an automatic share popup.
      const result = { title, path: operations.sharePath() };
      if (imageUrl) result.imageUrl = imageUrl;
      if (platform === 'douyin' && options.shareTemplateId) result.templateId = options.shareTemplateId;
      return result;
    }
  };
}
module.exports = { createPlatformSDK, createWechatSDK: (wx, settings) => createPlatformSDK('wechat', wx, settings), createDouyinSDK: (tt, settings) => createPlatformSDK('douyin', tt, settings) };
