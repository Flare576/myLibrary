# MyLibrary Game Library Aggregator - Agent Guide

## Project Overview

MyLibrary is a web-based game library aggregator that allows users to connect multiple gaming platforms (Steam, Epic Games, GOG, itch.io, Humble Bundle) and search across their entire game collection from a single interface.

### Architecture
- **Backend**: PHP 8.3 with MySQL database
- **Frontend**: Vanilla JavaScript (no frameworks)
- **Authentication**: Passwordless email-based authentication
- **Deployment**: SFTP upload to IONOS hosting

## Key Components

### Core Files
- `index.html` - Main application interface with authentication states
- `js/app.js` - Complete frontend application (AuthStateManager, PlatformManager, GameGrid)
- `api/connect.php` - OAuth integration handler for gaming platforms
- `api/auth.php` - Passwordless authentication system  
- `db/schema.sql` - MySQL database schema
- `deploy` - Deployment script using lftp

### Environment Variables Required
```
MYLIB_FTP_HOST=host.domain.com
MYLIB_FTP_USER=username  
MYLIB_FTP_PASS=password
MYLIB_FTP_REMOTE_DIR=./myLibrary
MYLIB_LOCAL_DIR=.
```

### Configuration
- `config.php` - Database credentials, API keys, SMTP settings (outside webroot)
- Uses PHP sessions for authentication state
- MySQL database with UUID primary keys

## Development Workflow

### Testing
- Tests are in `tests/` directory (JavaScript-based)
- Use `npm test` or check README for specific test commands

### Linting/Type Checking
- No explicit linting setup detected
- PHP code follows PSR-style conventions

### Deployment
**IMPORTANT**: During development, use `./deploy` without arguments to upload changes without committing.

```bash
./deploy                    # Upload changes only (development)
./deploy -m "commit message" # Upload + commit changes (when ready)
```
Options:
- `-p` to post to BlueSky afterward
- `-m` to commit with message (ONLY use when functionality is confirmed working)
- `-n` for dry run (currently a no-op for this script)

## Platform Integration Status

### ✅ Implemented
- **Steam**: OpenID authentication flow
- **Epic Games**: OAuth2 implementation
- **itch.io**: OAuth2 with profile scope

### 🚧 Placeholder/Not Implemented  
- **GOG**: No public API available
- **Humble Bundle**: Requires partnership access

## Database Schema
- `users` - User accounts with UUID primary keys
- `user_accounts` - Connected platform accounts
- `user_tokens` - Authentication tokens with expiration

## API Endpoints
- `/api/auth/init` - Start authentication
- `/api/auth/validate` - Validate token
- `/api/connect/{platform}/init` - Start OAuth flow
- `/api/connect/{platform}/complete` - Complete OAuth callback
- `/api/games/all` - Aggregate games from all platforms
- `/api/games/refresh` - Refresh game data

## File Upload & Deployment

The project uses `lftp` for SFTP deployment. The deploy script:
1. Validates environment variables
2. Excludes sensitive files (config, dotfiles, backups)
3. Mirrors local directory to remote host
4. Optional git operations

### Excluded from deployment
- Files starting with `.`
- `config.php` (sensitive config)
- `.swp` and `.bkp` files
- `tags` file

---

## FTP Log Management

### Pulling Logs from Remote Server

To download the `logs/` folder from the FTP server:

```bash
# Pull the logs directory
lftp -u "$MYLIB_FTP_USER","$MYLIB_FTP_PASS" "sftp://$MYLIB_FTP_HOST:22" <<EOF
mirror --verbose logs/
bye
EOF
```

### Available Log Files
- `logs/php-errors.log` - PHP error logs from production server

### PHP Configuration Requirements
**IMPORTANT**: For PHP error logging to work, there MUST be a `php.ini` file in the SAME folder as the `.php` file. PHP configuration is NOT hierarchical on IONOS hosting - each subdirectory needs its own `php.ini` copy.

### Environment Variables Required
Ensure these are set in your environment:
- `MYLIB_FTP_HOST` - FTP/SFTP server hostname
- `MYLIB_FTP_USER` - FTP username  
- `MYLIB_FTP_PASS` - FTP password
- `MYLIB_FTP_PORT` - FTP port (defaults to 22)

### Log Analysis Commands
```bash
# View recent errors
tail -n 50 logs/php-errors.log

# Monitor in real-time
tail -f logs/php-errors.log

# Count error types
grep -o "PHP [A-Z]*:" logs/php-errors.log | sort | uniq -c
```