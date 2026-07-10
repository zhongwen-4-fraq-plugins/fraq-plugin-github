import { definePlugin } from '@fraqjs/fraq';
import { HonoService } from '@fraqjs/plugin-hono';

import { registerPreviewRoute } from './commands/queries.js';
import { registerCommands } from './commands.js';
import { GitHubEventService } from './service.js';
import type { GitHubPluginOptions } from './types.js';

export { GitHubApi, GitHubApiError } from './github-api.js';
export { normalizeRepository } from './repository.js';
export { GitHubEventService } from './service.js';
export { SubscriptionStore } from './subscriptions.js';
export type { GitHubAppOptions, GitHubPluginOptions, GitHubWebhookPayload, SubscriptionRule } from './types.js';
export { formatWebhookEvent, verifyWebhookSignature } from './webhook.js';

const GitHubPlugin = definePlugin({
  name: 'github',
  inject: { hono: HonoService },
  provides: [GitHubEventService],
  async apply(ctx, options: GitHubPluginOptions) {
    const service = await GitHubEventService.create(ctx.client, ctx.logger, options);
    ctx.provide(GitHubEventService, service);
    service.installRoutes(ctx.hono);
    registerCommands(ctx.router.group('github'), service, ctx.logger);
    registerPreviewRoute(ctx.router, service, ctx.logger);
  },
});

export default GitHubPlugin;
