const { createProfileStore } = require('../../services/profile-store');
const { getBook } = require('../../lib/stories');
const { createReadingStore } = require('../../services/reading-store');

Page({
  data: { profile: {}, book: null, pageIndex: 0, lines: [], pageNumbers: [], isLandscape: false, finished: false, readingNotice: '' },
  onLoad(options) { this._bookId = options.book || 'intro'; },
  onShow() {
    if(typeof getApp==='function'&&getApp().operations)void getApp().operations.track('read',this._bookId);
    this.refreshReader();
    if (typeof getApp === 'function' && !this._unsubscribe) this._unsubscribe = getApp().auth.subscribe(() => this.refreshReader());
  },
  onHide() { if (this._unsubscribe) this._unsubscribe(); this._unsubscribe = null; },
  onUnload() { this.onHide(); },
  refreshReader() {
    if (typeof getApp === 'function') {
      const user = getApp().auth.getSnapshot().user;
      const ownerId = user ? user.id + ':' + (user.accountVersion || 'legacy') : '';
      if (this._ownerId !== undefined && this._ownerId !== ownerId) { this._recordLoaded = false; this.setData({ pageIndex: 0, finished: false }); }
      this._ownerId = ownerId;
    }
    const profile = (typeof getApp === 'function' ? getApp().getProfileStore() : createProfileStore(wx)).loadProfile();
    const book = getBook(this._bookId, profile);
    if (!book) {
      wx.showToast({ title: '这本书还没准备好', icon: 'none' });
      this.goHome();
      return;
    }
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this._readingStore = typeof getApp === 'function' ? getApp().getReadingStore() : createReadingStore(wx);
    let restoredPage = this.data.pageIndex;
    if (!this._recordLoaded) {
      try { const record = this._readingStore.get(book.id); if (record && !record.finished) restoredPage = record.pageIndex; }
      catch (_) { this.setData({ readingNotice: '本机阅读记录暂时无法读取，仍可继续读故事。' }); }
      this._recordLoaded = true;
    }
    const pageIndex = Math.min(restoredPage, book.pages.length - 1);
    this.setData({ profile, book, pageIndex, lines: book.pages[pageIndex], pageNumbers: book.pages.map((page, index) => index), isLandscape: info.windowWidth > info.windowHeight });
    wx.setNavigationBarTitle({ title: book.title });
    if (!this.data.finished) this.saveReading();
  },
  onResize(event) {
    const size = event.size;
    if (size) this.setData({ isLandscape: size.windowWidth > size.windowHeight });
  },
  previousPage() {
    if (this.data.pageIndex <= 0 || this.data.finished) return;
    this.showPage(this.data.pageIndex - 1);
  },
  nextPage() {
    if (!this.data.book || this.data.finished) return;
    if (this.data.pageIndex >= this.data.book.pages.length - 1) {
      this.setData({ finished: true });
      this.saveReading(true);
      return;
    }
    this.showPage(this.data.pageIndex + 1);
  },
  saveReading(completed = false) {
    if (!this._readingStore || !this.data.book) return;
    try { this._readingStore.record(this.data.book.id, this.data.pageIndex, this.data.book.pages.length, completed); this.setData({ readingNotice: '' }); }
    catch (_) { this.setData({ readingNotice: '本次阅读进度暂未保存，可以继续阅读；翻页时会重试。' }); }
  },
  showPage(index) {
    if (!this.data.book || !Number.isInteger(index) || index < 0 || index >= this.data.book.pages.length) return;
    this.setData({ pageIndex: index, lines: this.data.book.pages[index] }); this.saveReading();
  },
  readAgain() { this.setData({ pageIndex: 0, lines: this.data.book.pages[0], finished: false }); this.saveReading(); },
  goHome() { wx.reLaunch({ url: '/pages/home/home' }); },
  touchStart(event) {
    const touch = event.changedTouches[0];
    this._touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
  },
  touchEnd(event) {
    const end = event.changedTouches[0];
    const start = this._touchStart;
    this._touchStart = null;
    if (!start || !end) return;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) this.nextPage(); else this.previousPage();
    }
  }
});
