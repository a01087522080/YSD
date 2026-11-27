/**
 * 합동 비서실 — 화면 로직
 * 빌드 도구 없이 ES 모듈만으로 동작합니다.
 */

import {
  isFirebaseReady,
  firebaseConfig,
  roomId,
  roomName,
} from './firebase-config.js';
import { createStore, LocalStore, STATUSES, statusOf } from './store.js';

const PROFILE_KEY = 'joint-office.profile.v1';
const PRESENCE_KEY = 'joint-office.presenceId';
const THEME_KEY = 'joint-office.theme';
const DEFAULT_NAME = '내 피클';

const state = {
  store: null,
  memos: [],
  todos: [],
  feed: [],
  presence: {},
  todoFilter: 'all',
  profile: { name: DEFAULT_NAME, status: 'idle' },
  presenceId: '',
  switchedToLocal: false,
};

function $(id) {
  return document.getElementById(id);
}

/* ------------------------------------------------------------------ */
/* 저장된 내 설정                                                      */
/* ------------------------------------------------------------------ */

function loadProfile() {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return { name: DEFAULT_NAME, status: 'idle' };
    const parsed = JSON.parse(raw);
    return {
      name: String(parsed.name || '').trim() || DEFAULT_NAME,
      status: STATUSES[parsed.status] ? parsed.status : 'idle',
    };
  } catch (err) {
    return { name: DEFAULT_NAME, status: 'idle' };
  }
}

function saveProfile() {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile));
  } catch (err) {
    /* 저장 실패는 화면 동작에 영향을 주지 않는다 */
  }
}

function loadPresenceId() {
  try {
    let id = window.localStorage.getItem(PRESENCE_KEY);
    if (!id) {
      id = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      window.localStorage.setItem(PRESENCE_KEY, id);
    }
    return id;
  } catch (err) {
    return 'p' + Math.random().toString(36).slice(2, 10);
  }
}

/* ------------------------------------------------------------------ */
/* 작은 도구                                                           */
/* ------------------------------------------------------------------ */

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function hhmm(date) {
  return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

function formatTime(ts) {
  const value = Number(ts) || 0;
  if (!value) return '';
  const now = Date.now();
  const diff = now - value;
  if (diff < 0) return '방금 전';
  if (diff < 60 * 1000) return '방금 전';
  if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + '분 전';

  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return '오늘 ' + hhmm(date);

  const yesterday = new Date(now - 24 * 60 * 60 * 1000);
  if (date.toDateString() === yesterday.toDateString()) return '어제 ' + hhmm(date);

  const sameYear = date.getFullYear() === today.getFullYear();
  const head = sameYear
    ? date.getMonth() + 1 + '월 ' + date.getDate() + '일'
    : date.getFullYear() + '. ' + (date.getMonth() + 1) + '. ' + date.getDate() + '.';
  return head + ' ' + hhmm(date);
}

let toastTimer = 0;
function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.hidden = false;
  // 다음 프레임에 클래스를 붙여 전환 효과를 준다.
  window.requestAnimationFrame(function () {
    node.classList.add('is-visible');
  });
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(function () {
    node.classList.remove('is-visible');
    window.setTimeout(function () {
      node.hidden = true;
    }, 220);
  }, 2600);
}

function initials(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '?';
  return trimmed.slice(0, 1);
}

function timeNode(ts) {
  const span = document.createElement('span');
  span.dataset.ts = String(ts || '');
  span.textContent = formatTime(ts);
  return span;
}

function updateTimestamps() {
  const nodes = document.querySelectorAll('[data-ts]');
  Array.prototype.forEach.call(nodes, function (node) {
    node.textContent = formatTime(node.dataset.ts);
  });
}

/* ------------------------------------------------------------------ */
/* 헤더 · 프로필                                                       */
/* ------------------------------------------------------------------ */

function renderConnection() {
  const badge = $('connBadge');
  const label = $('connLabel');
  const live = state.store && state.store.mode === 'cloud';
  badge.dataset.state = live ? 'live' : 'local';
  label.textContent = live ? '연결됨' : '로컬 미리보기 모드';

  const banner = $('modeBanner');
  if (live) {
    banner.hidden = true;
  } else {
    banner.hidden = false;
    $('modeBannerText').textContent = state.switchedToLocal
      ? '실시간 DB에 연결하지 못해 로컬 저장소로 동작 중이에요'
      : '실시간 DB 연결 준비 중 · 현재 로컬 저장소로 동작 중';
  }
  $('footMode').textContent = live ? '실시간 연결됨' : '로컬 미리보기 모드';
}

function renderProfile() {
  const status = statusOf(state.profile.status);
  $('profileAvatar').textContent = initials(state.profile.name);
  $('profileSummary').textContent = state.profile.name + ' · ' + status.emoji + ' ' + status.label;
  const nameInput = $('profileName');
  if (document.activeElement !== nameInput) nameInput.value = state.profile.name;
  $('memoAuthorHint').textContent = state.profile.name;
  $('feedAuthorHint').textContent = state.profile.name;

  const options = document.querySelectorAll('.status-opt');
  Array.prototype.forEach.call(options, function (btn) {
    btn.setAttribute('aria-checked', btn.dataset.status === state.profile.status ? 'true' : 'false');
  });

  $('feedStatus').value = state.profile.status;
}

async function pushPresence() {
  if (!state.store) return;
  try {
    await state.store.setPresence({
      id: state.presenceId,
      name: state.profile.name,
      status: state.profile.status,
    });
  } catch (err) {
    console.error('[합동 비서실] 상태 전송 실패', err);
  }
}

function onProfileChanged() {
  saveProfile();
  renderProfile();
  pushPresence();
}

/* ------------------------------------------------------------------ */
/* 공지 · 메모                                                         */
/* ------------------------------------------------------------------ */

function renderMemos() {
  const list = $('memoList');
  list.textContent = '';

  const items = state.memos.slice().sort(function (a, b) {
    const pinnedDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    if (pinnedDiff !== 0) return pinnedDiff;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  $('memoCount').textContent = String(items.length);
  $('memoEmpty').hidden = items.length > 0;

  items.forEach(function (memo) {
    const li = document.createElement('li');
    li.className = 'memo' + (memo.pinned ? ' is-pinned' : '');

    const top = document.createElement('div');
    top.className = 'memo-top';

    const title = document.createElement('h3');
    title.className = 'memo-title';
    title.textContent = memo.title || '(제목 없음)';
    top.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'mini-btn';
    pin.textContent = '📌';
    pin.title = memo.pinned ? '고정 해제' : '중요 공지로 고정';
    pin.setAttribute('aria-pressed', memo.pinned ? 'true' : 'false');
    pin.addEventListener('click', function () {
      state.store.setMemoPinned(memo.id, !memo.pinned).catch(reportWriteError);
    });
    actions.appendChild(pin);

    actions.appendChild(
      makeDeleteButton(function () {
        state.store.deleteMemo(memo.id).then(function () {
          toast('메모를 지웠어요');
        }).catch(reportWriteError);
      })
    );

    top.appendChild(actions);
    li.appendChild(top);

    if (memo.body) {
      const body = document.createElement('p');
      body.className = 'memo-body';
      body.textContent = memo.body;
      li.appendChild(body);
    }

    const meta = document.createElement('div');
    meta.className = 'memo-meta';
    const author = document.createElement('span');
    author.textContent = 'by ' + (memo.author || '이름 없는 피클');
    meta.appendChild(author);
    const sep = document.createElement('span');
    sep.className = 'dot-sep';
    meta.appendChild(sep);
    meta.appendChild(timeNode(memo.createdAt));
    li.appendChild(meta);

    list.appendChild(li);
  });
}

/* ------------------------------------------------------------------ */
/* 공동 할 일                                                          */
/* ------------------------------------------------------------------ */

function renderTodos() {
  const list = $('todoList');
  list.textContent = '';

  const all = state.todos.slice();
  const filtered = all.filter(function (todo) {
    if (state.todoFilter === 'open') return !todo.done;
    if (state.todoFilter === 'done') return !!todo.done;
    return true;
  });

  filtered.sort(function (a, b) {
    const doneDiff = (a.done ? 1 : 0) - (b.done ? 1 : 0);
    if (doneDiff !== 0) return doneDiff;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const openCount = all.filter(function (t) {
    return !t.done;
  }).length;
  $('todoCount').textContent = String(openCount);
  $('todoCount').title = '진행 중인 할 일';

  $('todoEmpty').hidden = filtered.length > 0;
  $('todoEmpty').textContent =
    all.length === 0
      ? '할 일이 없어요. 비서실에서 함께 할 일을 더해 보세요.'
      : state.todoFilter === 'open'
        ? '진행 중인 할 일이 없어요.'
        : state.todoFilter === 'done'
          ? '완료한 일이 아직 없어요.'
          : '표시할 할 일이 없어요.';

  filtered.forEach(function (todo) {
    const li = document.createElement('li');
    li.className = 'todo' + (todo.done ? ' is-done' : '');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'todo-check';
    check.checked = !!todo.done;
    check.setAttribute('aria-label', (todo.done ? '완료 취소: ' : '완료로 표시: ') + todo.text);
    check.addEventListener('change', function () {
      state.store.setTodoDone(todo.id, check.checked).catch(reportWriteError);
    });
    li.appendChild(check);

    const main = document.createElement('div');
    main.className = 'todo-main';

    const text = document.createElement('p');
    text.className = 'todo-text';
    text.textContent = todo.text;
    main.appendChild(text);

    const meta = document.createElement('div');
    meta.className = 'todo-meta';
    if (todo.assignee) {
      const tag = document.createElement('span');
      tag.className = 'assignee';
      tag.textContent = todo.assignee;
      meta.appendChild(tag);
    }
    const author = document.createElement('span');
    author.textContent = todo.author || '';
    if (todo.author && todo.author !== todo.assignee) {
      if (todo.assignee) author.className = 'dot-sep';
      meta.appendChild(author);
    }
    meta.appendChild(timeNode(todo.done && todo.doneAt ? todo.doneAt : todo.createdAt));
    main.appendChild(meta);

    li.appendChild(main);

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.appendChild(
      makeDeleteButton(function () {
        state.store.deleteTodo(todo.id).then(function () {
          toast('할 일을 지웠어요');
        }).catch(reportWriteError);
      })
    );
    li.appendChild(actions);

    list.appendChild(li);
  });
}

/* ------------------------------------------------------------------ */
/* 피클 상태 · 피드                                                    */
/* ------------------------------------------------------------------ */

const PRESENCE_ORDER = { working: 0, check: 1, idle: 2, away: 3 };

function renderPresence() {
  const wrap = $('presenceChips');
  wrap.textContent = '';

  const nameList = $('pickleNames');
  nameList.textContent = '';

  const map = state.presence || {};
  const entries = Object.keys(map).map(function (key) {
    return Object.assign({ id: key }, map[key] || {});
  });

  entries.sort(function (a, b) {
    const ao = PRESENCE_ORDER[a.status] === undefined ? 9 : PRESENCE_ORDER[a.status];
    const bo = PRESENCE_ORDER[b.status] === undefined ? 9 : PRESENCE_ORDER[b.status];
    if (ao !== bo) return ao - bo;
    return String(a.name) < String(b.name) ? -1 : 1;
  });

  $('pickleNames').textContent = '';
  entries.forEach(function (entry) {

    const status = statusOf(entry.status);

    const chip = document.createElement('span');
    chip.className = 'pickle-chip' + (entry.id === state.presenceId ? ' is-me' : '');
    chip.dataset.status = STATUSES[entry.status] ? entry.status : 'idle';

    const emoji = document.createElement('span');
    emoji.className = 'emoji';
    emoji.textContent = status.emoji;
    chip.appendChild(emoji);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.name || '이름 없는 피클';
    chip.appendChild(name);

    const label = document.createElement('span');
    label.className = 'st-label';
    label.textContent = status.label;
    chip.appendChild(label);

    chip.title = (entry.name || '') + ' · ' + status.label;
    wrap.appendChild(chip);

    if (entry.name) {
      const option = document.createElement('option');
      option.value = entry.name;
      nameList.appendChild(option);
    }
  });
}

function renderFeed() {
  const list = $('feedList');
  list.textContent = '';

  const items = state.feed.slice().sort(function (a, b) {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  $('feedEmpty').hidden = items.length > 0;

  items.forEach(function (item) {
    const status = statusOf(item.status);

    const li = document.createElement('li');
    li.className = 'feed-item';

    const avatar = document.createElement('div');
    avatar.className = 'feed-avatar';
    avatar.textContent = status.emoji;
    li.appendChild(avatar);

    const main = document.createElement('div');

    const head = document.createElement('div');
    head.className = 'feed-head';

    const name = document.createElement('span');
    name.className = 'feed-name';
    name.textContent = item.name || '이름 없는 피클';
    head.appendChild(name);

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.dataset.status = STATUSES[item.status] ? item.status : 'idle';
    badge.textContent = status.emoji + ' ' + status.label;
    head.appendChild(badge);

    const time = timeNode(item.createdAt);
    time.className = 'feed-time';
    head.appendChild(time);

    main.appendChild(head);

    if (item.message) {
      const msg = document.createElement('p');
      msg.className = 'feed-msg';
      msg.textContent = item.message;
      main.appendChild(msg);
    }

    li.appendChild(main);
    list.appendChild(li);
  });
}

/* ------------------------------------------------------------------ */
/* 삭제 버튼 (한 번 더 눌러 확인)                                       */
/* ------------------------------------------------------------------ */

function makeDeleteButton(onConfirm) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mini-btn danger';
  btn.textContent = '✕';
  btn.title = '삭제';
  btn.setAttribute('aria-label', '삭제');
  btn.addEventListener('click', function () {
    if (btn.dataset.armed === '1') {
      onConfirm();
      return;
    }
    btn.dataset.armed = '1';
    btn.classList.add('confirm');
    btn.textContent = '삭제?';
    btn.title = '한 번 더 누르면 삭제됩니다';
    window.setTimeout(function () {
      if (!document.body.contains(btn)) return;
      btn.dataset.armed = '0';
      btn.classList.remove('confirm');
      btn.textContent = '✕';
      btn.title = '삭제';
    }, 6000);
  });
  return btn;
}

/* ------------------------------------------------------------------ */
/* 오류 처리 · 모드 전환                                               */
/* ------------------------------------------------------------------ */

function reportWriteError(err) {
  console.error('[합동 비서실] 저장 실패', err);
  toast('저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
}

function attachStore(store) {
  state.store = store;
  renderConnection();

  store.onMemos(function (items) {
    state.memos = items || [];
    renderMemos();
  });
  store.onTodos(function (items) {
    state.todos = items || [];
    renderTodos();
  });
  store.onFeed(function (items) {
    state.feed = items || [];
    renderFeed();
  });
  store.onPresence(function (map) {
    state.presence = map || {};
    renderPresence();
  });
  store.onError(function () {
    if (state.store.mode !== 'cloud' || state.switchedToLocal) return;
    state.switchedToLocal = true;
    attachStore(new LocalStore({ roomId: roomId, reason: 'firebase-error' }));
    toast('실시간 연결이 끊겨 로컬 저장소로 이어서 동작해요');
  });

  pushPresence();
}

/* ------------------------------------------------------------------ */
/* 이벤트 연결                                                          */
/* ------------------------------------------------------------------ */

function bindTabs() {
  const tabs = document.querySelectorAll('.tab');
  Array.prototype.forEach.call(tabs, function (tab) {
    tab.addEventListener('click', function () {
      const target = tab.dataset.tab;
      Array.prototype.forEach.call(tabs, function (other) {
        const active = other === tab;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      ['memos', 'todos', 'feed'].forEach(function (name) {
        const panel = $('panel-' + name);
        panel.classList.toggle('is-active', name === target);
      });
    });
  });
}

function bindProfile() {
  const toggle = $('profileToggle');
  const panel = $('profilePanel');

  toggle.addEventListener('click', function () {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    panel.hidden = open;
    if (!open) $('profileName').focus();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (toggle.getAttribute('aria-expanded') !== 'true') return;
    toggle.setAttribute('aria-expanded', 'false');
    panel.hidden = true;
    toggle.focus();
  });

  $('profileName').addEventListener('input', function (event) {
    const value = String(event.target.value || '').trim();
    state.profile.name = value || DEFAULT_NAME;
    saveProfile();
    renderProfile();
  });

  $('profileName').addEventListener('blur', function () {
    if (!String($('profileName').value || '').trim()) {
      $('profileName').value = state.profile.name;
    }
    pushPresence();
  });

  const options = document.querySelectorAll('.status-opt');
  Array.prototype.forEach.call(options, function (btn) {
    btn.addEventListener('click', function () {
      state.profile.status = STATUSES[btn.dataset.status] ? btn.dataset.status : 'idle';
      onProfileChanged();
    });
  });
}

function bindTheme() {
  const button = $('themeToggle');
  function paint(theme) {
    document.documentElement.dataset.theme = theme;
    button.textContent = theme === 'dark' ? '☀️' : '🌙';
    button.setAttribute('aria-label', theme === 'dark' ? '밝은 화면으로 바꾸기' : '어두운 화면으로 바꾸기');
  }
  let saved = null;
  try {
    saved = window.localStorage.getItem(THEME_KEY);
  } catch (err) {
    saved = null;
  }
  const prefersDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  paint(saved === 'dark' || saved === 'light' ? saved : prefersDark ? 'dark' : 'light');

  button.addEventListener('click', function () {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    paint(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch (err) {
      /* 저장 실패는 무시 */
    }
  });
}

function bindMemos() {
  const form = $('memoForm');
  const toggle = $('memoComposeToggle');

  toggle.addEventListener('click', function () {
    const hidden = form.hidden;
    form.hidden = !hidden;
    toggle.setAttribute('aria-expanded', hidden ? 'true' : 'false');
    toggle.textContent = hidden ? '접기' : '+ 새 메모';
    if (hidden) $('memoTitle').focus();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const title = String($('memoTitle').value || '').trim();
    if (!title) {
      $('memoTitle').focus();
      return;
    }
    const body = String($('memoBody').value || '').trim();
    const pinned = $('memoPinned').checked;

    state.store
      .addMemo({ title: title, body: body, author: state.profile.name, pinned: pinned })
      .then(function () {
        $('memoTitle').value = '';
        $('memoBody').value = '';
        $('memoPinned').checked = false;
        form.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = '+ 새 메모';
        toast(pinned ? '중요 공지로 올렸어요' : '메모를 올렸어요');
      })
      .catch(reportWriteError);
  });
}

function bindTodos() {
  const form = $('todoForm');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const text = String($('todoText').value || '').trim();
    if (!text) {
      $('todoText').focus();
      return;
    }
    const assignee = String($('todoAssignee').value || '').trim();
    state.store
      .addTodo({ text: text, assignee: assignee, author: state.profile.name })
      .then(function () {
        $('todoText').value = '';
        $('todoText').focus();
        toast('할 일을 더했어요');
      })
      .catch(reportWriteError);
  });

  const filters = $('todoFilters');
  filters.addEventListener('click', function (event) {
    const button = event.target.closest ? event.target.closest('.chip') : null;
    if (!button) return;
    state.todoFilter = button.dataset.filter || 'all';
    Array.prototype.forEach.call(filters.querySelectorAll('.chip'), function (chip) {
      chip.classList.toggle('is-active', chip === button);
    });
    renderTodos();
  });
}

function bindFeed() {
  const form = $('feedForm');

  $('feedStatus').addEventListener('change', function (event) {
    state.profile.status = STATUSES[event.target.value] ? event.target.value : 'idle';
    onProfileChanged();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const message = String($('feedMessage').value || '').trim();
    const status = STATUSES[state.profile.status] ? state.profile.status : 'idle';

    if (!message) {
      pushPresence();
      toast('상태를 바꿨어요');
      return;
    }

    state.store
      .addFeed({ name: state.profile.name, status: status, message: message })
      .then(function () {
        $('feedMessage').value = '';
        if (state.feed.length > 0) $('feedList').scrollTop = 0;
        toast('한마디를 남겼어요');
      })
      .catch(reportWriteError);

    pushPresence();
  });
}

/* ------------------------------------------------------------------ */
/* 시작                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  state.profile = loadProfile();
  state.presenceId = loadPresenceId();

  $('roomName').textContent = roomName;
  document.title = '🏢 합동 비서실 · ' + roomName;

  bindTheme();
  bindTabs();
  bindProfile();
  bindMemos();
  bindTodos();
  bindFeed();
  renderProfile();

  window.setInterval(updateTimestamps, 30000);

  const store = await createStore({
    isConfigured: isFirebaseReady(),
    firebaseConfig: firebaseConfig,
    roomId: roomId,
  });

  attachStore(store);
  renderProfile();

  if (store.mode === 'local' && store.reason === 'firebase-error') {
    toast('실시간 DB에 연결하지 못해 로컬 미리보기로 시작했어요');
  }
}

main().catch(function (err) {
  console.error('[합동 비서실] 시작 오류', err);
  const banner = $('modeBanner');
  banner.hidden = false;
  $('modeBannerText').textContent = '앱을 시작하지 못했어요. 페이지를 새로 고쳐 주세요.';
});
