import { normalizeRepository } from './repository.js';

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

interface BindingData {
  groups: Record<string, string[]>;
}

export class BindingStore {
  private data: BindingData = { groups: {} };
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(initialBindings: Record<string, string[]> = {}): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Partial<BindingData>;
      if (parsed.groups && typeof parsed.groups === 'object') this.data.groups = parsed.groups;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }

    let changed = false;
    for (const [groupId, repositories] of Object.entries(initialBindings)) {
      for (const repository of repositories) {
        const normalized = repository === '*' ? '*' : normalizeRepository(repository);
        if (!normalized) throw new Error(`无效的初始仓库绑定：${repository}`);
        if (!this.data.groups[groupId]?.includes(normalized)) {
          this.data.groups[groupId] = [...(this.data.groups[groupId] ?? []), normalized];
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
      .filter(([, repositories]) => repositories.includes(normalized) || repositories.includes('*'))
      .map(([groupId]) => Number(groupId))
      .filter(Number.isSafeInteger);
  }

  async bind(groupId: number, repository: string): Promise<boolean> {
    const normalized = repository === '*' ? '*' : normalizeRepository(repository);
    if (!normalized) throw new Error('仓库格式必须为 owner/repo');
    const repositories = this.data.groups[String(groupId)] ?? [];
    if (repositories.includes(normalized)) return false;
    this.data.groups[String(groupId)] = [...repositories, normalized];
    await this.persist();
    return true;
  }

  async unbind(groupId: number, repository: string): Promise<boolean> {
    const normalized = repository === '*' ? '*' : normalizeRepository(repository);
    if (!normalized) throw new Error('仓库格式必须为 owner/repo');
    const repositories = this.data.groups[String(groupId)] ?? [];
    if (!repositories.includes(normalized)) return false;
    const next = repositories.filter((item) => item !== normalized);
    if (next.length) this.data.groups[String(groupId)] = next;
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
