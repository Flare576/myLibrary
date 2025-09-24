// FLARE App - Vanilla JS Implementation
// No external libs; uses native fetch, localStorage, DOM

class AuthStateManager {
  constructor() {
    this.currentState = localStorage.getItem('flare_auth_state') || 'unauthenticated';
    this.token = localStorage.getItem('flare_token');
    this.userId = localStorage.getItem('flare_user_id');
  }

  getStoredState() {
    return localStorage.getItem('flare_auth_state');
  }

  setState(newState, data = {}) {
    this.currentState = newState;
    localStorage.setItem('flare_auth_state', newState);
    
    if (data.token) {
      this.token = data.token;
      localStorage.setItem('flare_token', data.token);
    }
    
    if (data.userId) {
      this.userId = data.userId;
      localStorage.setItem('flare_user_id', data.userId);
    }
    
    this.updateUI();
  }

  updateUI() {
    document.querySelectorAll('[data-auth-state]').forEach(el => {
      el.style.display = 'none';
    });
    
    const currentStateEl = document.querySelector(`[data-auth-state="${this.currentState}"]`);
    if (currentStateEl) {
      currentStateEl.style.display = 'block';
    }

    if (this.currentState === 'validated') {
      document.getElementById('user-info').textContent = `Hello, ${this.userId}`;
      document.getElementById('games-section').style.display = 'block';
      document.getElementById('platforms-section').style.display = 'block';
    }
  }

  async pollForValidation() {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/auth/poll?sessionId=' + sessionStorage.getItem('sessionId'));
        const data = await response.json();
        
        if (data.authenticated) {
          clearInterval(pollInterval);
          this.setState('validated', {
            token: data.user.id,  // Use user id as token placeholder
            userId: data.user.id
          });
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 3000);
  }
}

class PlatformManager {
  constructor() {
    this.connectedPlatforms = new Set(JSON.parse(localStorage.getItem('connected_platforms') || '[]'));
  }

  async loadConnectedPlatforms() {
    try {
      const response = await fetch('/api/user/platforms');  // Assume endpoint; implement if needed
      const platforms = await response.json();
      this.connectedPlatforms = new Set(platforms);
      localStorage.setItem('connected_platforms', JSON.stringify(Array.from(this.connectedPlatforms)));
      this.updatePlatformUI();
    } catch (error) {
      console.error('Failed to load platforms:', error);
    }
  }

  async connectPlatform(platform) {
    this.updatePlatformStatus(platform, 'connecting');
    
    try {
      const response = await fetch(`/api/connect/${platform}/init`);
      const { authUrl } = await response.json();
      
      const authWindow = window.open(authUrl, `${platform}_auth`, 'width=600,height=700');
      
      this.pollForConnection(platform, authWindow);
    } catch (error) {
      this.updatePlatformStatus(platform, 'error');
      showError('Connection failed');
    }
  }

  async pollForConnection(platform, authWindow) {
    const pollInterval = setInterval(async () => {
      if (authWindow.closed) {
        clearInterval(pollInterval);
        
        try {
          const response = await fetch(`/api/connect/${platform}/complete`);
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              this.connectedPlatforms.add(platform);
              localStorage.setItem('connected_platforms', JSON.stringify(Array.from(this.connectedPlatforms)));
              this.updatePlatformStatus(platform, 'connected');
              // Trigger games load
              gameGrid.loadGames();
            } else {
              this.updatePlatformStatus(platform, 'error');
            }
          } else {
            this.updatePlatformStatus(platform, 'error');
          }
        } catch (error) {
          this.updatePlatformStatus(platform, 'error');
        }
      }
    }, 1000);
  }

  updatePlatformStatus(platform, status) {
    const platformEl = document.querySelector(`[data-platform="${platform}"]`);
    if (platformEl) {
      platformEl.setAttribute('data-status', status);
      const btn = platformEl.querySelector('.connect-btn');
      if (status === 'connected') {
        btn.textContent = 'Connected';
        btn.disabled = true;
      } else if (status === 'error') {
        btn.textContent = 'Retry';
      }
    }
  }

  updatePlatformUI() {
    document.querySelectorAll('[data-platform]').forEach(el => {
      const platform = el.getAttribute('data-platform');
      const status = this.connectedPlatforms.has(platform) ? 'connected' : 'disconnected';
      el.setAttribute('data-status', status);
    });
  }
}

class GameGrid {
  constructor() {
    this.games = [];
    this.filteredGames = [];
    this.currentFilter = 'all';
    this.searchQuery = '';
  }

  async loadGames() {
    try {
      const response = await fetch('/api/games/all');  // Aggregate endpoint; implement in backend if needed
      const data = await response.json();
      this.games = data.games || [];
      this.filteredGames = [...this.games];
      this.render();
      this.updateCacheIndicator();
    } catch (error) {
      showError('Failed to load games');
      console.error(error);
    }
  }

  filterByPlatform(platform) {
    this.currentFilter = platform;
    this.applyFilters();
  }

  search(query) {
    this.searchQuery = query.toLowerCase();
    this.applyFilters();
  }

  applyFilters() {
    this.filteredGames = this.games.filter(game => {
      const matchesPlatform = this.currentFilter === 'all' || game.platform === this.currentFilter;
      const matchesSearch = !this.searchQuery || game.title.toLowerCase().includes(this.searchQuery);
      return matchesPlatform && matchesSearch;
    });
    
    this.render();
  }

  render() {
    const grid = document.getElementById('game-grid');
    grid.innerHTML = '';
    
    if (this.filteredGames.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <h3>No games found</h3>
          <p>Try changing your filters or connect more platforms</p>
        </div>
      `;
      return;
    }
    
    this.filteredGames.forEach(game => {
      grid.appendChild(this.createGameCard(game));
    });
  }

  createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.setAttribute('data-platform', game.platform);
    card.setAttribute('data-game-id', game.id || game.appid);
    
    card.innerHTML = `
      <img src="${game.image || '/placeholder.jpg'}" alt="${game.title}" class="game-cover" loading="lazy">
      <div class="game-info">
        <h4 class="game-title">${game.title || game.name}</h4>
        <span class="platform-badge ${game.platform}">${game.platform.toUpperCase()}</span>
        ${game.playtime ? `<span class="playtime">${game.playtime}h</span>` : ''}
      </div>
    `;
    
    return card;
  }

  updateCacheIndicator() {
    // Placeholder - fetch from backend or local
    const indicator = document.getElementById('cache-indicator');
    if (indicator) {
      indicator.innerHTML = '<p>Data updated <span>5 minutes ago</span></p>';  // Mock
    }
  }
}

function showError(message, duration = 5000) {
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

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Main App
class FLAREApp {
  constructor() {
    this.auth = new AuthStateManager();
    this.platforms = new PlatformManager();
    this.games = new GameGrid();
  }

  async init() {
    this.auth.updateUI();
    
    if (this.auth.currentState === 'validated') {
      await this.platforms.loadConnectedPlatforms();
      await this.games.loadGames();
    }
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Email form
    const emailForm = document.getElementById('email-form');
    if (emailForm) {
      emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email-input').value.trim();
        if (!email) return;
        
        try {
          const response = await fetch('/api/auth/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
          });
          
          if (response.ok) {
            this.auth.setState('pending');
            sessionStorage.setItem('sessionId', Date.now().toString());  // Simple session
            this.auth.pollForValidation();
          } else {
            const data = await response.json();
            showError(data.error || 'Failed to send token');
          }
        } catch (error) {
          showError('Network error');
        }
      });
    }

    // Platform connects
    document.querySelectorAll('.connect-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const platform = e.currentTarget.closest('[data-platform]').getAttribute('data-platform');
        this.platforms.connectPlatform(platform);
      });
    });

    // Filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const platform = e.currentTarget.getAttribute('data-platform');
        this.games.filterByPlatform(platform);
      });
    });

    // Search
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      const debouncedSearch = debounce((query) => {
        this.games.search(query);
      }, 300);
      searchInput.addEventListener('input', (e) => {
        debouncedSearch(e.target.value);
      });
    }

    // Refresh
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        try {
          const response = await fetch('/api/games/refresh', { method: 'POST' });
          if (response.ok) {
            await this.games.loadGames();
          }
        } catch (error) {
          showError('Refresh failed');
        }
      });
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.clear();
        sessionStorage.clear();
        location.reload();
      });
    }

    // Resend
    const resendBtn = document.getElementById('resend-btn');
    if (resendBtn) {
      resendBtn.addEventListener('click', () => {
        // Re-trigger init with stored email or prompt
        showError('Resend functionality - implement with stored email');
      });
    }
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const app = new FLAREApp();
  app.init();
});
