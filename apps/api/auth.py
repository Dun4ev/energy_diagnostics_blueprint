"""Local demo identities. Passwords and session tokens never enter workflow DTOs."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import timedelta

from sqlalchemy.orm import Session

from apps.api import db
from packages.domain_contracts import models as m
from packages.domain_contracts.workflow import ROLE_PERMISSIONS

COOKIE = "energy_session"


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 310000).hex()


def seed_users(session: Session):
    """Only explicitly configured users are enabled; absent passwords create no account."""
    for role in m.Role:
        password = os.getenv(f"DEMO_{role.value.upper()}_PASSWORD")
        user = session.get(db.UserRow, role.value)
        if not password:
            if user is not None:
                user.enabled = False
            continue
        grants = [m.Permission.CASE_CONFIRM.value] if role == m.Role.ENGINEER and (
            os.getenv("DEMO_ENGINEER_CASE_CONFIRM", "false").lower() == "true"
        ) else []
        if user is None:
            salt = secrets.token_hex(16)
            session.add(db.UserRow(id=role.value, role=role.value,
                                   password_hash=_password(password, salt), salt=salt,
                                   grants=grants, enabled=True))
        else:
            user.password_hash = _password(password, user.salt)
            user.grants = grants
            user.enabled = True


def verify_login(session: Session, username: str, password: str) -> db.UserRow | None:
    user = session.get(db.UserRow, username)
    if user and user.enabled and hmac.compare_digest(user.password_hash, _password(password, user.salt)):
        return user
    return None


def permissions(user: db.UserRow) -> list[m.Permission]:
    result = ROLE_PERMISSIONS[m.Role(user.role)] | {m.Permission(x) for x in user.grants}
    return sorted(result, key=lambda x: x.value)


def identity(user: db.UserRow, csrf_token: str) -> m.Identity:
    return m.Identity(actorId=user.id, displayName=f"DEMO {user.id}",
                      role=m.Role(user.role), permissions=permissions(user),
                      csrfToken=csrf_token)


def create_session(session: Session, user: db.UserRow) -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    csrf = csrf_for_token(token)
    session.add(db.AuthSessionRow(token_hash=_hash(token), user_id=user.id,
                                  csrf_hash=_hash(csrf),
                                  expires_at=db.now() + timedelta(hours=8), revoked=False))
    return token, csrf


def csrf_for_token(token: str) -> str:
    return _hash("csrf:" + token)


def current_user(session: Session, token: str | None) -> tuple[db.UserRow, db.AuthSessionRow]:
    from apps.api.persistence import DomainError
    row = session.get(db.AuthSessionRow, _hash(token or ""))
    if not row or row.revoked or row.expires_at.replace(tzinfo=row.expires_at.tzinfo or db.now().tzinfo) <= db.now():
        raise DomainError("UNAUTHENTICATED", "Требуется вход", 401)
    user = session.get(db.UserRow, row.user_id)
    if not user or not user.enabled:
        raise DomainError("UNAUTHENTICATED", "Требуется вход", 401)
    return user, row


def require_permission(user: db.UserRow, permission: m.Permission):
    from apps.api.persistence import DomainError
    if permission not in permissions(user):
        raise DomainError("FORBIDDEN", "Недостаточно прав", 403)


def csrf_valid(row: db.AuthSessionRow, token: str):
    from apps.api.persistence import DomainError
    if not hmac.compare_digest(row.csrf_hash, _hash(token)):
        raise DomainError("CSRF_INVALID", "Не удалось проверить запрос", 403)
