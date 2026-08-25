# ADR 002: FACEIT event ingestion

## Status

Accepted.

## Context

DeskHub is a single-user local desktop application. Match detection may tolerate
one to five minutes of latency, and persistent state already reconciles missed
polls and restarts.

## Considered

- Fixed polling
- Adaptive polling
- FACEIT webhook through Cloudflare Tunnel
- Cloud webhook relay
- Webhook plus polling fallback

## Decision

Use persistent state, adaptive polling, match-ID idempotency, bounded ELO retry,
and startup reconciliation. Windows FACEIT/CS2 processes are activity hints
only; the FACEIT API remains the source of truth.

## Rationale

This avoids public ingress, webhook secrets, tunnel availability, and cloud
operations. A webhook would still require Data API calls after match completion
because ELO updates may settle later.

## Revisit when

- DeskHub serves multiple users.
- An always-on backend already exists.
- Near-real-time latency becomes necessary.
- Other internet sources share the same ingestion infrastructure.
- Cloud deployment enters the project for another reason.
