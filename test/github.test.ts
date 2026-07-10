import { Context, type milky, type Session } from '@fraqjs/fraq';
import { createMockMilkyClient, createRandomGroup, createRandomGroupMember } from '@fraqjs/mock';
import HonoPlugin, { HonoService } from '@fraqjs/plugin-hono';

import { BindingStore } from '../src/bindings.js';
import { GitHubClient } from '../src/github-client.js';
import GitHubPlugin from '../src/index.js';
import { extractRepository, normalizeRepository, resolveGitHubUrl } from '../src/repository.js';
import { formatWebhookEvent, verifyWebhookSignature } from '../src/webhook.js';

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('normalizes repositories from shorthand and GitHub URLs', () => {
  assert.equal(normalizeRepository('FraqJS/Fraq'), 'fraqjs/fraq');
  assert.equal(normalizeRepository('https://github.com/FraqJS/Fraq/issues/1'), 'fraqjs/fraq');
  assert.equal(normalizeRepository('invalid'), undefined);
  assert.equal(
    extractRepository([{ type: 'text', data: { text: '看看 https://github.com/fraqjs/fraq/pull/1' } }]),
    'fraqjs/fraq',
  );
});

test('only resolves screenshots on the configured GitHub host', () => {
  assert.equal(resolveGitHubUrl('fraqjs/fraq', 'https://github.com'), 'https://github.com/fraqjs/fraq');
  assert.equal(
    resolveGitHubUrl('https://github.com/fraqjs/fraq/issues', 'https://github.com'),
    'https://github.com/fraqjs/fraq/issues',
  );
  assert.throws(() => resolveGitHubUrl('https://example.com/private', 'https://github.com'), /只允许截图/);
});

test('persists group bindings and supports wildcard delivery', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fraq-plugin-github-'));
  const file = join(directory, 'bindings.json');
  try {
    const store = new BindingStore(file);
    await store.load({ '10001': ['FraqJS/Fraq'], '10002': ['*'] });
    assert.deepEqual(store.repositoriesFor(10001), ['fraqjs/fraq']);
    assert.deepEqual(store.groupsFor('fraqjs/fraq'), [10001, 10002]);
    assert.equal(await store.bind(10001, 'fraqjs/fraq'), false);
    assert.equal(await store.bind(10001, 'octocat/hello-world'), true);
    assert.equal(await store.unbind(10001, 'fraqjs/fraq'), true);
    assert.match(await readFile(file, 'utf8'), /octocat\/hello-world/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('verifies GitHub webhook signatures and formats known and unknown events', () => {
  const body = JSON.stringify({ repository: { full_name: 'fraqjs/fraq' } });
  const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
  assert.equal(verifyWebhookSignature('secret', body, signature), true);
  assert.equal(verifyWebhookSignature('wrong', body, signature), false);
  assert.match(
    formatWebhookEvent('issues', {
      action: 'opened',
      repository: { full_name: 'fraqjs/fraq' },
      issue: { number: 7, title: 'Test issue', html_url: 'https://github.com/fraqjs/fraq/issues/7' },
    }),
    /Issue #7 opened/,
  );
  assert.match(formatWebhookEvent('new_event', { repository: { full_name: 'fraqjs/fraq' } }), /new_event/);
});

test('registers an all-events webhook with the GitHub API', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    if (calls.length === 1) return new Response('[]', { headers: { 'content-type': 'application/json' } });
    return new Response('{"id":1}', { status: 201, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const client = new GitHubClient('token', 'https://api.github.com', fetcher);

  assert.equal(
    await client.subscribeAllEvents('fraqjs/fraq', 'https://bot.example.com/github/webhook', 'secret'),
    'created',
  );
  assert.equal(calls[1]?.input, 'https://api.github.com/repos/fraqjs/fraq/hooks');
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    name: 'web',
    active: true,
    events: ['*'],
    config: {
      url: 'https://bot.example.com/github/webhook',
      content_type: 'json',
      insecure_ssl: '0',
      secret: 'secret',
    },
  });
});

test('starts the plugin, dispatches commands, and forwards signed webhooks to a bound group', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fraq-plugin-github-integration-'));
  const client = createMockMilkyClient();
  const ctx = Context.fromClient(client);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    if (String(input).endsWith('/hooks?per_page=100')) {
      return new Response('[]', { headers: { 'content-type': 'application/json' } });
    }
    return new Response('{"id":1}', { status: 201, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  ctx.install(HonoPlugin, { host: '127.0.0.1', port: 0 });
  ctx.install(GitHubPlugin, {
    bindingsFile: join(directory, 'bindings.json'),
    initialBindings: { '20001': ['fraqjs/fraq'] },
    token: 'test-token',
    adminUserIds: [10001],
    webhook: { publicUrl: 'https://bot.example.com', secret: 'test-secret' },
  });

  let started = false;
  try {
    await ctx.start();
    started = true;
    const raw: milky.IncomingGroupMessage = {
      message_scene: 'group',
      peer_id: 20001,
      sender_id: 10001,
      message_seq: 1,
      time: 1,
      segments: [{ type: 'text', data: { text: 'github subscription list' } }],
      group: createRandomGroup(20001),
      group_member: createRandomGroupMember(20001, 10001),
    };
    const replies: Array<string | milky.OutgoingSegment_ZodInput[]> = [];
    const session: Session = {
      selfId: 99999,
      raw,
      async reply(message) {
        replies.push(message);
        return { messageSeq: 2 };
      },
      async reaction() {},
    };

    assert.equal(await ctx.router.dispatch(session, raw), true);
    assert.deepEqual(replies, ['本群 GitHub 订阅：\nfraqjs/fraq']);

    raw.segments = [{ type: 'text', data: { text: 'github subscription unsubscribe fraqjs/fraq' } }];
    replies.length = 0;
    assert.equal(await ctx.router.dispatch(session, raw), true);
    assert.deepEqual(replies, ['本群已取消订阅 fraqjs/fraq']);

    raw.segments = [{ type: 'text', data: { text: 'github subscription subscribe fraqjs/fraq' } }];
    replies.length = 0;
    assert.equal(await ctx.router.dispatch(session, raw), true);
    assert.deepEqual(replies, ['fraqjs/fraq 的全事件 Webhook 已创建并订阅到本群']);

    const body = JSON.stringify({
      action: 'opened',
      repository: { full_name: 'fraqjs/fraq', html_url: 'https://github.com/fraqjs/fraq' },
      issue: { number: 1, title: 'Test', html_url: 'https://github.com/fraqjs/fraq/issues/1' },
    });
    const response = await ctx.resolve(HonoService).app.request('/github/webhook', {
      method: 'POST',
      headers: {
        'x-github-event': 'issues',
        'x-github-delivery': 'test-delivery',
        'x-hub-signature-256': `sha256=${createHmac('sha256', 'test-secret').update(body).digest('hex')}`,
      },
      body,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(client.apiCalls.at(-1), {
      endpoint: 'send_group_message',
      params: {
        group_id: 20001,
        message: [
          {
            type: 'text',
            data: {
              text: '🗂️ [fraqjs/fraq] Issue #1 opened：Test\nhttps://github.com/fraqjs/fraq/issues/1',
            },
          },
        ],
      },
    });
  } finally {
    if (started) await ctx.stop();
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
