# Independent backend/workflow and local recovery review

Date: 2026-09-27. Review began at `c082b4f464da8c3244e4c4797e500aa9811dc02e` (integrated runtime). The workflow defects below were reproduced through direct HTTP calls, then fixed by integrator commit `7fef6fef477d2d31cf0fe06e4eda7f6df9a46b14`; regression verification against that commit is recorded below.

## Review matrix

| Area | Evidence | Result |
|---|---|---|
| Role and server-side gate | `tests/api/test_workflow.py::test_snapshot_queue_same_analysis_and_auth`, `test_evidence_and_plan_stale_review`, `test_confirmation_requires_explicit_grant_and_evidence`; direct TestClient HTTP mutation as viewer/approver/engineer | Existing coverage enforces 403, explicit confirmation/evidence, and no premature close. |
| CSRF and idempotency | `test_origin_csrf_and_no_binary_upload`, `test_revision_idempotency_audit_and_persistence` | Missing/invalid origin or CSRF is rejected; repeating the same idempotency key returns one persisted result/audit; stale revision returns 409. |
| Stale approval and run isolation | `test_evidence_and_plan_stale_review`, `test_store_analysis_isolated_run_and_immutable_history` | Evidence update blocks stale approval; histories and measurements remain scoped and immutable by run. |
| Step execution conditions | `tests/independent-workflow/test_step_result_gates.py::test_defect_condition_cannot_record_before_case_confirmation` | Initially reproduced acceptance of a `defect_confirmed` step before a stored confirmation. Integrator fix now requires a Defect record for the same case/run. |
| Step result retention | `test_step_result_retains_observed_time_and_conclusion` | Initially reproduced loss of submitted observation time/conclusion. RFC07 adds additive `PlanStep.result` with actor, observed/recorded times, conclusion, and evidence IDs; result time is bounded by run virtual time. |
| Local backup/restore | `scripts/backup_local.py`, `scripts/verify_restore.py`; actual Compose PostgreSQL container | Custom-format dump verified and restored into unique new databases in the same PostgreSQL cluster. The source database was not modified; the cluster's existing volume now also contains the isolated restore databases. |

## Actual environment and commands

The worktree was at `/Users/j15/.codex/worktrees/foundation-infra/energy_diagnostics_blueprint`. Python checks used the existing primary project `.venv` (Python 3.13.5); Docker Compose project `energy-diagnostics` exposed only `127.0.0.1:8080`. Read-only health returned `status=ok`, database/business runtime ready, `advisoryOnly=true`, `controlCommandsAllowed=false`, and `externalAiEnabled=false`.

The initial direct-HTTP run at the pre-fix base was:

```text
/Users/j15/Documents/Code_and_Scripts_local/prototypes/energy_diagnostics_blueprint/.venv/bin/python -m pytest -q tests/independent-workflow tests/api/test_workflow.py
6 passed, 2 xfailed
```

Those two expected failures captured the step-condition and result-retention defects above. After integrator commit `7fef6fe`, both passed directly and the expected-failure markers were removed. The final targeted run was:

```text
/Users/j15/Documents/Code_and_Scripts_local/prototypes/energy_diagnostics_blueprint/.venv/bin/python -m pytest -q tests/independent-workflow tests/api tests/integration
11 passed, 3 warnings in 5.24s

/Users/j15/Documents/Code_and_Scripts_local/prototypes/energy_diagnostics_blueprint/.venv/bin/python -m pytest -q tests/contracts
27 passed, 3 warnings in 0.61s

/Users/j15/Documents/Code_and_Scripts_local/prototypes/energy_diagnostics_blueprint/.venv/bin/python -m packages.domain_contracts.export --check
Contract exports match

node scripts/check-client.mjs (from the primary checkout with existing node_modules)
Generated TS matches OpenAPI
```

The warnings are framework deprecations from FastAPI/Starlette test support. `ruff check` and `ruff format --check` passed for the four changed Python files. `py_compile` passed for the backup helpers/scripts and independent workflow test.

The scripts were syntax-checked with `python -m py_compile`. A live backup command created and validated `infra/.env.backups/energy-diagnostics-20260927T122927Z-3de83744.dump` (1,191,762 bytes; SHA-256 `8369f1e6efbc4e71ff22f9833b1682035b2427edd2f0d8c1ad380594b3c6b2a6`). `git check-ignore` matched both the directory and archive; permissions were `0700` and `0600` respectively.

The first restore-script trial exposed PostgreSQL's lowercasing of an unquoted generated database identifier. The script was corrected before the successful run. The successful command:

```text
python scripts/verify_restore.py infra/.env.backups/energy-diagnostics-20260927T122927Z-3de83744.dump
Restored into new database ed_restore_20260927t123128z_8e959ed8; database retained for inspection.
Verified counts: {"analysisRuns": 11, "assets": 11, "auditEvents": 4, "cases": 4, "publicTables": 16, "scenarioRuns": 3}
```

An earlier isolated target, `ed_restore_20260927t122932z_e77d1d9b`, was created during that failed attempt. Its restore was completed manually and its tables were checked; both test databases are retained and neither is the source `energy_diagnostics` database. Scripts never drop or overwrite a restore target.

The `p.get_run(... FOR UPDATE)` lock-order review found API mutations acquire the run row before plan/case rows, while the replay worker locks runs in sorted ID order before publication. No reverse lock order was found in the inspected production paths. This does serialize same-run reads with writes until the request transaction ends; latency and contention under load were not measured.

## Operational guidance and limits

`docs/runbook/LOCAL.md` now documents first setup, integrated health, new-run reset semantics, stop without `-v`, ignored backups, and safe restore into a fresh database. The backup and restore scripts use the running container and local socket; they do not read or print credentials. The `.dump` contains local workflow data and stays in the Git-ignored directory.

This assignment covered backend/workflow and local persistence recovery. Browser layouts, responsive behavior, UI states, numerical acceptance, full build matrix, and real-field validation were not run here. Backup/restore confirms one local PostgreSQL archive can be restored into this same local server; it is not disaster-recovery, off-host, or production resilience evidence. The local test databases listed above are intentionally retained for inspection.
