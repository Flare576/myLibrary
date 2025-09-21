```yaml
library: Steam Web API
version: N/A (OpenID 2.0, OAuth 2.0)
documentation:
  quickstart: https://partner.steamgames.com/doc/webapi_overview
  api_reference: https://partner.steamgames.com/doc/webapi
  examples:
    - https://partner.steamgames.com/doc/webapi_overview/oauth#GettingStarted

key_patterns:
  developer_setup_user_web_api_key: |
    As the application developer, you must obtain a free "User Web API Key" from Steam.
    1. Go to `https://steamcommunity.com/dev/apikey`.
    2. Log in with your Steam account.
    3. Register your application's domain (e.g., `myLibrary.flare576.com`) with this key. This domain is used by Steam to validate `return_to` URLs for OpenID 2.0 authentication.
    4. Store this User Web API Key securely on your backend server. This key is for your application to make API calls to Steam, not for end-users.

  authentication_openid_flow: |
    Steam uses OpenID 2.0 for user authentication, providing a secure way to obtain a user's unique SteamID64.
    1. **User Initiates Login (Frontend to Backend):**
       - User clicks "Login with Steam" on your frontend.
       - Frontend requests your backend's Steam login endpoint (e.g., `/auth/steam/login`).
    2. **Backend Initiates OpenID (Backend to Steam Redirect):**
       - Your backend generates a unique `nonce` and constructs a `return_to` URL (e.g., `https://myLibrary.flare576.com/auth/steam/verify`). This URL must be under the domain registered with your application's User Web API Key.
       - Backend redirects the user's browser to Steam's OpenID Provider URL (`https://steamcommunity.com/openid`).
    3. **User Authenticates with Steam (Steam's Website):**
       - User logs into their Steam account on `steamcommunity.com`.
       - Steam authenticates the user and redirects their browser back to your backend's `return_to` URL with an OpenID assertion.
    4. **Backend Verifies Assertion & Gets SteamID64 (Backend - CRITICAL):**
       - Your backend endpoint (`/auth/steam/verify`) receives the redirect.
       - **Crucially, your backend securely verifies the OpenID assertion:**
         - Checks the `nonce` to prevent replay attacks.
         - Verifies the signature to confirm authenticity from Steam.
         - Confirms the `return_to` URL matches the registered domain.
       - If valid, your backend extracts the user's **SteamID64** from the assertion.
       - Your backend associates this `SteamID64` with your internal user account (or creates a new one).
       - Your backend logs the user into your application (e.g., sets a session, issues a JWT).
       - Your backend redirects the user's browser back to your frontend (e.g., dashboard).

  retrieve_owned_games_flow: |
    Once a user is authenticated and their SteamID64 is known, your backend can retrieve their owned games.
    1. **Frontend Requests Games (Frontend to Backend):**
       - Frontend makes a request to your backend (e.g., `/api/get-owned-games`). The frontend does NOT send any Steam API Key.
    2. **Backend Calls Steam API (Backend to Valve API):**
       - Your backend identifies the authenticated user and retrieves their `SteamID64`.
       - Your backend retrieves **your application's securely stored User Web API Key** (obtained during developer setup).
       - Your backend makes a server-to-server `GET` request to `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` including:
         - `key`: Your application's User Web API Key.
         - `steamid`: The authenticated user's SteamID64.
         - Optional parameters like `include_appinfo=true` and `include_played_free_games=true`.
    3. **Backend Processes & Responds (Backend to Frontend):**
       - Your backend processes the response from Valve.
       - Your backend sends the relevant game data back to your frontend.

  authentication_oauth: |
    Steam's OAuth implementation is based on OAuth 2.0, primarily for granting your application permissions to access specific user data (e.g., Steam Cloud, Workshop) on their behalf.
    1. Obtain a Client ID from Valve by contacting them with required permissions, token lifetime, and redirect URI.
    2. Redirect the user to `https://steamcommunity.com/oauth/login?response_type=token&client_id=YOUR_CLIENT_ID&state=YOUR_STATE`
    3. User grants or denies access on Steam.
    4. User is redirected back to your `redirect_uri`.
       - If successful: `http://redirect/uri/here#access_token=token_here&token_type=steam&state=whatever_you_want`
       - If denied: `http://redirect/uri/here#error=access_denied&state=whatever_you_want`
    5. The `access_token` is in the URI fragment, accessible client-side.
    6. To securely retrieve the user's SteamID, a **server-to-server** call is required:
       `https://api.steampowered.com/ISteamUserOAuth/GetTokenDetails/v1/?access_token=token`

  api_keys_types: |
    - **User Web API Key (Free):** Obtained by the application developer. Used by your backend to make API calls to Steam for publicly accessible data (like owned games) or data accessible via OpenID-authenticated users. The domain for your `return_to` URL must be registered with this key.
    - **Publisher Web API Key ($100 fee):** Required for sensitive data or protected actions, typically for game developers/publishers accessing data related to their own games. Must be used from secure publisher servers and NOT distributed with clients.

gotchas:
  - issue: Secure user authentication and identification requires a backend server.
    solution:
      - For OpenID 2.0, the critical assertion verification (checking nonce, signature, etc.) MUST be handled server-side to prevent tampering and ensure security.
      - For OAuth 2.0, securely retrieving the user's SteamID explicitly requires a server-to-server API call.
      - Therefore, a backend server is indispensable for secure user authentication and identification with Steam.

  - issue: User Web API Key confusion.
    solution: The "User Web API Key" is for the *application developer* to use on their backend, not for the end-user to obtain or provide.

  - issue: Obtaining OAuth Client ID and permissions.
    solution: If using OAuth 2.0 for specific permissions (e.g., Steam Cloud, Workshop), you must contact Valve directly with details about required permissions, token lifetime, and redirect URIs to obtain a Client ID.

best_practices:
  - **Server-Side Security:** Always perform OpenID assertion verification and all Steam Web API calls (especially those using API keys) from your secure backend server. Never expose API keys or perform sensitive operations directly from the client-side.
  - **HTTPS Everywhere:** Use HTTPS for all communication involving Steam, including redirects and API calls, to protect data in transit.
  - **Secure Key Storage:** Store your application's User Web API Key (and any Publisher Keys) securely on your server, ideally in environment variables or a secrets management system, not directly in code.
  - **Error Handling:** Implement robust error handling for all API calls and authentication steps, providing clear feedback to users and logging details for debugging.
  - **Privacy:** Be mindful of Steam user privacy settings. The `GetOwnedGames` API will only return data if the user's profile and game details are visible.

save_to_ai_docs: yes
