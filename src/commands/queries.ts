import { type Logger, param, type Router, type Session } from '@fraqjs/fraq';

import type { GitHubEventService } from '../service.js';
import { parseGitHubUrl } from '../targets.js';
import { run, truncate } from './utils.js';

interface RepositoryData {
  default_branch: string;
  description: string | null;
  forks_count: number;
  full_name: string;
  html_url: string;
  language: string | null;
  open_issues_count: number;
  stargazers_count: number;
  visibility: string;
}

interface IssueData {
  body?: string | null;
  html_url: string;
  labels?: Array<{ name?: string }>;
  number: number;
  pull_request?: unknown;
  state: string;
  title: string;
  user?: { login?: string };
}

interface ContentData {
  content?: string;
  download_url?: string | null;
  encoding?: string;
  html_url?: string;
  name?: string;
}

export function registerQueryCommands(router: Router, service: GitHubEventService, logger: Logger): void {
  registerRepositoryCommands(router, service, logger);
  registerSearchCommands(router, service, logger);
  registerIssueCommands(router, service, logger);
  registerContributionCommands(router, service, logger);
}

export function registerPreviewRoute(router: Router, service: GitHubEventService, logger: Logger): void {
  const target = param
    .greedy()
    .refine((value) =>
      /^(?:[\w.-]+\/[\w.-]+(?:#\d+)?|https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\/[^\s]*)?)$/i.test(value.trim()),
    );
  router
    .rawPattern()
    .arg('githubTarget', target)
    .execute((session, { githubTarget }) => run(session, logger, () => replyTarget(session, service, githubTarget)));
}

function registerRepositoryCommands(router: Router, service: GitHubEventService, logger: Logger): void {
  router
    .command('repo')
    .arg('repository', param.str())
    .execute((session, { repository }) => run(session, logger, () => replyRepository(session, service, repository)));
  router.command('repo').execute((session) => run(session, logger, () => replyRepository(session, service)));

  router
    .command('readme')
    .arg('repository', param.str())
    .execute((session, { repository }) => run(session, logger, () => replyReadme(session, service, repository)));
  router.command('readme').execute((session) => run(session, logger, () => replyReadme(session, service)));

  router
    .command('license')
    .arg('repository', param.str())
    .execute((session, { repository }) => run(session, logger, () => replyLicense(session, service, repository)));
  router.command('license').execute((session) => run(session, logger, () => replyLicense(session, service)));

  router
    .command('content')
    .arg('repository', param.str())
    .arg('path', param.greedy())
    .execute((session, { repository, path }) =>
      run(session, logger, async () => {
        const normalized = service.resolveRepository(session, repository);
        const data = await service.api.repositoryRequest<ContentData>(
          normalized,
          `/repos/${normalized}/contents/${path.replace(/^\//, '')}`,
        );
        await session.reply(formatContent(data, service.maxReplyLength()));
      }),
    );

  registerReleaseCommands(router, service, logger);

  router
    .command('deployments')
    .execute((session) =>
      run(session, logger, () => replyDeployments(session, service, service.resolveRepository(session))),
    );
  router
    .command('deployments')
    .alias('deployment')
    .arg('repository', param.str())
    .execute((session, { repository }) =>
      run(session, logger, () => replyDeployments(session, service, service.resolveRepository(session, repository))),
    );
}

function registerReleaseCommands(router: Router, service: GitHubEventService, logger: Logger): void {
  router
    .command('release')
    .execute((session) =>
      run(session, logger, () => replyRelease(session, service, service.resolveRepository(session))),
    );
  router
    .command('release')
    .arg('value', param.str())
    .execute((session, { value }) =>
      run(session, logger, async () => {
        const explicitRepository = value.includes('/') ? service.resolveRepository(session, value) : undefined;
        await replyRelease(
          session,
          service,
          explicitRepository ?? service.resolveRepository(session),
          explicitRepository ? undefined : value,
        );
      }),
    );
  router
    .command('release')
    .arg('repository', param.str())
    .arg('tag', param.str())
    .execute((session, { repository, tag }) =>
      run(session, logger, () => replyRelease(session, service, service.resolveRepository(session, repository), tag)),
    );
}

function registerSearchCommands(router: Router, service: GitHubEventService, logger: Logger): void {
  router
    .command('search')
    .alias('搜索')
    .arg('query', param.greedy())
    .execute((session, { query }) => run(session, logger, () => replySearch(session, service, 'repositories', query)));
  const search = router.group('search');
  for (const type of ['repositories', 'users', 'code'] as const) {
    const command = type === 'repositories' ? 'repo' : type === 'users' ? 'user' : 'code';
    search
      .command(command)
      .arg('query', param.greedy())
      .execute((session, { query }) => run(session, logger, () => replySearch(session, service, type, query)));
  }
}

async function replySearch(
  session: Session,
  service: GitHubEventService,
  type: 'repositories' | 'users' | 'code',
  query: string,
): Promise<void> {
  const data = await service.api.request<{ items: Array<Record<string, unknown>> }>(
    `/search/${type}?q=${encodeURIComponent(query)}&per_page=5`,
    { token: service.optionalUserToken(session) },
  );
  const lines = data.items.map((item) => formatSearchItem(type, item));
  await session.reply(lines.length > 0 ? lines.join('\n\n') : '没有找到结果');
}

function registerIssueCommands(router: Router, service: GitHubEventService, logger: Logger): void {
  router
    .command('view')
    .arg('target', param.greedy())
    .execute((session, { target }) => run(session, logger, () => replyTarget(session, service, target)));
  router.command('view').execute((session) =>
    run(session, logger, async () => {
      const issue = service.resolveIssue(session);
      await replyTarget(session, service, `${issue.repository}#${issue.number}`);
    }),
  );
  router
    .command('diff')
    .arg('target', param.greedy())
    .execute((session, { target }) =>
      run(session, logger, async () => {
        const issue = service.resolveIssue(session, target);
        const diff = await service.api.repositoryRequest<string>(
          issue.repository,
          `/repos/${issue.repository}/pulls/${issue.number}`,
          { accept: 'application/vnd.github.v3.diff' },
        );
        await session.reply(truncate(diff, service.maxReplyLength()));
      }),
    );
  router.command('diff').execute((session) =>
    run(session, logger, async () => {
      const issue = service.resolveIssue(session);
      const diff = await service.api.repositoryRequest<string>(
        issue.repository,
        `/repos/${issue.repository}/pulls/${issue.number}`,
        { accept: 'application/vnd.github.v3.diff' },
      );
      await session.reply(truncate(diff, service.maxReplyLength()));
    }),
  );
  router
    .command('link')
    .arg('target', param.greedy())
    .execute((session, { target }) =>
      run(session, logger, async () => {
        const issue = service.tryResolveIssue(session, target);
        if (issue) {
          const data = await getIssue(service, issue.repository, issue.number);
          await session.reply(data.html_url);
          return;
        }
        const repository = service.resolveRepository(session, target);
        await session.reply(service.webUrl(`/${repository}`));
      }),
    );
  router.command('link').execute((session) =>
    run(session, logger, async () => {
      const issue = service.tryResolveIssue(session);
      if (issue) {
        const data = await getIssue(service, issue.repository, issue.number);
        await session.reply(data.html_url);
        return;
      }
      await session.reply(service.webUrl(`/${service.resolveRepository(session)}`));
    }),
  );
}

function registerContributionCommands(router: Router, service: GitHubEventService, logger: Logger): void {
  router
    .command('contribution')
    .alias('contribute', 'contri', '贡献')
    .arg('user', param.str())
    .execute((session, { user }) => run(session, logger, () => replyContributions(session, service, user)));
  router.command('contribution').execute((session) =>
    run(session, logger, async () => {
      const user = await service.authorizedUser(session.raw.sender_id);
      if (!user) throw new Error('请提供 GitHub 用户名，或先执行 github auth');
      await replyContributions(session, service, user);
    }),
  );
}

async function replyRepository(session: Session, service: GitHubEventService, input?: string): Promise<void> {
  const repository = service.resolveRepository(session, input);
  const data = await service.api.repositoryRequest<RepositoryData>(repository, `/repos/${repository}`);
  await session.reply(
    `📦 ${data.full_name}\n${data.description ?? '暂无描述'}\n⭐ ${data.stargazers_count}  🍴 ${data.forks_count}  🗂️ ${data.open_issues_count}\n${data.language ?? '未知语言'} · ${data.visibility} · 默认分支 ${data.default_branch}\n${data.html_url}`,
  );
}

async function replyReadme(session: Session, service: GitHubEventService, input?: string): Promise<void> {
  const repository = service.resolveRepository(session, input);
  const data = await service.api.repositoryRequest<ContentData>(repository, `/repos/${repository}/readme`);
  await session.reply(`📖 ${repository} README\n${formatContent(data, service.maxReplyLength())}`);
}

async function replyLicense(session: Session, service: GitHubEventService, input?: string): Promise<void> {
  const repository = service.resolveRepository(session, input);
  const data = await service.api.repositoryRequest<ContentData & { license?: { name?: string } }>(
    repository,
    `/repos/${repository}/license`,
  );
  await session.reply(
    `📜 ${repository} · ${data.license?.name ?? '未知许可证'}\n${formatContent(data, service.maxReplyLength())}`,
  );
}

async function replyRelease(
  session: Session,
  service: GitHubEventService,
  repository: string,
  tag?: string,
): Promise<void> {
  const path = tag
    ? `/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`
    : `/repos/${repository}/releases/latest`;
  const release = await service.api.repositoryRequest<{
    body?: string | null;
    html_url: string;
    name?: string | null;
    published_at?: string;
    tag_name: string;
  }>(repository, path);
  const body = truncate(release.body ?? '没有 Release 说明', service.maxReplyLength() - 200);
  await session.reply(
    `🚀 ${release.name ?? release.tag_name}\n${release.published_at ?? ''}\n${body}\n${release.html_url}`,
  );
}

async function replyDeployments(session: Session, service: GitHubEventService, repository: string): Promise<void> {
  const deployments = await service.api.repositoryRequest<
    Array<{ created_at?: string; environment?: string; id: number; ref?: string; task?: string }>
  >(repository, `/repos/${repository}/deployments?per_page=10`);
  const lines = deployments.map(
    (deployment) =>
      `#${deployment.id} ${deployment.environment ?? deployment.task ?? 'deployment'} · ${deployment.ref ?? ''} · ${deployment.created_at ?? ''}`,
  );
  await session.reply(lines.length > 0 ? `🚚 ${repository} Deployments\n${lines.join('\n')}` : '暂无 Deployment');
}

async function replyTarget(session: Session, service: GitHubEventService, input: string): Promise<void> {
  const issue = parseIssueInput(service, session, input);
  if (issue) {
    const data = await getIssue(service, issue.repository, issue.number);
    const type = data.pull_request ? 'PR' : 'Issue';
    const labels = data.labels
      ?.map((label) => label.name)
      .filter(Boolean)
      .join(', ');
    await session.reply(
      `${type === 'PR' ? '🔀' : '🗂️'} [${issue.repository}] ${type} #${data.number} · ${data.state}\n${data.title}\n作者：${data.user?.login ?? '未知'}${labels ? `\n标签：${labels}` : ''}\n${truncate(data.body ?? '没有正文', service.maxReplyLength() - 300)}\n${data.html_url}`,
    );
    return;
  }

  const parsed = parseGitHubUrl(input);
  if (!parsed) throw new Error('无法识别 GitHub 仓库、Issue 或 Pull Request');
  if (parsed.kind === 'commit' && parsed.value) {
    const commit = await service.api.repositoryRequest<{
      commit?: { author?: { name?: string }; message?: string };
      html_url: string;
      sha: string;
    }>(parsed.repository, `/repos/${parsed.repository}/commits/${parsed.value}`);
    await session.reply(
      `📝 [${parsed.repository}] ${commit.sha.slice(0, 7)}\n${commit.commit?.message ?? ''}\n${commit.commit?.author?.name ?? ''}\n${commit.html_url}`,
    );
    return;
  }
  if (parsed.kind === 'releases' && parsed.value) {
    await replyRelease(session, service, parsed.repository, parsed.value);
    return;
  }
  await replyRepository(session, service, parsed.repository);
}

function parseIssueInput(service: GitHubEventService, session: Session, input: string) {
  try {
    return service.resolveIssue(session, input);
  } catch {
    return undefined;
  }
}

async function getIssue(service: GitHubEventService, repository: string, number: number): Promise<IssueData> {
  return service.api.repositoryRequest<IssueData>(repository, `/repos/${repository}/issues/${number}`);
}

function formatContent(data: ContentData, limit: number): string {
  const content =
    data.encoding === 'base64' && data.content
      ? Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8')
      : '';
  return `${truncate(content || '无法直接显示文件内容', limit)}${(data.html_url ?? data.download_url) ? `\n${data.html_url ?? data.download_url}` : ''}`;
}

function formatSearchItem(type: 'repositories' | 'users' | 'code', item: Record<string, unknown>): string {
  if (type === 'repositories') return `📦 ${item.full_name}\n${item.description ?? '暂无描述'}\n${item.html_url}`;
  if (type === 'users') return `👤 ${item.login}\n${item.html_url}`;
  const repository = item.repository as { full_name?: string } | undefined;
  return `📄 ${repository?.full_name ?? ''}/${item.path ?? item.name}\n${item.html_url}`;
}

async function replyContributions(session: Session, service: GitHubEventService, user: string): Promise<void> {
  const token = service.userToken(session, false);
  const data = await service.api.request<{
    data?: {
      user?: {
        contributionsCollection?: {
          contributionCalendar?: {
            totalContributions?: number;
            weeks?: Array<{ contributionDays?: Array<{ contributionLevel?: string }> }>;
          };
        };
      };
    };
  }>('/graphql', {
    token,
    body: {
      query:
        'query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{contributionLevel}}}}}}',
      variables: { login: user },
    },
  });
  const calendar = data.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new Error(`找不到 GitHub 用户 ${user}`);
  const symbols: Record<string, string> = {
    NONE: '·',
    FIRST_QUARTILE: '░',
    SECOND_QUARTILE: '▒',
    THIRD_QUARTILE: '▓',
    FOURTH_QUARTILE: '█',
  };
  const rows = Array.from({ length: 7 }, (_, day) =>
    (calendar.weeks ?? []).map((week) => symbols[week.contributionDays?.[day]?.contributionLevel ?? 'NONE']).join(''),
  );
  await session.reply(`🟩 ${user} 最近一年贡献：${calendar.totalContributions ?? 0}\n${rows.join('\n')}`);
}
