import { defineStore } from 'pinia';
import { exhibitionRepository } from '@/api/storage';
import { ExhibitionStatus, type Exhibition, type ExhibitionDraft, type ExhibitionEntry, type ExhibitionIssue } from '@/types';
import { createId } from '@/utils/storage';
import { artifactsOnDate, isExhibitionOpen, validateForPublish } from '@/utils/schedule';
import { useArtifactStore } from './artifact';

function createSeedExhibition(entries: ExhibitionEntry[]): Exhibition {
  const now = new Date().toISOString();
  return {
    id: 'exhibition-heritage-hall',
    title: '手作纹理常设展',
    intro: '围绕陶、绣、漆、竹四类工艺组织展陈，强调材料、手势和纹样的对照关系。',
    curator: '云上工艺馆',
    entries,
    themeColor: '#173f35',
    backgroundMusicUrl: '',
    status: ExhibitionStatus.Published,
    createdAt: now,
    updatedAt: now
  };
}

/** 兼容旧数据：把 artifactIds 迁移为不带档期的 entries（按常设展处理） */
function migrateExhibition(record: Exhibition): Exhibition {
  if (Array.isArray(record.entries)) return record;
  const legacyIds = Array.isArray(record.artifactIds) ? record.artifactIds : [];
  return {
    id: record.id,
    title: record.title,
    intro: record.intro,
    curator: record.curator,
    entries: legacyIds.map((artifactId) => ({ artifactId })),
    themeColor: record.themeColor,
    backgroundMusicUrl: record.backgroundMusicUrl,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export interface PublishResult {
  ok: boolean;
  issues: ExhibitionIssue[];
}

export const useExhibitionStore = defineStore('exhibition', {
  state: () => ({
    exhibitions: [] as Exhibition[],
    loaded: false
  }),
  getters: {
    getById: (state) => (id: string) => state.exhibitions.find((exhibition) => exhibition.id === id),
    published: (state) => state.exhibitions.filter((exhibition) => exhibition.status === ExhibitionStatus.Published),
    /** 当天仍在开放的已发布展览 */
    openExhibitions: (state) => state.exhibitions.filter((exhibition) => isExhibitionOpen(exhibition)),
    /** 当天在展的展品 id（按展线顺序） */
    openArtifactIds: () => (exhibition: Exhibition, at: Date = new Date()) =>
      artifactsOnDate(exhibition, at).map((entry) => entry.artifactId)
  },
  actions: {
    async load() {
      const records = await exhibitionRepository.list();
      if (records.length === 0) {
        const artifactStore = useArtifactStore();
        const seed = createSeedExhibition(
          artifactStore.artifacts.map((artifact) => ({ artifactId: artifact.id }))
        );
        await exhibitionRepository.save(seed);
        this.exhibitions = [seed];
      } else {
        const migrated = records.map(migrateExhibition);
        this.exhibitions = migrated;
        if (migrated.some((item, index) => item !== records[index])) {
          await exhibitionRepository.saveMany(migrated);
        }
      }
      this.loaded = true;
    },
    async createExhibition(draft: ExhibitionDraft) {
      const now = new Date().toISOString();
      const exhibition: Exhibition = {
        ...draft,
        id: createId('exhibition'),
        createdAt: now,
        updatedAt: now
      };
      this.exhibitions.unshift(exhibition);
      await exhibitionRepository.save(exhibition);
      return exhibition;
    },
    async updateExhibition(id: string, patch: Partial<ExhibitionDraft>) {
      const current = this.getById(id);
      if (!current) return;
      const updated: Exhibition = { ...current, ...patch, updatedAt: new Date().toISOString() };
      this.exhibitions = this.exhibitions.map((exhibition) => (exhibition.id === id ? updated : exhibition));
      await exhibitionRepository.save(updated);
    },
    async deleteExhibition(id: string) {
      this.exhibitions = this.exhibitions.filter((exhibition) => exhibition.id !== id);
      await exhibitionRepository.remove(id);
    },
    async reorderArtifacts(id: string, entries: ExhibitionEntry[]) {
      await this.updateExhibition(id, { entries });
    },
    /**
     * 发布前校验：存在重复选品、跨展览档期碰撞或日期不完整时，
     * 保留当前草稿与线上已发布版本，不做任何改动。
     */
    evaluateExhibition(exhibition: Exhibition): PublishResult {
      const artifactStore = useArtifactStore();
      const artifactNames = new Map(artifactStore.artifacts.map((artifact) => [artifact.id, artifact.name]));
      const issues = validateForPublish(exhibition, this.exhibitions, artifactNames);
      return { ok: issues.length === 0, issues };
    },
    evaluatePublish(id: string): PublishResult {
      const current = this.getById(id);
      if (!current) return { ok: false, issues: [] };
      return this.evaluateExhibition(current);
    },
    async publishExhibition(id: string): Promise<PublishResult> {
      const result = this.evaluatePublish(id);
      if (!result.ok) return result;
      await this.updateExhibition(id, { status: ExhibitionStatus.Published });
      return result;
    },
    async unpublishExhibition(id: string) {
      await this.updateExhibition(id, { status: ExhibitionStatus.Draft });
    }
  }
});
