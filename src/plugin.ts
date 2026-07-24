import { definePlugin } from '@fraqjs/fraq';
import { HonoService } from '@fraqjs/plugin-hono';

import { registerPreviewRoute } from './commands/queries.js';
import { registerCommands } from './commands.js';
import type { GitHubPluginOptions } from './models/index.js';
import { GitHubEventService } from './services/index.js';

export const GitHubPlugin = definePlugin({
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
