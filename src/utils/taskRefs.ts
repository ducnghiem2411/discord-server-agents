/**
 * Parse task references from a description string.
 * Supports: task #123, task 123, #123, from task 123, task 1, 2
 * Returns unique, sorted task IDs (ascending).
 */
export function parseTaskRefs(description: string): number[] {
  const ids = new Set<number>();

  // task #123, task 123, #123
  const hashMatch = description.matchAll(/(?:task\s+)?#(\d+)/gi);
  for (const m of hashMatch) {
    ids.add(parseInt(m[1], 10));
  }

  // task 123 (without #)
  const taskNumMatch = description.matchAll(/\btask\s+(\d+)(?!\s*#)/gi);
  for (const m of taskNumMatch) {
    ids.add(parseInt(m[1], 10));
  }

  // from task 123
  const fromMatch = description.matchAll(/from\s+task\s+(\d+)/gi);
  for (const m of fromMatch) {
    ids.add(parseInt(m[1], 10));
  }

  // task id 123, plan id 123 (e.g. "Review plan id 2")
  const idMatch = description.matchAll(/(?:task|plan)\s+id\s+(\d+)/gi);
  for (const m of idMatch) {
    ids.add(parseInt(m[1], 10));
  }

  // task 1, 2 or task 1, 2, 3
  const listMatch = description.matchAll(/\btask\s+([\d,\s]+)/gi);
  for (const m of listMatch) {
    const nums = m[1].split(/[,\s]+/).map((s) => parseInt(s.trim(), 10));
    for (const n of nums) {
      if (!Number.isNaN(n)) ids.add(n);
    }
  }

  return [...ids].sort((a, b) => a - b);
}
