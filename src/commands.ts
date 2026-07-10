import type { Logger, milky, Router, Session } from '@fraqjs/fraq';
import { param, seg } from '@fraqjs/fraq';

import { GitHubApiError } from './github-client.js';
import type { GitHubService } from './service.js';

function quotedSegments(reply: milky.IncomingReplySegment): milky.IncomingSegment[] {
  return reply.data.segments;
}

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    throw new Error('JSON 参数格式无效');
  }
}

function formatResult(value: unknown, limit: number): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (!text) return '请求成功（无响应内容）';
  return text.length > limit ? `${text.slice(0, limit)}\n…内容已截断` : text;
}

async function run(session: Session, logger: Logger, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    logger.warn('GitHub command failed', error);
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

function registerReadmeCommands(router: Router, service: GitHubService, logger: Logger): void {
  router
    .command('readme')
    .arg('repository', param.str())
    .execute((session, { repository }) =>
      run(session, logger, async () => {
        const normalized = service.resolveRepository(session, repository);
        const readme = await service.readme(normalized);
        await session.reply(
          `📖 ${normalized} README\n${formatResult(readme, service.maxReplyLength())}\nhttps://github.com/${normalized}#readme`,
        );
      }),
    );
  router.command('readme').execute((session) =>
    run(session, logger, async () => {
      const repository = service.resolveRepository(session);
      const readme = await service.readme(repository);
      await session.reply(
        `📖 ${repository} README\n${formatResult(readme, service.maxReplyLength())}\nhttps://github.com/${repository}#readme`,
      );
    }),
  );
}

function registerApiCommands(router: Router, service: GitHubService, logger: Logger): void {
  router
    .rawPattern()
    .arg('method', param.union('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'))
    .arg('path', param.str())
    .arg('body', param.greedy())
    .execute((session, { method, path, body }) =>
      run(session, logger, async () => {
        requireOperator(session, service);
        const result = await service.api.request(method, path, parseJson(body));
        await session.reply(`HTTP ${result.status}\n${formatResult(result.data, service.maxReplyLength())}`);
      }),
    );
  router
    .rawPattern()
    .arg('method', param.union('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'))
    .arg('path', param.str())
    .execute((session, { method, path }) =>
      run(session, logger, async () => {
        requireOperator(session, service);
        const result = await service.api.request(method, path);
        await session.reply(`HTTP ${result.status}\n${formatResult(result.data, service.maxReplyLength())}`);
      }),
    );
}

function registerGraphqlCommands(router: Router, service: GitHubService, logger: Logger): void {
  router
    .rawPattern()
    .arg('body', param.greedy())
    .execute((session, { body }) =>
      run(session, logger, async () => {
        requireOperator(session, service);
        const input = parseJson(body);
        if (!input || typeof input !== 'object' || !('query' in input) || typeof input.query !== 'string') {
          throw new Error('GraphQL 参数必须是包含 query 和可选 variables 的 JSON 对象');
        }
        const result = await service.api.graphql(
          input.query,
          'variables' in input && input.variables && typeof input.variables === 'object'
            ? (input.variables as Record<string, unknown>)
            : undefined,
        );
        await session.reply(formatResult(result, service.maxReplyLength()));
      }),
    );
}

export function registerCommands(router: Router, service: GitHubService, logger: Logger): void {
  router
    .command('repo')
    .arg('repository', param.str())
    .execute((session, { repository }) =>
      run(session, logger, async () => {
        const data = await service.repository(service.resolveRepository(session, repository));
        await session.reply(
          `📦 ${data.full_name}\n${data.description ?? '暂无描述'}\n⭐ ${data.stargazers_count}  🍴 ${data.forks_count}  🗂️ ${data.open_issues_count}\n${data.language ?? '未知语言'} · ${data.visibility}\n${data.html_url}`,
        );
      }),
    );

  registerReadmeCommands(router, service, logger);

  router
    .command('shot')
    .arg('target', param.greedy())
    .execute((session, { target }) =>
      run(session, logger, async () => {
        const image = await service.screenshot(target);
        await session.reply([seg.image(`base64://${image.toString('base64')}`, { summary: '[GitHub 网页截图]' })]);
      }),
    );

  router
    .command('bind')
    .arg('repository', param.str())
    .execute((session, { repository }) =>
      run(session, logger, async () => {
        requireOperator(session, service);
        const normalized = service.resolveRepository(session, repository);
        const changed = await service.bind(session, normalized);
        await session.reply(changed ? `已将 ${normalized} 绑定到本群` : `${normalized} 已绑定到本群`);
      }),
    );

  router
    .command('unbind')
    .arg('repository', param.str())
    .execute((session, { repository }) =>
      run(session, logger, async () => {
        requireOperator(session, service);
        const normalized = service.resolveRepository(session, repository);
        const changed = await service.unbind(session, normalized);
        await session.reply(changed ? `已解除 ${normalized} 的群绑定` : `本群未绑定 ${normalized}`);
      }),
    );

  router.command('bindings').execute((session) =>
    run(session, logger, async () => {
      const repositories = service.repositories(session);
      await session.reply(
        repositories.length ? `本群已绑定：\n${repositories.join('\n')}` : '本群尚未绑定 GitHub 仓库',
      );
    }),
  );

  router
    .command('subscribe')
    .arg('repository', param.str())
    .execute((session, { repository }) =>
      run(session, logger, async () => {
        requireOperator(session, service);
        const normalized = service.resolveRepository(session, repository);
        const result = await service.subscribe(session, normalized);
        await session.reply(`${normalized} 的全事件 Webhook 已${result === 'created' ? '创建' : '更新'}并绑定到本群`);
      }),
    );

  registerApiCommands(router.group('api'), service, logger);
  registerGraphqlCommands(router.group('graphql'), service, logger);

  router.command('help').execute(async (session) => {
    await session.reply(
      [
        'GitHub 插件命令：',
        'github repo <owner/repo> — 查看仓库信息',
        'github readme [owner/repo] — 查看 README，可使用群绑定',
        'github shot <owner/repo|GitHub URL> — 截取网页',
        'github bind/unbind <owner/repo> — 管理群绑定',
        'github bindings — 查看本群绑定',
        'github subscribe <owner/repo> — 订阅全部 Webhook 事件',
        'github api <METHOD> <PATH> [JSON] — 调用任意 REST API',
        'github graphql <JSON> — 调用 GitHub GraphQL API',
        '回复含 GitHub 链接的消息并发送 github readme 或 github shot 也可使用。',
      ].join('\n'),
    );
  });
}

export function registerReplyCommands(router: Router, service: GitHubService, logger: Logger): void {
  router
    .rawPattern()
    .arg('reply', param.segment('reply'))
    .arg('root', param.literal('github'))
    .arg('action', param.union('readme', 'shot'))
    .execute((session, { reply, action }) =>
      run(session, logger, async () => {
        if (action === 'readme') {
          const repository = service.resolveRepository(session, undefined, quotedSegments(reply));
          const readme = await service.readme(repository);
          await session.reply(
            `📖 ${repository} README\n${formatResult(readme, service.maxReplyLength())}\nhttps://github.com/${repository}#readme`,
          );
          return;
        }
        const image = await service.screenshot(service.screenshotTargetFromReply(quotedSegments(reply)));
        await session.reply([seg.image(`base64://${image.toString('base64')}`, { summary: '[GitHub 网页截图]' })]);
      }),
    );
}
