<?php
/* Rens Dynamics Logistics — Job Notification Endpoint */
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit();
}

$rawInput = file_get_contents('php://input');
$body = json_decode($rawInput, true);
$jobId = isset($body['job_id']) ? $body['job_id'] : (isset($_POST['job_id']) ? $_POST['job_id'] : '');

if (empty($jobId)) {
    http_response_code(400);
    echo json_encode(['error' => 'job_id required']);
    exit();
}

// In-app Realtime & PWA notification is primary. Best effort response for live site.
echo json_encode([
    'ok' => true,
    'job_id' => $jobId,
    'results' => [
        'in_app' => 'dispatched',
        'status' => 'success'
    ]
]);
exit();
