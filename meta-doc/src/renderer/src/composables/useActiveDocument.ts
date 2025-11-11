import { computed } from 'vue';
import { useWorkspace } from '../stores/workspace';

export const useActiveDocument = () => {
  const workspace = useWorkspace();
  const activeDocument = computed(() => workspace.activeDocument.value);
  const activeTab = computed(() => workspace.activeTab.value);

  return {
    workspace,
    activeDocument,
    activeTab,
  };
};

