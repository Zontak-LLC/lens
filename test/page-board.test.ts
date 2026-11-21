import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { startServer } from "../src/server/index.js";
import { OLD_NAMES } from "./old-names.js";

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

/** Runs the page (for project shop-app by default), sends it one board, and returns the page's root element. */
async function drawBoard(view: unknown, pathname = "/shop-app", kind = "board"): Promise<Node> {
  return (await drawPage(view, pathname, kind)).root;
}

/** Like drawBoard, and also returns the browser tab's title the page set. */
async function drawPage(view: unknown, pathname: string, kind: string): Promise<{ root: Node; title: string }> {
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
    location: { pathname },
    localStorage: { getItem: () => null, setItem() {} },
    EventSource: class {
      addEventListener(kind: string, fn: (e: { data: string }) => void) {
        listeners[kind] = fn;
      }
    },
    setInterval: () => 0,
    window: {},
  });
  listeners[kind]?.({ data: JSON.stringify(view) });
  return { root, title: document.title };
}

const NOW_ISO = new Date().toISOString();
const view = (extra: Record<string, unknown> = {}) => ({
  project: "shop-app",
  folder: "/work/shop-app",
  branch: "coupon",
  now: [{ who: "Add a coupon field", what: "Editing src/cart.ts", at: NOW_ISO }],
  agents: [],
  alerts: [],
  ...extra,
});

describe("the Board tab without the pipeline (issue 28)", () => {
  it("has no stations floor, no ticket stats and no ticket dialog, and keeps NOW and the agents", async () => {
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

describe("the page without the usage meter and the Sentinel link (Motherboard shows both)", () => {
  it("draws a header with the name and the LIVE light only, no Live site strip and no From Sentinel lane", async () => {
    // A board from an older version still carrying the removed keys: the page ignores them.
    const old = view({ meter: { five_hour: 42, seven_day: 78 }, watch: { siteId: "demo-app", status: "up" } });
    const nodes = all(await drawBoard(old));
    const text = nodes.map((n) => n.textContent).join("\n");
    for (const word of ["Sentinel", "Live site", "5 h", "Week"]) expect(text).not.toContain(word);
    const stats = nodes.find((n) => n.className === "stats");
    expect(stats?.children.map((c) => c.className)).toEqual(["conn"]);
    expect(stats?.textContent).toBe("LIVE");
    // The NOW strip comes straight after the header, and the Board tab holds the background agents only.
    const root = nodes[0];
    expect(root?.children.map((c) => c.className.split(" ")[0])).toEqual([
      "top",
      "nowbar",
      "tabs",
      "panel",
      "panel",
      "panel",
      "keys",
    ]);
    const board = root?.children.find((c) => c.id === "panel-board");
    expect(board?.children.map((c) => c.className)).toEqual(["agents"]);
  });

  it("shows the start page header with the brand only, and tiles with no site light", async () => {
    const tile = { project: "demo-app", name: "Demo App", folder: "~/Projects/demo-app", lastAt: "", agents: 0 };
    const root = await drawBoard([{ ...tile, active: true, pinned: true, watch: { light: "bad" } }], "/", "projects");
    const nodes = all(root);
    const head = root.children[0];
    expect(head?.className).toBe("top");
    expect(head?.children.map((c) => c.className)).toEqual(["brand"]);
    const card = nodes.find((n) => n.className === "project");
    expect(card?.children.map((c) => c.textContent)).toEqual(["Demo App", "~/Projects/demo-app", "no activity yet"]);
    expect(nodes.some((n) => n.className.includes("sitelight"))).toBe(false);
    expect(nodes.map((n) => n.textContent).join("\n")).not.toContain("Sentinel");
  });
});

describe("the public name Spyglass on screen", () => {
  it("names a project's board Spyglass in the tab title, the header and the terminal banner", async () => {
    const { root, title } = await drawPage(view({ name: "Shop App" }), "/shop-app", "board");
    const nodes = all(root);
    expect(title).toBe("Spyglass · Shop App");
    expect(nodes.find((n) => n.tag === "h1")?.textContent).toBe("Spyglass · Shop App");
    expect(nodes.find((n) => n.className === "banner")?.textContent).toBe("Spyglass · shop-app · coupon");
    for (const old of OLD_NAMES) expect(nodes.map((n) => n.textContent).join("\n")).not.toContain(old);
  });

  it("shows Spyglass as the start page's brand", async () => {
    const root = await drawBoard([], "/", "projects");
    expect(all(root).find((n) => n.tag === "h1")?.textContent).toBe("Spyglass");
  });
});
