USE phishing_simulation;

-- Disable Foreign Key checks for clean reset of simulation tables
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- 1. CLEAR PREVIOUS SIMULATION DATA (PRESERVES USERS & YOUR NEW PASSWORD!)
-- ============================================================================
TRUNCATE TABLE EmailEvents;
TRUNCATE TABLE CampaignRecipients;
TRUNCATE TABLE QuizResults;
TRUNCATE TABLE QuizQuestions;
TRUNCATE TABLE Quizzes;
TRUNCATE TABLE TrainingModules;
TRUNCATE TABLE Campaigns;
TRUNCATE TABLE EmailTemplates;
TRUNCATE TABLE LandingPages;
TRUNCATE TABLE Employees;
TRUNCATE TABLE AuditLogs;

-- ============================================================================
-- 2. ENSURE ADMIN USERS EXIST (DOES NOT OVERWRITE YOUR RESET PASSWORD)
-- ============================================================================
INSERT IGNORE INTO Users (id, name, email, password_hash, role) VALUES
(1, 'Om Jalela (Lead Architect)', 'omjalela4@gmail.com', '$2b$10$wTf20kU7/hO697wGviU7d.JmFjY0U4xXF7aG5V3mGqK2y4D5k7V5O', 'Admin'),
(2, 'Sharmista Bar (Education & Analytics)', 'sharmistabar@gmail.com', '$2b$10$7ZzRkJ7HhB63.M3D9XwV1.YyJtZ7KxPqO0V6M4wXmYn0iQz2G1G12', 'Admin'),
(3, 'Maitreya Jadhav (Phishing Engine)', 'maitreyajadhav@gmail.com', '$2b$10$L1i9vU4HwP7O2mQ4rV8Ye.JmK7xY3aB5mP6V2mGqK2y4D5k7V5Opq', 'Admin'),
(4, 'Abdul Hannan (Visualization & Reports)', 'abdulhannan@gmail.com', '$2b$10$Y5n2vM8KwP3O7mQ1rV6Ye.ZmA8xY4aC6mP7V3mGqK2y4D5k7V5Ors', 'Admin');

-- ============================================================================
-- 3. SEED 5 EMAIL TEMPLATES
-- ============================================================================
INSERT INTO EmailTemplates (id, name, subject, body_html) VALUES
(1, 'Microsoft 365 - Urgent Password Expiry', 'CRITICAL: Your Microsoft 365 Password Expires in 2 Hours',
 '<p>Hello {{name}},</p><p>Your corporate Microsoft 365 credentials are scheduled to expire today. To avoid losing access to Outlook and Teams, please verify your identity immediately:</p><p><a href="{{tracking_link}}">Keep My Current Password</a></p><p>Microsoft 365 Security Operations</p>'),
(2, 'HR Department - Q3 Bonus & Payout Adjustment', 'Action Required: Review Your Q3 Performance Bonus Statement',
 '<p>Dear {{name}},</p><p>Human Resources has finalized the Q3 performance bonus payouts for the {{department}} department. Please sign in to confirm your direct deposit allocation before 5:00 PM:</p><p><a href="{{tracking_link}}">View Compensation Statement</a></p><p>Corporate HR Benefits Team</p>'),
(3, 'Finance - Overdue Vendor Invoice #INV-90412', 'URGENT: Unpaid Vendor Invoice #INV-90412 Requires Approval',
 '<p>Hello {{name}},</p><p>Our accounts payable audit flagged an overdue wire transfer requiring your immediate sign-off. Please inspect the invoice ledger here:</p><p><a href="{{tracking_link}}">Approve Wire Transfer #INV-90412</a></p><p>Finance Accounts Payable</p>'),
(4, 'IT Helpdesk - Mandatory VPN Certificate Update', 'Security Alert: Mandatory Zero-Trust VPN Client Upgrade',
 '<p>Attention {{name}},</p><p>Due to recent security patches, all {{department}} workstations must re-authenticate their VPN security token within 24 hours:</p><p><a href="{{tracking_link}}">Download & Authenticate VPN Certificate</a></p><p>Enterprise IT Helpdesk</p>'),
(5, 'Google Workspace - Suspicious Sign-In Attempt', 'Security Alert: New Sign-In Detected from Unrecognized Device',
 '<p>Hi {{name}},</p><p>We blocked a sign-in attempt to your corporate Google Workspace account from an unrecognized Linux device. Please review your recent activity log immediately:</p><p><a href="{{tracking_link}}">Secure My Google Workspace Account</a></p><p>Google Workspace Security</p>');

-- ============================================================================
-- 4. SEED 3 FAKE LANDING PAGES
-- ============================================================================
INSERT INTO LandingPages (id, name, slug, html_content) VALUES
(1, 'Microsoft Office 365 Login Clone', 'office365', '<h2>Sign in to Microsoft 365</h2>'),
(2, 'Google Workspace Login Clone', 'gmail', '<h2>Sign in with Google</h2>'),
(3, 'Corporate Single Sign-On Gateway', 'sso-portal', '<h2>Enterprise SSO Re-Authentication</h2>');

-- ============================================================================
-- 5. SEED 25 TARGET EMPLOYEES (ACROSS 7 DEPARTMENTS FOR PAGINATION & FILTERS)
-- ============================================================================
INSERT INTO Employees (id, name, email, department, risk_level, created_at) VALUES
(1, 'Alice Johnson', 'alice.johnson@internal.sec', 'Finance', 'High', '2026-09-01 08:30:00'),
(2, 'Bob Smith', 'bob.smith@internal.sec', 'IT', 'Low', '2026-09-01 09:00:00'),
(3, 'Charlie Brown', 'charlie.brown@internal.sec', 'HR', 'Medium', '2026-09-02 09:15:00'),
(4, 'Diana Prince', 'diana.prince@internal.sec', 'Engineering', 'Low', '2026-09-02 10:00:00'),
(5, 'Edward Norton', 'edward.norton@internal.sec', 'Finance', 'High', '2026-09-03 10:30:00'),
(6, 'Fiona Gallagher', 'fiona.gallagher@internal.sec', 'Marketing', 'High', '2026-09-03 11:00:00'),
(7, 'George Clark', 'george.clark@internal.sec', 'Legal', 'Low', '2026-09-04 11:30:00'),
(8, 'Hannah Abbott', 'hannah.abbott@internal.sec', 'HR', 'High', '2026-09-04 12:00:00'),
(9, 'Ian Malcolm', 'ian.malcolm@internal.sec', 'Engineering', 'Medium', '2026-09-05 08:45:00'),
(10, 'Julia Roberts', 'julia.roberts@internal.sec', 'Marketing', 'Medium', '2026-09-05 09:20:00'),
(11, 'Kevin Mitnick', 'kevin.mitnick@internal.sec', 'IT', 'Low', '2026-09-06 10:10:00'),
(12, 'Laura Palmer', 'laura.palmer@internal.sec', 'Finance', 'High', '2026-09-06 11:05:00'),
(13, 'Michael Scott', 'michael.scott@internal.sec', 'Operations', 'High', '2026-09-07 13:00:00'),
(14, 'Nina Myers', 'nina.myers@internal.sec', 'Legal', 'Medium', '2026-09-07 14:15:00'),
(15, 'Oscar Martinez', 'oscar.martinez@internal.sec', 'Finance', 'Low', '2026-09-08 09:30:00'),
(16, 'Pam Beesly', 'pam.beesly@internal.sec', 'Operations', 'Medium', '2026-09-08 10:45:00'),
(17, 'Quentin Tarantino', 'quentin.t@internal.sec', 'Marketing', 'High', '2026-09-09 11:20:00'),
(18, 'Rachel Green', 'rachel.green@internal.sec', 'HR', 'Medium', '2026-09-09 12:30:00'),
(19, 'Samir Nagheenanajar', 'samir.n@internal.sec', 'Engineering', 'Low', '2026-09-10 14:00:00'),
(20, 'Toby Flenderson', 'toby.flenderson@internal.sec', 'HR', 'High', '2026-09-10 15:10:00'),
(21, 'Uma Thurman', 'uma.thurman@internal.sec', 'Legal', 'Low', '2026-09-11 09:00:00'),
(22, 'Victor Von Doom', 'victor.doom@internal.sec', 'Engineering', 'Low', '2026-09-11 10:30:00'),
(23, 'Walter White', 'walter.white@internal.sec', 'Operations', 'High', '2026-09-12 11:45:00'),
(24, 'Xander Cage', 'xander.cage@internal.sec', 'Marketing', 'Medium', '2026-09-12 13:15:00'),
(25, 'Yash Dekhale', 'yash.dekhale@internal.sec', 'IT', 'Low', '2026-09-13 16:00:00');

-- ============================================================================
-- 6. SEED 5 PHISHING CAMPAIGNS
-- ============================================================================
INSERT INTO Campaigns (id, name, description, template_id, landing_page_id, status, scheduled_at, created_by, created_at) VALUES
(1, 'Q3 Executive Payroll & Tax Verification Drill', 'High-urgency finance and payroll simulation across all corporate departments.', 3, 1, 'Completed', '2026-09-15 09:00:00', 1, '2026-09-14 10:00:00'),
(2, 'Annual HR Bonus & Compensation Lure', 'Tests susceptibility to financial reward pretexts in HR, Marketing, and Operations.', 2, 1, 'Completed', '2026-09-19 10:30:00', 1, '2026-09-18 11:00:00'),
(3, 'Mandatory Zero-Trust VPN Certificate Audit', 'Technical pretext targeting IT, Engineering, and Legal staff.', 4, 2, 'Completed', '2026-09-22 14:00:00', 1, '2026-09-21 09:30:00'),
(4, 'Microsoft 365 Emergency Password Expiry', 'Live active simulation testing credential harvesting resistance.', 1, 1, 'Running', '2026-09-25 09:00:00', 1, '2026-09-24 16:00:00'),
(5, 'Q4 Google Workspace Unrecognized Sign-In Drill', 'Scheduled security drill for upcoming evaluation.', 5, 2, 'Draft', NULL, 1, '2026-09-26 08:00:00');

-- ============================================================================
-- 7. SEED CAMPAIGN RECIPIENTS (40 MAPPINGS ACROSS CAMPAIGNS 1 TO 4)
-- ============================================================================
INSERT INTO CampaignRecipients (id, campaign_id, employee_id, tracking_token, sent_at) VALUES
-- Campaign 1 (15 Recipients)
(101, 1, 1, 'tok-c1-emp1', '2026-09-15 09:01:00'),
(102, 1, 2, 'tok-c1-emp2', '2026-09-15 09:01:10'),
(103, 1, 3, 'tok-c1-emp3', '2026-09-15 09:01:20'),
(104, 1, 4, 'tok-c1-emp4', '2026-09-15 09:01:30'),
(105, 1, 5, 'tok-c1-emp5', '2026-09-15 09:01:40'),
(106, 1, 6, 'tok-c1-emp6', '2026-09-15 09:01:50'),
(107, 1, 7, 'tok-c1-emp7', '2026-09-15 09:02:00'),
(108, 1, 8, 'tok-c1-emp8', '2026-09-15 09:02:10'),
(109, 1, 9, 'tok-c1-emp9', '2026-09-15 09:02:20'),
(110, 1, 10, 'tok-c1-emp10', '2026-09-15 09:02:30'),
(111, 1, 12, 'tok-c1-emp12', '2026-09-15 09:02:40'),
(112, 1, 13, 'tok-c1-emp13', '2026-09-15 09:02:50'),
(113, 1, 17, 'tok-c1-emp17', '2026-09-15 09:03:00'),
(114, 1, 20, 'tok-c1-emp20', '2026-09-15 09:03:10'),
(115, 1, 23, 'tok-c1-emp23', '2026-09-15 09:03:20'),

-- Campaign 2 (10 Recipients)
(201, 2, 1, 'tok-c2-emp1', '2026-09-19 10:31:00'),
(202, 2, 3, 'tok-c2-emp3', '2026-09-19 10:31:20'),
(203, 2, 5, 'tok-c2-emp5', '2026-09-19 10:31:40'),
(204, 2, 6, 'tok-c2-emp6', '2026-09-19 10:32:00'),
(205, 2, 8, 'tok-c2-emp8', '2026-09-19 10:32:20'),
(206, 2, 10, 'tok-c2-emp10', '2026-09-19 10:32:40'),
(207, 2, 13, 'tok-c2-emp13', '2026-09-19 10:33:00'),
(208, 2, 16, 'tok-c2-emp16', '2026-09-19 10:33:20'),
(209, 2, 18, 'tok-c2-emp18', '2026-09-19 10:33:40'),
(210, 2, 24, 'tok-c2-emp24', '2026-09-19 10:34:00'),

-- Campaign 3 (8 Recipients)
(301, 3, 2, 'tok-c3-emp2', '2026-09-22 14:01:00'),
(302, 3, 4, 'tok-c3-emp4', '2026-09-22 14:01:30'),
(303, 3, 7, 'tok-c3-emp7', '2026-09-22 14:02:00'),
(304, 3, 9, 'tok-c3-emp9', '2026-09-22 14:02:30'),
(305, 3, 11, 'tok-c3-emp11', '2026-09-22 14:03:00'),
(306, 3, 14, 'tok-c3-emp14', '2026-09-22 14:03:30'),
(307, 3, 19, 'tok-c3-emp19', '2026-09-22 14:04:00'),
(308, 3, 25, 'tok-c3-emp25', '2026-09-22 14:04:30'),

-- Campaign 4 (7 Recipients)
(401, 4, 1, 'tok-c4-emp1', '2026-09-25 09:05:00'),
(402, 4, 5, 'tok-c4-emp5', '2026-09-25 09:05:30'),
(403, 4, 12, 'tok-c4-emp12', '2026-09-25 09:06:00'),
(404, 4, 13, 'tok-c4-emp13', '2026-09-25 09:06:30'),
(405, 4, 15, 'tok-c4-emp15', '2026-09-25 09:07:00'),
(406, 4, 20, 'tok-c4-emp20', '2026-09-25 09:07:30'),
(407, 4, 23, 'tok-c4-emp23', '2026-09-25 09:08:00');

-- ============================================================================
-- 8. SEED 115+ EMAIL EVENTS (FUNNELS + 24x7 HEATMAP ACROSS ALL 7 DAYS)
-- ============================================================================
INSERT INTO EmailEvents (recipient_id, event_type, ip_address, user_agent, created_at) VALUES
-- Campaign 1: 15 Delivered, 12 Opened, 9 Clicked, 6 Submitted
(101, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-15 09:01:05'),
(102, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-15 09:01:15'),
(103, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-15 09:01:25'),
(104, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-15 09:01:35'),
(105, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-15 09:01:45'),
(106, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-15 09:01:55'),
(107, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-15 09:02:05'),
(108, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-15 09:02:15'),
(109, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-15 09:02:25'),
(110, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-15 09:02:35'),
(111, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-15 09:02:45'),
(112, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-15 09:02:55'),
(113, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-15 09:03:05'),
(114, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-15 09:03:15'),
(115, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-15 09:03:25'),

(101, 'Opened', '192.168.1.10', 'Mozilla/5.0 (Windows NT 10.0)', '2026-09-20 08:15:00'),
(102, 'Opened', '192.168.1.11', 'Mozilla/5.0 (X11; Linux)', '2026-09-20 09:20:00'),
(103, 'Opened', '192.168.1.12', 'Mozilla/5.0 (Macintosh)', '2026-09-20 10:30:00'),
(105, 'Opened', '192.168.1.14', 'Mozilla/5.0 (Windows NT 10.0)', '2026-09-21 09:10:00'),
(106, 'Opened', '192.168.1.15', 'Mozilla/5.0 (iPhone)', '2026-09-21 11:05:00'),
(108, 'Opened', '192.168.1.17', 'Mozilla/5.0 (Windows NT 10.0)', '2026-09-21 14:15:00'),
(109, 'Opened', '192.168.1.18', 'Mozilla/5.0 (Macintosh)', '2026-09-22 10:40:00'),
(110, 'Opened', '192.168.1.19', 'Mozilla/5.0 (Windows NT 10.0)', '2026-09-22 13:20:00'),
(111, 'Opened', '192.168.1.20', 'Mozilla/5.0 (Windows NT 10.0)', '2026-09-22 15:10:00'),
(112, 'Opened', '192.168.1.21', 'Mozilla/5.0 (Windows NT 10.0)', '2026-09-23 11:00:00'),
(113, 'Opened', '192.168.1.22', 'Mozilla/5.0 (Android)', '2026-09-23 16:45:00'),
(114, 'Opened', '192.168.1.23', 'Mozilla/5.0 (Windows NT 10.0)', '2026-09-24 09:30:00'),

(101, 'Clicked', '192.168.1.10', 'Mozilla/5.0', '2026-09-20 08:17:00'),
(103, 'Clicked', '192.168.1.12', 'Mozilla/5.0', '2026-09-20 10:35:00'),
(105, 'Clicked', '192.168.1.14', 'Mozilla/5.0', '2026-09-21 09:12:00'),
(106, 'Clicked', '192.168.1.15', 'Mozilla/5.0', '2026-09-21 11:08:00'),
(108, 'Clicked', '192.168.1.17', 'Mozilla/5.0', '2026-09-21 14:18:00'),
(111, 'Clicked', '192.168.1.20', 'Mozilla/5.0', '2026-09-22 15:12:00'),
(112, 'Clicked', '192.168.1.21', 'Mozilla/5.0', '2026-09-23 11:04:00'),
(113, 'Clicked', '192.168.1.22', 'Mozilla/5.0', '2026-09-23 16:48:00'),
(114, 'Clicked', '192.168.1.23', 'Mozilla/5.0', '2026-09-24 09:33:00'),

(101, 'Submitted', '192.168.1.10', 'Mozilla/5.0', '2026-09-20 08:19:00'),
(105, 'Submitted', '192.168.1.14', 'Mozilla/5.0', '2026-09-21 09:15:00'),
(106, 'Submitted', '192.168.1.15', 'Mozilla/5.0', '2026-09-21 11:10:00'),
(108, 'Submitted', '192.168.1.17', 'Mozilla/5.0', '2026-09-21 14:20:00'),
(111, 'Submitted', '192.168.1.20', 'Mozilla/5.0', '2026-09-22 15:15:00'),
(112, 'Submitted', '192.168.1.21', 'Mozilla/5.0', '2026-09-23 11:06:00'),

-- Campaign 2 Events
(201, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-19 10:31:05'),
(202, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-19 10:31:25'),
(203, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-19 10:31:45'),
(204, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-19 10:32:05'),
(205, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-19 10:32:25'),
(206, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-19 10:32:45'),
(207, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-19 10:33:05'),
(208, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-19 10:33:25'),
(209, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-19 10:33:45'),
(210, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-19 10:34:05'),
(201, 'Opened', '10.0.0.11', 'Mozilla/5.0', '2026-09-24 14:10:00'),
(202, 'Opened', '10.0.0.12', 'Mozilla/5.0', '2026-09-24 14:15:00'),
(203, 'Opened', '10.0.0.13', 'Mozilla/5.0', '2026-09-24 14:20:00'),
(204, 'Opened', '10.0.0.14', 'Mozilla/5.0', '2026-09-24 14:25:00'),
(205, 'Opened', '10.0.0.15', 'Mozilla/5.0', '2026-09-25 10:10:00'),
(207, 'Opened', '10.0.0.17', 'Mozilla/5.0', '2026-09-25 10:20:00'),
(201, 'Clicked', '10.0.0.11', 'Mozilla/5.0', '2026-09-24 14:30:00'),
(203, 'Clicked', '10.0.0.13', 'Mozilla/5.0', '2026-09-24 14:35:00'),
(204, 'Clicked', '10.0.0.14', 'Mozilla/5.0', '2026-09-24 14:40:00'),
(207, 'Clicked', '10.0.0.17', 'Mozilla/5.0', '2026-09-25 10:25:00'),
(201, 'Submitted', '10.0.0.11', 'Mozilla/5.0', '2026-09-24 14:42:00'),
(203, 'Submitted', '10.0.0.13', 'Mozilla/5.0', '2026-09-24 14:45:00'),
(207, 'Submitted', '10.0.0.17', 'Mozilla/5.0', '2026-09-25 10:28:00'),

-- Campaign 3 & 4 Events + Heatmap Spikes (Covering Morning, Afternoon & Evening)
(301, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-22 14:01:05'),
(302, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-22 14:01:35'),
(303, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-22 14:02:05'),
(304, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-22 14:02:35'),
(305, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-22 14:03:05'),
(306, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-22 14:03:35'),
(307, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-22 14:04:05'),
(308, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-22 14:04:35'),
(304, 'Opened', '10.0.0.34', 'Mozilla/5.0', '2026-09-25 17:10:00'),
(306, 'Opened', '10.0.0.36', 'Mozilla/5.0', '2026-09-25 17:20:00'),
(306, 'Clicked', '10.0.0.36', 'Mozilla/5.0', '2026-09-25 17:25:00'),
(401, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-26 09:05:00'),
(402, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-26 09:06:00'),
(403, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-26 09:07:00'),
(404, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-26 09:08:00'),
(405, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-26 09:09:00'),
(406, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-26 09:10:00'),
(407, 'Delivered', '127.0.0.1', 'SME-MTA', '2026-09-26 09:11:00'),
(401, 'Opened', '10.0.0.41', 'Mozilla/5.0', '2026-09-26 11:15:00'),
(402, 'Opened', '10.0.0.42', 'Mozilla/5.0', '2026-09-26 11:20:00'),
(403, 'Opened', '10.0.0.43', 'Mozilla/5.0', '2026-09-26 11:25:00'),
(401, 'Clicked', '10.0.0.41', 'Mozilla/5.0', '2026-09-26 11:30:00'),
(402, 'Clicked', '10.0.0.42', 'Mozilla/5.0', '2026-09-26 11:35:00'),
(401, 'Submitted', '10.0.0.41', 'Mozilla/5.0', '2026-09-26 11:40:00');

-- ============================================================================
-- 9. SEED 4 TRAINING MODULES, 4 QUIZZES & 10 MCQ QUESTIONS
-- ============================================================================
INSERT INTO TrainingModules (id, title, content) VALUES
(1, 'Spotting Phishing Red Flags & Artificial Urgency', 'Learn how social engineers manufacture panic (e.g., 2-hour account suspension warnings) to bypass critical thinking.'),
(2, 'URL Inspection & Masked Sender Aliases', 'Always inspect the actual email address behind a display name mask and verify the root domain before clicking links.'),
(3, 'Invoice Fraud & Business Email Compromise (BEC)', 'Finance and HR staff must verify wire transfer or direct deposit changes via an independent voice call.'),
(4, 'Multi-Factor Authentication (MFA) Fatigue Defense', 'Never approve unexpected push notifications or enter OTP codes on unfamiliar SSO portals.');

INSERT INTO Quizzes (id, module_id, title, pass_score) VALUES
(1, 1, 'Phishing Red Flags & Urgency Drill', 70),
(2, 2, 'URL & Masked Sender Verification Quiz', 75),
(3, 3, 'Executive Invoice & BEC Protection Assessment', 80),
(4, 4, 'Zero-Trust & MFA Security Quiz', 70);

INSERT INTO QuizQuestions (id, quiz_id, question, option_a, option_b, option_c, option_d, correct_option) VALUES
(1, 1, 'An email from IT claims your account will be deleted in 2 hours unless you click a link. What is the primary red flag?', 'Manufactured urgency designed to induce panic', 'It was sent during business hours', 'It uses standard fonts', 'It includes a greeting', 'A'),
(2, 1, 'What should you do first if you receive an unexpected password reset email?', 'Click the link to check', 'Reply with your employee ID', 'Do not click; navigate to the official portal independently or report to SOC', 'Forward it to your personal email', 'C'),
(3, 1, 'Which psychological trigger is most commonly abused in payroll phishing?', 'Fear of missing out on compensation or tax penalties', 'Curiosity about office snacks', 'Routine calendar invites', 'Standard newsletter footers', 'A'),
(4, 2, 'An email displays "Microsoft 365 Security" as the sender name, but the address is "alert@login-ms365-support.xyz". Is it legitimate?', 'Yes, the display name says Microsoft', 'No, anyone can spoof a display mask; the domain is untrusted', 'Yes, if there are no typos', 'Only on mobile devices', 'B'),
(5, 2, 'You hover over a link showing "https://microsoft.com.verify-session.net/login". Where does this link actually go?', 'microsoft.com', 'verify-session.net', 'Your local intranet', 'Office 365 Admin Center', 'B'),
(6, 3, 'A vendor emails an urgent request to update their bank routing number for an invoice due today. What is the mandatory procedure?', 'Update it immediately to avoid late fees', 'Reply to the email asking if they are sure', 'Call the vendor using a previously verified phone number on file', 'Approve it if the PDF looks real', 'C'),
(7, 3, 'Why are Finance and HR departments heavily targeted in spear-phishing?', 'They have direct access to payroll, PII, and wire transfers', 'They use older monitors', 'They work fewer hours', 'They do not use email', 'A'),
(8, 4, 'You receive 5 consecutive MFA push notifications on your phone at 11:00 PM while not logging in. What is happening?', 'Routine server maintenance', 'An MFA Fatigue / Prompt Bombing attack; deny and report immediately', 'Your phone needs a reboot', 'A normal software update', 'B');

-- ============================================================================
-- 10. SEED QUIZ RESULTS (INCLUDING ALICE JOHNSON'S HISTORY)
-- ============================================================================
INSERT INTO QuizResults (quiz_id, employee_id, score, passed, completed_at) VALUES
(1, 1, 67, 0, '2026-09-16 10:15:00'),
(1, 1, 100, 1, '2026-09-17 11:30:00'),
(2, 1, 100, 1, '2026-09-20 15:45:00'),
(1, 2, 100, 1, '2026-09-16 09:30:00'),
(2, 2, 100, 1, '2026-09-18 14:20:00'),
(1, 3, 67, 0, '2026-09-19 16:00:00'),
(1, 4, 100, 1, '2026-09-20 11:10:00'),
(1, 5, 33, 0, '2026-09-21 13:00:00'),
(2, 5, 50, 0, '2026-09-22 15:30:00'),
(1, 6, 100, 1, '2026-09-22 10:00:00'),
(3, 7, 100, 1, '2026-09-23 12:00:00'),
(1, 8, 67, 0, '2026-09-24 09:45:00'),
(2, 9, 100, 1, '2026-09-24 14:15:00'),
(4, 11, 100, 1, '2026-09-25 11:00:00'),
(3, 15, 100, 1, '2026-09-25 16:30:00');

-- ============================================================================
-- 11. SEED IMMUTABLE AUDIT LOGS
-- ============================================================================
INSERT INTO AuditLogs (user_id, action, details, ip_address, created_at) VALUES
(1, 'ADMIN_LOGIN', '{"email":"omjalela4@gmail.com","role":"Admin"}', '127.0.0.1', '2026-09-14 09:55:00'),
(1, 'CSV_ROSTER_IMPORT', '{"file":"enterprise_staff_q3.csv","imported":25}', '127.0.0.1', '2026-09-14 10:00:00'),
(1, 'CAMPAIGN_DISPATCH', '{"campaignId":1,"name":"Q3 Executive Payroll & Tax Verification Drill","sent":15}', '127.0.0.1', '2026-09-15 09:01:00'),
(2, 'QUIZ_MODULE_CREATED', '{"moduleId":3,"title":"Invoice Fraud & Business Email Compromise (BEC)"}', '127.0.0.1', '2026-09-18 10:15:00'),
(3, 'CAMPAIGN_DISPATCH', '{"campaignId":2,"name":"Annual HR Bonus & Compensation Lure","sent":10}', '127.0.0.1', '2026-09-19 10:30:00'),
(4, 'REPORT_PDF_GENERATED', '{"campaignId":1,"exportedBy":"abdulhannan@gmail.com"}', '127.0.0.1', '2026-09-21 15:20:00'),
(1, 'AI_TEMPLATE_GENERATED', '{"model":"gemini-3.8-flash","scenario":"Mandatory Zero-Trust VPN Certificate"}', '127.0.0.1', '2026-09-21 18:00:00'),
(1, 'CAMPAIGN_DISPATCH', '{"campaignId":3,"name":"Mandatory Zero-Trust VPN Certificate Audit","sent":8}', '127.0.0.1', '2026-09-22 14:00:00'),
(1, 'PASSWORD_RESET_REQUESTED', '{"email":"omjalela4@gmail.com","alias":"spotifykaemailaddress+account-recovery@gmail.com"}', '127.0.0.1', NOW());

SET FOREIGN_KEY_CHECKS = 1;