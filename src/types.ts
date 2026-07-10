export interface GitHubPluginOptions {
  token?: string;
  adminUserIds?: number[];
  allowGroupAdmins?: boolean;
  bindingsFile?: string;
  initialBindings?: Record<string, string[]>;
  apiBaseUrl?: string;
  webBaseUrl?: string;
  maxReplyLength?: number;
  webhook?: {
    path?: string;
    publicUrl?: string;
    secret: string;
  };
  screenshot?: {
    executablePath?: string;
    width?: number;
    height?: number;
    timeoutMs?: number;
  };
}

export interface GitHubApiResult<T = unknown> {
  data: T;
  headers: Headers;
  status: number;
}

export interface RepositorySummary {
  default_branch: string;
  description: string | null;
  forks_count: number;
  full_name: string;
  html_url: string;
  language: string | null;
  open_issues_count: number;
  stargazers_count: number;
  visibility: string;
}

export interface WebhookPayload {
  action?: string;
  after?: string;
  before?: string;
  comment?: { html_url?: string; body?: string };
  compare?: string;
  deployment?: { environment?: string; ref?: string };
  forkee?: { full_name?: string; html_url?: string };
  head_commit?: { message?: string; url?: string } | null;
  issue?: { number?: number; title?: string; html_url?: string };
  organization?: { login?: string };
  pull_request?: { number?: number; title?: string; html_url?: string };
  pusher?: { name?: string };
  ref?: string;
  ref_type?: string;
  release?: { name?: string; tag_name?: string; html_url?: string };
  repository?: { full_name?: string; html_url?: string };
  sender?: { login?: string };
  star?: { starred_at?: string | null };
  workflow_run?: { name?: string; conclusion?: string | null; status?: string; html_url?: string };
}
