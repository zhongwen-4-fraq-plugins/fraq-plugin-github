import type { WebhookPayload } from './types.js';

import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWebhookSignature(secret: string, body: string, signature: string | undefined): boolean {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function formatWebhookEvent(event: string, payload: WebhookPayload): string {
  const repository = payload.repository?.full_name ?? payload.organization?.login ?? 'GitHub';
  const actor = payload.sender?.login ?? payload.pusher?.name ?? '未知用户';
  const action = payload.action ? ` ${payload.action}` : '';

  if (event === 'push') {
    return `📤 [${repository}] ${actor} 推送到 ${payload.ref?.replace('refs/heads/', '') ?? '未知分支'}\n${payload.head_commit?.message ?? '无提交说明'}\n${payload.compare ?? payload.repository?.html_url ?? ''}`.trim();
  }
  if (event === 'issues' && payload.issue) {
    return `🗂️ [${repository}] Issue #${payload.issue.number} ${payload.action ?? 'updated'}：${payload.issue.title}\n${payload.issue.html_url ?? ''}`.trim();
  }
  if (event === 'issue_comment' && payload.issue) {
    return `💬 [${repository}] ${actor} 评论 Issue #${payload.issue.number}\n${payload.comment?.body?.slice(0, 500) ?? ''}\n${payload.comment?.html_url ?? payload.issue.html_url ?? ''}`.trim();
  }
  if (event === 'pull_request' && payload.pull_request) {
    return `🔀 [${repository}] PR #${payload.pull_request.number} ${payload.action ?? 'updated'}：${payload.pull_request.title}\n${payload.pull_request.html_url ?? ''}`.trim();
  }
  if (event === 'release' && payload.release) {
    return `🚀 [${repository}] Release ${payload.release.name ?? payload.release.tag_name ?? ''} ${payload.action ?? ''}\n${payload.release.html_url ?? ''}`.trim();
  }
  if (event === 'workflow_run' && payload.workflow_run) {
    return `⚙️ [${repository}] Workflow ${payload.workflow_run.name ?? ''}：${payload.workflow_run.conclusion ?? payload.workflow_run.status ?? payload.action ?? ''}\n${payload.workflow_run.html_url ?? ''}`.trim();
  }
  if (event === 'fork' && payload.forkee) {
    return `🍴 [${repository}] ${actor} 创建了 Fork ${payload.forkee.full_name ?? ''}\n${payload.forkee.html_url ?? ''}`.trim();
  }
  if (event === 'star') {
    return `⭐ [${repository}] ${actor} ${payload.star?.starred_at ? '添加了 Star' : '取消了 Star'}\n${payload.repository?.html_url ?? ''}`.trim();
  }
  if (event === 'create' || event === 'delete') {
    return `🌿 [${repository}] ${actor} ${event === 'create' ? '创建' : '删除'}了 ${payload.ref_type ?? 'ref'} ${payload.ref ?? ''}`.trim();
  }
  if (event === 'ping') return `✅ [${repository}] GitHub Webhook 连接成功`;
  return `🔔 [${repository}] ${event}${action}，操作者：${actor}\n${payload.repository?.html_url ?? ''}`.trim();
}
