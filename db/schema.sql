  -- ============================================================
  -- Rens Dynamics ERP — Complete MySQL Production Database Schema
  -- Database Name : u745362362_renserp
  -- Compatible with Hostinger / phpMyAdmin / MySQL 5.7+ & 8.0+
  -- Character Set : utf8mb4 / utf8mb4_unicode_ci
  -- Total Tables  : 17 Data Tables
  -- ============================================================

  CREATE DATABASE IF NOT EXISTS `u745362362_renserp` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  USE `u745362362_renserp`;

  SET FOREIGN_KEY_CHECKS = 0;

  -- ── Drop existing tables to avoid column mismatch on import ─
  DROP TABLE IF EXISTS `job_crew`;
  DROP TABLE IF EXISTS `inventory_issuances`;
  DROP TABLE IF EXISTS `inventory_receipts`;
  DROP TABLE IF EXISTS `maintenance_records`;
  DROP TABLE IF EXISTS `sales_invoices`;
  DROP TABLE IF EXISTS `jobs`;
  DROP TABLE IF EXISTS `quotations`;
  DROP TABLE IF EXISTS `approvals`;
  DROP TABLE IF EXISTS `lorry_crew`;
  DROP TABLE IF EXISTS `customer_rates`;
  DROP TABLE IF EXISTS `customer_price_lists`;
  DROP TABLE IF EXISTS `customer_contacts`;
  DROP TABLE IF EXISTS `lorries`;
  DROP TABLE IF EXISTS `drivers`;
  DROP TABLE IF EXISTS `customers`;
  DROP TABLE IF EXISTS `inventory_items`;
  DROP TABLE IF EXISTS `staff`;

  -- ============================================================
  -- 1. Staff (System Users & Authentication)
  -- ============================================================
  CREATE TABLE IF NOT EXISTS `staff` (
    `id` VARCHAR(64) NOT NULL PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `username` VARCHAR(100) DEFAULT NULL,
    `role` VARCHAR(50) NOT NULL DEFAULT 'admin',
    `pin` VARCHAR(20) NOT NULL DEFAULT '1234',
    `active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_staff_role` (`role`),
    KEY `idx_staff_username` (`username`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 2. Customers (Master Customer Accounts)
  -- ============================================================
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
    `status` VARCHAR(50) NOT NULL DEFAULT 'active',
    `is_new` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_customers_name` (`company_name`),
    KEY `idx_customers_zone` (`zone`),
    KEY `idx_customers_status` (`status`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 3. Customer Contacts (Direct Client Contact Directory)
  -- ============================================================
  CREATE TABLE IF NOT EXISTS `customer_contacts` (
    `id` VARCHAR(64) NOT NULL PRIMARY KEY,
    `no` INT(11) DEFAULT NULL,
    `customer_name` VARCHAR(255) NOT NULL,
    `contact_person` VARCHAR(255) DEFAULT NULL,
    `contact_no` VARCHAR(255) DEFAULT NULL,
    `region` VARCHAR(255) DEFAULT NULL,
    `notes` TEXT DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_contacts_name` (`customer_name`),
    KEY `idx_contacts_region` (`region`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 4. Drivers & Helpers (Fleet Personnel)
  -- ============================================================
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
    `notes` TEXT DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_drivers_status` (`status`),
    KEY `idx_drivers_name` (`name`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 5. Lorries (Fleet Vehicles)
  -- ============================================================
  CREATE TABLE IF NOT EXISTS `lorries` (
    `id` VARCHAR(64) NOT NULL PRIMARY KEY,
    `plate_no` VARCHAR(50) NOT NULL UNIQUE,
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
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_lorries_plate` (`plate_no`),
    KEY `idx_lorries_status` (`status`),
    KEY `idx_lorries_zone` (`zone`),
    CONSTRAINT `fk_lorries_default_driver` FOREIGN KEY (`default_driver_id`) REFERENCES `drivers` (`id`) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 6. Lorry Crew Mapping (Assigned Drivers & Helpers)
  -- ============================================================
  CREATE TABLE IF NOT EXISTS `lorry_crew` (
    `id` VARCHAR(64) NOT NULL PRIMARY KEY,
    `lorry_id` VARCHAR(64) NOT NULL,
    `driver_id` VARCHAR(64) NOT NULL,
    `role` VARCHAR(50) NOT NULL DEFAULT 'crew',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_lorry_driver` (`lorry_id`, `driver_id`),
    CONSTRAINT `fk_lorry_crew_lorry` FOREIGN KEY (`lorry_id`) REFERENCES `lorries` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_lorry_crew_driver` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 7. Quotations (Commercial Quotes & Booking Orders)
  -- ============================================================
  CREATE TABLE IF NOT EXISTS `quotations` (
    `id` VARCHAR(64) NOT NULL PRIMARY KEY,
    `quote_no` VARCHAR(64) NOT NULL UNIQUE,
    `customer_id` VARCHAR(64) DEFAULT NULL,
    `customer_name` VARCHAR(255) DEFAULT NULL,
    `customer_ref` VARCHAR(255) DEFAULT NULL,
    `pickup_location` TEXT DEFAULT NULL,
    `dropoff_location` TEXT DEFAULT NULL,
    `collection_date` VARCHAR(100) DEFAULT NULL,
    `order_date` VARCHAR(100) DEFAULT NULL,
    `delivery_date` VARCHAR(100) DEFAULT NULL,
    `arrived_date` VARCHAR(100) DEFAULT NULL,
    `pickup_time` VARCHAR(100) DEFAULT NULL,
    `dropoff_time` VARCHAR(100) DEFAULT NULL,
    `loading_time` DATETIME DEFAULT NULL,
    `unloading_time` DATETIME DEFAULT NULL,
    `cargo_desc` TEXT DEFAULT NULL,
    `lorry_spec` VARCHAR(255) DEFAULT NULL,
    `weight_desc` VARCHAR(255) DEFAULT NULL,
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
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_quotations_quote_no` (`quote_no`),
    KEY `idx_quotations_status` (`status`),
    KEY `idx_quotations_customer_id` (`customer_id`),
    CONSTRAINT `fk_quotations_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_quotations_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `staff` (`id`) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 8. Jobs (Job Board, Dispatch & Live Tracking)
  -- ============================================================
  CREATE TABLE IF NOT EXISTS `jobs` (
    `id` VARCHAR(64) NOT NULL PRIMARY KEY,
    `job_no` VARCHAR(64) NOT NULL UNIQUE,
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
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_jobs_job_no` (`job_no`),
    KEY `idx_jobs_status` (`status`),
    KEY `idx_jobs_customer_id` (`customer_id`),
    KEY `idx_jobs_lorry_id` (`lorry_id`),
    KEY `idx_jobs_driver_id` (`driver_id`),
    KEY `idx_jobs_billed_status` (`billed_status`),
    CONSTRAINT `fk_jobs_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_jobs_quotation` FOREIGN KEY (`quotation_id`) REFERENCES `quotations` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_jobs_lorry` FOREIGN KEY (`lorry_id`) REFERENCES `lorries` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_jobs_driver` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 9. Job Crew Mapping (Trip Drivers & Crew)
  -- ============================================================
  CREATE TABLE IF NOT EXISTS `job_crew` (
    `id` VARCHAR(64) NOT NULL PRIMARY KEY,
    `job_id` VARCHAR(64) NOT NULL,
    `driver_id` VARCHAR(64) NOT NULL,
    `role` VARCHAR(50) NOT NULL DEFAULT 'crew',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_job_driver` (`job_id`, `driver_id`),
    CONSTRAINT `fk_job_crew_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_job_crew_driver` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 10. Maintenance Records (Fleet Servicing & Repairs)
  -- ============================================================
  CREATE TABLE IF NOT EXISTS `maintenance_records` (
    `id` VARCHAR(64) NOT NULL PRIMARY KEY,
    `lorry_id` VARCHAR(64) NOT NULL,
    `service_type` VARCHAR(255) DEFAULT NULL,
    `description` TEXT DEFAULT NULL,
    `workshop` VARCHAR(255) DEFAULT NULL,
    `service_date` DATE NOT NULL,
    `next_service_due` DATE DEFAULT NULL,
    `cost` DECIMAL(12,2) DEFAULT 0.00,
    `invoice_no` VARCHAR(100) DEFAULT NULL,
    `notes` TEXT DEFAULT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'completed',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_maint_lorry_id` (`lorry_id`),
    KEY `idx_maint_status` (`status`),
    CONSTRAINT `fk_maintenance_lorry` FOREIGN KEY (`lorry_id`) REFERENCES `lorries` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 11. Inventory Items (Spare Parts Catalog & Quantities)
  -- ============================================================
  CREATE TABLE IF NOT EXISTS `inventory_items` (
    `id` VARCHAR(64) NOT NULL PRIMARY KEY,
    `item_name` VARCHAR(255) DEFAULT NULL,
    `name` VARCHAR(255) DEFAULT NULL,
    `sku` VARCHAR(100) DEFAULT NULL,
    `category` VARCHAR(100) NOT NULL DEFAULT 'other',
    `unit` VARCHAR(50) NOT NULL DEFAULT 'pcs',
    `quantity` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    `quantity_on_hand` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    `min_quantity` DECIMAL(12,2) DEFAULT 0.00,
    `reorder_threshold` DECIMAL(12,2) DEFAULT 0.00,
    `cost_per_unit` DECIMAL(12,2) DEFAULT NULL,
    `unit_cost` DECIMAL(12,2) DEFAULT NULL,
    `location` VARCHAR(100) DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_inventory_sku` (`sku`),
    KEY `idx_inventory_category` (`category`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 12. Inventory Receipts (Stock-In Transactions)
  -- ============================================================
  CREATE TABLE IF NOT EXISTS `inventory_receipts` (
    `id` VARCHAR(64) NOT NULL PRIMARY KEY,
    `item_id` VARCHAR(64) NOT NULL,
    `quantity` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    `unit_cost` DECIMAL(12,2) DEFAULT NULL,
    `supplier` VARCHAR(255) DEFAULT NULL,
    `reference_no` VARCHAR(100) DEFAULT NULL,
    `received_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `notes` TEXT DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_inv_receipts_item` (`item_id`),
    CONSTRAINT `fk_inventory_receipts_item` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 13. Inventory Issuances (Parts Dispatched to Lorries)
  -- ============================================================
  CREATE TABLE IF NOT EXISTS `inventory_issuances` (
    `id` VARCHAR(64) NOT NULL PRIMARY KEY,
    `item_id` VARCHAR(64) NOT NULL,
    `lorry_id` VARCHAR(64) NOT NULL,
    `maintenance_record_id` VARCHAR(64) DEFAULT NULL,
    `quantity` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    `unit_cost` DECIMAL(12,2) DEFAULT NULL,
    `approval_status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `approved_by` VARCHAR(64) DEFAULT NULL,
    `approved_at` DATETIME DEFAULT NULL,
    `requested_by` VARCHAR(64) DEFAULT NULL,
    `issued_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `notes` TEXT DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_issuances_approval_status` (`approval_status`),
    KEY `idx_issuances_item_lorry` (`item_id`, `lorry_id`),
    CONSTRAINT `fk_issuances_item` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_issuances_lorry` FOREIGN KEY (`lorry_id`) REFERENCES `lorries` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_issuances_maintenance` FOREIGN KEY (`maintenance_record_id`) REFERENCES `maintenance_records` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_issuances_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `staff` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_issuances_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `staff` (`id`) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 14. Unified Approvals Queue (Audit & Sign-Off Workflow)
  -- ============================================================
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
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `resolved_at` DATETIME DEFAULT NULL,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_approvals_status` (`status`),
    KEY `idx_approvals_ref` (`ref_id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 15. Customer Rates (Origin-Destination Price Matrix)
  -- ============================================================
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
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_rates_customer` (`customer_id`),
    CONSTRAINT `fk_rates_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 16. Customer Price Lists (Matrix Tiers & Diesel Banding)
  -- ============================================================
  CREATE TABLE IF NOT EXISTS `customer_price_lists` (
    `id` VARCHAR(64) NOT NULL PRIMARY KEY,
    `item_no` VARCHAR(50) DEFAULT NULL,
    `customer_id` VARCHAR(64) DEFAULT NULL,
    `pickup_zone` VARCHAR(50) DEFAULT NULL,
    `pickup_location` VARCHAR(255) DEFAULT NULL,
    `drop_zone` VARCHAR(50) DEFAULT NULL,
    `drop_location` VARCHAR(255) DEFAULT NULL,
    `zone` VARCHAR(50) DEFAULT NULL,
    `destination` VARCHAR(255) DEFAULT NULL,
    `client_tag` VARCHAR(255) DEFAULT NULL,
    `code_word` VARCHAR(255) DEFAULT NULL,
    `note` TEXT DEFAULT NULL,
    `tiers_json` LONGTEXT DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_price_lists_customer` (`customer_id`),
    KEY `idx_price_lists_zone` (`zone`),
    CONSTRAINT `fk_price_lists_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  -- ============================================================
  -- 17. Sales Invoices (Billing & Financial Ledger)
  -- ============================================================
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
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_invoices_invoice_no` (`invoice_no`),
    KEY `idx_invoices_customer_id` (`customer_id`),
    KEY `idx_invoices_payment_status` (`payment_status`),
    CONSTRAINT `fk_invoices_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  SET FOREIGN_KEY_CHECKS = 1;

  -- ============================================================
  -- INITIAL SEED & DEMO DATASET
  -- ============================================================

  -- ── 1. Initial Staff Accounts ────────────────────────────────
  INSERT INTO `staff` (`id`, `name`, `username`, `role`, `pin`, `active`) VALUES
  ('staff-owner-1', 'Rens Admin', 'Dynamic', 'owner', '12345', 1),
  ('staff-admin-1', 'Logistics Operations', 'Admin', 'admin', '12345', 1)
  ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `username`=VALUES(`username`), `role`=VALUES(`role`), `pin`=VALUES(`pin`);

  -- ── 2. Customers, Quotations & Jobs ──────────────────────────
  -- Master dataset populated dynamically via App actions.

  -- ── 3. Drivers (15 Fleet Personnel across 5 Lorry Categories) ──
  INSERT INTO `drivers` (`id`, `name`, `phone`, `pin`, `ic_number`, `license_class`, `license_expiry`, `is_helper`, `status`) VALUES
  ('drv-1', 'Ahmad Razak', '012-345 8901', '1001', '880512-10-5521', 'GDL - D', '2027-02-15', 0, 'available'),
  ('drv-2', 'Suresh Kumar', '016-223 4589', '1002', '901103-14-5823', 'GDL - D', '2026-11-20', 0, 'available'),
  ('drv-3', 'Muhammad Hafiz', '017-889 1234', '1003', '920315-08-6147', 'GDL - D', '2026-12-10', 0, 'available'),
  ('drv-4', 'Tan Boon Wah', '012-678 9012', '1004', '850720-10-5349', 'GDL - E', '2027-01-18', 0, 'available'),
  ('drv-5', 'Mohd Khairul', '013-456 7890', '1005', '870914-01-5231', 'GDL - E', '2026-10-30', 0, 'available'),
  ('drv-6', 'Arumugam A/L Ramasamy', '019-334 5678', '1006', '830405-10-5677', 'GDL - E', '2027-03-05', 0, 'available'),
  ('drv-7', 'Lee Chee Keong', '016-789 0123', '1007', '820819-14-5119', 'GDL - E (Bersendi)', '2026-12-28', 0, 'available'),
  ('drv-8', 'Zulkifli bin Daud', '011-2345 6789', '1008', '860211-03-5491', 'GDL - E (Bersendi)', '2027-02-20', 0, 'available'),
  ('drv-9', 'K. Saravanan', '018-901 2345', '1009', '891025-08-5773', 'GDL - E (Bersendi)', '2027-04-15', 0, 'available'),
  ('drv-10', 'Roslan bin Ismail', '012-901 2345', '1010', '810617-10-5023', 'GDL - E (Bersendi / Berat)', '2027-03-12', 0, 'available'),
  ('drv-11', 'Chong Wei Loon', '017-345 6789', '1011', '841208-14-5367', 'GDL - E (Bersendi / Berat)', '2026-11-05', 0, 'available'),
  ('drv-12', 'Devendran A/L Muthu', '016-456 7891', '1012', '880330-02-5819', 'GDL - E (Bersendi / Berat)', '2027-01-25', 0, 'available'),
  ('drv-13', 'Harun bin Osman', '013-890 1234', '1013', '790915-06-5381', 'GDL - E (Articulated)', '2027-05-10', 0, 'available'),
  ('drv-14', 'Wong Kah Fai', '012-234 5679', '1014', '831122-10-5905', 'GDL - E (Articulated)', '2026-12-15', 0, 'available'),
  ('drv-15', 'G. Tharmalingam', '018-765 4321', '1015', '800114-08-5267', 'GDL - E (Articulated)', '2027-02-28', 0, 'available')
  ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `phone`=VALUES(`phone`), `license_class`=VALUES(`license_class`), `license_expiry`=VALUES(`license_expiry`), `status`=VALUES(`status`);

  -- ── 4. Lorries (15 Active Fleet Units) ───────────────────────
  INSERT INTO `lorries` (`id`, `plate_no`, `capacity_desc`, `target`, `monthly_target`, `road_tax_expiry`, `insurance_expiry`, `permit_expiry`, `default_driver_id`, `status`) VALUES
  ('lry-1', 'WVG 1089', '1 ton 9 ft', 15000.00, 15000.00, '2027-02-15', '2027-02-15', '2027-08-20', 'drv-1', 'available'),
  ('lry-2', 'BNE 3491', '1 ton 9 ft', 15000.00, 15000.00, '2026-11-20', '2026-11-20', '2027-05-15', 'drv-2', 'available'),
  ('lry-3', 'VAK 7819', '1 ton 9 ft', 15000.00, 15000.00, '2026-12-10', '2026-12-10', '2027-06-30', 'drv-3', 'available'),
  ('lry-4', 'WQC 5217', '3 & 5 ton 17 ft', 20000.00, 20000.00, '2027-01-18', '2027-01-18', '2027-07-22', 'drv-4', 'available'),
  ('lry-5', 'BPP 8917', '3 & 5 ton 17 ft', 20000.00, 20000.00, '2026-10-30', '2026-10-30', '2027-04-12', 'drv-5', 'available'),
  ('lry-6', 'VCE 4317', '3 & 5 ton 17 ft', 20000.00, 20000.00, '2027-03-05', '2027-03-05', '2027-09-15', 'drv-6', 'available'),
  ('lry-7', 'WRX 1024', '10 ton 24ft', 25000.00, 25000.00, '2026-12-28', '2026-12-28', '2027-06-18', 'drv-7', 'available'),
  ('lry-8', 'BRT 6724', '10 ton 24ft', 25000.00, 25000.00, '2027-02-20', '2027-02-20', '2027-08-10', 'drv-8', 'available'),
  ('lry-9', 'VDG 9224', '10 ton 24ft', 25000.00, 25000.00, '2027-04-15', '2027-04-15', '2027-10-05', 'drv-9', 'available'),
  ('lry-10', 'WSY 1430', '14 ton 30ft', 30000.00, 30000.00, '2027-03-12', '2027-03-12', '2027-09-28', 'drv-10', 'available'),
  ('lry-11', 'BTU 3830', '14 ton 30ft', 30000.00, 30000.00, '2026-11-05', '2026-11-05', '2027-05-20', 'drv-11', 'available'),
  ('lry-12', 'VEH 7530', '14 ton 30ft', 30000.00, 30000.00, '2027-01-25', '2027-01-25', '2027-07-14', 'drv-12', 'available'),
  ('lry-13', 'WTB 2040', '20 ton 40ft', 35000.00, 35000.00, '2027-05-10', '2027-05-10', '2027-11-20', 'drv-13', 'available'),
  ('lry-14', 'BWD 8240', '20 ton 40ft', 35000.00, 35000.00, '2026-12-15', '2026-12-15', '2027-06-25', 'drv-14', 'available'),
  ('lry-15', 'VFK 9940', '20 ton 40ft', 35000.00, 35000.00, '2027-02-28', '2027-02-28', '2027-08-30', 'drv-15', 'available')
  ON DUPLICATE KEY UPDATE `plate_no`=VALUES(`plate_no`), `capacity_desc`=VALUES(`capacity_desc`), `target`=VALUES(`target`), `monthly_target`=VALUES(`monthly_target`), `default_driver_id`=VALUES(`default_driver_id`), `status`=VALUES(`status`);

