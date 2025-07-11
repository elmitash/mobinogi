// import { generateSyncId, getOrCreateSyncId, getShortCode, exportDataCode, importDataCode } from './sync.js';
// 동기화 및 DB 관련 함수는 sync.js에서 window에 등록하여 사용

// 캐릭터 및 해야할 일 정보
const MAX_CHARACTERS = 5;
const FIELD_BOSSES = [
  { id: 'pery', name: '페리' },
  { id: 'crab', name: '크라브바흐' },
  { id: 'krama', name: '크라마' },
  { id: 'drohe', name: '드로흐에넴' }
];
const DAILY_TASKS = [
  { id: 'dailyfree', name: '매일 무료 상품', type: 'servercheck' },
  { id: 'blackhole', name: '검은구멍(남은횟수)', type: 'select-count', max: 3 },
  { id: 'ominous', name: '불길한 결계(남은횟수)', type: 'select-count', max: 2 },
  { id: 'fergus', name: '퍼거스 교환', type: 'check' },
  { id: 'neris', name: '네리스 교환', type: 'check' }
];
const WEEKLY_TASKS = [
  { id: 'fieldboss', name: '주간 필드보스', type: 'fieldboss-group' },
  { id: 'abyss', name: '어비스 던전', type: 'check' },
  { id: 'glas', name: '글라스기브넨 레이드', type: 'check' },
  { id: 'succubus', name: '서큐버스 레이드', type: 'check' }
];

// API 서버 주소: 도메인에 따라 자동 선택
let API_BASE;
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  API_BASE = 'http://localhost/api.php';
} else {
  API_BASE = 'https://mobinogi.elmi.page/api.php';
}

let characters = [];
let userDailyTasks = [];
let userWeeklyTasks = [];
let lastReset = { daily: null, weekly: null };
let removedDailyTaskIds = [];
let removedWeeklyTaskIds = [];
let showDeleteButtons = [];

// 현재 세션에서 사용할 동기화 코드(숏코드) 변수
let CURRENT_SYNC_CODE = window.getShortCode ? window.getShortCode() : '';

// API로 데이터 불러오기
async function loadData() {
  const syncId = CURRENT_SYNC_CODE;
  if (!syncId) {
    // 동기화 코드가 없으면 서버 요청 없이 초기화만 수행
    characters = [];
    userDailyTasks = [];
    userWeeklyTasks = [];
    removedDailyTaskIds = [];
    removedWeeklyTaskIds = [];
    lastReset = { daily: null, weekly: null };
    autoResetTasks();
    return;
  }
  try {
    const res = await fetch(`${API_BASE}?action=data&sync_id=${syncId}`);
    if (!res.ok) throw new Error('데이터 없음');
    const result = await res.json();
    const parsed = result.data;
    if (Array.isArray(parsed)) {
      characters = parsed;
      userDailyTasks = [];
      userWeeklyTasks = [];
      removedDailyTaskIds = [];
      removedWeeklyTaskIds = [];
      lastReset = { daily: null, weekly: null };
    } else {
      characters = parsed.characters || [];
      userDailyTasks = parsed.userDailyTasks || [];
      userWeeklyTasks = parsed.userWeeklyTasks || [];
      removedDailyTaskIds = parsed.removedDailyTaskIds || [];
      removedWeeklyTaskIds = parsed.removedWeeklyTaskIds || [];
      lastReset = parsed.lastReset || { daily: null, weekly: null };
    }
  } catch (e) {
    // 서버에 데이터가 없으면 초기화
    characters = [];
    userDailyTasks = [];
    userWeeklyTasks = [];
    removedDailyTaskIds = [];
    removedWeeklyTaskIds = [];
    lastReset = { daily: null, weekly: null };
  }
  autoResetTasks();
}

// API로 데이터 저장
async function saveData() {
  // 캐릭터가 1명 이상이거나, 기존에 저장된 데이터가 있을 때만 저장
  if (!characters || characters.length === 0) {
    // 캐릭터가 0명이고, 기존에 서버에 저장된 데이터가 없으면 저장하지 않음
    // (즉, 최초 접속 시에는 saveData를 호출하지 않음)
    // 단, 캐릭터가 0명인데 기존에 서버에 데이터가 있으면 삭제는 deleteCharacter에서 처리함
    return;
  }
  const syncId = CURRENT_SYNC_CODE;
  const shortCode = CURRENT_SYNC_CODE;
  const data = { characters, userDailyTasks, userWeeklyTasks, removedDailyTaskIds, removedWeeklyTaskIds, lastReset };
  try {
    await fetch(`${API_BASE}?action=data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sync_id: syncId, short_code: shortCode, data })
    });
  } catch (e) {
    alert('서버 저장 실패! 네트워크를 확인하세요.');
  }
}

function autoResetTasks() {
  const now = new Date();
  // 일일 초기화: 오늘 오전 6시
  const today6 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0, 0);
  if (now < today6) today6.setDate(today6.getDate() - 1); // 6시 전이면 전날 6시
  // 주간 초기화: 이번주 월요일 오전 6시
  const monday6 = new Date(today6);
  monday6.setDate(today6.getDate() - ((today6.getDay() + 6) % 7));
  // KST 변환 함수
  function toKSTISOString(date) {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().replace('Z', '+09:00');
  }
  // 일일 퀘스트 초기화
  if (!lastReset.daily || new Date(lastReset.daily) < today6) {
    characters.forEach(char => {
      if (!char.tasks) return;
      // 기본 일일 퀘스트
      DAILY_TASKS.forEach(task => {
        if (task.type === 'select-count') {
          char.tasks[task.id] = task.max;
        } else {
          delete char.tasks[task.id];
        }
      });
      // 사용자 추가 일일 퀘스트
      userDailyTasks.forEach((_, tIdx) => { delete char.tasks[`user-daily-${tIdx}`]; });
    });
    lastReset.daily = toKSTISOString(today6);
    if (characters.length > 0) saveData();
  }
  // 주간 초기화: 이번주 월요일 오전 6시
  if (!lastReset.weekly || new Date(lastReset.weekly) < monday6) {
    characters.forEach(char => {
      if (!char.tasks) return;
      // 주간 퀘스트
      WEEKLY_TASKS.forEach(task => { delete char.tasks[task.id]; });
      // 필드보스 체크
      FIELD_BOSSES.forEach(boss => { delete char.tasks[boss.id]; });
    });
    lastReset.weekly = toKSTISOString(monday6);
    if (characters.length > 0) saveData();
  }
}

function renderCharacters() {
  const row = document.getElementById('character-row');
  row.innerHTML = '';
  // 캐릭터 박스 렌더링
  for (let i = 0; i < characters.length; i++) {
    const char = characters[i] || { name: '', tasks: {} };
    if (showDeleteButtons[i] === undefined) showDeleteButtons[i] = false;
    const col = document.createElement('div');
    col.className = 'col-md-2 mb-3';
    col.innerHTML = `
      <div class="card h-100">
        <div class="card-body text-center bg-light dark-bg">
          <div class="mb-2 d-flex align-items-center justify-content-center gap-2">
            <span class="fw-bold" id="char-name-${i}">${char.name}</span>
            <button class="btn btn-sm btn-outline-secondary" onclick="editName(${i})">수정</button>
          </div>
          <ul class="list-group list-group-flush" id="char-task-list-${i}"></ul>
        </div>
        <div class="card-footer bg-white dark-bg border-0 text-center" id="char-footer-${i}">
          <button class="btn btn-sm btn-danger" onclick="showDeleteConfirm(${i})">캐릭터 삭제</button>
        </div>
      </div>
    `;
    row.appendChild(col);
    renderCharacterTasks(i);
  }
  // 빈 박스(추가 버튼)
  if (characters.length < MAX_CHARACTERS) {
    const col = document.createElement('div');
    col.className = 'col-md-2 mb-3 d-flex align-items-center justify-content-center';
    col.innerHTML = `
      <div class="card h-100 w-100 d-flex align-items-center justify-content-center" style="min-height:180px;cursor:pointer;">
        <div class="card-body text-center p-0 d-flex align-items-center justify-content-center" style="height:100%;">
          <button class="btn btn-outline-primary rounded-circle" style="width:80px;height:80px;font-size:2.5rem;line-height:1;" onclick="addCharacter()">+</button>
        </div>
      </div>
    `;
    row.appendChild(col);
  }
}

function renderCharacterTasks(idx) {
  const char = characters[idx] || { name: '', tasks: {} };
  const ul = document.getElementById(`char-task-list-${idx}`);
  if (!ul) return;
  ul.innerHTML = '';
  // 일일 퀘스트 헤더 + 버튼 + 항목 삭제 버튼
  let dailyHeader = document.createElement('li');
  dailyHeader.className = 'list-group-item bg-light dark-bg fw-bold d-flex align-items-center justify-content-between';
  dailyHeader.innerHTML = `
    <span>일일 퀘스트</span>
    <span>
      <button class="btn btn-sm btn-outline-primary ms-2" onclick="addUserDailyTask()" style="width: 30px;">+</button>
      <button class="btn btn-sm btn-outline-danger ms-2" onclick="toggleDeleteMode(${idx})" style="width: 30px;">-</button>
    </span>
  `;
  ul.appendChild(dailyHeader);
  // 기본 일일 퀘스트(삭제된 id 제외)
  DAILY_TASKS.forEach(task => {
    if (removedDailyTaskIds.includes(task.id)) return;
    let li = document.createElement('li');
    li.className = 'list-group-item d-flex align-items-center justify-content-between dark-bg';
    let minusBtn = showDeleteButtons[idx] ? `<button class=\"btn btn-sm btn-outline-danger ms-2 py-0 px-2\" style=\"font-size:1rem;line-height:1;vertical-align:middle;\" onclick=\"removeDefaultDailyTask('${task.id}')\">-</button>` : '';
    if (task.type === 'check' || task.type === 'servercheck') {
      li.innerHTML = `<span>${task.name} ${minusBtn}</span><div class=\"form-switch\"><input type=\"checkbox\" class=\"form-check-input form-check-lg\" style=\"width:2.5em;height:2em;\" id=\"task-${task.id}-${idx}\" ${char.tasks[task.id] ? 'checked' : ''} onchange=\"toggleTask(${idx}, '${task.id}')\"></div>`;
      ul.appendChild(li);
    } else if (task.type === 'select-count') {
      // 남은 횟수로 표시, 0~max까지 버튼, 초기값은 max
      const val = typeof char.tasks[task.id] === 'number' ? char.tasks[task.id] : task.max;
      let btns = '';
      for (let n = task.max; n >= 0; n--) {
        btns += `<button class=\"btn btn-sm me-1 ${val === n ? 'btn-success' : 'btn-outline-secondary'}\" onclick=\"selectCount(${idx}, '${task.id}', ${n})\">${n}</button>`;
      }
      li.innerHTML = `<span>${task.name} ${minusBtn}</span><span>${btns}</span>`;
      ul.appendChild(li);
    }
  });
  // 사용자 추가 일일 퀘스트
  // userDailyTasks 렌더링 (객체 지원)
  userDailyTasks.forEach((task, tIdx) => {
    let name = typeof task === 'string' ? task : task.name;
    let type = typeof task === 'string' ? 'check' : (task.type || 'check');
    let max = typeof task === 'object' && task.type === 'select-count' ? (task.max || 1) : 1;
    let li = document.createElement('li');
    li.className = 'list-group-item d-flex align-items-center justify-content-between dark-bg';
    let minusBtn = showDeleteButtons[idx] ? `<button class="btn btn-sm btn-outline-danger ms-2 py-0 px-2" style="font-size:1rem;line-height:1;vertical-align:middle;" onclick="removeUserDailyTask(${tIdx})">-</button>` : '';
    if (type === 'check' || type === 'servercheck') {
      li.innerHTML = `<span>${name} ${minusBtn}</span><div class="form-switch"><input class="form-check-input form-check-lg" type="checkbox" style="width:2.5em;height:2em;" id="user-daily-${tIdx}-${idx}" ${char.tasks[`user-daily-${tIdx}`] ? 'checked' : ''} onchange="toggleTask(${idx}, 'user-daily-${tIdx}')"></div>`;
      ul.appendChild(li);
    } else if (type === 'select-count') {
      const val = typeof char.tasks[`user-daily-${tIdx}`] === 'number' ? char.tasks[`user-daily-${tIdx}`] : max;
      let btns = '';
      for (let n = max; n >= 0; n--) {
        btns += `<button class=\"btn btn-sm me-1 ${val === n ? 'btn-success' : 'btn-outline-secondary'}\" onclick=\"selectCount(${idx}, 'user-daily-${tIdx}', ${n})\">${n}</button>`;
      }
      li.innerHTML = `<span>${name} ${minusBtn}</span><span>${btns}</span>`;
      ul.appendChild(li);
    }
  });
  // 주간 퀘스트 헤더 + 버튼 + 항목 삭제 버튼
  let weeklyHeader = document.createElement('li');
  weeklyHeader.className = 'list-group-item bg-light dark-bg fw-bold d-flex align-items-center justify-content-between';
  weeklyHeader.innerHTML = `
    <span>주간 퀘스트</span>
    <span>
      <button class="btn btn-sm btn-outline-primary ms-2" onclick="addUserWeeklyTask()" style="width: 30px;">+</button>
      <button class="btn btn-sm btn-outline-danger ms-2" onclick="toggleDeleteMode(${idx})" style="width: 30px;">-</button>
    </span>
  `;
  ul.appendChild(weeklyHeader);
  // 기본 주간 퀘스트(삭제된 id 제외)
  WEEKLY_TASKS.forEach(task => {
    if (removedWeeklyTaskIds.includes(task.id)) return;
    let li = document.createElement('li');
    li.className = 'list-group-item d-flex align-items-center justify-content-between dark-bg';
    let minusBtn = showDeleteButtons[idx] ? `<button class="btn btn-sm btn-outline-danger ms-2 py-0 px-2" style="font-size:1rem;line-height:1;vertical-align:middle;" onclick="removeDefaultWeeklyTask('${task.id}')">-</button>` : '';
    if (task.type === 'check') {
      li.innerHTML = `<span>${task.name} ${minusBtn}</span><div class="form-switch"><input type="checkbox" class="form-check-input form-check-lg" style="width:2.5em;height:2em;" id="task-${task.id}-${idx}" ${char.tasks[task.id] ? 'checked' : ''} onchange="toggleTask(${idx}, '${task.id}')"></div>`;
      ul.appendChild(li);
    } else if (task.type === 'fieldboss-group') {
      let checkedCount = FIELD_BOSSES.reduce((sum, boss) => sum + (char.tasks[boss.id] ? 1 : 0), 0);
      let bossList = FIELD_BOSSES.map(boss => {
        return `<div class="form-check form-switch d-flex align-items-center justify-content-between ms-3 mb-1">
          <span>${boss.name}</span>
          <input class="form-check-input form-check-lg" style="width:2.5em;height:2em;" type="checkbox" id="boss-${boss.id}-${idx}" ${char.tasks[boss.id] ? 'checked' : ''} onchange="toggleFieldBoss(${idx}, '${boss.id}')">
        </div>`;
      }).join('');
      const highlight = checkedCount === 3 ? 'highlight-boss' : '';
      li.innerHTML = `<div class="w-100">
        <div class="d-flex align-items-center justify-content-between mb-1">
          <span>주간 필드보스 (최대 3마리) ${minusBtn}</span>
          <small class="text-muted ${highlight}">선택: ${checkedCount}/3</small>
        </div>
        ${bossList}
      </div>`;
      ul.appendChild(li);
    }
  });
  // 사용자 추가 주간 퀘스트
  // userWeeklyTasks 렌더링 (객체 지원)
  userWeeklyTasks.forEach((task, tIdx) => {
    let name = typeof task === 'string' ? task : task.name;
    let type = typeof task === 'string' ? 'check' : (task.type || 'check');
    let max = typeof task === 'object' && task.type === 'select-count' ? (task.max || 1) : 1;
    let li = document.createElement('li');
    li.className = 'list-group-item d-flex align-items-center justify-content-between dark-bg';
    let minusBtn = showDeleteButtons[idx] ? `<button class=\"btn btn-sm btn-outline-danger ms-2 py-0 px-2\" style=\"font-size:1rem;line-height:1;vertical-align:middle;\" onclick=\"removeUserWeeklyTask(${tIdx})\">-</button>` : '';
    if (type === 'check' || type === 'servercheck') {
      li.innerHTML = `<span>${name} ${minusBtn}</span><div class="form-switch"><input class="form-check-input form-check-lg" type="checkbox" style="width:2.5em;height:2em;" id="user-weekly-${tIdx}-${idx}" ${char.tasks[`user-weekly-${tIdx}`] ? 'checked' : ''} onchange="toggleTask(${idx}, 'user-weekly-${tIdx}')"></div>`;
      ul.appendChild(li);
    } else if (type === 'select-count') {
      const val = typeof char.tasks[`user-weekly-${tIdx}`] === 'number' ? char.tasks[`user-weekly-${tIdx}`] : max;
      let btns = '';
      for (let n = max; n >= 0; n--) {
        btns += `<button class=\"btn btn-sm me-1 ${val === n ? 'btn-success' : 'btn-outline-secondary'}\" onclick=\"selectCount(${idx}, 'user-weekly-${tIdx}', ${n})\">${n}</button>`;
      }
      li.innerHTML = `<span>${name} ${minusBtn}</span><span>${btns}</span>`;
      ul.appendChild(li);
    }
  });
}

// 스타일 추가
if (!document.getElementById('highlight-boss-style')) {
  const style = document.createElement('style');
  style.id = 'highlight-boss-style';
  style.innerHTML = `.highlight-boss { background:#198754 !important; color:#fff !important; padding:2px 8px; border-radius:8px; font-weight:bold; }`;
  document.head.appendChild(style);
}

function showMessage(msg, timeout = 2000) {
  const el = document.getElementById('message-area');
  if (!el) return;
  el.textContent = msg;
  if (timeout > 0) {
    setTimeout(() => {
      if (el.textContent === msg) el.textContent = '';
    }, timeout);
  }
}

// 페이지 로드 시 동기화 코드 표시
document.addEventListener('DOMContentLoaded', window.renderSyncCode);

window.addCharacter = function() {
  if (characters.length >= MAX_CHARACTERS) return;
  const name = prompt('추가할 캐릭터 이름을 입력하세요:');
  if (name) {
    // sync_id가 없으면 생성
    if (!CURRENT_SYNC_CODE && window.getOrCreateSyncId) {
      CURRENT_SYNC_CODE = window.getOrCreateSyncId();
    }
    // select-count 타입은 남은 횟수로, 초기값을 max로 설정
    let tasks = {};
    DAILY_TASKS.forEach(task => {
      if (task.type === 'select-count') {
        tasks[task.id] = task.max;
      }
    });
    characters.push({ name, tasks });
    saveData();
    renderCharacters();
    renderSyncCode(); // 캐릭터 추가 후 동기화 코드 즉시 표시
    if (CURRENT_SYNC_CODE) {
      location.href = `/?code=${CURRENT_SYNC_CODE}`;
    }
  }
};

window.showDeleteConfirm = function(idx) {
  const footer = document.getElementById(`char-footer-${idx}`);
  if (!footer) return;
  footer.innerHTML = `
    <div class="mb-2 text-danger">정말 삭제할까요?</div>
    <button class="btn btn-sm btn-danger me-2" onclick="deleteCharacter(${idx})">Yes</button>
    <button class="btn btn-sm btn-secondary" onclick="cancelDelete(${idx})">No</button>
  `;
};

window.cancelDelete = function(idx) {
  const footer = document.getElementById(`char-footer-${idx}`);
  if (!footer) return;
  footer.innerHTML = `<button class="btn btn-sm btn-danger" onclick="showDeleteConfirm(${idx})">캐릭터 삭제</button>`;
};

window.deleteCharacter = function(idx) {
  characters.splice(idx, 1);
  if (characters.length === 0) {
    // 캐릭터가 0명이 되면 서버 데이터도 삭제
    const syncId = CURRENT_SYNC_CODE;
    if (syncId) {
      fetch(`${API_BASE}?action=delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_id: syncId })
      })
        .then(res => res.json())
        .then(() => {
          localStorage.removeItem('mobinogi-sync-id');
          userDailyTasks = [];
          userWeeklyTasks = [];
          removedDailyTaskIds = [];
          removedWeeklyTaskIds = [];
          lastReset = { daily: null, weekly: null };
          renderCharacters();
          showMessage('모든 데이터가 삭제되었습니다.');
        })
        .catch(() => {
          showMessage('서버 데이터 삭제 실패! 네트워크를 확인하세요.');
        });
    }
  } else {
    saveData();
    renderCharacters();
  }
};

window.editName = function(idx) {
  const name = prompt('새 캐릭터 이름을 입력하세요:', characters[idx].name);
  if (name) {
    characters[idx].name = name;
    saveData();
    renderCharacters();
  }
};

window.toggleTask = function(idx, taskId) {
  // 계정공유(servercheck) 타입 처리
  // user-daily, user-weekly, 기본 daily 모두 지원
  let isServerCheck = false;
  // 기본 일일 퀘스트
  if (taskId === 'dailyfree') isServerCheck = true;
  // 사용자 추가 일일/주간 퀘스트
  if (taskId.startsWith('user-daily-')) {
    const tIdx = parseInt(taskId.replace('user-daily-', ''), 10);
    const task = userDailyTasks[tIdx];
    if (task && (task.type === 'servercheck')) isServerCheck = true;
  }
  if (taskId.startsWith('user-weekly-')) {
    const tIdx = parseInt(taskId.replace('user-weekly-', ''), 10);
    const task = userWeeklyTasks[tIdx];
    if (task && (task.type === 'servercheck')) isServerCheck = true;
  }
  if (isServerCheck) {
    // 첫 캐릭터의 상태를 기준으로 반전
    const newVal = !characters[0]?.tasks[taskId];
    characters.forEach(char => {
      if (!char) return;
      if (!char.tasks) char.tasks = {};
      char.tasks[taskId] = newVal;
    });
    saveData();
    renderCharacters();
    return;
  }
  if (!characters[idx]) characters[idx] = { name: '', tasks: {} };
  characters[idx].tasks[taskId] = !characters[idx].tasks[taskId];
  saveData();
};

window.toggleFieldBoss = function(idx, bossId) {
  if (!characters[idx]) characters[idx] = { name: '', tasks: {} };
  const char = characters[idx];
  const checkedCount = FIELD_BOSSES.reduce((sum, boss) => sum + (char.tasks[boss.id] ? 1 : 0), 0);
  if (!char.tasks[bossId]) {
    // 체크 시 3개 초과 불가
    if (checkedCount >= 3) {
      showMessage('주간 필드보스는 최대 3마리까지만 선택할 수 있습니다.');
      renderCharacterTasks(idx);
      return;
    }
    char.tasks[bossId] = true;
  } else {
    char.tasks[bossId] = false;
  }
  saveData();
  renderCharacterTasks(idx);
};

window.changeCount = function(idx, taskId, delta) {
  if (!characters[idx]) characters[idx] = { name: '', tasks: {} };
  let val = characters[idx].tasks[taskId] || 0;
  const task = TASKS.find(t => t.id === taskId);
  val += delta;
  if (val < 0) val = 0;
  if (task && task.max && val > task.max) val = task.max;
  characters[idx].tasks[taskId] = val;
  saveData();
  document.getElementById(`count-${taskId}-${idx}`).innerText = val;
};

window.selectCount = function(idx, taskId, count) {
  if (!characters[idx]) characters[idx] = { name: '', tasks: {} };
  characters[idx].tasks[taskId] = count;
  saveData();
  renderCharacterTasks(idx);
};

// 퀘스트 추가 팝업 관련
let questPopupMode = null; // 'daily' or 'weekly'

function showQuestPopup(mode) {
  questPopupMode = mode;
  document.getElementById('quest-popup-bg').style.display = 'block';
  document.getElementById('quest-popup').style.display = 'block';
  document.getElementById('quest-popup-title').textContent = mode === 'daily' ? '일일 퀘스트 추가' : '주간 퀘스트 추가';
  document.getElementById('quest-popup-name').value = '';
  document.getElementById('quest-popup-type').value = 'check';
  document.getElementById('quest-popup-count').value = 1;
  document.getElementById('quest-popup-count-wrap').style.display = 'none';
}

function hideQuestPopup() {
  document.getElementById('quest-popup-bg').style.display = 'none';
  document.getElementById('quest-popup').style.display = 'none';
  questPopupMode = null;
}

// 팝업 타입 변경 시 횟수 입력 표시
function onQuestTypeChange() {
  const type = document.getElementById('quest-popup-type').value;
  document.getElementById('quest-popup-count-wrap').style.display = (type === 'select-count') ? 'block' : 'none';
}

document.getElementById('quest-popup-type').addEventListener('change', onQuestTypeChange);
document.getElementById('quest-popup-cancel').addEventListener('click', hideQuestPopup);
document.getElementById('quest-popup-bg').addEventListener('click', hideQuestPopup);

document.getElementById('quest-popup-add').addEventListener('click', function() {
  const name = document.getElementById('quest-popup-name').value.trim();
  const type = document.getElementById('quest-popup-type').value;
  let max = 1;
  if (type === 'select-count') {
    max = parseInt(document.getElementById('quest-popup-count').value, 10);
    if (isNaN(max) || max < 1 || max > 20) {
      showMessage('횟수는 1~20 사이여야 합니다.');
      return;
    }
  }
  if (!name) {
    showMessage('퀘스트 이름을 입력하세요.');
    return;
  }
  let tIdx;
  if (questPopupMode === 'daily') {
    userDailyTasks.push({ name, type, max });
    tIdx = userDailyTasks.length - 1;
    // servercheck 타입이면 모든 캐릭터의 tasks에서 해당 키를 삭제(체크 안된 상태로 추가)
    if (type === 'servercheck') {
      characters.forEach(char => {
        if (!char.tasks) return;
        delete char.tasks[`user-daily-${tIdx}`];
      });
    }
  } else {
    userWeeklyTasks.push({ name, type, max });
    tIdx = userWeeklyTasks.length - 1;
    if (type === 'servercheck') {
      characters.forEach(char => {
        if (!char.tasks) return;
        delete char.tasks[`user-weekly-${tIdx}`];
      });
    }
  }
  saveData();
  renderCharacters();
  hideQuestPopup();
});

// 기존 prompt 방식 제거, 버튼에서 팝업 호출로 변경
window.addUserDailyTask = function() {
  showQuestPopup('daily');
};
window.addUserWeeklyTask = function() {
  showQuestPopup('weekly');
};

window.removeDefaultDailyTask = function(taskId) {
  if (!removedDailyTaskIds.includes(taskId)) removedDailyTaskIds.push(taskId);
  characters.forEach(char => {
    if (!char.tasks) return;
    delete char.tasks[taskId];
  });
  saveData();
  renderCharacters();
};

window.removeDefaultWeeklyTask = function(taskId) {
  if (!removedWeeklyTaskIds.includes(taskId)) removedWeeklyTaskIds.push(taskId);
  characters.forEach(char => {
    if (!char.tasks) return;
    delete char.tasks[taskId];
  });
  saveData();
  renderCharacters();
};

window.removeUserDailyTask = function(tIdx) {
  userDailyTasks.splice(tIdx, 1);
  saveData();
  renderCharacters();
};

window.removeUserWeeklyTask = function(tIdx) {
  userWeeklyTasks.splice(tIdx, 1);
  saveData();
  renderCharacters();
};

window.toggleDeleteMode = function(idx) {
  showDeleteButtons[idx] = !showDeleteButtons[idx];
  renderCharacterTasks(idx);
};

window.resetAllData = function() {
  if (!confirm('정말 모든 데이터를 초기화할까요?\n(동기화 서버의 데이터도 삭제됩니다)')) return;
  const syncId = CURRENT_SYNC_CODE;
  if (!syncId) return;
  // 서버 데이터 삭제 요청 (POST, JSON body)
  fetch(`${API_BASE}?action=delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sync_id: syncId })
  })
    .then(res => res.json())
    .then(() => {
      localStorage.removeItem('mobinogi-sync-id');
      characters = [];
      userDailyTasks = [];
      userWeeklyTasks = [];
      removedDailyTaskIds = [];
      removedWeeklyTaskIds = [];
      lastReset = { daily: null, weekly: null };
      showMessage('모든 데이터가 초기화되었습니다. 메인으로 이동합니다.', 'success');
      setTimeout(() => { location.href = '/'; }, 1200);
    })
    .catch(() => {
      showMessage('초기화 실패! 네트워크를 확인하세요.', 'error');
    });
};

window.resetQuestItems = function() {
  if (!confirm('변경했던 퀘스트 항목만 초기화할까요? 캐릭터/진행상황은 유지됩니다.')) return;
  removedDailyTaskIds = [];
  removedWeeklyTaskIds = [];
  userDailyTasks = [];
  userWeeklyTasks = [];
  saveData();
  renderCharacters();
  showMessage('퀘스트 항목이 초기화되었습니다.', 'success');
};

// 페이지 로드 시 데이터 불러오기
loadData().then(renderCharacters);
