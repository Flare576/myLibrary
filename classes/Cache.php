<?php
declare(strict_types=1);

class Cache
{
    private string $cacheDir;
    private int $defaultTtl;
    private bool $compress;

    public function __construct(string $cacheDir, int $defaultTtl = 3600, bool $compress = true)
    {
        $this->cacheDir = rtrim($cacheDir, '/') . '/';
        $this->defaultTtl = $defaultTtl;
        $this->compress = $compress;
        if (!is_dir($this->cacheDir)) {
            if (!mkdir($this->cacheDir, 0755, true)) {
                throw new RuntimeException("Failed to create cache directory: {$this->cacheDir}");
            }
        }
    }

    public function get(string $key): ?array
    {
        $filePath = $this->getFilePath($key);
        if (!file_exists($filePath)) {
            return null;
        }

        $handle = fopen($filePath, 'rb');
        if (!$handle) {
            return null;
        }

        if (!flock($handle, LOCK_SH)) { // Shared lock for reading
            fclose($handle);
            return null;
        }

        $content = fread($handle, filesize($filePath) ?: 0);
        flock($handle, LOCK_UN);
        fclose($handle);

        if (empty($content)) {
            return null;
        }

        if ($this->compress) {
            $content = gzdecode($content);
            if ($content === false) {
                return null;
            }
        }

        $decoded = json_decode($content, true);
        if (!is_array($decoded) || !isset($decoded['expires'], $decoded['data'])) {
            return null;
        }

        if ($decoded['expires'] < time()) {
            $this->delete($key); // Lazy cleanup
            return null;
        }

        return $decoded['data'];
    }

    public function set(string $key, array $data, ?int $ttl = null): bool
    {
        $ttl = $ttl ?? $this->defaultTtl;
        $expires = time() + $ttl;

        $payload = json_encode([
            'expires' => $expires,
            'data' => $data
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);

        if ($this->compress) {
            $payload = gzencode($payload, 9); // Max compression level
        }

        $filePath = $this->getFilePath($key);
        $dir = dirname($filePath);
        if (!is_dir($dir)) {
            if (!mkdir($dir, 0755, true)) {
                return false;
            }
        }

        $handle = fopen($filePath, 'cb'); // Create/overwrite, binary mode
        if (!$handle) {
            return false;
        }

        if (!flock($handle, LOCK_EX)) { // Exclusive lock for writing
            fclose($handle);
            return false;
        }

        $bytes = fwrite($handle, $payload);
        flock($handle, LOCK_UN);
        fclose($handle);

        return $bytes === strlen($payload);
    }

    public function delete(string $key): bool
    {
        $filePath = $this->getFilePath($key);
        return file_exists($filePath) && unlink($filePath);
    }

    public function cleanup(int $maxAge = 86400): int
    {
        $deleted = 0;
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($this->cacheDir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($iterator as $file) {
            if ($file->isFile() && (time() - $file->getMTime()) > $maxAge) {
                if (unlink($file->getPathname())) {
                    $deleted++;
                }
            }
        }

        // Optionally remove empty dirs
        $this->removeEmptyDirs($this->cacheDir);
        return $deleted;
    }

    private function getFilePath(string $key): string
    {
        $hash = hash('sha1', $key); // 40-char hash for uniqueness
        $dir1 = substr($hash, 0, 2);
        $dir2 = substr($hash, 2, 2);
        return $this->cacheDir . $dir1 . '/' . $dir2 . '/' . $hash . '.cache';
    }

    private function removeEmptyDirs(string $dir): void
    {
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($iterator as $path) {
            if ($path->isDir() && iterator_count(new RecursiveDirectoryIterator($path->getPathname())) === 0) {
                rmdir($path->getPathname());
            }
        }
    }
}
