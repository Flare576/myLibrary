import { ApiClient } from './ApiClient.js';

// Platform connection management - single source of truth for platform state
export class PlatformManager {
  constructor(appState) {
    this.appState = appState;
    this.platformStatuses = new Map();
    this.refreshIntervals = new Map();
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

  async refreshPlatform(platform) {
    if (this.isRefreshing(platform)) {
      return; // Already refreshing
    }

    this.setRefreshing(platform, true);
    
    try {
      const response = await ApiClient.post(`games/refresh/${platform}`);
      const result = await response.json();
      
      if (result.status === 200) {
        // Success - update the platform status
        this.platformStatuses.set(platform, {
          status: 200,
          games: result.games,
          lastRefresh: new Date().toISOString(),
          refreshed: true
        });
        
        // Update UI to show success
        this.updatePlatformCard(platform, {
          status: 'success',
          message: 'Games refreshed successfully'
        });
        
        // Trigger games grid refresh
        if (window.gameGrid) {
          window.gameGrid.loadGames();
        }
      } else if (result.status === 429) {
        // Rate limited
        this.updatePlatformCard(platform, {
          status: 'rate_limited',
          message: result.errorMessage,
          retryAfter: result.retryAfter
        });
        
        // Start countdown timer
        this.startRateLimitCountdown(platform, result.retryAfter);
      } else {
        // Error
        this.updatePlatformCard(platform, {
          status: 'error',
          message: result.errorMessage || 'Failed to refresh games'
        });
      }
    } catch (error) {
      console.error(`Failed to refresh ${platform}:`, error);
      this.updatePlatformCard(platform, {
        status: 'error',
        message: 'Network error while refreshing'
      });
    } finally {
      this.setRefreshing(platform, false);
    }
  }

  isRefreshing(platform) {
    return this.refreshIntervals.has(platform);
  }

  setRefreshing(platform, isRefreshing) {
    if (isRefreshing) {
      this.refreshIntervals.set(platform, true);
    } else {
      this.refreshIntervals.delete(platform);
    }
    
    // Update UI loading state
    this.updatePlatformCard(platform, { loading: isRefreshing });
  }

  startRateLimitCountdown(platform, seconds) {
    let remaining = seconds;
    const interval = setInterval(() => {
      remaining--;
      
      if (remaining <= 0) {
        clearInterval(interval);
        this.updatePlatformCard(platform, {
          status: 'connected',
          message: null,
          retryAfter: null
        });
      } else {
        this.updatePlatformCard(platform, {
          status: 'rate_limited',
          message: `Please wait ${remaining} seconds`,
          retryAfter: remaining
        });
      }
    }, 1000);
  }

  updatePlatformCard(platform, updates) {
    const card = document.querySelector(`[data-platform="${platform}"]`);
    if (!card) return;

    // Get platform status data
    const platformData = this.platformStatuses.get(platform);

    // Update status badge
    const statusBadge = card.querySelector('.platform-status');
    if (statusBadge) {
      if (updates.status === 'success') {
        statusBadge.className = 'platform-status success';
        statusBadge.textContent = '✓';
        statusBadge.title = platformData?.lastRefresh ? 
          `Last Refresh: ${new Date(platformData.lastRefresh).toLocaleString()}` : 
          'Status: Successfully refreshed';
      } else if (updates.status === 'error') {
        statusBadge.className = 'platform-status error';
        statusBadge.textContent = '✗';
        statusBadge.title = updates.message || 'Error occurred';
      } else if (updates.status === 'rate_limited') {
        statusBadge.className = 'platform-status rate-limited';
        statusBadge.textContent = '⏱';
        statusBadge.title = updates.message || 'Rate limited';
      } else if (updates.status === 'connected') {
        statusBadge.className = 'platform-status connected';
        statusBadge.textContent = '✓';
        statusBadge.title = platformData?.lastRefresh ? 
          `Last Refresh: ${new Date(platformData.lastRefresh).toLocaleString()}` : 
          'Status: Connected';
      }
    }

    // Update refresh button
    const refreshBtn = card.querySelector('.refresh-btn');
    if (refreshBtn) {
      if (updates.loading) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '...';
        refreshBtn.className = 'refresh-btn loading';
      } else if (updates.status === 'rate_limited') {
        refreshBtn.disabled = true;
        refreshBtn.textContent = `${updates.retryAfter}s`;
        refreshBtn.className = 'refresh-btn disabled';
      } else if (updates.status === 'connected') {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Refresh';
        refreshBtn.className = 'refresh-btn';
      } else {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Refresh';
        refreshBtn.className = 'refresh-btn';
      }
    }

    // Update error message
    const errorMsg = card.querySelector('.error-message');
    if (errorMsg) {
      if (updates.message) {
        errorMsg.textContent = updates.message;
        errorMsg.style.display = 'block';
      } else {
        errorMsg.style.display = 'none';
      }
    }
  }

  // Update platform status based on games API response
  updatePlatformStatusesFromGames(platformData) {
    Object.entries(platformData).forEach(([platform, data]) => {
      this.platformStatuses.set(platform, {
        status: data.status,
        games: data.games,
        lastRefresh: data.lastRefresh,
        cached: data.cached,
        refreshed: data.refreshed,
        errorMessage: data.errorMessage,
        retryAfter: data.retryAfter
      });

      // Update the platform card UI
      this.updatePlatformCard(platform, {
        status: data.status === 200 ? 'connected' : 
                data.status === 429 ? 'rate_limited' : 'error',
        message: data.errorMessage,
        retryAfter: data.retryAfter
      });
    });
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
          // Show refresh button for connected platforms
          this.showRefreshButton(platformEl, platform);
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
          this.showRefreshButton(el, platform);
        } else {
          btn.textContent = 'Connect';
          btn.disabled = false;
          this.hideRefreshButton(el);
        }
      }
    });
  }

  showRefreshButton(platformEl, platform) {
    // Check if refresh button already exists
    if (platformEl.querySelector('.refresh-btn')) return;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'platform-actions';

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'refresh-btn';
    refreshBtn.textContent = 'Refresh';
    refreshBtn.onclick = () => this.refreshPlatform(platform);

    const statusBadge = document.createElement('span');
    statusBadge.className = 'platform-status connected';
    statusBadge.textContent = '✓';
    statusBadge.title = 'Status: Connected';

    const errorMsg = document.createElement('div');
    errorMsg.className = 'error-message';
    errorMsg.style.display = 'none';

    actionsDiv.appendChild(statusBadge);
    actionsDiv.appendChild(refreshBtn);

    // Insert after the existing connect button
    const connectBtn = platformEl.querySelector('.connect-btn');
    connectBtn.parentNode.insertBefore(actionsDiv, connectBtn.nextSibling);
    connectBtn.parentNode.appendChild(errorMsg);
  }

  hideRefreshButton(platformEl) {
    const refreshBtn = platformEl.querySelector('.refresh-btn');
    const statusBadge = platformEl.querySelector('.platform-status');
    const errorMsg = platformEl.querySelector('.error-message');
    
    if (refreshBtn) refreshBtn.remove();
    if (statusBadge) statusBadge.remove();
    if (errorMsg) errorMsg.remove();
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