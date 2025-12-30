// MyLibrary App - Streamlined Modular Implementation
// Main orchestrator that coordinates all modules

import { AppState } from './modules/AppState.js';
import { PlatformManager, OAuthHandler } from './modules/PlatformManager.js';
import { GameGrid } from './modules/GameGrid.js';
import { EventManager } from './modules/EventManager.js';
import { ApiClient } from './modules/ApiClient.js';

// Main App - Orchestrator
class MyLibraryApp {
  constructor() {
    // Initialize state and modules
    this.appState = new AppState();
    this.platformManager = new PlatformManager(this.appState);
    this.gameGrid = new GameGrid();
    this.oauthHandler = new OAuthHandler(this.platformManager);
    this.eventManager = new EventManager(this.appState, this.platformManager, this.gameGrid, this.oauthHandler);
    
    // Setup state subscribers
    this.setupStateSubscribers();
  }

  setupStateSubscribers() {
    // Subscribe to auth state changes
    this.appState.subscribe('auth', (newState, oldState) => {
      this.updateAuthUI(newState);
    });

    // Subscribe to platform changes
    this.appState.subscribe('platformAdded', (platform) => {
      console.log(`Platform connected: ${platform}`);
      this.gameGrid.loadGames(); // Refresh games when new platform connects
    });

    this.appState.subscribe('platformRemoved', (platform) => {
      console.log(`Platform disconnected: ${platform}`);
      this.gameGrid.loadGames(); // Refresh games when platform disconnects
    });
  }

  updateAuthUI(authState) {
    // Hide all auth states
    document.querySelectorAll('[data-auth-state]').forEach(el => {
      el.style.display = 'none';
    });

    // Show current auth state
    const currentStateEl = document.querySelector(`[data-auth-state="${authState}"]`);
    if (currentStateEl) {
      currentStateEl.style.display = 'block';
    }

    // Show authenticated UI elements
    if (authState === 'validated') {
      const authData = this.appState.getAuthState();
      document.getElementById('user-info').textContent = `Hello, ${authData.userId}`;
      document.getElementById('games-section').style.display = 'block';
      document.getElementById('platforms-section').style.display = 'block';
    }
  }

  async init() {
    // Check for token in URL first
    await this.handleUrlToken();

    // Update UI based on current auth state
    this.updateAuthUI(this.appState.state.auth.currentState);

    // Load data if authenticated
    if (this.appState.state.auth.currentState === 'validated') {
      await this.platformManager.loadConnectedPlatforms();
      await this.gameGrid.loadGames();
    }

    // Make gameGrid available globally for OAuth callbacks
    window.gameGrid = this.gameGrid;
  }

  async handleUrlToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
      try {
        const response = await ApiClient.post('auth/validate', { token });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            this.appState.setAuthState('validated', {
              token: data.user.id,
              userId: data.user.id
            });
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          }
        }
        this.eventManager.showError('Invalid or expired token');
      } catch (error) {
        this.eventManager.showError('Token validation failed');
        console.error('Validation error:', error);
      }
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new MyLibraryApp();
  window.myLibraryApp = app; // Store globally for debugging
  app.init();
});