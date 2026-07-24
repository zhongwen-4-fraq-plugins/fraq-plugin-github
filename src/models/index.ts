export interface GitHubAppOptions {
  appId?: string;
  appSlug?: string;
  clientId?: string;
  clientSecret?: string;
  privateKey?: string | string[];
  webhookSecret: string;
  webhookPath?: string;
}

export interface GitHubPluginOptions {
  app: GitHubAppOptions;
  subscriptionsFile?: string;
  initialSubscriptions?: Record<string, string[]>;
  adminUserIds?: number[];
  apiBaseUrl?: string;
  webBaseUrl?: string;
  maxReplyLength?: number;
}

export interface SubscriptionRule {
  repository: string;
  event: string;
  actions?: string[];
}

export interface GitHubWebhookPayload {
  action?: string;
  commits?: Array<{ id?: string; message?: string; url?: string; author?: { name?: string } }>;
  comment?: { body?: string; html_url?: string };
  compare?: string;
  head_commit?: { message?: string; url?: string } | null;
  issue?: { number?: number; title?: string; html_url?: string };
  pull_request?: { number?: number; title?: string; html_url?: string; merged?: boolean };
  review?: { body?: string | null; html_url?: string; state?: string };
  pusher?: { name?: string };
  ref?: string;
  release?: { name?: string; tag_name?: string; html_url?: string };
  repository?: { full_name?: string; html_url?: string };
  sender?: { login?: string };
  star?: { starred_at?: string | null };
  workflow_run?: { name?: string; conclusion?: string | null; status?: string; html_url?: string };
}

export interface IssueTarget {
  number: number;
  repository: string;
}
