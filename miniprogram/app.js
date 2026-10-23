const { getAuthService } = require('./services/auth-service');
const { createProfileStore } = require('./services/profile-store');
const { createReadingStore } = require('./services/reading-store');
const { createOperationsService } = require('./services/operations-service');
App({
  onLaunch(options) {
    this.auth = getAuthService(wx);
    this.operations = createOperationsService(wx,this.auth);
    this.operations.setInvite(options&&options.query&&options.query.invite);
    let activeAccount = '';
    this.auth.subscribe(value => {
      if (value.status === 'authenticated') {
        const identity = value.user.id + ':' + (value.user.accountVersion || 'legacy');
        if (identity !== activeAccount) void this.operations.track('visit');
        activeAccount = identity;
      } else if (value.status === 'guest' || value.status === 'offline') activeAccount = '';
    });
  },
  onShow(options) {
    if(options&&options.query&&options.query.invite&&this.operations)this.operations.setInvite(options.query.invite);
    if(this.auth){if(this.auth.getSnapshot().status==='authenticated'&&this.operations)void this.operations.track('visit');void this.auth.restore();}
  },
  getProfileStore() {
    const user = this.auth.getSnapshot().user;
    const ownerId = user ? user.id : '';
    const accountVersion = user ? user.accountVersion || 'legacy' : 'legacy';
    return createProfileStore(wx, { ownerId, accountVersion, isCurrent: () => {
      const active = this.auth.getSnapshot().user;
      return (active ? active.id : '') === ownerId && (active ? active.accountVersion || 'legacy' : 'legacy') === accountVersion;
    } });
  },
  // Shared by reading and future picture-book modules. Child data stays local.
  getReadingStore() {
    const snapshot = this.auth.getSnapshot(), user = snapshot.user;
    const profileStore = this.getProfileStore();
    return createReadingStore(wx, { ownerId: user ? user.id : '', accountVersion: user ? user.accountVersion || 'legacy' : 'legacy',
      isCurrent: () => !['loading', 'closing'].includes(this.auth.getSnapshot().status) && profileStore.isCurrent() });
  },
  getReadingContext() {
    const user = this.auth.getSnapshot().user;
    return { userId: user ? user.id : null, child: this.getProfileStore().loadProfile(), storage: 'local' };
  }
});
