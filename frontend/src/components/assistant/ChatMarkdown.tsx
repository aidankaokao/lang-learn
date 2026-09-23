import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { TOKEN_RE, useSmoothText } from "@/hooks/useSmoothText";

// ── rehype 外掛：把文字切成一個個淡入的 span ─────────────
// 只需要 hast 的一小部分結構，自己定義，免得直接依賴 @types/hast。
type HastText = { type: "text"; value: string };
type HastElement = {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
};
type HastNode = HastText | HastElement | { type: string; children?: HastNode[] };

// 程式碼區塊逐字淡入很吵，而且會打斷等寬排版
const SKIP_TAGS = new Set(["code", "pre"]);

function splitText(node: HastText): HastNode[] {
  const tokens = node.value.match(TOKEN_RE) ?? [node.value];
  return tokens.map((token) => ({
    type: "element",
    tagName: "span",
    properties: { className: ["fade-token"] },
    children: [{ type: "text", value: token }],
  }));
}

function wrapTokens(node: HastNode) {
  if (!("children" in node) || !node.children) return;
  if (node.type === "element" && SKIP_TAGS.has((node as HastElement).tagName)) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === "text") return splitText(child as HastText);
    wrapTokens(child);
    return [child];
  });
}

/**
 * 每個 token 包成 <span class="fade-token">，CSS 讓它掛載時淡入。
 *
 * 關鍵在 React 的 reconcile：文字變長時，前面的 span 位置與型別都沒變，
 * React 會沿用同一個 DOM 節點 → 不會重播動畫；只有新長出來的 span 會淡入。
 * （Markdown 結構在串流中途改變時，例如 `**粗` 補齊成粗體，那一小段會重淡入一次，可以接受。）
 */
function rehypeFadeTokens() {
  return (tree: unknown) => wrapTokens(tree as HastNode);
}

/**
 * 助理回答的 Markdown 顯示，串流中搭配 smooth streaming 與淡入。
 * streaming=false 的歷史紀錄直接完整顯示，不包 span、不播動畫。
 */
export function ChatMarkdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const shown = useSmoothText(text, streaming);
  const animating = streaming || shown !== text;

  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={animating ? [rehypeFadeTokens] : []}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {shown}
      </ReactMarkdown>
    </div>
  );
}
