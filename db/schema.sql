-- Database: flare_db (create via IONOS cPanel)
-- Full schema with indexes for performance

CREATE DATABASE IF NOT EXISTS flare_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE flare_db;

CREATE TABLE users (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email VARCHAR(255) UNIQUE NOT NULL,
    nickname VARCHAR(100),
    profile_info JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_active (is_active)
) ENGINE=InnoDB;

CREATE TABLE user_accounts (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL,
    ext_system ENUM('steam', 'epic', 'gog', 'itch', 'humble') NOT NULL,
    ext_id VARCHAR(64),
    nonce CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_ext (user_id, ext_system),
    INDEX idx_ext_system (ext_system)
) ENGINE=InnoDB;

CREATE TABLE user_tokens (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL,
    token CHAR(36) NOT NULL UNIQUE,
    state ENUM('Pending', 'Validated', 'Disabled') DEFAULT 'Pending',
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_token (token),
    INDEX idx_state_expires (state, expires_at),
    INDEX idx_ip_created (ip_address, created_at)
) ENGINE=InnoDB;

-- Initial data or triggers if needed
-- Cron alternative: Manual cleanup query: DELETE FROM user_tokens WHERE expires_at < NOW();