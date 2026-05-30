# Testing Strategy

Current automated tests cover:

1. task dependency lifecycle rules
2. work-plan behaviour and workspace attachment behaviour
3. agent capability and policy enforcement
4. learning-loop assessment creation, attempt evaluation, gap diagnosis, and tailored study-plan flow
5. assessment quality validation and artifact provenance behaviour
6. route-level error mapping and shared repository flow through SQLite-backed persistence

Priority order for future expansion:

1. deeper primitive lifecycle cases
2. controller failure paths
3. API route tests
4. UI rendering and submission tests
5. richer persistence-backed integration tests beyond the current SQLite repository
