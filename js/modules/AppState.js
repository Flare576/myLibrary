// Centralized application state management
export class AppState {
  constructor() {
    this.state = {
      auth: {
        currentState: localStorage.getItem('mylibrary_auth_state') || 'unauthenticated',
        token: localStorage.getItem('mylibrary_token'),
        userId: localStorage.getItem('mylibrary_user_id')
      },
      platforms: {
        connected: new Set(JSON.parse(localStorage.getItem('connected_platforms') || '[]'))
      }
    };
    
    this.subscribers = new Map();
  }

  // Subscribe to state changes
  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }
    this.subscribers.get(key).push(callback);
  }

  // Notify subscribers of state changes
  notify(key, oldValue, newValue) {
    const callbacks = this.subscribers.get(key);
    if (callbacks) {
      callbacks.forEach(callback => callback(newValue, oldValue));
    }
  }

  // Get auth state
  getAuthState() {
    return { ...this.state.auth };
  }

  // Set auth state
  setAuthState(newState, data = {}) {
    const oldState = this.state.auth.currentState;
    
    this.state.auth.currentState = newState;
    localStorage.setItem('mylibrary_auth_state', newState);

    if (data.token) {
      this.state.auth.token = data.token;
      localStorage.setItem('mylibrary_token', data.token);
    }

    if (data.userId) {
      this.state.auth.userId = data.userId;
      localStorage.setItem('mylibrary_user_id', data.userId);
    }

    this.notify('auth', oldState, newState);
  }

  // Get connected platforms
  getConnectedPlatforms() {
    return new Set(this.state.platforms.connected);
  }

  // Add connected platform
  addPlatform(platform) {
    const oldConnected = new Set(this.state.platforms.connected);
    this.state.platforms.connected.add(platform);
    localStorage.setItem('connected_platforms', JSON.stringify(Array.from(this.state.platforms.connected)));
    this.notify('platformAdded', platform, platform);
  }

  // Remove connected platform
  removePlatform(platform) {
    const oldConnected = new Set(this.state.platforms.connected);
    this.state.platforms.connected.delete(platform);
    localStorage.setItem('connected_platforms', JSON.stringify(Array.from(this.state.platforms.connected)));
    this.notify('platformRemoved', platform, platform);
  }

  // Check if platform is connected
  isPlatformConnected(platform) {
    return this.state.platforms.connected.has(platform);
  }

  // Clear all state
  clear() {
    this.state.auth.currentState = 'unauthenticated';
    this.state.auth.token = null;
    this.state.auth.userId = null;
    this.state.platforms.connected.clear();
    
    localStorage.removeItem('mylibrary_auth_state');
    localStorage.removeItem('mylibrary_token');
    localStorage.removeItem('mylibrary_user_id');
    localStorage.removeItem('connected_platforms');
    
    this.notify('auth', 'validated', 'unauthenticated');
  }
}