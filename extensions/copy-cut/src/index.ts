/**
 * alt+shift+x：剪切输入框文本到系统剪贴板。
 *
 * registerShortcut  alone 不够：pi-tui 对 alt+shift+字母无 legacy 编码。
 * 额外用 onTerminalInput 吃 Kitty / modifyOtherKeys / ESC+X / macOS ˛。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { copyToClipboard } from "@earendil-works/pi-coding-agent";

/** 原始终端字节是否触发 cut */
export function isCutInput(data: string): boolean {
  // Kitty CSI-u：x=120；mod 编码 1+bits（shift=1 alt=2）→ alt+shift=4
  if (/^\x1b\[120(?::\d*)*(?::\d*)?;4(?::\d+)?u$/.test(data)) return true;
  // xterm modifyOtherKeys
  if (data === "\x1b[27;4;120~") return true;
  // legacy meta：ESC + 大写 X
  if (data === "\x1bX") return true;
  // macOS Option 不当 Meta 时 Option+Shift+x
  if (data === "˛") return true;
  return false;
}

async function cut(ui: {
  getEditorText: () => string;
  setEditorText: (text: string) => void;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
}): Promise<void> {
  const text = ui.getEditorText();
  if (!text) return;
  await copyToClipboard(text);
  ui.setEditorText("");
  ui.notify("Cut editor text", "info");
}

export default function copyCutExtension(pi: ExtensionAPI): void {
  pi.registerShortcut("alt+shift+x", {
    description: "Cut editor text to clipboard",
    handler: async (ctx) => {
      await cut(ctx.ui);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI || !ctx.ui.onTerminalInput) return;

    ctx.ui.onTerminalInput((data) => {
      if (!isCutInput(data)) return;
      void cut(ctx.ui).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Cut failed: ${message}`, "error");
      });
      return { consume: true };
    });
  });
}
