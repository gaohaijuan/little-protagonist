const { validateProfile } = require('../../lib/profile');
const { getCropRect } = require('../../lib/crop');
const { createProfileStore } = require('../../services/profile-store');

const clamp = value => Math.max(0, Math.min(100, value));
const EXPORT_WIDTH = 540, EXPORT_HEIGHT = 570;
Page({
  data: {
    name: '', ageOptions: [3, 4, 5, 6], ageIndex: 2,
    classOptions: ['小班', '中班', '大班'], classIndex: 2,
    draftAvatarPath: '', editingPhoto: false, photoReady: false,
    zoomPercent: 100, panX: 50, panY: 50,
    saving: false, applyingPhoto: false, error: ''
  },
  onLoad() {
    this._store = typeof getApp === 'function' ? getApp().getProfileStore() : createProfileStore(wx);
    this._ownerSignature = this.ownerSignature();
    this._alive = true;
    this._photoRevision = 0;
    this._profile = this._store.loadProfile();
    this.setData({ name: this._profile.name, ageIndex: this._profile.age - 3,
      classIndex: this.data.classOptions.indexOf(this._profile.className), draftAvatarPath: this._profile.avatarPath });
  },
  ownerSignature() {
    const user = typeof getApp === 'function' ? getApp().auth.getSnapshot().user : null;
    return user ? user.id + ':' + (user.accountVersion || 'legacy') : 'guest';
  },
  onShow() {
    this.checkAccount();
    if (typeof getApp === 'function' && !this._unsubscribeAccount && this._alive) this._unsubscribeAccount = getApp().auth.subscribe(() => this.checkAccount());
  },
  onHide() { if (this._unsubscribeAccount) this._unsubscribeAccount(); this._unsubscribeAccount = null; },
  checkAccount() {
    if (this._invalidating || typeof getApp !== 'function') return;
    const status = getApp().auth.getSnapshot().status;
    if (this.ownerSignature() === this._ownerSignature && status !== 'loading' && status !== 'closing') return;
    this._invalidating = true; this._alive = false; this._photoRevision++;
    wx.showToast({ title: '账号状态已变化，请重新打开小主角', icon: 'none' });
    wx.navigateBack({ delta: 1, fail: () => wx.reLaunch({ url: '/pages/home/home' }) });
  },
  onUnload() { this._alive = false; this._photoRevision += 1; this.onHide(); },
  onName(event) { this.setData({name: event.detail.value, error: ''}); },
  onAge(event) { this.setData({ageIndex: Number(event.detail.value)}); },
  onClass(event) { this.setData({classIndex: Number(event.detail.value)}); },
  async choosePhoto() {
    if (this.data.saving || this._choosing) return;
    this._choosing = true;
    try {
      const result = await new Promise((resolve, reject) => wx.chooseMedia({ count: 1,
        mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'], success: resolve, fail: reject }));
      if (!this._alive) return;
      const file = result.tempFiles && result.tempFiles[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) throw new Error('照片有点大，请选择 8 MB 以内的照片。');
      this._photoRevision += 1;
      this.setData({editingPhoto: true, photoReady: false, zoomPercent: 100, panX: 50, panY: 50, error: ''},
        () => this.loadCropPhoto(file.tempFilePath, this._photoRevision));
    } catch (error) {
      if (this._alive && !/cancel/i.test(error.errMsg || '')) this.setData({error: error.message || '没能打开照片，请检查相册权限后重试。'});
    } finally { this._choosing = false; }
  },
  getCanvas(selector) {
    return new Promise((resolve, reject) => {
      this.createSelectorQuery().select(selector).fields({node: true, size: true}).exec(result => {
        const item = result && result[0];
        if (item && item.node) resolve(item); else reject(new Error('画面还没准备好，请重新选择照片。'));
      });
    });
  },
  async loadCropPhoto(path, revision) {
    try {
      const box = await this.getCanvas('#crop-canvas');
      const photo = box.node.createImage();
      await new Promise((resolve, reject) => {photo.onload = resolve; photo.onerror = () => reject(new Error('这张照片无法打开，请换一张。')); photo.src = path;});
      if (!this._alive || revision !== this._photoRevision) return;
      this._cropCanvas = box.node; this._cropBox = box; this._photo = photo;
      this.setData({photoReady: true}); this.drawCrop();
    } catch (error) { if (this._alive && revision === this._photoRevision) this.setData({error: error.message, photoReady: false}); }
  },
  cropRect() { return getCropRect(this._photo.width, this._photo.height, {zoom: this.data.zoomPercent / 100, x: this.data.panX, y: this.data.panY}); },
  drawCrop() {
    if (!this._photo || !this._cropCanvas || !this.data.photoReady) return;
    const canvas = this._cropCanvas, box = this._cropBox;
    const ratio = Math.min(wx.getWindowInfo().pixelRatio || 1, 3);
    canvas.width = Math.round(box.width * ratio); canvas.height = Math.round(box.height * ratio);
    const ctx = canvas.getContext('2d'), r = this.cropRect();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this._photo, r.x, r.y, r.width, r.height, 0, 0, canvas.width, canvas.height);
  },
  changeZoom(e) {this.setData({zoomPercent: Number(e.detail.value)}); this.drawCrop();},
  changeX(e) {this.setData({panX: Number(e.detail.value)}); this.drawCrop();},
  changeY(e) {this.setData({panY: Number(e.detail.value)}); this.drawCrop();},
  startDrag(e) {
    if (!this.data.photoReady || !e.touches[0]) return;
    this._drag = {x: e.touches[0].clientX, y: e.touches[0].clientY, panX: this.data.panX, panY: this.data.panY, rect: this.cropRect()};
  },
  moveDrag(e) {
    if (!this._drag || !e.touches[0]) return;
    const p = e.touches[0], start = this._drag, r = start.rect;
    const movableX = this._photo.width - r.width, movableY = this._photo.height - r.height;
    this.setData({panX: movableX > 0 ? clamp(start.panX - (p.clientX - start.x) * r.width / this._cropBox.width / movableX * 100) : 50,
      panY: movableY > 0 ? clamp(start.panY - (p.clientY - start.y) * r.height / this._cropBox.height / movableY * 100) : 50});
    this.drawCrop();
  },
  endDrag() {this._drag = null;},
  cancelCrop() { this._photoRevision += 1; this._photo = null; this.setData({editingPhoto: false, photoReady: false, error: ''}); },
  async applyCrop() {
    if (!this.data.photoReady || this.data.applyingPhoto) return;
    this.setData({applyingPhoto: true, error: ''});
    try {
      const {node: canvas} = await this.getCanvas('#export-canvas');
      canvas.width = EXPORT_WIDTH; canvas.height = EXPORT_HEIGHT;
      const ctx = canvas.getContext('2d'), r = this.cropRect();
      ctx.clearRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
      ctx.drawImage(this._photo, r.x, r.y, r.width, r.height, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
      const output = await new Promise((resolve, reject) => wx.canvasToTempFilePath({canvas,
        x: 0, y: 0, width: EXPORT_WIDTH, height: EXPORT_HEIGHT, destWidth: EXPORT_WIDTH, destHeight: EXPORT_HEIGHT, fileType: 'png', success: resolve, fail: reject}, this));
      if (!this._alive) return;
      this._avatarTempPath = output.tempFilePath; this._removeAvatar = false;
      this.setData({draftAvatarPath: output.tempFilePath, editingPhoto: false, photoReady: false});
      this._photo = null;
    } catch (error) {if (this._alive) this.setData({error: error.message || '头像没能生成，请再试一次。'});}
    finally {if (this._alive) this.setData({applyingPhoto: false});}
  },
  removePhoto() {this._avatarTempPath = ''; this._removeAvatar = true; this.setData({draftAvatarPath: '', error: ''});},
  async save() {
    if (this.data.saving) return;
    this.setData({error: ''});
    try {
      const draft = validateProfile({name: this.data.name, age: this.data.ageOptions[this.data.ageIndex],
        className: this.data.classOptions[this.data.classIndex], avatarPath: this._profile.avatarPath});
      this.setData({saving: true});
      this._profile = await this._store.saveProfile(draft, {avatarTempPath: this._avatarTempPath || undefined, removeAvatar: !!this._removeAvatar});
      if (!this._alive) return;
      this._avatarTempPath = ''; this._removeAvatar = false;
      this.setData({name: this._profile.name, draftAvatarPath: this._profile.avatarPath});
      wx.showToast({title: '小主角已保存', icon: 'success'});
      wx.navigateBack({delta: 1, fail: () => wx.reLaunch({url: '/pages/home/home'})});
    } catch (error) {if (this._alive) this.setData({error: error.message || '保存没有成功，请检查本机存储空间后重试。'});}
    finally {if (this._alive) this.setData({saving: false});}
  }
});
