<?php
/* Rens Dynamics Logistics — WhatsApp / Email Booking Parser */
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
$text = isset($body['text']) ? $body['text'] : (isset($_POST['text']) ? $_POST['text'] : '');
$text = substr(trim((string)$text), 0, 6000);

if (empty($text)) {
    http_response_code(400);
    echo json_encode(['error' => 'no text provided']);
    exit();
}

// Fallback Heuristic Parser for Malaysian Logistics WhatsApp Messages
function heuristicParse($raw) {
    $c = [
        'customer_name' => null,
        'pickup_location' => null,
        'dropoff_location' => null,
        'collection_date' => null,
        'pickup_time' => null,
        'dropoff_time' => null,
        'cargo_desc' => null,
        'lorry_spec' => null,
        'weight_desc' => null,
        'customer_ref' => null,
        'special_instructions' => null,
        'suggested_driver' => null,
        'urgent' => false
    ];

    if (preg_match('/\b(urgent|asap|segera|kecemasan)\b/i', $raw)) {
        $c['urgent'] = true;
    }

    // Collection Date
    if (preg_match('/(?:date arrive|collection date|tarikh|date|pickup date)[:\s]*([^\n\r]+)/i', $raw, $m)) {
        $c['collection_date'] = trim($m[1]);
    } elseif (preg_match('/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/', $raw, $m)) {
        $c['collection_date'] = trim($m[1]);
    }

    // Times
    if (preg_match('/(?:pickup time|ready|part ready|pickup|load time)[:\s]*([^\n\r,]+)/i', $raw, $m)) {
        $c['pickup_time'] = trim($m[1]);
    }
    if (preg_match('/(?:dropoff time|time before|delivery time|unload time|reach)[:\s]*([^\n\r,]+)/i', $raw, $m)) {
        $c['dropoff_time'] = trim($m[1]);
    }

    // Vehicle Spec / Tonnage
    if (preg_match('/(1\s*ton|3\s*ton|5\s*ton|10\s*ton|14\s*ton|20\s*ton|9\s*ft|17\s*ft|24\s*ft|30\s*ft|40\s*ft|side curtain|canvas|curtain)/i', $raw, $m)) {
        $c['lorry_spec'] = trim($m[0]);
    }

    // Pickup & Dropoff
    if (preg_match('/(?:from|pickup|load at|dari)[:\s]*([^\n\r]+)/i', $raw, $m)) {
        $c['pickup_location'] = trim($m[1]);
    }
    if (preg_match('/(?:to|send to|pls send|hantar|dropoff|dest)[:\s]*([^\n\r]+)/i', $raw, $m)) {
        $c['dropoff_location'] = trim($m[1]);
    }

    // Customer Ref
    if (preg_match('/(?:po|p\/o|do|d\/o|so|ref|inv|quote|booking|q010\/[^\s]+)[:\s#]*([^\n\r,]+)/i', $raw, $m)) {
        $c['customer_ref'] = trim($m[1]);
    }

    return [$c];
}

$candidates = heuristicParse($text);
echo json_encode(['candidates' => $candidates]);
exit();
