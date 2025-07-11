// 현재 세션에서 사용할 동기화 코드(숏코드) 변수
let CURRENT_SYNC_CODE = localStorage.getItem('mobinogi-sync-id') || '';

// URL이 /8자리숏코드 형식이면 자동 동기화
(function() {
  const path = location.pathname.replace(/^\//, '');
  // API 주소 자동 선택 (필요시)
  let API_BASE;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    API_BASE = 'http://localhost/api.php';
  } else {
    API_BASE = 'https://mobinogi.elmi.page/api.php';
  }

  // 1. path가 8자리 숏코드일 경우
  if (/^[a-zA-Z0-9]{8}$/.test(path)) {
    // localStorage에 sync_id가 없거나 다르면 path(숏코드)로 저장
    if (!CURRENT_SYNC_CODE || CURRENT_SYNC_CODE !== path) {
      localStorage.setItem('mobinogi-sync-id', path);
      CURRENT_SYNC_CODE = path;
    }
    // 페이지 이동/새로고침 없음
    return;
  }

  // 2. 메인(/)일 경우
  if (path === '') {
    // localStorage에 동기화 코드(숏코드)가 있으면 /숏코드로 이동
    if (CURRENT_SYNC_CODE) {
      location.replace('/' + CURRENT_SYNC_CODE);
      return;
    }
    // 동기화 코드 없으면 그대로 메인(/) 상태
    return;
  }
})();

// 동기화 및 DB 관련 함수 분리

// sync_id를 공통 변수에서 가져오거나 새로 생성 (숏코드만)
function getOrCreateSyncId() {
  if (!CURRENT_SYNC_CODE) {
    // 8자리 랜덤 코드 생성
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    localStorage.setItem('mobinogi-sync-id', id);
    CURRENT_SYNC_CODE = id;
  }
  return CURRENT_SYNC_CODE;
}

// 숏코드(8자리) 반환 (없으면 빈 문자열)
function getShortCode() {
  return CURRENT_SYNC_CODE && CURRENT_SYNC_CODE.length === 8 ? CURRENT_SYNC_CODE : '';
}

// 메시지 영역에 메시지 표시 함수 (index.html에 message-area div 필요)
function showMessage(msg, type = 'info', center = false, persist = false) {
  const area = document.getElementById('message-area');
  if (!area) return;
  area.innerHTML = msg;
  area.className = 'alert ' +
    (type === 'error' ? 'alert-danger' : type === 'success' ? 'alert-success' : 'alert-info') +
    (center ? ' d-flex justify-content-center align-items-center' : '');
  area.style.display = 'block';
  area.style.fontWeight = 'normal';
  area.style.textAlign = 'center';
  // 공간 차지 방지: 메시지 없을 때 display:none, 메시지 있을 때만 block
  area.style.minHeight = '';
  if (center) {
    area.style.margin = '0 auto';
    area.style.float = 'none';
    area.style.position = 'static';
    area.style.transform = 'none';
    area.style.left = '0';
    area.style.right = '0';
    area.style.maxWidth = '420px';
    area.style.minWidth = '240px';
    area.style.boxShadow = '0 4px 24px rgba(0,0,0,0.10)';
    area.style.borderRadius = '16px';
    area.style.padding = '2em 1.5em';
    area.style.fontSize = '1.2rem';
  } else {
    area.style.position = '';
    area.style.top = '';
    area.style.left = '';
    area.style.transform = '';
    area.style.zIndex = '';
    area.style.minWidth = '';
    area.style.maxWidth = '';
    area.style.fontSize = '';
    area.style.textAlign = '';
    area.style.boxShadow = '';
    area.style.borderRadius = '';
    area.style.padding = '';
  }
  if (!persist) {
    setTimeout(() => {
      area.style.display = 'none';
      area.innerHTML = '';
    }, 5000);
  }
}

// 동기화 코드 입력 필드 표시 함수
function showSyncInputBox() {
  let area = document.getElementById('sync-input-area');
  if (!area) {
    area = document.createElement('div');
    area.id = 'sync-input-area';
    area.className = 'd-flex justify-content-center my-3';
    document.getElementById('sync-code-area').after(area);
  }
  area.innerHTML = `
    <div style="background:#fff;border-radius:1em;box-shadow:0 2px 16px rgba(0,0,0,0.10);padding:1.5em 1.2em;max-width:340px;width:100%;margin:0 auto;display:flex;flex-direction:column;align-items:center;">
      <label for='sync-input' style='font-weight:bold;font-size:1.1em;margin-bottom:0.7em;'>동기화 코드(숏코드) 입력</label>
      <input id='sync-input' type='text' maxlength='8' class='form-control text-center mb-2' style='font-size:1.5em;max-width:180px;letter-spacing:0.2em;' placeholder='8자리 코드'>
      <button class='btn btn-success w-100' onclick='submitSyncInput()'>동기화</button>
    </div>
  `;
  setTimeout(() => {
    document.getElementById('sync-input').focus();
  }, 100);
}

window.showSyncInputBox = showSyncInputBox;

// 동기화 코드 입력 제출 함수
function submitSyncInput() {
  const input = document.getElementById('sync-input').value.trim();
  if (!input || input.length !== 8) {
    showMessage('8자리 동기화 코드를 입력하세요.', 'error');
    return;
  }
  // 기존 importDataCode 로직 활용
  fetch('https://mobinogi.elmi.page/api.php?action=shortcode&short_code=' + input)
    .then(res => {
      if (!res.ok) throw new Error('not found');
      return res.json();
    })
    .then(result => {
      localStorage.setItem('mobinogi-sync-id', result.sync_id);
      CURRENT_SYNC_CODE = result.sync_id;
      showMessage('동기화가 완료되었습니다! 페이지를 새로고침합니다.', 'success');
      setTimeout(() => location.reload(), 1200);
    })
    .catch(() => {
      showMessage('해당 동기화 코드를 찾을 수 없습니다.', 'error');
    });
}
window.submitSyncInput = submitSyncInput;

// 기존 importDataCode 버튼을 showSyncInputBox로 연결
window.importDataCode = showSyncInputBox;

// window에 등록 (main.js에서는 import 하지 않고, sync.js만 window에 등록)
window.getOrCreateSyncId = getOrCreateSyncId;
window.getShortCode = getShortCode;

// 페이지 로드 시 동기화 코드 항상 표시
// renderSyncCode, URL replaceState 등은 코드가 있을 때만 동작
function renderSyncCode() {
  const area = document.getElementById('sync-code-area');
  const desc = document.getElementById('sync-desc-area');
  const urlArea = document.getElementById('sync-url-area');
  const code = window.getShortCode ? window.getShortCode() : '';
  const url = 'https://mobinogi.elmi.page/' + (code ? code : '');
  if (!area) return;
  if (code) {
    area.innerHTML = `<span style="font-size:1.3em;font-weight:bold;letter-spacing:0.18em;background:#fff3cd;padding:0.18em 0.7em;border-radius:0.5em;color:#b8860b;box-shadow:0 2px 8px #ffeeba;">동기화 코드: ${code}</span>`;
    area.style.display = '';
    if (desc) desc.style.display = '';
    if (urlArea) {
      urlArea.innerHTML = `<a href='${url}' target='_blank' rel='noopener' style='text-decoration:underline;color:#0d6efd;'>${url}</a>`;
    }
    if (location.pathname !== '/' + code) {
      history.replaceState(null, '', '/' + code);
    }
  } else {
    area.innerHTML = '';
    area.style.display = 'none';
    if (desc) desc.style.display = 'none';
    if (urlArea) {
      urlArea.innerHTML = `<a href='https://mobinogi.elmi.page/' target='_blank' rel='noopener' style='text-decoration:underline;color:#0d6efd;'>https://mobinogi.elmi.page/</a>`;
    }
    if (location.pathname !== '/') {
      history.replaceState(null, '', '/');
    }
  }
}
window.renderSyncCode = renderSyncCode;

document.addEventListener('DOMContentLoaded', function() {
  // sync-id가 있을 때만 동기화 코드/설명/URL 표시
  if (window.getShortCode && window.getShortCode()) {
    renderSyncCode();
    const code = document.getElementById('sync-code-area');
    if (code) code.style.display = '';
    const desc = document.getElementById('sync-desc-area');
    if (desc) desc.style.display = '';
    const urlArea = document.getElementById('sync-url-area');
    if (urlArea) urlArea.textContent = 'https://mobinogi.elmi.page/' + window.getShortCode();
  } else {
    const code = document.getElementById('sync-code-area');
    const desc = document.getElementById('sync-desc-area');
    if (code) code.style.display = 'none';
    if (desc) desc.style.display = 'none';
    const urlArea = document.getElementById('sync-url-area');
    if (urlArea) urlArea.textContent = 'https://mobinogi.elmi.page/';
  }
});

// 페이지 로드 시 동기화 코드가 있으면 URL에 항상 /숏코드 형태로 유지 (코드가 있을 때만)
(function() {
  // 최초 진입 시에는 sync-id가 localStorage에 없으면 아무 동작도 하지 않음
  const code = localStorage.getItem('mobinogi-sync-id');
  const short = code ? code.slice(0, 8) : '';
  const path = location.pathname.replace(/^\//, '');
  if (short && /^[a-zA-Z0-9]{8}$/.test(short) && path !== short) {
    history.replaceState({}, '', '/' + short);
  }
})();

// 다크 모드 토글 함수 및 버튼 추가
function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('mobinogi-dark-mode', document.body.classList.contains('dark-mode') ? '1' : '0');
}

// 페이지 로드 시 다크 모드 상태 복원
if (localStorage.getItem('mobinogi-dark-mode') === '1') {
  document.addEventListener('DOMContentLoaded', function() {
    document.body.classList.add('dark-mode');
  });
}

window.toggleDarkMode = toggleDarkMode;
