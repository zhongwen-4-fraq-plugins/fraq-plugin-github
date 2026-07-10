import { type Logger, param, type Router, type Session } from '@fraqjs/fraq';

import type { GitHubEventService } from '../service.js';
import type { IssueTarget } from '../targets.js';
import { run } from './utils.js';

export function registerActionCommands(router: Router, service: GitHubEventService, logger: Logger): void {
  registerStarCommands(router, service, logger);
  registerIssueCommands(router, service, logger);
  registerMergeCommands(router, service, logger);
}

function registerStarCommands(router: Router, service: GitHubEventService, logger: Logger): void {
  for (const command of ['star', 'unstar'] as const) {
    router
      .command(command)
      .arg('repository', param.str())
      .execute((session, { repository }) =>
        run(session, logger, () =>
          updateStar(session, service, service.resolveRepository(session, repository), command === 'star'),
        ),
      );
    router
      .command(command)
      .execute((session) =>
        run(session, logger, () =>
          updateStar(session, service, service.resolveRepository(session), command === 'star'),
        ),
      );
  }
}

function registerIssueCommands(router: Router, service: GitHubEventService, logger: Logger): void {
  router
    .command('comment')
    .arg('target', param.str())
    .arg('content', param.greedy())
    .execute((session, { target, content }) =>
      run(session, logger, async () => {
        const explicit = service.tryResolveIssue(session, target);
        const issue = explicit ?? service.resolveIssue(session);
        const body = explicit ? content : `${target} ${content}`;
        const data = await service.api.request<{ html_url: string }>(
          `/repos/${issue.repository}/issues/${issue.number}/comments`,
          { token: service.userToken(session), body: { body } },
        );
        await session.reply(`💬 评论已发送\n${data.html_url}`);
      }),
    );

  router
    .command('comment')
    .arg('content', param.greedy())
    .execute((session, { content }) =>
      run(session, logger, async () => {
        const issue = service.resolveIssue(session);
        const data = await service.api.request<{ html_url: string }>(
          `/repos/${issue.repository}/issues/${issue.number}/comments`,
          { token: service.userToken(session), body: { body: content } },
        );
        await session.reply(`💬 评论已发送\n${data.html_url}`);
      }),
    );

  router
    .command('label')
    .arg('target', param.str())
    .arg('labels', param.greedy())
    .execute((session, { target, labels }) =>
      run(session, logger, async () => {
        const explicit = service.tryResolveIssue(session, target);
        const issue = explicit ?? service.resolveIssue(session);
        const names = splitValues(explicit ? labels : `${target} ${labels}`);
        await service.api.request(`/repos/${issue.repository}/issues/${issue.number}/labels`, {
          token: service.userToken(session),
          body: { labels: names },
        });
        await session.reply(`🏷️ 已添加标签：${names.join(', ')}`);
      }),
    );
  router
    .command('label')
    .arg('labels', param.greedy())
    .execute((session, { labels }) =>
      run(session, logger, async () => {
        const issue = service.resolveIssue(session);
        const names = splitValues(labels);
        await service.api.request(`/repos/${issue.repository}/issues/${issue.number}/labels`, {
          token: service.userToken(session),
          body: { labels: names },
        });
        await session.reply(`🏷️ 已添加标签：${names.join(', ')}`);
      }),
    );

  router
    .command('unlabel')
    .arg('target', param.str())
    .arg('labels', param.greedy())
    .execute((session, { target, labels }) =>
      run(session, logger, async () => {
        const explicit = service.tryResolveIssue(session, target);
        const issue = explicit ?? service.resolveIssue(session);
        const names = splitValues(explicit ? labels : `${target} ${labels}`);
        const token = service.userToken(session);
        for (const label of names) {
          await service.api.request(
            `/repos/${issue.repository}/issues/${issue.number}/labels/${encodeURIComponent(label)}`,
            { token, method: 'DELETE' },
          );
        }
        await session.reply(`🏷️ 已移除标签：${names.join(', ')}`);
      }),
    );
  router
    .command('unlabel')
    .arg('labels', param.greedy())
    .execute((session, { labels }) =>
      run(session, logger, async () => {
        const issue = service.resolveIssue(session);
        const names = splitValues(labels);
        const token = service.userToken(session);
        for (const label of names) {
          await service.api.request(
            `/repos/${issue.repository}/issues/${issue.number}/labels/${encodeURIComponent(label)}`,
            { token, method: 'DELETE' },
          );
        }
        await session.reply(`🏷️ 已移除标签：${names.join(', ')}`);
      }),
    );

  registerStateCommand(router, service, logger, 'close', 'closed');
  registerStateCommand(router, service, logger, 'reopen', 'open');

  router
    .command('approve')
    .arg('target', param.str())
    .arg('message', param.greedy())
    .execute((session, { target, message }) =>
      run(session, logger, () => {
        const explicit = service.tryResolveIssue(session, target);
        return approve(
          session,
          service,
          explicit ?? service.resolveIssue(session),
          explicit ? message : `${target} ${message}`,
        );
      }),
    );
  router
    .command('approve')
    .execute((session) => run(session, logger, () => approve(session, service, service.resolveIssue(session))));
  router
    .command('approve')
    .arg('target', param.greedy())
    .execute((session, { target }) =>
      run(session, logger, () => {
        const explicit = service.tryResolveIssue(session, target);
        return approve(session, service, explicit ?? service.resolveIssue(session), explicit ? undefined : target);
      }),
    );
}

function registerStateCommand(
  router: Router,
  service: GitHubEventService,
  logger: Logger,
  command: 'close' | 'reopen',
  state: 'closed' | 'open',
): void {
  router
    .command(command)
    .arg('target', param.str())
    .arg('reason', param.greedy())
    .execute((session, { target, reason }) =>
      run(session, logger, () => {
        const explicit = service.tryResolveIssue(session, target);
        return updateIssueState(
          session,
          service,
          explicit ?? service.resolveIssue(session),
          state,
          explicit ? reason : `${target} ${reason}`,
        );
      }),
    );
  router
    .command(command)
    .execute((session) =>
      run(session, logger, () => updateIssueState(session, service, service.resolveIssue(session), state)),
    );
  router
    .command(command)
    .arg('target', param.greedy())
    .execute((session, { target }) =>
      run(session, logger, () => {
        const explicit = service.tryResolveIssue(session, target);
        return updateIssueState(
          session,
          service,
          explicit ?? service.resolveIssue(session),
          state,
          explicit ? undefined : target,
        );
      }),
    );
}

function registerMergeCommands(router: Router, service: GitHubEventService, logger: Logger): void {
  for (const method of ['merge', 'squash', 'rebase'] as const) {
    router
      .command(method)
      .arg('target', param.str())
      .arg('commit', param.greedy())
      .execute((session, { target, commit }) =>
        run(session, logger, () => {
          const explicit = service.tryResolveIssue(session, target);
          return mergePullRequest(
            session,
            service,
            explicit ?? service.resolveIssue(session),
            method,
            explicit ? commit : `${target} ${commit}`,
          );
        }),
      );
    router
      .command(method)
      .execute((session) =>
        run(session, logger, () => mergePullRequest(session, service, service.resolveIssue(session), method)),
      );
    router
      .command(method)
      .arg('target', param.greedy())
      .execute((session, { target }) =>
        run(session, logger, () => {
          const explicit = service.tryResolveIssue(session, target);
          return mergePullRequest(
            session,
            service,
            explicit ?? service.resolveIssue(session),
            method,
            explicit ? undefined : target,
          );
        }),
      );
  }
}

async function updateStar(
  session: Session,
  service: GitHubEventService,
  repository: string,
  starred: boolean,
): Promise<void> {
  await service.api.request(`/user/starred/${repository}`, {
    token: service.userToken(session),
    method: starred ? 'PUT' : 'DELETE',
  });
  await session.reply(starred ? `⭐ 已 Star ${repository}` : `已取消 Star ${repository}`);
}

async function updateIssueState(
  session: Session,
  service: GitHubEventService,
  issue: IssueTarget,
  state: 'closed' | 'open',
  reason?: string,
): Promise<void> {
  const token = service.userToken(session);
  if (reason) {
    await service.api.request(`/repos/${issue.repository}/issues/${issue.number}/comments`, {
      token,
      body: { body: reason },
    });
  }
  const data = await service.api.request<{ html_url: string }>(`/repos/${issue.repository}/issues/${issue.number}`, {
    token,
    method: 'PATCH',
    body: { state },
  });
  await session.reply(
    `${state === 'closed' ? '✅ 已关闭' : '♻️ 已重新开启'} ${issue.repository}#${issue.number}\n${data.html_url}`,
  );
}

async function approve(
  session: Session,
  service: GitHubEventService,
  issue: IssueTarget,
  message?: string,
): Promise<void> {
  const data = await service.api.request<{ html_url?: string }>(
    `/repos/${issue.repository}/pulls/${issue.number}/reviews`,
    { token: service.userToken(session), body: { event: 'APPROVE', ...(message ? { body: message } : {}) } },
  );
  await session.reply(`✅ 已批准 ${issue.repository}#${issue.number}${data.html_url ? `\n${data.html_url}` : ''}`);
}

async function mergePullRequest(
  session: Session,
  service: GitHubEventService,
  issue: IssueTarget,
  method: 'merge' | 'squash' | 'rebase',
  commit?: string,
): Promise<void> {
  const data = await service.api.request<{ merged?: boolean; message?: string; sha?: string }>(
    `/repos/${issue.repository}/pulls/${issue.number}/merge`,
    {
      token: service.userToken(session),
      method: 'PUT',
      body: { merge_method: method, ...(commit ? { commit_title: commit } : {}) },
    },
  );
  if (!data.merged) throw new Error(data.message ?? 'Pull Request 合并失败');
  await session.reply(`🎉 已使用 ${method} 合并 ${issue.repository}#${issue.number}\n${data.sha ?? ''}`.trim());
}

function splitValues(value: string): string[] {
  const values = value.split(/[\s,]+/).filter(Boolean);
  if (values.length === 0) throw new Error('请至少提供一个值');
  return values;
}
