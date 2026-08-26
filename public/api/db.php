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

ensureTablesExist($pdo);

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
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");

            // 1. Customers
            $pdo->exec("INSERT INTO `customers` (`id`, `company_name`, `registration_no`, `contact_person`, `phone`, `email`, `billing_address`, `payment_terms`, `zone`, `default_rate`, `notes`, `status`, `is_new`) VALUES
            ('cust-1', 'Top Glove Corporation Bhd', '199801018294 (474423-X)', 'Susan Lee (Head of Logistics)', '+60 3-7890 3111', 'logistics@topglove.com.my', 'Level 21, Top Glove Tower, 16, Persiaran Setia Dagang, Setia Alam, 40170 Shah Alam, Selangor', '30 days credit', 'Zone A - Klang Valley', 2800.00, 'Key accounts client. High volume weekly container and box trailer deliveries.', 'active', 0),
            ('cust-2', 'Nestle Logistics Malaysia', '198301015532 (110703-V)', 'Azlan Shah bin Ramli', '+60 3-7965 6000', 'dispatch.my@nestle.com', '22-1, 22nd Floor, Menara Surian, No. 1, Jalan PJU 7/3, Mutiara Damansara, 47810 Petaling Jaya, Selangor', '30 days credit', 'Zone A - Klang Valley', 1650.00, 'FMCG packaged food and beverage distribution center routing.', 'active', 0),
            ('cust-3', 'Petronas Lubricants International', '200701034821 (792850-D)', 'Ahmad Kamil (Supply Chain Lead)', '+60 6-351 8800', 'lubricant.dispatch@petronas.com.my', 'Melaka Lube Blending Plant, Kawasan Perindustrian Tangga Batu, 76400 Tanjung Kling, Melaka', '45 days credit', 'Zone B - Southern/Central', 3200.00, 'Industrial drum synthetic oils. HAZMAT and safety protocol compliance mandatory.', 'active', 0),
            ('cust-4', 'Panasonic Industrial Solutions', '197201000941 (12822-M)', 'Kenji Takahashi / Chong Wai', '+60 3-5891 1888', 'transport@my.panasonic.com', 'No. 3, Jalan Sesiku 15/2, Section 15, 40200 Shah Alam, Selangor', '30 days credit', 'Zone A - Klang Valley', 4100.00, 'Electronic components and motor assemblies. Air-ride suspension trailers preferred.', 'active', 0),
            ('cust-5', 'Sime Darby Oils Trading', '197801004510 (41544-T)', 'Faridah binti Yusof', '+60 7-251 1555', 'logistics@simedarbyoils.com', 'Pasir Gudang Refinery, Kawasan Perindustrian Pasir Gudang, 81700 Pasir Gudang, Johor', '30 days credit', 'Zone C - Southern', 3800.00, 'Edible oils & fats packaged goods transport between Pasir Gudang and Central hubs.', 'active', 0),
            ('cust-6', 'Yeo Hiap Seng (Malaysia) Bhd', '195901000058 (3405-X)', 'Vincent Tan', '+60 3-7787 3888', 'supplychain@yeos.com.my', '7, Jalan Tandang, 46050 Petaling Jaya, Selangor', '14 days credit', 'Zone A - Klang Valley', 2150.00, 'Beverage cartons and canned drinks dispatch. Pallet return tracking needed.', 'active', 0),
            ('cust-7', 'Texas Instruments Malaysia', '197201001392 (13277-K)', 'David Wong (Outbound Logistics)', '+60 6-289 1000', 'ti-malaysia-freight@ti.com', 'Free Trade Zone, Batu Berendam, 75350 Melaka', '30 days credit', 'Zone B - Southern/Central', 1900.00, 'Semiconductor precision cargo. Direct sealed airport freight to KLIA Cargo terminal.', 'active', 0),
            ('cust-8', 'F&N Beverages Marketing', '197301000214 (14187-U)', 'Siti Norazlina', '+60 3-5101 4288', 'distribution@fn.com.my', '1, Jalan Bukit Belimbing 26/38, Persiaran Kuala Selangor, Seksyen 26, 40400 Shah Alam, Selangor', '30 days credit', 'Zone A - Klang Valley', 2600.00, 'High volume soft drinks & isotonic drinks line. 24-ton curtain sider trailers utilized.', 'active', 0),
            ('cust-9', 'Hartalega Holdings Bhd', '200601022124 (741877-U)', 'K. Ravindran', '+60 3-6277 1733', 'shipping@hartalega.com.my', 'C-G-9, Jalan Dataran SD1, Dataran SD PJU 9, Bandar Sri Damansara, 52200 Kuala Lumpur', '30 days credit', 'Zone A - Klang Valley', 1450.00, 'Nitrile export gloves shipping from Next Generation Complex (NGC) Sepang to Northport.', 'active', 0),
            ('cust-10', 'Sunway Construction Group', '201401032422 (1108506-W)', 'Ir. Michael Chang', '+60 3-5639 9696', 'plantandfleet@sunway.com.my', 'Level 8, Menara Sunway, Jalan Lagoon Timur, Bandar Sunway, 47500 Subang Jaya, Selangor', '60 days credit', 'Zone A - Klang Valley', 5200.00, 'Heavy structural precast elements, rebar and heavy construction materials.', 'active', 0)
            ON DUPLICATE KEY UPDATE `company_name`=VALUES(`company_name`), `phone`=VALUES(`phone`), `email`=VALUES(`email`)");

            // 2. Customer Contacts
            $pdo->exec("INSERT INTO `customer_contacts` (`id`, `no`, `customer_name`, `contact_person`, `contact_no`, `region`, `notes`) VALUES
            ('contact-1', 1, 'Top Glove Corporation Bhd', 'Susan Lee (Logistics Manager)', '+60 12-345 6781', 'Selangor / Klang Valley', 'Gate 3 inbound receiving. Driver IC required for visitor badge registration.'),
            ('contact-2', 2, 'Nestle Logistics Malaysia', 'Azlan Shah (Distribution Lead)', '+60 17-889 2314', 'Selangor / Shah Alam', 'Delivery appointment slot must be pre-booked via Nestle Logistics Portal 24h prior.'),
            ('contact-3', 3, 'Petronas Lubricants International', 'Ahmad Kamil (Plant Logistics)', '+60 19-221 4055', 'Melaka / Southern', 'Mandatory PPE: Steel-toe boots, flame-retardant coverall, and industrial hard hat.'),
            ('contact-4', 4, 'Panasonic Industrial Solutions', 'Chong Wai Keong (Warehouse Supervisor)', '+60 12-998 1234', 'Selangor / Shah Alam', 'Unloading dock operational 08:30 to 17:00. Dedicated heavy forklift assistance on-site.'),
            ('contact-5', 5, 'Sime Darby Oils Trading', 'Faridah Yusof (Terminal Coordinator)', '+60 13-774 9011', 'Johor / Pasir Gudang', 'Tanker and drum trailer safety inspection prior to loading at Bay 4.'),
            ('contact-6', 6, 'Yeo Hiap Seng (Malaysia) Bhd', 'Vincent Tan (Warehouse Lead)', '+60 16-332 5590', 'Petaling Jaya / Selangor', 'Standard pallet exchange required (1-to-1 Chep / wooden pallet return note).'),
            ('contact-7', 7, 'Texas Instruments Malaysia', 'David Wong (Shipping Controller)', '+60 12-665 4432', 'Melaka Free Trade Zone', 'High-security cleanroom cargo. Box trailer customs seal must remain intact.'),
            ('contact-8', 8, 'F&N Beverages Marketing', 'Siti Norazlina (Logistics Planner)', '+60 17-443 8901', 'Shah Alam / Selangor', 'Beverage palletizing height max 1.6m. High-tension side strapping required.'),
            ('contact-9', 9, 'Hartalega Holdings Bhd', 'K. Ravindran (Dispatch Section)', '+60 18-229 1104', 'Sepang NGC Plant', 'Export container staging area. Direct terminal gate clearance via digital QR pass.'),
            ('contact-10', 10, 'Sunway Construction Group', 'Ir. Michael Chang (Project Manager)', '+60 19-338 7765', 'Subang / JB Site', 'Construction site delivery: Flatbed access only. On-site mobile crane standby required.')
            ON DUPLICATE KEY UPDATE `customer_name`=VALUES(`customer_name`), `contact_person`=VALUES(`contact_person`), `contact_no`=VALUES(`contact_no`)");

            // 3. Drivers
            $pdo->exec("INSERT INTO `drivers` (`id`, `name`, `phone`, `pin`, `ic_no`, `ic_number`, `license_type`, `license_class`, `license_expiry`, `is_helper`, `status`, `notes`) VALUES
            ('drv-1', 'Mohd Firdaus bin Abdullah', '+60 11-2345 6701', '1234', '850312-10-5423', '850312-10-5423', 'GDL Class E (Articulated Heavy / Trailer)', 'GDL Class E (Articulated Heavy / Trailer)', '2027-05-31', 0, 'available', 'Senior lead prime mover driver. 12 years long-haul container & trailer experience.'),
            ('drv-2', 'Subramaniam a/l Kumar', '+60 19-334 5502', '1234', '881105-08-6211', '881105-08-6211', 'GDL Class E (Articulated Heavy)', 'GDL Class E (Articulated Heavy)', '2026-11-30', 0, 'on_trip', 'Specialist for North-South Expressway interstate corridors (KL <-> Penang / JB).'),
            ('drv-3', 'Chong Wai Keong', '+60 12-881 9043', '1234', '900418-14-5587', '900418-14-5587', 'GDL Class E (Rigid Heavy Truck)', 'GDL Class E (Rigid Heavy Truck)', '2027-08-15', 0, 'available', 'Port Klang container haulage and customs inspection specialist.'),
            ('drv-4', 'Hafizul bin Ahmad', '+60 17-662 1984', '1234', '920703-01-5909', '920703-01-5909', 'GDL Class E (Curtain Sider / Box)', 'GDL Class E (Curtain Sider / Box)', '2026-12-31', 0, 'on_trip', 'Southern route specialist (Klang Valley <-> Melaka <-> Pasir Gudang / JB).'),
            ('drv-5', 'Arun Kumar a/l Ravi', '+60 16-442 8195', '1234', '940226-08-5113', '940226-08-5113', 'GDL Class D/E (Rigid Truck)', 'GDL Class D/E (Rigid Truck)', '2027-03-20', 0, 'available', 'Klang Valley metro urban delivery and regional distribution center driver.'),
            ('drv-6', 'Zulkifli bin Othman', '+60 13-991 4426', '1234', '830915-03-5633', '830915-03-5633', 'GDL Class E (Articulated Heavy)', 'GDL Class E (Articulated Heavy)', '2027-01-10', 0, 'on_trip', 'Heavy machinery and high cube container transport specialist.'),
            ('drv-7', 'Steven Tan Boon Keng', '+60 18-204 7717', '1234', '911209-10-5345', '911209-10-5345', 'GDL Class E (Rigid Heavy)', 'GDL Class E (Rigid Heavy)', '2026-10-25', 0, 'available', 'FMCG retail distribution & multi-drop logistics specialist.'),
            ('drv-8', 'Muhammad Danish bin Razak', '+60 14-771 8298', '1234', '980514-10-6021', '980514-10-6021', 'GDL Class D', 'GDL Class D', '2027-09-30', 1, 'on_trip', 'Certified loading crew & relief co-driver for long haul routes.'),
            ('drv-9', 'Vikneswaran a/l Mani', '+60 11-552 1949', '1234', '990823-08-5407', '990823-08-5407', 'GDL Class D', 'GDL Class D', '2027-06-18', 1, 'available', 'Heavy cargo rigging, pallet lashing and tail-lift operations handler.'),
            ('drv-10', 'Kamarul Ariffin bin Idris', '+60 19-880 2310', '1234', '970130-01-6385', '970130-01-6385', 'GDL Class D', 'GDL Class D', '2027-04-12', 1, 'available', 'Warehouse staging, pallet tallying and electronic POD sign-off assistant.')
            ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `phone`=VALUES(`phone`), `pin`=VALUES(`pin`)");

            // 4. Lorries
            $pdo->exec("INSERT INTO `lorries` (`id`, `plate_no`, `capacity_desc`, `zone`, `target`, `monthly_target`, `roadtax_expiry`, `road_tax_expiry`, `puspakom_expiry`, `insurance_expiry`, `permit_expiry`, `default_driver_id`, `status`, `notes`) VALUES
            ('lry-1', 'WVR 8821', '40ft Curtain Sider (24T)', 'Zone A - Klang Valley', 28000.00, 28000.00, '2026-11-15', '2026-11-15', '2026-10-20', '2026-11-30', '2027-05-31', 'drv-1', 'available', 'Equipped with GPS telematics tracking and reinforced sliding curtain system.'),
            ('lry-2', 'BPM 4512', '40ft Box Trailer (25T)', 'Zone B - Inter-State', 32000.00, 32000.00, '2027-02-28', '2027-02-28', '2027-01-15', '2027-02-28', '2027-08-31', 'drv-2', 'on_trip', 'Heavy duty box trailer with double rear lock for high-value secure freight.'),
            ('lry-3', 'VAA 9033', '20ft Box Truck (10T)', 'Zone A - Klang Valley', 18000.00, 18000.00, '2027-04-30', '2027-04-30', '2026-12-10', '2027-04-30', '2027-09-30', 'drv-3', 'available', 'Equipped with 2-ton hydraulic tailgate for ground-level pallet unloading.'),
            ('lry-4', 'JTN 1288', '5-Ton Curtainsider Box', 'Zone C - Southern', 16000.00, 16000.00, '2026-12-15', '2026-12-15', '2026-11-05', '2026-12-15', '2027-06-30', 'drv-4', 'on_trip', 'Medium rigid truck optimized for inter-city southern corridor deliveries.'),
            ('lry-5', 'PGA 7741', '3-Ton Canvas Lorry', 'Zone A - Klang Valley', 12000.00, 12000.00, '2027-03-20', '2027-03-20', '2027-02-10', '2027-03-20', '2027-07-31', 'drv-5', 'available', 'Urban metro agile delivery truck with heavy duty waterproof canvas frame.'),
            ('lry-6', 'WXY 3390', '40ft High Cube Container Carrier', 'Zone B - Inter-State', 34000.00, 34000.00, '2027-05-10', '2027-05-10', '2027-03-15', '2027-05-10', '2027-10-31', 'drv-6', 'on_trip', 'Prime mover with multi-axle skeletal chassis for 20ft/40ft shipping containers.'),
            ('lry-7', 'BQN 6102', '24-Ton Flatbed Trailer', 'Zone A - Klang Valley', 26000.00, 26000.00, '2026-10-31', '2026-10-31', '2026-09-30', '2026-10-31', '2027-04-30', 'drv-7', 'available', 'Heavy machinery & structural beam flatbed with high-capacity lashing chains.'),
            ('lry-8', 'VAK 5519', '10-Ton Tailgate Rigid', 'Zone A - Klang Valley', 20000.00, 20000.00, '2027-01-25', '2027-01-25', '2026-11-28', '2027-01-25', '2027-07-15', 'drv-1', 'available', 'Industrial plant machinery and heavy parts delivery vehicle with power tail-lift.'),
            ('lry-9', 'JUR 4082', '5-Ton Refrigerated Box', 'Zone C - Southern', 22000.00, 22000.00, '2027-06-30', '2027-06-30', '2027-04-18', '2027-06-30', '2027-11-30', 'drv-4', 'available', 'Temperature-controlled ThermoKing chiller unit (+2C to +8C calibrated).'),
            ('lry-10', 'PKL 8920', '40ft Side-Curtain Trailer', 'Zone B - Inter-State', 30000.00, 30000.00, '2026-11-30', '2026-11-30', '2026-10-15', '2026-11-30', '2027-05-15', 'drv-3', 'maintenance', 'Currently in workshop for scheduled 40k km brake & suspension overhaul.')
            ON DUPLICATE KEY UPDATE `plate_no`=VALUES(`plate_no`), `status`=VALUES(`status`), `zone`=VALUES(`zone`)");

            // 5. Lorry Crew
            $pdo->exec("INSERT INTO `lorry_crew` (`id`, `lorry_id`, `driver_id`, `role`) VALUES
            ('lc-1', 'lry-1', 'drv-1', 'driver'),
            ('lc-2', 'lry-2', 'drv-2', 'driver'),
            ('lc-3', 'lry-2', 'drv-8', 'helper'),
            ('lc-4', 'lry-3', 'drv-3', 'driver'),
            ('lc-5', 'lry-4', 'drv-4', 'driver'),
            ('lc-6', 'lry-5', 'drv-5', 'driver'),
            ('lc-7', 'lry-6', 'drv-6', 'driver'),
            ('lc-8', 'lry-7', 'drv-7', 'driver'),
            ('lc-9', 'lry-8', 'drv-9', 'helper'),
            ('lc-10', 'lry-9', 'drv-10', 'helper')
            ON DUPLICATE KEY UPDATE `role`=VALUES(`role`)");

            // 6. Customer Rates
            $pdo->exec("INSERT INTO `customer_rates` (`id`, `customer_id`, `origin`, `destination`, `lorry_spec`, `cargo_type`, `base_rate`, `extra_drop_charge`, `helper_charge`, `demurrage_hourly`, `status`, `notes`, `valid_from`, `valid_to`) VALUES
            ('rate-1', 'cust-1', 'Setia Alam / Meru Klang', 'Northport / Westport, Port Klang', '40ft Curtain Sider (24T)', 'Medical Examination Gloves (Export)', 2800.00, 150.00, 100.00, 80.00, 'active', 'Includes port container gate clearance fee.', '2026-01-01', '2026-12-31'),
            ('rate-2', 'cust-2', 'Shah Alam DC Seksyen 22', 'Tesco DC Bukit Beruntung / Rawang', '40ft Box Trailer (25T)', 'FMCG Food & Packaged Beverages', 1650.00, 120.00, 80.00, 70.00, 'active', 'Includes PLUS highway toll passes.', '2026-01-01', '2026-12-31'),
            ('rate-3', 'cust-3', 'Tangga Batu Lube Plant, Melaka', 'Westport Chemical Bay, Port Klang', '20ft Box Truck (10T)', 'Synthetic Lubricating Oils (Drums)', 3200.00, 200.00, 150.00, 100.00, 'active', 'HAZMAT compliant drum lashing certified.', '2026-01-01', '2026-12-31'),
            ('rate-4', 'cust-4', 'Section 15, Shah Alam', 'Bayan Lepas FTZ Phase 4, Penang', '40ft Box Trailer (25T)', 'Precision Air-Con Motors & Electronics', 4100.00, 250.00, 120.00, 90.00, 'active', 'GPS real-time monitored long-haul corridor.', '2026-01-01', '2026-12-31'),
            ('rate-5', 'cust-5', 'Pasir Gudang Port Refinery', 'Bukit Raja Distribution Center, Klang', '40ft High Cube Container', 'Bulk Refined Edible Palm Oils', 3800.00, 200.00, 150.00, 90.00, 'active', 'Southbound return load priority rate.', '2026-01-01', '2026-12-31'),
            ('rate-6', 'cust-6', 'Jalan Tandang, Petaling Jaya', 'Ipoh Megamas Logistics Park, Perak', '5-Ton Curtainsider Box', 'Canned Drinks & Asian Beverages', 2150.00, 150.00, 90.00, 75.00, 'active', 'Multi-stop delivery across 2 regional hubs.', '2026-01-01', '2026-12-31'),
            ('rate-7', 'cust-7', 'Batu Berendam FTZ, Melaka', 'KLIA Cargo Air Freight Free Zone', '10-Ton Tailgate Rigid', 'Semiconductors (Bonded Cargo)', 1900.00, 180.00, 100.00, 85.00, 'active', 'Customs K2 manifest clearance accompanied.', '2026-01-01', '2026-12-31'),
            ('rate-8', 'cust-8', 'Seksyen 26, Shah Alam', 'Gebeng Industrial Park, Kuantan', '3-Ton Canvas Lorry', '100PLUS RTD Beverages (Promo Batches)', 2600.00, 160.00, 100.00, 80.00, 'active', 'East Coast Expressway (ECE) toll inclusion.', '2026-01-01', '2026-12-31'),
            ('rate-9', 'cust-9', 'Hartalega NGC Sepang', 'Northport Wharf 7, Port Klang', '5-Ton Curtainsider Box', 'Cleanroom Medical Nitrile Gloves', 1450.00, 100.00, 70.00, 65.00, 'active', 'Dedicated export batch container stuffing.', '2026-01-01', '2026-12-31'),
            ('rate-10', 'cust-10', 'Bandar Sunway Staging Yard', 'Danga Bay Project Site, Johor Bahru', '24-Ton Flatbed Trailer', 'Precast Concrete & Heavy Rebar Beams', 5200.00, 350.00, 200.00, 120.00, 'active', 'Oversize escort and highway permit verified.', '2026-01-01', '2026-12-31')
            ON DUPLICATE KEY UPDATE `base_rate`=VALUES(`base_rate`), `lorry_spec`=VALUES(`lorry_spec`)");

            // 7. Customer Price Lists
            $pdo->exec("INSERT INTO `customer_price_lists` (`id`, `item_no`, `customer_id`, `pickup_zone`, `pickup_location`, `drop_zone`, `drop_location`, `zone`, `destination`, `client_tag`, `code_word`, `note`, `tiers_json`) VALUES
            ('cpl-1', 'PL-001', 'cust-1', 'Zone A', 'Shah Alam / Meru Klang', 'Zone A', 'Northport Terminal 1', 'Zone A - Klang Valley', 'Port Klang Port Terminal', 'Top Glove', 'TG-PORT-01', 'Volume tier discount applies for >20 trips/month.', '[{\"minTons\":1,\"maxTons\":5,\"rate\":1200},{\"minTons\":6,\"maxTons\":15,\"rate\":2000},{\"minTons\":16,\"maxTons\":25,\"rate\":2800}]'),
            ('cpl-2', 'PL-002', 'cust-2', 'Zone A', 'Shah Alam Seksyen 22', 'Zone A', 'Bukit Beruntung Hub', 'Zone A - Klang Valley', 'Tesco DC Rawang', 'Nestle', 'NEST-RAW-02', 'Night delivery window surcharge included.', '[{\"minTons\":1,\"maxTons\":10,\"rate\":1100},{\"minTons\":11,\"maxTons\":25,\"rate\":1650}]'),
            ('cpl-3', 'PL-003', 'cust-3', 'Zone B', 'Tangga Batu, Melaka', 'Zone A', 'Westport Liquid Bay', 'Zone B - Southern/Central', 'Port Klang Chemical Terminal', 'Petronas', 'PET-LUBE-03', 'HAZMAT drum safety certification tier.', '[{\"minTons\":1,\"maxTons\":10,\"rate\":2200},{\"minTons\":11,\"maxTons\":20,\"rate\":3200}]'),
            ('cpl-4', 'PL-004', 'cust-4', 'Zone A', 'Shah Alam Section 15', 'Zone C', 'Bayan Lepas FTZ', 'Zone C - Northern', 'Penang High Tech Park', 'Panasonic', 'PAN-PEN-04', 'Air suspension 40ft box trailer guaranteed.', '[{\"minTons\":1,\"maxTons\":15,\"rate\":3200},{\"minTons\":16,\"maxTons\":25,\"rate\":4100}]'),
            ('cpl-5', 'PL-005', 'cust-5', 'Zone C', 'Pasir Gudang Port', 'Zone A', 'Bukit Raja Industrial', 'Zone C - Southern', 'Klang Central Staging', 'Sime Darby', 'SIME-JB-05', 'Backhaul priority contract pricing.', '[{\"minTons\":1,\"maxTons\":20,\"rate\":3000},{\"minTons\":21,\"maxTons\":30,\"rate\":3800}]'),
            ('cpl-6', 'PL-006', 'cust-6', 'Zone A', 'Jalan Tandang, PJ', 'Zone B', 'Ipoh Megamas Park', 'Zone B - Perak', 'Ipoh North Distribution', 'Yeos', 'YEO-IPH-06', 'Standard 2-drop rate card matrix.', '[{\"minTons\":1,\"maxTons\":8,\"rate\":1500},{\"minTons\":9,\"maxTons\":15,\"rate\":2150}]'),
            ('cpl-7', 'PL-007', 'cust-7', 'Zone B', 'Batu Berendam FTZ', 'Zone A', 'KLIA Cargo Terminal', 'Zone B - Air Freight', 'KLIA Free Commercial Zone', 'Texas Instruments', 'TI-KLIA-07', 'Bonded customs truck pricing.', '[{\"minTons\":1,\"maxTons\":5,\"rate\":1400},{\"minTons\":6,\"maxTons\":12,\"rate\":1900}]'),
            ('cpl-8', 'PL-008', 'cust-8', 'Zone A', 'Shah Alam Seksyen 26', 'Zone B', 'Gebeng Industrial Kuantan', 'Zone B - East Coast', 'Kuantan Port Logistics', 'F&N', 'FN-KTN-08', 'Palletized beverage distribution matrix.', '[{\"minTons\":1,\"maxTons\":5,\"rate\":1800},{\"minTons\":6,\"maxTons\":10,\"rate\":2600}]'),
            ('cpl-9', 'PL-009', 'cust-9', 'Zone A', 'Hartalega NGC Sepang', 'Zone A', 'Northport Wharf 7', 'Zone A - Port Delivery', 'Port Klang Export Wharf', 'Hartalega', 'HART-PORT-09', 'Direct factory shuttle pricing.', '[{\"minTons\":1,\"maxTons\":8,\"rate\":1100},{\"minTons\":9,\"maxTons\":15,\"rate\":1450}]'),
            ('cpl-10', 'PL-010', 'cust-10', 'Zone A', 'Sunway Yard, Subang', 'Zone C', 'Danga Bay Project Site', 'Zone C - Heavy Haulage', 'Johor Bahru Waterfront', 'Sunway', 'SUN-JB-10', 'Heavy structural precast matrix with escort.', '[{\"minTons\":1,\"maxTons\":15,\"rate\":3800},{\"minTons\":16,\"maxTons\":30,\"rate\":5200}]')
            ON DUPLICATE KEY UPDATE `code_word`=VALUES(`code_word`), `tiers_json`=VALUES(`tiers_json`)");

            // 8. Quotations
            $pdo->exec("INSERT INTO `quotations` (`id`, `quote_no`, `customer_id`, `customer_name`, `customer_ref`, `pickup_location`, `dropoff_location`, `collection_date`, `order_date`, `delivery_date`, `pickup_time`, `dropoff_time`, `cargo_desc`, `lorry_spec`, `weight_desc`, `rate_amount`, `diesel_band`, `urgent`, `special_instructions`, `suggested_driver`, `notes`, `status`, `sent_at`, `client_confirmed_at`, `owner_approved_at`, `approved_by`, `job_id`) VALUES
            ('quo-1', 'Q-2026-001', 'cust-1', 'Top Glove Corporation Bhd', 'PO-TG-88192', 'Top Glove F29, Setia Alam, Shah Alam', 'Northport Wharf 7, Port Klang, Selangor', '2026-08-26', '2026-08-25', '2026-08-26', '08:30', '14:30', '40 Pallets Medical Examination Gloves (Non-Sterile)', '40ft Curtain Sider (24T)', '18,500 KG', 2800.00, 'Band 1 (Standard)', 0, 'Driver must carry valid port pass. Cargo wrapped in water-resistant plastic sheeting.', 'Mohd Firdaus bin Abdullah', 'Confirmed by Susan Lee via PO-TG-88192.', 'owner_approved', '2026-08-25 10:00:00', '2026-08-25 14:00:00', '2026-08-25 15:30:00', 'staff-owner-1', 'job-1'),
            ('quo-2', 'Q-2026-002', 'cust-2', 'Nestle Logistics Malaysia', 'NEST-RFQ-4011', 'Nestle DC Seksyen 22, Shah Alam', 'Tesco Distribution Center, Bukit Beruntung, Rawang', '2026-08-26', '2026-08-25', '2026-08-26', '10:00', '16:00', '1,200 Cartons Ready-To-Drink Beverages & Cereals', '40ft Box Trailer (25T)', '14,200 KG', 1650.00, 'Band 1 (Standard)', 0, 'Standard pallet handover note to be signed by Receiving supervisor.', 'Subramaniam a/l Kumar', 'Regular scheduled route. PO verified.', 'owner_approved', '2026-08-25 11:00:00', '2026-08-25 15:00:00', '2026-08-25 16:00:00', 'staff-owner-1', 'job-2'),
            ('quo-3', 'Q-2026-003', 'cust-3', 'Petronas Lubricants International', 'PET-DIR-7740', 'Tangga Batu Blending Plant, Melaka', 'Westport Terminal Bay 3, Port Klang', '2026-08-27', '2026-08-26', '2026-08-27', '07:30', '13:00', '24 Drums Industrial Synthetic Lubricant Oil', '20ft Box Truck (10T)', '8,400 KG', 3200.00, 'Band 2 (RM2.80-RM3.00)', 1, 'HAZMAT manifest attached. Spillage emergency kit on board.', 'Chong Wai Keong', 'Priority tanker transfer for ocean container loading.', 'owner_approved', '2026-08-26 08:30:00', '2026-08-26 09:00:00', '2026-08-26 09:15:00', 'staff-owner-1', 'job-3'),
            ('quo-4', 'Q-2026-004', 'cust-4', 'Panasonic Industrial Solutions', 'PAN-PEN-8810', 'Section 15 Factory, Shah Alam, Selangor', 'Bayan Lepas Free Industrial Zone 4, Penang', '2026-08-27', '2026-08-26', '2026-08-28', '13:00', '10:00', '18 Pallets Air-Conditioner Inverter Motors', '5-Ton Curtainsider Box', '11,000 KG', 4100.00, 'Band 1 (Standard)', 0, 'Clean interior box required. No moisture allowed.', 'Hafizul bin Ahmad', 'Awaiting dispatch confirmation for overnight haul.', 'client_confirmed', '2026-08-26 09:00:00', '2026-08-26 10:15:00', NULL, NULL, 'job-4'),
            ('quo-5', 'Q-2026-005', 'cust-5', 'Sime Darby Oils Trading', 'SDO-REF-9921', 'Pasir Gudang Refinery Dock 2, Johor', 'Bukit Raja Staging Depot, Klang, Selangor', '2026-08-28', '2026-08-26', '2026-08-29', '09:00', '15:00', 'Bulk Refined Palm Oil Specialty Fats in Drums', '40ft High Cube Container Carrier', '22,000 KG', 3800.00, 'Band 2 (RM2.80-RM3.00)', 0, 'Weighbridge slip required at both origin and destination checkpoints.', 'Zulkifli bin Othman', 'Customer accepted initial pricing via email quotation.', 'sent', '2026-08-26 09:30:00', NULL, NULL, NULL, 'job-5'),
            ('quo-6', 'Q-2026-006', 'cust-6', 'Yeo Hiap Seng (Malaysia) Bhd', 'YEO-ORD-3319', '7, Jalan Tandang, Petaling Jaya', 'Megamas Logistics Park, Ipoh, Perak', '2026-08-28', '2026-08-26', '2026-08-28', '06:30', '13:30', '850 Crates Chrysanthemum Tea & Soya Milk', '24-Ton Flatbed Trailer', '9,800 KG', 2150.00, 'Band 1 (Standard)', 0, 'Pallet shrink wrap inspection upon arrival.', 'Steven Tan Boon Keng', 'Client confirmed order for weekly replenishment.', 'client_confirmed', '2026-08-26 09:45:00', '2026-08-26 10:30:00', NULL, NULL, 'job-6'),
            ('quo-7', 'Q-2026-007', 'cust-7', 'Texas Instruments Malaysia', 'TI-KLIA-5501', 'Batu Berendam FTZ, Melaka', 'KLIA Cargo Complex Air Freight Zone, Sepang', '2026-08-29', '2026-08-26', '2026-08-29', '14:00', '18:00', 'Precision Semiconductor Wafers (Bonded)', '10-Ton Tailgate Rigid', '4,500 KG', 1900.00, 'Band 1 (Standard)', 1, 'Temperature sensor logging active. GPS seal lock mandatory.', 'Arun Kumar a/l Ravi', 'Owner approved bonded freight flight booking connection.', 'owner_approved', '2026-08-26 10:00:00', '2026-08-26 10:45:00', '2026-08-26 11:00:00', 'staff-owner-1', 'job-7'),
            ('quo-8', 'Q-2026-008', 'cust-8', 'F&N Beverages Marketing', 'FN-EAST-1204', 'Seksyen 26 Plant, Shah Alam', 'Gebeng Industrial Hub, Kuantan, Pahang', '2026-08-30', '2026-08-26', '2026-08-30', '08:00', '16:00', '1,500 Packs 100PLUS RTD Isotonic Drinks', '3-Ton Canvas Lorry', '6,200 KG', 2600.00, 'Band 1 (Standard)', 0, 'East Coast highway transit. Check weather advisory prior to departure.', 'Mohd Firdaus bin Abdullah', 'Draft quote sent to client purchasing department.', 'sent', '2026-08-26 10:30:00', NULL, NULL, NULL, 'job-8'),
            ('quo-9', 'Q-2026-009', 'cust-9', 'Hartalega Holdings Bhd', 'HART-EXP-9002', 'Hartalega NGC Complex, Sepang', 'Northport Container Terminal, Port Klang', '2026-08-26', '2026-08-25', '2026-08-26', '07:00', '11:30', 'Cleanroom Medical Nitrile Gloves (40ft FCL)', '5-Ton Curtainsider Box', '12,500 KG', 1450.00, 'Band 1 (Standard)', 0, 'Export seal number to be recorded on Delivery Order.', 'Hafizul bin Ahmad', 'Delivered successfully. Invoicing prepared.', 'owner_approved', '2026-08-25 09:00:00', '2026-08-25 11:00:00', '2026-08-25 13:00:00', 'staff-owner-1', 'job-9'),
            ('quo-10', 'Q-2026-010', 'cust-10', 'Sunway Construction Group', 'SUN-JB-8812', 'Sunway Precast Yard, Subang Jaya', 'Danga Bay Waterfront Construction Site, JB', '2026-08-31', '2026-08-26', '2026-09-01', '22:00', '06:00', 'Precast Heavy Structural Beams (Oversized)', '40ft Side-Curtain Trailer', '26,000 KG', 5200.00, 'Band 2 (RM2.80-RM3.00)', 0, 'Night transit only. Police escort and flashing beacon lights on flatbed.', 'Subramaniam a/l Kumar', 'Draft proposal prepared for civil construction team.', 'draft', NULL, NULL, NULL, NULL, 'job-10')
            ON DUPLICATE KEY UPDATE `rate_amount`=VALUES(`rate_amount`), `status`=VALUES(`status`)");

            // 9. Jobs
            $pdo->exec("INSERT INTO `jobs` (`id`, `job_no`, `quotation_id`, `customer_ref`, `customer_id`, `customer_name`, `lorry_id`, `driver_id`, `rate_amount`, `diesel_amount`, `tng_amount`, `pickup_location`, `dropoff_location`, `collection_date`, `order_date`, `delivery_date`, `pickup_time`, `dropoff_time`, `loading_time`, `unloading_time`, `cargo_desc`, `lorry_spec`, `weight_desc`, `urgent`, `special_instructions`, `notes`, `status`, `billed_status`, `started_at`, `delivered_at`, `pod_recipient`, `pod_notes`) VALUES
            ('job-1', 'JOB-2026-0101', 'quo-1', 'PO-TG-88192', 'cust-1', 'Top Glove Corporation Bhd', 'lry-1', 'drv-1', 2800.00, 320.00, 75.00, 'Top Glove F29, Setia Alam, Shah Alam, Selangor', 'Northport Wharf 7, Port Klang, Selangor', '2026-08-26', '2026-08-25', '2026-08-26', '08:30', '14:30', '08:45', '14:00', '40 Pallets Medical Examination Gloves (Non-Sterile)', '40ft Curtain Sider (24T)', '18,500 KG', 0, 'Driver must carry valid port pass. Water-resistant plastic wrap.', 'Delivered on time. Electronic POD signature captured.', 'delivered', 'billed', '2026-08-26 08:30:00', '2026-08-26 14:15:00', 'Encik Rashdan (Wharf Supervisor)', 'All 40 pallets received in pristine condition. Seal #TG-9941 intact.'),
            ('job-2', 'JOB-2026-0102', 'quo-2', 'NEST-RFQ-4011', 'cust-2', 'Nestle Logistics Malaysia', 'lry-2', 'drv-2', 1650.00, 180.00, 45.00, 'Nestle DC Seksyen 22, Shah Alam', 'Tesco Distribution Center, Bukit Beruntung, Rawang', '2026-08-26', '2026-08-25', '2026-08-26', '10:00', '16:00', '10:15', '15:30', '1,200 Cartons Ready-To-Drink Beverages', '40ft Box Trailer (25T)', '14,200 KG', 0, 'Standard pallet handover note to be signed by Receiving supervisor.', 'Unloading completed at Bay 12.', 'delivered', 'billed', '2026-08-26 10:00:00', '2026-08-26 15:45:00', 'K. Senthil (Inbound Manager)', '1,200 cartons counted and signed off on DO.'),
            ('job-3', 'JOB-2026-0103', 'quo-3', 'PET-DIR-7740', 'cust-3', 'Petronas Lubricants International', 'lry-3', 'drv-3', 3200.00, 420.00, 95.00, 'Tangga Batu Blending Plant, Melaka', 'Westport Terminal Bay 3, Port Klang', '2026-08-26', '2026-08-26', '2026-08-26', '07:30', '13:00', '07:45', NULL, '24 Drums Industrial Synthetic Lubricant Oil', '20ft Box Truck (10T)', '8,400 KG', 1, 'HAZMAT manifest attached. Spillage emergency kit on board.', 'En route on ELITE Highway. Expected arrival in 45 mins.', 'in_progress', 'pending', '2026-08-26 08:00:00', NULL, NULL, NULL),
            ('job-4', 'JOB-2026-0104', 'quo-4', 'PAN-PEN-8810', 'cust-4', 'Panasonic Industrial Solutions', 'lry-4', 'drv-4', 4100.00, 580.00, 140.00, 'Section 15 Factory, Shah Alam, Selangor', 'Bayan Lepas Free Industrial Zone 4, Penang', '2026-08-26', '2026-08-26', '2026-08-27', '13:00', '10:00', '13:30', NULL, '18 Pallets Air-Conditioner Inverter Motors', '5-Ton Curtainsider Box', '11,000 KG', 0, 'Clean interior box required. No moisture allowed.', 'Loading completed at Shah Alam plant. Heading North on PLUS highway.', 'in_progress', 'pending', '2026-08-26 14:00:00', NULL, NULL, NULL),
            ('job-5', 'JOB-2026-0105', 'quo-5', 'SDO-REF-9921', 'cust-5', 'Sime Darby Oils Trading', 'lry-6', 'drv-6', 3800.00, 490.00, 110.00, 'Pasir Gudang Refinery Dock 2, Johor', 'Bukit Raja Staging Depot, Klang, Selangor', '2026-08-27', '2026-08-26', '2026-08-28', '09:00', '15:00', NULL, NULL, 'Bulk Refined Palm Oil Specialty Fats in Drums', '40ft High Cube Container Carrier', '22,000 KG', 0, 'Weighbridge slip required at both origin and destination checkpoints.', 'Driver assigned. Pre-trip vehicle inspection completed.', 'assigned', 'pending', NULL, NULL, NULL, NULL),
            ('job-6', 'JOB-2026-0106', 'quo-6', 'YEO-ORD-3319', 'cust-6', 'Yeo Hiap Seng (Malaysia) Bhd', 'lry-7', 'drv-7', 2150.00, 290.00, 65.00, '7, Jalan Tandang, Petaling Jaya', 'Megamas Logistics Park, Ipoh, Perak', '2026-08-27', '2026-08-26', '2026-08-27', '06:30', '13:30', NULL, NULL, '850 Crates Chrysanthemum Tea & Soya Milk', '24-Ton Flatbed Trailer', '9,800 KG', 0, 'Pallet shrink wrap inspection upon arrival.', 'Driver and helper assigned for early morning dispatch.', 'assigned', 'pending', NULL, NULL, NULL, NULL),
            ('job-7', 'JOB-2026-0107', 'quo-7', 'TI-KLIA-5501', 'cust-7', 'Texas Instruments Malaysia', 'lry-8', 'drv-5', 1900.00, 190.00, 50.00, 'Batu Berendam FTZ, Melaka', 'KLIA Cargo Complex Air Freight Zone, Sepang', '2026-08-28', '2026-08-26', '2026-08-28', '14:00', '18:00', NULL, NULL, 'Precision Semiconductor Wafers (Bonded)', '10-Ton Tailgate Rigid', '4,500 KG', 1, 'Temperature sensor logging active. GPS seal lock mandatory.', 'Awaiting truck bay assignment at Melaka site.', 'unassigned', 'pending', NULL, NULL, NULL, NULL),
            ('job-8', 'JOB-2026-0108', 'quo-8', 'FN-EAST-1204', 'cust-8', 'F&N Beverages Marketing', 'lry-5', 'drv-1', 2600.00, 360.00, 85.00, 'Seksyen 26 Plant, Shah Alam', 'Gebeng Industrial Hub, Kuantan, Pahang', '2026-08-29', '2026-08-26', '2026-08-29', '08:00', '16:00', NULL, NULL, '1,500 Packs 100PLUS RTD Isotonic Drinks', '3-Ton Canvas Lorry', '6,200 KG', 0, 'East Coast highway transit. Check weather advisory.', 'Pending final transport schedule approval.', 'unassigned', 'pending', NULL, NULL, NULL, NULL),
            ('job-9', 'JOB-2026-0109', 'quo-9', 'HART-EXP-9002', 'cust-9', 'Hartalega Holdings Bhd', 'lry-9', 'drv-4', 1450.00, 150.00, 35.00, 'Hartalega NGC Complex, Sepang', 'Northport Container Terminal, Port Klang', '2026-08-25', '2026-08-25', '2026-08-25', '07:00', '11:30', '07:15', '11:00', 'Cleanroom Medical Nitrile Gloves (40ft FCL)', '5-Ton Curtainsider Box', '12,500 KG', 0, 'Export seal number to be recorded on Delivery Order.', 'Delivery completed successfully. Verified by receiving clerk.', 'delivered', 'billed', '2026-08-25 07:00:00', '2026-08-25 11:15:00', 'Puan Haliza (Northport Staging)', 'Containers received and staged for vessel boarding.'),
            ('job-10', 'JOB-2026-0110', 'quo-10', 'SUN-JB-8812', 'cust-10', 'Sunway Construction Group', 'lry-10', 'drv-2', 5200.00, 680.00, 160.00, 'Sunway Precast Yard, Subang Jaya', 'Danga Bay Waterfront Construction Site, JB', '2026-08-30', '2026-08-26', '2026-08-31', '22:00', '06:00', NULL, NULL, 'Precast Heavy Structural Beams (Oversized)', '40ft Side-Curtain Trailer', '26,000 KG', 0, 'Night transit only. Police escort and flashing beacon lights on flatbed.', 'Scheduled for upcoming night transit dispatch.', 'unassigned', 'pending', NULL, NULL, NULL, NULL)
            ON DUPLICATE KEY UPDATE `status`=VALUES(`status`), `rate_amount`=VALUES(`rate_amount`)");

            // 10. Job Crew
            $pdo->exec("INSERT INTO `job_crew` (`id`, `job_id`, `driver_id`, `role`) VALUES
            ('jc-1', 'job-1', 'drv-1', 'lead_driver'),
            ('jc-2', 'job-2', 'drv-2', 'lead_driver'),
            ('jc-3', 'job-2', 'drv-8', 'helper'),
            ('jc-4', 'job-3', 'drv-3', 'lead_driver'),
            ('jc-5', 'job-4', 'drv-4', 'lead_driver'),
            ('jc-6', 'job-4', 'drv-10', 'helper'),
            ('jc-7', 'job-5', 'drv-6', 'lead_driver'),
            ('jc-8', 'job-6', 'drv-7', 'lead_driver'),
            ('jc-9', 'job-6', 'drv-9', 'helper'),
            ('jc-10', 'job-9', 'drv-4', 'lead_driver')
            ON DUPLICATE KEY UPDATE `role`=VALUES(`role`)");

            // 11. Maintenance Records
            $pdo->exec("INSERT INTO `maintenance_records` (`id`, `lorry_id`, `service_type`, `description`, `workshop`, `service_date`, `next_service_due`, `cost`, `invoice_no`, `notes`, `status`) VALUES
            ('maint-1', 'lry-1', 'Scheduled Engine Oil & Filter Change', 'Routine 40,000 km preventive maintenance servicing. Replaced synthetic diesel oil and fuel filters.', 'Rens Dynamics Central Workshop, Klang', '2026-08-15', '2026-11-15', 1250.00, 'INV-WS-8821', 'Vehicle cleared for long haul inter-state trips.', 'completed'),
            ('maint-2', 'lry-2', 'Brake Lining & Drum Replacement', 'Rear axle brake linings worn down to 3mm. Fitted new heavy duty asbestos-free linings.', 'Tan Chong Commercial Service Center, Shah Alam', '2026-08-18', '2027-02-18', 2400.00, 'INV-TC-4019', 'Puspakom brake test passed with 88% efficiency.', 'completed'),
            ('maint-3', 'lry-3', 'Air Brake System Servicing & Valve Replacement', 'Air desiccant cartridge replaced and four-circuit protection valve serviced.', 'Rens Dynamics Central Workshop, Klang', '2026-08-20', '2026-12-20', 850.00, 'INV-WS-8835', 'Air tank pressure holding steady at 8.5 bar.', 'completed'),
            ('maint-4', 'lry-10', 'Gearbox Overhaul & Clutch Plate Replacement', 'Gear synchromesh rings replaced and heavy duty ceramic clutch plate installed.', 'Mega Truck Specialist Workshop, Nilai', '2026-08-24', '2027-08-24', 4800.00, 'INV-MTS-9122', 'Currently undergoing final dynamometer testing.', 'in_progress'),
            ('maint-5', 'lry-4', 'Tire Replacement (4x Heavy Duty 295/80R22.5)', 'Replaced 4 rear drive axle tires with new Bridgestone commercial radial tires.', 'Continental Commercial Tyre Center, Klang', '2026-08-10', '2027-04-10', 3600.00, 'INV-CT-1088', 'Wheel alignment and balancing completed.', 'completed'),
            ('maint-6', 'lry-5', 'Suspension Leaf Spring Bushing Replacement', 'Front and rear leaf spring rubber bushings replaced due to wear.', 'Rens Dynamics Central Workshop, Klang', '2026-08-12', '2027-02-12', 1100.00, 'INV-WS-8819', 'Ride height restored to OEM specification.', 'completed'),
            ('maint-7', 'lry-6', 'Alternator & Heavy Duty Battery Replacement', 'Replaced 24V 80A heavy duty alternator and dual 12V 150Ah commercial batteries.', 'Century Commercial Battery & Auto Electric, Shah Alam', '2026-08-22', '2027-08-22', 1450.00, 'INV-CCB-3310', 'Charging voltage steady at 28.2V under load.', 'completed'),
            ('maint-8', 'lry-7', 'Air Conditioning Compressor Servicing', 'AC compressor clutch repaired, system vacuumed and recharged with R134a refrigerant.', 'Rens Dynamics Central Workshop, Klang', '2026-08-14', '2027-02-14', 680.00, 'INV-WS-8820', 'Cabin cooling down to 18C.', 'completed'),
            ('maint-9', 'lry-8', 'Coolant Flush & Radiator Hose Renewal', 'Radiator flushed with heavy duty descaling agent. Silicone upper/lower hoses replaced.', 'Rens Dynamics Central Workshop, Klang', '2026-08-21', '2027-02-21', 450.00, 'INV-WS-8840', 'Engine operating temperature normal at 85C.', 'completed'),
            ('maint-10', 'lry-9', 'Refrigeration Chiller Calibration & Servicing', 'ThermoKing refrigeration compressor serviced and digital temperature probe calibrated.', 'ThermoCool Fleet Services, Port Klang', '2026-08-19', '2026-11-19', 1650.00, 'INV-TK-7702', 'Temperature logging accuracy certified for food and pharma cargo.', 'completed')
            ON DUPLICATE KEY UPDATE `cost`=VALUES(`cost`), `status`=VALUES(`status`)");

            // 12. Inventory Items
            $pdo->exec("INSERT INTO `inventory_items` (`id`, `item_name`, `name`, `sku`, `category`, `unit`, `quantity`, `quantity_on_hand`, `min_quantity`, `reorder_threshold`, `cost_per_unit`, `unit_cost`, `location`) VALUES
            ('item-1', 'Heavy Duty Diesel Engine Oil 15W-40 (200L Drum)', 'Heavy Duty Diesel Engine Oil 15W-40 (200L Drum)', 'OIL-15W40-200L', 'lubricants', 'drums', 12.00, 12.00, 4.00, 4.00, 1850.00, 1850.00, 'Rack A-01 (Lubricants Bay)'),
            ('item-2', 'Heavy Duty Brake Pad / Lining Set (Rear Axle)', 'Heavy Duty Brake Pad / Lining Set (Rear Axle)', 'BRK-LINING-HD40', 'brakes', 'sets', 24.00, 24.00, 6.00, 6.00, 240.00, 240.00, 'Rack B-03 (Brake Parts)'),
            ('item-3', 'Air Brake Filter Cartridge (Desiccant Dryer)', 'Air Brake Filter Cartridge (Desiccant Dryer)', 'FLT-AIRBRK-01', 'filters', 'pcs', 35.00, 35.00, 10.00, 10.00, 75.00, 75.00, 'Rack C-02 (Filtration)'),
            ('item-4', 'Commercial Truck Tire 295/80R22.5 Long Haul', 'Commercial Truck Tire 295/80R22.5 Long Haul', 'TYR-295-80R22', 'tyres', 'units', 18.00, 18.00, 8.00, 8.00, 920.00, 920.00, 'Tyre Storage Bay T-1'),
            ('item-5', 'Heavy Commercial 12V 150Ah Maintenance Free Battery', 'Heavy Commercial 12V 150Ah Maintenance Free Battery', 'BAT-12V150AH', 'electrical', 'units', 10.00, 10.00, 4.00, 4.00, 480.00, 480.00, 'Battery Bay E-04'),
            ('item-6', 'Primary Fuel / Water Separator Filter Spin-On', 'Primary Fuel / Water Separator Filter Spin-On', 'FLT-FUEL-WTR01', 'engine', 'pcs', 42.00, 42.00, 12.00, 12.00, 45.00, 45.00, 'Rack C-01 (Filtration)'),
            ('item-7', 'LED Heavy Duty Rear Combination Tail Light Assembly', 'LED Heavy Duty Rear Combination Tail Light Assembly', 'LGT-REAR-LED02', 'lighting', 'pcs', 20.00, 20.00, 5.00, 5.00, 110.00, 110.00, 'Rack E-02 (Electrical)'),
            ('item-8', 'Heavy Duty Synthetic Gear Oil 80W-90 (20L Pail)', 'Heavy Duty Synthetic Gear Oil 80W-90 (20L Pail)', 'LUB-GEAR-80W90', 'fluids', 'pails', 15.00, 15.00, 5.00, 5.00, 220.00, 220.00, 'Rack A-03 (Lubricants Bay)'),
            ('item-9', 'Silicone High-Temp Radiator Coolant Hose Kit', 'Silicone High-Temp Radiator Coolant Hose Kit', 'HOS-RAD-SIL01', 'cooling', 'kits', 16.00, 16.00, 4.00, 4.00, 85.00, 85.00, 'Rack D-01 (Cooling)'),
            ('item-10', 'Heavy Duty Commercial Wiper Blade 26-inch Pair', 'Heavy Duty Commercial Wiper Blade 26-inch Pair', 'WIP-26IN-HD', 'accessories', 'pairs', 30.00, 30.00, 8.00, 8.00, 35.00, 35.00, 'Rack F-02 (Consumables)')
            ON DUPLICATE KEY UPDATE `quantity`=VALUES(`quantity`), `unit_cost`=VALUES(`unit_cost`)");

            // 13. Inventory Receipts
            $pdo->exec("INSERT INTO `inventory_receipts` (`id`, `item_id`, `quantity`, `unit_cost`, `supplier`, `reference_no`, `received_at`, `notes`) VALUES
            ('rcpt-1', 'item-1', 5.00, 1850.00, 'Petronas Lubricants Marketing Malaysia', 'PO-SUP-88210', '2026-08-10 10:30:00', '5 drums 15W-40 delivered with batch quality certificate #PL-9921.'),
            ('rcpt-2', 'item-2', 10.00, 240.00, 'Brembo Commercial Parts Sdn Bhd', 'PO-SUP-88211', '2026-08-12 14:00:00', '10 sets heavy duty brake pads received in good condition.'),
            ('rcpt-3', 'item-3', 20.00, 75.00, 'Fleetguard Malaysia Sdn Bhd', 'PO-SUP-88212', '2026-08-14 09:30:00', '20 pcs air dryer cartridges checked into Rack C-02.'),
            ('rcpt-4', 'item-4', 8.00, 920.00, 'Bridgestone Commercial Tyre Malaysia', 'PO-SUP-88213', '2026-08-15 11:00:00', '8 long-haul radial tires mounted onto pallet racks.'),
            ('rcpt-5', 'item-5', 6.00, 480.00, 'Century Battery Sales Sdn Bhd', 'PO-SUP-88214', '2026-08-16 15:30:00', '6 units 12V 150Ah batteries with 18-month commercial warranty.'),
            ('rcpt-6', 'item-6', 25.00, 45.00, 'Donaldson Filtration Solutions', 'PO-SUP-88215', '2026-08-18 10:00:00', '25 spin-on water separator fuel filters stocked.'),
            ('rcpt-7', 'item-7', 12.00, 110.00, 'Hella Commercial Lighting Malaysia', 'PO-SUP-88216', '2026-08-19 13:30:00', '12 LED trailer combination tail lamp assemblies.'),
            ('rcpt-8', 'item-8', 10.00, 220.00, 'Castrol Commercial Malaysia', 'PO-SUP-88217', '2026-08-21 09:00:00', '10 pails 80W-90 heavy gear oil.'),
            ('rcpt-9', 'item-9', 8.00, 85.00, 'Samco Silicone Hoses Malaysia', 'PO-SUP-88218', '2026-08-22 14:30:00', '8 high-temp radiator silicone hose kits.'),
            ('rcpt-10', 'item-10', 15.00, 35.00, 'Bosch Auto Parts Malaysia', 'PO-SUP-88219', '2026-08-23 16:00:00', '15 pairs 26-inch heavy commercial wiper blades.')
            ON DUPLICATE KEY UPDATE `quantity`=VALUES(`quantity`), `unit_cost`=VALUES(`unit_cost`)");

            // 14. Inventory Issuances
            $pdo->exec("INSERT INTO `inventory_issuances` (`id`, `item_id`, `lorry_id`, `maintenance_record_id`, `quantity`, `unit_cost`, `approval_status`, `approved_by`, `approved_at`, `requested_by`, `issued_at`, `notes`) VALUES
            ('iss-1', 'item-1', 'lry-1', 'maint-1', 1.00, 1850.00, 'approved', 'staff-admin-1', '2026-08-15 08:30:00', 'staff-admin-1', '2026-08-15 09:00:00', 'Issued 1 drum 15W-40 for WVR 8821 40,000km scheduled service.'),
            ('iss-2', 'item-2', 'lry-2', 'maint-2', 2.00, 240.00, 'approved', 'staff-admin-1', '2026-08-18 09:30:00', 'staff-admin-1', '2026-08-18 10:00:00', 'Issued 2 sets brake linings for BPM 4512 rear axle overhaul.'),
            ('iss-3', 'item-3', 'lry-3', 'maint-3', 1.00, 75.00, 'approved', 'staff-admin-1', '2026-08-20 10:30:00', 'staff-admin-1', '2026-08-20 11:00:00', 'Issued air dryer cartridge for VAA 9033 air brake maintenance.'),
            ('iss-4', 'item-4', 'lry-4', 'maint-5', 2.00, 920.00, 'approved', 'staff-admin-1', '2026-08-10 09:30:00', 'staff-admin-1', '2026-08-10 10:00:00', 'Issued 2 drive axle radial tires for JTN 1288.'),
            ('iss-5', 'item-5', 'lry-6', 'maint-7', 2.00, 480.00, 'approved', 'staff-admin-1', '2026-08-22 10:00:00', 'staff-admin-1', '2026-08-22 10:30:00', 'Issued 2x 12V 150Ah commercial batteries for WXY 3390.'),
            ('iss-6', 'item-6', 'lry-1', 'maint-1', 2.00, 45.00, 'approved', 'staff-admin-1', '2026-08-15 08:30:00', 'staff-admin-1', '2026-08-15 09:00:00', 'Issued fuel filter & water separator cartridge for WVR 8821.'),
            ('iss-7', 'item-7', 'lry-7', 'maint-8', 1.00, 110.00, 'approved', 'staff-admin-1', '2026-08-14 13:30:00', 'staff-admin-1', '2026-08-14 14:00:00', 'Issued rear right LED light cluster replacement for BQN 6102.'),
            ('iss-8', 'item-8', 'lry-10', 'maint-4', 1.00, 220.00, 'approved', 'staff-admin-1', '2026-08-24 09:00:00', 'staff-admin-1', '2026-08-24 09:30:00', 'Issued 20L 80W-90 gear oil for PKL 8920 gearbox rebuild.'),
            ('iss-9', 'item-9', 'lry-8', 'maint-9', 1.00, 85.00, 'approved', 'staff-admin-1', '2026-08-21 14:30:00', 'staff-admin-1', '2026-08-21 15:00:00', 'Issued high-temp silicone radiator hose kit for VAK 5519.'),
            ('iss-10', 'item-10', 'lry-5', 'maint-6', 1.00, 35.00, 'pending', NULL, NULL, 'staff-admin-1', '2026-08-26 10:00:00', 'Spare 26-inch commercial wiper blade set requested for PGA 7741.')
            ON DUPLICATE KEY UPDATE `approval_status`=VALUES(`approval_status`)");

            // 15. Approvals
            $pdo->exec("INSERT INTO `approvals` (`id`, `ref_id`, `item_type`, `kind`, `title`, `amount`, `status`, `requested_by`, `flagged`, `note`, `created_at`, `resolved_at`) VALUES
            ('app-1', 'quo-1', 'quotation', 'quotation', 'Quotation Q-2026-001 (Top Glove Bhd - RM 2,800.00)', 2800.00, 'approved', 'Susan Lee / Operations Desk', 0, 'Volume contract rate approved for 40ft curtain sider export route.', '2026-08-25 14:00:00', '2026-08-25 15:30:00'),
            ('app-2', 'quo-2', 'quotation', 'quotation', 'Quotation Q-2026-002 (Nestle Logistics - RM 1,650.00)', 1650.00, 'approved', 'Azlan Shah / Commercial Dept', 0, 'Standard FMCG distribution rate verified against contract price list.', '2026-08-25 15:00:00', '2026-08-25 16:00:00'),
            ('app-3', 'quo-3', 'quotation', 'quotation', 'Quotation Q-2026-003 (Petronas Lubricants - RM 3,200.00)', 3200.00, 'approved', 'Ahmad Kamil / Freight Desk', 0, 'HAZMAT drum handling priority transfer approved.', '2026-08-26 09:00:00', '2026-08-26 09:15:00'),
            ('app-4', 'quo-4', 'quotation', 'quotation', 'Quotation Q-2026-004 (Panasonic Industrial - RM 4,100.00)', 4100.00, 'waiting', 'Chong Wai / Dispatch Desk', 1, 'Inter-state Penang delivery awaiting management confirmation on driver allowance.', '2026-08-26 10:15:00', NULL),
            ('app-5', 'quo-5', 'quotation', 'quotation', 'Quotation Q-2026-005 (Sime Darby Oils - RM 3,800.00)', 3800.00, 'waiting', 'Faridah Yusof / Logistics Lead', 0, 'Southern corridor return haulage booking request.', '2026-08-26 09:30:00', NULL),
            ('app-6', 'maint-4', 'maintenance', 'maintenance', 'Major Gearbox Overhaul for Lorry PKL 8920 (RM 4,800.00)', 4800.00, 'approved', 'Chief Mechanic (Central Workshop)', 1, 'Necessary transmission rebuild for heavy long-haul vehicle.', '2026-08-24 08:30:00', '2026-08-24 10:00:00'),
            ('app-7', 'iss-10', 'issuance', 'issuance', 'Spare Wiper Blade Issuance for Lorry PGA 7741 (RM 35.00)', 35.00, 'waiting', 'Workshop Assistant', 0, 'Consumables inventory issuance awaiting supervisor sign-off.', '2026-08-26 10:00:00', NULL),
            ('app-8', 'quo-7', 'quotation', 'quotation', 'Quotation Q-2026-007 (Texas Instruments - RM 1,900.00)', 1900.00, 'approved', 'David Wong / Air Freight Lead', 0, 'Bonded semiconductor vehicle clearance approved.', '2026-08-26 10:45:00', '2026-08-26 11:00:00'),
            ('app-9', 'quo-8', 'quotation', 'quotation', 'Quotation Q-2026-008 (F&N Beverages - RM 2,600.00)', 2600.00, 'waiting', 'Siti Norazlina / Logistics', 0, 'East Coast Kuantan delivery rate pending commercial sign-off.', '2026-08-26 10:30:00', NULL),
            ('app-10', 'quo-10', 'quotation', 'quotation', 'Quotation Q-2026-010 (Sunway Construction - RM 5,200.00)', 5200.00, 'waiting', 'Ir. Michael Chang / Project Director', 1, 'Night transit oversize structural precast with police escort.', '2026-08-26 11:00:00', NULL)
            ON DUPLICATE KEY UPDATE `status`=VALUES(`status`), `amount`=VALUES(`amount`)");

            // 16. Sales Invoices
            $pdo->exec("INSERT INTO `sales_invoices` (`id`, `invoice_no`, `customer_id`, `job_ids`, `invoice_date`, `due_date`, `subtotal`, `sst_rate`, `sst_amount`, `total_amount`, `payment_status`, `payment_terms`, `paid_amount`, `payment_date`, `payment_method`, `payment_ref`, `notes`) VALUES
            ('inv-1', 'INV-2026-0101', 'cust-1', '[\"job-1\"]', '2026-08-01', '2026-08-31', 2800.00, 0.0600, 168.00, 2968.00, 'paid', '30 Days Credit', 2968.00, '2026-08-15', 'Online Bank Transfer (Maybank2u / IBG)', 'MBB-TRX-994812', 'Full payment received with official bank tax receipt.'),
            ('inv-2', 'INV-2026-0102', 'cust-2', '[\"job-2\"]', '2026-08-05', '2026-09-04', 1650.00, 0.0600, 99.00, 1749.00, 'paid', '30 Days Credit', 1749.00, '2026-08-18', 'JomPAY Corporate', 'JOMPAY-882104', 'Official tax invoice receipt issued.'),
            ('inv-3', 'INV-2026-0103', 'cust-3', '[\"job-3\"]', '2026-08-10', '2026-09-24', 3200.00, 0.0600, 192.00, 3392.00, 'pending', '45 Days Credit', 0.00, NULL, NULL, NULL, 'Awaiting finance voucher processing.'),
            ('inv-4', 'INV-2026-0104', 'cust-4', '[\"job-4\"]', '2026-08-15', '2026-09-14', 4100.00, 0.0600, 246.00, 4346.00, 'pending', '30 Days Credit', 0.00, NULL, NULL, NULL, 'Invoice delivered via corporate portal.'),
            ('inv-5', 'INV-2026-0105', 'cust-5', '[\"job-5\"]', '2026-08-18', '2026-09-17', 3800.00, 0.0600, 228.00, 4028.00, 'paid', '30 Days Credit', 4028.00, '2026-08-25', 'Direct Bank Wire (CIMB BizChannel)', 'CIMB-TX-551928', 'Payment confirmed and reconciled.'),
            ('inv-6', 'INV-2026-0106', 'cust-6', '[\"job-6\"]', '2026-08-20', '2026-09-03', 2150.00, 0.0600, 129.00, 2279.00, 'paid', '14 Days Credit', 2279.00, '2026-08-26', 'DuitNow Corporate', 'DN-CORP-441029', 'Early settlement discount waived, paid in full.'),
            ('inv-7', 'INV-2026-0107', 'cust-7', '[\"job-7\"]', '2026-08-22', '2026-09-21', 1900.00, 0.0600, 114.00, 2014.00, 'pending', '30 Days Credit', 0.00, NULL, NULL, NULL, 'Cleanroom delivery document attached.'),
            ('inv-8', 'INV-2026-0108', 'cust-8', '[\"job-8\"]', '2026-08-24', '2026-09-23', 2600.00, 0.0600, 156.00, 2756.00, 'pending', '30 Days Credit', 0.00, NULL, NULL, NULL, 'East Coast transport invoice.'),
            ('inv-9', 'INV-2026-0109', 'cust-9', '[\"job-9\"]', '2026-08-25', '2026-09-24', 1450.00, 0.0600, 87.00, 1537.00, 'pending', '30 Days Credit', 0.00, NULL, NULL, NULL, 'Export port delivery completed.'),
            ('inv-10', 'INV-2026-0110', 'cust-10', '[\"job-10\"]', '2026-08-26', '2026-10-25', 5200.00, 0.0600, 312.00, 5512.00, 'pending', '60 Days Credit', 0.00, NULL, NULL, NULL, 'Heavy structural precast delivery project billing.')
            ON DUPLICATE KEY UPDATE `payment_status`=VALUES(`payment_status`), `total_amount`=VALUES(`total_amount`)");

            $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
            echo json_encode(['success' => true, 'message' => '10 demo data records seeded across all modules successfully.']);
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
