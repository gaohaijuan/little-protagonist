const { policies, POLICY_VERSION } = require('../../lib/account-policy');
Page({
  data: { title: '', version: POLICY_VERSION, paragraphs: [] },
  onLoad(options) {
    const policy = options.type === 'terms' ? policies.terms : policies.privacy;
    this.setData(policy);
    wx.setNavigationBarTitle({ title: policy.title });
  }
});
