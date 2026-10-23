const { getAuthService } = require('../../services/auth-service');
Page({
  data: { agreed: false, busy: false, configured: false, closedAccount: false, error: '' },
  onLoad() { this._alive = true; this._auth = getAuthService(wx); },
  onShow() {
    this._visible = true;
    const state = this._auth.getSnapshot();
    if (state.status === 'authenticated') { this.returnToAccount(); return; }
    this.setData({ configured: state.configured, busy: state.status === 'loading' });
    if (!this._unsubscribe) this._unsubscribe = this._auth.subscribe(next => this.setData({ busy: next.status === 'loading' }));
  },
  onHide() { this._visible = false; if (this._unsubscribe) this._unsubscribe(); this._unsubscribe = null; },
  onUnload() { this._alive = false; this.onHide(); },
  onConsent(event) { this.setData({ agreed: event.detail.value.includes('agree'), error: '' }); },
  openLegal(event) { wx.navigateTo({ url: '/pages/legal/legal?type=' + event.currentTarget.dataset.type }); },
  async login() {
    if (this.data.busy) return;
    if (!this.data.agreed) { this.setData({ error: '请先阅读并同意用户服务说明与隐私说明。' }); return; }
    this.setData({ busy: true, error: '' });
    try {
      await this._auth.login({ consent: this.data.agreed, reRegister: this.data.closedAccount });
      if (this._alive && this._visible) this.returnToAccount();
    } catch (error) { if (this._alive) this.setData({ error: error.message || '登录未成功，请稍后重试。',
      ...(error.code === 'AUTH_ACCOUNT_CLOSED' ? { closedAccount: true, agreed: false } : {}) }); }
    finally { if (this._alive) this.setData({ busy: false }); }
  },
  returnToAccount() { wx.navigateBack({ delta: 1, fail: () => wx.reLaunch({ url: '/pages/account/account' }) }); },
  goHome() { wx.reLaunch({ url: '/pages/home/home' }); }
});
