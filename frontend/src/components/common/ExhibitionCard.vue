<template>
  <article class="exhibition-card" :style="{ '--theme': exhibition.themeColor }">
    <div class="status-line">
      <n-tag :bordered="false" size="small" :type="statusTagType">{{ statusText }}</n-tag>
      <strong>{{ artifactCount }} 件展品</strong>
    </div>
    <h3>{{ exhibition.title }}</h3>
    <p>{{ exhibition.intro }}</p>
    <div class="schedule-line">{{ windowText }}</div>
    <footer>
      <span>{{ exhibition.curator }}</span>
      <div>
        <n-button size="small" secondary @click="$emit('open', exhibition.id)">进入</n-button>
        <n-button size="small" quaternary @click="$emit('edit', exhibition.id)">编辑</n-button>
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Exhibition } from '@/types';
import { ExhibitionStatus, exhibitionStatusLabels } from '@/types';
import { describeExhibitionWindow, exhibitionOpeningDate, isExhibitionOpen } from '@/utils/schedule';

const props = defineProps<{
  exhibition: Exhibition;
  artifactCount: number;
}>();

defineEmits<{
  open: [id: string];
  edit: [id: string];
}>();

const windowText = computed(() => describeExhibitionWindow(props.exhibition));

const statusText = computed(() => {
  const label = exhibitionStatusLabels[props.exhibition.status];
  if (props.exhibition.status === ExhibitionStatus.Draft) return label;
  if (isExhibitionOpen(props.exhibition)) return `${label} · 今日开放`;
  const opening = exhibitionOpeningDate(props.exhibition);
  if (opening) return `${label} · ${opening} 开放`;
  return `${label} · 已撤展`;
});

const statusTagType = computed<'success' | 'warning' | 'default'>(() => {
  if (props.exhibition.status === ExhibitionStatus.Draft) return 'warning';
  return isExhibitionOpen(props.exhibition) ? 'success' : 'default';
});
</script>

<style scoped>
.exhibition-card {
  display: grid;
  gap: 14px;
  min-height: 220px;
  padding: 20px;
  background:
    linear-gradient(90deg, var(--theme), var(--theme)) 0 0 / 6px 100% no-repeat,
    #fbf5e8;
  border: 1px solid rgba(23, 63, 53, 0.14);
  border-radius: 8px;
}

.status-line,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.status-line {
  color: var(--museum-brass);
  font-size: 13px;
  font-weight: 800;
}

.schedule-line {
  color: rgba(31, 46, 41, 0.72);
  font-size: 13px;
}

h3 {
  margin: 0;
  color: var(--museum-ink);
  font-family: var(--font-display);
  font-size: 28px;
  line-height: 1.05;
}

p {
  margin: 0;
  color: rgba(31, 46, 41, 0.7);
  line-height: 1.65;
}

footer {
  align-self: end;
  color: rgba(31, 46, 41, 0.64);
  font-size: 13px;
}

footer div {
  display: flex;
  gap: 8px;
}
</style>
