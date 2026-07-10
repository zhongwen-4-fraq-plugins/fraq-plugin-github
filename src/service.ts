import type { Logger, MilkyClient, Session } from '@fraqjs/fraq';
import type { HonoService } from '@fraqjs/plugin-hono';

import { normalizeRepository } from './repository.js';
import { SubscriptionStore } from './subscriptions.js';
import type { GitHubPluginOptions, GitHubWebhookPayload } from './types.js';
import { formatWebhookEvent, verifyWebhookSignature } from './webhook.js';

import { isAbsolute, resolve } from 'node:path';

export class GitHubEventService {
  private readonly delivered = new Set<string>();

  constructor(
    private readonly client: MilkyClient,
    private readonly logger: Logger,
    private readonly options: GitHubPluginOptions,
    private readonly subscriptions: SubscriptionStore,
  ) {}

  static async create(client: MilkyClient, logger: Logger, options: GitHubPluginOptions): Promise<GitHubEventService> {
    if (!options.app?.webhookSecret) throw new Error('必须配置 app.webhookSecret');
    const file = options.subscriptionsFile ?? 'data/fraq-plugin-github.json';
    const subscriptions = new SubscriptionStore(isAbsolute(file) ? file : resolve(process.cwd(), file));
    await subscriptions.load(options.initialSubscriptions);
    return new GitHubEventService(client, logger, options, subscriptions);
  }

  installWebhook(hono: HonoService): void {
    hono.app.post(this.options.app.webhookPath ?? '/github/app/webhook', async (context) => {
      const body = await context.req.text();
      const signature = context.req.header('x-hub-signature-256');
      if (!verifyWebhookSignature(this.options.app.webhookSecret, body, signature)) {
        return context.json({ error: 'Invalid signature' }, 401);
      }

      const deliveryId = context.req.header('x-github-delivery');
      if (deliveryId && this.delivered.has(deliveryId)) {
        return context.json({ ok: true, duplicate: true });
      }

      let payload: GitHubWebhookPayload;
      try {
        payload = JSON.parse(body) as GitHubWebhookPayload;
      } catch {
        return context.json({ error: 'Invalid JSON' }, 400);
      }

      if (deliveryId) this.rememberDelivery(deliveryId);
      await this.forward(context.req.header('x-github-event') ?? 'unknown', payload);
      return context.json({ ok: true });
    });
  }

  isOperator(session: Session): boolean {
    if (this.options.adminUserIds?.includes(session.raw.sender_id)) return true;
    return (
      (this.options.allowGroupAdmins ?? true) &&
      session.raw.message_scene === 'group' &&
      session.raw.group_member.role !== 'member'
    );
  }

  repositories(session: Session): string[] {
    return session.raw.message_scene === 'group' ? this.subscriptions.repositoriesFor(session.raw.peer_id) : [];
  }

  async subscribe(session: Session, input: string): Promise<{ changed: boolean; repository: string }> {
    const groupId = this.groupId(session);
    const repository = normalizeRepository(input);
    if (!repository) throw new Error('仓库格式必须为 owner/repo');
    return { changed: await this.subscriptions.subscribe(groupId, repository), repository };
  }

  async unsubscribe(session: Session, input: string): Promise<{ changed: boolean; repository: string }> {
    const groupId = this.groupId(session);
    const repository = normalizeRepository(input);
    if (!repository) throw new Error('仓库格式必须为 owner/repo');
    return { changed: await this.subscriptions.unsubscribe(groupId, repository), repository };
  }

  private groupId(session: Session): number {
    if (session.raw.message_scene !== 'group') throw new Error('此命令只能在群聊中使用');
    return session.raw.peer_id;
  }

  private rememberDelivery(deliveryId: string): void {
    this.delivered.add(deliveryId);
    if (this.delivered.size > 1000) this.delivered.delete(this.delivered.values().next().value as string);
  }

  private async forward(event: string, payload: GitHubWebhookPayload): Promise<void> {
    const repository = payload.repository?.full_name;
    if (!repository) {
      this.logger.info(`忽略没有仓库信息的 GitHub App 事件：${event}`);
      return;
    }

    const message = formatWebhookEvent(event, payload);
    await Promise.all(
      this.subscriptions.groupsFor(repository).map(async (groupId) => {
        try {
          await this.client.send_group_message({
            group_id: groupId,
            message: [{ type: 'text', data: { text: message } }],
          });
        } catch (error) {
          this.logger.error(`GitHub 事件发送到群 ${groupId} 失败`, error);
        }
      }),
    );
  }
}
