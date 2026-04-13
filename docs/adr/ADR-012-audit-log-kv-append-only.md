# ADR-012: Audit Log — KV-Backed Append-Only Event Log

**Date**: 2025-01-01  
**Status**: Accepted  
**Deciders**: Engineering Team

## Context

Financial compliance and debugging require a durable record of significant business events — orders, payments, refunds, and authentication. A full SQLite table with schema migrations was considered but deemed over-engineered for the current scale.

## Decision

`AuditLogService` stores entries as a JSON array in `KeyValueRepository` under the key `'audit.log'`. The log is capped at 2,000 entries. Entries are append-only. The log is queryable by action, user, and date range, and exportable as CSV. All filtering is performed in-memory after loading the JSON array.

This is a pragmatic choice — a production system at scale would use a dedicated SQLite table.

## Consequences

Simple implementation with no schema migration required. The 2,000 entry cap prevents unbounded storage growth. JSON serialisation means filtering cannot leverage SQL indexes — all queries load the full array into memory. This is acceptable at the current entry cap. The known limitation is documented in the spec. If the cap needs to increase significantly, migrating to a SQLite table is the documented upgrade path.
