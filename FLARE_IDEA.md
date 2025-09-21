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

This means, however, that any front-end system we build needs to be built on my machine, then uploaded to the host - the server doesn't support `npm`, `node`, or other non-PHP languages or processes.

# Development

For local development, it would probably make the most sense to define a Podman Compose configuration to host a PHP container, a MySQL container, and a Playwright container, all on the same network, to allow easy local development.

# User Identity

I'd like to create a passwordless login system, where a user visiting for the first time or on a new device would simply be prompted for their email, then a polling mechanism starts.

We'd generate an email with a token, and the user would click or copy/paste the link into a browser. That page would set the token state to "Validated", and the original page/device would eventually poll, see "Validated," and then setup the user's localStorage/state. Subsequent actions/calls to the backend would use that token to represent the user's access.

# Questions / Answers

## Priority 1: Database Schema Design

 What database schema will support both passwordless authentication tokens and multiple platform game library integrations?

 • Needs to store email tokens, SteamID64s, Epic accounts, GOG accounts
 • Must maintain relationships between users and their linked platforms
 • Critical for core functionality

### ANSWER:

Use this as a pseudo-design - field and table names should follow syntax best practices of MySQL (dashes, underscores, plural, etc.)

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

config
- id (guid)
- ext-system (steam, epic, gog, etc.)
- clientId (whatever token/key/etc. we use to identify our app on the API)
```

## Priority 1: Authentication System Integration

 How will the passwordless email login system integrate with Steam's OpenID 2.0 authentication and other platform authentication methods?

 • Must handle secure server-side OpenID assertion verification
 • Needs to unify email-based identity with platform-specific IDs
 • Critical for user identity management and security

### Answer:

See the DB table above 

- each "External System" will have its "ClientId" in the `config` table
- each user will have multiple entries in the `user-accounts` (one per external system they use)
    * Each record should, technically, only ever have EITHER a nonce, or a extId
    * We should generate the nonce before hand-off, then delete it when we get the externalId back
- each user will have multiple entries in `user-tokens` (one for each browser/device/etc.)
    * When they first visit the page, we'll generate a guid, write it to this table, then email it as a URL and copy/paste value
        + Marked as "Pending"
    * When the user clicks or copies the guid into our validation form, it changes the state to "Validated"
    * The user should have a way to "invalidate all tokens" for their account

## Priority 1: API Key Management & Security

 What is the strategy for securely storing and managing Steam API keys and other platform credentials in the PHP/MySQL environment?

 • Requires secure storage (environment variables, encrypted database)
 • Must prevent tampering and ensure server-side verification
 • Essential for platform integration security

### Answer

DB credentials will follow the normal PHP process of a config file
API keys will be in a config table in the DB.

## Priority 2: Frontend Build & Deployment Pipeline

 How will the frontend build process work given IONOS PHP-only hosting constraints?

 • Requires local build process for static assets
 • Affects development workflow and deployment strategy
 • Important for maintainability

### Answer

I think the easiest solution is to plan to do some sort of `npm build` command on my local machine, then upload the resulting assets to the host, along with any server-side PHP pages.

## Priority 2: Local Development Environment

 What specific Podman Compose configuration will provide a complete local development environment?

 • Needs PHP 8.3, MySQL, and testing containers
 • Must mimic IONOS production constraints
 • Critical for development velocity

### Answer

Brining in another agent to handle this
