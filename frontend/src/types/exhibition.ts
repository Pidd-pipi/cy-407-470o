import type { ExhibitionStatus } from './enums';

export interface ExhibitionEntry {
  /** 行内唯一键，草稿阶段允许同一件展品出现多行 */
  key: string;
  artifactId: string;
  /** 入展日期，YYYY-MM-DD；空串表示尚未填写 */
  startDate: string;
  /** 撤展日期，YYYY-MM-DD；空串表示尚未填写 */
  endDate: string;
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
}

export type ExhibitionDraft = Omit<Exhibition, 'id' | 'createdAt' | 'updatedAt'>;
