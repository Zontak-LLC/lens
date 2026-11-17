import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { startServer } from "../src/server/index.js";

// Issue 28: the Board tab without the pipeline. The page served for a project is run against a small stand-in for the
// browser's document, fed one `board` event, and the elements it built are read back.
type Node = {
  tag: string;
  className: string;
  textContent: string;
  hidden: boolean;
  children: Node[];
  dataset: Record<string, string>;
  style: Record<string, string>;
  attrs: Record<string, string>;
  [key: string]: unknown;
};

function fakeNode(tag: string): Node {
  const node: Node = {
    tag,
    className: "",
    hidden: false,
    children: [],
    dataset: {},
    style: {},
    attrs: {},
    get textContent() {
      return (this as Node).children.length ? (this as Node).children.map((c) => c.textContent).join("") : String(own);
    },
    set textContent(v: string) {
      (this as Node).children = [];
      own = v;
    },
    get firstChild() {
      return node.children[0];
    },
    append(...items: (Node | string)[]) {
      for (const i of items) node.children.push(typeof i === "string" ? textNode(i) : i);
    },
    setAttribute(k: string, v: string) {
      node.attrs[k] = v;
    },
    getAttribute: (k: string) => node.attrs[k] ?? null,
    addEventListener() {},
    classList: {
      toggle(c: string, on?: boolean) {
        const set = new Set(node.className.split(" ").filter(Boolean));
        if (on ?? !set.has(c)) set.add(c);
        else set.delete(c);
        node.className = [...set].join(" ");
      },
    },
    querySelector: () => fakeNode("div"),
    querySelectorAll: () => [],
  };
  let own = "";
  return node;
}
const textNode = (text: string): Node => Object.assign(fakeNode("#text"), { textContent: text });
const all = (n: Node): Node[] => [n, ...n.children.flatMap(all)];

async function pageScript(): Promise<string> {
  const server = await startServer(0, { view: () => ({}), projects: () => [] });
  try {
    const html = await (await fetch(`http://127.0.0.1:${server.port}/shop-app`)).text();
    return /<script>([\s\S]*)<\/script>/.exec(html)?.[1] ?? "";
  } finally {
    await server.close();
  }
}

/** Runs the page for project shop-app, sends it one board, and returns the page's root element. */
async function drawBoard(view: Record<string, unknown>): Promise<Node> {
  const root = fakeNode("main");
  const listeners: Record<string, (e: { data: string }) => void> = {};
  const document = {
    title: "",
    createElement: fakeNode,
    getElementById: () => root,
    querySelector: () => null,
  };
  runInNewContext(await pageScript(), {
    document,
    location: { pathname: "/shop-app" },
    localStorage: { getItem: () => null, setItem() {} },
    EventSource: class {
      addEventListener(kind: string, fn: (e: { data: string }) => void) {
        listeners[kind] = fn;
      }
    },
    setInterval: () => 0,
    window: {},
  });
  listeners.board?.({ data: JSON.stringify(view) });
  return root;
}

const NOW_ISO = new Date().toISOString();
const view = (extra: Record<string, unknown> = {}) => ({
  project: "shop-app",
  folder: "/work/shop-app",
  branch: "coupon",
  now: [{ who: "Add a coupon field", what: "Editing src/cart.ts", at: NOW_ISO }],
  agents: [],
  alerts: [],
  meter: { five_hour: 42, seven_day: 78, five_hour_resets_at: null, updated: NOW_ISO },
  ...extra,
});

describe("the Board tab without the pipeline (issue 28)", () => {
  it("has no stations floor, no ticket stats and no ticket dialog, and keeps NOW, the agents and the meters", async () => {
    const nodes = all(await drawBoard(view()));
    const classes = nodes.flatMap((n) => n.className.split(" "));
    const text = nodes.map((n) => n.textContent).join("\n");
    for (const gone of ["floor", "col", "card", "belt", "stat"]) expect(classes).not.toContain(gone);
    expect(nodes.some((n) => n.tag === "dialog")).toBe(false);
    for (const word of ["Est. finish", "Merged", "Skipped", "Avg", "Station"]) expect(text).not.toContain(word);
    expect(nodes.find((n) => n.className.startsWith("nowbar"))?.textContent).toContain(
      "Add a coupon field · Editing src/cart.ts",
    );
    const agents = nodes.find((n) => n.attrs["aria-label"] === "Background agents");
    expect(agents?.hidden).toBe(false);
    expect(agents?.textContent).toBe("Background agentsNo background agent in this project yet.");
    const meters = nodes.find((n) => n.className === "meters");
    expect(meters?.hidden).toBe(false);
    expect(meters?.children.map((m) => m.attrs["aria-label"])).toEqual(["5 h usage 42%", "Week usage 78%"]);
    expect(nodes.find((n) => n.className === "keys")?.textContent).toBe("read only · nothing leaves this computer");
    expect(nodes.find((n) => n.className === "chip")?.textContent).toBe("coupon");
  });

  it("shows a stopped session in amber on the NOW strip, and the next real step clears it", async () => {
    const limit = { who: "Add a coupon field", reason: "usage_limit", since: NOW_ISO, resetsAt: null, text: "limit" };
    const stopped = all(await drawBoard(view({ alerts: [limit] }))).find((n) => n.className.startsWith("nowbar"));
    expect(stopped?.className).toBe("nowbar alert");
    expect(stopped?.textContent).toMatch(/^STOPPEDPaused: usage limit since \d\d:\d\d\./);
    const going = all(await drawBoard(view())).find((n) => n.className.startsWith("nowbar"));
    expect(going?.className).toBe("nowbar");
  });

  it("lists the background agents, and says when none has run", async () => {
    const agent = { agentId: "bg1", name: "Docs: coupon field", worktree: false, step: "Editing guide.md" };
    const row = { ...agent, recent: [], steps: 2, startedAt: NOW_ISO, lastAt: NOW_ISO, active: true, parent: "s1" };
    const nodes = all(await drawBoard(view({ agents: [row] })));
    const section = nodes.find((n) => n.attrs["aria-label"] === "Background agents");
    expect(section?.textContent).toContain("1 agent working");
    expect(section?.textContent).toContain("Docs: coupon field");
    expect(section?.textContent).not.toContain("No background agent");
  });
});
