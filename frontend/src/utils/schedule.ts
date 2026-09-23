import type { Exhibition, ExhibitionEntry, ExhibitionIssue } from '@/types';

/** 统一按本地零点解析日期，避免 ISO 时区偏移 */
function parseDate(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1).getTime();
}

export function hasSchedule(entry: Pick<ExhibitionEntry, 'entryDate' | 'removalDate'>): boolean {
  return Boolean(entry.entryDate || entry.removalDate);
}

/** 两件展品的档期是否在闭区间上重叠（同一天算重叠） */
export function rangesOverlap(
  a: Pick<ExhibitionEntry, 'entryDate' | 'removalDate'>,
  b: Pick<ExhibitionEntry, 'entryDate' | 'removalDate'>
): boolean {
  const startA = a.entryDate ? parseDate(a.entryDate) : -Infinity;
  const endA = a.removalDate ? parseDate(a.removalDate) : Infinity;
  const startB = b.entryDate ? parseDate(b.entryDate) : -Infinity;
  const endB = b.removalDate ? parseDate(b.removalDate) : Infinity;
  return startA <= endB && startB <= endA;
}

export function describeRange(entry: Pick<ExhibitionEntry, 'entryDate' | 'removalDate'>): string {
  if (entry.entryDate && entry.removalDate) return `${entry.entryDate} 至 ${entry.removalDate}`;
  if (entry.entryDate) return `${entry.entryDate} 起`;
  if (entry.removalDate) return `至 ${entry.removalDate}`;
  return '常设（无档期）';
}

/** 展览整体开放窗口：取所有展品档期的并集；含无档期（常设）展品则向该侧无限延伸 */
export function exhibitionWindow(exhibition: Exhibition): { start: number; end: number } {
  let start = Infinity;
  let end = -Infinity;
  exhibition.entries.forEach((entry) => {
    if (!hasSchedule(entry)) {
      start = -Infinity;
      end = Infinity;
      return;
    }
    if (entry.entryDate) start = Math.min(start, parseDate(entry.entryDate));
    if (entry.removalDate) end = Math.max(end, parseDate(entry.removalDate));
  });
  if (start === Infinity) start = -Infinity;
  if (end === -Infinity) end = Infinity;
  return { start, end };
}

/** 最早入展日期，用于未开放展览展示开放日期 */
export function exhibitionOpeningDate(exhibition: Exhibition): string | undefined {
  const dates = exhibition.entries.map((entry) => entry.entryDate).filter((value): value is string => Boolean(value));
  return dates.sort()[0];
}

/** 最晚撤展日期 */
export function exhibitionClosingDate(exhibition: Exhibition): string | undefined {
  const dates = exhibition.entries.map((entry) => entry.removalDate).filter((value): value is string => Boolean(value));
  return dates.length > 0 ? dates.sort()[dates.length - 1] : undefined;
}

/** 开放窗口文字：常设展 / 起讫区间 / 单侧开放 */
export function describeExhibitionWindow(exhibition: Exhibition): string {
  const opening = exhibitionOpeningDate(exhibition);
  const closing = exhibitionClosingDate(exhibition);
  const hasPermanent = exhibition.entries.some((entry) => !hasSchedule(entry));
  if (!opening && !closing) return '常设展';
  const range = opening && closing ? `${opening} 至 ${closing}` : opening ? `${opening} 起开放` : `展至 ${closing}`;
  return hasPermanent ? `常设展（轮换展品 ${range}）` : range;
}

/** 判断展览在指定日期（默认今天）是否开放：已发布且当天仍有在展展品；无档期的旧展览恒开放 */
export function isExhibitionOpen(exhibition: Exhibition, at: Date = new Date()): boolean {
  if (exhibition.status !== 'published') return false;
  const today = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const { start, end } = exhibitionWindow(exhibition);
  return today >= start && today <= end;
}

/** 取展览中某一天仍在展（已入展且未撤展）的展品，保持 entries 中的展线顺序 */
export function artifactsOnDate(exhibition: Exhibition, at: Date = new Date()): ExhibitionEntry[] {
  const today = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  return exhibition.entries.filter((entry) => {
    if (entry.entryDate && parseDate(entry.entryDate) > today) return false;
    if (entry.removalDate && parseDate(entry.removalDate) < today) return false;
    return true;
  });
}

/**
 * 发布前校验：同一展览内重复选品、日期未填完整、入展晚于撤展，
 * 以及与其它已发布展览之间的跨展览档期碰撞。
 */
export function validateForPublish(target: Exhibition, others: Exhibition[], artifactNames: Map<string, string>): ExhibitionIssue[] {
  const issues: ExhibitionIssue[] = [];
  const nameOf = (id: string) => artifactNames.get(id) ?? id;

  // 1. 同一展览内重复选到同一件作品
  const seen = new Map<string, number>();
  target.entries.forEach((entry) => seen.set(entry.artifactId, (seen.get(entry.artifactId) ?? 0) + 1));
  seen.forEach((count, artifactId) => {
    if (count > 1) {
      issues.push({
        code: 'duplicate',
        message: `作品「${nameOf(artifactId)}」在本展览中重复选择了 ${count} 次，请只保留一件。`
      });
    }
  });

  // 2. 日期未填完整 / 入展晚于撤展
  target.entries.forEach((entry) => {
    const name = nameOf(entry.artifactId);
    if ((entry.entryDate && !entry.removalDate) || (!entry.entryDate && entry.removalDate)) {
      issues.push({
        code: 'incomplete-date',
        message: `作品「${name}」的入展与撤展日期未填完整，请两项都填写（或都清空作为常设展品）。`
      });
    }
    if (entry.entryDate && entry.removalDate && parseDate(entry.entryDate) > parseDate(entry.removalDate)) {
      issues.push({
        code: 'invalid-range',
        message: `作品「${name}」的入展日期 ${entry.entryDate} 晚于撤展日期 ${entry.removalDate}，请调整档期。`
      });
    }
  });

  // 3. 跨展览档期碰撞（与其它已发布展览比较；草稿之间不互锁）
  const otherPublished = others.filter(
    (item) => item.id !== target.id && item.status === 'published'
  );
  target.entries.forEach((entry) => {
    // 日期不完整或区间倒置的条目无法可靠比较，跳过（前面已报错）
    if (!entry.entryDate || !entry.removalDate) return;
    if (parseDate(entry.entryDate) > parseDate(entry.removalDate)) return;
    otherPublished.forEach((other) => {
      const conflictEntry = other.entries.find((candidate) => {
        if (candidate.artifactId !== entry.artifactId) return false;
        // 对方该作品为常设展品（无档期）时，任何安排都会同时占用
        if (!hasSchedule(candidate)) return true;
        if (!candidate.entryDate || !candidate.removalDate) return false;
        if (parseDate(candidate.entryDate) > parseDate(candidate.removalDate)) return false;
        return rangesOverlap(entry, candidate);
      });
      if (conflictEntry) {
        issues.push({
          code: 'schedule-collision',
          message: `作品「${nameOf(entry.artifactId)}」与已发布展览「${other.title}」档期碰撞：本展 ${describeRange(
            entry
          )}，对方 ${describeRange(conflictEntry)}。`
        });
      }
    });
  });

  return issues;
}
