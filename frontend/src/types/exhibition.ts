import type { ExhibitionStatus } from './enums';

/** 每件展品在本展览中的入展 / 撤展日期，使用 `YYYY-MM-DD`；两者皆空表示常设展品 */
export interface ExhibitionEntry {
  artifactId: string;
  entryDate?: string;
  removalDate?: string;
}

export interface Exhibition {
  id: string;
  title: string;
  intro: string;
  curator: string;
  entries: ExhibitionEntry[];
  themeColor: string;
  backgroundMusicUrl?: string;
  status: ExhibitionStatus;
  createdAt: string;
  updatedAt: string;
  /** @deprecated 旧数据字段，加载时会迁移为 entries */
  artifactIds?: string[];
}

export type ExhibitionDraft = Omit<Exhibition, 'id' | 'createdAt' | 'updatedAt'>;

/** 发布校验冲突类型 */
export type ExhibitionIssueCode = 'duplicate' | 'incomplete-date' | 'invalid-range' | 'schedule-collision';

export interface ExhibitionIssue {
  code: ExhibitionIssueCode;
  message: string;
}
