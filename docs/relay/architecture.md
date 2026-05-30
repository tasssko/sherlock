# Relay Architecture Notes

This repository did not contain an existing Sherlock codebase, so the nearest available StackTrack reference was sampled from the sibling project `../Servana/stacktrack-app-relay`.

Observed Relay characteristics:

- single-package repository rather than workspace tooling
- TypeScript as the primary modelling layer
- Fastify for the API entrypoint
- Vite for the frontend surface
- Vitest for tests
- `src/app`, `src/domain`, and module-oriented source layout

Sherlock follows those broad conventions and keeps its structure intentionally close:

```text
src/
  app/
    api/
    ui/
  domain/
    primitives/
    study/
  modules/
    planning/
test/
docs/
```

The goal is alignment, not literal duplication. Sherlock introduces study-planning primitives while preserving the same boring stack and transport boundaries.
