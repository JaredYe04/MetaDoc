// articleContextMenuItems.js
import { getSetting } from "../../utils/settings";

/**
 * @returns {Promise<import("./types").ContextMenuItem[]>}
 */
export async function getArticleContextMenuItems() {
  const autoCompletion = await getSetting("autoCompletion");
  const knowledgeBase = await getSetting("enableKnowledgeBase");

  const autoCompletionToggle = autoCompletion
    ? { label: "contextMenu.closeAutoCompletion", value: "closeAutoCompletion" }
    : { label: "contextMenu.openAutoCompletion", value: "openAutoCompletion" };

  const knowledgeBaseToggle = knowledgeBase
    ? { label: "contextMenu.closeKnowledgeBase", value: "closeKnowledgeBase" }
    : { label: "contextMenu.openKnowledgeBase", value: "openKnowledgeBase" };

  return [
    { label: "contextMenu.cut", value: "cut" },
    { label: "contextMenu.copy", value: "copy" },
    { label: "contextMenu.paste", value: "paste" },
    { label: "contextMenu.selectAll", value: "selectAll" },
    { type: "divider" },
    autoCompletionToggle,
    knowledgeBaseToggle,
    { type: "divider" },
    { label: "contextMenu.aiAnalysis", value: "ai-assistant" },
  ];
}
