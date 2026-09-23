<template>
  <section v-if="accessState === 'open' && exhibition" class="gallery-page">
    <div class="page-head">
      <div>
        <h1>{{ exhibition.title }}</h1>
        <p>{{ exhibition.intro }}</p>
      </div>
      <div class="gallery-actions">
        <n-tag :bordered="false" type="success">今日开放 · {{ windowText }}</n-tag>
        <n-tag :bordered="false">{{ exhibition.curator }}</n-tag>
        <n-button secondary @click="toggleTour">{{ isTouring ? '暂停导览' : '自动导览' }}</n-button>
      </div>
    </div>

    <SceneCanvas @ready="onSceneReady">
      <div class="scene-hint">
        <strong>拖拽旋转 / 滚轮缩放 / 点击展品</strong>
        <span v-if="activeNarration">{{ activeNarration }}</span>
      </div>
      <div class="artifact-strip">
        <button
          v-for="artifact in artifacts"
          :key="artifact.id"
          type="button"
          :class="{ active: artifact.id === selectedArtifactId }"
          @click="selectedArtifactId = artifact.id"
        >
          {{ artifact.name }}
        </button>
      </div>
      <ArtifactPanel
        :artifact="selectedArtifact"
        :annotations="selectedArtifact ? annotationStore.byArtifactId(selectedArtifact.id) : []"
        @close="selectedArtifactId = undefined"
      />
    </SceneCanvas>
  </section>

  <n-result
    v-else-if="exhibition"
    :status="closedNotice.status"
    :title="closedNotice.title"
    :description="closedNotice.description"
  >
    <template #footer>
      <n-space>
        <n-button type="primary" @click="router.push('/manage/exhibitions')">前往展览管理</n-button>
        <n-button v-if="otherOpenExhibition" secondary @click="router.push(`/exhibitions/${otherOpenExhibition.id}`)">
          进入今日开放的「{{ otherOpenExhibition.title }}」
        </n-button>
      </n-space>
    </template>
  </n-result>

  <n-result v-else status="404" title="展览不存在" description="请先在展览管理中创建或发布展览。">
    <template #footer>
      <n-button type="primary" @click="router.push('/manage/exhibitions')">前往展览管理</n-button>
    </template>
  </n-result>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as THREE from 'three';
import SceneCanvas from '@/components/common/SceneCanvas.vue';
import ArtifactPanel from '@/components/viewer/ArtifactPanel.vue';
import { useThreeScene } from '@/hooks/useThreeScene';
import { useAnnotationStore } from '@/stores/annotation';
import { useArtifactStore } from '@/stores/artifact';
import { useExhibitionStore } from '@/stores/exhibition';
import { useTourStore } from '@/stores/tour';
import type { Artifact, Exhibition, Tour, TourNode } from '@/types';
import { ExhibitionStatus } from '@/types';
import {
  artifactsOnDate,
  describeExhibitionWindow,
  exhibitionClosingDate,
  exhibitionOpeningDate,
  exhibitionWindow,
  isExhibitionOpen
} from '@/utils/schedule';
import { createGalleryHall, loadArtifactObject } from '@/utils/model-loader';
import { disposeObject3D } from '@/utils/renderer';
import { createTourPlayer, type TourPlayerControls } from '@/utils/tour-player';

const route = useRoute();
const router = useRouter();
const artifactStore = useArtifactStore();
const exhibitionStore = useExhibitionStore();
const annotationStore = useAnnotationStore();
const tourStore = useTourStore();

const containerRef = ref<HTMLElement | null>(null);
const selectedArtifactId = ref<string | undefined>();
const activeNarration = ref('');
const isTouring = ref(false);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const three = useThreeScene(containerRef, { cameraPosition: [5.5, 3.4, 8.2] });

let sceneRoot: THREE.Group | null = null;
let player: TourPlayerControls | null = null;

const routeExhibition = computed(() => exhibitionStore.getById(String(route.params.id ?? '')));
// 路由未指定有效展览时，落到当天开放的展览
const exhibition = computed<Exhibition | undefined>(
  () => routeExhibition.value ?? exhibitionStore.openExhibitions[0] ?? exhibitionStore.exhibitions[0]
);

const accessState = computed<'open' | 'draft' | 'upcoming' | 'ended'>(() => {
  const current = exhibition.value;
  if (!current || current.status !== ExhibitionStatus.Published) return 'draft';
  if (isExhibitionOpen(current)) return 'open';
  const today = new Date();
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const { start } = exhibitionWindow(current);
  return start > todayMs ? 'upcoming' : 'ended';
});

const otherOpenExhibition = computed(
  () => exhibitionStore.openExhibitions.find((item) => item.id !== exhibition.value?.id)
);

const closedNotice = computed(() => {
  const current = exhibition.value;
  if (!current) return { status: '404' as const, title: '展览不存在', description: '' };
  const opening = exhibitionOpeningDate(current);
  const closing = exhibitionClosingDate(current);
  if (current.status === ExhibitionStatus.Draft) {
    return {
      status: 'info' as const,
      title: '「' + current.title + '」尚未发布',
      description: '草稿展览不会进入展厅。请在展览管理中补全展品档期并通过发布检查。'
    };
  }
  if (accessState.value === 'upcoming') {
    return {
      status: 'info' as const,
      title: '「' + current.title + '」暂未开放',
      description: `展厅仅在开放当天进入该展览，开放日期：${opening ?? '未定'}。`
    };
  }
  return {
    status: 'warning' as const,
    title: '「' + current.title + '」已撤展',
    description: closing ? `该展览已于 ${closing} 结束撤展，展品不再出现在展厅路线中。` : '该展览没有在展档期，展品不再出现在展厅路线中。'
  };
});

const windowText = computed(() => (exhibition.value ? describeExhibitionWindow(exhibition.value) : ''));

/** 当天在展的展品：已入展且未撤展，保持展线顺序；已撤展作品不再进入路线 */
const artifacts = computed<Artifact[]>(() => {
  if (!exhibition.value || accessState.value !== 'open') return [];
  return artifactsOnDate(exhibition.value)
    .map((entry) => artifactStore.getById(entry.artifactId))
    .filter((artifact): artifact is Artifact => Boolean(artifact));
});

const selectedArtifact = computed(() => artifacts.value.find((artifact) => artifact.id === selectedArtifactId.value));

const activeTour = computed<Tour | undefined>(() => {
  if (!exhibition.value || accessState.value !== 'open') return undefined;
  const tour = tourStore.byExhibitionId(exhibition.value.id)[0];
  if (!tour) return undefined;
  // 只播放当天在展展品的导览节点
  const onDisplay = new Set(artifacts.value.map((artifact) => artifact.id));
  const nodes = tour.nodes.filter((node) => onDisplay.has(node.artifactId));
  return nodes.length > 0 ? { ...tour, nodes } : undefined;
});

const sceneKey = computed(() => `${three.ready.value}-${exhibition.value?.id}-${artifacts.value.map((item) => item.id).join('|')}`);

function onSceneReady(element: HTMLElement) {
  containerRef.value = element;
  element.addEventListener('click', handleSceneClick);
}

async function rebuildScene() {
  if (!three.ready.value || !three.scene.value || !exhibition.value || accessState.value !== 'open') return;
  if (sceneRoot) {
    three.scene.value.remove(sceneRoot);
    disposeObject3D(sceneRoot);
    sceneRoot = null;
  }

  const root = createGalleryHall(exhibition.value.themeColor);
  const spacing = 4.1;
  await Promise.all(
    artifacts.value.map(async (artifact, index) => {
      const object = await loadArtifactObject(artifact);
      object.position.set((index - (artifacts.value.length - 1) / 2) * spacing, 0, index % 2 === 0 ? -1.35 : 1.2);
      object.rotation.y = index % 2 === 0 ? 0.16 : -0.24;
      object.userData.artifactId = artifact.id;
      root.add(object);
    })
  );

  sceneRoot = root;
  three.scene.value.add(root);
  if (!selectedArtifactId.value || !artifacts.value.some((artifact) => artifact.id === selectedArtifactId.value)) {
    selectedArtifactId.value = artifacts.value[0]?.id;
  }
  three.render();
}

function findArtifactId(object: THREE.Object3D | null): string | undefined {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (typeof current.userData.artifactId === 'string') return current.userData.artifactId;
    current = current.parent;
  }
  return undefined;
}

function handleSceneClick(event: MouseEvent) {
  if (!three.camera.value || !sceneRoot || !three.renderer.value) return;
  const rect = three.renderer.value.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, three.camera.value);
  const hit = raycaster.intersectObjects(sceneRoot.children, true)[0];
  const artifactId = findArtifactId(hit?.object ?? null);
  if (artifactId) {
    selectedArtifactId.value = artifactId;
  }
}

function toggleTour() {
  if (isTouring.value) {
    player?.pause();
    isTouring.value = false;
    return;
  }
  if (!three.camera.value || !three.controls.value || !activeTour.value) return;
  player?.stop();
  const nodes: TourNode[] = activeTour.value.nodes;
  player = createTourPlayer(three.camera.value, three.controls.value, nodes, (node) => {
    selectedArtifactId.value = node.artifactId;
    activeNarration.value = node.narration;
  });
  player.play();
  isTouring.value = true;
}

watch(sceneKey, () => void rebuildScene(), { immediate: true });

onBeforeUnmount(() => {
  player?.stop();
  if (containerRef.value) {
    containerRef.value.removeEventListener('click', handleSceneClick);
  }
});
</script>

<style scoped>
.gallery-page {
  display: grid;
  gap: 18px;
}

.gallery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.scene-hint {
  position: absolute;
  top: 16px;
  left: 16px;
  display: grid;
  max-width: min(440px, calc(100% - 32px));
  gap: 4px;
  padding: 10px 12px;
  color: var(--museum-ink);
  background: rgba(251, 245, 232, 0.88);
  border: 1px solid rgba(23, 63, 53, 0.14);
  border-radius: 8px;
}

.scene-hint strong {
  font-size: 13px;
}

.scene-hint span {
  color: rgba(31, 46, 41, 0.68);
  font-size: 13px;
  line-height: 1.45;
}

.artifact-strip {
  position: absolute;
  right: 20px;
  bottom: 20px;
  left: 20px;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.artifact-strip button {
  flex: 0 0 auto;
  padding: 9px 12px;
  color: var(--museum-ink);
  background: rgba(251, 245, 232, 0.88);
  border: 1px solid rgba(23, 63, 53, 0.14);
  border-radius: 999px;
  cursor: pointer;
}

.artifact-strip button.active {
  color: #fbf5e8;
  background: var(--museum-green);
}
</style>
