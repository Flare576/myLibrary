import { ApiClient } from './ApiClient.js';

// Game display and filtering logic
export class GameGrid {
  constructor() {
    this.games = [];
    this.filteredGames = [];
    this.currentFilter = 'all';
    this.searchQuery = '';
  }

  async loadGames() {
    try {
      const response = await ApiClient.get('games/all');
      const data = await response.json();
      this.games = data.games || [];
      this.filteredGames = [...this.games];
      this.render();
      this.updateCacheIndicator();
    } catch (error) {
      console.error('Failed to load games:', error);
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
      const matchesPlatform = this.currentFilter === 'all' || game.platform === this.currentFilter;
      const matchesSearch = !this.searchQuery || game.title.toLowerCase().includes(this.searchQuery);
      return matchesPlatform && matchesSearch;
    });

    this.render();
  }

  render() {
    const grid = document.getElementById('game-grid');
    if (!grid) return;
    
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
      indicator.innerHTML = '<p>Data updated <span>5 minutes ago</span></p>';
    }
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