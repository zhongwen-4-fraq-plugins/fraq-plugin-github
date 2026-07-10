import type { Logger, Router, Session } from '@fraqjs/fraq';
import { param } from '@fraqjs/fraq';

import { GitHubApiError } from './github-client.js';
import type { GitHubService } from './service.js';

async function execute(session: Session, logger: Logger, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    logger.warn('GitHub subscription command failed', error);
    if (error instanceof GitHubApiError) {
      await session.reply(`GitHub API 错误 (${error.status})：${error.message}`, { withQuote: true });
      return;
    }
    await session.reply(`操作失败：${error instanceof Error ? error.message : String(error)}`, { withQuote: true });
  }
}

function requireOperator(session: Session, service: GitHubService): void {
  if (!service.isOperator(session)) throw new Error('此操作仅允许插件管理员或群管理员执行');
}

export function registerSubscriptionCommands(router: Router, service: GitHubService, logger: Logger): void {
  router
    .command('subscribe')
    .alias('add')
    .arg('repository', param.str())
    .execute((session, { repository }) =>
      execute(session, logger, async () => {
        requireOperator(session, service);
        const normalized = service.resolveRepository(session, repository);
        const result = await service.subscribe(session, normalized);
        await session.reply(`${normalized} 的全事件 Webhook 已${result === 'created' ? '创建' : '更新'}并订阅到本群`);
      }),
    );

  router
    .command('unsubscribe')
    .alias('remove')
    .arg('repository', param.str())
    .execute((session, { repository }) =>
      execute(session, logger, async () => {
        requireOperator(session, service);
        const normalized = service.resolveRepository(session, repository);
        const changed = await service.unbind(session, normalized);
        await session.reply(changed ? `本群已取消订阅 ${normalized}` : `本群未订阅 ${normalized}`);
      }),
    );

  router.command('list').execute((session) =>
    execute(session, logger, async () => {
      const repositories = service.repositories(session);
      await session.reply(
        repositories.length ? `本群 GitHub 订阅：\n${repositories.join('\n')}` : '本群暂无 GitHub 订阅',
      );
    }),
  );
}
