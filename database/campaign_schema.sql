-- ============================================================
-- FILE 01: database/campaign_schema.sql
-- Scope: Campaigns, CampaignRecipients, EmailTemplates tables
-- ============================================================

-- Email template library
CREATE TABLE IF NOT EXISTS EmailTemplates (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(150)                          NOT NULL,
    description   TEXT,
    subject       VARCHAR(255)                          NOT NULL,
    body          LONGTEXT                              NOT NULL,  -- Raw HTML with {{placeholders}}
    sender_name   VARCHAR(100)                          NOT NULL,
    sender_email  VARCHAR(150)                          NOT NULL,
    created_by    INT UNSIGNED                          NOT NULL,  -- FK → Users.id
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP NOT NULL ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phishing campaign master records
CREATE TABLE IF NOT EXISTS Campaigns (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name             VARCHAR(200)                               NOT NULL,
    description      TEXT,
    template_id      INT UNSIGNED                               NOT NULL,  -- FK → EmailTemplates.id
    landing_page_key VARCHAR(50)                                NOT NULL,  -- e.g. 'o365' | 'gmail'
    status           ENUM('Draft','Scheduled','Running','Completed') DEFAULT 'Draft' NOT NULL,
    scheduled_at     DATETIME,                                              -- NULL = send immediately on launch
    started_at       DATETIME,
    completed_at     DATETIME,
    created_by       INT UNSIGNED                               NOT NULL,  -- FK → Users.id
    created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP     NOT NULL,
    updated_at       DATETIME     DEFAULT CURRENT_TIMESTAMP     NOT NULL ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_status     (status),
    INDEX idx_template   (template_id),
    INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-recipient binding for each campaign
CREATE TABLE IF NOT EXISTS CampaignRecipients (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    campaign_id    INT UNSIGNED                          NOT NULL,  -- FK → Campaigns.id
    employee_id    INT UNSIGNED                          NOT NULL,  -- FK → Employees.id
    tracking_token CHAR(64)                              NOT NULL UNIQUE,  -- SHA-256 hex, generated at schedule time
    email_status   ENUM('Pending','Sent','Failed')       DEFAULT 'Pending' NOT NULL,
    sent_at        DATETIME,
    error_message  TEXT,                                            -- SMTP error if email_status = 'Failed'

    INDEX idx_campaign   (campaign_id),
    INDEX idx_employee   (employee_id),
    INDEX idx_token      (tracking_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store SMTP message ID for each sent email. Enables linking Nodemailer response to database record.
ALTER TABLE campaign_recipients
  ADD COLUMN message_id VARCHAR(255) NULL AFTER tracking_token,
  ADD COLUMN sent_at DATETIME NULL AFTER message_id,
  ADD COLUMN error_message TEXT NULL AFTER sent_at;

-- Record campaign completion timestamp. Distinguishes 'completed' state from running state and enables reporting.
ALTER TABLE campaigns
  ADD COLUMN completed_at DATETIME NULL AFTER updated_at;

CREATE TABLE IF NOT EXISTS notifications (
  id         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED    NOT NULL,
  role       ENUM('admin','employee') NOT NULL,
  title      VARCHAR(255)    NOT NULL,
  message    TEXT            NOT NULL,
  type       VARCHAR(100)    NOT NULL,
  is_read    TINYINT(1)      NOT NULL DEFAULT 0,
  created_at DATETIME        NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_user_role (user_id, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS training_assignments (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  employee_id INT UNSIGNED    NOT NULL,
  module_id   INT UNSIGNED    NOT NULL,
  campaign_id INT UNSIGNED    NOT NULL,
  status      ENUM('pending','in_progress','completed') NOT NULL DEFAULT 'pending',
  due_date    DATETIME        NOT NULL,
  assigned_at DATETIME        NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assignment (employee_id, module_id, campaign_id),
  INDEX idx_employee (employee_id),
  INDEX idx_campaign (campaign_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
