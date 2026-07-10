export interface GitHubPluginOptions {
  app: {
    webhookSecret: string;
    webhookPath?: string;
  };
  subscriptionsFile?: string;
  initialSubscriptions?: Record<string, string[]>;
  adminUserIds?: number[];
  allowGroupAdmins?: boolean;
}

export interface GitHubWebhookPayload {
  action?: string;
  comment?: { body?: string; html_url?: string };
  compare?: string;
  head_commit?: { message?: string; url?: string } | null;
  issue?: { number?: number; title?: string; html_url?: string };
  pull_request?: { number?: number; title?: string; html_url?: string; merged?: boolean };
  pusher?: { name?: string };
  ref?: string;
  release?: { name?: string; tag_name?: string; html_url?: string };
  repository?: { full_name?: string; html_url?: string };
  sender?: { login?: string };
  workflow_run?: { name?: string; conclusion?: string | null; status?: string; html_url?: string };
}
