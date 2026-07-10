import type { Logger, MilkyClient, Session } from '@fraqjs/fraq';
import type { HonoService } from '@fraqjs/plugin-hono';

import { GitHubApi } from './github-api.js';
import { normalizeRepository } from './repository.js';
import { SubscriptionStore } from './subscriptions.js';
import { type IssueTarget, parseIssueTarget } from './targets.js';
import type { GitHubPluginOptions, GitHubWebhookPayload, SubscriptionRule } from './types.js';
import { formatWebhookEvent, verifyWebhookSignature } from './webhook.js';

import { randomUUID } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';

interface OAuthState {
  expiresAt: number;
  userId: number;
}

export class GitHubEventService {
  readonly api: GitHubApi;
  private readonly delivered = new Set<string>();
  private readonly oauthStates = new Map<string, OAuthState>();

  constructor(
    private readonly client: MilkyClient,
    private readonly logger: Logger,
    private readonly options: GitHubPluginOptions,
    private readonly subscriptions: SubscriptionStore,
  ) {
    this.api = new GitHubApi(options.app, options.apiBaseUrl, options.webBaseUrl, options.fetcher);
  }

  static async create(client: MilkyClient, logger: Logger, options: GitHubPluginOptions): Promise<GitHubEventService> {
    if (!options.app?.webhookSecret) throw new Error('必须配置 app.webhookSecret');
    const file = options.subscriptionsFile ?? 'data/fraq-plugin-github.json';
    const subscriptions = new SubscriptionStore(isAbsolute(file) ? file : resolve(process.cwd(), file));
    await subscriptions.load(options.initialSubscriptions);
    return new GitHubEventService(client, logger, options, subscriptions);
  }

  installRoutes(hono: HonoService): void {
    hono.app.post(this.options.app.webhookPath ?? '/github/app/webhook', async (context) => {
      const body = await context.req.text();
      const signature = context.req.header('x-hub-signature-256');
      if (!verifyWebhookSignature(this.options.app.webhookSecret, body, signature)) {
        return context.json({ error: 'Invalid signature' }, 401);
      }

      const deliveryId = context.req.header('x-github-delivery');
      if (deliveryId && this.delivered.has(deliveryId)) return context.json({ ok: true, duplicate: true });

      let payload: GitHubWebhookPayload;
      try {
        payload = JSON.parse(body) as GitHubWebhookPayload;
      } catch {
        return context.json({ error: 'Invalid JSON' }, 400);
      }

      if (deliveryId) this.rememberDelivery(deliveryId);
      await this.forward(context.req.header('x-github-event') ?? 'unknown', payload);
      return context.json({ ok: true });
    });

    hono.app.get('/github/auth', async (context) => {
      const code = context.req.query('code');
      const state = context.req.query('state');
      const pending = state ? this.oauthStates.get(state) : undefined;
      if (!code || !state || !pending || pending.expiresAt < Date.now()) {
        return context.html('<h1>GitHub 授权失败</h1><p>链接无效或已经过期，请回到 QQ 重新执行授权命令。</p>', 400);
      }

      this.oauthStates.delete(state);
      try {
        const token = await this.api.exchangeOAuthCode(code);
        const user = await this.api.request<{ login: string }>('/user', { token });
        await this.subscriptions.saveUser(pending.userId, token, user.login);
        return context.html(`<h1>授权成功</h1><p>GitHub 用户 ${escapeHtml(user.login)} 已绑定，可以关闭此页面。</p>`);
      } catch (error) {
        this.logger.error('GitHub OAuth 回调失败', error);
        return context.html('<h1>GitHub 授权失败</h1><p>请回到 QQ 后重试。</p>', 500);
      }
    });
  }

  isOperator(session: Session): boolean {
    if (this.options.adminUserIds?.includes(session.raw.sender_id)) return true;
    return session.raw.message_scene === 'group' && session.raw.group_member.role !== 'member';
  }

  boundRepository(session: Session): string | undefined {
    return session.raw.message_scene === 'group' ? this.subscriptions.boundRepository(session.raw.peer_id) : undefined;
  }

  resolveRepository(session: Session, input?: string): string {
    const explicit = input ? normalizeRepository(input) : undefined;
    if (explicit) return explicit;
    const bound = this.boundRepository(session);
    if (bound) return bound;
    const repositories =
      session.raw.message_scene === 'group' ? this.subscriptions.repositoriesFor(session.raw.peer_id) : [];
    if (repositories.length === 1) return repositories[0] as string;
    throw new Error('请提供 owner/repo，或先在群内绑定一个仓库');
  }

  resolveIssue(session: Session, input?: string): IssueTarget {
    const target = this.tryResolveIssue(session, input);
    if (!target) throw new Error('请使用 owner/repo#编号、GitHub Issue/PR 链接，或绑定仓库后提供编号');
    return target;
  }

  tryResolveIssue(session: Session, input?: string): IssueTarget | undefined {
    const fallback = this.boundRepository(session);
    const direct = input ? parseIssueTarget(input, fallback) : undefined;
    if (direct) return direct;
    for (const text of collectText(session.raw.segments)) {
      const target = parseIssueTarget(text, fallback);
      if (target) return target;
    }
    return undefined;
  }

  async bind(session: Session, input: string): Promise<{ changed: boolean; repository: string }> {
    const groupId = this.groupId(session);
    const repository = this.resolveRepository(session, input);
    return { changed: await this.subscriptions.bind(groupId, repository), repository };
  }

  async unbind(session: Session): Promise<boolean> {
    return this.subscriptions.unbind(this.groupId(session));
  }

  subscriptionsFor(session: Session): SubscriptionRule[] {
    return session.raw.message_scene === 'group' ? this.subscriptions.subscriptionsFor(session.raw.peer_id) : [];
  }

  async subscribe(
    session: Session,
    input: string,
    rules?: Array<Omit<SubscriptionRule, 'repository'>>,
  ): Promise<{ changed: boolean; repository: string }> {
    const groupId = this.groupId(session);
    const repository = this.resolveRepository(session, input);
    return { changed: await this.subscriptions.subscribe(groupId, repository, rules), repository };
  }

  async unsubscribe(
    session: Session,
    input: string,
    rules?: Array<Omit<SubscriptionRule, 'repository'>>,
  ): Promise<{ changed: boolean; repository: string }> {
    const groupId = this.groupId(session);
    const repository = this.resolveRepository(session, input);
    return { changed: await this.subscriptions.unsubscribe(groupId, repository, rules), repository };
  }

  beginAuthorization(userId: number): string {
    const state = randomUUID();
    this.oauthStates.set(state, { userId, expiresAt: Date.now() + 10 * 60_000 });
    return this.api.oauthUrl(state);
  }

  async authorizedUser(userId: number): Promise<string | undefined> {
    const saved = this.subscriptions.user(userId);
    if (!saved) return undefined;
    const user = await this.api.request<{ login: string }>('/user', { token: saved.token });
    if (saved.login !== user.login) await this.subscriptions.saveUser(userId, saved.token, user.login);
    return user.login;
  }

  userToken(session: Session, requirePermission = true): string {
    if (requirePermission && !this.isOperator(session)) {
      throw new Error('只有配置列表中的用户或群主、群管理员可以执行此操作');
    }
    const token = this.subscriptions.user(session.raw.sender_id)?.token;
    if (!token) throw new Error('此操作需要个人授权，请先执行 github auth');
    return token;
  }

  optionalUserToken(session: Session): string | undefined {
    return this.subscriptions.user(session.raw.sender_id)?.token;
  }

  async revokeAuthorization(userId: number): Promise<boolean> {
    const user = this.subscriptions.user(userId);
    if (!user) return false;
    await this.api.revokeOAuthToken(user.token);
    await this.subscriptions.removeUser(userId);
    return true;
  }

  maxReplyLength(): number {
    return this.options.maxReplyLength ?? 3500;
  }

  webUrl(path: string): string {
    return new URL(path, this.options.webBaseUrl ?? 'https://github.com').toString();
  }

  private groupId(session: Session): number {
    if (session.raw.message_scene !== 'group') throw new Error('此命令只能在群聊中使用');
    return session.raw.peer_id;
  }

  private rememberDelivery(deliveryId: string): void {
    this.delivered.add(deliveryId);
    if (this.delivered.size > 1000) this.delivered.delete(this.delivered.values().next().value as string);
  }

  private async forward(event: string, payload: GitHubWebhookPayload): Promise<void> {
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return entities[character] ?? character;
  });
}

function collectText(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectText);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'text' && typeof child === 'string' ? [child] : collectText(child),
  );
}
