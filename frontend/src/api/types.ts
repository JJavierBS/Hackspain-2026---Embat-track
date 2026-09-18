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

// Draft DTOs for SPEC §12.5. Block 4 aligns them with the backend records.

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

export interface PortfolioRow {
  id: string;
  name: string;
  entityType: "GROUP" | "COMPANY";
  final: number;
  level: number;
  traj: number;
  band: BandLetter;
  status: Status;
  regime: Regime;
  delta3m: number;
  /** Final score of the last 12 months up to the selected month, oldest first. */
  sparkline: number[];
  activeAlerts: number;
  confidence: Confidence;
}

export interface Portfolio {
  profile: string;
  month: string;
  rows: PortfolioRow[];
}

export interface CategoryScore {
  category: Category;
  level: number;
  traj: number;
  weight: number;
  /** Points this category adds to (or takes from) Final − 50. */
  contribution: number;
  /** Change of the contribution vs 3 months before. */
  contributionDelta3m: number;
}

export interface TimelinePoint {
  month: string;
  final: number;
  level: number;
  traj: number;
  status: Status;
  regime: Regime;
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
  entityType: "GROUP" | "COMPANY";
  row: PortfolioRow;
  categories: CategoryScore[];
  /** Up to the selected month (causal). */
  timeline: TimelinePoint[];
  limit: LimitDecision;
  premium: PremiumQuote;
  momentum: MomentumView;
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
