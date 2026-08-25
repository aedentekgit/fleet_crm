-- ============================================================
-- Rens Dynamics ERP — Complete Database Purge / Reset Script
-- Target Database: u745362362_renserp
-- Compatible with Hostinger / phpMyAdmin / MySQL 5.7+ & 8.0+
-- ============================================================

-- Disable foreign key checks for this execution batch
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Clear child / transactional & demo tables
DELETE FROM `job_crew`;
DELETE FROM `inventory_issuances`;
DELETE FROM `inventory_receipts`;
DELETE FROM `maintenance_records`;
DELETE FROM `sales_invoices`;
DELETE FROM `jobs`;
DELETE FROM `quotations`;
DELETE FROM `approvals`;
DELETE FROM `customer_rates`;
DELETE FROM `customer_price_lists`;
DELETE FROM `customer_contacts`;
DELETE FROM `customers`;
DELETE FROM `inventory_items`;

-- 2. Preserve or re-seed default Staff administrator accounts
DELETE FROM `staff`;
INSERT INTO `staff` (`id`, `name`, `username`, `role`, `pin`, `active`) VALUES
('staff-owner-1', 'Rens Admin', 'Dynamic', 'owner', '12345', 1),
('staff-admin-1', 'Logistics Operations', 'Admin', 'admin', '12345', 1);

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Verification summary
SELECT 'jobs' AS `table`, COUNT(*) AS `count` FROM `jobs`
UNION ALL SELECT 'quotations', COUNT(*) FROM `quotations`
UNION ALL SELECT 'customers', COUNT(*) FROM `customers`
UNION ALL SELECT 'customer_contacts', COUNT(*) FROM `customer_contacts`
UNION ALL SELECT 'lorries', COUNT(*) FROM `lorries`
UNION ALL SELECT 'drivers', COUNT(*) FROM `drivers`
UNION ALL SELECT 'approvals', COUNT(*) FROM `approvals`
UNION ALL SELECT 'inventory_items', COUNT(*) FROM `inventory_items`
UNION ALL SELECT 'customer_rates', COUNT(*) FROM `customer_rates`
UNION ALL SELECT 'customer_price_lists', COUNT(*) FROM `customer_price_lists`
UNION ALL SELECT 'sales_invoices', COUNT(*) FROM `sales_invoices`
UNION ALL SELECT 'staff', COUNT(*) FROM `staff`;
