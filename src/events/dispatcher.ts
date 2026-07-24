import type { Logger, MilkyClient } from '@fraqjs/fraq';

import type { SubscriptionStore } from '../data/index.js';
import type { GitHubWebhookPayload } from '../models/index.js';
import { formatWebhookEvent } from './webhook.js';

export class GitHubEventDispatcher {
  private readonly delivered = new Set<string>();

  constructor(
    private readonly client: MilkyClient,
    private readonly logger: Logger,
    private readonly subscriptions: SubscriptionStore,
  ) {}

  isDuplicate(deliveryId: string | undefined): boolean {
    return deliveryId !== undefined && this.delivered.has(deliveryId);
  }

  remember(deliveryId: string | undefined): void {
    if (!deliveryId) return;
    this.delivered.add(deliveryId);
    if (this.delivered.size > 1000) this.delivered.delete(this.delivered.values().next().value as string);
  }

  async forward(event: string, payload: GitHubWebhookPayload): Promise<void> {
    const repository = payload.repository?.full_name;
    if (!repository) {
      this.logger.info(`忽略没有仓库信息的 GitHub App 事件：${event}`);
      return;
    }

    const message = formatWebhookEvent(event, payload);
    await Promise.all(
      this.subscriptions.groupsFor(repository, event, payload.action).map(async (groupId) => {
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
