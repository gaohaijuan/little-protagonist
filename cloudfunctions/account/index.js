'use strict';
const cloud = require('wx-server-sdk');
const { createAccountService } = require('./service');
const { createRepository } = require('./repository');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const account = createAccountService(createRepository(cloud.database()));
exports.main = async event => {
  if(event&&event.action==='operations-session'){
    try{const verified=await account.requireUser(cloud.getWXContext(),event.sessionToken);return await require('./operations-bridge').exchangeOperationsSession(verified.user.id,event.invite);}
    catch(error){return {ok:false,code:error.code||'AUTH_OPERATIONS_UNAVAILABLE',message:'无法连接运营服务，请稍后重试。'};}
  }
  try { return await account.handle(event, cloud.getWXContext()); }
  catch (error) {
    const expected = typeof error.code === 'string' && error.code.startsWith('AUTH_');
    // Never log event, token or the child's profile.
    if (!expected) console.error('Account service unavailable');
    return { ok: false, code: expected ? error.code : 'AUTH_SERVICE_ERROR', message: expected ? error.message : '账号服务暂时不可用，请稍后重试。' };
  }
};
