# Product

## Platform

web

## Users
- SMEs that use Embat: the buyer (see "Buyer" below). They see their own score, limit and explanation.
- Bank credit risk managers who set and review working-capital limits for SME clients.
- Investment fund managers who screen SMEs for momentum ("rising stars").
- Trade-credit insurers who price premiums on the buyers they insure.
- The HackSpain 2026 jury (Embat track), who navigate the deployed demo on Sunday at 11:00.

Their job: see in seconds who is healthy, who improves, who starts to turn, and why.

## Product Purpose
X-Ray scores the financial health of SME groups and companies every month (0–100) from their money trail: bank transactions, invoices and debt. The score splits into Level (how healthy now) and Trajectory (where it heads). It explains each number, separates a dip from a structural decline, measures how many months early it saw a change, and raises alerts on its own.

Success: a banker opens one entity and understands the score, its direction, the drivers and the limit action without help.

## Buyer: who pays and why

Decision of 2026-09-19. It uses only facts that do not change with the dataset.

**Who pays first: the SME that uses Embat.** It buys X-Ray as a module of its Embat plan.
**Who pays second: the lender or insurer**, and only with the SME's consent. It pays Embat a fee for each credit line or policy opened through X-Ray.

Why the SME is the first buyer:
- The brief says it: "la empresa que os entrega los datos es el comprador más obvio".
- The data belongs to the SME. No bank or insurer can see a score without its consent, so every sale to a lender starts with the SME.
- Embat already sells treasury software to these companies. X-Ray is a module in the same contract: no new data, no new sales channel.

Why it pays off:
- **For the SME:** a working-capital limit that is recalculated every month from its own cash flow. It does not send the same dossier to eight banks. When its score goes up, its limit goes up and its band, and so its spread, improves.
- **For the lender:** the limit shrinks when the cash flow gets worse, without a manual annual review. The Methodology page shows how often the engine cut a limit before a proxy event.

Price (structure, no amount): a flat monthly fee for the SME module, plus a fee in basis points on each line a lender opens. No fact supports an amount yet, so we give none. The spread grid and the premium multipliers in the config are our assumptions, not market data (`docs/WEIGHTS.md` §12).

In the demo, show the numbers of one entity on the Entity page (limit, rate, limit action). Do not quote dataset totals: they change with the hidden test data.

Pitch line (ES): "Paga la pyme cliente de Embat, porque ya nos da los datos y a cambio obtiene una línea de circulante que se recalcula sola cada mes. El banco paga por línea abierta, porque el límite baja cuando la caja empeora."

## Positioning
Incumbents (Informa D&B, Axesor) score on annual filed accounts. X-Ray scores monthly real cash flow, with trajectory, measured anticipation and a per-entity explanation, and re-weights the same score per buyer (BANK, FUND, INSURER).

## Operating Context
- Main viewing context: a projector during the pitch, plus a laptop, plus a jury member on another device. Numbers must read at a distance.
- Global `profile` (BANK | FUND | INSURER) and `month` (2024-09 … 2026-08) live in the URL. Every view is linkable.
- Pages: Portfolio, Entity, Monitor (alert replay), Compare, Methodology, Algorithm (expert configuration with client presets. In demo mode the expert edits a draft and previews it on one entity, but cannot recalculate; `docs/ALGORITHM_PAGE.md`). The Entity page tunes one entity by sector (four sourced sector presets, anchors only, what-if, nothing stored; `docs/PRESETS.md`).
- UI copy in Spanish. Code in English.

## Capabilities and Constraints
- Score bands: S ≥ 90, A 80–89.9, B 65–79.9, C 50–64.9, D 35–49.9, E < 35. One accent color per band.
- Green and red mean direction only (improve / deteriorate).
- Statuses: Excepcional, Sano, Mejorando, Empieza a torcerse, Bache, Deterioro, Crítico, Vigilar.
- Every number has a tooltip with its definition.
- No page takes more than 1 s after the pipeline runs. No external API calls at runtime.
- Stack: React 19, TypeScript, Vite, Tailwind 4, Recharts, TanStack Query.

## Brand Commitments
- Product name: X-Ray. Team name: Byte_Me (user answer to the brand question; read as the team signature).
- Default theme: light.

## Evidence on Hand
- Synthetic Embat dataset only. No real default labels. Anticipation is measured against proxy events.
- No customers, testimonials or benchmarks exist. Do not invent them.

## Product Principles
1. The number first: score, band and direction are visible before any detail.
2. Every number explains itself.
3. Direction beats snapshot: trajectory is as prominent as level.
4. Honest caveats: proxies and synthetic data are labeled, not hidden.
5. One switch changes the buyer view everywhere.

## Accessibility & Inclusion
- Band and direction never rely on color alone: pair color with a letter, an arrow or a sign.
- Contrast readable on a projector.
