"""Create a custom-format dump of the local demo database in an ignored folder."""

from __future__ import annotations

import argparse
import hashlib
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from _local_postgres import LocalPostgresError, find_database_container, run_database_tool

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIR = ROOT / "infra" / ".env.backups"


def ensure_git_ignored(path: Path) -> None:
    try:
        relative = path.resolve().relative_to(ROOT)
    except ValueError as exc:
        raise LocalPostgresError(
            "Backup path должен находиться внутри ignored папки проекта"
        ) from exc
    result = subprocess.run(
        ["git", "check-ignore", "--quiet", "--", str(relative)],
        cwd=ROOT,
        check=False,
    )
    if result.returncode != 0:
        raise LocalPostgresError("Backup path не подтвержден через git check-ignore")


def create_backup(directory: Path) -> Path:
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(directory, 0o700)
    directory = directory.resolve()
    ensure_git_ignored(directory)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = directory / f"energy-diagnostics-{stamp}-{os.urandom(4).hex()}.dump"
    ensure_git_ignored(target)
    container_id = find_database_container()
    fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            result = subprocess.run(
                [
                    "docker",
                    "exec",
                    container_id,
                    "pg_dump",
                    "--username=energy_diagnostics",
                    "--dbname=energy_diagnostics",
                    "--format=custom",
                    "--no-owner",
                    "--no-privileges",
                ],
                stdout=stream,
                stderr=subprocess.PIPE,
                check=False,
            )
        if result.returncode:
            raise LocalPostgresError(f"pg_dump завершился с кодом {result.returncode}")
        os.chmod(target, 0o600)
        # Validate the archive before reporting it as a completed backup.
        with target.open("rb") as stream:
            run_database_tool(container_id, ["pg_restore", "--list"], stdin=stream)
        return target
    except Exception:
        target.unlink(missing_ok=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--directory",
        type=Path,
        default=DEFAULT_DIR,
        help="ignored destination directory (default: infra/.env.backups)",
    )
    args = parser.parse_args()
    try:
        target = create_backup(args.directory)
    except (LocalPostgresError, OSError) as exc:
        print(f"Backup failed: {exc}", file=sys.stderr)
        return 1
    digest_builder = hashlib.sha256()
    with target.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest_builder.update(chunk)
    digest = digest_builder.hexdigest()
    print(
        f"Backup verified: {target.relative_to(ROOT)} ({target.stat().st_size} bytes, sha256 {digest})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
