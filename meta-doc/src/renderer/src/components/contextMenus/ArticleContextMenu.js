// articleContextMenuItems.js
import { getSetting } from "../../utils/settings";

/**
 * @param {Object} options
 * @param {boolean} [options.isLatexEditor] - 是否为LaTeX编辑器
 * @returns {Promise<import("./types").ContextMenuItem[]>}
 */
export async function getArticleContextMenuItems(options = {}) {
  const { isLatexEditor = false } = options;
  const autoCompletion = await getSetting("autoCompletion");
  const knowledgeBase = await getSetting("enableKnowledgeBase");

  const autoCompletionToggle = autoCompletion
    ? { label: "contextMenu.closeAutoCompletion", value: "closeAutoCompletion" }
    : { label: "contextMenu.openAutoCompletion", value: "openAutoCompletion" };

  const knowledgeBaseToggle = knowledgeBase
    ? { label: "contextMenu.closeKnowledgeBase", value: "closeKnowledgeBase" }
    : { label: "contextMenu.openKnowledgeBase", value: "openKnowledgeBase" };

  const items = [
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

  // LaTeX编辑器特有：定位到PDF位置
  if (isLatexEditor) {
    items.push(
      { type: "divider" },
      { label: "contextMenu.locateToPdf", value: "locate-to-pdf" }
    );
  }

  return items;
}
