import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  type SelectOption,
  type KeyEvent,
} from "@opentui/core";
import type { Store } from "./store";

const NEW = "__new__";

export async function pickSession(store: Store): Promise<{ sessionId: string; resumed: boolean }> {
  const recents = store.recents();
  if (recents.length === 0) return { sessionId: store.createSession(), resumed: false };
  if (!process.stdin.isTTY || !process.stdout.isTTY) return { sessionId: recents[0]!.id, resumed: true };

  const options: SelectOption[] = [
    { name: "✦ New thread", description: "start fresh", value: NEW },
    ...recents.map((r) => ({ name: r.title ?? "(untitled)", description: relTime(r.updated_at), value: r.id })),
  ];

  let renderer: Awaited<ReturnType<typeof createCliRenderer>>;
  try {
    renderer = await createCliRenderer({ exitOnCtrlC: true });
  } catch {
    return { sessionId: recents[0]!.id, resumed: true };
  }

  const select = new SelectRenderable(renderer, {
    options,
    showDescription: true,
    wrapSelection: true,
    selectedBackgroundColor: "#264f78",
    selectedTextColor: "#ffffff",
    height: Math.min(options.length * 2, 16),
  });
  const box = new BoxRenderable(renderer, {
    title: "s-team — pick a thread",
    borderStyle: "rounded",
    padding: 1,
    flexDirection: "column",
    gap: 1,
    width: 64,
  });
  box.add(select);
  box.add(new TextRenderable(renderer, { content: "↑/↓ move · Enter choose · Ctrl+C quit", fg: "#666666" }));
  renderer.root.add(box);

  const choice = await new Promise<string>((resolve) => {
    renderer.keyInput.on("keypress", (k: KeyEvent) => select.handleKeyPress(k));
    select.on(SelectRenderableEvents.ITEM_SELECTED, () => resolve(String(select.getSelectedOption()?.value ?? NEW)));
  });
  renderer.destroy();

  if (choice === NEW) return { sessionId: store.createSession(), resumed: false };
  return { sessionId: choice, resumed: true };
}

function relTime(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
