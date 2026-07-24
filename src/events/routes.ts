import type { HonoService } from '@fraqjs/plugin-hono';

import type { GitHubWebhookPayload } from '../models/index.js';
import type { GitHubEventDispatcher } from './dispatcher.js';
import { verifyWebhookSignature } from './webhook.js';

export function installWebhookRoute(
  hono: HonoService,
  dispatcher: GitHubEventDispatcher,
  secret: string,
  path = '/github/app/webhook',
): void {
  hono.app.post(path, async (context) => {
    const body = await context.req.text();
    if (!verifyWebhookSignature(secret, body, context.req.header('x-hub-signature-256'))) {
      return context.json({ error: 'Invalid signature' }, 401);
    }

    const deliveryId = context.req.header('x-github-delivery');
    if (dispatcher.isDuplicate(deliveryId)) {
      return context.json({ ok: true, duplicate: true });
    }

    let payload: GitHubWebhookPayload;
    try {
      payload = JSON.parse(body) as GitHubWebhookPayload;
    } catch {
      return context.json({ error: 'Invalid JSON' }, 400);
    }

    dispatcher.remember(deliveryId);
    await dispatcher.forward(context.req.header('x-github-event') ?? 'unknown', payload);
    return context.json({ ok: true });
  });
}
