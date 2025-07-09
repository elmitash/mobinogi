<?php
// mobinogi-api.elmi.page: 메인 API 엔드포인트
header('Content-Type: application/json; charset=utf-8');

$config = require __DIR__ . '/config.php';
$pdo = new PDO(
    "mysql:host={$config['host']};dbname={$config['dbname']};charset={$config['charset']}",
    $config['user'],
    $config['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

function json_response($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['action'] ?? '';

// 1. 숏코드로 uuid 조회
if ($method === 'GET' && $path === 'shortcode') {
    $short = $_GET['short_code'] ?? '';
    if (!$short || strlen($short) !== 6) json_response(['error'=>'invalid short_code'], 400);
    $stmt = $pdo->prepare('SELECT sync_id FROM mobinogi_sync_code WHERE short_code = ?');
    $stmt->execute([$short]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) json_response(['error'=>'not found'], 404);
    json_response(['sync_id'=>$row['sync_id']]);
}

// 2. uuid로 데이터 조회
if ($method === 'GET' && $path === 'data') {
    $sync_id = $_GET['sync_id'] ?? '';
    if (!$sync_id || strlen($sync_id) < 32) json_response(['error'=>'invalid sync_id'], 400);
    $stmt = $pdo->prepare('SELECT data_json FROM mobinogi_checklist WHERE sync_id = ?');
    $stmt->execute([$sync_id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) json_response(['error'=>'not found'], 404);
    json_response(['data'=>json_decode($row['data_json'], true)]);
}

// 3. 데이터 저장(생성/갱신) + 숏코드 매핑
if ($method === 'POST' && $path === 'data') {
    $input = json_decode(file_get_contents('php://input'), true);
    $sync_id = $input['sync_id'] ?? '';
    $short_code = $input['short_code'] ?? '';
    $data = $input['data'] ?? null;
    if (!$sync_id || strlen($sync_id) < 32 || !$short_code || strlen($short_code) !== 6 || !$data) {
        json_response(['error'=>'invalid input'], 400);
    }
    $data_json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    // 1. mobinogi_checklist upsert
    $pdo->prepare('INSERT INTO mobinogi_checklist (sync_id, data_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE data_json=VALUES(data_json), updated_at=NOW()')
        ->execute([$sync_id, $data_json]);
    // 2. mobinogi_sync_code upsert
    $pdo->prepare('INSERT INTO mobinogi_sync_code (short_code, sync_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE sync_id=VALUES(sync_id)')
        ->execute([$short_code, $sync_id]);
    json_response(['result'=>'ok']);
}

json_response(['error'=>'invalid endpoint'], 404);
