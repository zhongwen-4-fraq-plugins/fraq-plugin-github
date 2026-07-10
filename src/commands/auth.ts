import { type Logger, param, type Router } from '@fraqjs/fraq';

import type { GitHubEventService } from '../service.js';
import { requireOperator, run } from './utils.js';

export function registerAuthCommands(router: Router, service: GitHubEventService, logger: Logger): void {
  router
    .command('auth')
    .alias('授权')
    .execute((session) =>
      run(session, logger, async () => {
        await session.reply(
          `请在 10 分钟内打开链接完成 GitHub 授权：\n${service.beginAuthorization(session.raw.sender_id)}`,
        );
      }),
    );

  router
    .group('auth')
    .command('check')
    .execute((session) =>
      run(session, logger, async () => {
        const login = await service.authorizedUser(session.raw.sender_id);
        await session.reply(login ? `已授权 GitHub 用户：${login}` : '尚未授权 GitHub 用户');
      }),
    );

  router
    .group('auth')
    .command('revoke')
    .execute((session) =>
      run(session, logger, async () => {
        const changed = await service.revokeAuthorization(session.raw.sender_id);
        await session.reply(changed ? '已撤销 GitHub 用户授权' : '尚未授权 GitHub 用户');
      }),
    );

  router
    .command('install')
    .alias('安装')
    .execute((session) =>
      run(session, logger, async () => {
        await session.reply(`请打开链接安装 GitHub App：\n${service.api.installationUrl()}`);
      }),
    );

  const install = router.group('install');
  install
    .command('check')
    .arg('repository', param.str())
    .execute((session, { repository }) =>
      run(session, logger, async () => {
        const normalized = service.resolveRepository(session, repository);
        const id = await service.api.installationId(normalized);
        await session.reply(`${normalized} 已安装 GitHub App（installation ${id}）`);
      }),
    );
  install.command('check').execute((session) =>
    run(session, logger, async () => {
      const repository = service.resolveRepository(session);
      const id = await service.api.installationId(repository);
      await session.reply(`${repository} 已安装 GitHub App（installation ${id}）`);
    }),
  );

  install
    .command('revoke')
    .arg('repository', param.str())
    .execute((session, { repository }) =>
      run(session, logger, async () => {
        requireOperator(session, service);
        const normalized = service.resolveRepository(session, repository);
        const id = await service.api.installationId(normalized);
        await service.api.appRequest(`/app/installations/${id}`, { method: 'DELETE' });
        await session.reply(`已撤销 ${normalized} 的 GitHub App 安装`);
      }),
    );
  install.command('revoke').execute((session) =>
    run(session, logger, async () => {
      requireOperator(session, service);
      const repository = service.resolveRepository(session);
      const id = await service.api.installationId(repository);
      await service.api.appRequest(`/app/installations/${id}`, { method: 'DELETE' });
      await session.reply(`已撤销 ${repository} 的 GitHub App 安装`);
    }),
  );
}
