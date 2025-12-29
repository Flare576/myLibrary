# Goal

When I used a Windows PC, I relied heavily on an application called Playnite. The key value for me was that this application acted as a universal hub for all of my game launchers and libraries, allowing me to quickly search across all of them to determine if I owned a game and on what platform.

When I switched to a Steam Deck, I lost the ability to quickly search in this way, instead needing to launch each app to search.

I'd like to build a website that a user can come to, link their Libraries to, and then search across all of them at once. I want to support, at a minimum:

- Steam
- Epic
- GoG
- itch.io
- Humble Games

# Deployment

My webhost is IONOS.com, which is a PHP-based host, so our backend needs to be written in PHP 8.3.

Additionally, the host offers MySQL data integration for any data we need to save serverside.

This means, however, that any front-end system we build needs to be in vanilla JS/CSS/HTML and uploaded to the host - the server doesn't support `npm`, `node`, or other non-PHP languages or processes.

Additionally, any server-side API keys, DB credentials, etc. should be loaded from a config.php file.

# User Identity

I'd like to create a passwordless login system, where a user visiting for the first time or on a new device would simply be prompted for their email, then a polling mechanism starts.

We'd generate an email with a token, and the user would click or copy/paste the link into a browser. That page would set the token state to "Validated", and the original page/device would eventually poll, see "Validated," and then setup the user's localStorage/state. Subsequent actions/calls to the backend would use that token to represent the user's access.

After the user is authenticated to our system, they will then go through the EXTERNAL auth systems they wish to use (Steam, Epic, etc.) - these won't have any idea about the passwordless flow.

# Development

For local development, it would probably make the most sense to define a Podman Compose configuration to host a PHP container, a MySQL container, and a Playwright container, all on the same network, to allow easy local development.

## Front-end

Use vanilla JS, CSS, and HTML to build the front-end. Use reusable function calls and abstractions around the auth flows and redirects, but don't worry about package.json, dependencies, build modules, webpack, etc.

## Backend

## Database Schema

```
users
- id (guid)
- email (unique)
- nick name (Hello, Flare)
- any other profile info

user-accounts
- id (guid)
- user-id (FK to users)
- ext-system (steam, epic, gog, etc.)
- extId (whatever the external system has for the user's ID that we use to look up information)
- nonce (the single-use code we generate before we hand the user off to the social login)

user-tokens
- id (guid)
- user-id (FK to users)
- state (Pending, Validated, Disabled)

```

- each user will have multiple entries in the `user-accounts` (one per external system they use)
    * Each record should, technically, only ever have EITHER a nonce, or a extId
    * We should generate the nonce before hand-off, then delete it when we get the externalId back
- each user will have multiple entries in `user-tokens` (one for each browser/device/etc.)
    * When they first visit the page, we'll generate a guid, write it to this table, then email it as a URL and copy/paste value
        + Marked as "Pending"
    * When the user clicks or copies the guid into our validation form, it changes the state to "Validated"
    * The user should have a way to "invalidate all tokens" for their account

## Explanation of "Passwordless" Vs. "External Auth"

1. Passwordless email auth establishes the user's identity in OUR system
2. Platform authentication flows are separate, isolated processes that simply add platform-specific identifiers to an already-authenticated user
3. There's no "unification" needed - the external auth just provides additional identifiers

## Game List Caching

Given IONOS constraints and Steam API characteristics, implement file-based caching with 5-minute timeouts:

### Implementation Approach

1. **Cache Structure**: Store each user's game library data in individual files
   - File naming: `cache/{user_id}_{platform}_games.json`
   - Include timestamp metadata for expiration checking

2. **Cache Logic**:
```php
function getCachedGames($userId, $platform) {
    $cacheFile = "cache/{$userId}_{$platform}_games.json";

    if (file_exists($cacheFile)) {
        $data = json_decode(file_get_contents($cacheFile), true);
        $age = time() - $data['timestamp'];

        if ($age < 300) { // 5 minutes
            return $data['games'];
        }
    }

    // Fetch fresh data from API
    $games = fetchGamesFromPlatform($userId, $platform);

    // Cache with timestamp
    $cacheData = [
        'timestamp' => time(),
        'games' => $games
    ];
    file_put_contents($cacheFile, json_encode($cacheData));

    return $games;
}
```

3. Considerations:
 • Use include_appinfo=true judiciously to reduce payload size
 • Implement compression for large libraries (1000+ games)
 • Handle cache directory permissions and cleanup
 • The Steam API has data lag, making 5-minute caching acceptable


# Questions / Answers

## Priority 2: Local Development Environment

 What specific Podman Compose configuration will provide a complete local development environment?

 • Needs PHP 8.3, MySQL, and testing containers
 • Must mimic IONOS production constraints
 • Critical for development velocity

### Answer

Brining in another agent to handle this
