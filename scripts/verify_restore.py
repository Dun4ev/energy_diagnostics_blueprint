"""Restore a local backup into a new, uniquely named database; retain it for inspection."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from _local_postgres import LocalPostgresError, find_database_container, run_database_tool

COUNTS_SQL = """
SELECT json_build_object(
    'publicTables', (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public'),
    'scenarioRuns', (SELECT count(*) FROM scenario_runs),
    'assets', (SELECT count(*) FROM assets),
    'analysisRuns', (SELECT count(*) FROM analysis_runs),
    'cases', (SELECT count(*) FROM cases),
    'auditEvents', (SELECT count(*) FROM audit_events)
)::text;
""".strip()


def new_database_name() -> str:
    # PostgreSQL folds unquoted identifiers to lowercase; keep connection and
    # CREATE DATABASE names identical without quoting generated identifiers.
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dt%H%M%Sz")
    return f"ed_restore_{stamp}_{uuid4().hex[:8]}"


def restore(backup: Path) -> tuple[str, dict[str, int]]:
    if not backup.is_file() or backup.stat().st_size == 0:
        raise LocalPostgresError("Backup должен быть существующим непустым файлом")
    container_id = find_database_container()
    name = new_database_name()
    if not re.fullmatch(r"ed_restore_[0-9tz]+_[0-9a-f]{8}", name):
        raise LocalPostgresError("Сгенерировано недопустимое имя тестовой БД")

    with backup.open("rb") as stream:
        run_database_tool(container_id, ["pg_restore", "--list"], stdin=stream)

    # Name is generated above, so the identifier is safe to include as SQL.
    run_database_tool(
        container_id,
        [
            "psql",
            "--username=energy_diagnostics",
            "--dbname=postgres",
            "--no-psqlrc",
            "--set=ON_ERROR_STOP=1",
            f"--command=CREATE DATABASE {name} TEMPLATE template0",
        ],
    )
    try:
        with backup.open("rb") as stream:
            run_database_tool(
                container_id,
                [
                    "pg_restore",
                    "--username=energy_diagnostics",
                    f"--dbname={name}",
                    "--no-owner",
                    "--no-acl",
                    "--exit-on-error",
                ],
                stdin=stream,
            )
        output = run_database_tool(
            container_id,
            [
                "psql",
                "--username=energy_diagnostics",
                f"--dbname={name}",
                "--no-psqlrc",
                "--tuples-only",
                "--no-align",
                "--set=ON_ERROR_STOP=1",
                f"--command={COUNTS_SQL}",
            ],
        )
    except LocalPostgresError:
        # Preserve the fresh database for diagnosis; never drop a restore target.
        raise
    try:
        counts = json.loads(output.decode("utf-8").strip())
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise LocalPostgresError(
            "Не удалось прочитать контрольные количества после restore"
        ) from exc
    if counts["publicTables"] < 10 or counts["scenarioRuns"] < 1:
        raise LocalPostgresError("Restore проверен, но обязательные таблицы/данные отсутствуют")
    return name, counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backup", type=Path, help="custom-format pg_dump archive")
    args = parser.parse_args()
    try:
        name, counts = restore(args.backup.resolve())
    except (LocalPostgresError, OSError) as exc:
        print(f"Restore verification failed: {exc}", file=sys.stderr)
        return 1
    print(f"Restored into new database {name}; database retained for inspection.")
    print("Verified counts: " + json.dumps(counts, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
