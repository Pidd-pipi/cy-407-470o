<template>
  <section class="manage-page">
    <div class="page-head">
      <div>
        <h1>展览管理</h1>
        <p>创建展览、为每件展品填写入展 / 撤展日期、调整展线并发布到 3D 展厅。</p>
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
          @open="router.push(`/exhibitions/${$event}`)"
          @edit="selectExhibition"
        />
      </section>

      <section class="panel-surface editor-panel">
        <header>
          <h2>{{ isCreating ? '创建展览' : '编辑展览' }}</h2>
          <n-button v-if="selectedId" quaternary type="error" @click="deleteSelected">删除</n-button>
        </header>
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
              <n-tag :bordered="false" :type="draft.status === ExhibitionStatus.Published ? 'success' : 'warning'">
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

          <n-alert v-if="draftIssues.length > 0" :type="draft.status === ExhibitionStatus.Published ? 'error' : 'warning'" :show-icon="true" :title="alertTitle">
            <ul class="issue-list">
              <li v-for="(issue, index) in draftIssues" :key="index">{{ issue.message }}</li>
            </ul>
          </n-alert>

          <section class="picked-artifacts">
            <h3>已选展品预览</h3>
            <ArtifactCard
              v-for="(artifact, index) in pickedArtifacts"
              :key="`${artifact.id}-${index}`"
              :artifact="artifact"
              compact
              @open="router.push(`/artifacts/${$event}`)"
            />
          </section>
          <div class="form-actions">
            <n-button type="primary" @click="saveExhibition">
              {{ isCreating ? '创建' : draft.status === ExhibitionStatus.Published ? '保存' : '保存草稿' }}
            </n-button>
            <n-button
              v-if="selectedId && draft.status === ExhibitionStatus.Draft"
              type="primary"
              secondary
              @click="publishSelected"
            >
              发布
            </n-button>
            <n-button v-if="selectedId && draft.status === ExhibitionStatus.Published" secondary @click="unpublishSelected">
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
import type { Artifact, Exhibition, ExhibitionDraft, ExhibitionIssue } from '@/types';
import { ExhibitionStatus, exhibitionStatusLabels } from '@/types';

const router = useRouter();
const message = useMessage();
const artifactStore = useArtifactStore();
const exhibitionStore = useExhibitionStore();

const selectedId = ref(exhibitionStore.exhibitions[0]?.id ?? '');
const isCreating = ref(false);
const draft = reactive<ExhibitionDraft>(emptyDraft());

const selected = computed(() => exhibitionStore.getById(selectedId.value));
const pickedArtifacts = computed<Artifact[]>(() =>
  draft.entries
    .map((entry) => artifactStore.getById(entry.artifactId))
    .filter((artifact): artifact is Artifact => Boolean(artifact))
);

/** 用当前编辑中的草稿拼出一个临时展览用于校验（不落库） */
const draftAsExhibition = computed<Exhibition>(() => ({
  id: selectedId.value || '__draft__',
  createdAt: selected.value?.createdAt ?? '',
  updatedAt: selected.value?.updatedAt ?? '',
  title: draft.title,
  intro: draft.intro,
  curator: draft.curator,
  entries: draft.entries,
  themeColor: draft.themeColor,
  backgroundMusicUrl: draft.backgroundMusicUrl,
  status: draft.status
}));

const draftIssues = computed<ExhibitionIssue[]>(() =>
  exhibitionStore.evaluateExhibition(draftAsExhibition.value).issues
);

// 编辑区实时提示沿用同一组问题；发布被驳回或已发布展览保存被拦截时同样展示
const alertTitle = computed(() =>
  draft.status === ExhibitionStatus.Published
    ? '这些冲突会影响线上展览，保存前请先解决（线上版本暂未改动）'
    : '档期检查（草稿可先保存，发布前需解决）'
);

watch(
  selected,
  (value) => {
    if (!value || isCreating.value) return;
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
    entries: artifactStore.artifacts.map((artifact) => ({ artifactId: artifact.id })),
    themeColor: '#173f35',
    backgroundMusicUrl: '',
    status: ExhibitionStatus.Draft
  };
}

function startCreate() {
  isCreating.value = true;
  selectedId.value = '';
  Object.assign(draft, emptyDraft());
}

function selectExhibition(id: string) {
  isCreating.value = false;
  selectedId.value = id;
}

function draftPayload(): ExhibitionDraft {
  return {
    ...draft,
    entries: draft.entries.map((entry) => ({ ...entry })),
    backgroundMusicUrl: draft.backgroundMusicUrl || ''
  };
}

async function saveExhibition() {
  if (!draft.title.trim()) {
    message.warning('请填写展览标题');
    return;
  }
  const payload = draftPayload();
  // 草稿阶段允许预留冲突与不完整日期，直接保存
  if (isCreating.value) {
    const created = await exhibitionStore.createExhibition(payload);
    selectedId.value = created.id;
    isCreating.value = false;
    message.success('展览草稿已创建');
    return;
  }
  if (!selectedId.value) return;
  // 已发布展览的保存同样不能把冲突带到线上：拦截并保留线上版本，编辑器中实时列出冲突
  if (draft.status === ExhibitionStatus.Published) {
    const result = exhibitionStore.evaluateExhibition({
      ...(selected.value as Exhibition),
      ...payload
    });
    if (!result.ok) {
      message.error(`存在 ${result.issues.length} 项冲突，线上展览保持原样，详情见下方说明`);
      return;
    }
  }
  await exhibitionStore.updateExhibition(selectedId.value, payload);
  message.success('已保存');
}

async function publishSelected() {
  if (!selectedId.value) return;
  // 先把编辑区内容落为草稿（允许含冲突），再做发布校验；校验失败时线上版本与该草稿都保留
  await exhibitionStore.updateExhibition(selectedId.value, draftPayload());
  const result = await exhibitionStore.publishExhibition(selectedId.value);
  if (result.ok) {
    draft.status = ExhibitionStatus.Published;
    message.success('展览已发布');
    return;
  }
  message.error(`发布被驳回：共 ${result.issues.length} 项冲突，详情见下方说明`);
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

.issue-list {
  margin: 4px 0 0;
  padding-left: 18px;
  display: grid;
  gap: 4px;
  line-height: 1.5;
}

@media (max-width: 1080px) {
  .manage-grid,
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
