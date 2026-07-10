import { type Logger, param, type Router } from '@fraqjs/fraq';

import type { GitHubEventService } from '../service.js';
import { parseSubscriptionRules, requireOperator, run } from './utils.js';

export function registerSubscriptionCommands(router: Router, service: GitHubEventService, logger: Logger): void {
  router
    .command('bind')
    .alias('绑定')
    .arg('repository', param.str())
    .execute((session, { repository }) =>
      run(session, logger, async () => {
        requireOperator(session, service);
        const result = await service.bind(session, repository);
        await session.reply(result.changed ? `已将本群绑定到 ${result.repository}` : `本群已绑定 ${result.repository}`);
      }),
    );

  router
    .command('unbind')
    .alias('解绑')
    .execute((session) =>
      run(session, logger, async () => {
        requireOperator(session, service);
        await session.reply((await service.unbind(session)) ? '已解除本群的仓库绑定' : '本群尚未绑定仓库');
      }),
    );

  router
    .command('subscribe')
    .alias('订阅')
    .arg('repository', param.str())
    .arg('events', param.greedy())
    .execute((session, { repository, events }) =>
      run(session, logger, async () => {
        requireOperator(session, service);
        const result = await service.subscribe(session, repository, parseSubscriptionRules(events));
        await session.reply(result.changed ? `已更新 ${result.repository} 的事件订阅` : '指定事件已经订阅');
      }),
    );
  router
    .command('subscribe')
    .arg('repository', param.str())
    .execute((session, { repository }) =>
      run(session, logger, async () => {
        requireOperator(session, service);
        const result = await service.subscribe(session, repository);
        await session.reply(
          result.changed ? `已订阅 ${result.repository} 的全部 GitHub App 事件` : `本群已经订阅 ${result.repository}`,
        );
      }),
    );

  router
    .command('unsubscribe')
    .alias('取消订阅')
    .arg('repository', param.str())
    .arg('events', param.greedy())
    .execute((session, { repository, events }) =>
      run(session, logger, async () => {
        requireOperator(session, service);
        const result = await service.unsubscribe(session, repository, parseSubscriptionRules(events));
        await session.reply(result.changed ? `已取消 ${result.repository} 的指定事件订阅` : '没有找到指定订阅');
      }),
    );
  router
    .command('unsubscribe')
    .arg('repository', param.str())
    .execute((session, { repository }) =>
      run(session, logger, async () => {
        requireOperator(session, service);
        const result = await service.unsubscribe(session, repository);
        await session.reply(
          result.changed ? `已取消 ${result.repository} 的全部订阅` : `本群没有订阅 ${result.repository}`,
        );
      }),
    );

  router.command('subscriptions').execute((session) =>
    run(session, logger, async () => {
      const rules = service.subscriptionsFor(session);
      const text = rules.map(
        (rule) => `${rule.repository} ${rule.event}${rule.actions ? `/[${rule.actions.join(', ')}]` : ''}`,
      );
      await session.reply(text.length > 0 ? `本群 GitHub 订阅：\n${text.join('\n')}` : '本群暂无 GitHub 订阅');
    }),
  );
}
