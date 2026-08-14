/**
 * 上游 @plannotator/pi-extension 分发的是原始 .ts 源文件，
 * 其内部 import 了大量未在 node_modules 中声明的 SDK 包，
 * 导致 TypeScript 递归检查时报 module-not-found 错误。
 *
 * 这个 .d.ts 和上游源文件共用一个 module 名，TypeScript 会选择
 * 声明文件而非解析实际源文件，从而阻断递归类型检查。
 *
 * 仅声明 simple-plannotator 实际使用的 API。
 */

declare module "@plannotator/pi-extension/plannotator-browser" {
  import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

  // ── 基础类型 ──────────────────────────────────────

  export type AnnotateMode =
    | "annotate"
    | "annotate-folder"
    | "annotate-last";

  export interface BrowserDecisionSession<T> {
    url: string;
    waitForDecision: () => Promise<T>;
    stop: () => void;
  }

  // ── 纯函数（无递归依赖） ──────────────────────────

  export function getLastAssistantMessageText(
    ctx: ExtensionContext,
  ): string | null;

  export function getStartupErrorMessage(err: unknown): string;

  export function hasPlanBrowserHtml(): boolean;
  export function hasReviewBrowserHtml(): boolean;

  // ── 浏览器 session 启动函数 ───────────────────────

  export function startCodeReviewBrowserSession(
    ctx: ExtensionContext,
    options?: {
      cwd?: string;
      defaultBranch?: string;
      diffType?: string;
      prUrl?: string;
      vcsType?: string;
      useLocal?: boolean;
    },
  ): Promise<
    BrowserDecisionSession<{
      approved: boolean;
      feedback?: string;
      annotations?: unknown[];
      agentSwitch?: string;
      exit?: boolean;
    }>
  >;

  export function startMarkdownAnnotationSession(
    ctx: ExtensionContext,
    filePath: string,
    markdown: string,
    mode: AnnotateMode,
    folderPath?: string,
    sourceInfo?: string,
    sourceConverted?: boolean,
    gate?: boolean,
    rawHtml?: string,
    renderHtml?: boolean,
    recentMessages?: {
      messageId: string;
      text: string;
      timestamp?: string;
    }[],
  ): Promise<
    BrowserDecisionSession<{
      feedback: string;
      exit?: boolean;
      approved?: boolean;
      selectedMessageId?: string;
      feedbackScope?: "message" | "messages";
    }>
  >;

  export function startLastMessageAnnotationSession(
    ctx: ExtensionContext,
    lastText: string,
    gate?: boolean,
    recentMessages?: {
      messageId: string;
      text: string;
      timestamp?: string;
    }[],
  ): Promise<
    BrowserDecisionSession<{
      feedback: string;
      exit?: boolean;
      approved?: boolean;
      selectedMessageId?: string;
      feedbackScope?: "message" | "messages";
    }>
  >;
}
