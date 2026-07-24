import type { IssueTarget } from '../models/index.js';
import { normalizeRepository } from './repositories.js';

export function parseIssueTarget(input: string, fallbackRepository?: string): IssueTarget | undefined {
  const value = input.trim();
  const url = value.match(/https?:\/\/github\.com\/([^/]+\/[^/]+)\/(?:issues|pull)\/(\d+)/i);
  const shorthand = value.match(/^([^/\s]+\/[^#\s]+)#(\d+)$/);
  const local = value.match(/^#?(\d+)$/);
  const repository = normalizeRepository(url?.[1] ?? shorthand?.[1] ?? fallbackRepository ?? '');
  const number = Number(url?.[2] ?? shorthand?.[2] ?? local?.[1]);
  return repository && Number.isSafeInteger(number) && number > 0 ? { repository, number } : undefined;
}

export function parseGitHubUrl(input: string): { repository: string; kind?: string; value?: string } | undefined {
  const matched = input.trim().match(/https?:\/\/github\.com\/([^/]+\/[^/]+)(?:\/([^/]+)(?:\/([^/?#]+))?)?/i);
  const repository = normalizeRepository(matched?.[1] ?? input);
  return repository ? { repository, kind: matched?.[2], value: matched?.[3] } : undefined;
}
