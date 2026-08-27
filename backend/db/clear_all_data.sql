-- =====================================================================
-- Rens Dynamics ERP - Clear All Demo & Operational Records
-- Target Database: u745362362_renserp
-- Execute this in phpMyAdmin -> SQL tab to reset database completely
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE `approvals`;
TRUNCATE TABLE `customer_contacts`;
TRUNCATE TABLE `customer_price_lists`;
TRUNCATE TABLE `customer_rates`;
TRUNCATE TABLE `customers`;
TRUNCATE TABLE `drivers`;
TRUNCATE TABLE `inventory_issuances`;
TRUNCATE TABLE `inventory_items`;
TRUNCATE TABLE `inventory_receipts`;
TRUNCATE TABLE `job_crew`;
TRUNCATE TABLE `jobs`;
TRUNCATE TABLE `lorry_crew`;
TRUNCATE TABLE `lorries`;
TRUNCATE TABLE `maintenance_records`;
TRUNCATE TABLE `quotations`;
TRUNCATE TABLE `sales_invoices`;

-- Keep default admin & owner accounts for system authentication
DELETE FROM `staff` WHERE `id` NOT IN ('staff-owner-1', 'staff-admin-1');

INSERT INTO `staff` (`id`, `name`, `username`, `role`, `pin`, `active`) VALUES
('staff-owner-1', 'Rens Admin', 'Dynamic', 'owner', '12345', 1),
('staff-admin-1', 'Logistics Operations', 'Admin', 'admin', '12345', 1)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `username`=VALUES(`username`), `role`=VALUES(`role`), `pin`=VALUES(`pin`);

SET FOREIGN_KEY_CHECKS = 1;
