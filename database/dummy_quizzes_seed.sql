USE phishing_simulation;

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE QuizResults;
TRUNCATE TABLE QuizQuestions;
TRUNCATE TABLE Quizzes;
TRUNCATE TABLE TrainingModules;

-- ============================================================================
-- 1. SEED 5 COMPREHENSIVE TRAINING MODULES
-- ============================================================================
INSERT INTO TrainingModules (id, title, content) VALUES
(1, 'Module 1: Phishing Red Flags & Social Engineering Tactics',
 'Attackers exploit human psychology—using artificial urgency, fear of account suspension, and authority impersonation—to trick employees into bypassing security protocols. Always pause and verify unexpected requests.'),
(2, 'Module 2: URL Inspection, Domain Spoofing & Masked Aliases',
 'Phishing emails frequently hide malicious links behind legitimate-looking anchor text or use display name masks (e.g., "Microsoft 365 Security") over external Gmail or lookalike domains. Hover over every link to inspect the actual destination domain.'),
(3, 'Module 3: Business Email Compromise (BEC) & Invoice Fraud',
 'BEC attacks target Finance, HR, and Operations personnel with urgent wire transfer changes, gift card requests, or payroll direct-deposit updates. Always verify payment or banking changes via a known, independent phone number.'),
(4, 'Module 4: Multi-Factor Authentication (MFA) & Credential Hygiene',
 'Attackers use real-time reverse-proxy landing pages and MFA Fatigue (Prompt Bombing) to intercept one-time passwords and session cookies. Never approve an MFA push notification you did not initiate.'),
(5, 'Module 5: Malicious Attachments, Macros & Ransomware Defense',
 'Ransomware is commonly delivered via password-protected ZIP archives, fake PDF invoice links, or Office documents requesting you to "Enable Content" (macros). Never enable macros on untrusted files.');

-- ============================================================================
-- 2. SEED 5 QUIZZES (LINKED TO THE 5 MODULES)
-- ============================================================================
INSERT INTO Quizzes (id, module_id, title, pass_score) VALUES
(1, 1, 'Quiz 1: Phishing Red Flags & Social Engineering (7 MCQs)', 70),
(2, 2, 'Quiz 2: URL Inspection & Masked Sender Aliases (7 MCQs)', 70),
(3, 3, 'Quiz 3: Business Email Compromise & Payroll Fraud (7 MCQs)', 70),
(4, 4, 'Quiz 4: MFA Fatigue & Credential Harvesting Defense (7 MCQs)', 70),
(5, 5, 'Quiz 5: Ransomware & Malicious Attachment Safety (7 MCQs)', 70);

-- ============================================================================
-- 3. SEED 35 MCQ QUESTIONS (7 QUESTIONS PER QUIZ)
-- ============================================================================

-- QUIZ 1: Phishing Red Flags & Social Engineering (Questions 1 to 7)
INSERT INTO QuizQuestions (quiz_id, question, option_a, option_b, option_c, option_d, correct_option) VALUES
(1, 'An email claims your corporate account will be permanently terminated in 2 hours unless you click a link. What social engineering tactic is this?', 'Artificial urgency and fear induction', 'Routine IT maintenance', 'Multi-factor authentication', 'Zero-trust verification', 'A'),
(1, 'Which greeting is most common in mass, untargeted phishing campaigns?', 'Your exact employee ID and project code', 'Dear Valued Customer / Attention Employee', 'A signed PGP block from IT', 'Your manager calling you on Teams', 'B'),
(1, 'You receive an unexpected password reset email you did not request. What is the safest action?', 'Click the link to cancel the reset', 'Reply with your current password', 'Ignore/report it to SOC and visit the portal manually if concerned', 'Forward the link to your department', 'C'),
(1, 'Why do attackers impersonate C-level executives (CEO/CFO) in spear-phishing emails?', 'Executives have shorter email addresses', 'To leverage authority so employees comply without questioning', 'To test email font rendering', 'Because executives do not use spam filters', 'B'),
(1, 'An email from "HR Benefits" promises a 25% bonus if you sign in within 30 minutes. What is the main indicator of phishing?', 'Too-good-to-be-true financial lure combined with a tight deadline', 'It mentions HR Benefits', 'It was sent on a Tuesday', 'It uses blue buttons', 'A'),
(1, 'What should you do immediately after accidentally clicking a suspicious link in an email?', 'Delete the email and hope nobody notices', 'Disconnect or close the page immediately and report the incident to the SOC team', 'Enter fake passwords 10 times', 'Restart your monitor', 'B'),
(1, 'Which of the following is a classic sign of a social engineering pretext?', 'Asking you to bypass standard verification procedures because of an "emergency"', 'Asking you to complete an assigned quiz inside the official training portal', 'A calendar invite from a teammate you just spoke with', 'An automated syntax check in VS Code', 'A');

-- QUIZ 2: URL Inspection & Masked Sender Aliases (Questions 8 to 14)
INSERT INTO QuizQuestions (quiz_id, question, option_a, option_b, option_c, option_d, correct_option) VALUES
(2, 'An email shows the sender name "Microsoft 365 Security", but the actual email address is "alert+ms365@gmail.com". What does this mean?', 'It is an official Microsoft account', 'The sender used a display name mask and alias; it is not from Microsoft', 'Gmail owns Microsoft 365', 'It is 100% safe to enter your password', 'B'),
(2, 'When you hover your cursor over a link that reads "https://portal.company.com", the preview shows "http://login-company-verify.xyz/auth". Where will clicking take you?', 'portal.company.com', 'login-company-verify.xyz', 'Both websites simultaneously', 'Nowhere, the link is broken', 'B'),
(2, 'Consider the URL: "https://microsoft.com.account-security-check.net/login". What is the actual root domain hosting this website?', 'microsoft.com', 'account-security-check.net', 'login.microsoft.com', 'https', 'B'),
(2, 'Does a padlock icon (HTTPS) in the browser address bar guarantee that a website is legitimate and not a phishing clone?', 'Yes, only legitimate companies can get HTTPS', 'No, it only means traffic is encrypted; phishing sites also use free HTTPS certificates', 'Yes, Google manually reviews every HTTPS site', 'Only on desktop browsers', 'B'),
(2, 'What is "Typosquatting" (or a lookalike domain) in phishing?', 'Registering domains like "micr0soft.com" or "rnicrosoft.com" to deceive fast readers', 'Typing an email very fast', 'Encrypting database tables', 'Using bold fonts in email subjects', 'A'),
(2, 'Why do phishing campaigns often use URL shorteners (like bit.ly or tinyurl) or redirect links?', 'To save bandwidth on the corporate network', 'To hide the true malicious destination URL from casual inspection', 'To make the website load faster', 'Because email clients require short URLs', 'B'),
(2, 'If an email asks you to log into your Office 365 or Google Workspace account, what is the safest way to access your account?', 'Click the button inside the email', 'Open a new browser tab and use your saved bookmark or type the official URL yourself', 'Reply to the sender asking if the link is real', 'Copy the link into a Word document', 'B');

-- QUIZ 3: Business Email Compromise & Payroll Fraud (Questions 15 to 21)
INSERT INTO QuizQuestions (quiz_id, question, option_a, option_b, option_c, option_d, correct_option) VALUES
(3, 'A long-time vendor emails Finance requesting an urgent change to their bank routing and account numbers for an upcoming wire transfer. What must you do?', 'Update the bank details immediately so payment is not late', 'Call the vendor using a trusted phone number already on file (not the number in the email)', 'Reply to the email to confirm', 'Check if the email has a professional signature', 'B'),
(3, 'What is Business Email Compromise (BEC)?', 'A hardware failure in the server room', 'A targeted attack where criminals impersonate executives, vendors, or employees to defraud the company', 'A routine software update', 'When an employee forgets their username', 'B'),
(3, 'HR receives an email purporting to be from an employee asking to update their payroll direct-deposit bank account immediately. What is the risk?', 'Payroll diversion fraud where the attacker steals the employee paycheck', 'No risk if the employee name is spelled right', 'It speeds up payroll processing', 'It only affects tax forms', 'A'),
(3, 'Your CEO emails you from a personal address saying they are in a board meeting and need you to buy 5 Apple gift cards for a client immediately. What is this?', 'A legitimate executive task', 'A textbook CEO Fraud / Gift Card phishing scam', 'A performance evaluation', 'An IT network test', 'B'),
(3, 'Why do many BEC emails contain no malicious links or malware attachments at all?', 'The attacker forgot to attach the file', 'To bypass automated antivirus/link scanners and rely purely on conversational manipulation', 'Because text-only emails are illegal', 'To save storage space', 'B'),
(3, 'What header mismatch is frequently used in BEC attacks so replies go to the attacker instead of the real executive?', 'Setting a different "Reply-To" address than the displayed "From" address', 'Using UTF-8 encoding', 'Adding a CC recipient', 'Using HTML paragraphs', 'A'),
(3, 'Which departments are the highest-value targets for Business Email Compromise?', 'Finance, Accounting, and Human Resources', 'Only external contractors', 'Cafeteria services', 'None, BEC only targets home users', 'A');

-- QUIZ 4: MFA Fatigue & Credential Harvesting Defense (Questions 22 to 28)
INSERT INTO QuizQuestions (quiz_id, question, option_a, option_b, option_c, option_d, correct_option) VALUES
(4, 'What is an "MFA Fatigue" (or Prompt Bombing) attack?', 'When your phone battery dies during login', 'When an attacker who stole your password spams you with MFA push notifications hoping you tap Approve', 'Changing your password every 90 days', 'Using a hardware security key', 'B'),
(4, 'You receive an MFA push notification or SMS OTP code on your phone while you are not trying to log in. What does this indicate?', 'Someone has your username and password and is actively trying to access your account', 'The authentication server is just testing your phone', 'Your account is completely safe', 'You should approve it to clear the notification', 'A'),
(4, 'Why should you NEVER reuse your corporate password on external websites or personal accounts?', 'External data breaches allow attackers to use "Credential Stuffing" to hijack your corporate account', 'It makes typing too easy', 'Browsers do not allow it', 'It slows down your Wi-Fi', 'A'),
(4, 'What happens on a simulated credential-harvesting landing page (like a fake Office 365 login clone)?', 'It upgrades your Office 365 license', 'In a real attack, it steals your credentials the moment you click Sign In', 'It cleans viruses from your browser', 'It encrypts your hard drive', 'B'),
(4, 'Which form of Multi-Factor Authentication (MFA) is most resistant to phishing?', 'FIDO2 / WebAuthn hardware security keys or origin-bound passkeys', 'SMS text message codes', 'Emailing a code to the same inbox', 'Security questions like your pet name', 'A'),
(4, 'If you realize you just typed your corporate password into a fake phishing login page, what are the two most important immediate steps?', 'Change your password immediately on the real portal and notify the SOC / IT Security team', 'Close the laptop lid and go home', 'Wait 30 days for the next password rotation', 'Clear your browser history only', 'A'),
(4, 'How can a browser password manager help protect you against fake phishing landing pages?', 'It will NOT auto-fill your password if the domain URL does not match the real website domain', 'It blocks all emails', 'It changes the color of your screen', 'It writes emails for you', 'A');

-- QUIZ 5: Ransomware & Malicious Attachment Safety (Questions 29 to 35)
INSERT INTO QuizQuestions (quiz_id, question, option_a, option_b, option_c, option_d, correct_option) VALUES
(5, 'You open an email attachment (`Invoice_9921.docm`) and Word displays a yellow bar asking you to click "Enable Content" or "Enable Macros". What should you do?', 'Click Enable Content immediately', 'Close the file immediately without enabling macros and report it to security', 'Forward it to Finance to see if it opens on their PC', 'Disable your antivirus first', 'B'),
(5, 'Why do attackers often send malicious attachments inside a password-protected `.zip` or `.iso` file with the password written in the email body?', 'To protect your privacy', 'To prevent email security gateways from scanning the malware inside the encrypted archive', 'To make the file download faster', 'Because Windows requires passwords on all ZIP files', 'B'),
(5, 'Which file extension is an executable program disguised as a PDF document?', 'quarterly_report.pdf', 'invoice_scan.pdf.exe', 'summary_notes.txt', 'architecture_diagram.png', 'B'),
(5, 'What is Ransomware?', 'Malware that encrypts files/systems and demands payment for decryption', 'A free trial of antivirus software', 'A browser extension for shopping', 'An official Windows firewall update', 'A'),
(5, 'An email from an unknown sender contains an HTML attachment (`Shipping_Receipt.html`) that opens a login form in your browser. Is this safe?', 'Yes, HTML files cannot steal passwords', 'No, local HTML attachments are commonly used to host offline credential-harvesting forms', 'Yes, because it opened offline', 'Only if you use Firefox', 'B'),
(5, 'Before opening an unexpected attachment even from a known colleague, what should you consider?', 'Whether their account could be compromised or spoofed; verify out-of-band if the file looks unusual', 'Nothing, known colleagues are always safe', 'Whether the file size is an even number', 'The time zone of the server', 'A'),
(5, 'What is the best organizational defense if an employee workstation is hit by ransomware?', 'Paying the ransom immediately', 'Isolating the machine from the network immediately and restoring from offline/immutable backups', 'Deleting system32', 'Unplugging the keyboard', 'B');

SET FOREIGN_KEY_CHECKS = 1;