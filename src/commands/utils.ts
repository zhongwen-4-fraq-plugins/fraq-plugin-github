import type { Logger, Session } from '@fraqjs/fraq';

import { GitHubApiError } from '../github-api.js';
import type { GitHubEventService } from '../service.js';
import type { SubscriptionRule } from '../types.js';

export async function run(session: Session, logger: Logger, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    logger.warn('GitHub 命令执行失败', error);
    const message =
      error instanceof GitHubApiError
        ? `GitHub API 错误 (${error.status})：${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);
    await session.reply(`操作失败：${message}`, { withQuote: true });
  }
}

export function requireOperator(session: Session, service: GitHubEventService): void {
  if (!service.isOperator(session)) throw new Error('只有配置列表中的用户或群主、群管理员可以执行此操作');
}

export function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}\n…内容已截断` : value;
}

export function parseSubscriptionRules(input: string): Array<Omit<SubscriptionRule, 'repository'>> {
  const grouped = new Map<string, Set<string> | undefined>();
  for (const item of input.trim().split(/\s+/)) {
    const matched = item.match(/^([a-zA-Z_]+)(?:\/([a-zA-Z_]+))?$/);
    if (!matched?.[1]) throw new Error(`事件格式错误：${item}，应为 event 或 event/action`);
    const event = matched[1].toLowerCase();
    const action = matched[2]?.toLowerCase();
    if (!action) grouped.set(event, undefined);
    else if (grouped.get(event) !== undefined || !grouped.has(event)) {
      const actions = grouped.get(event) ?? new Set<string>();
      actions.add(action);
      grouped.set(event, actions);
    }
  }
  return [...grouped].map(([event, actions]) => ({ event, actions: actions ? [...actions] : undefined }));
}
