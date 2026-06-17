-- MyLibrary Phase 0 Schema
-- Idempotent: drops old v1 tables and all new tables before recreating

-- Drop old v1 tables
DROP TABLE IF EXISTS user_accounts;
DROP TABLE IF EXISTS user_tokens;

-- Drop new tables (in FK-safe order)
DROP TABLE IF EXISTS user_blobs;
DROP TABLE IF EXISTS bundle_cache;
DROP TABLE IF EXISTS rate_limits;
DROP TABLE IF EXISTS users;

-- Users: just an ID derived from their credentials
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,        -- userId = URL-safe base64 of deterministic encryption
  created_at TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Encrypted blob store
CREATE TABLE IF NOT EXISTS user_blobs (
  user_id VARCHAR(255) PRIMARY KEY,
  `blob` TEXT NOT NULL,               -- JSON string: {iv, ciphertext} -- server never decrypts
  etag VARCHAR(64),                   -- MD5 of blob for concurrency control
  updated_at TIMESTAMP DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bundle cache (public, no user data)
CREATE TABLE IF NOT EXISTS bundle_cache (
  slug VARCHAR(255) PRIMARY KEY,
  data JSON NOT NULL,                 -- full bundle data including tiers + games
  cached_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL       -- = bundle end_date
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rate limiting (blob store + bundle scraper)
CREATE TABLE IF NOT EXISTS rate_limits (
  key_hash VARCHAR(64) PRIMARY KEY,   -- hash of IP or userId
  requests INT DEFAULT 1,
  window_start TIMESTAMP DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
