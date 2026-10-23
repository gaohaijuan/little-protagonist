const { createProfileStore } = require('../../services/profile-store');
const { listBooks } = require('../../lib/stories');

Page({
  data: { profile: { name: '小石头', age: 5, className: '大班', avatarPath: '' }, books: [], accountLabel: '家长登录' },
  onShow() {
    this.refreshProfile();
    if (typeof getApp === 'function' && !this._unsubscribe) this._unsubscribe = getApp().auth.subscribe(() => this.refreshProfile());
  },
  onLoad(options) { if(typeof getApp==='function'&&getApp().operations)getApp().operations.setInvite(options&&options.invite); },
  onShareAppMessage() { const app=typeof getApp==='function'?getApp():null;return {title:'小小主角：一起读自己的故事',path:app&&app.operations?app.operations.sharePath():'/pages/home/home'}; },
  onHide() { if (this._unsubscribe) this._unsubscribe(); this._unsubscribe = null; },
  onUnload() { this.onHide(); },
  refreshProfile() {
    const app = typeof getApp === 'function' ? getApp() : null;
    const profile = (app ? app.getProfileStore() : createProfileStore(wx)).loadProfile();
    this.setData({ profile, books: listBooks(profile), accountLabel: app && app.auth.getSnapshot().user ? '我的账号' : '家长登录' });
  },
  openAccount() { wx.navigateTo({ url: '/pages/account/account' }); },
  editProfile() {
    if (typeof getApp === 'function' && ['loading', 'closing'].includes(getApp().auth.getSnapshot().status)) {
      wx.showToast({ title: '正在恢复账号，请稍候再设置', icon: 'none' }); return;
    }
    wx.navigateTo({ url: '/pages/profile/profile' });
  },
  openBook(event) {
    const book = event.currentTarget.dataset.book || 'intro';
    wx.navigateTo({ url: '/pages/reader/reader?book=' + encodeURIComponent(book) });
  }
});
