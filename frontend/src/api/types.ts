// types.ts — mirrors the backend DTOs (phase 5 overview, contract item 8).
export type PipelineState = "IDLE" | "RUNNING" | "DONE" | "FAILED";

export interface PipelineStatus {
  state: PipelineState;
  runId: string | null;
  currentStage: string | null;
  percent: number;
  message: string | null;
  stageTimingsMs: Record<string, number>;
}

// Read DTOs of SPEC §12.5 (backend infrastructure/web/dto).

export type Status =
  | "CRITICAL"
  | "STRUCTURAL_DECLINE"
  | "TURNING"
  | "DIP"
  | "IMPROVING"
  | "EXCEPTIONAL"
  | "HEALTHY"
  | "WATCH";

export type Regime = "STABLE" | "DIP" | "DIP_RECOVERED" | "STRUCTURAL_DECLINE" | "STRUCTURAL_IMPROVEMENT";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type BandLetter = "A" | "B" | "C" | "D" | "E";

export type Category =
  | "LIQUIDITY"
  | "OPERATING_CASH_FLOW"
  | "ACTIVITY_GROWTH"
  | "DEBT_SERVICE"
  | "LEVERAGE"
  | "PAYMENT_BEHAVIOUR"
  | "DELINQUENCY"
  | "CONCENTRATION"
  | "TAX_REGULARITY"
  | "MOMENTUM";

export type EntityType = "GROUP" | "COMPANY";

export interface PortfolioRow {
  id: string;
  name: string;
  entityType: EntityType;
  final: number;
  level: number;
  /** null when no category has a trajectory yet (short history). */
  traj: number | null;
  band: BandLetter;
  /** null until the dynamics stage has run (phase 4 plan B). */
  status: Status | null;
  regime: Regime | null;
  /** null when the entity had no score 3 months before. */
  delta3m: number | null;
  /** Final score of up to 12 months up to the selected month, oldest first. */
  sparkline: number[];
  /** Negative active alert states at this month (F16), not transitions. */
  activeAlerts: number;
  confidence: Confidence | null;
  /** null when the entity has no momentum row this month. */
  risingStar: boolean | null;
}

export interface Portfolio {
  profile: string;
  month: string;
  /** Entities of the unit with no score this month (not active yet). */
  unscored: number;
  rows: PortfolioRow[];
}

export interface CategoryScore {
  category: Category;
  level: number | null;
  traj: number | null;
  /** Profile weight, 0–100. */
  weight: number;
  /** Renormalized share this month, 0–1 (0 when the category has no data). */
  effectiveWeight: number;
  /** Points this category adds to (or takes from) Final − 50. */
  contribution: number;
  /** Change of the contribution vs 3 months before. null when there was no score then. */
  contributionDelta3m: number | null;
  nAvailable: number;
}

export interface Driver {
  driverId: string;
  category: Category;
  contrib: number;
  blended: number;
  effWeight: number;
}

export interface Change {
  driverId: string;
  category: Category;
  delta: number;
  narrative: string;
}

export interface IndicatorRow {
  indicatorId: string;
  category: Category;
  value: number | null;
  level: number | null;
  traj: number | null;
  available: boolean;
  isStatic: boolean;
  fallback: boolean;
  /** CLOSED or PENDING (the API sends the enum name). */
  anchorStatus: string;
}

export interface TimelinePoint {
  month: string;
  final: number | null;
  level: number | null;
  traj: number | null;
  band: BandLetter | null;
  status: Status | null;
  regime: Regime | null;
  /** From the limit profile, whatever ?profile is. null when there is no limit row that month. */
  limitEur: number | null;
  limitAction: LimitAction | null;
  /** From the premium profile. null when not insurable or no premium row. */
  premiumRate: number | null;
  /** null when the exposure proxy is not computable. */
  buyerLimitEur: number | null;
  /** Alerts fired that month in ?profile. */
  newAlerts: number;
}

export interface Timeline {
  id: string;
  profile: string;
  points: TimelinePoint[];
  changepoints: Changepoint[];
  /** This entity, ?profile, oldest first. */
  alerts: Alert[];
}

export interface Changepoint {
  series: string;
  month: string;
  alarmMonth: string;
  direction: "UP" | "DOWN";
}

export type LimitAction = "INCREASE" | "REDUCE" | "FREEZE" | "MAINTAIN" | "DECLINE";
export type BindingConstraint = "SCORE" | "DSCR" | "RUNWAY";

/** GET /api/entities/{id}/limit (SPEC §10.1). */
export interface LimitDecision {
  month: string;
  profile: string;
  final: number;
  band: BandLetter;
  limitEur: number;
  /** null on the first month with a decision. */
  previousLimitEur: number | null;
  action: LimitAction;
  bindingConstraint: BindingConstraint;
  /** null when the band has no spread (no credit). */
  spreadBps: number | null;
  allInRate: number | null;
  /** null when the 12-month cash flow is missing or the denominator is 0. */
  projectedDscr: number | null;
  baseEur: number;
  factor: number;
  trend: number;
  runwayGuard: boolean;
  /** null when the 12-month cash flow is missing or the band has no spread. */
  dscrCapEur: number | null;
}

export interface SimulateLimitRequest {
  month?: string;
  requestedAmountEur: number;
  termMonths?: number;
}

/** POST /api/entities/{id}/limit/simulate. */
export interface LimitSimulation {
  month: string;
  decision: "APPROVE" | "PARTIAL" | "DECLINE";
  requestedAmountEur: number;
  approvedAmountEur: number;
  capacityEur: number;
  termMonths: number;
  spreadBps: number | null;
  allInRate: number | null;
  projectedDscr: number | null;
  bindingConstraint: BindingConstraint | "BAND";
}

/** GET /api/entities/{id}/premium (SPEC §10.2). */
export interface PremiumQuote {
  month: string;
  profile: string;
  final: number;
  band: BandLetter;
  insurable: boolean;
  /** null when not insurable. */
  premiumRate: number | null;
  previousPremiumRate: number | null;
  previousBand: BandLetter | null;
  tierChange: "UP" | "DOWN" | null;
  /** Exposure proxy. null when purchases or DPO are missing. */
  recommendedBuyerLimitEur: number | null;
}

/** SPEC §10.3. Percentiles are display only. */
export interface MomentumView {
  month: string;
  profile: string;
  rank: number;
  of: number;
  /** null when the entity has no trajectory. */
  trajPercentile: number | null;
  /** null when the collections growth is missing. */
  growthPercentile: number | null;
  risingStar: boolean;
}

export interface EntityDetail {
  id: string;
  name: string;
  entityType: EntityType;
  groupId: string | null;
  profile: string;
  month: string;
  /** null when the entity has no score at this month. */
  row: PortfolioRow | null;
  categories: CategoryScore[];
  drivers: Driver[];
  changes1m: Change[];
  changes3m: Change[];
  indicators: IndicatorRow[];
  /** Up to the selected month (causal). */
  timeline: TimelinePoint[];
  changepoints: Changepoint[];
  /** Member companies, scored standalone (groups only). */
  companies: PortfolioRow[];
  /** At ?month. null when the product has no row (or the backend predates block 7). */
  limit: LimitDecision | null;
  premium: PremiumQuote | null;
  momentum: MomentumView | null;
  /** This entity, ?profile, months <= ?month, newest first, at most 20. */
  alerts: Alert[];
}

export interface Meta {
  unit: EntityType;
  months: string[];
  profiles: string[];
  entityCounts: Record<string, number>;
  runId: string | null;
  finishedAt: string | null;
  demoMode: boolean;
  explanationsReady: boolean;
  dynamicsReady: boolean;
  alertsReady: boolean;
  productsReady: boolean;
  caveats: string[];
}

export interface ProfileWeights {
  profile: string;
  lambda: number;
  weights: Partial<Record<Category, number>>;
}

export interface Profiles {
  source: "run" | "config";
  profiles: ProfileWeights[];
}

export type Severity = "WARN" | "CRITICAL" | "INFO";
export type Direction = "NEGATIVE" | "POSITIVE";

export type AlertCode =
  | "RUNWAY_LOW"
  | "DSCR_BREACH"
  | "LINE_UTIL_HIGH"
  | "DSO_DRIFT"
  | "SUPPLIER_LATENESS_UP"
  | "OVERDUE_RECEIVABLES"
  | "TAX_GAP"
  | "CONCENTRATION_HIGH"
  | "FACTORING_SPIKE"
  | "SCORE_DROP"
  | "STRUCTURAL_DECLINE"
  | "STRUCTURAL_IMPROVEMENT"
  | "BAND_UPGRADE"
  | "BAND_DOWNGRADE"
  | "LIMIT_ACTION";

export interface Alert {
  /** `${entityType}:${entityId}:${month}:${code}` */
  id: string;
  entityId: string;
  entityName: string;
  entityType: EntityType;
  month: string;
  code: AlertCode;
  severity: Severity;
  direction: Direction;
  /** Spanish, rendered by the pipeline. */
  message: string;
  /** The raw number the alert is about. null for regime and band alerts. */
  value: number | null;
}

export interface WatchlistRow {
  row: PortfolioRow;
  criticalAlerts: number;
  warnAlerts: number;
  codes: AlertCode[];
}

/** GET /api/monitor/alerts: alerts of fromMonth..month, newest month first, then CRITICAL > WARN > INFO. */
export interface MonitorData {
  profile: string;
  month: string;
  fromMonth: string;
  alerts: Alert[];
  watchlist: WatchlistRow[];
}

/** GET /api/monitor/watchlist. */
export interface Watchlist {
  profile: string;
  month: string;
  rows: WatchlistRow[];
}

/** One "month" event of GET /api/monitor/replay (SSE). */
export interface ReplayFrame {
  month: string;
  newAlerts: Alert[];
  watchlistSize: number;
}

export interface AlertRuleInfo {
  code: AlertCode;
  direction: Direction | "BOTH";
  event: boolean;
  /** Spanish, from the config thresholds. */
  trigger: string;
  /** Alerts of the unit in the last run, all profiles. 0 = never fired. */
  fired: number;
}

/** GET /api/methodology: alert catalogue and product parameters from the current config. No weights. */
export interface Methodology {
  alertRules: AlertRuleInfo[];
  products: { limitProfile: string; premiumProfile: string; momentumProfile: string };
  limitEngine: {
    scoreFloor: number;
    factorAtFloor: number;
    factorAt100: number;
    trendModifierSpan: number;
    runwayGuardBelowMonths: number;
    runwayGuardMultiplier: number;
    dscrMin: number;
    defaultTermMonths: number;
    referenceRate: number;
    referenceRateIsExample: boolean;
    spreadBpsByBand: Partial<Record<BandLetter, number>>;
    actionThreshold: number;
    roundingEur: number;
  };
  insurer: { basePremiumRate: number; multiplierByBand: Partial<Record<BandLetter, number>> };
  momentum: { risingStarMaxLevel: number; risingStarMinTraj: number };
  watchlist: { minCritical: number; minWarn: number };
}
