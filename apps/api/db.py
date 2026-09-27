"""PostgreSQL persistence for the advisory demo. No OT or truth data enters this store."""

from __future__ import annotations

import os
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    URL,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class RunRow(Base):
    __tablename__ = "scenario_runs"
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    mode: Mapped[str] = mapped_column(String(16), nullable=False)
    virtual_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    body: Mapped[dict] = mapped_column(JSON, nullable=False)


class AssetRow(Base):
    __tablename__ = "assets"
    run_id: Mapped[str] = mapped_column(String(128), ForeignKey("scenario_runs.id"), primary_key=True)
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    site_id: Mapped[str] = mapped_column(String(128), index=True)
    asset_type: Mapped[str] = mapped_column(String(32), index=True)
    body: Mapped[dict] = mapped_column(JSON, nullable=False)


class SourceRow(Base):
    __tablename__ = "sources"
    run_id: Mapped[str] = mapped_column(String(128), ForeignKey("scenario_runs.id"), primary_key=True)
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(128), index=True)
    body: Mapped[dict] = mapped_column(JSON, nullable=False)


class MeasurementRow(Base):
    __tablename__ = "measurements"
    run_id: Mapped[str] = mapped_column(String(128), ForeignKey("scenario_runs.id"), primary_key=True)
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(128), index=True)
    source_id: Mapped[str] = mapped_column(String(128), index=True)
    metric: Mapped[str] = mapped_column(String(40), index=True)
    quality: Mapped[str] = mapped_column(String(20), index=True)
    event_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    body: Mapped[dict] = mapped_column(JSON, nullable=False)


class AnalysisRow(Base):
    __tablename__ = "analysis_runs"
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(128), ForeignKey("scenario_runs.id"), index=True)
    asset_id: Mapped[str] = mapped_column(String(128), index=True)
    as_of: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    priority: Mapped[str] = mapped_column(String(20), index=True)
    bundle: Mapped[dict] = mapped_column(JSON, nullable=False)
    series: Mapped[list] = mapped_column(JSON, nullable=False)


class SnapshotRow(Base):
    __tablename__ = "reference_snapshots"
    run_id: Mapped[str] = mapped_column(String(128), ForeignKey("scenario_runs.id"), primary_key=True)
    case_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    body: Mapped[dict] = mapped_column(JSON, nullable=False)


class CaseRow(Base):
    __tablename__ = "cases"
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(128), ForeignKey("scenario_runs.id"), index=True)
    asset_id: Mapped[str] = mapped_column(String(128), index=True)
    symptom_family: Mapped[str] = mapped_column(String(128), index=True)
    state: Mapped[str] = mapped_column(String(40), index=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    evidence_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    analysis_id: Mapped[str] = mapped_column(String(128), nullable=False)
    body: Mapped[dict] = mapped_column(JSON, nullable=False)


Index("ix_case_open_symptom", CaseRow.run_id, CaseRow.asset_id, CaseRow.symptom_family, CaseRow.state)


class EvidenceRow(Base):
    __tablename__ = "evidence"
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(128), ForeignKey("scenario_runs.id"), index=True)
    case_id: Mapped[str] = mapped_column(String(128), index=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    body: Mapped[dict] = mapped_column(JSON, nullable=False)


class PlanRow(Base):
    __tablename__ = "work_plans"
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(128), ForeignKey("scenario_runs.id"), index=True)
    case_id: Mapped[str] = mapped_column(String(128), index=True)
    state: Mapped[str] = mapped_column(String(40), index=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    body: Mapped[dict] = mapped_column(JSON, nullable=False)


class ApprovalRow(Base):
    __tablename__ = "approvals"
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(128), index=True)
    plan_id: Mapped[str] = mapped_column(String(128), index=True)
    body: Mapped[dict] = mapped_column(JSON, nullable=False)


class DefectRow(Base):
    __tablename__ = "defects"
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(128), index=True)
    case_id: Mapped[str] = mapped_column(String(128), index=True)
    body: Mapped[dict] = mapped_column(JSON, nullable=False)


class AuditRow(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(128), index=True)
    object_id: Mapped[str] = mapped_column(String(128), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    body: Mapped[dict] = mapped_column(JSON, nullable=False)


class IdempotencyRow(Base):
    __tablename__ = "idempotency"
    scope: Mapped[str] = mapped_column(String(512), primary_key=True)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response: Mapped[dict] = mapped_column(JSON, nullable=False)


class UserRow(Base):
    __tablename__ = "demo_users"
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    salt: Mapped[str] = mapped_column(String(64), nullable=False)
    grants: Mapped[list] = mapped_column(JSON, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class AuthSessionRow(Base):
    __tablename__ = "auth_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), ForeignKey("demo_users.id"))
    csrf_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


def database_url() -> URL:
    if not os.getenv("DB_HOST") or not os.getenv("DB_PASSWORD"):
        raise RuntimeError("PostgreSQL DB_HOST and DB_PASSWORD are required")
    return URL.create(
        "postgresql+psycopg",
        username=os.getenv("DB_USER", "energy"),
        password=os.environ["DB_PASSWORD"],
        host=os.environ["DB_HOST"],
        port=int(os.getenv("DB_PORT", "5432")),
        database=os.getenv("DB_NAME", "energy"),
    )


def make_session_factory(url=None):
    engine = create_engine(url or database_url(), pool_pre_ping=True)
    return sessionmaker(engine, expire_on_commit=False)
