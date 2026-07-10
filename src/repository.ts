import type { milky } from '@fraqjs/fraq';

export function normalizeRepository(input: string): string | undefined {
  let value = input.trim();
  try {
    const url = new URL(value);
    value = url.pathname;
  } catch {
    // The input may already be in owner/repository form.
  }

  const match = value.replace(/^\/+/, '').match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/|$)/);
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : undefined;
}

export function extractRepository(segments: milky.IncomingSegment[]): string | undefined {
  for (const segment of segments) {
    if (segment.type !== 'text') continue;
    for (const urlMatch of segment.data.text.matchAll(/https?:\/\/[^\s<>()]+/gi)) {
      const repository = normalizeRepository(urlMatch[0].replace(/[.,;!?]+$/, ''));
      if (repository) return repository;
    }
    const repoMatch = segment.data.text.match(/(?:^|\s)([\w.-]+\/[\w.-]+)(?:\s|$)/);
    if (repoMatch) return normalizeRepository(repoMatch[1]);
  }
  return undefined;
}

export function extractGitHubUrl(segments: milky.IncomingSegment[], webBaseUrl: string): string | undefined {
  for (const segment of segments) {
    if (segment.type !== 'text') continue;
    for (const match of segment.data.text.matchAll(/https?:\/\/[^\s<>()]+/gi)) {
      try {
        const url = new URL(match[0].replace(/[.,;!?]+$/, ''));
        if (url.host === new URL(webBaseUrl).host) return url.toString();
      } catch {
        // Ignore malformed URLs and continue looking in the message.
      }
    }
  }
  return undefined;
}

export function resolveGitHubUrl(input: string, webBaseUrl: string): string {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.host !== new URL(webBaseUrl).host) {
      throw new Error(`只允许截图 ${new URL(webBaseUrl).host} 网页`);
    }
    return url.toString();
  } catch (error) {
    const repository = normalizeRepository(input);
    if (repository) return `${webBaseUrl.replace(/\/$/, '')}/${repository}`;
    if (error instanceof Error && error.message.startsWith('只允许截图')) throw error;
    throw new Error('请提供 owner/repo 或完整的 GitHub HTTPS 地址');
  }
}
