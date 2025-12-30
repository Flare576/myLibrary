import { ApiClient } from './ApiClient.js';

// Centralized DOM event management
export class EventManager {
  constructor(appState, platformManager, gameGrid, oauthHandler) {
    this.appState = appState;
    this.platformManager = platformManager;
    this.gameGrid = gameGrid;
    this.oauthHandler = oauthHandler;
    
    this.setupEventListeners();
    this.setupMessageListener();
  }

  setupEventListeners() {
    // Email form submission
    const emailForm = document.getElementById('email-form');
    if (emailForm) {
      emailForm.addEventListener('submit', this.handleEmailSubmit.bind(this));
    }

    // Platform connection buttons
    document.querySelectorAll('.connect-btn').forEach(btn => {
      btn.addEventListener('click', this.handlePlatformConnect.bind(this));
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', this.handleFilterClick.bind(this));
    });

    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.gameGrid.search(e.target.value);
        }, 300);
      });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', this.handleRefresh.bind(this));
    }

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', this.handleLogout.bind(this));
    }

    // Resend button
    const resendBtn = document.getElementById('resend-btn');
    if (resendBtn) {
      resendBtn.addEventListener('click', this.handleResend.bind(this));
    }
  }

  setupMessageListener() {
    // Handle OAuth callback messages from popup windows
    window.addEventListener('message', (event) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) return;
      
      const { success, platform, ext_id, error } = event.data;
      
      if (success && platform && ext_id) {
        this.platformManager.handleConnectionSuccess(platform, ext_id);
      } else if (error) {
        this.platformManager.handleConnectionError(platform, error);
      }
    });
  }

  async handleEmailSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('email-input').value.trim();
    if (!email) return;

    try {
      const response = await ApiClient.post('auth/init', { email });

      if (response.ok) {
        this.appState.setAuthState('pending');
        sessionStorage.setItem('sessionId', Date.now().toString());
        this.pollForValidation();
      } else {
        const data = await response.json();
        this.showError(data.error || 'Failed to send token');
      }
    } catch (error) {
      this.showError('Network error');
    }
  }

  handlePlatformConnect(e) {
    const platform = e.currentTarget.closest('[data-platform]').getAttribute('data-platform');
    this.platformManager.connectPlatform(platform);
  }

  handleFilterClick(e) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    const platform = e.currentTarget.getAttribute('data-platform');
    this.gameGrid.filterByPlatform(platform);
  }

  async handleRefresh() {
    try {
      const response = await ApiClient.post('games/refresh', {});
      if (response.ok) {
        await this.gameGrid.loadGames();
      }
    } catch (error) {
      this.showError('Refresh failed');
    }
  }

  handleLogout() {
    this.appState.clear();
    location.reload();
  }

  handleResend() {
    // TODO: Implement resend functionality with stored email
    this.showError('Resend functionality - implement with stored email');
  }

  async pollForValidation() {
    const pollInterval = setInterval(async () => {
      try {
        const response = await ApiClient.get(`auth/poll?sessionId=${sessionStorage.getItem('sessionId')}`);
        const data = await response.json();

        if (data.authenticated) {
          clearInterval(pollInterval);
          this.appState.setAuthState('validated', {
            token: data.user.id,
            userId: data.user.id
          });
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 3000);
  }

  showError(message, duration = 5000) {
    const errorEl = document.createElement('div');
    errorEl.className = 'error-toast';
    errorEl.innerHTML = `
      <span class="error-icon">⚠️</span>
      <span>${message}</span>
      <button onclick="this.parentElement.remove()">×</button>
    `;

    document.body.appendChild(errorEl);

    setTimeout(() => {
      if (errorEl.parentElement) {
        errorEl.remove();
      }
    }, duration);
  }
}