'use strict';
function createRepository(db) {
  // Missing records return []; real database errors propagate.
  const get = async (name, id) => (await db.collection(name).where({ _id: id }).limit(1).get()).data[0] || null;
  return {
    getUser: id => get('story_users', id),
    saveUser: (id, value) => db.collection('story_users').doc(id).set({ data: value }),
    async ensureUser(id, value) {
      const old = await get('story_users', id);
      if (old) return old;
      try { await db.collection('story_users').add({ data: { ...value, _id: id } }); }
      catch (error) { if (!await get('story_users', id)) throw error; }
      return get('story_users', id);
    },
    async updateUser(id, generation, data, { closed = false } = {}) {
      const condition = { _id: id, generation: generation === 'legacy' ? db.command.exists(false) : generation,
        status: closed ? 'closed' : db.command.neq('closed') };
      const result = await db.collection('story_users').where(condition).update({ data });
      return result.stats.updated === 1;
    },
    async closeUser(id, generation, nextGeneration, closedAt) {
      return this.updateUser(id, generation, { status: 'closed', generation: nextGeneration, closedAt,
        nickname: db.command.remove(), onboardingCompleted: db.command.remove(), createdAt: db.command.remove() });
    },
    async removeUserSessions(id, generation) {
      const userGeneration = generation === 'legacy' ? db.command.or(db.command.eq('legacy'), db.command.exists(false)) : generation;
      // No skip: each successful batch removes its matching rows before the next.
      for (;;) {
        const result = await db.collection('story_sessions').where({ userId: id, userGeneration }).remove();
        if (!result.stats.removed) break;
      }
    },
    getSession: id => get('story_sessions', id),
    saveSession: (id, value) => db.collection('story_sessions').doc(id).set({ data: value }),
    removeSession: id => db.collection('story_sessions').doc(id).remove()
  };
}
module.exports = { createRepository };
