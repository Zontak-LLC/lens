/**
 * The page's arithmetic: durations in words, background agents at work, the timeline's hour rows and the usage meters.
 * Each function is tested here AND sent to the browser as its own source text (`PAGE_MATH` below, joined into the page
 * script), so the page runs exactly the tested code. That is why each one stands alone: no imports, no module values,
 * no calls to anything outside the list in `PAGE_MATH`.
 */
export type Bar = { num: number; label: string; kind: string; left: number; width: number; first: boolean };
export type HourRow = { at: number; bars: Bar[]; nowAt: number | null };

/** "1h 05m", "7m 12s", or "–" when there is nothing to say. */
export function durationText(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "–";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export type PageAgent = { name: string; active: boolean; startedAt: string | null; lastAt: string };

/** "3 agents working", "1 agent working", or "" when none is active. */
export function agentsWorking(agents: PageAgent[]): string {
  const n = agents.filter((a) => a.active).length;
  return n ? `${n} ${n === 1 ? "agent" : "agents"} working` : "";
}

/** Each background agent that took a step as a span of time (negative numbers: they are not tickets). */
export function agentSegments(agents: PageAgent[], nowMs: number) {
  return agents
    .filter((a) => a.startedAt && Number.isFinite(Date.parse(a.startedAt)))
    .map((a, i) => {
      const from = Date.parse(a.startedAt ?? "");
      return {
        num: -1 - i,
        label: a.name,
        kind: a.active ? "live" : "done",
        from,
        to: Math.max(from, a.active ? nowMs : Date.parse(a.lastAt) || from),
      };
    });
}

/**
 * The timeline: one row per clock hour from the first agent's start to now (the newest 24 at most), each holding the
 * pieces of the segments that fall in it, as percentages of the hour. A label goes only where a segment starts.
 */
export function hourRows(
  startMs: number,
  nowMs: number,
  segs: { num: number; label: string; kind: string; from: number; to: number }[],
): HourRow[] {
  const HOUR = 3600e3;
  const end = Math.max(nowMs, ...segs.map((s) => s.to));
  const firstHour = Math.max(Math.floor(startMs / HOUR) * HOUR, Math.floor(end / HOUR) * HOUR - 23 * HOUR);
  const rows: HourRow[] = [];
  for (let at = firstHour; at < end || rows.length === 0; at += HOUR) {
    const bars: Bar[] = [];
    for (const s of segs) {
      if (s.to <= at || s.from >= at + HOUR) continue;
      const a = Math.max(s.from, at);
      bars.push({
        num: s.num,
        label: s.label,
        kind: s.kind,
        left: ((a - at) / HOUR) * 100,
        width: ((Math.min(s.to, at + HOUR) - a) / HOUR) * 100,
        first: s.from >= at,
      });
    }
    rows.push({ at, bars, nowAt: nowMs >= at && nowMs < at + HOUR ? ((nowMs - at) / HOUR) * 100 : null });
  }
  return rows;
}

export type MeterIn = {
  five_hour: number | null;
  seven_day: number | null;
  five_hour_resets_at: number | null;
  updated: string | null;
} | null;
export type MeterBar = {
  label: string;
  pct: number;
  on: number;
  level: "ok" | "amber" | "red";
  resetsAt: number | null;
};

/**
 * The header's usage meters: each is 10 segments, amber from 75% and red from 90%; the whole meter is stale when
 * the file was written more than 15 minutes ago (or says nothing about when). The 5-hour meter says when it resets
 * only while that time is still ahead. Null when there is no meter.
 */
export function meterView(meter: MeterIn, nowMs: number): { bars: MeterBar[]; stale: boolean } | null {
  if (!meter) return null;
  const level = (pct: number): "ok" | "amber" | "red" => (pct >= 90 ? "red" : pct >= 75 ? "amber" : "ok");
  const bars: MeterBar[] = [];
  if (meter.five_hour !== null) {
    const resets = meter.five_hour_resets_at === null ? null : meter.five_hour_resets_at * 1000;
    bars.push({
      label: "5 h",
      pct: Math.round(meter.five_hour),
      on: Math.round(meter.five_hour / 10),
      level: level(meter.five_hour),
      resetsAt: resets !== null && resets > nowMs ? resets : null,
    });
  }
  if (meter.seven_day !== null) {
    bars.push({
      label: "Week",
      pct: Math.round(meter.seven_day),
      on: Math.round(meter.seven_day / 10),
      level: level(meter.seven_day),
      resetsAt: null,
    });
  }
  const written = meter.updated === null ? Number.NaN : Date.parse(meter.updated);
  return { bars, stale: !(nowMs - written <= 15 * 60_000) };
}

/**
 * The functions above as page-script source (types already gone). A runner that keeps function names (tsx in
 * `npm run dev`) wraps named arrows in `__name(...)`; the one-line stand-in makes that harmless in the browser.
 */
export const PAGE_MATH = [
  "var __name = function (f) { return f; };",
  ...[durationText, agentsWorking, agentSegments, hourRows, meterView].map((f) => f.toString()),
].join("\n");
