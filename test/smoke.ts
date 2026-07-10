import { Context } from '@fraqjs/fraq';
import { createSimpleLogHandler } from '@fraqjs/mock';
import HonoPlugin from '@fraqjs/plugin-hono';

import GitHubPlugin from '../src/index.js';

const ctx = Context.fromUrl('http://localhost:30001', {
  logHandler: createSimpleLogHandler(),
});

ctx.install(HonoPlugin, { port: 4649 });
ctx.install(GitHubPlugin, {
  app: {
    appId: process.env.GITHUB_APP_ID,
    appSlug: process.env.GITHUB_APP_SLUG,
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    privateKey: process.env.GITHUB_PRIVATE_KEY?.replaceAll('\\n', '\n'),
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? 'development-secret',
  },
  adminUserIds: process.env.ADMIN_QQ ? [Number(process.env.ADMIN_QQ)] : [],
});

await ctx.start();

process.on('SIGINT', async () => {
  await ctx.stop();
  process.exit(0);
});
