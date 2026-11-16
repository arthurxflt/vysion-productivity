// Stockage local (localStorage), historique d'annulation et synchro Supabase.
import { createState } from './model.js';

const UNDO_LIMIT = 50;

function isValidState(data) {
  return !!data && typeof data === 'object' && !Array.isArray(data)
    && data.tasks && typeof data.tasks === 'object' && !Array.isArray(data.tasks)
    && typeof data.updatedAt === 'number';
}

// Complète un état ancien ou partiel pour qu'il ait toujours la même forme.
function normalize(data) {
  const base = createState();
  const state = { ...base, ...data };
  state.v = 2;
  state.seq = Number.isFinite(state.seq) ? state.seq : Object.keys(state.tasks).length;
  state.series = state.series && typeof state.series === 'object' ? state.series : {};
  state.labels = Array.isArray(state.labels) ? state.labels : [];
  state.boards = Array.isArray(state.boards) && state.boards.length ? state.boards : base.boards;
  return state;
}

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createStore({ storage, key, now = Date.now }) {
  let state = createState();
  const listeners = new Set();
  const undoStack = [];

  try {
    const raw = storage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.tasks && typeof parsed.tasks === 'object') {
        if (typeof parsed.updatedAt !== 'number') parsed.updatedAt = 0;
        state = normalize(parsed);
      }
    }
  } catch {
    // Stockage illisible ou indisponible : on repart d'un état vide en mémoire.
  }

  const persist = () => {
    try { storage.setItem(key, JSON.stringify(state)); } catch { /* quota ou mode privé */ }
  };
  const notify = () => { for (const fn of [...listeners]) fn(state); };
  const stamp = () => { state.updatedAt = Math.max(now(), state.updatedAt + 1); };

  return {
    getState: () => state,

    mutate(fn, { undoable = false, silent = false } = {}) {
      if (undoable) {
        undoStack.push(clone(state));
        if (undoStack.length > UNDO_LIMIT) undoStack.shift();
      }
      fn(state);
      stamp();
      persist();
      if (!silent) notify();
    },

    // Pour les ajustements dérivés (occurrences de répétition) : sauvegarde
    // seulement si fn a réellement créé quelque chose (valeur de retour > 0),
    // sans notifier ni toucher aux abonnés.
    maintain(fn) {
      const changed = fn(state);
      if (changed > 0) { stamp(); persist(); }
      return changed;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    canUndo: () => undoStack.length > 0,

    undo() {
      const previous = undoStack.pop();
      if (!previous) return false;
      state = previous;
      stamp();
      persist();
      notify();
      return true;
    },

    // Applique un état venu du serveur seulement s'il est plus récent que le nôtre.
    applyRemote(data) {
      if (!isValidState(data) || data.updatedAt <= state.updatedAt) return false;
      state = normalize(clone(data));
      undoStack.length = 0;
      persist();
      notify();
      return true;
    },
  };
}

// --- synchro Supabase -------------------------------------------------------

function classify(error) {
  const text = `${error.code || ''} ${error.message || ''}`;
  if (/PGRST205|42P01|does not exist|schema cache|Could not find the table/i.test(text)) return 'missing-table';
  return 'error';
}

export function createSync({ supabase, store, getUserId, table = 'planner_data', debounceMs = 800, onStatus = () => {} }) {
  let userId = null;
  let timer = null;
  let channel = null;
  let unsubscribe = null;
  let applying = false;
  let inflight = false;
  let again = false;
  let disabled = false;
  let lastPushed = 0;

  const apply = (data) => {
    applying = true;
    try {
      if (store.applyRemote(data)) { lastPushed = store.getState().updatedAt; return true; }
    } finally {
      applying = false;
    }
    return false;
  };

  const fail = (error) => {
    const status = classify(error);
    if (status === 'missing-table') disabled = true;
    onStatus(status);
  };

  async function push() {
    timer = null;
    if (!userId || disabled) return;
    if (inflight) { again = true; return; }
    const snapshot = clone(store.getState());
    if (snapshot.updatedAt <= lastPushed) return;
    inflight = true;
    try {
      const { error } = await supabase.from(table).upsert({
        user_id: userId,
        data: snapshot,
        updated_at: new Date().toISOString(),
      });
      if (error) fail(error);
      else { lastPushed = Math.max(lastPushed, snapshot.updatedAt); onStatus('synced'); }
    } catch {
      onStatus('offline');
    } finally {
      inflight = false;
      if (again) { again = false; schedule(); }
    }
  }

  function schedule() {
    if (!userId || disabled) return;
    clearTimeout(timer);
    onStatus('pending');
    timer = setTimeout(push, debounceMs);
  }

  return {
    async start() {
      userId = getUserId();
      if (!userId) { onStatus('offline'); return; }
      try {
        const { data, error } = await supabase.from(table).select('*').eq('user_id', userId).maybeSingle();
        if (error) { fail(error); }
        else if (data && data.data) {
          if (!apply(data.data) && store.getState().updatedAt > (data.data.updatedAt || 0)) schedule();
          else onStatus('synced');
        } else if (store.getState().updatedAt > 0) {
          schedule();
        } else {
          onStatus('synced');
        }
      } catch {
        onStatus('offline');
      }
      if (disabled) return;

      unsubscribe = store.subscribe(() => { if (!applying) schedule(); });
      channel = supabase
        .channel(`${table}_${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, (payload) => {
          const row = payload && payload.new;
          if (row && row.data) apply(row.data);
        })
        .subscribe();
    },

    flush: push,

    async stop() {
      clearTimeout(timer);
      timer = null;
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      if (channel) supabase.removeChannel(channel);
      channel = null;
    },
  };
}
