<?php
declare(strict_types=1);

namespace App\Auth;

use PDO;
use RuntimeException;
use InvalidArgumentException;

// Note: For full UUID, install ramsey/uuid via Composer if possible; here use native random_bytes for token
// For email, use native mail(); for production, use PHPMailer with SMTP config from config.php

class PasswordlessAuth
{
    private PDO $pdo;
    private string $appUrl;
    private int $tokenExpiryMinutes = 15;
    private int $rateLimitAttempts = 5;
    private int $rateLimitWindowMinutes = 60;
    private array $emailConfig;

    public function __construct(PDO $pdo, string $appUrl, array $emailConfig = [])
    {
        $this->pdo = $pdo;
        $this->appUrl = rtrim($appUrl, '/');
        $this->emailConfig = $emailConfig;
    }

    public function init(string $email, string $ip, string $userAgent): string
    {
        $this->enforceRateLimit($email, $ip);

        $userId = $this->getOrCreateUser($email);

        $token = bin2hex(random_bytes(18));  // 36-char hex token (UUID-like)
        $expiresAt = date('Y-m-d H:i:s', time() + ($this->tokenExpiryMinutes * 60));

        $stmt = $this->pdo->prepare(
            'INSERT INTO user_tokens (user_id, token, expires_at, ip_address, user_agent) 
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$userId, $token, $expiresAt, $ip, $userAgent]);

        $this->sendEmail($email, $token);

        return $userId;
    }

    public function validate(string $token, string $ip, string $userAgent): ?array
    {
        $this->enforceValidationRateLimit($ip);

        $stmt = $this->pdo->prepare(
            'SELECT ut.id, ut.user_id, ut.expires_at, ut.used_at, u.email 
             FROM user_tokens ut 
             JOIN users u ON ut.user_id = u.id 
             WHERE ut.token = ? AND ut.expires_at > NOW() AND ut.used_at IS NULL AND ut.state = "Pending"
             LIMIT 1'
        );
        $stmt->execute([$token]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            throw new InvalidArgumentException('Invalid or expired token');
        }

        $updateStmt = $this->pdo->prepare('UPDATE user_tokens SET used_at = NOW(), state = "Validated" WHERE id = ?');
        $updateStmt->execute([$row['id']]);

        $this->invalidateOtherTokens($row['user_id'], $row['id']);

        return [
            'user_id' => $row['user_id'],
            'email' => $row['email'],
        ];
    }

    public function poll(string $sessionId): array
    {
        // Simple session check; assume sessions table or use PHP session
        // For now, placeholder - implement full session management later
        session_start();
        if (isset($_SESSION['user_id'])) {
            $stmt = $this->pdo->prepare('SELECT id, email FROM users WHERE id = ?');
            $stmt->execute([$_SESSION['user_id']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user) {
                return [
                    'authenticated' => true,
                    'user' => ['id' => $user['id'], 'email' => $user['email']]
                ];
            }
        }
        return ['authenticated' => false];
    }

    private function getOrCreateUser(string $email): string
    {
        $stmt = $this->pdo->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$email]);
        if ($row = $stmt->fetch()) {
            return $row['id'];
        }

        $userId = bin2hex(random_bytes(18));  // UUID-like
        $stmt = $this->pdo->prepare('INSERT INTO users (id, email) VALUES (?, ?)');
        $stmt->execute([$userId, $email]);
        return $userId;
    }

    private function sendEmail(string $email, string $token): void
    {
        $subject = 'Your MyLibrary Login Token';
        $message = "
        <h2>Login to MyLibrary</h2>
        <p>Click to login: <a href='{$this->appUrl}?token={$token}'>Login Link</a></p>
        <p>Or copy token: {$token}</p>
        <p>Expires in {$this->tokenExpiryMinutes} minutes.</p>
        ";

        error_log("Attempting to send email to: " . $email);

        // Use SMTP if configured, otherwise fallback to mail()
        if (!empty($this->emailConfig)) {
            error_log("Using SMTP configuration");
            $this->sendSMTPEmail($email, $subject, $message);
        } else {
            error_log("Using default mail() function");
            $headers = 'MIME-Version: 1.0' . "\r\n";
            $headers .= 'Content-type: text/html; charset=UTF-8' . "\r\n";
            $headers .= 'From: no-reply@flare576.com' . "\r\n";

            if (!mail($email, $subject, $message, $headers)) {
                error_log("mail() function failed");
                throw new RuntimeException('Failed to send email');
            }
            error_log("Email sent successfully via mail()");
        }
    }

    private function sendSMTPEmail(string $to, string $subject, string $message): void
    {
        $fromEmail = $this->emailConfig['from_email'] ?? 'mylibrary@flare576.com';
        $fromName = $this->emailConfig['from_name'] ?? 'MyLibrary';
        $smtpHost = $this->emailConfig['smtp_host'] ?? '';
        $smtpPort = $this->emailConfig['smtp_port'] ?? 587;
        $smtpUser = $this->emailConfig['smtp_user'] ?? '';
        $smtpPass = $this->emailConfig['smtp_pass'] ?? '';

        if (empty($smtpHost) || empty($smtpUser) || empty($smtpPass)) {
            throw new RuntimeException('SMTP configuration incomplete');
        }

        // Create proper headers for SMTP
        $headers = [
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            'From: ' . $fromName . ' <' . $fromEmail . '>',
            'Reply-To: ' . $fromEmail,
            'X-Mailer: PHP/' . phpversion()
        ];

        // Use PHP's built-in mail with proper SMTP headers
        // Note: For full SMTP support, you'd need PHPMailer or similar
        // This relies on the server's mail configuration
        if (!mail($to, $subject, $message, implode("\r\n", $headers))) {
            throw new RuntimeException('Failed to send email via SMTP');
        }
    }

    private function invalidateOtherTokens(string $userId, string $currentTokenId): void
    {
        $stmt = $this->pdo->prepare(
            'UPDATE user_tokens SET used_at = NOW(), state = "Disabled" WHERE user_id = ? AND id != ? AND used_at IS NULL'
        );
        $stmt->execute([$userId, $currentTokenId]);
    }

    private function enforceRateLimit(string $email, string $ip): void
    {
        $windowStart = date('Y-m-d H:i:s', time() - ($this->rateLimitWindowMinutes * 60));
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) FROM user_tokens 
             WHERE (ip_address = ? OR user_id IN (SELECT id FROM users WHERE email = ?)) 
             AND created_at > ?'
        );
        $stmt->execute([$ip, $email, $windowStart]);
        if ((int) $stmt->fetchColumn() >= $this->rateLimitAttempts) {
            throw new RuntimeException('Rate limit exceeded. Try again later.');
        }
    }

    private function enforceValidationRateLimit(string $ip): void
    {
        // Placeholder: Implement failed attempt logging if needed
    }
}
