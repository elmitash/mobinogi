// 동기화 및 DB 관련 함수 분리

// 64자리 영숫자 UUID 생성 함수
function generateSyncId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 64; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// sync_id를 localStorage에서 가져오거나 새로 생성
function getOrCreateSyncId() {
  let id = localStorage.getItem('mobinogi-sync-id');
  if (!id) {
    id = generateSyncId();
    localStorage.setItem('mobinogi-sync-id', id);
  }
  return id;
}

// 숏코드(앞 6자리) 생성
function getShortCode() {
  const uuid = getOrCreateSyncId();
  return uuid.slice(0, 6);
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
    setTimeout(() => { area.style.display = 'none'; }, 5000);
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
      <input id='sync-input' type='text' maxlength='6' class='form-control text-center mb-2' style='font-size:1.5em;max-width:180px;letter-spacing:0.2em;' placeholder='6자리 코드'>
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
  if (!input || input.length !== 6) {
    showMessage('6자리 숏코드를 입력하세요.', 'error');
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
      showMessage('동기화가 완료되었습니다! 페이지를 새로고침합니다.', 'success');
      setTimeout(() => location.reload(), 1200);
    })
    .catch(() => {
      showMessage('해당 숏코드를 찾을 수 없습니다.', 'error');
    });
}
window.submitSyncInput = submitSyncInput;

// 기존 importDataCode 버튼을 showSyncInputBox로 연결
window.importDataCode = showSyncInputBox;

// window에 등록 (main.js에서는 import 하지 않고, sync.js만 window에 등록)
window.generateSyncId = generateSyncId;
window.getOrCreateSyncId = getOrCreateSyncId;
window.getShortCode = getShortCode;

// 페이지 로드 시 동기화 코드 항상 표시
function renderSyncCode() {
  const area = document.getElementById('sync-code-area');
  if (!area) return;
  const code = window.getShortCode ? window.getShortCode() : '';
  area.innerHTML = `<span style="font-size:1.3em;font-weight:bold;letter-spacing:0.18em;background:#fff3cd;padding:0.18em 0.7em;border-radius:0.5em;color:#b8860b;box-shadow:0 2px 8px #ffeeba;">${code}</span>`;
}
window.renderSyncCode = renderSyncCode;

document.addEventListener('DOMContentLoaded', renderSyncCode);
