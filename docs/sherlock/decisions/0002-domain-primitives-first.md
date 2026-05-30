# ADR 0002: Build Around Domain Primitives

## Decision

Sherlock is built around explicit primitives such as `Task`, `TaskGraph`, `WorkPlan`, `Artifact`, `Event`, `Workspace`, `Agent`, `Capability`, `Policy`, and `Context`.

## Rationale

The application should evolve from durable concepts rather than route-level helpers or generic services. This keeps behaviour testable and supports future expansion into a larger agentic education system.

