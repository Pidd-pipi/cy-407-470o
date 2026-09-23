import { defineStore } from 'pinia';
import { exhibitionRepository } from '@/api/storage';
import { ExhibitionStatus, type Exhibition, type ExhibitionDraft, type ExhibitionEntry } from '@/types';
import { createId } from '@/utils/storage';
import { getExhibitionPhase, isOpenExhibition, validateSchedule, type ScheduleConflict } from '@/utils/schedule';
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

/** 兼容旧数据：把扁平 artifactIds 迁移成带档期的 entries（旧展无日期，按常设展开放） */
function migrateLegacy(record: Exhibition): Exhibition {
  if (Array.isArray(record.entries)) return record;
  const legacy = record as unknown as { artifactIds?: string[] };
  const legacyIds = legacy.artifactIds ?? [];
  return {
    ...record,
    entries: legacyIds.map((artifactId) => ({ key: createId('entry'), artifactId, startDate: '', endDate: '' }))
  };
}

export interface PublishResult {
  ok: boolean;
  conflicts: ScheduleConflict[];
}

export const useExhibitionStore = defineStore('exhibition', {
  state: () => ({
    exhibitions: [] as Exhibition[],
    loaded: false
  }),
  getters: {
    getById: (state) => (id: string) => state.exhibitions.find((exhibition) => exhibition.id === id),
    published: (state) => state.exhibitions.filter((exhibition) => exhibition.status === ExhibitionStatus.Published),
    /** 展厅当天可进入的已发布展览：常设展或当天处于档期内的轮换展 */
    openExhibitions: (state) => state.exhibitions.filter((exhibition) => isOpenExhibition(exhibition))
  },
  actions: {
    async load() {
      const records = await exhibitionRepository.list();
      if (records.length === 0) {
        const artifactStore = useArtifactStore();
        const seed = createSeedExhibition(
          artifactStore.artifacts.map((artifact) => ({ key: createId('entry'), artifactId: artifact.id, startDate: '', endDate: '' }))
        );
        await exhibitionRepository.save(seed);
        this.exhibitions = [seed];
      } else {
        this.exhibitions = records.map(migrateLegacy);
        if (records.some((record) => !Array.isArray(record.entries))) {
          await exhibitionRepository.saveMany(this.exhibitions);
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
    async reorderEntries(id: string, entries: ExhibitionEntry[]) {
      await this.updateExhibition(id, { entries });
    },
    /**
     * 发布：先校验同展重复、跨展览档期碰撞和日期完整性。
     * 校验失败时不写入任何内容，原草稿和线上展览保持不变，冲突随结果返回。
     */
    async publishExhibition(id: string, patch?: Partial<ExhibitionDraft>): Promise<PublishResult> {
      const current = this.getById(id);
      if (!current) return { ok: false, conflicts: [] };

      const candidate: Exhibition = { ...current, ...patch };
      const artifactStore = useArtifactStore();
      const others = this.exhibitions.filter(
        (exhibition) =>
          exhibition.id !== id &&
          exhibition.status === ExhibitionStatus.Published &&
          exhibition.entries.some((entry) => entry.startDate && entry.endDate)
      );
      const conflicts = validateSchedule({
        current: { id, entries: candidate.entries },
        others,
        artifactName: (artifactId) => artifactStore.getById(artifactId)?.name ?? artifactId
      });
      if (conflicts.length > 0) {
        return { ok: false, conflicts };
      }

      const updated: Exhibition = { ...candidate, status: ExhibitionStatus.Published, updatedAt: new Date().toISOString() };
      this.exhibitions = this.exhibitions.map((exhibition) => (exhibition.id === id ? updated : exhibition));
      await exhibitionRepository.save(updated);
      return { ok: true, conflicts: [] };
    },
    async unpublishExhibition(id: string) {
      await this.updateExhibition(id, { status: ExhibitionStatus.Draft });
    },
    phaseOf(id: string) {
      const exhibition = this.getById(id);
      return exhibition ? getExhibitionPhase(exhibition) : 'draft';
    }
  }
});
