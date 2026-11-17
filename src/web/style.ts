/**
 * The board's styles (ticket 6, the owner's pick, 2026-10-24; the stations floor went with the pipelines, issue 28): a
 * header with the usage meters, a NOW strip, tabs for Board, Terminal and Timeline, in the palette built to be looked
 * at for hours: a dark grey-blue page, never pure black; soft off-white text, never pure white; thin, quiet lines. Four
 * colours, each with one meaning: blue = working, green = done, amber = needs you or trouble, grey = idle. Fonts already on the computer only: the page fetches nothing from the internet.
 */
export const STYLE = `
:root {
  --bg: #16181d; --panel: #1a1d23; --raise: #22262e; --term: #14161a; --line: #2b3038; --line-strong: #3a404a;
  --fg: #d4d7dd; --strong: #eceef2; --muted: #8b919c; --faint: #6b717c;
  --live: #7aa2f7; --live-soft: rgba(122,162,247,.14);
  --done: #8cc89b; --bad: #e5848a; --warn: #e5b567; --warn-soft: rgba(229,181,103,.12);
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--bg); color: var(--fg); font: 14px/1.5 var(--sans); padding: 18px 16px 20px; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
.wrap { max-width: 1440px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
h1, h2, h3, h4 { margin: 0; }
a { color: var(--live); }
:focus-visible { outline: 2px solid var(--live); outline-offset: 2px; }
.eyebrow { font: 600 10px var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }

/* The header: the light, the name and where it runs on the left; the totals and the connection on the right. */
.top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 20px; }
.brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.brand h1 { font: 700 clamp(1.25rem, 3vw, 1.6rem)/1.1 var(--sans); color: var(--strong); letter-spacing: -.01em; }
.where { margin-top: 3px; font: 12.5px var(--mono); color: var(--muted); overflow-wrap: anywhere; }
.stats { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; }
.meters { display: flex; flex-wrap: wrap; gap: 6px 16px; }
.meter { display: inline-flex; align-items: center; gap: 7px; font: 600 11px var(--mono); color: var(--fg); font-variant-numeric: tabular-nums; }
.segs { display: inline-flex; gap: 2px; }
.segs i { width: 6px; height: 13px; border-radius: 1px; background: var(--line-strong); }
.meter .segs i.on { background: var(--live); }
.meter.amber .segs i.on { background: var(--warn); } .meter.amber .val { color: var(--warn); }
.meter.red .segs i.on { background: var(--bad); } .meter.red .val { color: var(--bad); }
.meter.stale { color: var(--faint); } .meter.stale .segs i.on { background: var(--faint); } .meter.stale .val { color: var(--faint); }
.conn { display: inline-flex; align-items: center; gap: 8px; padding: 5px 11px; border-radius: 6px; background: var(--panel); border: 1px solid var(--line); font: 600 11px var(--mono); letter-spacing: .12em; color: var(--live); }
.conn.off { color: var(--warn); }
/* A status light: one short blink every 3 seconds while live; steady amber while reconnecting. */
.led { width: 9px; height: 9px; border-radius: 50%; background: var(--live); flex: none; animation: led 3s ease-in-out infinite; }
.conn .led { width: 8px; height: 8px; }
.conn.off .led, .top.off .brand .led { background: var(--warn); animation: none; }
@keyframes led { 0%, 80%, 100% { opacity: .35; } 88% { opacity: 1; } }

/* NOW: the one thing running, on every tab. Amber when work has stopped. */
.nowbar { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 8px; background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--live); min-width: 0; }
.nowbar.idle { border-left-color: var(--line-strong); }
.nowbar.alert { border-left-color: var(--warn); background: var(--warn-soft); }
.nowbar .tag { font: 700 11px var(--mono); letter-spacing: .12em; color: var(--live); flex: none; }
.nowbar.idle .tag { color: var(--muted); }
.nowbar.alert .tag, .nowbar.alert .what { color: var(--warn); }
.nowbar .what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: var(--strong); }
.nowbar .meta { margin-left: auto; display: flex; gap: 14px; flex: none; font: 13px var(--mono); color: var(--muted); }
.nowbar .meta b { color: var(--strong); font-weight: 600; font-variant-numeric: tabular-nums; }
@media (max-width: 640px) { .nowbar { flex-wrap: wrap; } .nowbar .what { white-space: normal; } .nowbar .meta { margin-left: 0; } }

.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
.tabs button { all: unset; cursor: pointer; padding: 8px 14px; font: 600 13px var(--sans); color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tabs button[aria-selected="true"] { color: var(--strong); border-bottom-color: var(--live); }
.tabs button:focus-visible { outline: 2px solid var(--live); outline-offset: 2px; border-radius: 4px; }
.panel[hidden] { display: none !important; }

.count { color: var(--faint); font-variant-numeric: tabular-nums; }
@keyframes belt { to { background-position: 17px 0; } }

/* Terminal: one block per step, newest at the foot, the running one marked. */
.window { display: flex; flex-direction: column; min-height: 460px; height: clamp(460px, calc(100dvh - 250px), 760px); border-radius: 8px; border: 1px solid var(--line); background: var(--term); overflow: hidden; }
.titlebar { display: flex; align-items: center; gap: 10px; padding: 0 12px; height: 38px; flex: none; background: var(--panel); border-bottom: 1px solid var(--line); overflow: hidden; }
.wtab { display: flex; align-items: center; gap: 8px; padding: 5px 12px; border-radius: 5px; font: 500 12px var(--mono); color: var(--muted); white-space: nowrap; }
.wtab.on { background: var(--raise); color: var(--strong); }
.wtab .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--live); }
.titlebar .clock { margin-left: auto; font: 12px var(--mono); color: var(--faint); }
.blocks { flex: 1; overflow-y: auto; padding: 4px 0; }
.banner { padding: 12px 20px; font: 13px/1.6 var(--mono); color: var(--muted); }
.banner b { color: var(--strong); }
.agents { margin-top: 14px; padding: 12px 14px; border-radius: 8px; background: var(--panel); border: 1px solid var(--line); }
.agents h2 { font: 600 11px var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
.agents h2 .count { margin-left: 10px; color: var(--live); }
.agent { display: flex; align-items: center; gap: 10px; padding: 5px 0; border-top: 1px solid var(--line); min-width: 0; font-size: 13px; }
.agent .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--line-strong); flex: none; }
.agent.live .dot { background: var(--live); }
.agent b { color: var(--strong); font-weight: 600; flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent .step { color: var(--muted); font-family: var(--mono); font-size: 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent .when { margin-left: auto; color: var(--faint); font: 11.5px var(--mono); flex: none; }
.blk { position: relative; padding: 9px 18px 9px 22px; border-top: 1px solid var(--panel); font: 13px/1.6 var(--mono); }
.blk.run { background: var(--live-soft); }
.blk.run::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--live); }
.blk .meta { display: flex; justify-content: space-between; gap: 12px; font-size: 11.5px; color: var(--faint); }
.blk .prompt { display: flex; gap: 8px; min-width: 0; color: var(--strong); }
.blk .cwd { color: var(--muted); flex: none; } .blk .br { color: var(--live); flex: none; } .blk .car { color: var(--faint); flex: none; }
.blk .cmd { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ok { color: var(--done); } .spin { color: var(--live); }
.inputbar { flex: none; display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-top: 1px solid var(--line); background: var(--panel); font: 13px var(--mono); color: var(--muted); min-width: 0; }
.inputbar .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.inputbar .chip { margin-left: auto; padding: 3px 9px; border-radius: 4px; background: var(--raise); font-size: 11.5px; white-space: nowrap; }
.cursor { flex: none; width: 8px; height: 16px; background: var(--fg); animation: blink 1.05s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }

/* Timeline: one row per hour; each background agent a bar; a line for now. */
.timeline { display: flex; flex-direction: column; gap: 14px; padding: 16px; border-radius: 8px; background: var(--panel); border: 1px solid var(--line); }
.timeline h3 { font-size: 1rem; color: var(--strong); }
.tl-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.tl-sum { display: flex; flex-wrap: wrap; gap: 6px 22px; font: 13px var(--mono); color: var(--muted); }
.tl-sum b { color: var(--strong); font-weight: 600; }
.hours { display: grid; gap: 6px; }
.hr { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 10px; align-items: center; }
.hr > span { font: 500 11px var(--mono); color: var(--faint); text-align: right; }
.hr.head > div { display: grid; grid-template-columns: repeat(4, 1fr); font: 10px var(--mono); color: var(--faint); }
.row { position: relative; height: 30px; border-radius: 4px; background: var(--term); box-shadow: inset 0 0 0 1px var(--line); overflow: hidden; }
.row::before { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 calc(25% - 1px), var(--raise) calc(25% - 1px) 25%); }
.bar { position: absolute; top: 4px; bottom: 4px; min-width: 3px; border-radius: 3px; padding: 0 7px; display: flex; align-items: center; font: 600 11px var(--mono); color: var(--term); white-space: nowrap; overflow: hidden; }
.bar.done { background: var(--done); }
.bar.live { background: repeating-linear-gradient(-45deg, var(--live) 0 6px, #5a7cc0 6px 12px); background-size: 17px 17px; animation: belt .7s linear infinite; }
.nowline { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--strong); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font: 11.5px var(--mono); color: var(--muted); }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }

/* The footer note and the start page. */
.keys { display: flex; flex-wrap: wrap; gap: 6px 22px; align-items: center; font: 12px var(--mono); color: var(--muted); border-top: 1px solid var(--line); padding-top: 8px; }
.keys-note { margin-left: auto; }
.empty { color: var(--muted); padding: 24px; border: 1px dashed var(--line); border-radius: 8px; }
.projects { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.project { display: grid; gap: 4px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; text-decoration: none; color: var(--fg); }
.project:hover { border-color: var(--live); }
.project.idle { opacity: .6; }
.project.idle:hover { opacity: 1; }
.project b { font: 600 17px var(--sans); color: var(--strong); }
.project span { font: 12.5px var(--mono); color: var(--muted); }

@media (max-width: 560px) { .stats { gap: 6px 14px; } }
/* Sentinel: the link, the site light, the Live site strip and the From Sentinel lane. */
.nwlink { margin-left: auto; font: 600 12px var(--mono); color: var(--live); text-decoration: none; white-space: nowrap; }
.nwlink:hover { text-decoration: underline; }
.sitelight { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--line-strong); vertical-align: middle; }
.sitelight.ok { background: var(--done); } .sitelight.warn { background: var(--warn); } .sitelight.bad { background: var(--bad); }
.livesite { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 8px 14px; border-radius: 8px; background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--line-strong); font-size: 13px; }
.livesite[hidden] { display: none; }
.livesite.ok { border-left-color: var(--done); } .livesite.warn { border-left-color: var(--warn); } .livesite.bad { border-left-color: var(--bad); }
.livesite b { color: var(--strong); } .livesite .open { color: var(--warn); } .livesite.bad .open { color: var(--bad); }
.livesite .rel { color: var(--muted); font-family: var(--mono); font-size: 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fromwatch { margin-top: 14px; padding: 12px 14px; border-radius: 8px; background: var(--panel); border: 1px solid var(--line); }
.fromwatch h2, .fromwatch h3 { font: 600 11px var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
.fromwatch h3 { margin-top: 14px; } .fromwatch h2 .count { margin-left: 10px; color: var(--bad); }
.wgrid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.wcard { padding: 10px 12px; border-radius: 8px; background: var(--raise); border: 1px solid var(--line); border-left: 3px solid var(--warn); min-width: 0; }
.wcard.sev-critical, .wcard.sev-high { border-left-color: var(--bad); } .wcard.healed { border-left-color: var(--done); opacity: .85; }
.wcard .top { display: flex; gap: 10px; font: 600 11px var(--mono); color: var(--muted); }
.wcard .sev { text-transform: uppercase; letter-spacing: .1em; } .wcard .age { margin-left: auto; font-weight: 400; color: var(--faint); }
.wcard .name { margin-top: 4px; color: var(--strong); font-weight: 600; overflow-wrap: anywhere; }
.wcard .fix, .wcard .issue { margin-top: 4px; font-size: 12.5px; color: var(--muted); overflow-wrap: anywhere; } .wcard .fix.ok { color: var(--done); }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;
