// articleContextMenuItems.js
import { getSetting } from "../../utils/settings";

export async function getArticleContextMenuItems() {
  const autoCompletion = await getSetting("autoCompletion");
  const knowledgeBase = await getSetting("enableKnowledgeBase");

  return [
    { label: 'contextMenu.aiAnalysis', value: 'ai-assistant', disabledWhileRecording: true },
    { label: 'contextMenu.copy', value: 'copy', disabledWhileRecording: true },
    { label: 'contextMenu.paste', value: 'paste', disabledWhileRecording: true },
    autoCompletion
      ? { label: 'contextMenu.closeAutoCompletion', value: 'closeAutoCompletion', disabledWhileRecording: true }
      : { label: 'contextMenu.openAutoCompletion', value: 'openAutoCompletion', disabledWhileRecording: true },
    knowledgeBase
      ? { label: 'contextMenu.closeKnowledgeBase', value: 'closeKnowledgeBase', disabledWhileRecording: true }
      : { label: 'contextMenu.openKnowledgeBase', value: 'openKnowledgeBase', disabledWhileRecording: true }
  ];
}
