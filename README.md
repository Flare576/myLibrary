# MyLibrary

A web-based game library aggregator for people who got tired of loading every launcher individually.

## The Problem

I switched from Windows to Linux and lost Playnite — the app I used to keep track of all my game libraries in one place. Asked Reddit what people used on Linux/Steam Deck. The answer: "I load every launcher individually to check." Which sucks, because the main reason I used Playnite was to find out what games on Humble Bundles I already owned.

So I built this.

## What It Does

**Library View** — See your full cross-platform game library (Steam, Epic, itch.io) in one searchable, filterable place. No more alt-tabbing between launchers.

**Bundle Browser** — Visit the page, see current Humble Bundle contents, immediately know which games you don't own and what the bundle is actually worth to you.

Optimized for Steam Deck (1280×800, landscape, controller-friendly). Works on desktop too, but that's not the point.

## Try It

https://flare576.com/myLibrary/

(Trailing slash required — Apache quirk.)

## How It Works

### The Auth Model

You log in with a username and passphrase. Your browser derives an AES-GCM-256 encryption key via PBKDF2 (310k iterations). That key never leaves your browser.

Your game library data gets encrypted with that key and stored on the server as an opaque blob. The server has no idea what's in it. Can't decrypt it. Doesn't try.

When you connect a platform (Steam, Epic, itch), those credentials get encrypted and stored in the same blob. Same deal — server can't see them.

This is a deliberate tradeoff. You get privacy. The server gets simplicity. Win-win.

### Platform Integrations

**Steam** — OpenID 2.0. You click "Connect Steam," get redirected to Steam's login, come back with your SteamID. Clean. Boring. Good.

**Epic** — Oof. Epic has no public API and doesn't support OAuth redirects to third-party apps. So here's what happens: you visit `https://www.epicgames.com/id/api/redirect?clientId=34a02cf8f4414e29b15921876da36f9a&responseType=code`, copy the `authorizationCode` from the JSON response, paste it into MyLibrary. The server exchanges that code for tokens and fetches your library in one round-trip. Your Epic token transits the server during that fetch — it's not logged, not stored, but it does pass through. The UI has an honest explainer about this. Epic's fault, not ours.

**itch.io** — OAuth implicit flow. Token ends up in the URL hash. itch.io doesn't support CORS well, so library fetches go through the server proxy (same privacy model as Epic — token transits, doesn't persist).

## Security

**What the server sees:**
- Your username (hashed)
- Your encrypted blob (opaque ciphertext)
- Your IP address (rate limiting)
- During Epic/itch library fetches: your tokens (not logged, not stored, just in transit)

**What the server doesn't see:**
- Your passphrase
- Your encryption key
- Your game library
- Your Steam ID (stored encrypted in the blob)
- Your Epic/itch tokens (after the library fetch completes)

**The honest part:** This is a personal project running on shared hosting. There's no third-party JavaScript, no CDN, no analytics. But if you're paranoid about your Epic token transiting a server you don't control, you should be. That's a real risk. The UI tells you this upfront.

## Built With

- **Backend:** PHP 8.5 + MariaDB (IONOS shared hosting)
- **Frontend:** Vanilla JavaScript ES modules, no frameworks, no build step
- **Crypto:** WebCrypto API (AES-GCM, PBKDF2)
- **Testing:** Bun (unit tests), Playwright (integration tests)
- **Deployment:** SFTP to IONOS

## Learn More

I built this as a teaching project. The full tutorial series is here:

**[How To Code: MyLibrary](https://flare576.com/meta/programming/ai/project-introduction.html)**

It covers the architecture, the auth model, the platform integrations, and how I used AI to help build it. If you're curious how this works under the hood, start there.

## License

Personal project. Do what you want with it.

---

**Author:** [Flare576](https://flare576.com) (Jeremy Scherer)  
**GitHub:** https://github.com/Flare576/myLibrary/
