/**
 * Synthetic demo data. It follows the SPEC formulas in simplified form so the
 * screens behave like the real engine: category trajectories (§7.2), profile
 * weights and λ (§7.4), exact contributions (§7.5), statuses (§8.3), alerts
 * (§8.5), the limit engine, premium and momentum (§10, phase 5 contract items 3–5).
 * Nothing here is Embat data.
 */
import { ApiError } from "../api/client";
import type {
  Alert,
  AlertCode,
  AlertRuleInfo,
  BandLetter,
  Category,
  CategoryScore,
  Confidence,
  Direction,
  EntityDetail,
  EntityEvent,
  EventTrigger,
  LeadTime,
  LeadTimeBlock,
  LeadTimeExample,
  LimitAction,
  LimitDecision,
  LimitSimulation,
  Meta,
  Methodology,
  MomentumView,
  MonitorData,
  Portfolio,
  PortfolioRow,
  PremiumQuote,
  Profiles,
  Regime,
  ReplayFrame,
  Severity,
  ShowcasePair,
  ShowcasePairs,
  SimulateLimitRequest,
  Status,
  TimelinePoint,
  Watchlist,
  WatchlistRow,
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
  { id: "G-009", name: "Logística Ebro", entityType: "GROUP", base: 46, path: "recovery", amplitude: 18, confidence: "HIGH", inflow: 1_300_000 },
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
        effectiveWeight: w[c] / 100,
        nAvailable: 3,
        contribution: (w[c] / 100) * (blended - 50),
        contributionDelta3m: 0,
      };
    });
    categories.push({
      category: "MOMENTUM",
      level: round1(momentum),
      traj: round1(momentum),
      weight: w.MOMENTUM,
      effectiveWeight: w.MOMENTUM / 100,
      nAvailable: 3,
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
  // The shown contributions add up exactly to the shown score (SPEC §7.5).
  months.forEach((ms) => {
    ms.final = round1(clamp(50 + ms.categories.reduce((a, c) => a + c.contribution, 0)));
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
// Product and alert parameters. Synthetic numbers shaped like /api/methodology:
// they are test data for this generator, NOT the values of scoring-config.yml.

const PARAMS: Omit<Methodology, "alertRules"> = {
  products: { limitProfile: "BANK", premiumProfile: "INSURER", momentumProfile: "FUND" },
  limitEngine: {
    scoreFloor: 35,
    factorAtFloor: 0.25,
    factorAt100: 1.5,
    trendModifierSpan: 0.2,
    runwayGuardBelowMonths: 3,
    runwayGuardMultiplier: 0.5,
    dscrMin: 1.25,
    defaultTermMonths: 12,
    referenceRate: 0.035,
    referenceRateIsExample: true,
    spreadBpsByBand: { A: 90, B: 150, C: 250, D: 400 },
    actionThreshold: 0.1,
    roundingEur: 1000,
  },
  insurer: { basePremiumRate: 0.0025, multiplierByBand: { A: 0.8, B: 1, C: 1.4, D: 2 } },
  momentum: { risingStarMaxLevel: 60, risingStarMinTraj: 70 },
  watchlist: { minCritical: 1, minWarn: 2 },
};

const L = PARAMS.limitEngine;

function levelOf(ms: MonthScore, c: BaseCategory): number {
  return ms.categories.find((x) => x.category === c)?.level ?? 50;
}

function trajOf(ms: MonthScore, c: BaseCategory): number {
  return ms.categories.find((x) => x.category === c)?.traj ?? 50;
}

const floorTo = (v: number, step: number) => Math.floor(v / step) * step;

// ---------------------------------------------------------------------------
// Limit engine (contract item 3, on synthetic inputs)

interface LimitRow extends LimitDecision {
  nocf: number;
  debtService: number;
}

function limitFactor(final: number): number {
  if (final < L.scoreFloor) return 0;
  return L.factorAtFloor + ((final - L.scoreFloor) / (100 - L.scoreFloor)) * (L.factorAt100 - L.factorAtFloor);
}

function annualCostFactor(term: number, spreadBps: number | null): number {
  return 12 / term + L.referenceRate + (spreadBps ?? 0) / 10000;
}

const limitCache = new Map<string, LimitRow[]>();

/** The limit decisions of one entity, month by month, from the limit profile (F5). */
function limitHistory(id: string): LimitRow[] {
  const hit = limitCache.get(id);
  if (hit) return hit;
  const series = allSeries("BANK").find((s) => s.seed.id === id)!;
  const { inflow } = series.seed;
  const rows: LimitRow[] = [];
  series.months.forEach((ms, m) => {
    const band = bandLetter(ms.final);
    const spreadBps = L.spreadBpsByBand[band] ?? null;
    const baseEur = floorTo(inflow * (0.85 + (0.3 * levelOf(ms, "OPERATING_CASH_FLOW")) / 100), L.roundingEur);
    const factor = limitFactor(ms.final);
    const trend = clamp(1 + (L.trendModifierSpan * (ms.traj - 50)) / 50, 1 - L.trendModifierSpan, 1 + L.trendModifierSpan);
    // Mock runway in months: liquidity level / 10.
    const runwayGuard = levelOf(ms, "LIQUIDITY") / 10 < L.runwayGuardBelowMonths;
    const rawLimit = baseEur * factor * trend * (runwayGuard ? L.runwayGuardMultiplier : 1);
    const nocf = inflow * 12 * (0.04 + (0.16 * levelOf(ms, "OPERATING_CASH_FLOW")) / 100);
    const debtService = inflow * 12 * 0.08 * (1 - levelOf(ms, "DEBT_SERVICE") / 100);
    const acf = annualCostFactor(L.defaultTermMonths, spreadBps);
    const dscrCapEur = spreadBps === null ? null : Math.max(0, nocf / L.dscrMin - debtService) / acf;
    const limitEur = spreadBps === null ? 0 : floorTo(Math.min(rawLimit, dscrCapEur ?? Infinity), L.roundingEur);
    const bindingConstraint = dscrCapEur !== null && dscrCapEur < rawLimit ? "DSCR" : runwayGuard ? "RUNWAY" : "SCORE";
    const denom = debtService + limitEur * acf;
    const prev = m > 0 ? rows[m - 1].limitEur : null;
    const t = L.actionThreshold;
    let action: LimitAction = "MAINTAIN";
    if (limitEur === 0 && prev !== null && prev > 0) action = "FREEZE";
    else if (spreadBps === null) action = "DECLINE";
    else if (prev === null) action = "MAINTAIN";
    else if (limitEur > prev && limitEur >= prev * (1 + t)) action = "INCREASE";
    else if (limitEur < prev && limitEur <= prev * (1 - t)) action = "REDUCE";
    rows.push({
      month: MONTHS[m],
      profile: PARAMS.products.limitProfile,
      final: ms.final,
      band,
      limitEur,
      previousLimitEur: prev,
      action,
      bindingConstraint,
      spreadBps,
      allInRate: spreadBps === null ? null : round4(L.referenceRate + spreadBps / 10000),
      projectedDscr: denom === 0 ? null : round2(nocf / denom),
      baseEur,
      factor: round4(factor),
      trend: round4(trend),
      runwayGuard,
      dscrCapEur: dscrCapEur === null ? null : Math.round(dscrCapEur),
      nocf,
      debtService,
    });
  });
  limitCache.set(id, rows);
  return rows;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;

function publicLimit(row: LimitRow): LimitDecision {
  const { nocf: _nocf, debtService: _debtService, ...decision } = row;
  return decision;
}

// ---------------------------------------------------------------------------
// Premium (contract item 4) and momentum (contract item 5)

function premiumAt(id: string, m: number): PremiumQuote {
  const series = allSeries("INSURER").find((s) => s.seed.id === id)!;
  const ms = series.months[m];
  const band = bandLetter(ms.final);
  const rate = (b: BandLetter) => {
    const mult = PARAMS.insurer.multiplierByBand[b];
    return mult === undefined ? null : round4(PARAMS.insurer.basePremiumRate * mult);
  };
  const insurable = PARAMS.insurer.multiplierByBand[band] !== undefined;
  const previousBand = m > 0 ? bandLetter(series.months[m - 1].final) : null;
  // Mock DPO in days: 45, longer when payment behaviour is weak.
  const dpo = 45 + (50 - levelOf(ms, "PAYMENT_BEHAVIOUR")) * 0.4;
  const purchases = series.seed.inflow * 0.8;
  return {
    month: MONTHS[m],
    profile: PARAMS.products.premiumProfile,
    final: ms.final,
    band,
    insurable,
    premiumRate: rate(band),
    previousPremiumRate: previousBand === null ? null : rate(previousBand),
    previousBand,
    tierChange: previousBand === null || previousBand === band ? null : band < previousBand ? "UP" : "DOWN",
    recommendedBuyerLimitEur: insurable ? floorTo(purchases * (dpo / 30) * limitFactor(ms.final), L.roundingEur) : 0,
  };
}

/** Mid-rank percentile of `value` among `values` (contract item 5). */
function midRank(value: number, values: number[]): number {
  if (values.length === 1) return 50;
  const less = values.filter((v) => v < value).length;
  const equal = values.filter((v) => v === value).length;
  return Math.round((100 * (less + 0.5 * (equal - 1))) / (values.length - 1));
}

function momentumAt(id: string, m: number): MomentumView {
  const peers = allSeries("FUND").map((s) => ({ id: s.seed.id, ms: s.months[m] }));
  const me = peers.find((p) => p.id === id)!.ms;
  return {
    month: MONTHS[m],
    profile: PARAMS.products.momentumProfile,
    rank: 1 + peers.filter((p) => p.ms.final > me.final).length,
    of: peers.length,
    trajPercentile: midRank(me.traj, peers.map((p) => p.ms.traj)),
    // The mock has no raw collections growth: the growth category level stands in for it.
    growthPercentile: midRank(levelOf(me, "ACTIVITY_GROWTH"), peers.map((p) => levelOf(p.ms, "ACTIVITY_GROWTH"))),
    risingStar: isRisingStar(me),
  };
}

function isRisingStar(ms: MonthScore): boolean {
  return ms.level < PARAMS.momentum.risingStarMaxLevel && ms.traj >= PARAMS.momentum.risingStarMinTraj;
}

// ---------------------------------------------------------------------------
// Alerts (simplified SPEC §8.5 and decisions F12–F16)

interface Signal {
  severity: Severity;
  direction: Direction;
  message: string;
  value: number | null;
}

const NUM1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NUM0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const fmt1 = (v: number) => NUM1.format(v).replace("-", "−");

/**
 * A state rule on one category level: active below `warn` (CRITICAL below `critical`),
 * and it clears only 5 points above `warn`, so noise does not flap it on and off.
 */
function levelRule(
  category: BaseCategory,
  warn: number,
  critical: number | null,
  text: (value: number) => string,
  value: (ms: MonthScore) => number,
) {
  return (ms: MonthScore, wasActive: boolean): Signal | null => {
    const level = levelOf(ms, category);
    if (level >= (wasActive ? warn + 5 : warn)) return null;
    const v = round2(value(ms));
    return {
      severity: critical !== null && level < critical ? "CRITICAL" : "WARN",
      direction: "NEGATIVE",
      message: text(v),
      value: v,
    };
  };
}

type StateRule = (ms: MonthScore, wasActive: boolean, m: number, series: EntitySeries) => Signal | null;

const STATE_RULES: Partial<Record<AlertCode, StateRule>> = {
  RUNWAY_LOW: levelRule("LIQUIDITY", 30, 15, (v) => `Caja para ${fmt1(v)} meses de pagos`, (ms) => levelOf(ms, "LIQUIDITY") / 10),
  DSCR_BREACH: levelRule("DEBT_SERVICE", 30, 15, (v) => `DSCR ${fmt1(v)}x: el flujo no cubre la deuda con holgura`, (ms) => 0.4 + levelOf(ms, "DEBT_SERVICE") / 40),
  LINE_UTIL_HIGH: levelRule("LEVERAGE", 28, null, (v) => `Pólizas dispuestas al ${NUM0.format(v * 100)} %`, (ms) => 1 - levelOf(ms, "LEVERAGE") / 200),
  SUPPLIER_LATENESS_UP: levelRule("PAYMENT_BEHAVIOUR", 32, null, (v) => `Paga a proveedores ${NUM0.format(v)} días tarde de media`, (ms) => (60 - levelOf(ms, "PAYMENT_BEHAVIOUR")) / 2),
  OVERDUE_RECEIVABLES: levelRule("DELINQUENCY", 32, 18, (v) => `${NUM0.format(v * 100)} % de los cobros vencidos`, (ms) => (100 - levelOf(ms, "DELINQUENCY")) / 250),
  TAX_GAP: levelRule("TAX_REGULARITY", 28, null, (v) => `${NUM0.format(v)} meses sin pagos fiscales`, (ms) => 2 + (30 - levelOf(ms, "TAX_REGULARITY")) / 10),
  CONCENTRATION_HIGH: levelRule("CONCENTRATION", 38, null, (v) => `El primer cliente pesa el ${NUM0.format(v * 100)} % de los cobros`, (ms) => 0.2 + (40 - levelOf(ms, "CONCENTRATION")) / 100),
  DSO_DRIFT: (ms, wasActive) => {
    const traj = trajOf(ms, "PAYMENT_BEHAVIOUR");
    if (traj >= (wasActive ? 42 : 38)) return null;
    const v = Math.round((50 - traj) * 1.5);
    return { severity: "WARN", direction: "NEGATIVE", message: `El plazo de cobro sube ${v} días en 3 meses`, value: v };
  },
  SCORE_DROP: (ms, wasActive, m, series) => {
    if (m < 3) return null;
    const drop = round1(ms.final - series.months[m - 3].final);
    if (drop > (wasActive ? -6 : -8)) return null;
    return { severity: drop <= -15 ? "CRITICAL" : "WARN", direction: "NEGATIVE", message: `La nota cae ${fmt1(-drop)} puntos en 3 meses`, value: drop };
  },
  STRUCTURAL_DECLINE: (_ms, _w, m, series) =>
    series.regimes[m] === "STRUCTURAL_DECLINE"
      ? { severity: "CRITICAL", direction: "NEGATIVE", message: "Entra en deterioro estructural", value: null }
      : null,
  STRUCTURAL_IMPROVEMENT: (_ms, _w, m, series) =>
    series.regimes[m] === "STRUCTURAL_IMPROVEMENT"
      ? { severity: "INFO", direction: "POSITIVE", message: "Entra en mejora estructural", value: null }
      : null,
};

const LIMIT_ALERTS: Partial<Record<LimitAction, { severity: Severity; direction: Direction; verb: string }>> = {
  INCREASE: { severity: "INFO", direction: "POSITIVE", verb: "Sube el límite" },
  REDUCE: { severity: "WARN", direction: "NEGATIVE", verb: "Reduce el límite" },
  FREEZE: { severity: "CRITICAL", direction: "NEGATIVE", verb: "Congela el límite" },
};

const EUR0 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" });

interface AlertBook {
  /** Transitions (the `alerts` table). */
  alerts: Alert[];
  /** Month index of each alert, parallel to `alerts`. */
  monthIdx: number[];
}

const alertCache = new WeakMap<EntitySeries, AlertBook>();

/**
 * Transitions only (F12): a state rule fires when its signal appears or changes severity or
 * direction; an event rule fires every month it holds. The first month seeds the state.
 */
function alertBook(series: EntitySeries, profile: Profile): AlertBook {
  const hit = alertCache.get(series);
  if (hit) return hit;
  const { seed, months } = series;
  const book: AlertBook = { alerts: [], monthIdx: [] };
  const state = new Map<AlertCode, Signal>();
  const push = (m: number, code: AlertCode, s: Signal) => {
    book.alerts.push({
      id: `${seed.entityType}:${seed.id}:${MONTHS[m]}:${code}`,
      entityId: seed.id,
      entityName: seed.name,
      entityType: seed.entityType,
      month: MONTHS[m],
      code,
      severity: s.severity,
      direction: s.direction,
      message: s.message,
      value: s.value,
    });
    book.monthIdx.push(m);
  };
  const limits = profile === PARAMS.products.limitProfile ? limitHistory(seed.id) : null;

  months.forEach((ms, m) => {
    for (const [code, rule] of Object.entries(STATE_RULES) as [AlertCode, StateRule][]) {
      const before = state.get(code);
      const now = rule(ms, before !== undefined, m, series);
      if (now === null) state.delete(code);
      else {
        state.set(code, now);
        if (m > 0 && (before === undefined || before.severity !== now.severity || before.direction !== now.direction)) push(m, code, now);
      }
    }
    if (m === 0) return;
    const was = bandLetter(months[m - 1].final);
    const band = bandLetter(ms.final);
    if (band < was) push(m, "BAND_UPGRADE", { severity: "INFO", direction: "POSITIVE", message: `Sube de la banda ${was} a la ${band}`, value: ms.final });
    if (band > was)
      push(m, "BAND_DOWNGRADE", {
        severity: band === "E" ? "CRITICAL" : "WARN",
        direction: "NEGATIVE",
        message: `Baja de la banda ${was} a la ${band}`,
        value: ms.final,
      });
    const limit = limits?.[m];
    const rule = limit ? LIMIT_ALERTS[limit.action] : undefined;
    if (limit && rule)
      push(m, "LIMIT_ACTION", {
        ...rule,
        message: `${rule.verb}: ${EUR0.format(limit.previousLimitEur ?? 0)} → ${EUR0.format(limit.limitEur)}`,
        value: limit.limitEur,
      });
  });
  alertCache.set(series, book);
  return book;
}

/**
 * Mock approximation of the active negative states at m (F16): the negative alerts fired in
 * m−2..m. The real engine counts `alert_states` rows instead.
 */
function activeStatesAt(series: EntitySeries, profile: Profile, m: number): Alert[] {
  const book = alertBook(series, profile);
  return book.alerts.filter((a, k) => a.direction === "NEGATIVE" && book.monthIdx[k] <= m && book.monthIdx[k] > m - 3);
}

function watchlistRowAt(series: EntitySeries, profile: Profile, m: number): WatchlistRow | null {
  const active = activeStatesAt(series, profile, m);
  const criticalAlerts = active.filter((a) => a.severity === "CRITICAL").length;
  const warnAlerts = active.filter((a) => a.severity === "WARN").length;
  if (criticalAlerts < PARAMS.watchlist.minCritical && warnAlerts < PARAMS.watchlist.minWarn) return null;
  return { row: rowAt(series, profile, m), criticalAlerts, warnAlerts, codes: [...new Set(active.map((a) => a.code))] };
}

function severityRank(a: Alert): number {
  return a.severity === "CRITICAL" ? 2 : a.severity === "WARN" ? 1 : 0;
}

/** Newest month first, then CRITICAL > WARN > INFO, then entity id (contract item 8). */
function byMonthSeverity(a: Alert, b: Alert): number {
  if (a.month !== b.month) return a.month < b.month ? 1 : -1;
  if (severityRank(a) !== severityRank(b)) return severityRank(b) - severityRank(a);
  return a.entityId.localeCompare(b.entityId);
}

// ---------------------------------------------------------------------------
// Public API, shaped like the phase 5 contract (item 8)

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

function rowAt(series: EntitySeries, profile: Profile, m: number): PortfolioRow {
  const { seed, months, regimes, statuses } = series;
  const x = months[m];
  const fund = allSeries("FUND").find((s) => s.seed.id === seed.id)!;
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
    activeAlerts: activeStatesAt(series, profile, m).length,
    confidence: seed.confidence,
    risingStar: isRisingStar(fund.months[m]),
  };
}

export function mockPortfolio(profile: Profile, month: string): Portfolio {
  const m = monthIndex(month);
  const rows = allSeries(profile)
    .map((s) => rowAt(s, profile, m))
    .sort((a, b) => b.final - a.final);
  return { profile, month, unscored: 0, rows };
}

export function mockEntity(id: string, profile: Profile, month: string): EntityDetail | null {
  const m = monthIndex(month);
  const series = allSeries(profile).find((s) => s.seed.id === id);
  if (!series) return null;

  const book = alertBook(series, profile);
  const limits = limitHistory(id);
  const timeline: TimelinePoint[] = series.months.slice(0, m + 1).map((p, i) => {
    const premium = premiumAt(id, i);
    return {
      month: MONTHS[i],
      final: p.final,
      level: p.level,
      traj: p.traj,
      band: bandLetter(p.final),
      status: series.statuses[i],
      regime: series.regimes[i],
      limitEur: limits[i].limitEur,
      limitAction: limits[i].action,
      premiumRate: premium.premiumRate,
      buyerLimitEur: premium.recommendedBuyerLimitEur,
      newAlerts: book.monthIdx.filter((k) => k === i).length,
    };
  });

  return {
    id,
    name: series.seed.name,
    entityType: series.seed.entityType,
    groupId: null,
    profile,
    month,
    row: rowAt(series, profile, m),
    categories: series.months[m].categories,
    drivers: [],
    changes1m: [],
    changes3m: [],
    indicators: [],
    timeline,
    changepoints: [],
    companies: [],
    limit: publicLimit(limits[m]),
    premium: premiumAt(id, m),
    momentum: momentumAt(id, m),
    alerts: book.alerts.filter((_, k) => book.monthIdx[k] <= m).sort(byMonthSeverity).slice(0, 20),
    // Decision G8: a page at month m never shows a later event.
    events: entityEvents(id, profile).filter((e) => e.eventMonth <= MONTHS[m]),
  };
}

export function mockMonitor(profile: Profile, month: string, filters: { severity?: Severity; direction?: Direction } = {}): MonitorData {
  const m = monthIndex(month);
  const alerts = allSeries(profile)
    .flatMap((s) => {
      const book = alertBook(s, profile);
      return book.alerts.filter((_, k) => book.monthIdx[k] <= m && book.monthIdx[k] > m - 6);
    })
    .filter((a) => (!filters.severity || a.severity === filters.severity) && (!filters.direction || a.direction === filters.direction))
    .sort(byMonthSeverity);
  return { profile, month, fromMonth: MONTHS[Math.max(0, m - 5)], alerts, watchlist: mockWatchlist(profile, month).rows };
}

export function mockWatchlist(profile: Profile, month: string): Watchlist {
  const m = monthIndex(month);
  const rows = allSeries(profile)
    .map((s) => watchlistRowAt(s, profile, m))
    .filter((r): r is WatchlistRow => r !== null)
    .sort((a, b) => b.criticalAlerts - a.criticalAlerts || b.warnAlerts - a.warnAlerts || a.row.final - b.row.final);
  return { profile, month, rows };
}

/** One frame per month of from..to, like the "month" events of GET /api/monitor/replay. */
export function mockReplayFrames(profile: Profile, from: string, to: string): ReplayFrame[] {
  const all = allSeries(profile).flatMap((s) => alertBook(s, profile).alerts);
  return MONTHS.filter((month) => month >= from && month <= to).map((month) => ({
    month,
    newAlerts: all.filter((a) => a.month === month).sort(byMonthSeverity),
    watchlistSize: mockWatchlist(profile, month).rows.length,
  }));
}

/** POST /api/entities/{id}/limit/simulate on the stored mock decision. The term does not change the mock capacity. */
export function mockSimulate(id: string, body: SimulateLimitRequest): LimitSimulation {
  if (!SEEDS.some((s) => s.id === id)) throw new ApiError(404, `Entidad ${id} no encontrada`);
  if (!(body.requestedAmountEur > 0)) throw new ApiError(400, "El importe solicitado tiene que ser mayor que 0.");
  const termMonths = body.termMonths ?? L.defaultTermMonths;
  if (termMonths < 1 || termMonths > 120) throw new ApiError(400, "El plazo tiene que estar entre 1 y 120 meses.");
  const row = limitHistory(id)[monthIndex(body.month ?? MONTHS[MONTHS.length - 1])];
  const capacityEur = row.limitEur;
  const decision = body.requestedAmountEur <= capacityEur ? "APPROVE" : capacityEur > 0 ? "PARTIAL" : "DECLINE";
  const approvedAmountEur = decision === "APPROVE" ? body.requestedAmountEur : capacityEur;
  const denom = row.debtService + approvedAmountEur * annualCostFactor(termMonths, row.spreadBps);
  return {
    month: row.month,
    decision,
    requestedAmountEur: body.requestedAmountEur,
    approvedAmountEur,
    capacityEur,
    termMonths,
    spreadBps: row.spreadBps,
    allInRate: row.allInRate,
    projectedDscr: denom === 0 ? null : round2(row.nocf / denom),
    bindingConstraint: row.spreadBps === null ? "BAND" : row.bindingConstraint,
  };
}

const TRIGGERS: Record<AlertCode, { direction: AlertRuleInfo["direction"]; event: boolean; trigger: string }> = {
  RUNWAY_LOW: { direction: "NEGATIVE", event: false, trigger: "< 3 meses de caja / < 1,5 meses" },
  DSCR_BREACH: { direction: "NEGATIVE", event: false, trigger: "DSCR < 1,2x / < 1,0x" },
  LINE_UTIL_HIGH: { direction: "NEGATIVE", event: false, trigger: "Pólizas dispuestas > 85 %" },
  DSO_DRIFT: { direction: "NEGATIVE", event: false, trigger: "Plazo de cobro + 15 días en 3 meses" },
  SUPPLIER_LATENESS_UP: { direction: "NEGATIVE", event: false, trigger: "Retraso medio a proveedores > 10 días" },
  OVERDUE_RECEIVABLES: { direction: "NEGATIVE", event: false, trigger: "Cobros vencidos > 15 % / > 30 %" },
  TAX_GAP: { direction: "NEGATIVE", event: false, trigger: "Sin pago fiscal durante 2 ciclos de su calendario" },
  CONCENTRATION_HIGH: { direction: "NEGATIVE", event: false, trigger: "Primer cliente > 40 % de los cobros" },
  FACTORING_SPIKE: { direction: "NEGATIVE", event: false, trigger: "Financiación de circulante × 2 frente a los 3 meses previos" },
  SCORE_DROP: { direction: "NEGATIVE", event: false, trigger: "Nota − 8 puntos en 3 meses / − 15" },
  STRUCTURAL_DECLINE: { direction: "NEGATIVE", event: false, trigger: "Régimen de deterioro estructural" },
  STRUCTURAL_IMPROVEMENT: { direction: "POSITIVE", event: false, trigger: "Régimen de mejora estructural" },
  BAND_UPGRADE: { direction: "POSITIVE", event: true, trigger: "Sube una banda o más" },
  BAND_DOWNGRADE: { direction: "NEGATIVE", event: true, trigger: "Baja una banda o más" },
  LIMIT_ACTION: { direction: "BOTH", event: true, trigger: "El motor sube, reduce o congela el límite" },
};

/** GET /api/methodology. Synthetic: the parameters are this generator's, not the config's. */
export function mockMethodology(): Methodology {
  const fired = new Map<AlertCode, number>();
  for (const profile of Object.keys(WEIGHTS) as Profile[])
    for (const s of allSeries(profile)) for (const a of alertBook(s, profile).alerts) fired.set(a.code, (fired.get(a.code) ?? 0) + 1);
  return {
    alertRules: (Object.keys(TRIGGERS) as AlertCode[]).map((code) => ({ code, ...TRIGGERS[code], fired: fired.get(code) ?? 0 })),
    ...PARAMS,
  };
}


export function mockEntityNames(): { id: string; name: string }[] {
  return SEEDS.map((s) => ({ id: s.id, name: s.name }));
}

/** The synthetic weight tables of this generator, shaped like GET /api/profiles. */
export function mockProfiles(): Profiles {
  return {
    source: "config",
    profiles: (Object.keys(WEIGHTS) as Profile[]).map((profile) => ({
      profile,
      lambda: WEIGHTS[profile].lambda,
      weights: WEIGHTS[profile].w,
    })),
  };
}

export function mockMeta(): Meta {
  return {
    unit: "GROUP",
    months: [...MONTHS],
    profiles: Object.keys(WEIGHTS),
    entityCounts: { GROUP: SEEDS.length },
    runId: null,
    finishedAt: null,
    demoMode: true,
    explanationsReady: false,
    dynamicsReady: false,
    alertsReady: true,
    productsReady: true,
    analyticsReady: true,
    caveats: ["Datos sintéticos de demostración: no proceden de Embat."],
  };
}

// ---------------------------------------------------------------------------
// Lead time and showcase pairs (phase 6 decisions G3–G9, on synthetic inputs).
// The event triggers are scaled to this generator's series, NOT the values of
// scoring-config.yml: the mock runway is the liquidity level / 10, the mock DSCR
// comes from the debt service level, as in the alert rules above.

const LEAD = {
  minHistoryMonths: 6,
  windowMonths: 12,
  horizonMonths: 6,
  runwayBelowMonths: 3,
  dscrBelow: 1,
  overdueMaxLevel: 20,
  scoreBelow: 35,
  improvementCross: 65,
  improvementBelow: 50,
  improvementBelowMonths: 3,
  signalMaxTraj: 35,
  signalMinTraj: 65,
};

const mockRunway = (ms: MonthScore) => levelOf(ms, "LIQUIDITY") / 10;
const mockDscr = (ms: MonthScore) => 0.4 + levelOf(ms, "DEBT_SERVICE") / 40;

/** G3: the deterioration trigger that holds at m (first match wins), or null. */
function deteriorationAt(series: EntitySeries, m: number): EventTrigger | null {
  const { months } = series;
  const twoMonths = (test: (ms: MonthScore) => boolean) => m >= 1 && test(months[m - 1]) && test(months[m]);
  if (twoMonths((ms) => mockRunway(ms) < LEAD.runwayBelowMonths)) return "RUNWAY";
  if (twoMonths((ms) => mockDscr(ms) < LEAD.dscrBelow)) return "DSCR";
  const ms = months[m];
  if (levelOf(ms, "DELINQUENCY") <= LEAD.overdueMaxLevel && levelOf(ms, "PAYMENT_BEHAVIOUR") <= LEAD.overdueMaxLevel) return "OVERDUE";
  if (ms.final < LEAD.scoreBelow) return "SCORE";
  return null;
}

/** G4: level crosses up through the line, after a stretch below the lower line. */
function improvementAt(series: EntitySeries, m: number): boolean {
  const { months } = series;
  if (m < 1 || months[m].level < LEAD.improvementCross || months[m - 1].level >= LEAD.improvementCross) return false;
  let run = 0;
  for (let k = Math.max(0, m - 12); k < m; k++) {
    run = months[k].level < LEAD.improvementBelow ? run + 1 : 0;
    if (run >= LEAD.improvementBelowMonths) return true;
  }
  return false;
}

/** G5: the signal of each direction at m. */
function signalAt(series: EntitySeries, m: number, type: EntityEvent["eventType"]): boolean {
  const { traj } = series.months[m];
  const status = series.statuses[m];
  if (type === "DETERIORATION") return status === "TURNING" || status === "STRUCTURAL_DECLINE" || traj <= LEAD.signalMaxTraj;
  return status === "IMPROVING" || series.regimes[m] === "STRUCTURAL_IMPROVEMENT" || traj >= LEAD.signalMinTraj;
}

function firstIn(from: number, to: number, test: (m: number) => boolean): number | null {
  for (let m = Math.max(0, from); m <= to; m++) if (test(m)) return m;
  return null;
}

/** G3/G4: the first onset with enough history before it; an entity already in the condition early on is censored. */
function firstOnset(test: (m: number) => boolean): number | null {
  if (firstIn(0, LEAD.minHistoryMonths - 1, test) !== null) return null;
  return firstIn(LEAD.minHistoryMonths, MONTHS.length - 1, (m) => test(m) && !test(m - 1));
}

function buildEvent(series: EntitySeries, profile: Profile, type: EntityEvent["eventType"], trigger: EventTrigger, e: number): EntityEvent {
  const s = firstIn(e - LEAD.windowMonths, e, (m) => signalAt(series, m, type));
  let limitSignal: number | null = null;
  if (type === "DETERIORATION" && profile === PARAMS.products.limitProfile) {
    const limits = limitHistory(series.seed.id);
    limitSignal = firstIn(e - LEAD.windowMonths, e, (m) => limits[m].action === "REDUCE" || limits[m].action === "FREEZE");
  }
  return {
    eventType: type,
    trigger,
    eventMonth: MONTHS[e],
    signalMonth: s === null ? null : MONTHS[s],
    leadMonths: s === null ? null : e - s,
    limitSignalMonth: limitSignal === null ? null : MONTHS[limitSignal],
    limitLeadMonths: limitSignal === null ? null : e - limitSignal,
  };
}

const eventCache = new Map<string, EntityEvent[]>();

/** All lead-time events of one entity in one profile, oldest first (the Timeline shape). */
function entityEvents(id: string, profile: Profile): EntityEvent[] {
  const key = `${profile}:${id}`;
  const hit = eventCache.get(key);
  if (hit) return hit;
  const series = allSeries(profile).find((s) => s.seed.id === id)!;
  const events: EntityEvent[] = [];
  const e = firstOnset((m) => deteriorationAt(series, m) !== null);
  if (e !== null) events.push(buildEvent(series, profile, "DETERIORATION", deteriorationAt(series, e)!, e));
  else if (profile === PARAMS.products.limitProfile && id === demoDownId()) {
    // Scripted demo case: the "down" entity of the limit profile's top pair gets a runway event at the
    // last month, so the limit cut, the signal and the event line up on mocks (plan B Task 2).
    events.push(buildEvent(series, profile, "DETERIORATION", "RUNWAY", MONTHS.length - 1));
  }
  const i = firstOnset((m) => improvementAt(series, m));
  if (i !== null) events.push(buildEvent(series, profile, "IMPROVEMENT", "LEVEL_CROSS", i));
  events.sort((a, b) => a.eventMonth.localeCompare(b.eventMonth));
  eventCache.set(key, events);
  return events;
}

function demoDownId(): string | undefined {
  return mockShowcasePairs(PARAMS.products.limitProfile as Profile, MONTHS[MONTHS.length - 1]).pairs[0]?.down.id;
}

/** GET /api/analytics/showcase-pairs, ranked as decision G9 says. */
export function mockShowcasePairs(profile: Profile, month: string): ShowcasePairs {
  const m = monthIndex(month);
  const rows = mockPortfolio(profile, MONTHS[m]).rows.filter((r) => r.traj !== null);
  const candidates: ShowcasePair[] = [];
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const finalGap = Math.abs(rows[i].final - rows[j].final);
      if (finalGap > 3) continue;
      const [up, down] = rows[i].traj! >= rows[j].traj! ? [rows[i], rows[j]] : [rows[j], rows[i]];
      const side = (r: PortfolioRow) => ({ id: r.id, name: r.name, final: r.final, traj: r.traj! });
      candidates.push({
        rank: 0,
        meetsSpec: up.traj! >= 65 && down.traj! <= 35,
        up: side(up),
        down: side(down),
        finalGap: round1(finalGap),
        trajGap: round1(up.traj! - down.traj!),
      });
    }
  candidates.sort(
    (a, b) =>
      Number(b.meetsSpec) - Number(a.meetsSpec) ||
      b.trajGap - a.trajGap ||
      a.finalGap - b.finalGap ||
      a.up.id.localeCompare(b.up.id) ||
      a.down.id.localeCompare(b.down.id),
  );
  const used = new Set<string>();
  const pairs: ShowcasePair[] = [];
  for (const c of candidates) {
    if (pairs.length === 10) break;
    if (used.has(c.up.id) || used.has(c.down.id)) continue;
    used.add(c.up.id);
    used.add(c.down.id);
    pairs.push({ ...c, rank: pairs.length + 1 });
  }
  return { profile, month: MONTHS[m], pairs };
}

const TRIGGERS_BY_TYPE: Record<EntityEvent["eventType"], EventTrigger[]> = {
  DETERIORATION: ["RUNWAY", "DSCR", "OVERDUE", "SCORE"],
  IMPROVEMENT: ["LEVEL_CROSS"],
};

/**
 * One synthetic lead-time block. The mock portfolio is too small for a histogram, so the
 * counts are drawn from a seeded hump at 2–4 months; every figure is derived from them.
 */
function mockBlock(profile: Profile, eventType: EntityEvent["eventType"]): LeadTimeBlock {
  const r = rng(`${profile}:${eventType}`);
  const scale = eventType === "DETERIORATION" ? 1 : 0.45;
  const hump = [3, 2, 5, 7, 6, 4, 3, 2, 1, 1, 0, 1, 0];
  const histogram = hump.map((h, leadMonths) => ({ leadMonths, count: Math.round(h * scale * (0.7 + 0.6 * r())) }));
  const detected = histogram.reduce((a, b) => a + b.count, 0);
  const events = detected + Math.round((4 + 4 * r()) * scale);
  const detectedAhead = detected - histogram[0].count;
  const leads = histogram.flatMap((b) => Array<number>(b.count).fill(b.leadMonths));
  const triggers = TRIGGERS_BY_TYPE[eventType];
  const shares = triggers.map(() => 0.4 + r());
  const total = shares.reduce((a, b) => a + b, 0);
  let leftEvents = events;
  let leftAhead = detectedAhead;
  const byTrigger = triggers.map((trigger, k) => {
    const last = k === triggers.length - 1;
    const n = last ? leftEvents : Math.round((events * shares[k]) / total);
    const ahead = last ? leftAhead : Math.min(n, Math.round((detectedAhead * shares[k]) / total));
    leftEvents -= n;
    leftAhead -= ahead;
    return { trigger, events: n, detectedAhead: ahead };
  });
  const signals = Math.round(events * (2.2 + r()));
  const evaluable = Math.round(signals * 0.85);
  const followed = Math.round(evaluable * (0.58 + 0.12 * r()));
  const rate = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 1000) / 1000);
  return {
    eventType,
    events,
    detected,
    detectedAhead,
    detectionRate: rate(detected, events),
    aheadRate: rate(detectedAhead, events),
    meanLead: leads.length === 0 ? null : round1(leads.reduce((a, b) => a + b, 0) / leads.length),
    medianLead: leads.length === 0 ? null : median(leads),
    histogram,
    byTrigger,
    signals,
    evaluable,
    followed,
    falseAlarmRate: evaluable === 0 ? null : Math.round((1 - followed / evaluable) * 1000) / 1000,
  };
}

/** GET /api/analytics/lead-time. Aggregates are synthetic; the examples are the mock entities' own events. */
export function mockLeadTime(profile: Profile): LeadTime {
  const deterioration = mockBlock(profile, "DETERIORATION");
  const examples: LeadTimeExample[] = SEEDS.flatMap((seed) =>
    entityEvents(seed.id, profile)
      .filter((e) => e.signalMonth !== null && e.leadMonths !== null)
      .map((e) => ({
        entityId: seed.id,
        entityName: seed.name,
        eventType: e.eventType,
        trigger: e.trigger,
        eventMonth: e.eventMonth,
        signalMonth: e.signalMonth!,
        leadMonths: e.leadMonths!,
        limitSignalMonth: e.limitSignalMonth,
        limitLeadMonths: e.limitLeadMonths,
      })),
  )
    .sort(
      (a, b) =>
        (a.eventType === b.eventType ? 0 : a.eventType === "DETERIORATION" ? -1 : 1) ||
        b.leadMonths - a.leadMonths ||
        a.entityId.localeCompare(b.entityId),
    )
    .slice(0, 5);
  const isLimit = profile === PARAMS.products.limitProfile;
  const cutAhead = Math.round(deterioration.events * 0.55);
  return {
    profile,
    unit: "GROUP",
    windowMonths: LEAD.windowMonths,
    horizonMonths: LEAD.horizonMonths,
    minHistoryMonths: LEAD.minHistoryMonths,
    deterioration,
    improvement: mockBlock(profile, "IMPROVEMENT"),
    limit: isLimit ? { events: deterioration.events, cutAhead, meanLead: 4.1, medianLead: 4 } : null,
    examples,
  };
}
