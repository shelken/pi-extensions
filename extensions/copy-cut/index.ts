/**
 * alt+shift+x：剪切当前输入框文本到系统剪贴板。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { copyToClipboard } from "@earendil-works/pi-coding-agent";

export default function copyCutExtension(pi: ExtensionAPI): void {
  pi.registerShortcut("alt+shift+x", {
    description: "Cut editor text to clipboard",
    handler: async (ctx) => {
      const text = ctx.ui.getEditorText();
      if (!text) return;

      await copyToClipboard(text);
      ctx.ui.setEditorText("");
      ctx.ui.notify("Cut editor text", "info");
    },
  });
}
