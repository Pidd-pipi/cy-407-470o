import { ExhibitionStatus, type Exhibition, type ExhibitionEntry } from '@/types';

export interface ScheduleConflict {
  type: 'duplicate' | 'missing-date' | 'invalid-range' | 'cross-overlap';
  message: string;
  entryKey?: string;
  otherKey?: string;
}

export interface ScheduleValidationContext {
  /** 当前正在校验的展览 */
  current: Pick<Exhibition, 'id' | 'entries'>;
  /** 用于跨展览碰撞校验的其他展览（通常为其余已发布档期展） */
  others?: Pick<Exhibition, 'id' | 'title' | 'entries'>[];
  /** 根据展品 id 查询名称 */
  artifactName: (id: string) => string;
}

/** 把 naive-ui 时间戳（或空值）格式化为 YYYY-MM-DD */
export function formatDateValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isDateString(value: string | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** 闭区间判断：[aStart, aEnd] 与 [bStart, bEnd] 是否有重叠 */
function rangesOverlap(a: ExhibitionEntry, b: ExhibitionEntry): boolean {
  return Boolean(a.startDate && a.endDate && b.startDate && b.endDate && a.startDate <= b.endDate && b.startDate <= a.endDate);
}

/**
 * 校验展览档期。
 * 草稿阶段可以先预留冲突：编辑页可用 describeSchedule 展示；
 * 发布时必须返回零冲突才允许上线。
 */
export function validateSchedule(context: ScheduleValidationContext): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const entries = context.current.entries;
  const seenArtifacts = new Map<string, ExhibitionEntry>();

  for (const entry of entries) {
    const name = context.artifactName(entry.artifactId);

    if (seenArtifacts.has(entry.artifactId)) {
      conflicts.push({
        type: 'duplicate',
        entryKey: entry.key,
        message: `《${name}》在本展览中被重复选择，请只保留一个档期。`
      });
    } else {
      seenArtifacts.set(entry.artifactId, entry);
    }

    if (!entry.startDate || !entry.endDate) {
      conflicts.push({
        type: 'missing-date',
        entryKey: entry.key,
        message: `《${name}》的入展、撤展日期未填写完整。`
      });
      continue;
    }

    if (!isDateString(entry.startDate) || !isDateString(entry.endDate) || entry.startDate > entry.endDate) {
      conflicts.push({
        type: 'invalid-range',
        entryKey: entry.key,
        message: `《${name}》的档期无效：入展日期不得晚于撤展日期。`
      });
      continue;
    }
  }

  for (const other of context.others ?? []) {
    for (const entry of entries) {
      if (!entry.startDate || !entry.endDate || entry.startDate > entry.endDate) continue;
      for (const otherEntry of other.entries) {
        if (otherEntry.artifactId !== entry.artifactId) continue;
        if (rangesOverlap(entry, otherEntry)) {
          const name = context.artifactName(entry.artifactId);
          conflicts.push({
            type: 'cross-overlap',
            entryKey: entry.key,
            otherKey: otherEntry.key,
            message: `《${name}》与「${other.title}」档期碰撞：${entry.startDate} 至 ${entry.endDate} 与 ${otherEntry.startDate} 至 ${otherEntry.endDate} 重叠。`
          });
        }
      }
    }
  }

  return conflicts;
}

/** 是否为有档期的轮换展（至少填了一条完整日期）；没有任何日期的旧展览按常设展处理 */
export function isScheduledExhibition(exhibition: Pick<Exhibition, 'entries'>): boolean {
  return exhibition.entries.some((entry) => Boolean(entry.startDate && entry.endDate));
}

export function completeEntries(exhibition: Pick<Exhibition, 'entries'>, date: string): ExhibitionEntry[] {
  return exhibition.entries.filter((entry) => Boolean(entry.startDate && entry.endDate && entry.startDate <= date && date <= entry.endDate));
}

export type ExhibitionPhase = 'permanent' | 'upcoming' | 'open' | 'ended' | 'draft';

/**
 * 计算展览在指定日期的开放状态：
 * - 草稿：展厅不可进入
 * - 无档期：常设展，长期开放
 * - 有档期：未开放 / 开放中 / 已撤展
 */
export function getExhibitionPhase(
  exhibition: Pick<Exhibition, 'status' | 'entries'>,
  date = formatDateValue(Date.now())
): ExhibitionPhase {
  if (exhibition.status !== ExhibitionStatus.Published) return 'draft';
  if (!isScheduledExhibition(exhibition)) return 'permanent';

  const active = completeEntries(exhibition, date);
  if (active.length > 0) return 'open';
  const starts = exhibition.entries
    .map((entry) => entry.startDate)
    .filter(isDateString)
    .sort();
  if (starts.some((start) => start > date)) return 'upcoming';
  return 'ended';
}

/** 展厅当天可以看到的已发布展览（常设展或当天开放的轮换展） */
export function isOpenExhibition(
  exhibition: Pick<Exhibition, 'status' | 'entries'>,
  date = formatDateValue(Date.now())
): boolean {
  const phase = getExhibitionPhase(exhibition, date);
  return phase === 'permanent' || phase === 'open';
}

/** 未开放轮换展的开放日期（最早入展日） */
export function getOpenDate(exhibition: Pick<Exhibition, 'entries'>): string | undefined {
  return exhibition.entries
    .map((entry) => entry.startDate)
    .filter(isDateString)
    .sort()[0];
}
