<template>
  <section class="artifact-picker">
    <header>
      <h3>展品与档期</h3>
      <small>勾选展品后用上下按钮调整展线；入展 / 撤展日期可暂不填写，发布前需补全或整行清空（按常设展品处理）。</small>
    </header>
    <div class="picker-list">
      <div v-for="artifact in orderedArtifacts" :key="artifact.id" class="picker-row" :class="{ selected: selectedSet.has(artifact.id) }">
        <div class="row-main">
          <n-checkbox :checked="selectedSet.has(artifact.id)" @update:checked="toggle(artifact.id, $event)">
            {{ artifact.name }}
          </n-checkbox>
          <span>{{ craftCategoryLabels[artifact.category] }}</span>
          <div class="row-actions">
            <n-button size="tiny" quaternary :disabled="!selectedSet.has(artifact.id)" @click="move(artifact.id, -1)">
              上移
            </n-button>
            <n-button size="tiny" quaternary :disabled="!selectedSet.has(artifact.id)" @click="move(artifact.id, 1)">
              下移
            </n-button>
          </div>
        </div>
        <div v-if="entryOf(artifact.id)" class="row-dates">
          <label>
            <span>入展日期</span>
            <n-date-picker
              :value="entryOf(artifact.id)?.entryDate ?? null"
              type="date"
              value-format="yyyy-MM-dd"
              placeholder="入展日期"
              clearable
              @update:value="updateDate(artifact.id, 'entryDate', $event)"
            />
          </label>
          <label>
            <span>撤展日期</span>
            <n-date-picker
              :value="entryOf(artifact.id)?.removalDate ?? null"
              type="date"
              value-format="yyyy-MM-dd"
              placeholder="撤展日期"
              clearable
              @update:value="updateDate(artifact.id, 'removalDate', $event)"
            />
          </label>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Artifact, ExhibitionEntry } from '@/types';
import { craftCategoryLabels } from '@/types';

const props = defineProps<{
  artifacts: Artifact[];
  modelValue: ExhibitionEntry[];
}>();

const emit = defineEmits<{
  'update:modelValue': [entries: ExhibitionEntry[]];
}>();

const selectedSet = computed(() => new Set(props.modelValue.map((entry) => entry.artifactId)));
const orderedArtifacts = computed(() => {
  const byId = new Map(props.artifacts.map((artifact) => [artifact.id, artifact]));
  const selected = props.modelValue
    .map((entry) => byId.get(entry.artifactId))
    .filter((artifact): artifact is Artifact => Boolean(artifact));
  const rest = props.artifacts.filter((artifact) => !selectedSet.value.has(artifact.id));
  return [...selected, ...rest];
});

function entryOf(id: string): ExhibitionEntry | undefined {
  return props.modelValue.find((entry) => entry.artifactId === id);
}

function toggle(id: string, checked: boolean) {
  if (checked) {
    emit('update:modelValue', [...props.modelValue, { artifactId: id }]);
    return;
  }
  emit('update:modelValue', props.modelValue.filter((entry) => entry.artifactId !== id));
}

function move(id: string, direction: -1 | 1) {
  const index = props.modelValue.findIndex((entry) => entry.artifactId === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= props.modelValue.length) return;
  const next = [...props.modelValue];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  emit('update:modelValue', next);
}

function updateDate(id: string, field: 'entryDate' | 'removalDate', value: string | null) {
  emit(
    'update:modelValue',
    props.modelValue.map((entry) =>
      entry.artifactId === id ? { ...entry, [field]: value ?? undefined } : entry
    )
  );
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
  gap: 10px;
  padding: 10px;
  background: rgba(250, 246, 236, 0.74);
  border: 1px solid rgba(23, 63, 53, 0.12);
  border-radius: 6px;
}

.picker-row.selected {
  border-color: rgba(23, 63, 53, 0.35);
}

.row-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
}

.row-main > span {
  color: var(--museum-brass);
  font-size: 12px;
  font-weight: 800;
}

.row-actions {
  display: flex;
  gap: 4px;
}

.row-dates {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.row-dates label {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: rgba(31, 46, 41, 0.72);
}

@media (max-width: 680px) {
  .row-main,
  .row-dates {
    grid-template-columns: 1fr;
  }
}
</style>
