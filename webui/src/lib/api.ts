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

  static getAuthHeader(): Record<string, string> {
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

  static async getCodebases() {
    const res = await this.fetch('/api/codebases');
    if (!res.ok) throw new Error('Failed to fetch codebases');
    return res.json();
  }

  static async getMessages(conversationId: string) {
    const res = await this.fetch(`/api/conversations/${conversationId}/messages`);
    if (!res.ok) throw new Error('Failed to fetch messages');
    return res.json();
  }

  static async getConversationContext(conversationId: string) {
    const res = await this.fetch(`/api/conversations/${conversationId}/context`);
    if (!res.ok) throw new Error('Failed to fetch conversation context');
    return res.json();
  }

  static async getCommands(conversationId: string) {
    const res = await this.fetch(`/api/conversations/${conversationId}/commands`);
    if (!res.ok) throw new Error('Failed to fetch commands');
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

  static async getGitHubIssues(owner: string, repo: string) {
    const res = await this.fetch(`/api/github/issues?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
    if (!res.ok) throw new Error('Failed to fetch GitHub issues');
    return res.json();
  }

  static async getStats() {
    const res = await this.fetch('/api/stats');
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  }

  static async getWebhookRuns(filters: {
    platform?: string;
    status?: string;
    windowHours?: number;
    chainId?: string;
    runId?: string;
    search?: string;
    limit?: number;
  } = {}) {
    const params = new URLSearchParams();
    if (filters.platform) params.set('platform', filters.platform);
    if (filters.status) params.set('status', filters.status);
    if (typeof filters.windowHours === 'number') params.set('windowHours', String(filters.windowHours));
    if (filters.chainId) params.set('chainId', filters.chainId);
    if (filters.runId) params.set('runId', filters.runId);
    if (filters.search) params.set('search', filters.search);
    params.set('limit', String(filters.limit ?? 100));

    const res = await this.fetch(`/api/github/webhook-runs?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch webhook runs');
    return res.json();
  }

  static async getWebhookRunEvents(runId: string, limit = 200) {
    const res = await this.fetch(`/api/github/webhook-runs/${encodeURIComponent(runId)}/events?limit=${String(limit)}`);
    if (!res.ok) throw new Error('Failed to fetch webhook run events');
    return res.json();
  }

  static async getWebhookMetrics() {
    const res = await this.fetch('/api/github/webhook-metrics');
    if (!res.ok) throw new Error('Failed to fetch webhook metrics');
    return res.json();
  }
}
