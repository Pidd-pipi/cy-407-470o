<template>
  <section class="artifact-picker">
    <header>
      <h3>展品档期</h3>
      <small>为每件展品填写入展、撤展日期；草稿阶段允许先保留冲突，发布时会统一校验。</small>
    </header>

    <div class="picker-list">
      <div v-for="(entry, index) in modelValue" :key="entry.key" class="picker-row">
        <div class="row-main">
          <n-select
            class="artifact-select"
            :value="entry.artifactId"
            :options="artifactOptions"
            filterable
            @update:value="updateEntry(index, { artifactId: $event })"
          />
          <div class="row-actions">
            <n-button size="tiny" quaternary :disabled="index === 0" @click="move(index, -1)">上移</n-button>
            <n-button size="tiny" quaternary :disabled="index === modelValue.length - 1" @click="move(index, 1)">
              下移
            </n-button>
            <n-button size="tiny" quaternary type="error" @click="remove(index)">移除</n-button>
          </div>
        </div>
        <div class="schedule-fields">
          <n-date-picker
            :value="toTimestamp(entry.startDate)"
            type="date"
            clearable
            placeholder="入展日期"
            @update:formatted-value="updateDate(index, 'startDate', $event)"
          />
          <span class="date-sep">至</span>
          <n-date-picker
            :value="toTimestamp(entry.endDate)"
            type="date"
            clearable
            placeholder="撤展日期"
            :is-date-disabled="(ts: number) => entry.startDate !== '' && formatDateValue(ts) < entry.startDate"
            @update:formatted-value="updateDate(index, 'endDate', $event)"
          />
        </div>
      </div>
    </div>

    <div class="picker-footer">
      <n-button dashed size="small" @click="addEntry">添加展品档期</n-button>
      <n-button quaternary size="small" @click="addAllArtifacts">从展品库全部加入</n-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Artifact, ExhibitionEntry } from '@/types';
import { createId } from '@/utils/storage';
import { formatDateValue } from '@/utils/schedule';

const props = defineProps<{
  artifacts: Artifact[];
  modelValue: ExhibitionEntry[];
}>();

const emit = defineEmits<{
  'update:modelValue': [entries: ExhibitionEntry[]];
}>();

const artifactOptions = computed(() =>
  props.artifacts.map((artifact) => ({ label: artifact.name, value: artifact.id }))
);

function emitEntries(entries: ExhibitionEntry[]) {
  emit('update:modelValue', entries);
}

function createEntry(artifactId: string): ExhibitionEntry {
  return { key: createId('entry'), artifactId, startDate: '', endDate: '' };
}

function addEntry() {
  const first = props.artifacts[0];
  if (!first) return;
  emitEntries([...props.modelValue, createEntry(first.id)]);
}

function addAllArtifacts() {
  const existing = new Set(props.modelValue.map((entry) => entry.artifactId));
  const appended = props.artifacts
    .filter((artifact) => !existing.has(artifact.id))
    .map((artifact) => createEntry(artifact.id));
  emitEntries([...props.modelValue, ...appended]);
}

function updateEntry(index: number, patch: Partial<ExhibitionEntry>) {
  emitEntries(props.modelValue.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
}

function updateDate(index: number, field: 'startDate' | 'endDate', value: string | null) {
  updateEntry(index, { [field]: value ?? '' } as Pick<ExhibitionEntry, 'startDate' | 'endDate'>);
}

function remove(index: number) {
  emitEntries(props.modelValue.filter((_, i) => i !== index));
}

function move(index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= props.modelValue.length) return;
  const next = [...props.modelValue];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  emitEntries(next);
}

function toTimestamp(date: string): number | null {
  return date ? new Date(`${date}T00:00:00`).getTime() : null;
}
</script>

<style scoped>
.artifact-picker {
  display: grid;
  gap: 12px;
}

header h3,
header small {
  margin: 0;
}

header small {
  color: rgba(31, 46, 41, 0.62);
}

.picker-list {
  display: grid;
  gap: 8px;
}

.picker-row {
  display: grid;
  gap: 8px;
  padding: 10px;
  background: rgba(250, 246, 236, 0.74);
  border: 1px solid rgba(23, 63, 53, 0.12);
  border-radius: 6px;
}

.row-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.row-actions {
  display: flex;
  gap: 4px;
}

.schedule-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.schedule-fields .n-date-picker {
  flex: 1 1 150px;
}

.date-sep {
  color: rgba(31, 46, 41, 0.62);
  font-size: 13px;
}

.picker-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

@media (max-width: 680px) {
  .row-main {
    grid-template-columns: 1fr;
  }
}
</style>
