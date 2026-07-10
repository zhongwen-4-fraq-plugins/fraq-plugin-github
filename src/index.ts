import { definePlugin } from '@fraqjs/fraq';
import { HonoService } from '@fraqjs/plugin-hono';

import { registerCommands, registerReplyCommands } from './commands.js';
import { GitHubService } from './service.js';
import type { GitHubPluginOptions } from './types.js';

export { BindingStore } from './bindings.js';
export { GitHubApiError, GitHubClient } from './github-client.js';
export { extractGitHubUrl, extractRepository, normalizeRepository, resolveGitHubUrl } from './repository.js';
export { GitHubService } from './service.js';
export type { GitHubApiResult, GitHubPluginOptions, RepositorySummary, WebhookPayload } from './types.js';
export { formatWebhookEvent, verifyWebhookSignature } from './webhook.js';

export default definePlugin({
  name: 'github',
  provides: [GitHubService],
  inject: {
    hono: HonoService,
  },
  async apply(ctx, options: GitHubPluginOptions = {}) {
    const service = await GitHubService.create(ctx.client, ctx.logger, options);
    ctx.provide(GitHubService, service);
    service.installWebhook(ctx.hono);
    registerCommands(ctx.router.group('github'), service, ctx.logger);
    registerReplyCommands(ctx.router, service, ctx.logger);
  },
});
