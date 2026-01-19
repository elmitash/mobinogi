// import { generateSyncId, getOrCreateSyncId, getShortCode, exportDataCode, importDataCode } from './sync.js';
// 동기화 및 DB 관련 함수는 sync.js에서 window에 등록하여 사용

// 캐릭터 및 해야할 일 정보
const MAX_CHARACTERS = 6;
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
  API_BASE = location.origin + '/api.php';
} else {
  API_BASE = 'https://mobinogi.elmi.page/api.php';
}

const characters = [];
const userDailyTasks = [];
const userWeeklyTasks = [];
const lastReset = { daily: null, weekly: null };
const removedDailyTaskIds = [];
const removedWeeklyTaskIds = [];
const dailyTasksOrder = [];
const weeklyTasksOrder = [];
const showDeleteButtons = [];

// 현재 세션에서 사용할 동기화 코드(숏코드) 변수
let CURRENT_SYNC_CODE = window.getShortCode ? window.getShortCode() : '';

// --- 테스트용 시간 시뮬레이션 기능 ---
// 콘솔에서 window.SIMULATED_TIME = "2026-01-20T07:00:00" 형태로 설정 가능
window.SIMULATED_TIME = null;
function getNow() {
  if (window.SIMULATED_TIME) {
    const sim = new Date(window.SIMULATED_TIME).getTime();
    if (!isNaN(sim)) return sim;
  }
  return Date.now();
}

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
    // 신규 유저의 경우, 현재 시점의 초기화 타임스탬프를 미리 설정하여 불필요한 즉시 초기화 방지
    const currentStatus = checkQuestResetTimestamps(null, null);
    lastReset = {
      daily: new Date(currentStatus.latestDailyResetTimestamp).toISOString(),
      weekly: new Date(currentStatus.latestWeeklyResetTimestamp).toISOString()
    };
    autoResetTasks();
    return;
  }
  try {
    const res = await fetch(`${API_BASE}?action=data&sync_id=${syncId}`);
    if (!res.ok) throw new Error('데이터 없음');
    const result = await res.json();
    const parsed = result.data;

    // 기존 배열/객체의 내용을 비우고 새로운 데이터로 채움 (참조 유지)
    characters.length = 0;
    userDailyTasks.length = 0;
    userWeeklyTasks.length = 0;
    removedDailyTaskIds.length = 0;
    removedWeeklyTaskIds.length = 0;
    dailyTasksOrder.length = 0;
    weeklyTasksOrder.length = 0;

    if (Array.isArray(parsed)) {
      characters.push(...parsed);
      lastReset.daily = null;
      lastReset.weekly = null;
    } else {
      const migrated = migrateUserData(parsed);
      if (migrated.characters) characters.push(...migrated.characters);
      if (migrated.userDailyTasks) userDailyTasks.push(...migrated.userDailyTasks);
      if (migrated.userWeeklyTasks) userWeeklyTasks.push(...migrated.userWeeklyTasks);
      if (migrated.removedDailyTaskIds) removedDailyTaskIds.push(...migrated.removedDailyTaskIds);
      if (migrated.removedWeeklyTaskIds) removedWeeklyTaskIds.push(...migrated.removedWeeklyTaskIds);
      if (migrated.dailyTasksOrder) dailyTasksOrder.push(...migrated.dailyTasksOrder);
      if (migrated.weeklyTasksOrder) weeklyTasksOrder.push(...migrated.weeklyTasksOrder);

      if (migrated.lastReset) {
        lastReset.daily = migrated.lastReset.daily;
        lastReset.weekly = migrated.lastReset.weekly;
      }
    }
  } catch (e) {
    // 서버에 데이터가 없거나 에러 발생 시 초기화
    characters.length = 0;
    userDailyTasks.length = 0;
    userWeeklyTasks.length = 0;
    removedDailyTaskIds.length = 0;
    removedWeeklyTaskIds.length = 0;
    dailyTasksOrder.length = 0;
    weeklyTasksOrder.length = 0;

    const currentStatus = checkQuestResetTimestamps(null, null);
    lastReset.daily = new Date(currentStatus.latestDailyResetTimestamp).toISOString();
    lastReset.weekly = new Date(currentStatus.latestWeeklyResetTimestamp).toISOString();
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
  const data = {
    characters,
    userDailyTasks,
    userWeeklyTasks,
    removedDailyTaskIds,
    removedWeeklyTaskIds,
    lastReset,
    dailyTasksOrder,
    weeklyTasksOrder
  };
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

/**
 * 주어진 Date 객체 또는 타임스탬프를 한국 시간(Asia/Seoul) 기준으로 변환하여
 * 구조화된 객체로 반환합니다.
 * @param {Date | number} dateInput - 변환할 Date 객체 또는 UTC 타임스탬프.
 * @returns {{year: number, month: number, day: number, hour: number, dayOfWeek: number}}
 *          dayOfWeek: 0=일요일, 1=월요일, ..., 6=토요일
 */
function getKST_Info(dateInput) {
  const date = new Date(dateInput);
  const timestamp = date.getTime();
  if (isNaN(timestamp)) return { dayOfWeek: -1 };
  // 한국 시간(KST)은 UTC+9입니다.
  const kstDate = new Date(timestamp + (9 * 60 * 60 * 1000));
  return { dayOfWeek: kstDate.getUTCDay() };
}

/**
 * 마지막 저장 시간과 현재 시간을 비교하여 퀘스트 초기화가 필요한지 확인합니다.
 * 모든 계산은 한국 시간(KST)을 기준으로 합니다.
 * @param {string | null} lastResetDailyISO - 마지막 일일 초기화 시점의 ISO 문자열 (KST 기준)
 * @param {string | null} lastResetWeeklyISO - 마지막 주간 초기화 시점의 ISO 문자열 (KST 기준)
 * @returns {{
 *   needsDailyReset: boolean, 
 *   needsWeeklyReset: boolean,
 *   latestDailyResetTimestamp: number,
 *   latestWeeklyResetTimestamp: number
 * }}
 */
function checkQuestResetTimestamps(lastResetDailyISO, lastResetWeeklyISO) {
  const nowTimestamp = getNow();

  // KST 기준으로 현재 날짜/시간 추출
  const kstNow = new Date(nowTimestamp + (9 * 60 * 60 * 1000));
  const kstYear = kstNow.getUTCFullYear();
  const kstMonth = kstNow.getUTCMonth();
  const kstDate = kstNow.getUTCDate();

  // 오늘 오전 6시 KST를 UTC 타임스탬프로 계산 (Date.UTC는 이미 UTC 기준이므로 오프셋 보정 필요)
  // Date.UTC(year, month, day, hour, ...)
  const kstResetTodayUTC = Date.UTC(kstYear, kstMonth, kstDate, 6, 0, 0, 0);
  let latestDailyResetTimestamp = kstResetTodayUTC - (9 * 60 * 60 * 1000);

  // 현재 시각이 오늘 오전 6시 전이라면 '어제 6시'가 가장 최근의 초기화 시점
  if (nowTimestamp < latestDailyResetTimestamp) {
    latestDailyResetTimestamp -= (24 * 60 * 60 * 1000);
  }

  // 주간 초기화 (월요일 오전 6시)
  const kstInfo = getKST_Info(latestDailyResetTimestamp);
  const dayOfWeekKST = kstInfo.dayOfWeek;
  const daysToSubtract = (dayOfWeekKST - 1 + 7) % 7;
  const latestWeeklyResetTimestamp = latestDailyResetTimestamp - (daysToSubtract * 24 * 60 * 60 * 1000);

  // 로컬/저장된 시간과 비교
  const lastDailyTime = lastResetDailyISO ? new Date(lastResetDailyISO).getTime() : 0;
  const lastWeeklyTime = lastResetWeeklyISO ? new Date(lastResetWeeklyISO).getTime() : 0;

  const result = {
    needsDailyReset: isNaN(lastDailyTime) || lastDailyTime < latestDailyResetTimestamp,
    needsWeeklyReset: isNaN(lastWeeklyTime) || lastWeeklyTime < latestWeeklyResetTimestamp,
    latestDailyResetTimestamp: latestDailyResetTimestamp,
    latestWeeklyResetTimestamp: latestWeeklyResetTimestamp
  };

  console.log("[QuestReset] 계산 결과:", {
    현재시간: new Date(nowTimestamp).toLocaleString(),
    최근일일초기화: new Date(result.latestDailyResetTimestamp).toLocaleString(),
    최근주간초기화: new Date(result.latestWeeklyResetTimestamp).toLocaleString(),
    일간리셋필요: result.needsDailyReset,
    주간리셋필요: result.needsWeeklyReset
  });

  return result;
}

function autoResetTasks() {
  // 초기화가 필요한지 안전하게 확인
  const resetStatus = checkQuestResetTimestamps(lastReset.daily, lastReset.weekly);

  let dataChanged = false;

  // 일일 퀘스트 초기화: 한국 시간 기준 매일 오전 6시
  if (resetStatus.needsDailyReset) {
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
      userDailyTasks.forEach(task => {
        if (task.type === 'select-count') {
          char.tasks[task.id] = task.max;
        } else {
          delete char.tasks[task.id];
        }
      });
    });
    // 마지막 초기화 시간을 '가장 최근의 초기화 시점' 타임스탬프로 업데이트
    lastReset.daily = new Date(resetStatus.latestDailyResetTimestamp).toISOString();
    dataChanged = true;
  }
  // 주간 퀘스트 초기화: 한국 시간 기준 이번주 월요일 오전 6시
  if (resetStatus.needsWeeklyReset) {
    characters.forEach(char => {
      if (!char.tasks) return;
      // 기본 주간 퀘스트 초기화
      WEEKLY_TASKS.forEach(task => { delete char.tasks[task.id]; });
      // 필드보스 체크 초기화
      FIELD_BOSSES.forEach(boss => { delete char.tasks[boss.id]; });
      // [추가] 유저가 추가한 주간 퀘스트도 모두 초기화 (ID 기반)
      userWeeklyTasks.forEach(task => { delete char.tasks[task.id]; });
    });
    lastReset.weekly = new Date(resetStatus.latestWeeklyResetTimestamp).toISOString();
    dataChanged = true;
  }

  // 변경 사항이 있을 경우에만 저장 및 UI 갱신
  if (dataChanged) {
    console.log("[QuestReset] 데이터가 변경되어 저장 및 UI를 갱신합니다.");
    saveData();
    renderCharacters();
  }
}

// 콘솔 테스트를 위한 전역 등록
window.checkQuestResetTimestamps = checkQuestResetTimestamps;
window.autoResetTasks = autoResetTasks;
// lastReset은 객체이므로 참조를 통해 콘솔에서 수정 가능합니다.
window.lastReset = lastReset;

/**
 * 인덱스 기반의 구형 데이터를 고유 ID 기반의 신규 구조로 마이그레이션합니다.
 */
function migrateUserData(parsed) {
  if (!parsed.userDailyTasks && !parsed.userWeeklyTasks) {
    // 순서 배열이 없으면 초기화
    if (!parsed.dailyTasksOrder) {
      parsed.dailyTasksOrder = DAILY_TASKS.map(t => t.id);
    }
    if (!parsed.weeklyTasksOrder) {
      parsed.weeklyTasksOrder = WEEKLY_TASKS.map(t => t.id);
    }
    // lastReset이 누락된 구형 데이터인 경우 현재 시점 기준으로 채워줌
    if (!parsed.lastReset || !parsed.lastReset.daily) {
      const currentResets = checkQuestResetTimestamps(null, null);
      parsed.lastReset = {
        daily: new Date(currentResets.latestDailyResetTimestamp).toISOString(),
        weekly: new Date(currentResets.latestWeeklyResetTimestamp).toISOString()
      };
    }
    return parsed;
  }

  // lastReset이 없는 경우를 위한 공통 처리
  if (!parsed.lastReset || !parsed.lastReset.daily) {
    const currentResets = checkQuestResetTimestamps(null, null);
    parsed.lastReset = {
      daily: new Date(currentResets.latestDailyResetTimestamp).toISOString(),
      weekly: new Date(currentResets.latestWeeklyResetTimestamp).toISOString()
    };
  }

  let dailyMapping = {}; // { 'user-daily-0': 'ud-12345678' }
  let weeklyMapping = {};

  // 1. 일일 퀘스트 마이그레이션
  if (parsed.userDailyTasks) {
    parsed.userDailyTasks = parsed.userDailyTasks.map((task, idx) => {
      const oldKey = `user-daily-${idx}`;
      if (typeof task === 'string') {
        const newID = `ud-legacy-${idx}`; // 고정된 ID 생성으로 기기 간 일치 보장
        dailyMapping[oldKey] = newID;
        return { id: newID, name: task, type: 'check', max: 1 };
      }
      if (!task.id) {
        task.id = `ud-legacy-${idx}`;
        dailyMapping[oldKey] = task.id;
      }
      return task;
    });
  }

  // 2. 주간 퀘스트 마이그레이션
  if (parsed.userWeeklyTasks) {
    parsed.userWeeklyTasks = parsed.userWeeklyTasks.map((task, idx) => {
      const oldKey = `user-weekly-${idx}`;
      if (typeof task === 'string') {
        const newID = `uw-legacy-${idx}`; // 고정된 ID 생성
        weeklyMapping[oldKey] = newID;
        return { id: newID, name: task, type: 'check', max: 1 };
      }
      if (!task.id) {
        task.id = `uw-legacy-${idx}`;
        weeklyMapping[oldKey] = task.id;
      }
      return task;
    });
  }

  // 3. 캐릭터별 진행 상태(tasks) 키값 변경
  if (parsed.characters && (Object.keys(dailyMapping).length > 0 || Object.keys(weeklyMapping).length > 0)) {
    parsed.characters.forEach(char => {
      if (!char.tasks) return;
      const newTasks = {};
      for (let [key, val] of Object.entries(char.tasks)) {
        if (dailyMapping[key]) {
          newTasks[dailyMapping[key]] = val;
        } else if (weeklyMapping[key]) {
          newTasks[weeklyMapping[key]] = val;
        } else {
          newTasks[key] = val;
        }
      }
      char.tasks = newTasks;
    });
  }

  // 4. 순서 배열 초기화 (기존 항목 포함)
  if (!parsed.dailyTasksOrder) {
    const userIds = parsed.userDailyTasks ? parsed.userDailyTasks.map(t => t.id) : [];
    parsed.dailyTasksOrder = [...DAILY_TASKS.map(t => t.id), ...userIds];
  }
  if (!parsed.weeklyTasksOrder) {
    const userIds = parsed.userWeeklyTasks ? parsed.userWeeklyTasks.map(t => t.id) : [];
    parsed.weeklyTasksOrder = [...WEEKLY_TASKS.map(t => t.id), ...userIds];
  }

  return parsed;
}

function renderCharacters() {
  const row = document.getElementById('character-row');
  row.innerHTML = '';
  // 캐릭터 박스 렌더링
  for (let i = 0; i < characters.length; i++) {
    const char = characters[i] || { name: '', tasks: {}, memo: '' };
    if (showDeleteButtons[i] === undefined) showDeleteButtons[i] = false;
    const col = document.createElement('div');
    col.className = 'col-12 col-lg-2 mb-4 px-2'; // 모바일 1열, 데스크톱 6열
    col.innerHTML = `
      <div class="card h-100 shadow-sm" style="border-radius: 12px;">
        <div class="card-body p-3">
          <div class="mb-3 d-flex align-items-center justify-content-between">
            <span class="fw-bold text-truncate" id="char-name-${i}" style="font-size: 1.15rem;">${char.name}</span>
            <div class="d-flex gap-1">
              <button class="btn btn-sm p-1 text-secondary border-0" onclick="editName(${i})" title="수정">
                <small style="font-size: 0.85rem;">수정</small>
              </button>
              <button class="btn btn-sm p-1 text-info border-0" onclick="showMemoPopup(${i})" title="메모">
                <small style="font-size: 0.85rem;">메모</small>
              </button>
            </div>
          </div>
          <ul class="list-group list-group-flush" id="char-task-list-${i}"></ul>
        </div>
        <div class="card-footer bg-transparent border-0 text-center pb-2" id="char-footer-${i}">
          <button class="btn btn-sm text-danger border-0 p-0" onclick="showDeleteConfirm(${i})"><small style="font-size: 0.7rem;">캐릭터 삭제</small></button>
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

  // --- 일일 퀘스트 섹션 ---
  let dailyHeader = document.createElement('li');
  dailyHeader.className = 'list-group-item fw-bold mt-1 mb-1 px-2 border-0 d-flex align-items-center justify-content-between daily-header rounded';
  dailyHeader.style.fontSize = '1.05rem'; dailyHeader.style.color = 'var(--text-main)';
  dailyHeader.innerHTML = `
    <span>일일 퀘스트</span>
    <span>
      <button class="btn btn-sm p-1 text-primary" onclick="addUserDailyTask()" title="추가">+</button>
      <button class="btn btn-sm p-1 text-danger" onclick="toggleDeleteMode(${idx})" title="편집">-</button>
    </span>
  `;
  ul.appendChild(dailyHeader);

  // dailyTasksOrder 순서대로 렌더링
  dailyTasksOrder.forEach(taskId => {
    if (removedDailyTaskIds.includes(taskId)) return;

    // 기본 퀘스트인지 사용자 정의 퀘스트인지 확인
    let task = DAILY_TASKS.find(t => t.id === taskId) || userDailyTasks.find(t => t.id === taskId);
    if (!task) return;

    const isUserTask = !DAILY_TASKS.some(t => t.id === taskId);
    let li = document.createElement('li');
    li.className = 'list-group-item d-flex align-items-center justify-content-between dark-bg';

    let minusBtn = '';
    if (showDeleteButtons[idx]) {
      if (isUserTask) {
        minusBtn = `<button class="btn btn-sm btn-outline-danger ms-2 py-0 px-2" style="font-size:1rem;line-height:1;vertical-align:middle;" onclick="removeUserDailyTask('${taskId}')">-</button>`;
      } else {
        minusBtn = `<button class="btn btn-sm btn-outline-danger ms-2 py-0 px-2" style="font-size:1rem;line-height:1;vertical-align:middle;" onclick="removeDefaultDailyTask('${taskId}')">-</button>`;
      }
    }

    if (task.type === 'check' || task.type === 'servercheck') {
      li.style.cursor = 'pointer';
      // 항목 클릭 시 토글 실행 (삭제 버튼 클릭 시 제외)
      li.onclick = function (e) {
        if (e.target.tagName.toLowerCase() === 'button') return;
        toggleTask(idx, taskId);
      };
      li.innerHTML = `<span>${task.name} ${minusBtn}</span><div class="form-switch"><input type="checkbox" class="form-check-input" style="width:2.2em;height:1.2em;pointer-events:none;" id="task-${taskId}-${idx}" ${char.tasks[taskId] ? 'checked' : ''}></div>`;
    } else if (task.type === 'select-count') {
      const val = typeof char.tasks[taskId] === 'number' ? char.tasks[taskId] : task.max;
      let btns = '';
      for (let n = task.max; n >= 0; n--) {
        btns += `<button class="btn btn-sm px-2 me-1 ${val === n ? 'btn-success' : 'btn-outline-secondary'}" style="font-size: 0.75rem;" onclick="selectCount(${idx}, '${taskId}', ${n})">${n}</button>`;
      }
      li.innerHTML = `<span class="text-truncate me-2">${task.name} ${minusBtn}</span><span style="white-space: nowrap; flex-shrink: 0;">${btns}</span>`;
    }
    ul.appendChild(li);
  });

  // --- 주간 퀘스트 섹션 ---
  let weeklyHeader = document.createElement('li');
  weeklyHeader.className = 'list-group-item fw-bold mt-3 mb-1 px-2 border-0 d-flex align-items-center justify-content-between weekly-header rounded';
  weeklyHeader.style.fontSize = '1.05rem'; weeklyHeader.style.color = 'var(--text-main)';
  weeklyHeader.innerHTML = `
    <span>주간 퀘스트</span>
    <span>
      <button class="btn btn-sm p-1 text-primary" onclick="addUserWeeklyTask()" title="추가">+</button>
      <button class="btn btn-sm p-1 text-danger" onclick="toggleDeleteMode(${idx})" title="편집">-</button>
    </span>
  `;
  ul.appendChild(weeklyHeader);

  // weeklyTasksOrder 순서대로 렌더링
  weeklyTasksOrder.forEach(taskId => {
    if (removedWeeklyTaskIds.includes(taskId)) return;

    let task = WEEKLY_TASKS.find(t => t.id === taskId) || userWeeklyTasks.find(t => t.id === taskId);
    if (!task) return;

    const isUserTask = !WEEKLY_TASKS.some(t => t.id === taskId);
    let li = document.createElement('li');
    li.className = 'list-group-item d-flex align-items-center justify-content-between dark-bg';

    let minusBtn = '';
    if (showDeleteButtons[idx]) {
      if (isUserTask) {
        minusBtn = `<button class="btn btn-sm btn-outline-danger ms-2 py-0 px-2" style="font-size:1rem;line-height:1;vertical-align:middle;" onclick="removeUserWeeklyTask('${taskId}')">-</button>`;
      } else {
        minusBtn = `<button class="btn btn-sm btn-outline-danger ms-2 py-0 px-2" style="font-size:1rem;line-height:1;vertical-align:middle;" onclick="removeDefaultWeeklyTask('${taskId}')">-</button>`;
      }
    }

    if (task.type === 'check' || task.type === 'servercheck') {
      li.style.cursor = 'pointer';
      // 항목 클릭 시 토글 실행 (삭제 버튼 클릭 시 제외)
      li.onclick = function (e) {
        if (e.target.tagName.toLowerCase() === 'button') return;
        toggleTask(idx, taskId);
      };
      li.innerHTML = `<span>${task.name} ${minusBtn}</span><div class="form-switch"><input type="checkbox" class="form-check-input" style="width:2.2em;height:1.2em;pointer-events:none;" id="task-${taskId}-${idx}" ${char.tasks[taskId] ? 'checked' : ''}></div>`;
      ul.appendChild(li);
    } else if (task.type === 'select-count') {
      const val = typeof char.tasks[taskId] === 'number' ? char.tasks[taskId] : task.max;
      let btns = '';
      for (let n = task.max; n >= 0; n--) {
        btns += `<button class="btn btn-sm px-2 me-1 ${val === n ? 'btn-success' : 'btn-outline-secondary'}" style="font-size: 0.75rem;" onclick="selectCount(${idx}, '${taskId}', ${n})">${n}</button>`;
      }
      li.innerHTML = `<span class="text-truncate me-2">${task.name} ${minusBtn}</span><span style="white-space: nowrap; flex-shrink: 0;">${btns}</span>`;
      ul.appendChild(li);
    } else if (task.type === 'fieldboss-group') {
      let checkedCount = FIELD_BOSSES.reduce((sum, boss) => sum + (char.tasks[boss.id] ? 1 : 0), 0);
      let bossList = FIELD_BOSSES.map(boss => {
        return `<div class="form-check form-switch d-flex align-items-center justify-content-between mb-1 boss-item" style="cursor: pointer;" onclick="toggleFieldBoss(${idx}, '${boss.id}')">
          <span class="small">${boss.name}</span>
          <input class="form-check-input" type="checkbox" id="boss-${boss.id}-${idx}" ${char.tasks[boss.id] ? 'checked' : ''} style="pointer-events: none;">
        </div>`;
      }).join('');
      const highlight = checkedCount === 3 ? 'text-success fw-bold' : '';
      li.innerHTML = `<div class="w-100">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <span class="small">주간 필드보스 (최대 3) ${minusBtn}</span>
          <small class="${highlight}">${checkedCount}/3</small>
        </div>
        <div class="ps-2 border-start ms-1" style="border-width: 2px !important;">
          ${bossList}
        </div>
      </div>`;
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

window.addCharacter = function () {
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
      history.pushState({}, '', '/' + CURRENT_SYNC_CODE);
    }
  }
};

window.showDeleteConfirm = function (idx) {
  const footer = document.getElementById(`char-footer-${idx}`);
  if (!footer) return;
  footer.innerHTML = `
    <div class="mb-2 text-danger small">정말 삭제할까요?</div>
    <div class="d-flex justify-content-center gap-2">
      <button class="btn btn-sm btn-danger" onclick="deleteCharacter(${idx})">삭제</button>
      <button class="btn btn-sm btn-secondary" onclick="cancelDelete(${idx})">취소</button>
    </div>
  `;
};

window.cancelDelete = function (idx) {
  const footer = document.getElementById(`char-footer-${idx}`);
  if (!footer) return;
  footer.innerHTML = `<button class="btn btn-sm btn-danger" onclick="showDeleteConfirm(${idx})">캐릭터 삭제</button>`;
};

window.deleteCharacter = function (idx) {
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

window.editName = function (idx) {
  const name = prompt('새 캐릭터 이름을 입력하세요:', characters[idx].name);
  if (name) {
    characters[idx].name = name;
    saveData();
    renderCharacters();
  }
};

window.toggleTask = function (idx, taskId) {
  // 계정공유(servercheck) 타입 처리
  let isServerCheck = false;

  // 기본 퀘스트 확인
  let task = DAILY_TASKS.find(t => t.id === taskId) || WEEKLY_TASKS.find(t => t.id === taskId);
  // 사용자 추가 퀘스트 확인
  if (!task) {
    task = userDailyTasks.find(t => t.id === taskId) || userWeeklyTasks.find(t => t.id === taskId);
  }

  if (task && task.type === 'servercheck') isServerCheck = true;

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
  renderCharacterTasks(idx);
};

window.toggleFieldBoss = function (idx, bossId) {
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

window.changeCount = function (idx, taskId, delta) {
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

window.selectCount = function (idx, taskId, count) {
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

document.getElementById('quest-popup-add').addEventListener('click', function () {
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

  const newID = (questPopupMode === 'daily' ? 'ud-' : 'uw-') + Date.now();
  const newTask = { id: newID, name, type, max };

  if (questPopupMode === 'daily') {
    userDailyTasks.push(newTask);
    dailyTasksOrder.push(newID);
    if (type === 'servercheck') {
      characters.forEach(char => {
        if (!char.tasks) return;
        delete char.tasks[newID];
      });
    }
  } else {
    userWeeklyTasks.push(newTask);
    weeklyTasksOrder.push(newID);
    if (type === 'servercheck') {
      characters.forEach(char => {
        if (!char.tasks) return;
        delete char.tasks[newID];
      });
    }
  }
  saveData();
  renderCharacters();
  hideQuestPopup();
});

// 기존 prompt 방식 제거, 버튼에서 팝업 호출로 변경
window.addUserDailyTask = function () {
  showQuestPopup('daily');
};
window.addUserWeeklyTask = function () {
  showQuestPopup('weekly');
};

window.removeDefaultDailyTask = function (taskId) {
  if (!removedDailyTaskIds.includes(taskId)) removedDailyTaskIds.push(taskId);
  characters.forEach(char => {
    if (!char.tasks) return;
    delete char.tasks[taskId];
  });
  saveData();
  renderCharacters();
};

window.removeDefaultWeeklyTask = function (taskId) {
  if (!removedWeeklyTaskIds.includes(taskId)) removedWeeklyTaskIds.push(taskId);
  characters.forEach(char => {
    if (!char.tasks) return;
    delete char.tasks[taskId];
  });
  saveData();
  renderCharacters();
};

window.removeUserDailyTask = function (taskId) {
  userDailyTasks = userDailyTasks.filter(t => t.id !== taskId);
  dailyTasksOrder = dailyTasksOrder.filter(id => id !== taskId);
  characters.forEach(char => {
    if (!char.tasks) return;
    delete char.tasks[taskId];
  });
  saveData();
  renderCharacters();
};

window.removeUserWeeklyTask = function (taskId) {
  userWeeklyTasks = userWeeklyTasks.filter(t => t.id !== taskId);
  weeklyTasksOrder = weeklyTasksOrder.filter(id => id !== taskId);
  characters.forEach(char => {
    if (!char.tasks) return;
    delete char.tasks[taskId];
  });
  saveData();
  renderCharacters();
};

window.toggleDeleteMode = function (idx) {
  showDeleteButtons[idx] = !showDeleteButtons[idx];
  renderCharacterTasks(idx);
};

window.resetAllData = function () {
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

window.resetQuestItems = function () {
  if (!confirm('변경했던 퀘스트 항목만 초기화할까요? 캐릭터/진행상황은 유지됩니다.')) return;
  removedDailyTaskIds = [];
  removedWeeklyTaskIds = [];
  userDailyTasks = [];
  userWeeklyTasks = [];
  dailyTasksOrder = DAILY_TASKS.map(t => t.id);
  weeklyTasksOrder = WEEKLY_TASKS.map(t => t.id);
  saveData();
  renderCharacters();
  showMessage('퀘스트 항목이 초기화되었습니다.', 'success');
};

window.toggleDataManagement = function () {
  const area = document.getElementById('data-management-area');
  const btnArea = document.getElementById('data-management-btn-area');
  if (area.style.display === 'none') {
    area.style.display = 'block';
    btnArea.style.display = 'none';
  } else {
    area.style.display = 'none';
    btnArea.style.display = 'block';
  }
};

// 페이지 로드 시 데이터 불러오기
loadData().then(renderCharacters);

// 메모 팝업 관련
let memoPopupIdx = null;
let memoPopupInitialValue = '';
function showMemoPopup(idx) {
  memoPopupIdx = idx;
  let popup = document.getElementById('memo-popup');
  let bg = document.getElementById('memo-popup-bg');
  const charName = characters[idx]?.name || '';
  memoPopupInitialValue = characters[idx].memo || '';
  if (!bg) {
    bg = document.createElement('div');
    bg.id = 'memo-popup-bg';
    bg.className = 'memo-popup-bg';
    document.body.appendChild(bg);
  } else {
    bg.style.display = 'block';
    bg.className = 'memo-popup-bg';
  }
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'memo-popup';
    popup.className = 'memo-popup';
    popup.innerHTML = `
      <div id="memo-popup-title" class="memo-popup-title" style="cursor: move; padding-bottom: 10px; border-bottom: 1px solid var(--border-color);">${charName} 메모</div>
      <div class="mt-3">
        <textarea id="memo-textarea" class="memo-textarea" style="width: 100%; height: 250px; font-size: 1rem; border: 1px solid var(--border-color);"></textarea>
      </div>
      <div class="d-flex justify-content-center gap-2 mt-4">
        <button class="btn btn-primary px-5" id="memo-save-btn">저장</button>
        <button class="btn btn-secondary px-4" id="memo-cancel-btn">취소</button>
      </div>
    `;
    document.body.appendChild(popup);
  }
  // 팝업을 열 때마다 중앙 위치로 초기화
  popup.style.display = 'block';
  popup.className = 'memo-popup';
  popup.style.left = '50%';
  popup.style.top = '50%';
  popup.style.transform = 'translate(-50%, -50%)';
  document.getElementById('memo-textarea').className = 'memo-textarea';
  document.getElementById('memo-textarea').value = memoPopupInitialValue;
  document.querySelector('#memo-popup-title').textContent = `${charName}에 관한 메모`;

  // jQuery UI 드래그 기능 재설정 (기존 이벤트 제거 후 새로 추가)
  if (window.jQuery && window.jQuery.fn.draggable) {
    const $popup = window.jQuery('#memo-popup');
    // 기존 draggable 제거
    if ($popup.hasClass('ui-draggable')) {
      $popup.draggable('destroy');
    }
    // 새로 draggable 적용
    $popup.draggable({
      handle: '#memo-popup-title',
      containment: 'window', // 팝업이 화면 바깥으로 나가지 않도록 제한
      start: function (event, ui) {
        // 드래그 시작 시 transform을 제거하고 절대 위치 계산
        const $this = window.jQuery(this);

        // 현재 transform이 적용된 상태에서의 실제 위치 계산
        // getBoundingClientRect는 transform 적용 후 위치를 반환
        const rect = this.getBoundingClientRect();

        // transform을 제거하고 left, top을 설정
        // 50%, 50% 위치에서 translate(-50%, -50%)가 적용된 상태이므로
        // 실제 위치는 rect.left, rect.top이 맞음
        $this.css({
          left: rect.left + 'px',
          top: rect.top + 'px',
          transform: 'none'
        });
      }
    });
  }
  const saveBtn = document.getElementById('memo-save-btn');
  saveBtn.onclick = saveMemoAndClose;

  const cancelBtn = document.getElementById('memo-cancel-btn');
  cancelBtn.onclick = function () {
    memoPopupIdx = null;
    document.getElementById('memo-popup').style.display = 'none';
    document.getElementById('memo-popup-bg').style.display = 'none';
  };
  bg.onclick = saveMemoAndClose;
}
window.showMemoPopup = showMemoPopup;
function saveMemoAndClose() {
  if (memoPopupIdx !== null) {
    const val = document.getElementById('memo-textarea').value;
    if (!characters[memoPopupIdx]) characters[memoPopupIdx] = { name: '', tasks: {}, memo: '' };
    if (val !== memoPopupInitialValue) {
      characters[memoPopupIdx].memo = val;
      saveData();
    }
    memoPopupIdx = null;
    memoPopupInitialValue = '';
  }
  const popup = document.getElementById('memo-popup');
  const bg = document.getElementById('memo-popup-bg');
  if (popup) popup.style.display = 'none';
  if (bg) bg.style.display = 'none';
}

// --- 순서 편집 기능 ---
window.showOrderEditPopup = function () {
  const bg = document.getElementById('order-popup-bg');
  const popup = document.getElementById('order-popup');
  const dailyUl = document.getElementById('sortable-daily');
  const weeklyUl = document.getElementById('sortable-weekly');

  dailyUl.innerHTML = '';
  weeklyUl.innerHTML = '';

  // 일일 퀘스트 목록 생성 (기본 + 사용자 정의)
  dailyTasksOrder.forEach(id => {
    if (removedDailyTaskIds.includes(id)) return;
    const task = DAILY_TASKS.find(t => t.id === id) || userDailyTasks.find(t => t.id === id);
    if (!task) return;
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex align-items-center gap-2 mb-1 border rounded cursor-move dark-bg';
    li.style.cursor = 'move';
    li.dataset.id = id;
    li.innerHTML = `<span class="ui-icon ui-icon-arrowthick-2-n-s"></span> ${task.name}`;
    dailyUl.appendChild(li);
  });

  // 주간 퀘스트 목록 생성 (기본 + 사용자 정의)
  weeklyTasksOrder.forEach(id => {
    if (removedWeeklyTaskIds.includes(id)) return;
    const task = WEEKLY_TASKS.find(t => t.id === id) || userWeeklyTasks.find(t => t.id === id);
    if (!task) return;
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex align-items-center gap-2 mb-1 border rounded cursor-move dark-bg';
    li.style.cursor = 'move';
    li.dataset.id = id;
    li.innerHTML = `<span class="ui-icon ui-icon-arrowthick-2-n-s"></span> ${task.name}`;
    weeklyUl.appendChild(li);
  });

  bg.style.display = 'block';
  popup.style.display = 'block';

  // jQuery UI Sortable 초기화
  if (window.jQuery && window.jQuery.fn.sortable) {
    window.jQuery("#sortable-daily, #sortable-weekly").sortable({
      placeholder: "ui-state-highlight",
      forcePlaceholderSize: true,
      delay: 0,
      distance: 0,
      opacity: 0.8,
      axis: "y" // 세로 방향으로만 드래그 제한 (선택 사항)
    }).disableSelection();
  }
};

window.hideOrderEditPopup = function () {
  document.getElementById('order-popup-bg').style.display = 'none';
  document.getElementById('order-popup').style.display = 'none';
};

window.saveOrder = function () {
  const dailyIds = [];
  document.querySelectorAll('#sortable-daily li').forEach(li => {
    dailyIds.push(li.dataset.id);
  });
  // 숨겨진(삭제된) 일일 항목들 뒤에 보존
  removedDailyTaskIds.forEach(id => {
    if (!dailyIds.includes(id)) dailyIds.push(id);
  });

  const weeklyIds = [];
  document.querySelectorAll('#sortable-weekly li').forEach(li => {
    weeklyIds.push(li.dataset.id);
  });
  // 숨겨진(삭제된) 주간 항목들 뒤에 보존
  removedWeeklyTaskIds.forEach(id => {
    if (!weeklyIds.includes(id)) weeklyIds.push(id);
  });

  if (dailyIds.length > 0) dailyTasksOrder = dailyIds;
  if (weeklyIds.length > 0) weeklyTasksOrder = weeklyIds;

  saveData();
  renderCharacters();
  hideOrderEditPopup();
  showMessage('순서가 저장되었습니다.', 'success');
};
