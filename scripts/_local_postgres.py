"""Small, secret-free helpers for local Postgres backup verification."""

from __future__ import annotations

import subprocess

COMPOSE_PROJECT = "energy-diagnostics"
DB_SERVICE = "db"


class LocalPostgresError(RuntimeError):
    pass


def find_database_container() -> str:
    result = subprocess.run(
        [
            "docker",
            "ps",
            "--filter",
            f"label=com.docker.compose.project={COMPOSE_PROJECT}",
            "--filter",
            f"label=com.docker.compose.service={DB_SERVICE}",
            "--format",
            "{{.ID}}",
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise LocalPostgresError("docker ps не выполнен; проверьте Docker daemon")
    ids = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if len(ids) != 1:
        raise LocalPostgresError(
            f"Ожидался один running контейнер Postgres проекта {COMPOSE_PROJECT}, найдено: {len(ids)}"
        )
    return ids[0]


def run_database_tool(container_id: str, args: list[str], *, stdin=None):
    result = subprocess.run(
        ["docker", "exec", "-i", container_id, *args],
        stdin=stdin,
        text=False,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        # Do not echo tool output: it may contain database or environment details.
        tool = args[0] if args else "Postgres"
        raise LocalPostgresError(f"{tool} внутри Postgres завершился с кодом {result.returncode}")
    return result.stdout
