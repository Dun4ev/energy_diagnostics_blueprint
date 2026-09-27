from datetime import timedelta

import pytest

from apps.api import db
from apps.api import persistence as p
from apps.worker import replay
from packages.domain_contracts import models as m

from .test_replay import database


def test_clock_speed_pause_step_and_end(tmp_path, monkeypatch):
    factory = database(tmp_path)
    wall = p.utc_now()
    monkeypatch.setattr(p, "utc_now", lambda: wall)
    monkeypatch.setattr(replay, "_publish_simulation", lambda *_: None)
    with factory.begin() as session:
        run = replay.new_run(session, m.SessionCreate(datasetId=replay.DATASET, seed=replay.SEED,
                             mode="simulation", virtualTime=replay.END-timedelta(seconds=1200),
                             reason="clock test"), "engineer", "clock")
    replay.tick(factory)
    def command(action, seconds=0, speed=1):
        with factory.begin() as session:
            row = session.get(db.RunRow, run.scenarioRunId)
            return replay.advance_run(session, row, m.SessionAdvance(expectedRevision=row.body["revision"],
                                       action=action, seconds=seconds, speed=speed, reason="clock"),
                                       "engineer", "clock")
    command("speed", speed=60)
    command("resume")
    wall += timedelta(seconds=10)
    replay.tick(factory)
    with factory() as session:
        assert m.ScenarioSession.model_validate(session.get(db.RunRow, run.scenarioRunId).body).virtualTime == replay.END-timedelta(seconds=600)
    command("pause")
    wall += timedelta(seconds=20)
    assert not replay.tick(factory)
    stepped = command("step", seconds=86400)
    assert stepped.virtualTime == replay.END and stepped.paused
    replay.tick(factory)
    with pytest.raises(p.DomainError, match="конец"):
        command("resume")
