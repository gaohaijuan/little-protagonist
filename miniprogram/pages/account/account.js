const { getAuthService } = require('../../services/auth-service');
const { createProfileStore, getPendingProfileCleanups, cleanupDeletedProfiles } = require('../../services/profile-store');
const { listBooks } = require('../../lib/stories');
const { prepareGuestImport } = require('../../services/guest-import');
const { createBackupService } = require('../../services/account-backup');
Page({
  data: { auth: { status: 'guest', user: null }, accountNumber: '', busy: false, error: '', notice: '',
    hasChild: false, childProfile: null, childError: '', childAvatarError: false, hasGuest: false, guestError: '', editingNickname: false, nicknameDraft: '', dangerAction: '', dangerInput: '', cleanupPending: false,
    readingRecords: [], readingCount: 0, completedCount: 0, readingError: '', backupMode: '', backupSummary: null, backupWord: '', backupPartial: false },
  onLoad() { this._alive = true; this._auth = getAuthService(wx); },
  onShow() {
    this._visible = true;
    this.refresh();
    if (!this._unsubscribe) this._unsubscribe = this._auth.subscribe(() => this.refresh());
  },
  onHide() { this._visible = false; if (this._unsubscribe) this._unsubscribe(); this._unsubscribe = null; },
  onUnload() { this._alive = false; this.onHide(); },
  refresh() {
    const auth = this._auth.getSnapshot();
    const identity = auth.user ? auth.user.id + ':' + (auth.user.accountVersion || 'legacy') : 'guest';
    if (this._identity !== identity) this._backupRestore = null;
    let hasChild = false, childProfile = null, childError = '', hasGuest = false, guestError = '';
    try {
      const store = getApp().getProfileStore(); hasChild = store.hasProfile();
      if (hasChild) childProfile = store.loadProfile({ strict: true });
    } catch (_) { childProfile = null; childError = '本机孩子资料暂时无法读取，请重试。'; }
    try { hasGuest = !!auth.user && createProfileStore(wx).hasProfile(); }
    catch (_) { guestError = '游客资料暂时无法读取，请重试。'; }
    let cleanupPending = !!this._pendingRemoval;
    try { cleanupPending = cleanupPending || getPendingProfileCleanups(wx).length > 0; } catch (_) {}
    const childAvatarError = this._identity === identity && this.data.childProfile?.avatarPath === childProfile?.avatarPath && this.data.childAvatarError;
    this.setData({ auth, hasChild, childProfile, childError, childAvatarError: !!childAvatarError, hasGuest, guestError, cleanupPending, accountNumber: auth.user ? auth.user.id.slice(-8).toUpperCase() : '',
      ...(this._identity !== identity ? { editingNickname: false, dangerAction: '', dangerInput: '', backupMode: '', backupSummary: null, backupWord: '', backupPartial: false } : {}) });
    this._identity = identity;
    this.refreshReading();
  },
  childAvatarFailed(event) {
    if (this._visible && event.currentTarget.dataset.path === this.data.childProfile?.avatarPath) this.setData({ childAvatarError: true });
  },
  backupService() {
    const identity = this._identity;
    return createBackupService(wx,getApp(),()=>{
      const current=this._auth.getSnapshot(),user=current.user,next=user?user.id+':'+(user.accountVersion||'legacy'):'guest';
      return this._alive && this._visible && next === identity && !['loading','closing'].includes(current.status);
    });
  },
  openBackup(event) {
    if (this.data.busy || ['loading','closing'].includes(this.data.auth.status)) return;
    this._backupRestore = null;
    this.setData({backupMode:event.currentTarget.dataset.action==='export'?'export':'choose',backupSummary:null,backupWord:'',backupPartial:false,editingNickname:false,dangerAction:'',error:'',notice:''});
  },
  cancelBackup() { if(!this.data.busy){this._backupRestore=null;this.setData({backupMode:'',backupSummary:null,backupWord:'',error:''});} },
  changeBackupWord(event) { this.setData({backupWord:event.detail.value}); },
  async exportBackup() {
    if(this.data.busy||this.data.backupMode!=='export')return;
    this.setData({busy:true,error:'',notice:''});
    try {await this.backupService().exportFile();if(this._alive)this.setData({backupMode:'',notice:'已完成备份文件导出。请妥善保管含孩子资料与照片的文件。'});}
    catch(error){if(this._alive)this.setData({error:/cancel/i.test(error.errMsg||error.message||'')?'已取消导出，本机资料未改变。':error.message||'备份导出失败，请重试。'});}
    finally{if(this._alive)this.setData({busy:false});}
  },
  async chooseBackup() {
    if(this.data.busy)return;this.setData({busy:true,error:'',notice:''});
    try {const plan=await this.backupService().chooseFile();if(this._alive){this._backupRestore=plan;this.setData({backupMode:'restore',backupSummary:plan.summary,backupWord:'',backupPartial:false});}}
    catch(error){if(this._alive)this.setData({error:/cancel/i.test(error.errMsg||error.message||'')?'已取消选择，本机资料未改变。':error.message||'备份读取失败，请选择有效文件。'});}
    finally{if(this._alive)this.setData({busy:false});}
  },
  async restoreBackup() {
    if(this.data.busy||!this._backupRestore)return;
    if(this.data.backupWord!=='恢复'){this.setData({error:'请输入“恢复”确认替换本机资料。'});return;}
    this.setData({busy:true,error:'',notice:''});
    try {const result=await this._backupRestore.commit();if(this._alive){this.refresh();this.setData(result.complete?
      {backupMode:'',backupSummary:null,backupWord:'',backupPartial:false,notice:'孩子资料和阅读记录已恢复到当前本机空间。家长账号保持不变。'}:
      {backupPartial:true,notice:result.message});if(result.complete)this._backupRestore=null;}}
    catch(error){if(this._alive)this.setData({error:error.message||'恢复未完成，请重试。'});}
    finally{if(this._alive)this.setData({busy:false});}
  },
  refreshReading() {
    try {
      const app = getApp(), catalog = listBooks(app.getProfileStore().loadProfile());
      const readingRecords = app.getReadingStore().list().map(record => {
        const book = catalog.find(item => item.id === record.bookId);
        return book ? { ...record, title: book.title, progress: '读到第 ' + (Math.min(record.pageIndex, book.pages.length - 1) + 1) + ' / ' + book.pages.length + ' 页' } : null;
      }).filter(Boolean);
      this.setData({ readingRecords, readingCount: readingRecords.length, completedCount: readingRecords.filter(record => record.completed).length, readingError: '' });
    } catch (_) { this.setData({ readingRecords: [], readingCount: 0, completedCount: 0, readingError: '本机阅读记录暂时无法读取，请稍后重试。' }); }
  },
  continueReading(event) {
    if (this.data.busy || ['loading', 'closing'].includes(this.data.auth.status)) return;
    const id = event.currentTarget.dataset.book;
    if (!this.data.readingRecords.some(record => record.bookId === id)) return;
    wx.navigateTo({ url: '/pages/reader/reader?book=' + encodeURIComponent(id) });
  },
  editNickname() {
    if (this.data.busy || !this.data.auth.user) return;
    this.setData({ editingNickname: true, nicknameDraft: this.data.auth.user.nickname || '', error: '', notice: '', dangerAction: '' });
  },
  changeNickname(event) { this.setData({ nicknameDraft: event.detail.value, error: '' }); },
  cancelNickname() { if (!this.data.busy) this.setData({ editingNickname: false, error: '' }); },
  async saveNickname() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '', notice: '' });
    try { await this._auth.updateAccountProfile(this.data.nicknameDraft); if (this._alive) this.setData({ editingNickname: false, notice: '家长称呼已保存。' }); }
    catch (error) { if (this._alive) this.setData({ error: error.message }); }
    finally { if (this._alive) this.setData({ busy: false }); }
  },
  async finishOnboarding() {
    if (this.data.busy) return;
    if (!this.data.hasChild) { this.editProfile(); return; }
    this.setData({ busy: true, error: '' });
    try { await this._auth.completeOnboarding(); if (this._alive) this.goHome(); }
    catch (error) { if (this._alive) this.setData({ error: error.message }); }
    finally { if (this._alive) this.setData({ busy: false }); }
  },
  requestDanger(event) {
    if (this.data.busy) return;
    const action = event.currentTarget.dataset.action;
    if (action !== 'delete-child' && action !== 'close-account') return;
    if (action === 'close-account' && !this.data.auth.user) return;
    this._dangerIdentity = this._identity;
    this.setData({ dangerAction: action, dangerInput: '', editingNickname: false, error: '', notice: '' });
  },
  changeDangerInput(event) { this.setData({ dangerInput: event.detail.value }); },
  cancelDanger() { if (!this.data.busy) this.setData({ dangerAction: '', dangerInput: '', error: '' }); },
  async confirmDanger() {
    if (this.data.busy || !this.data.dangerAction) return;
    const closing = this.data.dangerAction === 'close-account';
    if (this.data.dangerInput !== (closing ? '注销' : '删除')) { this.setData({ error: '请输入“' + (closing ? '注销' : '删除') + '”确认操作。' }); return; }
    if (this._dangerIdentity !== this._identity) { this.setData({ error: '账号已切换，请重新确认删除范围。', dangerAction: '' }); return; }
    this.setData({ busy: true, error: '', notice: '' });
    let closed = false;
    try {
      const store = getApp().getProfileStore();
      this._pendingRemoval = store.prepareDeletion();
      if (closing) { await this._auth.closeAccount({ confirmation: '注销' }); closed = true; }
      await this._pendingRemoval(); this._pendingRemoval = null;
      if (this._alive) { this.refresh(); this.setData({ dangerAction: '', dangerInput: '', cleanupPending: false,
        notice: closing ? '阅读账号已注销，本机该账号的孩子资料已清除。' : '当前本机孩子资料已清除，可以重新设置小主角。' }); }
    } catch (error) {
      if (!closed && closing) this._pendingRemoval = null;
      if (this._alive) this.setData({ error: (closed ? '阅读账号已注销；本机资料清理尚未完成。' : '') + error.message, cleanupPending: !!this._pendingRemoval });
    } finally { if (this._alive) this.setData({ busy: false }); }
  },
  async retryCleanup() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try { if (this._pendingRemoval) await this._pendingRemoval(); else await cleanupDeletedProfiles(wx); this._pendingRemoval = null; if (this._alive) { this.refresh(); this.setData({ dangerAction: '', notice: '本机资料已清理完成。' }); } }
    catch (error) { if (this._alive) this.setData({ error: error.message }); }
    finally { if (this._alive) this.setData({ busy: false }); }
  },
  login() { wx.navigateTo({ url: '/pages/login/login' }); },
  editProfile() {
    if (this.data.busy || ['loading','closing'].includes(this._auth.getSnapshot().status)) return;
    wx.navigateTo({ url: '/pages/profile/profile' });
  },
  goHome() { wx.reLaunch({ url: '/pages/home/home' }); },
  openLegal(event) { wx.navigateTo({ url: '/pages/legal/legal?type=' + event.currentTarget.dataset.type }); },
  async retry() { await this._auth.restore(); },
  async logout() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '', notice: '' });
    try {
      const result = await this._auth.logout();
      if (this._alive) this.setData({ notice: result.revoked ? '已退出登录，本机孩子资料仍保留。' : '本机已退出。暂未确认云端会话撤销，旧会话最迟在到期后失效。' });
    } catch (error) { if (this._alive) this.setData({ error: error.message }); }
    finally { if (this._alive) this.setData({ busy: false }); }
  },
  async importGuest() {
    const current = this._auth.getSnapshot();
    if (this.data.busy || current.status !== 'authenticated' || !current.user) return;
    const identity = current.user.id + ':' + (current.user.accountVersion || 'legacy');
    this.setData({ busy: true, error: '', notice: '' });
    try {
      const transfer = prepareGuestImport(wx, getApp().getProfileStore(), { isCurrent: () => {
        const next = this._auth.getSnapshot();
        return this._alive && this._visible && next.status === 'authenticated' && next.user && next.user.id + ':' + (next.user.accountVersion || 'legacy') === identity;
      } });
      const guest = transfer.source;
      const choice = await new Promise((resolve, reject) => wx.showModal({ title: '导入本机游客资料',
        content: '将游客小主角“' + guest.name + '”（' + guest.age + '岁 · ' + guest.className + '）及' + (guest.avatarPath ? '已保存的头像' : '默认卡通形象') +
          '复制到当前账号。' + (transfer.target ? '会替换当前“' + transfer.target.name + '”的孩子资料与头像。' : '当前账号尚未保存孩子资料。') +
          '游客原资料不变，照片不会上传；本账号阅读记录保留，不复制游客阅读记录。',
        confirmText: transfer.target ? '确认替换' : '导入资料', success: resolve, fail: reject }));
      if (!choice.confirm || !this._alive) return;
      await transfer.commit();
      if (this._alive) { this.refresh(); this.setData({ notice: '游客小主角已复制到本账号。游客原资料和本账号阅读记录均保留。' }); }
    } catch (error) { if (this._alive) this.setData({ error: error.message || '导入未完成，请重试。' }); }
    finally { if (this._alive) this.setData({ busy: false }); }
  }
});
