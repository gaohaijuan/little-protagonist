'use strict';
const { createProfileStore } = require('./profile-store');

// Preparation is read-only. The page shows this exact source/target in its
// confirmation, and only a later explicit confirmation may invoke commit().
function prepareGuestImport(wxApi, targetStore, options = {}) {
  function checkIdentity() {
    if (typeof options.isCurrent !== 'function' || !options.isCurrent() || !targetStore.isCurrent()) {
      throw Error('账号已变化，请重新打开账号页后导入。');
    }
  }
  checkIdentity();
  const sourceStore = createProfileStore(wxApi);
  if (!sourceStore.hasProfile()) throw Error('本机还没有保存游客小主角，请先设置孩子资料。');
  const source = sourceStore.loadProfile({ strict: true });
  const targetExists = targetStore.hasProfile(), target = targetStore.loadProfile({ strict: true });
  const sourceSignature = JSON.stringify(source);
  let committed = false, running = false;
  return {
    source: { ...source }, target: targetExists ? { ...target } : null,
    async commit() {
      checkIdentity();
      if (committed || running) throw Error('这次导入已提交，请勿重复操作。');
      if (!sourceStore.isCurrent() || !sourceStore.hasProfile() || JSON.stringify(sourceStore.loadProfile({ strict: true })) !== sourceSignature) {
        throw Error('游客小主角已变化，请重新确认导入资料。');
      }
      // Validation runs inside the shared save queue as well as after the modal,
      // so an already queued edit cannot be silently replaced by old consent.
      running = true;
      try {
        await targetStore.saveProfile(source, {
          ...(source.avatarPath ? { avatarTempPath: source.avatarPath } : { removeAvatar: true }),
          expectedProfile: target, expectedHasProfile: targetExists,
          isCurrent: () => options.isCurrent() && sourceStore.isCurrent() && sourceStore.hasProfile() &&
            JSON.stringify(sourceStore.loadProfile({ strict: true })) === sourceSignature
        });
        committed = true;
      } finally { running = false; }
    }
  };
}

module.exports = { prepareGuestImport };
