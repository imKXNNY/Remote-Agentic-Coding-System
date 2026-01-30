export class API {
  private static credentials: string | null = localStorage.getItem('webui_auth');

  static setCredentials(user: string, pass: string) {
    const creds = btoa(`${user}:${pass}`);
    this.credentials = creds;
    localStorage.setItem('webui_auth', creds);
  }

  static isLoggedIn() {
    return !!this.credentials;
  }

  static getAuthHeader() {
    return this.credentials ? { 'Authorization': `Basic ${this.credentials}` } : {};
  }

  static async fetch(url: string, options: RequestInit = {}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers: Record<string, string> = { ...(options.headers as any), ...this.getAuthHeader() };
    const res = await fetch(url, { ...options, headers });
    
    if (res.status === 401) {
      // Logout if auth fails
      this.credentials = null;
      localStorage.removeItem('webui_auth');
      window.location.reload();
      throw new Error('Unauthorized');
    }
    
    return res;
  }

  static async getConversations() {
    const res = await this.fetch('/api/conversations');
    if (!res.ok) throw new Error('Failed to fetch conversations');
    return res.json();
  }

  static async getFiles(path: string = '') {
    const res = await this.fetch(`/api/files?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error('Failed to fetch files');
    return res.json();
  }

  static async getFileContent(path: string) {
    const res = await this.fetch(`/api/files/content?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error('Failed to fetch file content');
    return res.json();
  }
}
