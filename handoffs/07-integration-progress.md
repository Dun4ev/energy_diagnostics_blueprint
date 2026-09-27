# Stage07 integration progress (G3 еще не завершен)

Base G1 + commits stages02/03/04/05. SourceAdapter -> bounded108h observations -> pure analyzer -> immutable AnalysisRow -> case/risk read model работает. ScenarioSession row является durable job по revision: PostgreSQL row lock/SKIP LOCKED, atomic9-assets publication, rollback leaves queued; failed records clear error. Auto clock speed1/10/60, pause/step, end cap; backward start новыйrun. Replay state persisted; worker heartbeat in DB. Reference provider separate cloned fixture/chart, no calculations pretending reference is telemetry. Seed validated for fixed dataset. Empty datasets use explicit run context.

Фактически: real local Compose built and running, localhost8080 only. Authenticated HTTP smoke: reference1asset/case0.57s; simulation9assets/2cases4.17s. Mode/time and queue/snapshot analyses match. Duplicate create Idempotency-Key returns same run. Report verification/live-replay-smoke.json. tests/integration2passed, contracts27passed, API6passed, independent core8passed plus author8passed. Contract/OpenAPI generated, errors origin/CSRF validation updated from obsolete501 expectations. API fields/deps unchanged except RFC07.

Runtime mounts only observations; reference/config mounts read-only; no external AI or OT. scripts/init_local_env.py adds missing random local credentials preserving existing values, never prints secrets. infra/.env ignored. Live smoke reads credentials only in memory. No publish/push.

Remaining before G3/G4: stage06 frontend features, real browser two-role plan workflow, restart persistence/backup restore, independent final QA and visual refinements. main page still foundation pending features. Не выдавать этот progress за готовый демонстрационный прототип.
