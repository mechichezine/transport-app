-- ================================================================
--  TransportFlow — MySQL Database Schema
--  Import this file in phpMyAdmin:
--  Database > Import > Choose this file > Go
-- ================================================================

CREATE DATABASE IF NOT EXISTS transport_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE transport_db;

-- ── Users ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100)  NOT NULL,
  email      VARCHAR(150)  NOT NULL UNIQUE,
  password   VARCHAR(255)  NOT NULL,
  role       ENUM('client','transporter','admin') NOT NULL DEFAULT 'client',
  phone      VARCHAR(30)   DEFAULT '',
  address    VARCHAR(255)  DEFAULT '',
  is_active  TINYINT(1)    NOT NULL DEFAULT 1,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Transport Requests ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS requests (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  client_id       INT          NOT NULL,
  transporter_id  INT          DEFAULT NULL,
  from_location   VARCHAR(200) NOT NULL,
  to_location     VARCHAR(200) NOT NULL,
  vehicle_type    ENUM('small','medium','large','refrigerated') NOT NULL,
  description     TEXT         DEFAULT NULL,
  weight          DECIMAL(10,2) DEFAULT 0,
  scheduled_date  DATE         NOT NULL,
  estimated_price DECIMAL(10,2) DEFAULT 0,
  final_price     DECIMAL(10,2) DEFAULT 0,
  status          ENUM('pending','accepted','in_progress','completed','cancelled','rejected')
                  NOT NULL DEFAULT 'pending',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (client_id)      REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (transporter_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ── Messages ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  sender_id   INT  NOT NULL,
  receiver_id INT  NOT NULL,
  request_id  INT  DEFAULT NULL,
  content     TEXT NOT NULL,
  is_read     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id)  REFERENCES requests(id) ON DELETE SET NULL
);

-- ── Indexes for performance ───────────────────────────────────────
CREATE INDEX idx_requests_client      ON requests(client_id);
CREATE INDEX idx_requests_transporter ON requests(transporter_id);
CREATE INDEX idx_requests_status      ON requests(status);
CREATE INDEX idx_messages_sender      ON messages(sender_id);
CREATE INDEX idx_messages_receiver    ON messages(receiver_id);
CREATE INDEX idx_messages_read        ON messages(is_read);

-- ── Demo seed data (optional) ─────────────────────────────────────
-- Passwords are bcrypt hashed:
--   admin123   → for admin account
--   client123  → for client account
--   transport123 → for transporter account

INSERT IGNORE INTO users (name, email, password, role, phone) VALUES
(
  'Administrateur',
  'admin@demo.com',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oZ3Y.G6oa',
  'admin',
  '+213 555 00 00'
),
(
  'Jean Client',
  'client@demo.com',
  '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'client',
  '+213 555 00 01'
),
(
  'Ahmed Transport',
  'transport@demo.com',
  '$2a$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'transporter',
  '+213 555 00 02'
);
