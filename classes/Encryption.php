<?php

/**
 * Shared encryption utility for sensitive data like OAuth tokens
 * Uses AES-256-GCM with fallback to OpenSSL when Sodium not available
 */
class Encryption
{
    private string $key;

    public function __construct(string $encryptionKey)
    {
        if (empty($encryptionKey)) {
            throw new InvalidArgumentException('Encryption key cannot be empty');
        }
        $this->key = $encryptionKey;
    }

    /**
     * Encrypt sensitive data using AES-256-GCM
     */
    public function encrypt(string $data): string
    {
        if (!function_exists('sodium_crypto_aead_aes256gcm_encrypt')) {
            return $this->encryptWithOpenSSL($data);
        }
        
        $nonce = random_bytes(SODIUM_CRYPTO_AEAD_AES256GCM_NPUBBYTES);
        $encrypted = sodium_crypto_aead_aes256gcm_encrypt($data, '', $nonce, $this->key);
        return base64_encode($nonce . $encrypted);
    }

    /**
     * Decrypt sensitive data
     */
    public function decrypt(string $encryptedData): string
    {
        $data = base64_decode($encryptedData);
        
        if (!function_exists('sodium_crypto_aead_aes256gcm_decrypt')) {
            return $this->decryptWithOpenSSL($data);
        }
        
        $nonce = substr($data, 0, SODIUM_CRYPTO_AEAD_AES256GCM_NPUBBYTES);
        $encrypted = substr($data, SODIUM_CRYPTO_AEAD_AES256GCM_NPUBBYTES);
        $decrypted = sodium_crypto_aead_aes256gcm_decrypt($encrypted, '', $nonce, $this->key);
        
        if ($decrypted === false) {
            throw new RuntimeException('Decryption failed');
        }
        
        return $decrypted;
    }

    /**
     * OpenSSL fallback for encryption
     */
    private function encryptWithOpenSSL(string $data): string
    {
        $iv = random_bytes(16);
        $tag = '';
        $encrypted = openssl_encrypt($data, 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
        return base64_encode($iv . $tag . $encrypted);
    }

    /**
     * OpenSSL fallback for decryption
     */
    private function decryptWithOpenSSL(string $data): string
    {
        $iv = substr($data, 0, 16);
        $tag = substr($data, 16, 16);
        $encrypted = substr($data, 32);
        
        $decrypted = openssl_decrypt($encrypted, 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, $iv, $tag);
        if ($decrypted === false) {
            throw new RuntimeException('OpenSSL decryption failed');
        }
        
        return $decrypted;
    }
}