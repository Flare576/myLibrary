import { ApiClient } from './ApiClient.js';

// Platform connection management - single source of truth for platform state
export class PlatformManager {
  constructor(appState) {
    this.appState = appState;
  }

  async loadConnectedPlatforms() {
    try {
      const response = await ApiClient.get('user/platforms');
      const platforms = await response.json();
      
      // Update state with loaded platforms
      platforms.forEach(platform => {
        this.appState.addPlatform(platform);
      });
      
      this.updatePlatformUI();
    } catch (error) {
      console.error('Failed to load platforms:', error);
    }
  }

  async connectPlatform(platform) {
    // Show connecting state
    this.updatePlatformStatus(platform, 'connecting');

    try {
      const response = await ApiClient.get(`connect/${platform}/init`);
      const { authUrl } = await response.json();

      // Open OAuth window
      window.open(authUrl, `${platform}_auth`, 'width=600,height=700');
    } catch (error) {
      console.error('Failed to initiate auth:', error);
      this.updatePlatformStatus(platform, 'error');
    }
  }

  // Handle successful OAuth callback
  handleConnectionSuccess(platform, extId) {
    this.appState.addPlatform(platform);
    this.updatePlatformStatus(platform, 'connected');
    
    // Trigger games refresh
    if (window.gameGrid) {
      window.gameGrid.loadGames();
    }
  }

  // Handle OAuth callback error
  handleConnectionError(platform, error) {
    console.error(`Failed to connect ${platform}:`, error);
    this.updatePlatformStatus(platform, 'error');
  }

  updatePlatformStatus(platform, status) {
    const platformEl = document.querySelector(`[data-platform="${platform}"]`);
    if (platformEl) {
      platformEl.setAttribute('data-status', status);
      
      const btn = platformEl.querySelector('.connect-btn');
      if (btn) {
        if (status === 'connected') {
          btn.textContent = 'Connected';
          btn.disabled = true;
        } else if (status === 'connecting') {
          btn.textContent = 'Connecting...';
          btn.disabled = true;
        } else if (status === 'error') {
          btn.textContent = 'Retry';
          btn.disabled = false;
        } else {
          btn.textContent = 'Connect';
          btn.disabled = false;
        }
      }
    }
  }

  updatePlatformUI() {
    const connectedPlatforms = this.appState.getConnectedPlatforms();
    
    document.querySelectorAll('[data-platform]').forEach(el => {
      const platform = el.getAttribute('data-platform');
      const status = connectedPlatforms.has(platform) ? 'connected' : 'disconnected';
      el.setAttribute('data-status', status);
      
      const btn = el.querySelector('.connect-btn');
      if (btn) {
        if (status === 'connected') {
          btn.textContent = 'Connected';
          btn.disabled = true;
        } else {
          btn.textContent = 'Connect';
          btn.disabled = false;
        }
      }
    });
  }
}

// OAuth initiation only - delegates completion to PlatformManager
export class OAuthHandler {
  constructor(platformManager) {
    this.platformManager = platformManager;
  }

  async initiateAuth(platform) {
    await this.platformManager.connectPlatform(platform);
  }
}