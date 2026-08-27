<?php
/* Hostinger Production MySQL Database Proxy API — Resilient & Self-Healing */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Hostinger Database Connection
$host = 'localhost';
$db   = 'u745362362_renserp';
$user = 'u745362362_renserp';
$pass = 'Aedentek@123#';
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
    // Disable strict foreign key check blocks for rapid ERP operations
    $pdo->exec("SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'");
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
} catch (\PDOException $e) {
    http_response_code(200);
    echo json_encode(['connected' => false, 'error' => 'Database connection failed: ' . $e->getMessage()]);
    exit();
}

$allowedTables = [
    'jobs', 'customers', 'lorries', 'drivers', 'quotations', 
    'approvals', 'inventory_items', 'inventory_issuances', 
    'inventory_receipts', 'maintenance_records', 'staff', 
    'lorry_crew', 'job_crew', 'customer_rates', 'customer_price_lists', 'sales_invoices',
    'customer_contacts'
];

@ini_set('memory_limit', '256M');
@ini_set('post_max_size', '64M');
@ini_set('upload_max_filesize', '64M');
@ini_set('max_execution_time', '300');

// Helper: Ensure Core Tables Exist
function ensureTablesExist($pdo) {
    static $checked = false;
    if ($checked) return;
    $checked = true;

    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS `staff` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `name` VARCHAR(255) NOT NULL,
              `username` VARCHAR(100) DEFAULT NULL,
              `role` VARCHAR(50) NOT NULL DEFAULT 'admin',
              `pin` VARCHAR(20) NOT NULL DEFAULT '1234',
              `active` TINYINT(1) NOT NULL DEFAULT 1,
              `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
              `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `customers` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `company_name` VARCHAR(255) NOT NULL,
              `registration_no` VARCHAR(100) DEFAULT NULL,
              `contact_person` VARCHAR(255) DEFAULT NULL,
              `phone` VARCHAR(50) DEFAULT NULL,
              `email` VARCHAR(255) DEFAULT NULL,
              `billing_address` TEXT DEFAULT NULL,
              `payment_terms` VARCHAR(255) DEFAULT '30 days credit',
              `zone` VARCHAR(50) DEFAULT 'Zone A',
              `default_rate` DECIMAL(12,2) DEFAULT NULL,
              `notes` TEXT DEFAULT NULL,
              `is_new` TINYINT(1) DEFAULT 0,
              `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
              `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `drivers` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `name` VARCHAR(255) NOT NULL,
              `phone` VARCHAR(50) DEFAULT NULL,
              `pin` VARCHAR(20) NOT NULL DEFAULT '0000',
              `ic_no` VARCHAR(50) DEFAULT NULL,
              `ic_number` VARCHAR(50) DEFAULT NULL,
              `license_type` VARCHAR(100) DEFAULT NULL,
              `license_class` VARCHAR(100) DEFAULT NULL,
              `license_expiry` DATE DEFAULT NULL,
              `is_helper` TINYINT(1) NOT NULL DEFAULT 0,
              `status` VARCHAR(50) NOT NULL DEFAULT 'available',
              `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
              `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `lorries` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `plate_no` VARCHAR(50) NOT NULL,
              `capacity_desc` VARCHAR(255) DEFAULT NULL,
              `zone` VARCHAR(50) DEFAULT 'Zone A',
              `target` DECIMAL(12,2) DEFAULT 0.00,
              `monthly_target` DECIMAL(12,2) DEFAULT 0.00,
              `roadtax_expiry` DATE DEFAULT NULL,
              `road_tax_expiry` DATE DEFAULT NULL,
              `puspakom_expiry` DATE DEFAULT NULL,
              `insurance_expiry` DATE DEFAULT NULL,
              `permit_expiry` DATE DEFAULT NULL,
              `default_driver_id` VARCHAR(64) DEFAULT NULL,
              `status` VARCHAR(50) NOT NULL DEFAULT 'available',
              `notes` TEXT DEFAULT NULL,
              `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
              `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `quotations` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `quote_no` VARCHAR(64) NOT NULL,
              `customer_id` VARCHAR(64) DEFAULT NULL,
              `customer_name` VARCHAR(255) DEFAULT NULL,
              `customer_ref` VARCHAR(255) DEFAULT NULL,
              `pickup_location` TEXT DEFAULT NULL,
              `dropoff_location` TEXT DEFAULT NULL,
              `cargo_desc` TEXT DEFAULT NULL,
              `lorry_spec` VARCHAR(255) DEFAULT NULL,
              `weight_desc` VARCHAR(255) DEFAULT NULL,
              `collection_date` VARCHAR(100) DEFAULT NULL,
              `order_date` VARCHAR(100) DEFAULT NULL,
              `delivery_date` VARCHAR(100) DEFAULT NULL,
              `arrived_date` VARCHAR(100) DEFAULT NULL,
              `pickup_time` VARCHAR(100) DEFAULT NULL,
              `dropoff_time` VARCHAR(100) DEFAULT NULL,
              `loading_time` DATETIME DEFAULT NULL,
              `unloading_time` DATETIME DEFAULT NULL,
              `rate_amount` DECIMAL(12,2) DEFAULT NULL,
              `diesel_band` VARCHAR(50) DEFAULT NULL,
              `urgent` TINYINT(1) NOT NULL DEFAULT 0,
              `special_instructions` LONGTEXT DEFAULT NULL,
              `suggested_driver` VARCHAR(255) DEFAULT NULL,
              `notes` LONGTEXT DEFAULT NULL,
              `raw_message` LONGTEXT DEFAULT NULL,
              `status` VARCHAR(50) NOT NULL DEFAULT 'draft',
              `sent_at` DATETIME DEFAULT NULL,
              `client_confirmed_at` DATETIME DEFAULT NULL,
              `owner_approved_at` DATETIME DEFAULT NULL,
              `approved_by` VARCHAR(64) DEFAULT NULL,
              `decline_reason` TEXT DEFAULT NULL,
              `job_id` VARCHAR(64) DEFAULT NULL,
              `invoice_no` VARCHAR(100) DEFAULT NULL,
              `invoice_attachment` LONGTEXT DEFAULT NULL,
              `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
              `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `jobs` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `job_no` VARCHAR(64) NOT NULL,
              `quotation_id` VARCHAR(64) DEFAULT NULL,
              `customer_ref` VARCHAR(255) DEFAULT NULL,
              `customer_id` VARCHAR(64) DEFAULT NULL,
              `customer_name` VARCHAR(255) DEFAULT NULL,
              `lorry_id` VARCHAR(64) DEFAULT NULL,
              `driver_id` VARCHAR(64) DEFAULT NULL,
              `rate_amount` DECIMAL(12,2) DEFAULT 0.00,
              `diesel_amount` DECIMAL(12,2) DEFAULT 0.00,
              `tng_amount` DECIMAL(12,2) DEFAULT 0.00,
              `pickup_location` TEXT DEFAULT NULL,
              `dropoff_location` TEXT DEFAULT NULL,
              `collection_date` VARCHAR(100) DEFAULT NULL,
              `order_date` VARCHAR(100) DEFAULT NULL,
              `delivery_date` VARCHAR(100) DEFAULT NULL,
              `arrived_date` VARCHAR(100) DEFAULT NULL,
              `pickup_time` VARCHAR(100) DEFAULT NULL,
              `dropoff_time` VARCHAR(100) DEFAULT NULL,
              `loading_time` VARCHAR(100) DEFAULT NULL,
              `unloading_time` VARCHAR(100) DEFAULT NULL,
              `cargo_desc` TEXT DEFAULT NULL,
              `lorry_spec` VARCHAR(255) DEFAULT NULL,
              `weight_desc` VARCHAR(255) DEFAULT NULL,
              `urgent` TINYINT(1) NOT NULL DEFAULT 0,
              `special_instructions` LONGTEXT DEFAULT NULL,
              `notes` TEXT DEFAULT NULL,
              `status` VARCHAR(50) NOT NULL DEFAULT 'unassigned',
              `billed_status` VARCHAR(50) NOT NULL DEFAULT 'pending',
              `billed_at` DATETIME DEFAULT NULL,
              `started_at` DATETIME DEFAULT NULL,
              `delivered_at` DATETIME DEFAULT NULL,
              `pod_recipient` VARCHAR(255) DEFAULT NULL,
              `pod_notes` TEXT DEFAULT NULL,
              `pod_signature` LONGTEXT DEFAULT NULL,
              `pod_photo` LONGTEXT DEFAULT NULL,
              `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
              `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `approvals` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `ref_id` VARCHAR(64) NOT NULL,
              `item_type` VARCHAR(50) DEFAULT 'quotation',
              `kind` VARCHAR(50) DEFAULT 'quotation',
              `title` VARCHAR(255) DEFAULT NULL,
              `amount` DECIMAL(12,2) DEFAULT NULL,
              `status` VARCHAR(50) NOT NULL DEFAULT 'waiting',
              `requested_by` VARCHAR(255) DEFAULT NULL,
              `flagged` TINYINT(1) NOT NULL DEFAULT 0,
              `note` TEXT DEFAULT NULL,
              `invoice_attachment` LONGTEXT DEFAULT NULL,
              `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
              `resolved_at` DATETIME DEFAULT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `inventory_items` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `item_name` VARCHAR(255) DEFAULT NULL,
              `name` VARCHAR(255) DEFAULT NULL,
              `sku` VARCHAR(100) DEFAULT NULL,
              `category` VARCHAR(50) NOT NULL DEFAULT 'other',
              `unit` VARCHAR(50) NOT NULL DEFAULT 'pcs',
              `quantity` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `quantity_on_hand` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `min_quantity` DECIMAL(12,2) DEFAULT 0.00,
              `reorder_threshold` DECIMAL(12,2) DEFAULT 0.00,
              `cost_per_unit` DECIMAL(12,2) DEFAULT NULL,
              `unit_cost` DECIMAL(12,2) DEFAULT NULL,
              `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `inventory_issuances` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `item_id` VARCHAR(64) DEFAULT NULL,
              `lorry_id` VARCHAR(64) DEFAULT NULL,
              `maintenance_record_id` VARCHAR(64) DEFAULT NULL,
              `quantity` DECIMAL(12,2) NOT NULL DEFAULT 0,
              `unit_cost` DECIMAL(12,2) DEFAULT NULL,
              `approval_status` VARCHAR(50) NOT NULL DEFAULT 'pending',
              `approved_by` VARCHAR(64) DEFAULT NULL,
              `approved_at` DATETIME DEFAULT NULL,
              `requested_by` VARCHAR(64) DEFAULT NULL,
              `issued_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
              `notes` TEXT DEFAULT NULL,
              `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `inventory_receipts` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `item_id` VARCHAR(64) DEFAULT NULL,
              `quantity` DECIMAL(12,2) NOT NULL DEFAULT 0,
              `unit_cost` DECIMAL(12,2) DEFAULT NULL,
              `received_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
              `notes` TEXT DEFAULT NULL,
              `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `maintenance_records` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `lorry_id` VARCHAR(64) DEFAULT NULL,
              `service_type` VARCHAR(255) DEFAULT NULL,
              `description` TEXT DEFAULT NULL,
              `workshop` VARCHAR(255) DEFAULT NULL,
              `service_date` DATE DEFAULT NULL,
              `next_service_due` DATE DEFAULT NULL,
              `cost` DECIMAL(12,2) DEFAULT NULL,
              `status` VARCHAR(50) NOT NULL DEFAULT 'completed',
              `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `lorry_crew` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `lorry_id` VARCHAR(64) NOT NULL,
              `driver_id` VARCHAR(64) NOT NULL,
              `role` VARCHAR(50) NOT NULL DEFAULT 'crew'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `job_crew` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `job_id` VARCHAR(64) NOT NULL,
              `driver_id` VARCHAR(64) NOT NULL,
              `role` VARCHAR(50) NOT NULL DEFAULT 'crew'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `customer_rates` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `customer_id` VARCHAR(64) DEFAULT NULL,
              `origin` VARCHAR(255) NOT NULL,
              `destination` VARCHAR(255) NOT NULL,
              `lorry_spec` VARCHAR(255) DEFAULT NULL,
              `cargo_type` VARCHAR(255) DEFAULT 'General Cargo',
              `base_rate` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `extra_drop_charge` DECIMAL(12,2) DEFAULT 0.00,
              `helper_charge` DECIMAL(12,2) DEFAULT 0.00,
              `demurrage_hourly` DECIMAL(12,2) DEFAULT 0.00,
              `status` VARCHAR(50) NOT NULL DEFAULT 'active',
              `notes` TEXT DEFAULT NULL,
              `valid_from` DATE DEFAULT NULL,
              `valid_to` DATE DEFAULT NULL,
              `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `customer_price_lists` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `customer_id` VARCHAR(64) DEFAULT NULL,
              `zone` VARCHAR(50) DEFAULT NULL,
              `destination` VARCHAR(255) DEFAULT NULL,
              `client_tag` VARCHAR(255) DEFAULT NULL,
              `note` TEXT DEFAULT NULL,
              `tiers_json` LONGTEXT DEFAULT NULL,
              `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `sales_invoices` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `invoice_no` VARCHAR(64) NOT NULL UNIQUE,
              `customer_id` VARCHAR(64) NOT NULL,
              `job_ids` TEXT DEFAULT NULL,
              `invoice_date` DATE NOT NULL,
              `due_date` DATE DEFAULT NULL,
              `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `sst_rate` DECIMAL(6,4) DEFAULT 0.0600,
              `sst_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `total_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `payment_status` VARCHAR(50) NOT NULL DEFAULT 'pending',
              `payment_terms` VARCHAR(100) DEFAULT '30 Days',
              `paid_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `payment_date` DATE DEFAULT NULL,
              `payment_method` VARCHAR(100) DEFAULT NULL,
              `payment_ref` VARCHAR(255) DEFAULT NULL,
              `notes` TEXT DEFAULT NULL,
              `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
              `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS `customer_contacts` (
              `id` VARCHAR(64) NOT NULL PRIMARY KEY,
              `no` INT(11) DEFAULT NULL,
              `customer_name` VARCHAR(255) NOT NULL,
              `contact_person` VARCHAR(255) DEFAULT NULL,
              `contact_no` VARCHAR(255) DEFAULT NULL,
              `region` VARCHAR(255) DEFAULT NULL,
              `notes` TEXT DEFAULT NULL,
              `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
              `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");
    } catch (\Throwable $e) {}
}

// Auto-upgrade columns to LONGTEXT to support high-res photos, base64 images, and documents without truncation
function ensureLongTextColumns($pdo) {
    static $migrated = false;
    if ($migrated) return;
    $migrated = true;

    $columnsToUpgrade = [
        'quotations' => ['invoice_attachment', 'special_instructions', 'notes', 'raw_message'],
        'approvals' => ['invoice_attachment', 'note'],
        'jobs' => ['pod_photo', 'pod_signature', 'special_instructions', 'notes'],
        'customer_price_lists' => ['tiers_json'],
        'customers' => ['notes', 'billing_address'],
        'maintenance_records' => ['notes', 'description']
    ];

    foreach ($columnsToUpgrade as $tbl => $cols) {
        try {
            $stmt = $pdo->query("SHOW COLUMNS FROM `$tbl`");
            $existing = [];
            while ($r = $stmt->fetch()) {
                $existing[strtolower($r['Field'])] = strtolower($r['Type']);
            }
            foreach ($cols as $col) {
                $colLower = strtolower($col);
                if (!isset($existing[$colLower])) {
                    $pdo->exec("ALTER TABLE `$tbl` ADD COLUMN `$col` LONGTEXT DEFAULT NULL");
                } elseif (!str_contains($existing[$colLower], 'longtext') && !str_contains($existing[$colLower], 'mediumtext')) {
                    $pdo->exec("ALTER TABLE `$tbl` MODIFY COLUMN `$col` LONGTEXT DEFAULT NULL");
                }
            }
        } catch (\Throwable $e) {}
    }
}

function ensureDefaultAdmin($pdo) {
    try {
        $staffCount = (int)$pdo->query("SELECT COUNT(*) FROM `staff`")->fetchColumn();
        if ($staffCount === 0) {
            $pdo->exec("
                INSERT INTO `staff` (`id`, `name`, `username`, `role`, `pin`, `active`) VALUES
                ('staff-owner-1', 'Rens Admin', 'Dynamic', 'owner', '12345', 1),
                ('staff-admin-1', 'Logistics Operations', 'Admin', 'admin', '12345', 1)
                ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `pin`=VALUES(`pin`);
            ");
        }
    } catch (\Throwable $e) {}
}

ensureTablesExist($pdo);
ensureLongTextColumns($pdo);
ensureDefaultAdmin($pdo);

// Helper: Ensure columns exist in table dynamically
function ensureColumnsExist($pdo, $table, $keys) {
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM `$table`");
        $existingCols = [];
        while ($row = $stmt->fetch()) {
            $existingCols[strtolower($row['Field'])] = strtolower($row['Type']);
        }

        foreach ($keys as $k) {
            $safeCol = preg_replace('/[^a-zA-Z0-9_]/', '', $k);
            if (!$safeCol) continue;
            $safeColLower = strtolower($safeCol);

            $isLong = str_contains($safeColLower, 'attachment') || 
                      str_contains($safeColLower, 'photo') || 
                      str_contains($safeColLower, 'image') || 
                      str_contains($safeColLower, 'signature') || 
                      str_contains($safeColLower, 'file') || 
                      str_contains($safeColLower, 'json') || 
                      str_contains($safeColLower, 'data') || 
                      str_contains($safeColLower, 'message') || 
                      str_contains($safeColLower, 'notes') || 
                      str_contains($safeColLower, 'instruction');

            $colType = $isLong ? 'LONGTEXT' : 'TEXT';

            if (!isset($existingCols[$safeColLower])) {
                $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$safeCol` $colType DEFAULT NULL");
                $existingCols[$safeColLower] = strtolower($colType);
            } elseif ($isLong && !str_contains($existingCols[$safeColLower], 'longtext') && !str_contains($existingCols[$safeColLower], 'mediumtext')) {
                $pdo->exec("ALTER TABLE `$table` MODIFY COLUMN `$safeCol` LONGTEXT DEFAULT NULL");
                $existingCols[$safeColLower] = 'longtext';
            }
        }
    } catch (\Throwable $e) {}
}

// Helper: Sanitize row data types for MySQL
function sanitizeRowData($rowData) {
    $clean = [];
    foreach ($rowData as $k => $v) {
        $safeCol = preg_replace('/[^a-zA-Z0-9_]/', '', $k);
        if (!$safeCol) continue;

        if (is_bool($v)) {
            $clean[$safeCol] = $v ? 1 : 0;
        } elseif ($v === '' || $v === null) {
            $clean[$safeCol] = null;
        } elseif (is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/', $v)) {
            // Convert ISO-8601 string to MySQL DATETIME
            $ts = strtotime($v);
            $clean[$safeCol] = $ts ? date('Y-m-d H:i:s', $ts) : $v;
        } elseif (is_array($v) || is_object($v)) {
            $clean[$safeCol] = json_encode($v);
        } else {
            $clean[$safeCol] = $v;
        }
    }
    return $clean;
}

if (isset($_GET['action']) && in_array($_GET['action'], ['init', 'setup', 'migrate'])) {
    ensureTablesExist($pdo);
    echo json_encode(['success' => true, 'message' => 'Schema verified and initialized.']);
    exit();
}

$table = isset($_GET['table']) ? $_GET['table'] : '';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if ($table === 'status' || (isset($_GET['action']) && $_GET['action'] === 'status')) {
            echo json_encode([
                'connected' => true,
                'host' => $host,
                'port' => 3306,
                'database' => $db
            ]);
            exit();
        }

        if ((isset($_GET['action']) && in_array($_GET['action'], ['seed_demo', 'seed', 'seed_data'])) ||
            (isset($_POST['action']) && in_array($_POST['action'], ['seed_demo', 'seed', 'seed_data']))) {
            ensureDefaultAdmin($pdo);
            echo json_encode(['success' => true, 'message' => 'Clean database initialized with admin staff.']);
            exit();
        }

        if ((isset($_GET['action']) && in_array($_GET['action'], ['clear_quotes_and_jobs', 'clear_quotes', 'clear_jobs'])) ||
            (isset($_POST['action']) && in_array($_POST['action'], ['clear_quotes_and_jobs', 'clear_quotes', 'clear_jobs']))) {
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
            $tablesToDelete = ['job_crew', 'jobs', 'quotations', 'approvals', 'sales_invoices'];
            foreach ($tablesToDelete as $t) {
                try { $pdo->exec("DELETE FROM `$t`"); } catch (\Throwable $e) {}
            }
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
            echo json_encode(['success' => true, 'message' => 'All quotation and job records cleared.']);
            exit();
        }

        if ((isset($_GET['action']) && in_array($_GET['action'], ['clear_all_data', 'wipe_database', 'clear'])) || 
            (isset($_POST['action']) && in_array($_POST['action'], ['clear_all_data', 'wipe_database', 'clear']))) {
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
            $tablesToDelete = [
                'job_crew', 'inventory_issuances', 'inventory_receipts', 'maintenance_records',
                'jobs', 'quotations', 'approvals', 'lorry_crew',
                'lorries', 'drivers', 'customers', 'inventory_items',
                'customer_rates', 'customer_price_lists', 'sales_invoices',
                'customer_contacts'
            ];
            foreach ($tablesToDelete as $t) {
                try { $pdo->exec("DELETE FROM `$t`"); } catch (\Throwable $e) {}
            }
            try {
                $pdo->exec("DELETE FROM `staff`");
                $pdo->exec("INSERT INTO `staff` (`id`, `name`, `username`, `role`, `pin`, `active`) VALUES ('staff-owner-1', 'Rens Admin', 'Dynamic', 'owner', '12345', 1), ('staff-admin-1', 'Logistics Operations', 'Admin', 'admin', '12345', 1)");
            } catch (\Throwable $e) {}
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
            echo json_encode(['success' => true, 'message' => 'All database tables successfully cleared and reset.']);
            exit();
        }

        if (!$table || !in_array($table, $allowedTables)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid or missing table parameter']);
            exit();
        }

        $sql = "SELECT * FROM `$table`";
        $params = [];
        $whereClauses = [];

        $whereParam = isset($_GET['where']) ? $_GET['where'] : null;
        $parsedWhere = [];
        if ($whereParam) {
            $decoded = json_decode($whereParam, true);
            if (is_array($decoded)) $parsedWhere = $decoded;
        }

        if (!empty($parsedWhere)) {
            foreach ($parsedWhere as $cond) {
                if (isset($cond['col']) && isset($cond['val'])) {
                    $op = isset($cond['op']) && in_array(strtoupper($cond['op']), ['=', '!=', '<', '>', '<=', '>=', 'LIKE']) ? strtoupper($cond['op']) : '=';
                    $safeCol = preg_replace('/[^a-zA-Z0-9_]/', '', $cond['col']);
                    if ($op === 'LIKE') {
                        $whereClauses[] = "`$safeCol` LIKE ?";
                        $params[] = '%' . $cond['val'] . '%';
                    } else {
                        $whereClauses[] = "`$safeCol` $op ?";
                        $params[] = $cond['val'];
                    }
                }
            }
        } else {
            $reserved = ['table', 'where', 'order_by', 'order_dir', 'limit', 'action'];
            foreach ($_GET as $key => $val) {
                if (!in_array($key, $reserved) && $val !== null) {
                    $safeCol = preg_replace('/[^a-zA-Z0-9_]/', '', $key);
                    $whereClauses[] = "`$safeCol` = ?";
                    $params[] = $val;
                }
            }
        }

        if (!empty($whereClauses)) {
            $sql .= " WHERE " . implode(' AND ', $whereClauses);
        }

        if (isset($_GET['order_by']) && $_GET['order_by']) {
            $safeOrderCol = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['order_by']);
            $orderDir = (isset($_GET['order_dir']) && strtoupper($_GET['order_dir']) === 'DESC') ? 'DESC' : 'ASC';
            $sql .= " ORDER BY `$safeOrderCol` $orderDir";
        }

        if (isset($_GET['limit']) && is_numeric($_GET['limit'])) {
            $sql .= " LIMIT " . intval($_GET['limit']);
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        echo json_encode(['data' => $rows]);
        exit();
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        $targetTable = $table ?: (isset($input['table']) ? $input['table'] : '');
        $data = isset($input['data']) ? $input['data'] : null;

        if (!$targetTable || !in_array($targetTable, $allowedTables) || !$data) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid table or missing payload data']);
            exit();
        }

        $records = isset($data[0]) && is_array($data[0]) ? $data : [$data];
        $insertedResults = [];

        foreach ($records as $item) {
            $rowData = sanitizeRowData($item);
            if (!isset($rowData['id']) || empty($rowData['id'])) {
                $prefixMap = [
                    'customers' => 'cust',
                    'quotations' => 'quot',
                    'jobs' => 'job',
                    'approvals' => 'appr',
                    'drivers' => 'drv',
                    'lorries' => 'lry',
                    'staff' => 'stf',
                    'inventory_items' => 'item',
                    'inventory_issuances' => 'iss',
                    'inventory_receipts' => 'rcpt',
                    'maintenance_records' => 'maint',
                    'customer_rates' => 'rate',
                    'customer_price_lists' => 'cpl',
                    'sales_invoices' => 'inv'
                ];
                $pfx = isset($prefixMap[$targetTable]) ? $prefixMap[$targetTable] : 'rec';
                $rowData['id'] = $pfx . '_' . substr(md5(uniqid(rand(), true)), 0, 10);
            }

            $keys = array_keys($rowData);
            ensureColumnsExist($pdo, $targetTable, $keys);

            $escapedKeys = array_map(function($k) { return "`" . preg_replace('/[^a-zA-Z0-9_]/', '', $k) . "`"; }, $keys);
            $placeholders = array_fill(0, count($keys), '?');
            $updateAssignments = array_map(function($k) {
                $safe = preg_replace('/[^a-zA-Z0-9_]/', '', $k);
                return "`$safe` = VALUES(`$safe`)";
            }, $keys);

            $sql = "INSERT INTO `$targetTable` (" . implode(', ', $escapedKeys) . ") VALUES (" . implode(', ', $placeholders) . ") ON DUPLICATE KEY UPDATE " . implode(', ', $updateAssignments);
            $stmt = $pdo->prepare($sql);
            $stmt->execute(array_values($rowData));

            $insertedResults[] = ['id' => $rowData['id'], 'insertId' => $pdo->lastInsertId()];
        }

        echo json_encode(['success' => true, 'data' => $insertedResults]);
        exit();
    }

    if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
        $input = json_decode(file_get_contents('php://input'), true);
        $targetTable = $table ?: (isset($input['table']) ? $input['table'] : '');
        $data = isset($input['data']) ? $input['data'] : null;
        $where = isset($input['where']) ? $input['where'] : null;
        $targetId = isset($input['id']) ? $input['id'] : (isset($_GET['id']) ? $_GET['id'] : (isset($data['id']) ? $data['id'] : null));

        if (!$targetTable || !in_array($targetTable, $allowedTables) || !$data || !is_array($data)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid table or missing update data']);
            exit();
        }

        $cleanData = sanitizeRowData($data);
        $keys = array_keys($cleanData);
        ensureColumnsExist($pdo, $targetTable, $keys);

        $setClauses = [];
        $setValues = [];
        foreach ($cleanData as $k => $v) {
            $safeK = preg_replace('/[^a-zA-Z0-9_]/', '', $k);
            $setClauses[] = "`$safeK` = ?";
            $setValues[] = $v;
        }

        $whereClauses = [];
        $whereValues = [];
        if ($targetId) {
            $whereClauses[] = "`id` = ?";
            $whereValues[] = $targetId;
        } elseif (is_array($where) && !empty($where)) {
            foreach ($where as $cond) {
                if (isset($cond['col']) && isset($cond['val'])) {
                    $safeCol = preg_replace('/[^a-zA-Z0-9_]/', '', $cond['col']);
                    $whereClauses[] = "`$safeCol` = ?";
                    $whereValues[] = $cond['val'];
                }
            }
        }

        if (empty($whereClauses)) {
            http_response_code(400);
            echo json_encode(['error' => 'Where condition or id required for update']);
            exit();
        }

        $sql = "UPDATE `$targetTable` SET " . implode(', ', $setClauses) . " WHERE " . implode(' AND ', $whereClauses);
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge($setValues, $whereValues));

        echo json_encode(['success' => true, 'affectedRows' => $stmt->rowCount()]);
        exit();
    }

    if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
        $input = json_decode(file_get_contents('php://input'), true);
        $targetTable = $table ?: (isset($input['table']) ? $input['table'] : '');
        $where = isset($input['where']) ? $input['where'] : null;
        $targetId = isset($input['id']) ? $input['id'] : (isset($_GET['id']) ? $_GET['id'] : null);

        if (!$targetTable || !in_array($targetTable, $allowedTables)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid table']);
            exit();
        }

        $whereClauses = [];
        $whereValues = [];
        $isClearAll = (isset($input['clear_all']) && $input['clear_all']) || (isset($_GET['clear_all']) && $_GET['clear_all']);

        if ($targetId) {
            $whereClauses[] = "`id` = ?";
            $whereValues[] = $targetId;
        } elseif (is_array($where) && !empty($where)) {
            foreach ($where as $cond) {
                if (isset($cond['col']) && isset($cond['val'])) {
                    $safeCol = preg_replace('/[^a-zA-Z0-9_]/', '', $cond['col']);
                    $op = isset($cond['op']) && in_array(strtoupper($cond['op']), ['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE']) ? strtoupper($cond['op']) : '=';
                    if ($op === 'LIKE') {
                        $whereClauses[] = "`$safeCol` LIKE ?";
                        $whereValues[] = '%' . $cond['val'] . '%';
                    } else {
                        $whereClauses[] = "`$safeCol` $op ?";
                        $whereValues[] = $cond['val'];
                    }
                }
            }
        }

        if (empty($whereClauses) && !$isClearAll) {
            http_response_code(400);
            echo json_encode(['error' => 'Where condition, id, or clear_all required for delete']);
            exit();
        }

        $sql = "DELETE FROM `$targetTable`" . (empty($whereClauses) ? "" : (" WHERE " . implode(' AND ', $whereClauses)));
        $stmt = $pdo->prepare($sql);
        $stmt->execute($whereValues);

        echo json_encode(['success' => true, 'affectedRows' => $stmt->rowCount()]);
        exit();
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (\Throwable $e) {
    http_response_code(200);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
