import { normalizeRepository } from './repository.js';
import type { SubscriptionRule } from './types.js';

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

interface GroupState {
  repository?: string;
  subscriptions: SubscriptionRule[];
}

interface UserState {
  login?: string;
  token: string;
}

interface StoredData {
  groups: Record<string, GroupState | string[]>;
  users?: Record<string, UserState>;
}

export class SubscriptionStore {
  private groups: Record<string, GroupState> = {};
  private users: Record<string, UserState> = {};
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(initialSubscriptions: Record<string, string[]> = {}): Promise<void> {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8')) as StoredData;
      for (const [groupId, value] of Object.entries(saved.groups ?? {})) {
        this.groups[groupId] = Array.isArray(value)
          ? { subscriptions: value.map((repository) => ({ repository, event: '*' })) }
          : { repository: value.repository, subscriptions: value.subscriptions ?? [] };
      }
      this.users = saved.users ?? {};
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }

    let changed = false;
    for (const [groupId, repositories] of Object.entries(initialSubscriptions)) {
      for (const repository of repositories) {
        const normalized = this.requireRepository(repository);
        changed = this.addRule(groupId, { repository: normalized, event: '*' }) || changed;
      }
    }
    if (changed) await this.persist();
  }

  boundRepository(groupId: number): string | undefined {
    return this.groups[String(groupId)]?.repository;
  }

  async bind(groupId: number, repository: string): Promise<boolean> {
    const normalized = this.requireRepository(repository);
    const group = this.group(String(groupId));
    if (group.repository === normalized) return false;
    group.repository = normalized;
    await this.persist();
    return true;
  }

  async unbind(groupId: number): Promise<boolean> {
    const group = this.groups[String(groupId)];
    if (!group?.repository) return false;
    delete group.repository;
    await this.persist();
    return true;
  }

  subscriptionsFor(groupId: number): SubscriptionRule[] {
    return (
      this.groups[String(groupId)]?.subscriptions.map((rule) => ({ ...rule, actions: [...(rule.actions ?? [])] })) ?? []
    );
  }

  repositoriesFor(groupId: number): string[] {
    return [...new Set(this.subscriptionsFor(groupId).map((rule) => rule.repository))];
  }

  groupsFor(repository: string, event = '*', action?: string): number[] {
    const normalized = normalizeRepository(repository);
    if (!normalized) return [];
    return Object.entries(this.groups)
      .filter(([, group]) =>
        group.subscriptions.some(
          (rule) =>
            rule.repository === normalized &&
            (rule.event === '*' || rule.event === event) &&
            (!rule.actions || (action !== undefined && rule.actions.includes(action))),
        ),
      )
      .map(([groupId]) => Number(groupId))
      .filter(Number.isSafeInteger);
  }

  async subscribe(
    groupId: number,
    repository: string,
    rules: Array<Omit<SubscriptionRule, 'repository'>> = [{ event: '*' }],
  ): Promise<boolean> {
    const normalized = this.requireRepository(repository);
    let changed = false;
    for (const rule of rules) {
      changed = this.addRule(String(groupId), { repository: normalized, ...rule }) || changed;
    }
    if (changed) await this.persist();
    return changed;
  }

  async unsubscribe(
    groupId: number,
    repository: string,
    rules?: Array<Omit<SubscriptionRule, 'repository'>>,
  ): Promise<boolean> {
    const normalized = this.requireRepository(repository);
    const group = this.groups[String(groupId)];
    if (!group) return false;
    const before = JSON.stringify(group.subscriptions);

    if (!rules?.length) {
      group.subscriptions = group.subscriptions.filter((rule) => rule.repository !== normalized);
    } else {
      for (const removed of rules) {
        group.subscriptions = group.subscriptions.flatMap((rule) => {
          if (rule.repository !== normalized || rule.event !== removed.event) return [rule];
          if (!removed.actions?.length || !rule.actions) return [];
          const actions = rule.actions.filter((action) => !removed.actions?.includes(action));
          return actions.length > 0 ? [{ ...rule, actions }] : [];
        });
      }
    }

    const changed = before !== JSON.stringify(group.subscriptions);
    if (changed) await this.persist();
    return changed;
  }

  user(userId: number): UserState | undefined {
    const user = this.users[String(userId)];
    return user ? { ...user } : undefined;
  }

  async saveUser(userId: number, token: string, login?: string): Promise<void> {
    this.users[String(userId)] = { token, login };
    await this.persist();
  }

  async removeUser(userId: number): Promise<boolean> {
    if (!this.users[String(userId)]) return false;
    delete this.users[String(userId)];
    await this.persist();
    return true;
  }

  private addRule(groupId: string, rule: SubscriptionRule): boolean {
    const group = this.group(groupId);
    const current = group.subscriptions.find(
      (item) => item.repository === rule.repository && item.event === rule.event,
    );
    if (!current) {
      group.subscriptions.push({ ...rule, actions: rule.actions ? [...new Set(rule.actions)] : undefined });
      return true;
    }
    if (!current.actions) return false;
    if (!rule.actions) {
      delete current.actions;
      return true;
    }
    const actions = [...new Set([...current.actions, ...rule.actions])];
    if (actions.length === current.actions.length) return false;
    current.actions = actions;
    return true;
  }

  private group(groupId: string): GroupState {
    this.groups[groupId] ??= { subscriptions: [] };
    return this.groups[groupId];
  }

  private requireRepository(repository: string): string {
    const normalized = normalizeRepository(repository);
    if (!normalized) throw new Error('仓库格式必须为 owner/repo');
    return normalized;
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(
        `${this.file}.tmp`,
        `${JSON.stringify({ groups: this.groups, users: this.users }, null, 2)}\n`,
        'utf8',
      );
      await rename(`${this.file}.tmp`, this.file);
    });
    await this.writeQueue;
  }
}
