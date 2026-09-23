<template>
  <section class="manage-page">
    <div class="page-head">
      <div>
        <h1>展览管理</h1>
        <p>为每件展品安排入展与撤展日期，草稿可以先预留冲突，发布时统一校验档期。</p>
      </div>
      <n-button type="primary" @click="startCreate">新建展览</n-button>
    </div>

    <div class="manage-grid">
      <section class="exhibition-list">
        <ExhibitionCard
          v-for="item in exhibitionStore.exhibitions"
          :key="item.id"
          :exhibition="item"
          :artifact-count="item.entries.length"
          @open="openExhibition(item.id)"
          @edit="selectExhibition"
        />
      </section>

      <section class="panel-surface editor-panel">
        <header>
          <h2>{{ isCreating ? '创建展览' : '编辑展览' }}</h2>
          <n-button v-if="selectedId" quaternary type="error" @click="deleteSelected">删除</n-button>
        </header>

        <n-alert v-if="publishConflicts.length > 0" type="error" title="发布失败，原草稿与线上展览均未改动">
          <ul class="conflict-list">
            <li v-for="(conflict, index) in publishConflicts" :key="index">{{ conflict.message }}</li>
          </ul>
        </n-alert>
        <n-alert v-else-if="draftConflicts.length > 0" type="warning" title="草稿存在预留冲突，发布前需要解决">
          <ul class="conflict-list">
            <li v-for="(conflict, index) in draftConflicts" :key="index">{{ conflict.message }}</li>
          </ul>
        </n-alert>

        <n-form label-placement="top" :show-feedback="false" class="form-stack">
          <n-form-item label="标题">
            <n-input v-model:value="draft.title" placeholder="展览标题" />
          </n-form-item>
          <n-form-item label="简介">
            <n-input v-model:value="draft.intro" type="textarea" :autosize="{ minRows: 3, maxRows: 6 }" />
          </n-form-item>
          <div class="field-grid">
            <n-form-item label="策展人">
              <n-input v-model:value="draft.curator" />
            </n-form-item>
            <n-form-item label="状态">
              <n-tag :bordered="false" :type="draft.status === ExhibitionStatus.Published ? 'success' : 'default'">
                {{ exhibitionStatusLabels[draft.status] }}
              </n-tag>
            </n-form-item>
          </div>
          <div class="field-grid">
            <n-form-item label="展厅主题色">
              <n-color-picker v-model:value="draft.themeColor" :show-alpha="false" />
            </n-form-item>
            <n-form-item label="背景音乐 URL">
              <n-input v-model:value="draft.backgroundMusicUrl" placeholder="可选" />
            </n-form-item>
          </div>
          <ArtifactPicker v-model="draft.entries" :artifacts="artifactStore.artifacts" />
          <section class="picked-artifacts">
            <h3>已选展品预览</h3>
            <ArtifactCard
              v-for="artifact in pickedArtifacts"
              :key="artifact.id"
              :artifact="artifact"
              compact
              @open="router.push(`/artifacts/${$event}`)"
            />
          </section>
          <div class="form-actions">
            <n-button type="primary" @click="saveExhibition">{{ saveLabel }}</n-button>
            <n-button v-if="selectedId && selected?.status === ExhibitionStatus.Draft" secondary @click="publishSelected">
              发布
            </n-button>
            <n-button v-if="selectedId && selected?.status === ExhibitionStatus.Published" secondary @click="unpublishSelected">
              撤回为草稿
            </n-button>
          </div>
        </n-form>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import ArtifactPicker from '@/components/editor/ArtifactPicker.vue';
import ArtifactCard from '@/components/common/ArtifactCard.vue';
import ExhibitionCard from '@/components/common/ExhibitionCard.vue';
import { useArtifactStore } from '@/stores/artifact';
import { useExhibitionStore } from '@/stores/exhibition';
import type { Artifact, ExhibitionDraft, ExhibitionEntry } from '@/types';
import { ExhibitionStatus, exhibitionStatusLabels } from '@/types';
import { validateSchedule, type ScheduleConflict } from '@/utils/schedule';

const router = useRouter();
const message = useMessage();
const artifactStore = useArtifactStore();
const exhibitionStore = useExhibitionStore();

const selectedId = ref(exhibitionStore.exhibitions[0]?.id ?? '');
const isCreating = ref(false);
const publishConflicts = ref<ScheduleConflict[]>([]);
const draft = reactive<ExhibitionDraft>(emptyDraft());

const selected = computed(() => exhibitionStore.getById(selectedId.value));
const pickedArtifacts = computed<Artifact[]>(() =>
  draft.entries.map((entry) => artifactStore.getById(entry.artifactId)).filter((artifact): artifact is Artifact => Boolean(artifact))
);

const saveLabel = computed(() => {
  if (isCreating.value) return '创建';
  return selected.value?.status === ExhibitionStatus.Published ? '更新线上展览' : '保存草稿';
});

function buildConflicts(entries: ExhibitionEntry[]): ScheduleConflict[] {
  const others = exhibitionStore.exhibitions.filter(
    (exhibition) =>
      exhibition.id !== selectedId.value &&
      exhibition.status === ExhibitionStatus.Published &&
      exhibition.entries.some((entry) => entry.startDate && entry.endDate)
  );
  return validateSchedule({
    current: { id: selectedId.value, entries },
    others,
    artifactName: (id) => artifactStore.getById(id)?.name ?? id
  });
}

/** 编辑草稿时实时提示（含跨展览碰撞），仅用于提醒，不阻止保存 */
const draftConflicts = computed(() => (isCreating.value ? [] : buildConflicts(draft.entries)));

watch(
  selected,
  (value) => {
    if (!value || isCreating.value) return;
    publishConflicts.value = [];
    Object.assign(draft, {
      title: value.title,
      intro: value.intro,
      curator: value.curator,
      entries: value.entries.map((entry) => ({ ...entry })),
      themeColor: value.themeColor,
      backgroundMusicUrl: value.backgroundMusicUrl ?? '',
      status: value.status
    });
  },
  { immediate: true }
);

function emptyDraft(): ExhibitionDraft {
  return {
    title: '',
    intro: '',
    curator: '',
    entries: artifactStore.artifacts.map((artifact) => ({
      key: `${artifact.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      artifactId: artifact.id,
      startDate: '',
      endDate: ''
    })),
    themeColor: '#173f35',
    backgroundMusicUrl: '',
    status: ExhibitionStatus.Draft
  };
}

function startCreate() {
  isCreating.value = true;
  selectedId.value = '';
  publishConflicts.value = [];
  Object.assign(draft, emptyDraft());
}

function selectExhibition(id: string) {
  isCreating.value = false;
  selectedId.value = id;
}

function openExhibition(id: string) {
  router.push(`/exhibitions/${id}`);
}

function draftPayload() {
  return { ...draft, entries: draft.entries.map((entry) => ({ ...entry })) };
}

async function saveExhibition() {
  if (!draft.title.trim()) {
    message.warning('请填写展览标题');
    return;
  }
  publishConflicts.value = [];
  if (isCreating.value) {
    const created = await exhibitionStore.createExhibition(draftPayload());
    selectedId.value = created.id;
    isCreating.value = false;
    message.success('展览草稿已创建');
    return;
  }
  if (selectedId.value) {
    // 已发布展览的任何改动都要重新过一遍发布校验：冲突则线上版本原样保留
    if (selected.value?.status === ExhibitionStatus.Published) {
      const result = await exhibitionStore.publishExhibition(selectedId.value, draftPayload());
      if (!result.ok) {
        publishConflicts.value = result.conflicts;
        message.error(`存在 ${result.conflicts.length} 项冲突，线上展览未改动`);
        return;
      }
      message.success('线上展览已更新');
      return;
    }
    await exhibitionStore.updateExhibition(selectedId.value, draftPayload());
    message.success('草稿已保存，线上展览未变更');
  }
}

async function publishSelected() {
  if (!selectedId.value) return;
  const result = await exhibitionStore.publishExhibition(selectedId.value, draftPayload());
  if (result.ok) {
    publishConflicts.value = [];
    message.success('展览已发布');
    return;
  }
  publishConflicts.value = result.conflicts;
  message.error(`存在 ${result.conflicts.length} 项冲突，未能发布`);
}

async function unpublishSelected() {
  if (!selectedId.value) return;
  await exhibitionStore.unpublishExhibition(selectedId.value);
  draft.status = ExhibitionStatus.Draft;
  message.success('已撤回为草稿');
}

async function deleteSelected() {
  if (!selectedId.value) return;
  await exhibitionStore.deleteExhibition(selectedId.value);
  selectedId.value = exhibitionStore.exhibitions[0]?.id ?? '';
  isCreating.value = !selectedId.value;
  publishConflicts.value = [];
  Object.assign(draft, selected.value ?? emptyDraft());
  message.success('展览已删除');
}
</script>

<style scoped>
.manage-page {
  display: grid;
  gap: 18px;
}

.manage-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(420px, 1.1fr);
  gap: 18px;
  align-items: start;
}

.exhibition-list {
  display: grid;
  gap: 14px;
}

.editor-panel {
  display: grid;
  gap: 16px;
  padding: 20px;
}

.editor-panel header,
.form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.conflict-list {
  margin: 0;
  padding-left: 18px;
}

.conflict-list li + li {
  margin-top: 4px;
}

.picked-artifacts {
  display: grid;
  gap: 10px;
}

.picked-artifacts h3 {
  margin: 0;
  font-size: 15px;
}

.editor-panel h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 30px;
}

.form-stack {
  display: grid;
  gap: 10px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 1080px) {
  .manage-grid,
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
