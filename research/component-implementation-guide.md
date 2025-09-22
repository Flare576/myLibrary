# FLARE Component Implementation Guide

## Vanilla JavaScript Component Patterns

### Authentication State Manager
```javascript
class AuthStateManager {
  constructor() {
    this.currentState = this.getStoredState() || 'unauthenticated';
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
    // Hide all auth state containers
    document.querySelectorAll('[data-auth-state]').forEach(el => {
      el.style.display = 'none';
    });
    
    // Show current state container
    const currentStateEl = document.querySelector(`[data-auth-state="${this.currentState}"]`);
    if (currentStateEl) {
      currentStateEl.style.display = 'block';
    }
  }

  async pollForValidation(token) {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/auth/status?token=${token}`);
        const data = await response.json();
        
        if (data.state === 'validated') {
          clearInterval(pollInterval);
          this.setState('validated', {
            token: data.token,
            userId: data.userId
          });
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 3000); // Poll every 3 seconds
  }
}
```

### Platform Connection Manager
```javascript
class PlatformManager {
  constructor() {
    this.connectedPlatforms = new Set();
    this.loadConnectedPlatforms();
  }

  async loadConnectedPlatforms() {
    try {
      const response = await fetch('/api/user/platforms');
      const platforms = await response.json();
      this.connectedPlatforms = new Set(platforms);
      this.updatePlatformUI();
    } catch (error) {
      console.error('Failed to load platforms:', error);
    }
  }

  async connectPlatform(platform) {
    // Show connecting state
    this.updatePlatformStatus(platform, 'connecting');
    
    try {
      const response = await fetch(`/api/connect/${platform}/init`);
      const { authUrl } = await response.json();
      
      // Open OAuth window
      const authWindow = window.open(authUrl, `${platform}_auth`, 'width=600,height=700');
      
      // Poll for completion
      this.pollForConnection(platform, authWindow);
    } catch (error) {
      this.updatePlatformStatus(platform, 'error');
    }
  }

  async pollForConnection(platform, authWindow) {
    const pollInterval = setInterval(async () => {
      if (authWindow.closed) {
        clearInterval(pollInterval);
        
        try {
          const response = await fetch(`/api/connect/${platform}/complete`);
          if (response.ok) {
            this.connectedPlatforms.add(platform);
            this.updatePlatformStatus(platform, 'connected');
            this.loadGames(platform);
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
```

### Game Grid Component
```javascript
class GameGrid {
  constructor() {
    this.games = [];
    this.filteredGames = [];
    this.currentFilter = 'all';
    this.searchQuery = '';
  }

  async loadGames() {
    try {
      const response = await fetch('/api/games');
      this.games = await response.json();
      this.filteredGames = [...this.games];
      this.render();
    } catch (error) {
      this.showError('Failed to load games');
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
      const matchesPlatform = this.currentFilter === 'all' || 
                             game.platform === this.currentFilter;
      const matchesSearch = !this.searchQuery || 
                           game.title.toLowerCase().includes(this.searchQuery);
      return matchesPlatform && matchesSearch;
    });
    
    this.render();
  }

  render() {
    const grid = document.getElementById('game-grid');
    grid.innerHTML = '';
    
    if (this.filteredGames.length === 0) {
      grid.innerHTML = this.getEmptyState();
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
    card.setAttribute('data-game-id', game.id);
    
    card.innerHTML = `
      <img src="${game.image}" alt="${game.title}" 
           class="game-cover" onerror="this.src='/placeholder.jpg'">
      <div class="game-info">
        <h4 class="game-title">${game.title}</h4>
        <span class="platform-badge ${game.platform}">${game.platform}</span>
        ${game.playtime ? `<span class="playtime">${game.playtime}h</span>` : ''}
      </div>
    `;
    
    return card;
  }

  getEmptyState() {
    return `
      <div class="empty-state">
        <h3>No games found</h3>
        <p>Try changing your filters or connect more platforms</p>
      </div>
    `;
  }
}
```

## CSS Implementation Patterns

### Responsive Grid System
```css
/* Base grid styles */
.game-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
  padding: 1rem;
  transition: grid-template-columns 0.3s ease;
}

/* Mobile optimization */
@media (max-width: 480px) {
  .game-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 0.75rem;
    padding: 0.5rem;
  }
}

/* Tablet optimization */
@media (min-width: 768px) and (max-width: 1023px) {
  .game-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 1.25rem;
  }
}

/* Desktop optimization */
@media (min-width: 1024px) {
  .game-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 1.5rem;
  }
}

/* Steam Deck specific */
@media (max-width: 800px) and (max-height: 450px) {
  .game-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
  }
}
```

### Game Card Styles
```css
.game-card {
  background: var(--bg-secondary);
  border-radius: 8px;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}

.game-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.game-cover {
  width: 100%;
  height: 200px;
  object-fit: cover;
  background: linear-gradient(45deg, #f0f0f0, #e0e0e0);
}

.game-info {
  padding: 0.75rem;
}

.game-title {
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0 0 0.5rem 0;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.platform-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
}

.platform-badge.steam { background: #1b2838; color: white; }
.platform-badge.epic { background: #2d68f8; color: white; }
.platform-badge.gog { background: #8b00ff; color: white; }
.platform-badge.itch { background: #fa5c5c; color: white; }
.platform-badge.humble { background: #f6921e; color: white; }

.playtime {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}
```

### Platform Connection Cards
```css
.platform-card {
  background: var(--bg-secondary);
  border: 2px solid transparent;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  transition: all 0.2s ease;
}

.platform-card[data-status="disconnected"] {
  border-color: #e5e7eb;
}

.platform-card[data-status="connecting"] {
  border-color: #f59e0b;
  animation: pulse 2s infinite;
}

.platform-card[data-status="connected"] {
  border-color: #10b981;
}

.platform-card[data-status="error"] {
  border-color: #ef4444;
}

.platform-icon {
  font-size: 2rem;
  margin-bottom: 1rem;
}

.connect-btn {
  background: var(--primary);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s ease;
}

.connect-btn:hover {
  background: #1d4ed8;
}

.status-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 0.5rem;
}

.status-indicator.disconnected { background: #6b7280; }
.status-indicator.connecting { 
  background: #f59e0b;
  animation: pulse 1s infinite;
}
.status-indicator.connected { background: #10b981; }
.status-indicator.error { background: #ef4444; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### Authentication State Styles
```css
[data-auth-state] {
  display: none;
}

[data-auth-state="unauthenticated"] {
  text-align: center;
  padding: 2rem;
}

[data-auth-state="pending"] {
  text-align: center;
  padding: 2rem;
}

[data-auth-state="validated"] {
  /* Main app interface */
}

.email-form {
  max-width: 400px;
  margin: 0 auto;
}

.email-input {
  width: 100%;
  padding: 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 1rem;
  margin-bottom: 1rem;
}

.submit-btn {
  width: 100%;
  padding: 1rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
}

.polling-indicator {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid #f59e0b;
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-right: 0.5rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

## Utility Functions

### Debounced Search
```javascript
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

// Usage
const searchInput = document.getElementById('search-input');
const debouncedSearch = debounce((query) => {
  gameGrid.search(query);
}, 300);

searchInput.addEventListener('input', (e) => {
  debouncedSearch(e.target.value);
});
```

### Local Storage Helpers
```javascript
const Storage = {
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Storage error:', error);
    }
  },

  get: (key) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error('Storage error:', error);
      return null;
    }
  },

  remove: (key) => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Storage error:', error);
    }
  }
};
```

### Error Handling
```javascript
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

// CSS for error toast
.error-toast {
  position: fixed;
  top: 1rem;
  right: 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
```

## Performance Optimization

### Image Loading Optimization
```javascript
function optimizeImages() {
  const images = document.querySelectorAll('img[data-src]');
  
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          observer.unobserve(img);
        }
      });
    });
    
    images.forEach(img => observer.observe(img));
  } else {
    // Fallback: load all images immediately
    images.forEach(img => {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    });
  }
}
```

### Cache Management
```javascript
class CacheManager {
  constructor() {
    this.lastUpdate = Storage.get('last_cache_update') || 0;
  }

  shouldRefresh() {
    const now = Date.now();
    return now - this.lastUpdate > 5 * 60 * 1000; // 5 minutes
  }

  async refreshIfNeeded() {
    if (this.shouldRefresh()) {
      await this.refreshData();
    }
  }

  async refreshData() {
    try {
      this.showLoading();
      
      // Clear existing data
      Storage.remove('cached_games');
      
      // Fetch fresh data
      const response = await fetch('/api/games/refresh');
      const games = await response.json();
      
      // Update cache
      Storage.set('cached_games', games);
      this.lastUpdate = Date.now();
      Storage.set('last_cache_update', this.lastUpdate);
      
      this.hideLoading();
      this.updateCacheIndicator();
    } catch (error) {
      this.showError('Failed to refresh data');
    }
  }

  updateCacheIndicator() {
    const indicator = document.getElementById('cache-indicator');
    if (indicator) {
      const age = Math.floor((Date.now() - this.lastUpdate) / 60000);
      indicator.textContent = `${age} minutes ago`;
      indicator.className = age >= 5 ? 'cache-stale' : 'cache-fresh';
    }
  }
}
```

## Initialization Pattern

```javascript
// Main application initialization
class FLAREApp {
  constructor() {
    this.auth = new AuthStateManager();
    this.platforms = new PlatformManager();
    this.games = new GameGrid();
    this.cache = new CacheManager();
  }

  async init() {
    // Initialize auth state
    this.auth.updateUI();
    
    // If authenticated, load platforms and games
    if (this.auth.currentState === 'validated') {
      await this.platforms.loadConnectedPlatforms();
      await this.games.loadGames();
      this.cache.updateCacheIndicator();
    }
    
    // Set up event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Email form submission
    const emailForm = document.getElementById('email-form');
    if (emailForm) {
      emailForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleEmailSubmit();
      });
    }
    
    // Platform connection buttons
    document.querySelectorAll('[data-platform]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const platform = e.currentTarget.getAttribute('data-platform');
        this.platforms.connectPlatform(platform);
      });
    });
    
    // Filter buttons
    document.querySelectorAll('[data-filter-platform]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const platform = e.currentTarget.getAttribute('data-filter-platform');
        this.games.filterByPlatform(platform);
      });
    });
  }

  async handleEmailSubmit() {
    const emailInput = document.getElementById('email-input');
    const email = emailInput.value.trim();
    
    if (!email) return;
    
    try {
      const response = await fetch('/api/auth/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      if (response.ok) {
        this.auth.setState('pending');
        this.auth.pollForValidation();
      } else {
        showError('Failed to send verification email');
      }
    } catch (error) {
      showError('Network error');
    }
  }
}

// Start the application
document.addEventListener('DOMContentLoaded', () => {
  const app = new FLAREApp();
  app.init();
});
```

This implementation guide provides complete vanilla JavaScript patterns for building the FLARE application within the technical constraints, focusing on performance, accessibility, and maintainability.