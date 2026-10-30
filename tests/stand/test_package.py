"""Validate the recorded package's provenance and domain contracts."""

import hashlib
import json
import unittest
from pathlib import Path

from packages.domain_contracts import models as m

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / "apps/web/public/stand-data.json"
OBSERVATIONS = ROOT / "data/observations"


class StandPackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack = json.loads(PACKAGE.read_text(encoding="utf-8"))

    def test_scene_timing_and_transitions(self):
        scenes = self.pack["scenes"]
        self.assertEqual([item["kind"] for item in scenes], [
            "overview", "normal", "deviation", "hypothesis", "evidence", "plan", "approval", "history"])
        self.assertEqual([item["durationSeconds"] for item in scenes], [15, 20, 30, 25, 20, 25, 25, 20])
        self.assertEqual(sum(item["durationSeconds"] for item in scenes), 180)
        self.assertTrue(all(item["assetId"] == "tp177-t1" and item["slice"] in ("early", "late") for item in scenes))

    def test_all_domain_objects_are_valid_and_computed(self):
        for section in self.pack["slices"].values():
            self.assertEqual(len(section["risks"]), 9)
            for raw in section["risks"]:
                analysis = m.RiskEntry.model_validate(raw).analysis
                self.assertEqual(analysis.mode, "simulation")
                self.assertEqual(analysis.calculationOrigin, "computed")
                self.assertIsNone(analysis.metrics.failureProbability)
                self.assertEqual(analysis.asOf.isoformat().replace("+00:00", "Z"), section["virtualTime"])
            points = [m.SeriesPoint.model_validate(raw) for raw in section["series"]]
            self.assertGreater(len(points), 0)
        snapshot = m.CaseSnapshot.model_validate(self.pack["slices"]["late"]["snapshot"])
        self.assertEqual(snapshot.asset.assetId, "tp177-t1")
        self.assertGreater(snapshot.analysis.metrics.residualC, 10)
        self.assertEqual(snapshot.case.state.value, "detected")
        self.assertEqual(snapshot.analysis.mode, "simulation")
        self.assertEqual(snapshot.case.analysisRunId, snapshot.analysis.analysisRunId)
        self.assertEqual(snapshot.analysis.asOf.isoformat().replace("+00:00", "Z"), self.pack["slices"]["late"]["virtualTime"])

    def test_workflow_records_are_real_consistent_dtos(self):
        story = self.pack["story"]
        plans = {name: m.WorkPlan.model_validate(story[name]) for name in ("draft", "submitted", "approved", "completed")}
        self.assertEqual([plans[name].state.value for name in plans], ["draft", "submitted", "approved", "completed"])
        self.assertEqual(len({plan.planId for plan in plans.values()}), 1)
        snapshot = m.CaseSnapshot.model_validate(self.pack["slices"]["late"]["snapshot"])
        self.assertTrue(all(plan.caseId == snapshot.case.caseId and plan.analysisRunId == snapshot.analysis.analysisRunId for plan in plans.values()))
        self.assertEqual(plans["completed"].steps[0].status, "verified")
        self.assertEqual(plans["completed"].steps[0].result.actorId, "technician")
        evidence = [m.Evidence.model_validate(raw) for raw in story["evidence"]]
        self.assertTrue(all(item.origin == "synthetic" and not item.hasImage for item in evidence))
        history = [m.AuditEvent.model_validate(raw) for raw in story["audit"]]
        self.assertTrue({"engineer", "approver", "technician"}.issubset({event.actorId for event in history}))
        self.assertTrue(any(event.action == "plan.approved" for event in history))
        self.assertTrue(any(event.action == "case.closed" for event in history))

    def test_observation_hashes_and_no_private_fields(self):
        provenance = self.pack["provenance"]
        self.assertEqual(provenance["datasetId"], "synthetic-energy-30d")
        self.assertEqual(provenance["seed"], 20260925)
        self.assertEqual(provenance["policyVersion"], "demo-policy-0.1.0")
        self.assertEqual(provenance["modelVersion"], "deterministic-thermal-0.1.0")
        for name, digest in provenance["observationHashes"].items():
            self.assertEqual(hashlib.sha256((OBSERVATIONS / name).read_bytes()).hexdigest(), digest)
        text = json.dumps(self.pack, ensure_ascii=False).lower()
        for forbidden in ("csrftoken", "password", "sessiontoken", "data/truth", "true_fault"):
            self.assertNotIn(forbidden, text)


if __name__ == "__main__":
    unittest.main()
