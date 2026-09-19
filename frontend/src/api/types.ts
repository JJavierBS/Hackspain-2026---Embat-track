// types.ts — mirrors the backend DTOs. Keep in sync with the shared contract.
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
  activeAlerts: number;
  confidence: Confidence | null;
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
}

export interface Changepoint {
  series: string;
  month: string;
  alarmMonth: string;
  direction: "UP" | "DOWN";
}

export interface LimitDecision {
  limitEur: number;
  previousLimitEur: number;
  spreadBps: number | null;
  action: "INCREASE" | "REDUCE" | "FREEZE" | "MAINTAIN" | "DECLINE";
  bindingConstraint: "SCORE" | "DSCR" | "RUNWAY";
}

export interface PremiumQuote {
  premiumRate: number | null;
  previousPremiumRate: number | null;
  recommendedBuyerLimitEur: number;
}

export interface MomentumView {
  rank: number;
  of: number;
  trajPercentile: number;
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
  /** null until Block 7. */
  limit: LimitDecision | null;
  premium: PremiumQuote | null;
  momentum: MomentumView | null;
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

export interface Alert {
  id: string;
  entityId: string;
  entityName: string;
  month: string;
  code: string;
  severity: Severity;
  direction: Direction;
  message: string;
}

export interface MonitorData {
  alerts: Alert[];
  watchlist: PortfolioRow[];
}
