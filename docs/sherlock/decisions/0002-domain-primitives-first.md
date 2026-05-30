# ADR 0002: Build Around Domain Primitives

## Decision

Sherlock is built around explicit primitives such as `Task`, `TaskGraph`, `WorkPlan`, `Artifact`, `Event`, `Workspace`, `Agent`, `Capability`, `Policy`, and `Context`.

## Rationale

The application should evolve from durable concepts rather than route-level helpers or generic services. Workspace attachment, work-plan mutation, artifact provenance, policy evaluation, and task transitions now live behind primitive methods so behaviour stays testable and supports future expansion into a larger agentic education system.
