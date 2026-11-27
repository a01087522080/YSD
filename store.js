/**
 * 합동 비서실 데이터 계층.
 *
 * 같은 인터페이스를 가진 두 가지 저장소를 제공한다.
 *   - LocalStore : localStorage 데모 저장소 (샘플 데이터 포함, 실시간 아님)
 *   - CloudStore : Firebase Realtime Database (여러 피클이 동시에 보는 실시간 저장소)
 *
 * 두 저장소 모두 아래 메서드를 갖는다.
 *   mode, roomName
 *   onMemos(cb) / onTodos(cb) / onFeed(cb) / onPresence(cb)   → 구독 해지 함수 반환
 *   onError(cb)
 *   addMemo({title, body, author, pinned})
 *   setMemoPinned(id, pinned) / deleteMemo(id)
 *   addTodo({text, assignee, author})
 *   setTodoDone(id, done) / deleteTodo(id)
 *   addFeed({name, status, message})
 *   setPresence({id, name, status})
 */

export const STATUSES = {
  idle: { emoji: '🟢', label: '대기 중' },
  working: { emoji: '🔵', label: '작업 중' },
  check: { emoji: '🟡', label: '확인 필요' },
  away: { emoji: '⚪', label: '자리 비움' },
};

export function statusOf(key) {
  return STATUSES[key] || STATUSES.idle;
}

const FIREBASE_BASE = 'https://www.gstatic.com/firebasejs/10.14.1';
const LS_PREFIX = 'joint-office.v1.';

/* ------------------------------------------------------------------ */
/* 작은 이벤트 버스                                                     */
/* ------------------------------------------------------------------ */

function createEmitter() {
  const listeners = new Map();
  return {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return function off() {
        const set = listeners.get(event);
        if (set) set.delete(fn);
      };
    },
    emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      set.forEach(function (fn) {
        try {
          fn(payload);
        } catch (err) {
          console.error('[합동 비서실] 구독 처리 오류', err);
        }
      });
    },
  };
}

function newId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function sortByCreatedDesc(items) {
  return items.slice().sort(function (a, b) {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

/* ------------------------------------------------------------------ */
/* 로컬 저장소 (데모)                                                   */
/* ------------------------------------------------------------------ */

function sampleState() {
  const now = Date.now();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  return {
    memos: [
      {
        id: 'sample-memo-1',
        title: '비서실 문 열었습니다',
        body:
          '각자 피클이 함께 쓰는 공용 작업실이에요. 공지는 "중요 공지로 고정"을 켜 두면 맨 위에 남습니다.',
        author: '하늘',
        pinned: true,
        createdAt: now - 3 * hour,
      },
      {
        id: 'sample-memo-2',
        title: '이번 주 같이 볼 것',
        body: '주간 브리핑 형식 점검, 할 일 담당 나눠 두기. 급한 건 여기 메모로 남겨 주세요.',
        author: '나래',
        pinned: false,
        createdAt: now - 50 * minute,
      },
    ],
    todos: [
      {
        id: 'sample-todo-1',
        text: '주간 브리핑 형식 맞추기',
        assignee: '하늘',
        author: '하늘',
        done: false,
        createdAt: now - 2 * hour,
        doneAt: 0,
      },
      {
        id: 'sample-todo-2',
        text: '비서실 링크를 다른 피클에게 공유',
        assignee: '나래',
        author: '나래',
        done: true,
        createdAt: now - 5 * hour,
        doneAt: now - 4 * hour,
      },
      {
        id: 'sample-todo-3',
        text: '할 일 목록에 담당 피클 붙여 보기',
        assignee: '',
        author: '나래',
        done: false,
        createdAt: now - 20 * minute,
        doneAt: 0,
      },
    ],
    feed: [
      {
        id: 'sample-feed-1',
        name: '하늘',
        status: 'working',
        message: '브리핑 정리 중이에요. 30분 뒤에 공유할게요.',
        createdAt: now - 18 * minute,
      },
      {
        id: 'sample-feed-2',
        name: '나래',
        status: 'check',
        message: '메모 두 번째 줄 확인 부탁드려요.',
        createdAt: now - 6 * minute,
      },
    ],
    presence: {
      'sample-presence-1': { name: '하늘', status: 'working', updatedAt: now - 18 * minute },
      'sample-presence-2': { name: '나래', status: 'check', updatedAt: now - 6 * minute },
    },
  };
}

export class LocalStore {
  constructor(options) {
    const opts = options || {};
    this.mode = 'local';
    this.roomId = opts.roomId || 'joint-office';
    this.reason = opts.reason || 'not-configured';
    this.key = LS_PREFIX + this.roomId;
    this.ev = createEmitter();
    this.state = this._load();
  }

  _load() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(this.key);
    } catch (err) {
      console.warn('[합동 비서실] localStorage를 읽을 수 없습니다.', err);
    }
    if (!raw) {
      const seeded = sampleState();
      this._save(seeded);
      return seeded;
    }
    try {
      const parsed = JSON.parse(raw);
      return {
        memos: Array.isArray(parsed.memos) ? parsed.memos : [],
        todos: Array.isArray(parsed.todos) ? parsed.todos : [],
        feed: Array.isArray(parsed.feed) ? parsed.feed : [],
        presence: parsed.presence && typeof parsed.presence === 'object' ? parsed.presence : {},
      };
    } catch (err) {
      console.warn('[합동 비서실] 저장된 데이터가 손상되어 새로 시작합니다.', err);
      const seeded = sampleState();
      this._save(seeded);
      return seeded;
    }
  }

  _save(next) {
    if (next) this.state = next;
    try {
      window.localStorage.setItem(this.key, JSON.stringify(this.state));
    } catch (err) {
      console.warn('[합동 비서실] localStorage에 저장하지 못했습니다.', err);
    }
  }

  _changed(collection) {
    this.ev.emit(collection, this.state[collection]);
  }

  /* 구독 ---------------------------------------------------------- */

  _subscribe(collection, cb) {
    const off = this.ev.on(collection, cb);
    cb(this.state[collection]);
    return off;
  }

  onMemos(cb) {
    return this._subscribe('memos', cb);
  }
  onTodos(cb) {
    return this._subscribe('todos', cb);
  }
  onFeed(cb) {
    return this._subscribe('feed', cb);
  }
  onPresence(cb) {
    return this._subscribe('presence', cb);
  }
  onError() {
    return function noop() {};
  }

  /* 쓰기 ---------------------------------------------------------- */

  async addMemo(memo) {
    const item = {
      id: newId(),
      title: String(memo.title || '').trim(),
      body: String(memo.body || '').trim(),
      author: String(memo.author || '').trim() || '이름 없는 피클',
      pinned: !!memo.pinned,
      createdAt: Date.now(),
    };
    this.state.memos = this.state.memos.concat([item]);
    this._save();
    this._changed('memos');
    return item;
  }

  async setMemoPinned(id, pinned) {
    this.state.memos = this.state.memos.map(function (m) {
      return m.id === id ? Object.assign({}, m, { pinned: !!pinned }) : m;
    });
    this._save();
    this._changed('memos');
  }

  async deleteMemo(id) {
    this.state.memos = this.state.memos.filter(function (m) {
      return m.id !== id;
    });
    this._save();
    this._changed('memos');
  }

  async addTodo(todo) {
    const item = {
      id: newId(),
      text: String(todo.text || '').trim(),
      assignee: String(todo.assignee || '').trim(),
      author: String(todo.author || '').trim() || '이름 없는 피클',
      done: false,
      createdAt: Date.now(),
      doneAt: 0,
    };
    this.state.todos = this.state.todos.concat([item]);
    this._save();
    this._changed('todos');
    return item;
  }

  async setTodoDone(id, done) {
    const now = Date.now();
    this.state.todos = this.state.todos.map(function (t) {
      return t.id === id
        ? Object.assign({}, t, { done: !!done, doneAt: done ? now : 0 })
        : t;
    });
    this._save();
    this._changed('todos');
  }

  async deleteTodo(id) {
    this.state.todos = this.state.todos.filter(function (t) {
      return t.id !== id;
    });
    this._save();
    this._changed('todos');
  }

  async addFeed(entry) {
    const item = {
      id: newId(),
      name: String(entry.name || '').trim() || '이름 없는 피클',
      status: STATUSES[entry.status] ? entry.status : 'idle',
      message: String(entry.message || '').trim(),
      createdAt: Date.now(),
    };
    this.state.feed = sortByCreatedDesc(this.state.feed.concat([item])).slice(0, 200);
    this._save();
    this._changed('feed');
    return item;
  }

  async setPresence(presence) {
    const id = presence.id;
    const next = Object.assign({}, this.state.presence);
    next[id] = {
      name: String(presence.name || '').trim() || '이름 없는 피클',
      status: STATUSES[presence.status] ? presence.status : 'idle',
      updatedAt: Date.now(),
    };
    this.state.presence = next;
    this._save();
    this._changed('presence');
  }
}

/* ------------------------------------------------------------------ */
/* Firebase Realtime Database 저장소                                    */
/* ------------------------------------------------------------------ */

class CloudStore {
  constructor(deps) {
    this.mode = 'cloud';
    this.api = deps.api;
    this.db = deps.database;
    this.roomId = deps.roomId;
    this.base = 'rooms/' + deps.roomId;
    this.ev = createEmitter();
    this._presenceHooked = false;
  }

  _ref(path) {
    return this.api.ref(this.db, path);
  }

  onError(cb) {
    return this.ev.on('error', cb);
  }

  _watch(path, event, cb, limit) {
    const target = this._ref(path);
    const watched = limit ? this.api.query(target, this.api.limitToLast(limit)) : target;
    const self = this;
    const unsubscribe = this.api.onValue(
      watched,
      function (snapshot) {
        const value = snapshot.val() || {};
        const items = Object.keys(value).map(function (key) {
          const row = value[key] || {};
          return Object.assign({ id: key }, row);
        });
        self.ev.emit(event, items);
      },
      function (error) {
        console.error('[합동 비서실] DB 구독 오류', path, error);
        self.ev.emit('error', { path: path, error: error });
      }
    );
    const off = this.ev.on(event, cb);
    return function stop() {
      off();
      unsubscribe();
    };
  }

  onMemos(cb) {
    return this._watch(this.base + '/memos', 'memos', cb);
  }
  onTodos(cb) {
    return this._watch(this.base + '/todos', 'todos', cb);
  }
  onFeed(cb) {
    return this._watch(this.base + '/feed', 'feed', cb, 200);
  }
  onPresence(cb) {
    return this._watch(this.base + '/presence', 'presence', cb);
  }

  async addMemo(memo) {
    const item = {
      title: String(memo.title || '').trim(),
      body: String(memo.body || '').trim(),
      author: String(memo.author || '').trim() || '이름 없는 피클',
      pinned: !!memo.pinned,
      createdAt: Date.now(),
    };
    const r = this.api.push(this._ref(this.base + '/memos'));
    await this.api.set(r, item);
    return Object.assign({ id: r.key }, item);
  }

  async setMemoPinned(id, pinned) {
    await this.api.update(this._ref(this.base + '/memos/' + id), { pinned: !!pinned });
  }

  async deleteMemo(id) {
    await this.api.remove(this._ref(this.base + '/memos/' + id));
  }

  async addTodo(todo) {
    const item = {
      text: String(todo.text || '').trim(),
      assignee: String(todo.assignee || '').trim(),
      author: String(todo.author || '').trim() || '이름 없는 피클',
      done: false,
      createdAt: Date.now(),
      doneAt: 0,
    };
    const r = this.api.push(this._ref(this.base + '/todos'));
    await this.api.set(r, item);
    return Object.assign({ id: r.key }, item);
  }

  async setTodoDone(id, done) {
    await this.api.update(this._ref(this.base + '/todos/' + id), {
      done: !!done,
      doneAt: done ? Date.now() : 0,
    });
  }

  async deleteTodo(id) {
    await this.api.remove(this._ref(this.base + '/todos/' + id));
  }

  async addFeed(entry) {
    const item = {
      name: String(entry.name || '').trim() || '이름 없는 피클',
      status: STATUSES[entry.status] ? entry.status : 'idle',
      message: String(entry.message || '').trim(),
      createdAt: Date.now(),
    };
    const r = this.api.push(this._ref(this.base + '/feed'));
    await this.api.set(r, item);
    return Object.assign({ id: r.key }, item);
  }

  async setPresence(presence) {
    const r = this._ref(this.base + '/presence/' + presence.id);
    if (!this._presenceHooked) {
      // 창을 닫거나 연결이 끊기면 내 상태 표시를 지운다.
      this.api.onDisconnect(r).remove();
      this._presenceHooked = true;
    }
    await this.api.set(r, {
      name: String(presence.name || '').trim() || '이름 없는 피클',
      status: STATUSES[presence.status] ? presence.status : 'idle',
      updatedAt: Date.now(),
    });
  }
}

/* ------------------------------------------------------------------ */
/* 팩토리                                                              */
/* ------------------------------------------------------------------ */

export async function createStore(options) {
  const opts = options || {};
  const roomId = opts.roomId || 'joint-office';

  if (!opts.isConfigured) {
    return new LocalStore({ roomId: roomId, reason: 'not-configured' });
  }

  try {
    const mods = await Promise.all([
      import(FIREBASE_BASE + '/firebase-app.js'),
      import(FIREBASE_BASE + '/firebase-database.js'),
    ]);
    const appMod = mods[0];
    const dbMod = mods[1];
    const app = appMod.initializeApp(opts.firebaseConfig);
    const database = dbMod.getDatabase(app);
    return new CloudStore({ api: dbMod, database: database, roomId: roomId });
  } catch (err) {
    console.error('[합동 비서실] Firebase 연결에 실패해 로컬 모드로 시작합니다.', err);
    return new LocalStore({ roomId: roomId, reason: 'firebase-error' });
  }
}
