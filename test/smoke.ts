import { Context } from '@fraqjs/fraq';
import { createSimpleLogHandler } from '@fraqjs/mock';
import HonoPlugin from '@fraqjs/plugin-hono';

import GitHubPlugin from '../src/index.js';

const ctx = Context.fromUrl('http://localhost:30001', {
  logHandler: createSimpleLogHandler(),
});

ctx.install(HonoPlugin, { port: 4649 });
ctx.install(GitHubPlugin, {
  token: process.env.GITHUB_TOKEN,
  adminUserIds: process.env.ADMIN_QQ ? [Number(process.env.ADMIN_QQ)] : [],
  webhook: process.env.GITHUB_WEBHOOK_SECRET
    ? {
        publicUrl: process.env.PUBLIC_URL,
        secret: process.env.GITHUB_WEBHOOK_SECRET,
      }
    : undefined,
});

await ctx.start();

process.on('SIGINT', async () => {
  await ctx.stop();
  process.exit(0);
});
