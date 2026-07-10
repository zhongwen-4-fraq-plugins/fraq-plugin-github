import type { GitHubApiResult, RepositorySummary } from './types.js';

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly response: unknown,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export class GitHubClient {
  constructor(
    private readonly token?: string,
    private readonly apiBaseUrl = 'https://api.github.com',
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    accept = 'application/vnd.github+json',
  ): Promise<GitHubApiResult<T>> {
    if (!path.startsWith('/')) throw new Error('GitHub API 路径必须以 / 开头');
    const headers: Record<string, string> = {
      Accept: accept,
      'User-Agent': 'fraq-plugin-github',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await this.fetcher(`${this.apiBaseUrl.replace(/\/$/, '')}${path}`, {
      method: method.toUpperCase(),
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data: unknown = text;
    if (text && response.headers.get('content-type')?.includes('json')) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) {
      const message =
        typeof data === 'object' && data && 'message' in data && typeof data.message === 'string'
          ? data.message
          : `GitHub API 请求失败 (${response.status})`;
      throw new GitHubApiError(message, response.status, data);
    }
    return { data: data as T, headers: response.headers, status: response.status };
  }

  async repository(repository: string): Promise<RepositorySummary> {
    return (await this.request<RepositorySummary>('GET', `/repos/${repository}`)).data;
  }

  async readme(repository: string): Promise<string> {
    return (
      await this.request<string>('GET', `/repos/${repository}/readme`, undefined, 'application/vnd.github.raw+json')
    ).data;
  }

  async graphql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const result = await this.request<{ data?: T; errors?: Array<{ message: string }> }>('POST', '/graphql', {
      query,
      variables,
    });
    if (result.data.errors?.length)
      throw new GitHubApiError(result.data.errors.map((error) => error.message).join('; '), 200, result.data);
    return result.data.data as T;
  }

  async subscribeAllEvents(repository: string, url: string, secret: string): Promise<'created' | 'updated'> {
    const hooks = (
      await this.request<Array<{ id: number; config?: { url?: string } }>>(
        'GET',
        `/repos/${repository}/hooks?per_page=100`,
      )
    ).data;
    const existing = hooks.find((hook) => hook.config?.url === url);
    const config = { url, content_type: 'json', insecure_ssl: '0', secret };
    if (existing) {
      await this.request('PATCH', `/repos/${repository}/hooks/${existing.id}`, { active: true, events: ['*'], config });
      return 'updated';
    }
    await this.request('POST', `/repos/${repository}/hooks`, { name: 'web', active: true, events: ['*'], config });
    return 'created';
  }
}
