import type { GitHubWebhookPayload } from './types.js';

import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWebhookSignature(secret: string, body: string, signature: string | undefined): boolean {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function formatWebhookEvent(event: string, payload: GitHubWebhookPayload): string {
  const repository = payload.repository?.full_name ?? 'GitHub';
  const actor = payload.sender?.login ?? payload.pusher?.name ?? '未知用户';

  if (event === 'push') {
    const branch = payload.ref?.replace('refs/heads/', '') ?? '未知分支';
    return `📤 [${repository}] ${actor} 推送到 ${branch}\n${payload.head_commit?.message ?? '没有提交说明'}\n${payload.compare ?? payload.repository?.html_url ?? ''}`.trim();
  }
  if (event === 'issues' && payload.issue) {
    return `🗂️ [${repository}] Issue #${payload.issue.number} ${payload.action ?? '更新'}：${payload.issue.title ?? ''}\n${payload.issue.html_url ?? ''}`.trim();
  }
  if (event === 'issue_comment' && payload.issue) {
    return `💬 [${repository}] ${actor} 评论 Issue #${payload.issue.number}\n${payload.comment?.body?.slice(0, 300) ?? ''}\n${payload.comment?.html_url ?? payload.issue.html_url ?? ''}`.trim();
  }
  if (event === 'pull_request' && payload.pull_request) {
    const action = payload.pull_request.merged ? 'merged' : (payload.action ?? '更新');
    return `🔀 [${repository}] PR #${payload.pull_request.number} ${action}：${payload.pull_request.title ?? ''}\n${payload.pull_request.html_url ?? ''}`.trim();
  }
  if (event === 'pull_request_review' && payload.pull_request) {
    return `👀 [${repository}] ${actor} ${payload.review?.state ?? payload.action ?? 'reviewed'} PR #${payload.pull_request.number}\n${payload.review?.body?.slice(0, 300) ?? ''}\n${payload.review?.html_url ?? payload.pull_request.html_url ?? ''}`.trim();
  }
  if (event === 'release' && payload.release) {
    const name = payload.release.name ?? payload.release.tag_name ?? '';
    return `🚀 [${repository}] Release ${name} ${payload.action ?? ''}\n${payload.release.html_url ?? ''}`.trim();
  }
  if (event === 'workflow_run' && payload.workflow_run) {
    const result = payload.workflow_run.conclusion ?? payload.workflow_run.status ?? payload.action ?? '';
    return `⚙️ [${repository}] Workflow ${payload.workflow_run.name ?? ''}：${result}\n${payload.workflow_run.html_url ?? ''}`.trim();
  }
  if (event === 'star') {
    return `⭐ [${repository}] ${actor} ${payload.star?.starred_at ? '添加了 Star' : '取消了 Star'}\n${payload.repository?.html_url ?? ''}`.trim();
  }
  if (event === 'ping') return `✅ [${repository}] GitHub App Webhook 连接成功`;

  const action = payload.action ? ` ${payload.action}` : '';
  return `🔔 [${repository}] ${event}${action}，操作者：${actor}\n${payload.repository?.html_url ?? ''}`.trim();
}
