/**
 * Synthetic demo data. It follows the SPEC formulas in simplified form so the
 * screens behave like the real engine: category trajectories (§7.2), profile
 * weights and λ (§7.4), exact contributions (§7.5), statuses (§8.3), alerts
 * (§8.5) and the limit engine (§10.1). Nothing here is Embat data.
 */
import type {
  Alert,
  BandLetter,
  Category,
  CategoryScore,
  Confidence,
  EntityDetail,
  LimitDecision,
  MonitorData,
  Portfolio,
  PortfolioRow,
  Regime,
  Status,
  TimelinePoint,
} from "../api/types";
import { MONTHS, type Profile } from "../hooks/useGlobalParams";

type BaseCategory = Exclude<Category, "MOMENTUM">;

const BASE_CATEGORIES: BaseCategory[] = [
  "DEBT_SERVICE",
  "LIQUIDITY",
  "OPERATING_CASH_FLOW",
  "PAYMENT_BEHAVIOUR",
  "DELINQUENCY",
  "LEVERAGE",
  "TAX_REGULARITY",
  "CONCENTRATION",
  "ACTIVITY_GROWTH",
];

/** SPEC §7.4 weight tables (sum 100) and λ. */
const WEIGHTS: Record<Profile, { lambda: number; w: Record<Category, number> }> = {
  BANK: {
    lambda: 0.7,
    w: {
      DEBT_SERVICE: 25, LIQUIDITY: 20, OPERATING_CASH_FLOW: 20, PAYMENT_BEHAVIOUR: 7.5, DELINQUENCY: 7.5,
      LEVERAGE: 10, TAX_REGULARITY: 5, CONCENTRATION: 5, ACTIVITY_GROWTH: 0, MOMENTUM: 0,
    },
  },
  FUND: {
    lambda: 0.5,
    w: {
      DEBT_SERVICE: 0, LIQUIDITY: 10, OPERATING_CASH_FLOW: 20, PAYMENT_BEHAVIOUR: 0, DELINQUENCY: 0,
      LEVERAGE: 5, TAX_REGULARITY: 0, CONCENTRATION: 10, ACTIVITY_GROWTH: 30, MOMENTUM: 25,
    },
  },
  INSURER: {
    lambda: 0.7,
    w: {
      DEBT_SERVICE: 0, LIQUIDITY: 15, OPERATING_CASH_FLOW: 10, PAYMENT_BEHAVIOUR: 30, DELINQUENCY: 20,
      LEVERAGE: 5, TAX_REGULARITY: 0, CONCENTRATION: 20, ACTIVITY_GROWTH: 0, MOMENTUM: 0,
    },
  },
};

// ---------------------------------------------------------------------------
// Entities

type Path = "stable" | "rise" | "decline" | "turn" | "dip" | "lateDip" | "collapse" | "recovery";

interface Seed {
  id: string;
  name: string;
  entityType: "GROUP" | "COMPANY";
  base: number;
  path: Path;
  amplitude: number;
  confidence: Confidence;
  /** Fixed category offsets on top of the random ones. */
  bias?: Partial<Record<BaseCategory, number>>;
  /** Monthly operating inflow, EUR. */
  inflow: number;
}

const SEEDS: Seed[] = [
  { id: "G-001", name: "Aceros del Cantábrico", entityType: "GROUP", base: 93, path: "rise", amplitude: 6, confidence: "HIGH", inflow: 2_400_000 },
  { id: "G-002", name: "Northbrook Components", entityType: "GROUP", base: 42, path: "rise", amplitude: 26, confidence: "HIGH", bias: { ACTIVITY_GROWTH: 14 }, inflow: 900_000 },
  { id: "G-003", name: "Velasco Distribución", entityType: "GROUP", base: 96, path: "decline", amplitude: 15, confidence: "HIGH", inflow: 1_700_000 },
  { id: "G-004", name: "Conservas Atlántico", entityType: "COMPANY", base: 80, path: "stable", amplitude: 2, confidence: "MEDIUM", inflow: 450_000 },
  { id: "G-005", name: "Transportes Meseta", entityType: "GROUP", base: 79, path: "turn", amplitude: 13, confidence: "HIGH", inflow: 1_100_000 },
  { id: "G-006", name: "Viñedos Ribera", entityType: "COMPANY", base: 78, path: "lateDip", amplitude: 18, confidence: "MEDIUM", inflow: 380_000 },
  { id: "G-007", name: "Textil Levante", entityType: "GROUP", base: 62, path: "collapse", amplitude: 34, confidence: "HIGH", inflow: 760_000 },
  { id: "G-008", name: "Cerámicas Castellón", entityType: "COMPANY", base: 30, path: "stable", amplitude: 2, confidence: "LOW", inflow: 290_000 },
  { id: "G-009", name: "Logística Ebro", entityType: "GROUP", base: 62, path: "recovery", amplitude: 18, confidence: "HIGH", inflow: 1_300_000 },
  { id: "G-010", name: "Farmacéutica Tajo", entityType: "COMPANY", base: 95, path: "stable", amplitude: 2, confidence: "HIGH", inflow: 2_100_000 },
  { id: "G-011", name: "Construcciones Duero", entityType: "GROUP", base: 60, path: "stable", amplitude: 3, confidence: "MEDIUM", bias: { DEBT_SERVICE: -12, LEVERAGE: -10 }, inflow: 1_500_000 },
  { id: "G-012", name: "Software Mediterráneo", entityType: "COMPANY", base: 56, path: "rise", amplitude: 16, confidence: "LOW", bias: { ACTIVITY_GROWTH: 30, DEBT_SERVICE: -14, PAYMENT_BEHAVIOUR: -8 }, inflow: 320_000 },
  { id: "G-013", name: "Hostelería Bahía", entityType: "COMPANY", base: 72, path: "dip", amplitude: 16, confidence: "MEDIUM", inflow: 260_000 },
  { id: "G-014", name: "Energías Alborán", entityType: "GROUP", base: 80, path: "rise", amplitude: 12, confidence: "HIGH", inflow: 2_800_000 },
  { id: "G-015", name: "Papelera Navarra", entityType: "COMPANY", base: 64, path: "decline", amplitude: 20, confidence: "MEDIUM", bias: { PAYMENT_BEHAVIOUR: -10, DELINQUENCY: -8 }, inflow: 410_000 },
  { id: "G-016", name: "Agroalimentaria Segura", entityType: "GROUP", base: 78, path: "stable", amplitude: 2, confidence: "HIGH", bias: { CONCENTRATION: -18 }, inflow: 1_900_000 },
  { id: "G-017", name: "Muebles Galicia", entityType: "COMPANY", base: 50, path: "stable", amplitude: 3, confidence: "MEDIUM", inflow: 230_000 },
  { id: "G-018", name: "Química Tarragona", entityType: "GROUP", base: 84, path: "turn", amplitude: 12, confidence: "HIGH", bias: { PAYMENT_BEHAVIOUR: 8 }, inflow: 3_100_000 },
];

/** Deterministic PRNG (mulberry32) so every reload shows the same numbers. */
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const ease = (x: number) => clamp(x, 0, 1) * clamp(x, 0, 1) * (3 - 2 * clamp(x, 0, 1));

/** Health movement at month i, in points, relative to the start. */
function pathAt(path: Path, i: number, amp: number): number {
  switch (path) {
    case "stable":
      return amp * 0.5 * Math.sin(i / 3);
    case "rise":
      return amp * ease((i - 4) / 22);
    case "decline":
      return -amp * ease((i - 9) / 17);
    case "turn":
      return -amp * ease((i - 18) / 5);
    case "dip":
      return i === 14 ? -amp : i === 15 ? -amp * 0.7 : i === 16 ? -amp * 0.2 : 0;
    case "lateDip":
      return i === 22 ? -amp * 0.6 : i === 23 ? -amp : 0;
    case "collapse":
      return -amp * ease((i - 8) / 14);
    case "recovery":
      return i < 10 ? -amp * ease(i / 10) : -amp + amp * 1.5 * ease((i - 10) / 15);
  }
}

/** Categories react with different strength to the entity's health movement. */
const SENSITIVITY: Record<BaseCategory, number> = {
  DEBT_SERVICE: 1.1,
  LIQUIDITY: 1.3,
  OPERATING_CASH_FLOW: 1.2,
  PAYMENT_BEHAVIOUR: 0.9,
  DELINQUENCY: 1.0,
  LEVERAGE: 0.6,
  TAX_REGULARITY: 0.5,
  CONCENTRATION: 0.3,
  ACTIVITY_GROWTH: 1.4,
};

/** Level score per category and month (profile-independent). */
function categoryLevels(seed: Seed): Record<BaseCategory, number[]> {
  const r = rng(seed.id);
  const out = {} as Record<BaseCategory, number[]>;
  for (const c of BASE_CATEGORIES) {
    const offset = (r() - 0.5) * 20 + (seed.bias?.[c] ?? 0);
    out[c] = MONTHS.map((_, i) => round1(clamp(seed.base + offset + SENSITIVITY[c] * pathAt(seed.path, i, seed.amplitude) + (r() - 0.5) * 3)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scoring (simplified SPEC §7)

/** §7.2: 3m moving average, slope over 6 months, delta over 3, mapped to 0–100 with 50 = flat. */
function trajectory(series: number[], m: number): number {
  const smooth = (i: number) => {
    const from = Math.max(0, i - 2);
    const xs = series.slice(from, i + 1);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  const from = Math.max(0, m - 5);
  const pts = Array.from({ length: m - from + 1 }, (_, k) => ({ x: from + k, y: smooth(from + k) }));
  if (pts.length < 4) return 50;
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const delta3 = m >= 3 ? smooth(m) - smooth(m - 3) : 0;
  const raw = 0.7 * slope + 0.3 * (delta3 / 3);
  return round1(clamp(50 + raw * 10));
}

export function bandLetter(score: number): BandLetter {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "E";
}

interface MonthScore {
  final: number;
  level: number;
  traj: number;
  categories: CategoryScore[];
}

interface EntitySeries {
  seed: Seed;
  months: MonthScore[];
  regimes: Regime[];
  statuses: Status[];
}

function scoreEntity(seed: Seed, profile: Profile): EntitySeries {
  const levels = categoryLevels(seed);
  const { lambda, w } = WEIGHTS[profile];
  const baseWeight = BASE_CATEGORIES.reduce((a, c) => a + w[c], 0);

  const levelSeries: number[] = [];
  const months: MonthScore[] = MONTHS.map((_, m) => {
    const trajs = Object.fromEntries(BASE_CATEGORIES.map((c) => [c, trajectory(levels[c], m)])) as Record<BaseCategory, number>;
    const level = BASE_CATEGORIES.reduce((a, c) => a + w[c] * levels[c][m], 0) / baseWeight;
    const traj = BASE_CATEGORIES.reduce((a, c) => a + w[c] * trajs[c], 0) / baseWeight;
    levelSeries.push(level);

    // MOMENTUM: overall trajectory adjusted by persistence (+2 pts per month, capped ±10).
    let persistence = 0;
    for (let k = m; k > 0; k--) {
      const d = levelSeries[k] - levelSeries[k - 1];
      if (persistence >= 0 && d > 0.05) persistence++;
      else if (persistence <= 0 && d < -0.05) persistence--;
      else break;
    }
    const momentum = clamp(traj + clamp(2 * persistence, -10, 10));

    const categories: CategoryScore[] = BASE_CATEGORIES.map((c) => {
      const blended = lambda * levels[c][m] + (1 - lambda) * trajs[c];
      return {
        category: c,
        level: levels[c][m],
        traj: trajs[c],
        weight: w[c],
        contribution: (w[c] / 100) * (blended - 50),
        contributionDelta3m: 0,
      };
    });
    categories.push({
      category: "MOMENTUM",
      level: round1(momentum),
      traj: round1(momentum),
      weight: w.MOMENTUM,
      contribution: (w.MOMENTUM / 100) * (momentum - 50),
      contributionDelta3m: 0,
    });
    const final = 50 + categories.reduce((a, c) => a + c.contribution, 0);
    return { final: round1(clamp(final)), level: round1(level), traj: round1(traj), categories };
  });

  months.forEach((ms, m) => {
    const prev = months[Math.max(0, m - 3)];
    ms.categories = ms.categories.map((c, k) => ({
      ...c,
      contribution: round1(c.contribution),
      contributionDelta3m: round1(c.contribution - prev.categories[k].contribution),
    }));
  });

  const finals = months.map((x) => x.final);
  const regimes: Regime[] = [];
  const statuses: Status[] = [];
  finals.forEach((f, m) => {
    const window = finals.slice(Math.max(0, m - 5), m + 1);
    const slope = window.length >= 4 ? (window[window.length - 1] - window[0]) / (window.length - 1) : 0;
    const last3 = [1, 2, 3].map((k) => (m - k >= 0 ? finals[m - k + 1] - finals[m - k] : 0));
    const baseline = median(finals.slice(Math.max(0, m - 6), m));
    let regime: Regime = "STABLE";
    // Persistence: three real monthly moves in the same direction, not noise.
    if (slope < -1.5 && last3.every((d) => d < -0.5)) regime = "STRUCTURAL_DECLINE";
    else if (slope > 1.5 && last3.every((d) => d > 0.5)) regime = "STRUCTURAL_IMPROVEMENT";
    else if (m >= 3 && f - baseline <= -5) regime = "DIP";
    else if (m >= 1 && regimes[m - 1] === "DIP" && Math.abs(f - baseline) < 3) regime = "DIP_RECOVERED";
    regimes.push(regime);

    const { level, traj } = months[m];
    let status: Status = "WATCH";
    if (f < 35) status = "CRITICAL";
    else if (regime === "STRUCTURAL_DECLINE") status = "STRUCTURAL_DECLINE";
    else if (level >= 60 && traj <= 40) status = "TURNING";
    else if (regime === "DIP") status = "DIP";
    else if (regime === "STRUCTURAL_IMPROVEMENT" || traj >= 65) status = "IMPROVING";
    else if (f >= 85 && traj >= 45) status = "EXCEPTIONAL";
    else if (f >= 65) status = "HEALTHY";
    statuses.push(status);
  });

  return { seed, months, regimes, statuses };
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Alerts (simplified SPEC §8.5, fired on transition only)

function alertsFor(series: EntitySeries): Alert[] {
  const { seed, months, regimes } = series;
  const out: Alert[] = [];
  const push = (m: number, code: string, severity: Alert["severity"], direction: Alert["direction"], message: string) =>
    out.push({ id: `${seed.id}-${m}-${code}`, entityId: seed.id, entityName: seed.name, month: MONTHS[m], code, severity, direction, message });

  let dropActive = false;
  let runwayActive = false;
  for (let m = 1; m < months.length; m++) {
    const f = months[m].final;
    const before = bandLetter(months[m - 1].final);
    const now = bandLetter(f);
    if (now !== before) {
      const up = now < before;
      push(m, up ? "BAND_UPGRADE" : "BAND_DOWNGRADE", up ? "INFO" : now === "E" ? "CRITICAL" : "WARN", up ? "POSITIVE" : "NEGATIVE",
        `Banda ${before} → ${now} (${f.toFixed(1).replace(".", ",")} puntos)`);
    }
    if (regimes[m] !== regimes[m - 1]) {
      if (regimes[m] === "STRUCTURAL_DECLINE") push(m, "STRUCTURAL_DECLINE", "CRITICAL", "NEGATIVE", "Entra en deterioro estructural");
      if (regimes[m] === "STRUCTURAL_IMPROVEMENT") push(m, "STRUCTURAL_IMPROVEMENT", "INFO", "POSITIVE", "Entra en mejora estructural");
      if (regimes[m] === "DIP") push(m, "DIP", "WARN", "NEGATIVE", "Bache: caída puntual frente a su media de 6 meses");
    }
    const drop = m >= 3 ? f - months[m - 3].final : 0;
    if (drop <= -8 && !dropActive) {
      push(m, "SCORE_DROP", drop <= -15 ? "CRITICAL" : "WARN", "NEGATIVE", `La nota cae ${Math.abs(drop).toFixed(1).replace(".", ",")} puntos en 3 meses`);
    }
    dropActive = drop <= -8;
    const liquidity = months[m].categories.find((c) => c.category === "LIQUIDITY")!.level;
    if (liquidity < 35 && !runwayActive) push(m, "RUNWAY_LOW", liquidity < 20 ? "CRITICAL" : "WARN", "NEGATIVE", "Liquidez baja: menos de 3 meses de caja");
    runwayActive = liquidity < 35;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Products (simplified SPEC §10)

const SPREAD_BPS: Record<BandLetter, number | null> = { A: 90, B: 150, C: 250, D: 400, E: null };
const PREMIUM_MULT: Record<BandLetter, number | null> = { A: 0.8, B: 1, C: 1.4, D: 2, E: null };

function limitAt(series: EntitySeries, m: number): { limit: number; binding: LimitDecision["bindingConstraint"] } {
  const { final, traj, categories } = series.months[m];
  if (final < 35) return { limit: 0, binding: "SCORE" };
  const factor = 0.25 + ((final - 35) / 65) * (1.5 - 0.25);
  const trend = clamp(1 + (0.2 * (traj - 50)) / 50, 0.8, 1.2);
  let raw = series.seed.inflow * factor * trend;
  let binding: LimitDecision["bindingConstraint"] = "SCORE";
  const liquidity = categories.find((c) => c.category === "LIQUIDITY")!.level;
  if (liquidity < 30) {
    raw *= 0.5;
    binding = "RUNWAY";
  }
  const debt = categories.find((c) => c.category === "DEBT_SERVICE")!.level;
  const dscrCap = series.seed.inflow * 1.6 * (debt / 100);
  if (dscrCap < raw) {
    raw = dscrCap;
    binding = "DSCR";
  }
  return { limit: Math.round(raw / 1000) * 1000, binding };
}

// ---------------------------------------------------------------------------
// Public API, shaped like SPEC §12.5

const cache = new Map<Profile, EntitySeries[]>();

function allSeries(profile: Profile): EntitySeries[] {
  let hit = cache.get(profile);
  if (!hit) {
    hit = SEEDS.map((s) => scoreEntity(s, profile));
    cache.set(profile, hit);
  }
  return hit;
}

function monthIndex(month: string): number {
  const i = MONTHS.indexOf(month);
  return i < 0 ? MONTHS.length - 1 : i;
}

function rowAt(series: EntitySeries, m: number): PortfolioRow {
  const { seed, months, regimes, statuses } = series;
  const x = months[m];
  const recent = alertsFor(series).filter((a) => {
    const k = MONTHS.indexOf(a.month);
    return a.direction === "NEGATIVE" && k <= m && k > m - 3;
  });
  return {
    id: seed.id,
    name: seed.name,
    entityType: seed.entityType,
    final: x.final,
    level: x.level,
    traj: x.traj,
    band: bandLetter(x.final),
    status: statuses[m],
    regime: regimes[m],
    delta3m: round1(x.final - months[Math.max(0, m - 3)].final),
    sparkline: months.slice(Math.max(0, m - 11), m + 1).map((p) => p.final),
    activeAlerts: recent.length,
    confidence: seed.confidence,
  };
}

export function mockPortfolio(profile: Profile, month: string): Portfolio {
  const m = monthIndex(month);
  const rows = allSeries(profile)
    .map((s) => rowAt(s, m))
    .sort((a, b) => b.final - a.final);
  return { profile, month, rows };
}

export function mockEntity(id: string, profile: Profile, month: string): EntityDetail | null {
  const m = monthIndex(month);
  const all = allSeries(profile);
  const series = all.find((s) => s.seed.id === id);
  if (!series) return null;

  const row = rowAt(series, m);
  const timeline: TimelinePoint[] = series.months.slice(0, m + 1).map((p, i) => ({
    month: MONTHS[i],
    final: p.final,
    level: p.level,
    traj: p.traj,
    status: series.statuses[i],
    regime: series.regimes[i],
  }));

  const now = limitAt(series, m);
  const prev = limitAt(series, Math.max(0, m - 1));
  const band = bandLetter(row.final);
  let action: LimitDecision["action"] = "MAINTAIN";
  if (band === "E") action = prev.limit > 0 ? "FREEZE" : "DECLINE";
  else if (now.limit >= prev.limit * 1.1) action = "INCREASE";
  else if (now.limit <= prev.limit * 0.9) action = "REDUCE";

  const prevBand = bandLetter(series.months[Math.max(0, m - 1)].final);
  const baseRate = 0.0025;
  const mult = PREMIUM_MULT[band];
  const prevMult = PREMIUM_MULT[prevBand];

  // FUND view is ranked on the FUND profile whatever the active profile is.
  const fund = allSeries("FUND").map((s) => ({ id: s.seed.id, final: s.months[m].final, traj: s.months[m].traj, level: s.months[m].level }));
  const fundSorted = [...fund].sort((a, b) => b.final - a.final);
  const me = fund.find((f) => f.id === id)!;
  const below = fund.filter((f) => f.traj < me.traj).length;

  return {
    id,
    name: series.seed.name,
    entityType: series.seed.entityType,
    row,
    categories: series.months[m].categories,
    timeline,
    limit: {
      limitEur: now.limit,
      previousLimitEur: prev.limit,
      spreadBps: SPREAD_BPS[band],
      action,
      bindingConstraint: now.binding,
    },
    premium: {
      premiumRate: mult === null ? null : baseRate * mult,
      previousPremiumRate: prevMult === null ? null : baseRate * prevMult,
      recommendedBuyerLimitEur: Math.round((series.seed.inflow * 0.6 * (row.final / 100)) / 1000) * 1000,
    },
    momentum: {
      rank: fundSorted.findIndex((f) => f.id === id) + 1,
      of: fund.length,
      trajPercentile: Math.round((below / (fund.length - 1)) * 100),
      risingStar: me.level < 60 && me.traj >= 70,
    },
  };
}

export function mockMonitor(profile: Profile, month: string): MonitorData {
  const m = monthIndex(month);
  const all = allSeries(profile);
  const alerts = all
    .flatMap((s) => alertsFor(s))
    .filter((a) => {
      const k = MONTHS.indexOf(a.month);
      return k <= m && k > m - 6;
    })
    .sort((a, b) => (a.month === b.month ? severityRank(b) - severityRank(a) : a.month < b.month ? 1 : -1));
  const watchlist = all
    .map((s) => ({ row: rowAt(s, m), alerts: alertsFor(s) }))
    .filter(({ alerts }) => {
      const active = alerts.filter((a) => {
        const k = MONTHS.indexOf(a.month);
        return a.direction === "NEGATIVE" && k <= m && k > m - 3;
      });
      return active.some((a) => a.severity === "CRITICAL") || active.filter((a) => a.severity === "WARN").length >= 2;
    })
    .map(({ row }) => row)
    .sort((a, b) => a.final - b.final);
  return { alerts, watchlist };
}

function severityRank(a: Alert): number {
  return a.severity === "CRITICAL" ? 2 : a.severity === "WARN" ? 1 : 0;
}

/** The showcase pair of SPEC §10.4: similar score today, opposite trajectories. */
export const SHOWCASE_PAIR = { a: "G-002", b: "G-003" } as const;

export function mockEntityNames(): { id: string; name: string }[] {
  return SEEDS.map((s) => ({ id: s.id, name: s.name }));
}
