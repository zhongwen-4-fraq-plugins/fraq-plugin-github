export function normalizeRepository(input: string): string | undefined {
  const value = input
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .split(/[?#]/, 1)[0];
  const repository = value
    ?.split('/')
    .slice(0, 2)
    .join('/')
    .replace(/\.git$/i, '');
  return repository && /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository) ? repository.toLowerCase() : undefined;
}
