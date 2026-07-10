import type { Disposable, Logger, MilkyClient, milky, Session } from '@fraqjs/fraq';
import type { HonoService } from '@fraqjs/plugin-hono';

import { BindingStore } from './bindings.js';
import { GitHubClient } from './github-client.js';
import { extractGitHubUrl, extractRepository, normalizeRepository, resolveGitHubUrl } from './repository.js';
import { ScreenshotService } from './screenshot.js';
import type { GitHubPluginOptions, RepositorySummary, WebhookPayload } from './types.js';
import { formatWebhookEvent, verifyWebhookSignature } from './webhook.js';

import { isAbsolute, resolve } from 'node:path';

export class GitHubService implements Disposable {
  readonly api: GitHubClient;
  private readonly bindings: BindingStore;
  private readonly screenshots: ScreenshotService;
  private readonly delivered = new Set<string>();

  constructor(
    private readonly client: MilkyClient,
    private readonly logger: Logger,
    private readonly options: GitHubPluginOptions,
    bindingsFile: string,
  ) {
    this.api = new GitHubClient(options.token, options.apiBaseUrl);
    this.bindings = new BindingStore(bindingsFile);
    this.screenshots = new ScreenshotService(options.screenshot);
  }

  static async create(client: MilkyClient, logger: Logger, options: GitHubPluginOptions): Promise<GitHubService> {
    const bindingsFile = options.bindingsFile ?? 'data/fraq-plugin-github.json';
    const service = new GitHubService(
      client,
      logger,
      options,
      isAbsolute(bindingsFile) ? bindingsFile : resolve(process.cwd(), bindingsFile),
    );
    await service.bindings.load(options.initialBindings);
    return service;
  }

  installWebhook(hono: HonoService): void {
    hono.app.post(this.options.webhook?.path ?? '/github/webhook', async (context) => {
      if (!this.options.webhook) return context.json({ error: 'GitHub webhook is not configured' }, 503);
      const body = await context.req.text();
      if (!verifyWebhookSignature(this.options.webhook.secret, body, context.req.header('x-hub-signature-256'))) {
        return context.json({ error: 'Invalid signature' }, 401);
      }
      const delivery = context.req.header('x-github-delivery');
      if (delivery && this.delivered.has(delivery)) return context.json({ ok: true, duplicate: true });
      if (delivery) {
        this.delivered.add(delivery);
        if (this.delivered.size > 1000) this.delivered.delete(this.delivered.values().next().value as string);
      }

      try {
        await this.forwardWebhook(
          context.req.header('x-github-event') ?? 'unknown',
          JSON.parse(body) as WebhookPayload,
        );
        return context.json({ ok: true });
      } catch (error) {
        this.logger.error('Failed to forward GitHub webhook', error);
        return context.json({ error: 'Webhook forwarding failed' }, 500);
      }
    });
  }

  isOperator(session: Session): boolean {
    if (this.options.adminUserIds?.includes(session.raw.sender_id)) return true;
    return (
      (this.options.allowGroupAdmins ?? true) &&
      session.raw.message_scene === 'group' &&
      session.raw.group_member.role !== 'member'
    );
  }

  async bind(session: Session, repository: string): Promise<boolean> {
    if (session.raw.message_scene !== 'group') throw new Error('只能在群聊中绑定仓库');
    return this.bindings.bind(session.raw.peer_id, repository);
  }

  async unbind(session: Session, repository: string): Promise<boolean> {
    if (session.raw.message_scene !== 'group') throw new Error('只能在群聊中解除仓库绑定');
    return this.bindings.unbind(session.raw.peer_id, repository);
  }

  repositories(session: Session): string[] {
    return session.raw.message_scene === 'group' ? this.bindings.repositoriesFor(session.raw.peer_id) : [];
  }

  resolveRepository(session: Session, input?: string, quotedSegments?: milky.IncomingSegment[]): string {
    let repository = input ? normalizeRepository(input) : undefined;
    repository ??= quotedSegments ? extractRepository(quotedSegments) : undefined;
    repository ??= extractRepository(session.raw.segments);
    const bound = this.repositories(session);
    repository ??= bound.length === 1 && bound[0] !== '*' ? bound[0] : undefined;
    if (!repository) {
      throw new Error(
        bound.length > 1
          ? '当前群绑定了多个仓库，请明确指定 owner/repo'
          : '请提供 owner/repo 或回复含 GitHub 链接的消息',
      );
    }
    return repository;
  }

  async repository(repository: string): Promise<RepositorySummary> {
    return this.api.repository(repository);
  }

  async readme(repository: string): Promise<string> {
    return this.api.readme(repository);
  }

  async screenshot(input: string): Promise<Buffer> {
    return this.screenshots.capture(resolveGitHubUrl(input, this.options.webBaseUrl ?? 'https://github.com'));
  }

  screenshotTargetFromReply(segments: milky.IncomingSegment[]): string {
    const target =
      extractGitHubUrl(segments, this.options.webBaseUrl ?? 'https://github.com') ?? extractRepository(segments);
    if (!target) throw new Error('回复消息中没有可识别的 GitHub 地址或 owner/repo');
    return target;
  }

  async subscribe(session: Session, repository: string): Promise<'created' | 'updated'> {
    if (!this.options.webhook?.publicUrl) throw new Error('未配置 webhook.publicUrl，无法向 GitHub 注册订阅');
    if (!this.options.token) throw new Error('未配置 GitHub Token，无法注册 Webhook');
    await this.bind(session, repository);
    const url = new URL(this.options.webhook.path ?? '/github/webhook', this.options.webhook.publicUrl).toString();
    return this.api.subscribeAllEvents(this.resolveRepository(session, repository), url, this.options.webhook.secret);
  }

  maxReplyLength(): number {
    return this.options.maxReplyLength ?? 3500;
  }

  async dispose(): Promise<void> {
    await this.screenshots.dispose();
  }

  private async forwardWebhook(event: string, payload: WebhookPayload): Promise<void> {
    const repository = payload.repository?.full_name;
    if (!repository) {
      this.logger.warn(`Ignored GitHub ${event} event without repository information`);
      return;
    }
    const message = formatWebhookEvent(event, payload);
    await Promise.all(
      this.bindings.groupsFor(repository).map(async (groupId) => {
        try {
          await this.client.send_group_message({
            group_id: groupId,
            message: [{ type: 'text', data: { text: message } }],
          });
        } catch (error) {
          this.logger.error(`Failed to send GitHub ${event} event to group ${groupId}`, error);
        }
      }),
    );
  }
}
