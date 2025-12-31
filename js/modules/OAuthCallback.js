import { ApiClient } from './ApiClient.js';

// Universal callback handling for OAuth completions
export class OAuthCallback {
  constructor() {
    this.platform = this.detectPlatform();
    this.params = this.parseUrlParams();
    this.completeConnection();
  }

  detectPlatform() {
    // Check URL path for platform-specific callbacks first
    const path = window.location.pathname;
    if (path.includes('steam-callback')) return 'steam';
    if (path.includes('epic-callback')) return 'epic';
    if (path.includes('itch-callback')) return 'itch';
    
    // For unified callback.html, try to decode state parameter first (most reliable)
    const params = new URLSearchParams(window.location.search);
    const stateParam = params.get('state');
    
    if (stateParam) {
      try {
        const stateData = JSON.parse(atob(stateParam));
        if (stateData.platform) return stateData.platform;
      } catch (e) {
        // Fall through to other detection methods
        console.warn('Failed to parse state parameter:', e);
      }
    }
    
    // Fallback: explicit platform parameter
    const platform = params.get('platform');
    if (platform) return platform;
    
    // Fallback: detect from OpenID parameters (Steam)
    if (params.has('openid.claimed_id') || params.has('openid_claimed_id')) {
      return 'steam';
    }
    
    // Fallback: detect from OAuth code parameter
    if (params.has('code')) {
      // Check referrer or make assumption based on context
      const referrer = document.referrer;
      if (referrer.includes('epicgames.com')) return 'epic';
      if (referrer.includes('itch.io')) return 'itch';
    }
    
    return 'unknown';
  }

  parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const result = {};

    switch (this.platform) {
      case 'steam':
        // Support both standard and underscore parameter naming
        result.claimedId = params.get('openid.claimed_id') || params.get('openid_claimed_id');
        result.nonce = params.get('nonce');
        result.mode = params.get('openid.mode') || params.get('openid_mode');
        break;
      case 'epic':
      case 'itch':
        result.code = params.get('code');
        result.state = params.get('state');
        // For itch.io, also handle access_token in response
        if (this.platform === 'itch') {
          result.access_token = params.get('access_token');
        }
        break;
    }

    return result;
  }

  async completeConnection() {
    try {
      const response = await ApiClient.post(`connect/${this.platform}/complete`, this.params);
      const data = await response.json();

      if (data.success) {
        this.showSuccess(data.platform, data.ext_id);
        this.postMessage({ 
          success: true, 
          platform: data.platform, 
          ext_id: data.ext_id 
        });
      } else {
        this.showError(data.error || 'Connection failed');
        this.postMessage({ 
          success: false, 
          platform: this.platform,
          error: data.error || 'Connection failed' 
        });
      }
    } catch (error) {
      console.error('Callback error:', error);
      this.showError('Network error');
      this.postMessage({ 
        success: false, 
        platform: this.platform,
        error: 'Network error' 
      });
    }
  }

  showSuccess(platform, extId) {
    const statusEl = document.getElementById('status');
    statusEl.className = 'success';
    statusEl.innerHTML = `
      <div class="success">✓ Successfully connected ${platform}!</div>
      <div style="font-size: 0.9rem; color: #ccc; margin-top: 0.5rem;">Account ID: ${extId}</div>
      <div style="font-size: 0.8rem; color: #999; margin-top: 1rem;">This window will close automatically...</div>
    `;
  }

  showError(message) {
    const statusEl = document.getElementById('status');
    statusEl.className = 'error';
    statusEl.innerHTML = `
      <div class="error">✗ Connection failed</div>
      <div style="font-size: 0.9rem; margin-top: 0.5rem;">${message}</div>
      <div style="font-size: 0.8rem; color: #999; margin-top: 1rem;">You can close this window and try again.</div>
    `;
  }

  postMessage(data) {
    if (window.opener) {
      window.opener.postMessage(data, window.location.origin);
    }
    
    // Auto-close after showing success/error
    setTimeout(() => {
      window.close();
    }, 2000);
  }
}
