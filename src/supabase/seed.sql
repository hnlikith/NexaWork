-- Initial seed data for Namaah Nexus

-- 1. Default System Configuration
INSERT INTO system_config (revenue, profit_percentage, company_stage)
VALUES (10000000, 85, 'Early Growth');

-- 2. Sample Departments (Legacy Structure)
INSERT INTO teams (name, department, member_count)
VALUES 
('Engineering Team', 'Engineering', 0),
('Product Design', 'Product', 0),
('HR Operations', 'HR', 0);
