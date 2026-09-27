"""Real observations -> pure analyzer -> persisted queue/snapshot, no MSW."""
from datetime import timedelta
from pathlib import Path

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from apps.api import db
from apps.api import persistence as p
from apps.worker.replay import END, SEED, START, advance_run, new_run, tick
from packages.domain_contracts import models as m

ROOT = Path(__file__).resolve().parents[2]


def database(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'runtime.db'}")
    db.Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)


def test_real_simulation_atomic_idempotent_and_empty_start(tmp_path, monkeypatch):
    monkeypatch.chdir(ROOT)
    factory = database(tmp_path)
    with factory.begin() as session:
        run = new_run(session, m.SessionCreate(datasetId="synthetic-energy-30d", seed=SEED,
                      mode="simulation", virtualTime=END, reason="test"), "engineer", "test")
    assert tick(factory)
    with factory() as session:
        stored = session.get(db.RunRow, run.scenarioRunId)
        assert stored.body["processingStatus"] == "ready", stored.body
        rows = session.scalars(select(db.AnalysisRow)).all()
        assert len(rows) == 9
        by_asset = {r.asset_id: m.AnalysisBundle.model_validate(r.bundle).analysis for r in rows}
        hot = by_asset["TP-177-T1"] if "TP-177-T1" in by_asset else next(
            a for asset, a in by_asset.items() if "177" in asset)
        assert hot.metrics.residualC > 10
        assert hot.status == "requires_review"
        assert all(x.metrics.failureProbability is None for x in by_asset.values())
        assert session.scalar(select(func.count()).select_from(db.MeasurementRow)) > 30000
    assert not tick(factory)
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(db.AnalysisRow)) == 9
    # Initial time may lack delivered sources. Still publishes explicit unknowns.
    with factory.begin() as session:
        empty = new_run(session, m.SessionCreate(datasetId="synthetic-energy-30d", seed=SEED,
                        mode="simulation", virtualTime=START, reason="start"), "engineer", "start")
    assert tick(factory)
    with factory() as session:
        assert session.get(db.RunRow, empty.scenarioRunId).body["processingStatus"] == "ready"
        analyses = session.scalars(select(db.AnalysisRow).where(db.AnalysisRow.run_id == empty.scenarioRunId)).all()
        assert len(analyses) == 9
        assert all(x.bundle["analysis"]["risk"]["score"] is None for x in analyses)


def test_reference_isolated_chart_and_replay_commands(tmp_path, monkeypatch):
    monkeypatch.chdir(ROOT)
    factory = database(tmp_path)
    with factory.begin() as session:
        ref = new_run(session, m.SessionCreate(datasetId="reference-slide29", seed=0, mode="reference",
                      virtualTime="2026-07-24T07:42:00Z", reason="reference"), "engineer", "ref")
    assert tick(factory)
    with factory() as session:
        row = session.get(db.RunRow, ref.scenarioRunId)
        assert row.body["processingStatus"] == "ready", row.body
        analysis = session.scalar(select(db.AnalysisRow))
        assert analysis.bundle["analysis"]["risk"]["score"] == 7.2
        assert len(analysis.series) == 15
        snapshot = session.scalar(select(db.SnapshotRow))
        assert len(snapshot.body["topology"]["nodes"]) == 4
        assert snapshot.body["topology"]["nodes"][-1]["state"] == "unknown"
    with factory.begin() as session:
        run = new_run(session, m.SessionCreate(datasetId="synthetic-energy-30d", seed=SEED,
                      mode="simulation", virtualTime=START+timedelta(days=7), reason="normal"), "engineer", "run")
        row = session.get(db.RunRow, run.scenarioRunId)
        # Queue is pending; stepping must reject rather than overwrite pending work.
        try:
            advance_run(session, row, m.SessionAdvance(expectedRevision=1, action="step", seconds=300,
                        speed=1, reason="step"), "engineer", "step")
        except p.DomainError as exc:
            assert exc.status == 409
        else:
            raise AssertionError("pending job overwritten")
