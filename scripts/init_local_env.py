"""Create missing local demo credentials without printing or replacing secrets."""
import os
import secrets
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "infra" / ".env"
existing = path.read_text() if path.exists() else ""
keys = {line.split("=", 1)[0] for line in existing.splitlines() if "=" in line and line.split("=", 1)[1].strip()}
needed = ["POSTGRES_PASSWORD"] + [f"DEMO_{role}_PASSWORD" for role in
                                  ["ENGINEER", "APPROVER", "TECHNICIAN", "VIEWER", "ADMIN"]]
missing = [key for key in needed if key not in keys]
if missing:
    with path.open("a") as stream:
        if existing and not existing.endswith("\n"):
            stream.write("\n")
        for key in missing:
            stream.write(f"{key}={secrets.token_urlsafe(18)}\n")
    os.chmod(path, 0o600)
print(f"Local credentials ready at {path}; values were not printed.")
