import type { Logger, Router, Session } from '@fraqjs/fraq';
import { param } from '@fraqjs/fraq';

import { GitHubApiError } from './github-client.js';
import type { GitHubService } from './service.js';

interface PullRequestReviewResult {
  html_url?: string;
  state?: string;
}

interface PullRequestMergeResult {
  merged: boolean;
  message: string;
  sha?: string;
}

function pullRequestNumber() {
  return param.num().refine((value) => Number.isSafeInteger(value) && value > 0);
}

async function execute(session: Session, logger: Logger, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    logger.warn('GitHub pull request command failed', error);
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

async function approve(
  session: Session,
  service: GitHubService,
  repository: string | undefined,
  number: number,
  body?: string,
): Promise<void> {
  requireOperator(session, service);
  const normalized = service.resolveRepository(session, repository);
  const result = await service.api.request<PullRequestReviewResult>(
    'POST',
    `/repos/${normalized}/pulls/${number}/reviews`,
    body ? { event: 'APPROVE', body } : { event: 'APPROVE' },
  );
  await session.reply(`✅ 已批准 ${normalized}#${number}${result.data.html_url ? `\n${result.data.html_url}` : ''}`);
}

async function merge(
  session: Session,
  service: GitHubService,
  repository: string | undefined,
  number: number,
  method: 'merge' | 'squash' | 'rebase' = 'squash',
): Promise<void> {
  requireOperator(session, service);
  const normalized = service.resolveRepository(session, repository);
  const result = await service.api.request<PullRequestMergeResult>(
    'PUT',
    `/repos/${normalized}/pulls/${number}/merge`,
    {
      merge_method: method,
    },
  );
  await session.reply(
    result.data.merged
      ? `🎉 已使用 ${method} 合并 ${normalized}#${number}${result.data.sha ? `\n${result.data.sha}` : ''}`
      : `未能合并 ${normalized}#${number}：${result.data.message}`,
  );
}

function registerApproveCommands(router: Router, service: GitHubService, logger: Logger): void {
  router
    .rawPattern()
    .arg('repository', param.str())
    .arg('number', pullRequestNumber())
    .arg('body', param.greedy())
    .execute((session, { repository, number, body }) =>
      execute(session, logger, () => approve(session, service, repository, number, body)),
    );
  router
    .rawPattern()
    .arg('repository', param.str())
    .arg('number', pullRequestNumber())
    .execute((session, { repository, number }) =>
      execute(session, logger, () => approve(session, service, repository, number)),
    );
  router
    .rawPattern()
    .arg('number', pullRequestNumber())
    .arg('body', param.greedy())
    .execute((session, { number, body }) =>
      execute(session, logger, () => approve(session, service, undefined, number, body)),
    );
  router
    .rawPattern()
    .arg('number', pullRequestNumber())
    .execute((session, { number }) => execute(session, logger, () => approve(session, service, undefined, number)));
}

function registerMergeCommands(router: Router, service: GitHubService, logger: Logger): void {
  router
    .rawPattern()
    .arg('repository', param.str())
    .arg('number', pullRequestNumber())
    .arg('method', param.union('merge', 'squash', 'rebase'))
    .execute((session, { repository, number, method }) =>
      execute(session, logger, () => merge(session, service, repository, number, method)),
    );
  router
    .rawPattern()
    .arg('repository', param.str())
    .arg('number', pullRequestNumber())
    .execute((session, { repository, number }) =>
      execute(session, logger, () => merge(session, service, repository, number)),
    );
  router
    .rawPattern()
    .arg('number', pullRequestNumber())
    .arg('method', param.union('merge', 'squash', 'rebase'))
    .execute((session, { number, method }) =>
      execute(session, logger, () => merge(session, service, undefined, number, method)),
    );
  router
    .rawPattern()
    .arg('number', pullRequestNumber())
    .execute((session, { number }) => execute(session, logger, () => merge(session, service, undefined, number)));
}

export function registerPullRequestCommands(router: Router, service: GitHubService, logger: Logger): void {
  registerApproveCommands(router.group('approve'), service, logger);
  registerMergeCommands(router.group('merge'), service, logger);
}
