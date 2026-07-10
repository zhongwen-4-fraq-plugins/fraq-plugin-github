import { type Logger, param, type Router, type Session } from '@fraqjs/fraq';

import type { GitHubEventService } from './service.js';

async function run(session: Session, logger: Logger, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    logger.warn('GitHub 订阅命令执行失败', error);
    await session.reply(`操作失败：${error instanceof Error ? error.message : String(error)}`, { withQuote: true });
  }
}

function requireOperator(session: Session, service: GitHubEventService): void {
  if (!service.isOperator(session)) throw new Error('只有插件管理员或群管理员可以修改订阅');
}

export function registerCommands(router: Router, service: GitHubEventService, logger: Logger): void {
  router
    .command('subscribe')
    .arg('repository', param.str())
    .execute((session, { repository }) =>
      run(session, logger, async () => {
        requireOperator(session, service);
        const result = await service.subscribe(session, repository);
        await session.reply(
          result.changed ? `已订阅 ${result.repository} 的 GitHub App 事件` : `本群已经订阅 ${result.repository}`,
        );
      }),
    );

  router
    .command('unsubscribe')
    .arg('repository', param.str())
    .execute((session, { repository }) =>
      run(session, logger, async () => {
        requireOperator(session, service);
        const result = await service.unsubscribe(session, repository);
        await session.reply(result.changed ? `已取消订阅 ${result.repository}` : `本群没有订阅 ${result.repository}`);
      }),
    );

  router.command('subscriptions').execute((session) =>
    run(session, logger, async () => {
      const repositories = service.repositories(session);
      await session.reply(
        repositories.length > 0 ? `本群 GitHub 订阅：\n${repositories.join('\n')}` : '本群暂无 GitHub 订阅',
      );
    }),
  );
}
