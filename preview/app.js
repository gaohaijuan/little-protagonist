(function () {
  'use strict';
  const { draw } = shared.art;
  const { DEFAULT_PROFILE, normalizeProfile, validateProfile } = shared.profile;
  const { listBooks, getBook: readBook } = shared.stories;
  const browserCatalog = Object.freeze({ currentEdition: true });
  const getBook = (id, profile, members) => readBook(id, profile, members, browserCatalog);
  const sequenceBookIds = new Set(['hands', 'rain', 'stone']);
  const hasLegacyArt = () => false;
  const { ROLE_OPTIONS, defaultMembers, normalizeMembers, migrateMembers, participants, memberLabel, canUsePhoto, createSibling, MAX_MEMBERS } = shared.family;
  const root = document.getElementById('little-story-preview');
  const device = root.querySelector('#ls-device');
  const screen = root.querySelector('#ls-screen');
  const modeLabel = root.querySelector('#ls-mode-label');
  const live = root.querySelector('#ls-live');
  const symbols = { 'chevron-left': '‹', 'chevron-right': '›', 'arrow-right': '→', 'rotate-cw': '↻', 'rotate-ccw': '↶', 'check': '✓', 'image-plus': '＋', 'party-popper': '☆', 'library-big': '▤', 'smile': '☺' };
  const icon = name => '<span class="ls-local-icon" aria-hidden="true">' + (symbols[name] || '') + '</span>';
  const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const appearance = { layout: 'left', fontSize: 32 };
  const books = listBooks(DEFAULT_PROFILE, undefined, browserCatalog).map((b, index) => ({ id: b.id, number: b.number || index + 1, short: b.title, group: b.tag, description: b.description, title: (p, members = state.members) => getBook(b.id, p, members).title, pages: (p, members = state.members) => getBook(b.id, p, members).pages }));
  const isIllustratedBook = id => books.some(book => book.id === id);
  const roles = ROLE_OPTIONS;
  const state = { view: 'home', book: 'intro-complete', page: 0, onCover: true, profile: { ...DEFAULT_PROFILE }, progress: {}, completed: [], avatars: {}, members: defaultMembers() };
  const familyCharacters=window.createCharacterArtLoader(shared,/* FAMILY_POSES */,window.LittleFamilyArtLoader,books.map(b=>b.id));
  window.addEventListener('pagehide',()=>familyCharacters.close(),{once:true});
  const initialAccountView = new URLSearchParams(location.search).get('view');
  if (['account', 'accountLogin'].includes(initialAccountView)) state.view = initialAccountView;
  let draft = null, draftAvatars = {}, draftMembers = [], activeRole = 'child', touchStart = null;
  let faceAnalysis = null, selectedFace = -1, photoStatus = '', photoError = '', photoPending = false;
  let photoController = null;
  let photoRevision = 0, photoBusy = false, saveBusy = false, ready = false, storageNotice = '';
  let databasePromise;
  const photoTiming={photoReadMs:null,recognitionMs:null,cutoutMs:null,pngEncodeMs:null};
  const book = () => books.find(b => b.id === state.book) || books[0];
  const pageList = () => book().pages(state.profile);
  const activeMember = () => draftMembers.find(member => member.id === activeRole) || { id: 'child', role: 'child', included: true };
  const roleLabel = () => memberLabel(activeMember(), draftMembers);
  function normalizeLayout() {
    // Old manual placements must not offset the landmark-based fit after migration.
    return { scale: 1, x: 0, y: 0 };
  }
  function copyActor(actor, preserveUnusedLayout=false) {
    return { image: actor?.image || null, data: actor?.data || '', kind: actor?.kind || '',
      layout: preserveUnusedLayout&&actor?.layout ? {...actor.layout} : normalizeLayout(), metrics: actor?.metrics || null };
  }
  const editedActor = () => draftAvatars[activeRole] || (draftAvatars[activeRole] = copyActor());
  function measureAvatar(image) {
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, width, height).data;
    const bounds = { left: width, top: height, right: -1, bottom: -1 };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] <= 16) continue;
      bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x);
      bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y);
    }
    if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) return null;
    const chin = { x: (bounds.left + bounds.right) / 2, y: bounds.bottom };
    bounds.right++; bounds.bottom++;
    return { bounds, chin };
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('此浏览器无法使用本地存储。')); return; }
      const request = indexedDB.open('little-story-local', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('child')) request.result.createObjectStore('child'); };
      request.onerror = () => reject(request.error || new Error('无法打开本地存储。'));
      request.onblocked = () => reject(new Error('请关闭另一个旧版本页面后重试。'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); databasePromise = null; };
        resolve(db);
      };
    }).catch(error => { databasePromise = null; throw error; });
    return databasePromise;
  }

  async function readSavedProfile() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('child', 'readonly');
      const request = transaction.objectStore('child').get('main');
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || new Error('本地资料读取失败。'));
      transaction.onerror = () => {};
    });
  }

  async function persistProfile(profile, characters, members) {
    const db = await openDatabase();
    const avatars = {};
    members.forEach(({ id, role }) => {
      const actor = characters[id];
      if (actor?.data) avatars[id] = { data: actor.data, kind: actor.kind, layout: canUsePhoto(role)?normalizeLayout():actor.layout, metrics: actor.metrics };
    });
    // Name and image belong to one record and one transaction: both commit or neither does.
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('child', 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('本地资料保存失败。'));
      transaction.onerror = () => {};
      transaction.objectStore('child').put({ version: 4, profile, avatars, members }, 'main');
    });
  }

  const loadImage = source => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth && image.naturalHeight ? resolve(image) : reject(new Error('照片尺寸无效。'));
    image.onerror = () => reject(new Error('这张照片暂时无法打开，请重新选择。'));
    image.src = source;
  });
  /* UI_FUNCTIONS */

  function showError(message) {
    const element = root.querySelector('#ls-form-error');
    if (element) element.textContent = message;
  }
  function setBusy() {
    root.querySelectorAll('button').forEach(button => {
      if (saveBusy) button.disabled = true;
      else if (state.view === 'profile') button.disabled = button.dataset.action === 'save-profile' && (photoBusy || photoPending);
    });
    const save = root.querySelector('[data-action="save-profile"]');
    if (save && saveBusy) save.textContent = '正在保存…';
    root.querySelectorAll('[data-member-included]').forEach(input => { input.disabled = saveBusy || input.dataset.memberIncluded === 'child'; });
    const add = root.querySelector('[data-action="add-member"]');
    if (add) add.disabled = saveBusy || participants(draftMembers).length >= MAX_MEMBERS;
    const sibling = root.querySelector('#ls-sibling-role');
    if (sibling) sibling.disabled = saveBusy;
  }
  function render() {
    root.classList.toggle('ls-reading', state.view === 'reader' || state.view === 'done');
    root.classList.toggle('ls-reader-open', state.view === 'reader');
    device.classList.remove('ls-landscape');
    device.classList.toggle('ls-spread-book', state.view === 'reader' || state.view === 'done');
    device.style.setProperty('--ls-reading-size', '32px');
    screen.innerHTML = ({ home, detail, reader, done, profile, account, accountLogin, accountLegal, printService }[state.view] || home)();
    modeLabel.textContent = state.view === 'reader' ? '竖版 A5 · 图文同页' : state.view === 'done' ? '竖版 A5 · 读完一本' : state.view === 'profile' ? '竖屏 · 设置小主角' : '竖屏 · 选一本故事';
    root.querySelector('.ls-notice')?.remove();
    if (['account', 'accountLogin', 'accountLegal'].includes(state.view)) modeLabel.textContent = '竖屏 · 家长账号';
    if (state.view === 'printService') modeLabel.textContent = '竖屏 · 纸质绘本打印服务';
    if (storageNotice) {
      const notice = document.createElement('p'); notice.className = 'ls-notice'; notice.setAttribute('role', 'alert'); notice.textContent = storageNotice;
      root.insertBefore(notice, device);
    }
    setBusy();
    requestAnimationFrame(drawAll);
    if (state.view === 'reader') live.textContent = book().title(state.profile) + (state.onCover ? '，封面。翻开故事，开始阅读。' : state.page===pageList().length ? '，识字小结结尾页。' : '，第' + (state.page + 1) + '页。' + pageList()[state.page].join(''));
  }
  function releaseFaceAnalysis(){window.LittleFaceProcessor?.release?.(faceAnalysis);faceAnalysis=null;}
  function artLoaderFor(id,avatars=state.avatars,members=state.members) {
    return familyCharacters.forBook(id,avatars,members);
  }
  function drawIllustration(canvas,options,loaded,artwork){
    const started=performance.now();
    const result=artwork.draw(canvas,{...options,...loaded,...(options.book==='family'?{scenePanel:true,artPanel:options.artPanel||options.portraitPanel}:{})});
    familyCharacters.recordDraw(performance.now()-started);return result;
  }
  /* PRINT_FUNCTIONS */
  const pendingArtCanvases = new WeakMap();
  function waitForArt(canvas, loader, options) {
    const request = loader.ensure(options.page, options);
    if (pendingArtCanvases.get(canvas) === request) return;
    pendingArtCanvases.set(canvas, request);
    const settled = () => {
      // A prefetch may already be loading when its page becomes visible. That
      // new canvas subscribes once; removed pages never repaint a later book.
      if (canvas.isConnected && pendingArtCanvases.get(canvas) === request) scheduleDrawing();
    };
    void request.then(settled, settled);
  }
  function drawArtWaiting(canvas, options, message = '插画准备中…') {
    const ratio = Math.max(.1, Math.min(3, Number(options.pixelRatio) || 1));
    const width = Math.max(1, Math.round(options.width * ratio)), height = Math.max(1, Math.round(options.height * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#fbf6e9'; context.fillRect(0, 0, width, height);
    const hero = options.framing === 'hero';
    const hasPageText = !options.cover && !options.framing && !!canvas.closest('.ls-reader');
    const left = hero ? width * .52 : 0, areaWidth = width * (hero ? .48 : hasPageText ? .65 : 1);
    const fontSize = Math.min(16, Math.max(10, areaWidth / ratio / 7));
    context.font = `${fontSize * ratio}px "PingFang SC","Microsoft YaHei",sans-serif`;
    context.fillStyle = '#697267'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(message, left + areaWidth / 2, height / 2, Math.max(1, areaWidth - 12 * ratio));
    context.restore();
  }
  function drawAll() {
    root.querySelectorAll('.ls-book-end').forEach(page=>{
      const area=page.parentElement.getBoundingClientRect();
      page.style.setProperty('--end-scale',Math.min(area.width/740,area.height/1050));
    });
    const avatars = state.view === 'profile' ? draftAvatars : state.avatars;
    const child = avatars.child || {};
    const members = state.view === 'profile' ? draftMembers : state.members;
    const member = state.view === 'profile' ? activeMember() : members.find(item => item.id === 'child');
    const familyBook = getBook('family', state.view === 'profile' ? draft : state.profile, members);
    root.querySelectorAll('canvas[data-art]').forEach(canvas => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const options = { width: rect.width, height: rect.height, pixelRatio: window.devicePixelRatio || 1, book: canvas.dataset.art, page: Number(canvas.dataset.page), cover: canvas.dataset.cover === '1',
        portraitPanel:!!canvas.closest('.ls-reader-art'), avatars, avatar: child.image, avatarKind: child.kind, avatarLayout: child.layout, avatarMetrics: child.metrics,
        members, characterId: member.id, characterRole: member.role, familyScene: familyBook.scenes?.[Number(canvas.dataset.page)],
        reserveText: canvas.dataset.art === 'intro-complete' && canvas.dataset.cover !== '1' && !!canvas.closest('.ls-reader'),
        framing: canvas.closest('.ls-avatar-preview,.ls-person-button') ? 'avatar' : canvas.closest('.ls-profile-preview') ? 'character' : canvas.closest('.ls-feature') ? 'hero' : undefined };
      if(options.framing==='avatar'){
        options.avatars=window.LittlePhotoTone.apply(avatars);
        options.avatar=options.avatars.child?.image||child.image;
      }
      let illustrated = false;
      const loader = options.framing === 'avatar' ? null : artLoaderFor(options.book,avatars,members);
      const artwork = options.book==='family'?shared.familyArt:shared.layeredArt;
      if (loader && artwork) {
        const loaded = loader.peek(options.page, options);
        if (loaded) illustrated = drawIllustration(canvas,options,loaded,artwork);
        if(illustrated)canvas.dataset.characterPipeline='composed-actor-v1';
        const status = loader.status(options.page, options);
        if (!illustrated && (status === 'idle' || status === 'loading')) {
          canvas.dataset.artState = 'loading'; canvas.setAttribute('aria-busy', 'true');
          canvas.setAttribute('aria-description', '插画准备中…');
          drawArtWaiting(canvas, options);
          waitForArt(canvas, loader, options);
          return;
        }
        canvas.dataset.artState = illustrated ? 'ready' : 'error';
        canvas.setAttribute('aria-busy', 'false'); canvas.removeAttribute('aria-description');
        if (illustrated && state.view === 'reader' && canvas.closest('.ls-reader') && options.book === state.book) {
          const nextPage = options.cover ? 0 : options.page + 1;
          if (nextPage < pageList().length) {
            const nextOptions = { ...options, page: nextPage, cover: false, framing: undefined, familyScene: familyBook.scenes?.[nextPage] };
            // One upcoming page only. Cached scenes need no request, failures
            // require the explicit Retry button, and prefetch never redraws.
            if (loader.status(nextPage, nextOptions) === 'idle') void loader.ensure(nextPage, nextOptions).catch(() => {});
          }
        }
      }
      if (!illustrated) {
        if (options.framing==='avatar') draw(canvas, options);
        else {
          // These new stories have no legacy illustration. Never substitute
          // the old renderer's unrelated family scene for a missing page.
          canvas.dataset.artState = 'error'; canvas.setAttribute('aria-busy', 'false');
          canvas.removeAttribute('aria-description');
          drawArtWaiting(canvas, options, '插画暂时没打开');
        }
      }
    });
    root.querySelectorAll('[data-art-status]').forEach(notice => {
      const page = Number(notice.dataset.artStatus), cover = notice.dataset.cover === '1';
      const loader = artLoaderFor(notice.dataset.artBook || 'flower',avatars,members);
      const failed = loader?.status(page, { cover, members, familyScene: familyBook.scenes?.[page] }) === 'error' ||
        Array.from(root.querySelectorAll('canvas[data-art]')).some(canvas => canvas.dataset.art === (notice.dataset.artBook || 'flower') && Number(canvas.dataset.page) === page && (canvas.dataset.cover === '1') === cover && canvas.dataset.artState === 'error');
      notice.hidden = !failed;
    });
    root.dataset.characterSession=JSON.stringify(familyCharacters.snapshot());
    root.dataset.photoTiming=JSON.stringify(photoTiming);
  }
  let drawingFrame = 0;
  function scheduleDrawing() {
    if (!drawingFrame) drawingFrame = requestAnimationFrame(() => { drawingFrame = 0; drawAll(); });
  }
  function discardDraft() {
    photoController?.abort(); photoController = null;
    photoRevision++; draft = null; draftAvatars = {}; draftMembers = []; photoBusy = false;
    releaseFaceAnalysis(); selectedFace = -1; photoStatus = ''; photoError = ''; photoPending = false;
  }
  function navigate(view) {
    cancelPrintSubmission();
    if(printBusy){printRevision++;removePrintBook();}
    else clearDownload();
    if (state.view === 'profile' && view !== 'profile') discardDraft();
    state.view = view;
    render();
  }
  function begin() {
    familyCharacters.openBook(state.book);
    void trackOperation('read',state.book);
    state.page = Math.min(pageList().length, state.progress[state.book] || 0);
    state.onCover = state.page === 0;
    navigate('reader');
  }
  function flip(direction) {
    if (state.view !== 'reader') return;
    if (state.onCover) {
      if (direction > 0) {
        state.onCover = false; state.page = 0; state.progress[state.book] = 0; render();
      }
      return;
    }
    if (direction < 0 && state.page === 0) {
      state.onCover = true; render(); return;
    }
    if (direction > 0 && state.page === pageList().length) {
      if (!state.completed.includes(state.book)) state.completed.push(state.book);
      delete state.progress[state.book];
      navigate('done'); return;
    }
    state.page = Math.max(0, Math.min(pageList().length, state.page + direction));
    state.progress[state.book] = state.page; render();
  }
  function captureDraft() {
    if (state.view !== 'profile') return;
    const name = root.querySelector('#ls-name');
    if (name) draft = { name: name.value, age: Number(root.querySelector('#ls-age').value), className: root.querySelector('#ls-class').value, avatarPath: '' };
  }
  async function saveProfile() {
    if (saveBusy || photoBusy || photoPending) return;
    captureDraft();
    let validated;
    try { validated = validateProfile(draft); }
    catch (error) {
      if (activeRole !== 'child') { activeRole = 'child'; render(); }
      showError(error.message); root.querySelector('#ls-name')?.focus(); return;
    }
    saveBusy = true; showError(''); setBusy();
    try {
      const members = normalizeMembers(draftMembers);
      const changedFamily = JSON.stringify(participants(members)) !== JSON.stringify(participants(state.members));
      await persistProfile(validated, draftAvatars, members);
      clearPendingSubmission();
      state.profile = validated; state.avatars = draftAvatars; state.members = members;
      if (changedFamily) {
        delete state.progress.family;
        state.completed = state.completed.filter(id => id !== 'family');
        if (state.book === 'family') state.page = 0;
      }
      storageNotice = ''; saveBusy = false; live.textContent = '小主角和家人已保存在此浏览器。'; navigate('home');
    } catch (_error) {
      saveBusy = false; render(); showError('保存没有成功，请检查浏览器是否允许本地存储，再点保存重试。你的修改仍保留在这里。');
    }
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!ready || !button || button.disabled || saveBusy) return;
    const action = button.dataset.action;
    if (handleAccountAction(action, button)) return;
    if (action === 'print-service') { selectedPrintLevel = 0; navigate('printService'); }
    if (action === 'select-print-level' && !printBusy && !submissionActive) {
      selectedPrintLevel = Number(button.dataset.level); render();
      root.querySelector('#ls-print-checklist')?.scrollIntoView({block:'start',behavior:'smooth'});
    }
    if (action === 'confirm-level-print' && selectedPrintLevel === 1 && printServicePlan().available && operationsEnabled) void submitPrint('level');
    if (action === 'home' || action === 'cancel-profile') navigate('home');
    if (action === 'profile') {
      if (state.view === 'profile') return;
      draft = { ...state.profile }; draftAvatars = {};
      draftMembers = state.members.map(member => ({ ...member }));
      draftMembers.forEach(({ id, role }) => { draftAvatars[id] = copyActor(state.avatars[id],!canUsePhoto(role)); });
      activeRole = 'child';
      releaseFaceAnalysis(); selectedFace = -1; photoStatus = ''; photoError = ''; photoPending = false;
      navigate('profile');
      const preparationRevision = photoRevision;
      if (window.LittleFaceProcessor.prepare) {
        setPhotoStatus('正在准备头像工具，可以先选择照片…');
        void window.LittleFaceProcessor.prepare().then(() => {
          if (state.view === 'profile' && photoRevision === preparationRevision && !faceAnalysis && !photoBusy) {
            setPhotoStatus('头像工具已就绪，选择照片即可。照片不会上传。');
          }
        }).catch(() => {
          if (state.view === 'profile' && photoRevision === preparationRevision && !photoBusy) {
            setPhotoStatus('选择照片后会重试加载头像工具，请保持网络连接。');
          }
        });
      }
    }
    if (action === 'book') { state.book = button.dataset.id; navigate('detail'); }
    if (action === 'detail') navigate('detail');
    if (action === 'start-intro') { state.book = books[0].id; begin(); }
    if (action === 'start') begin();
    if (action === 'previous') flip(-1);
    if (action === 'next') flip(1);
    if (action === 'print-book') { if(operationsEnabled&&button.classList.contains('ls-end-print'))void submitPrint('book');else void printCurrentBook(); }
    if (action === 'download-book-pdf') void downloadPrintFiles('book');
    if (action === 'download-press-pdf') void downloadPrintFiles('book',{format:'package'});
    if (action === 'download-level') void downloadPrintFiles('level',selectedPrintVolume(button.dataset.volume));
    if (action === 'download-level-package') void downloadPrintFiles('level',{...selectedPrintVolume(button.dataset.volume),format:'package'});
    if (action === 'print-level') void printCurrentBook('level',selectedPrintVolume(button.dataset.volume));
    if (action === 'submit-print') void submitPrint(button.dataset.scope || 'book');
    if (action === 'retry-print-submission') void submitPrint('book',true);
    if (action === 'share-invitation') void shareInvitation();
    if (action === 'reread') { state.page = 0; state.onCover = true; state.progress[state.book] = 0; navigate('reader'); }
    if (action === 'retry-art') {
      artLoaderFor(button.dataset.book || 'flower',state.view==='profile'?draftAvatars:state.avatars,state.view==='profile'?draftMembers:state.members)?.retry(); scheduleDrawing();
    }
    const canEditPhoto = state.view === 'profile' && canUsePhoto(activeMember().role);
    if (action === 'photo' && canEditPhoto) root.querySelector('#ls-photo-input').click();
    if (action === 'role' && draftMembers.some(member => member.id === button.dataset.role && canUsePhoto(member.role))) {
      photoController?.abort(); photoController = null;
      captureDraft(); photoRevision++; activeRole = button.dataset.role;
      releaseFaceAnalysis(); selectedFace = -1; photoBusy = false; photoPending = false; photoStatus = ''; photoError = '';
      render();
    }
    if (action === 'add-member') {
      captureDraft();
      const role = root.querySelector('#ls-sibling-role').value;
      try {
        const previousIds = new Set(draftMembers.map(member => member.id));
        draftMembers = createSibling(draftMembers, role);
        const added = draftMembers.find(member => !previousIds.has(member.id));
        if (added) {
          photoController?.abort(); photoController = null; photoRevision++;
          activeRole = added.id; draftAvatars[added.id] = copyActor();
          releaseFaceAnalysis(); selectedFace = -1; photoBusy = false; photoPending = false; photoStatus = ''; photoError = '';
        }
        render();
      } catch (error) { showError(error.message || '一本书最多安排 12 位家人出场。'); }
    }
    if (action === 'remove-member') {
      const id = button.dataset.member;
      if (!draftMembers.some(member => member.id === id) || roles.some(role => role.id === id)) return;
      captureDraft();
      draftMembers = draftMembers.filter(member => member.id !== id);
      delete draftAvatars[id];
      if (activeRole === id) {
        photoController?.abort(); photoController = null; photoRevision++; activeRole = 'child';
        releaseFaceAnalysis(); selectedFace = -1; photoBusy = false; photoPending = false; photoStatus = ''; photoError = '';
      }
      render();
    }
    if (action === 'choose-face' && canEditPhoto && faceAnalysis && !photoBusy) {
      captureDraft(); selectedFace = Number(button.dataset.index); void updateAvatar();
    }
    if (action === 'discard-photo' && canEditPhoto) {
      photoController?.abort(); photoController = null;
      captureDraft(); photoRevision++; releaseFaceAnalysis(); selectedFace = -1; photoBusy = false; photoPending = false; photoStatus = ''; photoError = '';
      draftAvatars[activeRole] = copyActor(state.avatars[activeRole]); render();
    }
    if (action === 'remove-photo' && canEditPhoto && !photoBusy) {
      captureDraft(); photoRevision++; releaseFaceAnalysis(); selectedFace = -1; photoPending = false;
      draftAvatars[activeRole] = copyActor(); photoError = ''; photoStatus = '已恢复默认绘本形象，保存后生效。'; render();
    }
    if (action === 'save-profile') void saveProfile();
  });
  function setPhotoStatus(message) {
    photoStatus = message;
    const element = root.querySelector('#ls-photo-status');
    if (element) element.textContent = message;
  }
  function photoFailed(error) {
    photoBusy = false; photoPending = true;
    photoStatus = '这次没有生成新头像。';
    const label = roleLabel();
    const roleErrors = {
      NO_FACE: '没有找到清晰的脸部，请选择'+label+'露脸的正面照片。',
      SMALL_FACE: '照片中的脸太小了，请选一张'+label+'离镜头近一些的照片。',
      SIDEWAYS_FACE: '请先将照片转正，再选择'+label+'的正面照。',
      SELECT_FACE: '请先选择照片中'+label+'的脸。'
    };
    photoError = roleErrors[error?.code] || error?.message || '照片处理没有完成，请重新选择一张清晰的正面照。';
    render();
    root.querySelector('#ls-photo-error')?.scrollIntoView({ block: 'nearest' });
  }
  async function updateAvatar(revision) {
    if (!faceAnalysis || selectedFace < 0 || state.view !== 'profile' || !canUsePhoto(activeMember().role)) return;
    const currentRevision = revision === undefined ? ++photoRevision : revision;
    photoBusy = true; photoPending = true; photoError = ''; photoStatus = '正在提取脸部和头发…'; render();
    try {
      const started=performance.now();
      const result = await window.LittleFaceProcessor.cutout(faceAnalysis, selectedFace);
      photoTiming.cutoutMs=performance.now()-started;
      const { canvas } = result;
      if (currentRevision !== photoRevision || state.view !== 'profile') return;
      const encodeStarted=performance.now(),data=canvas.toDataURL('image/png');photoTiming.pngEncodeMs=performance.now()-encodeStarted;
      draftAvatars[activeRole] = { image: canvas, data, kind: 'cutout', layout: normalizeLayout(), metrics: result.metrics || measureAvatar(canvas) };
      familyCharacters.openBook(books[0].id);
      photoBusy = false; photoPending = false;
      photoStatus = '真实头像已自动适配，保存后即可进入故事。'; render();
    } catch (error) {
      if (currentRevision !== photoRevision || state.view !== 'profile') return;
      photoFailed(error);
    }
  }
  root.addEventListener('input', event => {
    if (saveBusy) return;
    if (['ls-name', 'ls-age', 'ls-class'].includes(event.target.id)) captureDraft();
  });
  root.addEventListener('change', async event => {
    if (saveBusy) return;
    if (event.target.matches('[data-member-included]')) {
      captureDraft();
      const id = event.target.dataset.memberIncluded, checked = event.target.checked;
      if (id === 'child') return;
      if (checked && participants(draftMembers).length >= MAX_MEMBERS) {
        event.target.checked = false;
        showError('一本书最多安排 12 位家人出场，请先取消一位家人。');
        return;
      }
      draftMembers = draftMembers.map(member => member.id === id ? { ...member, included: checked } : member);
      render(); return;
    }
    if (event.target.id !== 'ls-photo-input' || state.view !== 'profile' || !canUsePhoto(activeMember().role)) return;
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    captureDraft(); showError('');
    const revision = ++photoRevision;
    photoController?.abort();
    const controller = new AbortController(); photoController = controller;
    photoBusy = true; photoPending = true;
    releaseFaceAnalysis(); selectedFace = -1; photoError = ''; photoStatus = '正在读取照片…'; render();
    let opened;
    try {
      const readStarted=performance.now();
      opened = await window.LittlePhotoInput.open(file, { signal: controller.signal });
      photoTiming.photoReadMs=performance.now()-readStarted;
      if (revision !== photoRevision || state.view !== 'profile') return;
      const analysisStarted=performance.now(),analysis = await window.LittleFaceProcessor.analyze(opened.image, message => {
        if (revision === photoRevision && state.view === 'profile') setPhotoStatus(message);
      });
      photoTiming.recognitionMs=performance.now()-analysisStarted;
      // The processor owns its normalized copy; release the original large photo
      // before segmentation to avoid keeping both in a phone's limited memory.
      opened.dispose();
      if (revision !== photoRevision || state.view !== 'profile') return;
      faceAnalysis = analysis;
      if (analysis.faces.length > 1) {
        photoBusy = false; photoStatus = '照片里有多张脸，请点选'+roleLabel()+'。'; render();
      } else {
        selectedFace = 0; await updateAvatar(revision);
      }
    } catch (error) {
      if (revision !== photoRevision || state.view !== 'profile') return;
      photoFailed(error);
    } finally {
      opened?.dispose();
      if (photoController === controller) photoController = null;
    }
  });
  root.addEventListener('pointerdown', event => { touchStart = state.view === 'reader' && event.target.closest('#ls-swipe-area') ? { x: event.clientX, y: event.clientY } : null; });
  root.addEventListener('pointerup', event => {
    if (!touchStart) return;
    const dx = event.clientX - touchStart.x, dy = event.clientY - touchStart.y; touchStart = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) flip(dx < 0 ? 1 : -1);
  });
  root.addEventListener('pointercancel', () => { touchStart = null; });
  root.addEventListener('toggle', event => {
    if (event.target.matches('.ls-family-comparison,.ls-flower-comparison') && event.target.open) scheduleDrawing();
  }, true);
  document.addEventListener('keydown', event => {
    if (state.view !== 'reader' || event.target.closest('input,select,textarea')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); flip(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); flip(-1); }
    if (event.key === 'Escape') navigate('home');
  });
  let resizeTimer;
  const resize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { drawAll(); }, 100);
  };
  const orientationChanged = () => { resize(); };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', orientationChanged);
  window.screen.orientation?.addEventListener('change', orientationChanged);
  if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(drawAll)).observe(device);
  screen.innerHTML = '<main class="ls-done"><h2>正在打开小书架…</h2></main>';
  (async () => {
    try {
      const saved = await readSavedProfile();
      if (saved && [1, 2, 3, 4].includes(saved.version)) {
        state.profile = normalizeProfile(saved.profile);
        state.members = migrateMembers(saved);
        const records = saved.version >= 3 ? saved.avatars || {} : { child: { data: saved.avatarData, kind: saved.avatarKind } };
        await Promise.all(state.members.map(async ({ id, role }) => {
          const stored = records[id];
          if (typeof stored?.data !== 'string' || !stored.data) return;
          // Adult characters use the painted defaults. Keep earlier local data
          // without decoding or rendering it, so saving a family never erases it.
          if (!canUsePhoto(role)) { state.avatars[id] = copyActor(stored,true); return; }
          if (!stored.data.startsWith('data:image/png;base64,')) return;
          try {
            const image = await loadImage(stored.data), kind = stored.kind === 'cutout' ? 'cutout' : '';
            const validMetrics = kind === 'cutout' && stored.metrics?.bounds && stored.metrics?.chin &&
                ['left','top','right','bottom'].every(key => Number.isFinite(stored.metrics.bounds[key])) &&
                ['x','y'].every(key => Number.isFinite(stored.metrics.chin[key]));
            state.avatars[id] = { image, data: stored.data, kind, layout: normalizeLayout(),
              metrics: validMetrics ? stored.metrics : kind === 'cutout' ? measureAvatar(image) : null };
          } catch (_) { storageNotice = '有一张头像暂时无法读取，已用卡通形象代替，可以重新选择。'; }
        }));
      }
    } catch (_error) { storageNotice = '已有资料暂时无法读取。请检查浏览器本地存储后刷新，或重新设置小主角。'; }
    ready = true; render();
  })();
})();
