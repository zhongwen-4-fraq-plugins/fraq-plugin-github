import type { GitHubAppOptions } from '../models/index.js';

import { createSign } from 'node:crypto';

interface CachedToken {
  expiresAt: number;
  token: string;
}

interface RequestOptions {
  accept?: string;
  body?: unknown;
  method?: string;
  token?: string;
}

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export class GitHubApi {
  private readonly installationTokens = new Map<number, CachedToken>();
  private readonly repositoryTokens = new Map<string, CachedToken>();

  constructor(
    private readonly app: GitHubAppOptions,
    private readonly apiBaseUrl = 'https://api.github.com',
    private readonly webBaseUrl = 'https://github.com',
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.fetcher(new URL(path, this.apiBaseUrl), {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers: {
        accept: options.accept ?? 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'fraq-plugin-github',
        'x-github-api-version': '2022-11-28',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
      throw new GitHubApiError(response.status, data?.message ?? response.statusText);
    }
    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get('content-type');
    return (contentType?.includes('json') ? response.json() : response.text()) as Promise<T>;
  }

  async appRequest<T>(path: string, options: Omit<RequestOptions, 'token'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, token: this.createAppJwt() });
  }

  async repositoryRequest<T>(repository: string, path: string, options: RequestOptions = {}): Promise<T> {
    const token = options.token ?? (await this.installationToken(repository).catch(() => undefined));
    return this.request<T>(path, { ...options, token });
  }

  async installationId(repository: string): Promise<number> {
    const installation = await this.appRequest<{ id: number }>(`/repos/${repository}/installation`);
    return installation.id;
  }

  async installationToken(repository: string): Promise<string> {
    const repositoryToken = this.repositoryTokens.get(repository);
    if (repositoryToken && repositoryToken.expiresAt > Date.now() + 60_000) return repositoryToken.token;
    const installationId = await this.installationId(repository);
    const cached = this.installationTokens.get(installationId);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      this.repositoryTokens.set(repository, cached);
      return cached.token;
    }

    const data = await this.appRequest<{ expires_at: string; token: string }>(
      `/app/installations/${installationId}/access_tokens`,
      { method: 'POST' },
    );
    const token = {
      token: data.token,
      expiresAt: new Date(data.expires_at).getTime(),
    };
    this.installationTokens.set(installationId, token);
    this.repositoryTokens.set(repository, token);
    return data.token;
  }

  async exchangeOAuthCode(code: string): Promise<string> {
    if (!this.app.clientId || !this.app.clientSecret) throw new Error('未配置 GitHub App OAuth');
    const data = await this.request<{ access_token?: string; error_description?: string }>(
      `${this.webBaseUrl}/login/oauth/access_token`,
      {
        method: 'POST',
        body: { client_id: this.app.clientId, client_secret: this.app.clientSecret, code },
      },
    );
    if (!data.access_token) throw new Error(data.error_description ?? 'GitHub OAuth 授权失败');
    return data.access_token;
  }

  async revokeOAuthToken(token: string): Promise<void> {
    if (!this.app.clientId || !this.app.clientSecret) throw new Error('未配置 GitHub App OAuth');
    const basic = Buffer.from(`${this.app.clientId}:${this.app.clientSecret}`).toString('base64');
    const response = await this.fetcher(`${this.apiBaseUrl}/applications/${this.app.clientId}/grant`, {
      method: 'DELETE',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Basic ${basic}`,
        'content-type': 'application/json',
        'user-agent': 'fraq-plugin-github',
      },
      body: JSON.stringify({ access_token: token }),
    });
    if (!response.ok && response.status !== 404) throw new GitHubApiError(response.status, response.statusText);
  }

  oauthUrl(state: string): string {
    if (!this.app.clientId) throw new Error('未配置 app.clientId');
    const url = new URL('/login/oauth/authorize', this.webBaseUrl);
    url.searchParams.set('client_id', this.app.clientId);
    url.searchParams.set('state', state);
    return url.toString();
  }

  installationUrl(): string {
    if (!this.app.appSlug) throw new Error('未配置 app.appSlug');
    return new URL(`/apps/${this.app.appSlug}/installations/new`, this.webBaseUrl).toString();
  }

  private createAppJwt(): string {
    if (!this.app.appId || !this.app.privateKey) throw new Error('未配置 app.appId 或 app.privateKey');
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: this.app.appId })).toString(
      'base64url',
    );
    const content = `${header}.${payload}`;
    const key = Array.isArray(this.app.privateKey) ? this.app.privateKey.join('\n') : this.app.privateKey;
    const signature = createSign('RSA-SHA256').update(content).sign(key, 'base64url');
    return `${content}.${signature}`;
  }
}
