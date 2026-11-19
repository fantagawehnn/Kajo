# KAJO Season Planning Model

**Status:** Season foundation, editor, reviewed AI periodization proposal, validated weekly-plan model and reviewed Coach-generated weekly proposals with explicit athlete approval are implemented. Calendar integration and adaptive week-to-week updates remain open.

## Purpose

The season plan is the athlete-approved long-term reference for the hybrid Coach mode. It is stored separately from the athlete profile and individual planned workouts.

## Top-level record

- `schemaVersion`: model version.
- `id`, `name`: stable plan identity and display name.
- `planningMode`: `hybrid`, `adaptive` or `fixed`; KAJO's selected default is `hybrid`.
- `planningHorizon`: `season`, `block` or `week`; the initial horizon is `season`.
- `status`: `draft`, `active`, `completed` or `archived`.
- `startDate`, `endDate`: inclusive season boundaries.
- `primaryGoal`, `secondaryGoals`: athlete-defined season goals.
- `phases`: ordered, non-overlapping time ranges with objectives, focus areas and optional weekly targets.
- `athleteApprovedAt`: explicit approval timestamp, when applicable.
- `createdAt`, `updatedAt`: audit timestamps.

## Phase record

A phase contains an ID, name, type, inclusive start/end dates, objective, focus areas, optional target weekly hours, optional training days and sessions per day, discipline focus, and notes.

Targets are optional. Missing targets remain unknown; the Coach must not infer or fabricate them. Phase periods must fit within the season and may not overlap. Weekly hours and session counts are validated as non-negative values; training days may not exceed seven.

## Competition relationship

The Coach receives dated competition records with their existing A–E priority when valid. Unknown priorities remain unknown. The season plan does not copy or replace the competition calendar.

## Hybrid decision boundary

The Coach may use season phases to contextualize weekly and daily recommendations. It may suggest adjustments in response to actual training, recovery, health and athlete feedback. It may not modify or approve the season plan, phase structure, goals, or competition priorities without explicit athlete confirmation.

## Persistence and compatibility

The record is stored as the user-scoped `seasonPlan` collection, included in user snapshots and JSON backups, and remains optional when reading older backups or cloud snapshots. Existing activity, workout, competition, profile and health records are not migrated or rewritten by this model.

## Implemented boundary

The current implementation provides normalization, validation, storage, backup compatibility and Coach-context integration. It does not yet provide a season-plan editor, auto-generated phase dates, weekly periodization, or individual workout generation. Those are intentionally separate follow-on steps.


## Periodization proposal workflow

The season editor can request a structured proposal from the authenticated Coach endpoint. The request uses the saved season dates and goal together with the existing athlete profile, training context and dated competition records. The Coach returns a proposal with phase boundaries, objectives, focus areas, rationale and open questions.

The Worker validates phase dates, rejects overlaps and requires continuous coverage of the full season. Generated weekly hours, training days and session counts are not accepted; these remain unset until explicitly planned. A proposal is shown for review and is not persisted as the active phase structure until the athlete explicitly adopts it into the draft. The athlete must then save or approve the plan separately.

The season proposal does not generate weekly microcycles or individual sessions. It is not a substitute for confirming competition priorities, training availability or medical constraints.


## Weekly plan record (foundation)

A weekly plan is attached to the existing user-scoped `seasonPlan.weeklyPlans` array, so no parallel storage table or migration is required. Each record has a Monday-to-Sunday date range, a reference to one approved season phase, a status (`draft`, `approved`, `completed` or `archived`), a weekly objective, focus areas, rationale, open questions, and structured sessions.

Each session can store date, training type, category, discipline, race format, water type, duration in minutes, optional target load, intensity description, objective, warm-up, main set, cool-down and notes. Missing numeric targets remain null. Validation requires an approved season plan, a valid seven-day week fully inside the referenced phase, and session dates inside that week. This model does not itself create calendar entries or approve a proposal.


## Weekly proposal workflow

The season editor lets the athlete select a Monday and request a seven-day plan. The request includes the approved season phase, athlete profile, dated competitions, relevant training history, planned sessions, load timeline and recovery/health context selected for the question. The Worker requires the entire week to fall inside one approved phase and validates the returned session dates and required fields.

Weekly proposals remain drafts. The athlete reviews the rationale and each session, saves the proposal as a draft, and separately approves the stored week. Existing approved or completed plans for the same week cannot be overwritten by a new proposal. No proposed session is automatically inserted into the calendar or treated as completed training.

The Coach must not invent weekly availability, training hours, training days, facilities, intensity zones or load targets. For canoe wildwater racing, it distinguishes boat class, Classic/Sprint and water type; C1 sessions are limited to 75 minutes. Wildwater access is not inferred from flatwater access. The C2 replacement rule is communicated to the Coach, but automatic replacement of an existing calendar entry is not yet implemented.

The current workflow is a reviewed weekly-plan draft/approval flow. It does not yet provide inline editing of individual sessions, automatic calendar transfer, or automatic adaptive rescheduling.
