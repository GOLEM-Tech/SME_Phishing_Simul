-- ============================================================
-- landing_schema.sql
-- Dev 3 scope: event log, notification tracking
-- Engine: InnoDB | Charset: utf8mb4
-- ============================================================

-- --------------------------------------------------------
-- Table: landing_page_logs
-- Captures non-credential phishing interaction events.
-- Linked to campaigns + campaign_recipients.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `landing_page_logs` (
    `id`                BIGINT UNSIGNED     NOT NULL AUTO_INCREMENT,
    `campaign_id`       INT UNSIGNED        NOT NULL,
    `recipient_id`      INT UNSIGNED        NOT NULL,
    `event_type`        ENUM(
                            'delivered',
                            'opened',
                            'clicked',
                            'submitted_credentials'
                        )                   NOT NULL,

    -- Non-credential submission capture: username string only, no passwords
    `captured_username` VARCHAR(255)        NULL     DEFAULT NULL,

    -- IPv4 (15 chars) and IPv6 (45 chars) support
    `ip_address`        VARCHAR(45)         NOT NULL,

    -- Full user-agent string (browsers can be verbose)
    `user_agent`        VARCHAR(1000)       NULL     DEFAULT NULL,

    -- Auto-populating ISO-compatible timestamp
    `created_at`        DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),

    -- FK: campaign reference
    CONSTRAINT `fk_lpl_campaign`
        FOREIGN KEY (`campaign_id`)
        REFERENCES `campaigns` (`id`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    -- FK: recipient reference
    CONSTRAINT `fk_lpl_recipient`
        FOREIGN KEY (`recipient_id`)
        REFERENCES `campaign_recipients` (`id`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    -- Composite index: campaign + recipient reads (dashboard drilldowns)
    INDEX `idx_lpl_campaign_recipient` (`campaign_id`, `recipient_id`),

    -- Index: event_type filter (funnel metric queries)
    INDEX `idx_lpl_event_type` (`event_type`),

    -- Index: timestamp range scans (timeline/heatmap queries)
    INDEX `idx_lpl_created_at` (`created_at`),

    -- Composite index: campaign + event_type + timestamp (most common dashboard query pattern)
    INDEX `idx_lpl_campaign_event_time` (`campaign_id`, `event_type`, `created_at`)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Phishing event log. No password columns permitted.';


-- --------------------------------------------------------
-- Table: notifications
-- System-wide alert bus for admin and employee targets.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
    `id`                INT UNSIGNED        NOT NULL AUTO_INCREMENT,

    -- Recipient flags: admin FK or employee FK, mutually exclusive
    `admin_id`          INT UNSIGNED        NULL     DEFAULT NULL,
    `employee_id`       INT UNSIGNED        NULL     DEFAULT NULL,

    -- Notification classification
    `type`              ENUM(
                            'campaign_complete',
                            'campaign_started',
                            'training_assigned',
                            'training_completed',
                            'quiz_due',
                            'phishing_failed',
                            'employee_imported',
                            'reminder'
                        )                   NOT NULL,

    -- Notification message payload
    `message`           TEXT                NOT NULL,

    -- Optional campaign context reference
    `campaign_id`       INT UNSIGNED        NULL     DEFAULT NULL,

    -- Optional employee context reference (e.g., admin notified about specific employee)
    `related_employee_id` INT UNSIGNED      NULL     DEFAULT NULL,

    -- Read/completion flag: NULL = unread, timestamp = read-at moment
    `read_at`           DATETIME            NULL     DEFAULT NULL,

    `created_at`        DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),

    -- FK: admin recipient
    CONSTRAINT `fk_notif_admin`
        FOREIGN KEY (`admin_id`)
        REFERENCES `users` (`id`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    -- FK: employee recipient
    CONSTRAINT `fk_notif_employee`
        FOREIGN KEY (`employee_id`)
        REFERENCES `employees` (`id`)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    -- FK: optional campaign context
    CONSTRAINT `fk_notif_campaign`
        FOREIGN KEY (`campaign_id`)
        REFERENCES `campaigns` (`id`)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    -- FK: optional related employee context
    CONSTRAINT `fk_notif_related_employee`
        FOREIGN KEY (`related_employee_id`)
        REFERENCES `employees` (`id`)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    -- Index: admin inbox queries (unread filter)
    INDEX `idx_notif_admin_read` (`admin_id`, `read_at`),

    -- Index: employee inbox queries (unread filter)
    INDEX `idx_notif_employee_read` (`employee_id`, `read_at`),

    -- Index: type filter (bulk admin queries by event category)
    INDEX `idx_notif_type` (`type`),

    -- Index: campaign context lookup
    INDEX `idx_notif_campaign` (`campaign_id`),

    -- Index: timestamp ordering (feed sort)
    INDEX `idx_notif_created_at` (`created_at`)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='System notification bus. Maps to admin users or employees.';

-- Add captured_identity col to email_events and landing_page_logs
ALTER TABLE email_events
  ADD COLUMN captured_identity VARCHAR(320) NULL AFTER event_type;

ALTER TABLE landing_page_logs
  ADD COLUMN captured_identity VARCHAR(320) NULL AFTER event_type;

-- training_assignments table (if not exists — Dev 2 owns full schema)
CREATE TABLE IF NOT EXISTS training_assignments (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id   INT UNSIGNED NOT NULL,
  campaign_id   INT UNSIGNED NOT NULL,
  trigger_event VARCHAR(50)  NOT NULL,
  status        ENUM('pending','in_progress','completed') NOT NULL DEFAULT 'pending',
  assigned_at   DATETIME     NOT NULL,
  UNIQUE KEY uq_emp_campaign (employee_id, campaign_id)
);