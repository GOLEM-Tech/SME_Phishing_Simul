-- 0. Wipe and Rebuild Database Cleanly
DROP DATABASE IF EXISTS phishing_simulation;
CREATE DATABASE phishing_simulation;
USE phishing_simulation;

-- ============================================================================
-- 1. USERS TABLE (Admins & Role Management)
-- ============================================================================
CREATE TABLE Users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. EMPLOYEES TABLE (Simulation Targets - Dev 1)
-- ============================================================================
CREATE TABLE Employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    department VARCHAR(100) DEFAULT 'General',
    risk_level ENUM('Low', 'Medium', 'High') DEFAULT 'Low',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. CAMPAIGNS TABLE (Core Phishing Engine - Dev 3)
-- ============================================================================
CREATE TABLE Campaigns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    status ENUM('Draft', 'Scheduled', 'Running', 'Completed') DEFAULT 'Draft',
    scheduled_at DATETIME NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL
);

-- ============================================================================
-- 4. EMAIL TEMPLATES (Core Phishing Engine - Dev 3)
-- ============================================================================
CREATE TABLE EmailTemplates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body_html TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 5. LANDING PAGES (Fake Clones, No Credential Storage - Dev 3)
-- ============================================================================
CREATE TABLE LandingPages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    html_content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 6. CAMPAIGN RECIPIENTS (Junction Mapping Targets - Dev 3 & Dev 1)
-- ============================================================================
CREATE TABLE CampaignRecipients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    campaign_id INT NOT NULL,
    employee_id INT NOT NULL,
    tracking_token VARCHAR(64) NOT NULL UNIQUE,
    sent_at DATETIME NULL,
    FOREIGN KEY (campaign_id) REFERENCES Campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES Employees(id) ON DELETE CASCADE
);

-- ============================================================================
-- 7. EMAIL EVENTS (Tracking Engine - Dev 1)
-- ============================================================================
CREATE TABLE EmailEvents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recipient_id INT NOT NULL,
    event_type ENUM('Delivered', 'Opened', 'Clicked', 'Submitted') NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipient_id) REFERENCES CampaignRecipients(id) ON DELETE CASCADE
);

-- ============================================================================
-- 8. TRAINING MODULES (Education - Dev 2)
-- ============================================================================
CREATE TABLE TrainingModules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 9. QUIZZES & QUESTIONS (Education - Dev 2)
-- ============================================================================
CREATE TABLE Quizzes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    module_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    pass_score INT DEFAULT 70,
    FOREIGN KEY (module_id) REFERENCES TrainingModules(id) ON DELETE CASCADE
);

CREATE TABLE QuizQuestions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quiz_id INT NOT NULL,
    question TEXT NOT NULL,
    option_a VARCHAR(255) NOT NULL,
    option_b VARCHAR(255) NOT NULL,
    option_c VARCHAR(255) NOT NULL,
    option_d VARCHAR(255) NOT NULL,
    correct_option CHAR(1) NOT NULL,
    FOREIGN KEY (quiz_id) REFERENCES Quizzes(id) ON DELETE CASCADE
);

-- ============================================================================
-- 10. QUIZ RESULTS (Progress & Risk Scoring - Dev 2 & Dev 4)
-- ============================================================================
CREATE TABLE QuizResults (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quiz_id INT NOT NULL,
    employee_id INT NOT NULL,
    score INT NOT NULL,
    passed BOOLEAN NOT NULL,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quiz_id) REFERENCES Quizzes(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES Employees(id) ON DELETE CASCADE
);

-- ============================================================================
-- 11. AUDIT LOGS (Security & Admin Activity - Dev 1)
-- ============================================================================
CREATE TABLE AuditLogs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL
);

-- ============================================================================
-- SEED DATA: 4 TEAM ADMINS
-- dev1: Dev1 | dev2: Dev2 | dev3: Dev3 | dev4: Dev4
-- ============================================================================
INSERT INTO Users (name, email, password_hash, role) VALUES
('Dev 1 (Foundation & Data)', 'omjalela4@gmail.com', '$2b$10$3zR9ySg1vK7q5y3eT3Kj8u8mFn5h9fB2d1W4s7A0x9C8v7B6n5M4q', 'Admin'),
('Dev 2 (Education & Analytics)', 'sharmistabar@gmail.com', '$2b$10$5pL2uHg9eX1v7t8bQ4Nm3u6zVp0a1c7e9fB3d2W5s8A1x0C9v8B7n', 'Admin'),
('Dev 3 (Core Phishing Engine)', 'maitreyajadhav@gmail.com', '$2b$10$7qN4wJi1gZ3x9v0dE6Po5w8bXr2c3e9g1hD5f4Y7u0C3z2E1x0D9p', 'Admin'),
('Dev 4 (Visualization & Reports)', 'abdulhannan@gmail.com', '$2b$10$9sP6yLk3iB5z1x2fG8Rq7y0dZt4e5g1i3jF7h6A9w2E5b4G3z2F1s', 'Admin');
