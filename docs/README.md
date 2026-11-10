# Career Copilot — Documentation Index

Personal, local-first, AI-assisted job discovery → evaluation → application → tracking platform with a persistent human-in-the-loop (HITL) workflow.

> **Audience:** these docs are written so that a *small coding model* can build the whole project step by step. Every doc is concrete (names, columns, states, endpoints, file paths). When something is unspecified, the agent must NOT invent: use the configurable default stated in the docs or log it in `18-risks-and-open-decisions.md` and ask the user.

## Reading order (for a coding agent)

| # | Doc | Purpose |
|---|-----|---------|
| 00 | [agent-playbook](00-agent-playbook.md) | **READ FIRST.** Rules, conventions, how to work one milestone at a time |
| 01 | [phase0-audit](01-phase0-audit.md) | Environment/repo audit and its consequences |
| 02 | [prd](02-prd.md) | Product vision, personas, scope, non-goals, success criteria |
| 03 | [functional-requirements](03-functional-requirements.md) | Numbered requirements (FR-xxx) with acceptance criteria |
| 04 | [non-functional-requirements](04-non-functional-requirements.md) | NFR-xxx: reliability, performance, privacy, etc. |
| 05 | [architecture](05-architecture.md) | Architecture, module dependency map, **exact folder structure**, data flows |
| 06 | [adr/](adr/README.md) | Architecture Decision Records (why each choice) |
| 07 | [modules](07-modules.md) | Per-module responsibility, public interface, dependencies, failure modes |
| 08 | [database-design](08-database-design.md) | All tables, columns, constraints, indexes |
| 09 | [api-spec](09-api-spec.md) | REST + SSE endpoints |
| 10 | [workflows-state-machines](10-workflows-state-machines.md) | All state machines, checkpoints, HITL, idempotent submission |
| 11 | [ai-agent-design](11-ai-agent-design.md) | Provider abstraction, schemas, prompts, injection defense, budgets |
| 12 | [browser-automation](12-browser-automation.md) | Playwright layer, portal drivers, safety rules |
| 13 | [security-privacy](13-security-privacy.md) | Threat model, authz, data handling |
| 14 | [ui-ux](14-ui-ux.md) | Pages, components, interaction rules, design tokens |
| 15 | [testing](15-testing.md) | Test strategy, mandatory test cases, failure injection |
| 16 | [deployment-ops](16-deployment-ops.md) | Windows/WSL2 setup, env vars, run, backup |
| 17 | [implementation-plan](17-implementation-plan.md) | **Ordered milestones M0–M14**, each with tasks + acceptance tests |
| 18 | [risks-and-open-decisions](18-risks-and-open-decisions.md) | Risks, assumptions, questions needing the user |
| 19 | [user-decisions](19-user-decisions.md) | **Authoritative log of user decisions (Q1–Q12 + additional requirements)** |

## How to hand this to a small agent
Give it ONE milestone at a time from `17-implementation-plan.md` plus docs 00, 05, and only the docs that milestone lists under "Read". Do not give the whole doc set at once.

## Doc conventions
- `FR-` functional req, `NFR-` non-functional, `ADR-` decision, `M#` milestone, `T-` test.
- "MUST" is mandatory, "SHOULD" is default unless there is a reason, "MAY" is optional.
- Everything stored time is UTC `timestamptz`.
