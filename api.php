<?php

// 1. 허용할 출처(Origin) 목록 정의
//    Live Server가 사용하는 두 주소를 모두 넣어줍니다.
$allowed_origins = [
    'http://127.0.0.1',
    'http://localhost',
    'https://mobinogi.elmi.page'
];

// 2. 브라우저가 보낸 Origin 헤더가 있는지, 그리고 허용 목록에 있는지 확인
if (isset($_SERVER['HTTP_ORIGIN']) && in_array($_SERVER['HTTP_ORIGIN'], $allowed_origins)) {
    $origin = $_SERVER['HTTP_ORIGIN'];

    // 3. 허용된 출처에 대한 헤더 전송
    header("Access-Control-Allow-Origin: " . $origin);
    header("Access-Control-Allow-Credentials: true");
    header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With"); // 클라이언트가 보낼 수 있는 헤더 목록
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS"); // 허용할 HTTP 메소드
    header("Access-Control-Max-Age: 1728000"); // 사전 요청 캐시 시간 (20일)
}

// 4. 브라우저의 사전 요청(Preflight, OPTIONS)에 대한 응답 처리
//    이 부분이 가장 중요합니다. OPTIONS 요청이 오면 여기서 스크립트를 종료해야 합니다.
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(204); // "OK" 신호 (204 No Content)
    exit; // 스크립트 실행을 즉시 종료
}

// ======================= CORS 처리 끝 =======================

// mobinogi-api.elmi.page: 메인 API 엔드포인트
header('Content-Type: application/json; charset=utf-8');

$config = require __DIR__ . '/config.php';
$pdo = new PDO(
    "mysql:host={$config['host']};dbname={$config['dbname']};charset={$config['charset']}",
    $config['user'],
    $config['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

function json_response($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['action'] ?? '';

// 1. 데이터 취득
if ($method === 'GET' && $path === 'data') {
    $sync_id = $_GET['sync_id'] ?? '';
    if (!$sync_id || strlen($sync_id) !== 8)
        json_response(['error' => 'invalid sync_id'], 400);
    $stmt = $pdo->prepare('SELECT data_json FROM mobinogi_checklist WHERE sync_id = ?');
    $stmt->execute([$sync_id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row)
        json_response(['error' => 'not found'], 404);
    json_response(['data' => json_decode($row['data_json'], true)]);
}

// 1.5. 숏코드 확인 (sync_id 존재 여부 확인)
if ($method === 'GET' && $path === 'shortcode') {
    $short_code = $_GET['short_code'] ?? '';
    if (!$short_code || strlen($short_code) !== 8)
        json_response(['error' => 'invalid short_code'], 400);

    // sync_id가 존재하는지 확인
    $stmt = $pdo->prepare('SELECT sync_id FROM mobinogi_checklist WHERE sync_id = ?');
    $stmt->execute([$short_code]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row)
        json_response(['error' => 'not found'], 404);

    // 존재하면 sync_id 반환 (숏코드 = sync_id)
    json_response(['sync_id' => $row['sync_id']]);
}

// 2. 데이터 저장(생성/갱신)
if ($method === 'POST' && $path === 'data') {
    $input = json_decode(file_get_contents('php://input'), true);
    $sync_id = $input['sync_id'] ?? '';
    $data = $input['data'] ?? null;
    if (!$sync_id || strlen($sync_id) !== 8 || !$data) {
        json_response(['error' => 'invalid input'], 400);
    }
    $data_json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    // mobinogi_checklist upsert
    $pdo->prepare('INSERT INTO mobinogi_checklist (sync_id, data_json, created_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE data_json=VALUES(data_json), updated_at=NOW()')
        ->execute([$sync_id, $data_json]);
    json_response(['result' => 'ok']);
}

// 3. 데이터 삭제 (sync_id 기준)
if ($method === 'POST' && $path === 'delete') {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true);
    $sync_id = $input['sync_id'] ?? '';
    if (!$sync_id || strlen($sync_id) !== 8) {
        json_response([
            'error' => 'invalid sync_id'
        ], 400);
    }
    $stmt = $pdo->prepare('DELETE FROM mobinogi_checklist WHERE sync_id = ?');
    $stmt->execute([$sync_id]);
    if ($stmt->rowCount() === 0) {
        json_response([
            'error' => 'not found or already deleted'
        ], 404);
    }
    json_response(['result' => 'deleted']);
}

json_response(['error' => 'invalid endpoint'], 404);
