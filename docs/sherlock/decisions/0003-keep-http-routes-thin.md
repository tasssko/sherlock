# ADR 0003: Keep HTTP Routes Thin

## Decision

Fastify routes validate input, delegate to controllers, and translate domain errors to HTTP responses.

## Rationale

This preserves testability, avoids duplicated orchestration logic, and keeps the domain model usable outside HTTP entrypoints.

