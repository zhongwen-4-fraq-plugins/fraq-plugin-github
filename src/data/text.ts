export function collectText(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectText);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'text' && typeof child === 'string' ? [child] : collectText(child),
  );
}

export function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}\n…内容已截断` : value;
}
