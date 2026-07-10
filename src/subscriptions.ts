import { normalizeRepository } from './repository.js';

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

interface SubscriptionData {
  groups: Record<string, string[]>;
}

export class SubscriptionStore {
  private data: SubscriptionData = { groups: {} };
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(initialSubscriptions: Record<string, string[]> = {}): Promise<void> {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8')) as Partial<SubscriptionData>;
      if (saved.groups && typeof saved.groups === 'object') this.data.groups = saved.groups;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }

    let changed = false;
    for (const [groupId, repositories] of Object.entries(initialSubscriptions)) {
      for (const repository of repositories) {
        const normalized = normalizeRepository(repository);
        if (!normalized) throw new Error(`无效的初始仓库：${repository}`);
        const current = this.data.groups[groupId] ?? [];
        if (!current.includes(normalized)) {
          this.data.groups[groupId] = [...current, normalized];
          changed = true;
        }
      }
    }
    if (changed) await this.persist();
  }

  repositoriesFor(groupId: number): string[] {
    return [...(this.data.groups[String(groupId)] ?? [])];
  }

  groupsFor(repository: string): number[] {
    const normalized = normalizeRepository(repository);
    if (!normalized) return [];
    return Object.entries(this.data.groups)
      .filter(([, repositories]) => repositories.includes(normalized))
      .map(([groupId]) => Number(groupId))
      .filter(Number.isSafeInteger);
  }

  async subscribe(groupId: number, repository: string): Promise<boolean> {
    const normalized = normalizeRepository(repository);
    if (!normalized) throw new Error('仓库格式必须为 owner/repo');
    const current = this.data.groups[String(groupId)] ?? [];
    if (current.includes(normalized)) return false;
    this.data.groups[String(groupId)] = [...current, normalized];
    await this.persist();
    return true;
  }

  async unsubscribe(groupId: number, repository: string): Promise<boolean> {
    const normalized = normalizeRepository(repository);
    if (!normalized) throw new Error('仓库格式必须为 owner/repo');
    const current = this.data.groups[String(groupId)] ?? [];
    if (!current.includes(normalized)) return false;
    const next = current.filter((item) => item !== normalized);
    if (next.length > 0) this.data.groups[String(groupId)] = next;
    else delete this.data.groups[String(groupId)];
    await this.persist();
    return true;
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(`${this.file}.tmp`, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
      await rename(`${this.file}.tmp`, this.file);
    });
    await this.writeQueue;
  }
}
