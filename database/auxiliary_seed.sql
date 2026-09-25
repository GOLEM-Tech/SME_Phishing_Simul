USE phishing_simulation;

-- ============================================================================
-- 1. SCHEMA REFINEMENTS (Relational linkages for Campaigns)
-- ============================================================================
ALTER TABLE Campaigns 
  ADD COLUMN template_id INT NULL AFTER description,
  ADD COLUMN landing_page_id INT NULL AFTER template_id,
  ADD CONSTRAINT fk_campaign_template FOREIGN KEY (template_id) REFERENCES EmailTemplates(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_campaign_landing FOREIGN KEY (landing_page_id) REFERENCES LandingPages(id) ON DELETE SET NULL;

-- ============================================================================
-- 2. EMAIL TEMPLATES SEED (For Dev 3 & Phishing Pretexts)
-- ============================================================================
INSERT INTO EmailTemplates (id, name, subject, body_html) VALUES
(1, 'IT Support - Urgent Password Expiration', 'CRITICAL: Your Corporate Password Expires in 24 Hours', 
 '<p>Hello {{name}},</p><p>Our IT Security system detected that your corporate password will expire within 24 hours. Failure to update it will result in immediate suspension of VPN and email access.</p><p><a href="{{tracking_link}}">Click here to update your credentials immediately</a>.</p><p>Regards,<br>IT Helpdesk Support</p>'),

(2, 'HR Department - Annual Bonus & Leave Policy', 'Notice: Updated Compensation Structure & Annual Bonus Policy', 
 '<p>Dear Employee,</p><p>The HR Department has published the updated compensation brackets and bonus eligibility criteria for Q3/Q4. Please review the attached corporate portal document to verify your eligibility status.</p><p><a href="{{tracking_link}}">Review HR Compensation Document</a></p><p>Human Resources Team</p>'),

(3, 'Finance - Pending Vendor Invoice Discrepancy', 'Urgent Action Required: Outstanding Invoice Payment #INV-89211', 
 '<p>Dear Colleague,</p><p>Please find the audit report regarding the invoice discrepancy for account #INV-89211. Immediate sign-off is required before finance seals this billing cycle at 5:00 PM today.</p><p><a href="{{tracking_link}}">Review and Approve Invoice</a></p><p>Finance Accounts Team</p>')
ON DUPLICATE KEY UPDATE name=VALUES(name), subject=VALUES(subject), body_html=VALUES(body_html);

-- ============================================================================
-- 3. FAKE LANDING PAGES SEED (For Dev 3 & Target Interception)
-- ============================================================================
INSERT INTO LandingPages (id, name, slug, html_content) VALUES
(1, 'Microsoft 365 Portal Login Clone', 'ms-login', 
 '<!DOCTYPE html><html><head><title>Sign in to your account</title></head><body style="font-family:Segoe UI,sans-serif;padding:40px;"><div style="max-width:440px;margin:auto;border:1px solid #ccc;padding:30px;"><h2>Microsoft</h2><p>Sign In</p><input type="email" placeholder="Email, phone, or Skype" style="width:100%;margin-bottom:10px;padding:8px;"/><input type="password" placeholder="Password" style="width:100%;margin-bottom:10px;padding:8px;"/><button style="background:#0067b8;color:#fff;padding:8px 20px;border:none;">Next</button></div></body></html>'),

(2, 'Corporate Single Sign-On (SSO) Portal', 'sso-portal', 
 '<!DOCTYPE html><html><head><title>Corporate Access Gateway</title></head><body style="font-family:Arial,sans-serif;background:#f4f6f8;padding:50px;"><div style="max-width:400px;margin:auto;background:#fff;padding:25px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);"><h3>Enterprise SSO Gateway</h3><p>Session timed out. Please enter your credentials to reconnect.</p><input type="text" placeholder="Username" style="width:100%;margin-bottom:10px;padding:8px;"/><input type="password" placeholder="Password" style="width:100%;margin-bottom:15px;padding:8px;"/><button style="width:100%;background:#2e7d32;color:#fff;padding:10px;border:none;border-radius:4px;">Sign In</button></div></body></html>')
ON DUPLICATE KEY UPDATE name=VALUES(name), slug=VALUES(slug), html_content=VALUES(html_content);

-- ============================================================================
-- 4. TRAINING MODULES SEED (For Dev 2 - Education)
-- ============================================================================
INSERT INTO TrainingModules (id, title, content) VALUES
(1, 'Spotting Phishing Red Flags & False Urgency', 
 'Phishing attackers frequently leverage psychological pressure such as artificial urgency, generic greetings, and spoofed sender domains to coerce quick action. Always scrutinize sender email addresses and inspect hyperlinked URLs before clicking.'),

(2, 'URL Inspection & Safe Credential Handling', 
 'Legitimate internal services will never ask you to authenticate through unfamiliar domain names. Always verify SSL certificates and examine the full domain path (e.g., login.company.com vs. company.security-update.com) prior to entering corporate passwords.')
ON DUPLICATE KEY UPDATE title=VALUES(title), content=VALUES(content);

-- ============================================================================
-- 5. QUIZZES SEED (For Dev 2 - Assessment Engine)
-- ============================================================================
INSERT INTO Quizzes (id, module_id, title, pass_score) VALUES
(1, 1, 'Phishing Red Flags Assessment', 70),
(2, 2, 'Credential Protection & Link Safety Quiz', 75)
ON DUPLICATE KEY UPDATE title=VALUES(title), pass_score=VALUES(pass_score);

-- ============================================================================
-- 6. QUIZ QUESTIONS SEED (For Dev 2 - MCQs)
-- ============================================================================
INSERT INTO QuizQuestions (id, quiz_id, question, option_a, option_b, option_c, option_d, correct_option) VALUES
(1, 1, 'An email from "IT Support" warns your account will close in 2 hours unless you confirm your password. What is the biggest red flag?', 
 'Artificial urgency designed to prevent critical thinking', 'The email was received on a weekday', 'The sender used plain text', 'The email has a company logo', 'A'),

(2, 1, 'What is the most effective way to verify an unexpected email requesting sensitive info?', 
 'Reply directly asking if it is real', 'Contact the purported sender via an independently verified channel (phone or chat)', 'Click the link to see if the page looks authentic', 'Forward it to colleagues to check', 'B'),

(3, 2, 'You hover over a link in an email: it displays "http://portal.microsoft.com.account-update.xyz". Is this safe?', 
 'Yes, because it contains "portal.microsoft.com"', 'Yes, if it opens in Chrome', 'No, the actual destination domain is "account-update.xyz"', 'Yes, if it asks for standard login details', 'C')
 ON DUPLICATE KEY UPDATE question=VALUES(question), correct_option=VALUES(correct_option);