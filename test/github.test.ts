import { Context, type milky, type Session } from '@fraqjs/fraq';
import { createMockMilkyClient, createRandomGroup, createRandomGroupMember } from '@fraqjs/mock';
import HonoPlugin, { HonoService } from '@fraqjs/plugin-hono';

import GitHubPlugin from '../src/index.js';
import { normalizeRepository } from '../src/repository.js';
import { SubscriptionStore } from '../src/subscriptions.js';
import { formatWebhookEvent, verifyWebhookSignature } from '../src/webhook.js';

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('规范化 GitHub 仓库地址', () => {
  assert.equal(normalizeRepository('FraqJS/Fraq'), 'fraqjs/fraq');
  assert.equal(normalizeRepository('https://github.com/FraqJS/Fraq/issues/1'), 'fraqjs/fraq');
  assert.equal(normalizeRepository('invalid'), undefined);
});

test('持久化 QQ 群的仓库订阅', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fraq-plugin-github-'));
  const file = join(directory, 'subscriptions.json');
  try {
    const store = new SubscriptionStore(file);
    await store.load({ '10001': ['FraqJS/Fraq'] });
    assert.deepEqual(store.repositoriesFor(10001), ['fraqjs/fraq']);
    assert.deepEqual(store.groupsFor('fraqjs/fraq'), [10001]);
    assert.equal(await store.subscribe(10001, 'fraqjs/fraq'), false);
    assert.equal(await store.subscribe(10002, 'fraqjs/fraq'), true);
    assert.match(await readFile(file, 'utf8'), /"10002"/);
    assert.equal(await store.unsubscribe(10001, 'fraqjs/fraq'), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('校验 GitHub App 签名并格式化事件', () => {
  const body = JSON.stringify({ repository: { full_name: 'fraqjs/fraq' } });
  const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
  assert.equal(verifyWebhookSignature('secret', body, signature), true);
  assert.equal(verifyWebhookSignature('wrong', body, signature), false);
  assert.match(
    formatWebhookEvent('issues', {
      action: 'opened',
      repository: { full_name: 'fraqjs/fraq' },
      issue: { number: 7, title: '测试', html_url: 'https://github.com/fraqjs/fraq/issues/7' },
    }),
    /Issue #7 opened/,
  );
});

test('通过 GitHub App Webhook 向订阅群转发事件', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fraq-plugin-github-integration-'));
  const client = createMockMilkyClient();
  const ctx = Context.fromClient(client);
  ctx.install(HonoPlugin, { host: '127.0.0.1', port: 0 });
  ctx.install(GitHubPlugin, {
    app: { webhookSecret: 'test-secret' },
    subscriptionsFile: join(directory, 'subscriptions.json'),
    adminUserIds: [10001],
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
      segments: [{ type: 'text', data: { text: 'github subscribe fraqjs/fraq' } }],
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
    assert.deepEqual(replies, ['已订阅 fraqjs/fraq 的 GitHub App 事件']);

    const body = JSON.stringify({
      action: 'opened',
      repository: { full_name: 'fraqjs/fraq' },
      issue: { number: 1, title: '测试 Issue', html_url: 'https://github.com/fraqjs/fraq/issues/1' },
    });
    const headers = {
      'x-github-event': 'issues',
      'x-github-delivery': 'delivery-1',
      'x-hub-signature-256': `sha256=${createHmac('sha256', 'test-secret').update(body).digest('hex')}`,
    };
    const app = ctx.resolve(HonoService).app;
    const response = await app.request('/github/app/webhook', { method: 'POST', headers, body });
    assert.equal(response.status, 200);
    assert.deepEqual(client.apiCalls.at(-1), {
      endpoint: 'send_group_message',
      params: {
        group_id: 20001,
        message: [
          {
            type: 'text',
            data: {
              text: '🗂️ [fraqjs/fraq] Issue #1 opened：测试 Issue\nhttps://github.com/fraqjs/fraq/issues/1',
            },
          },
        ],
      },
    });

    const callCount = client.apiCalls.length;
    const duplicate = await app.request('/github/app/webhook', { method: 'POST', headers, body });
    assert.deepEqual(await duplicate.json(), { ok: true, duplicate: true });
    assert.equal(client.apiCalls.length, callCount);

    const rejected = await app.request('/github/app/webhook', {
      method: 'POST',
      headers: { ...headers, 'x-hub-signature-256': 'sha256=invalid' },
      body,
    });
    assert.equal(rejected.status, 401);
  } finally {
    if (started) await ctx.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
