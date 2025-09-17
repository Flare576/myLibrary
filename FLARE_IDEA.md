When I used a Windows PC, I relied heavily on an application called Playnite. The key value for me was that this application acted as a universal hub for all of my game launchers and libraries, allowing me to quickly search across all of them to determine if I owned a game and on what platform.

When I switched to a Steam Deck, I lost the ability to quickly search in this way, instead needing to launch each app to search.

I'd like to build a website that a user can come to, link their Libraries to, and then search across all of them at once. I want to support, at a minimum:

- Steam
- Epic
- GoG
- itch.io
- Humble Games

I'd love to create a client-side only web app that can be hosted on Github Pages, but I believe several of these systems, including Steam, require a server-side redirect for its auth flow. If this is the case, we need to build the server-side component on PHP 8.3.
