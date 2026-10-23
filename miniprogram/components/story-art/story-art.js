const { draw } = require('../../lib/story-art');

Component({
  properties: {
    book: { type: String, value: 'intro' },
    page: { type: Number, value: 0 },
    cover: { type: Boolean, value: false },
    framing: { type: String, value: '' },
    avatarPath: { type: String, value: '' }
  },
  observers: {
    'book,page,cover,framing,avatarPath': function () { this.queueDraw(); }
  },
  lifetimes: {
    ready() { this._artReady = true; this._artSequence = 0; this.queueDraw(); },
    detached() {
      this._artReady = false;
      this._artSequence += 1;
      clearTimeout(this._drawTimer);
    }
  },
  pageLifetimes: {
    show() { this.queueDraw(); },
    resize() { this.queueDraw(); }
  },
  methods: {
    queueDraw() {
      if (!this._artReady) return;
      clearTimeout(this._drawTimer);
      this._drawTimer = setTimeout(() => this.renderArt(), 0);
    },
    renderArt() {
      if (!this._artReady) return;
      const sequence = ++this._artSequence;
      this.createSelectorQuery().select('#story-canvas').fields({ node: true, size: true }).exec((results) => {
        if (!this._artReady || sequence !== this._artSequence) return;
        const result = results && results[0];
        if (!result || !result.node || !result.width || !result.height) return;
        const canvas = result.node;
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const options = {
          width: result.width, height: result.height, pixelRatio: Math.min(info.pixelRatio || 1, 2),
          book: this.data.book, page: this.data.page, cover: this.data.cover,
          framing: this.data.framing, avatar: null
        };
        draw(canvas, options);
        if (!this.data.avatarPath) return;
        const path = this.data.avatarPath;
        const avatar = canvas.createImage();
        avatar.onload = () => {
          if (!this._artReady || sequence !== this._artSequence || path !== this.data.avatarPath) return;
          draw(canvas, Object.assign({}, options, { avatar }));
        };
        avatar.onerror = () => {
          if (this._artReady && sequence === this._artSequence) {
            this.triggerEvent('avatarerror', { message: '头像读取失败，请重新选择照片。' });
          }
        };
        avatar.src = path;
      });
    }
  }
});
