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
