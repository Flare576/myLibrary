// Centralized API client
export class ApiClient {
  // Helper function to construct API URLs relative to current path
  static getApiUrl(path) {
    const basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
    return basePath +'/api/' + path;
  }

  static async get(endpoint) {
    return fetch(this.getApiUrl(endpoint));
  }
  
  static async post(endpoint, data) {
    return fetch(this.getApiUrl(endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });
  }
}
