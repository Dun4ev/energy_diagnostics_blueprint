"""Validate the recorded package's provenance and domain contracts."""

import hashlib
import json
import unittest
import warnings
from pathlib import Path

from packages.domain_contracts import models as m

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / "apps/web/public/stand-data.json"
OBSERVATIONS = ROOT / "data/observations"


def observation_hash_match(name: str, data: bytes, expected: str) -> str:
    """Distinguish raw-byte equality from a uniform LF/CRLF conversion."""
    if hashlib.sha256(data).hexdigest() == expected:
        return "exact"
    if Path(name).suffix.lower() not in {".json", ".jsonl"}:
        return "mismatch"
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return "mismatch"
    lf = data.replace(b"\r\n", b"\n")
    # Do not normalize mixed endings or lone CR bytes: those are different data.
    if b"\r" in lf or (b"\r\n" in data and b"\n" in data.replace(b"\r\n", b"")):
        return "mismatch"
    alternate = lf if b"\r\n" in data else lf.replace(b"\n", b"\r\n")
    if hashlib.sha256(alternate).hexdigest() == expected:
        return "line-endings-only"
    return "mismatch"


class ObservationHashTests(unittest.TestCase):
    @staticmethod
    def digest(data: bytes) -> str:
        return hashlib.sha256(data).hexdigest()

    def test_exact_bytes_are_distinguished_from_line_endings(self):
        data = b'{"value": 1}\n'
        self.assertEqual(observation_hash_match("source.json", data, self.digest(data)), "exact")

    def test_uniform_line_endings_match_in_both_directions(self):
        lf = b'{"value": 1}\n{"value": 2}\n'
        crlf = lf.replace(b"\n", b"\r\n")
        for name in ("source.json", "source.jsonl"):
            with self.subTest(name=name, direction="LF to CRLF"):
                self.assertEqual(observation_hash_match(name, lf, self.digest(crlf)), "line-endings-only")
            with self.subTest(name=name, direction="CRLF to LF"):
                self.assertEqual(observation_hash_match(name, crlf, self.digest(lf)), "line-endings-only")

    def test_data_changes_are_not_accepted_as_line_ending_changes(self):
        expected = self.digest(b'{"value": 1}\r\n')
        self.assertEqual(observation_hash_match("source.json", b'{"value": 2}\n', expected), "mismatch")

    def test_binary_and_other_formats_require_exact_bytes(self):
        data = b"binary\n"
        for name in ("source.csv.gz", "source.bin", "source.csv"):
            with self.subTest(name=name):
                self.assertEqual(observation_hash_match(name, data, self.digest(b"binary\r\n")), "mismatch")
                self.assertEqual(observation_hash_match(name, data, self.digest(data)), "exact")

    def test_invalid_utf8_and_mixed_line_endings_do_not_normalize(self):
        cases = (
            (b"\xff\n", b"\xff\r\n"),
            (b"a\r\nb\nc\n", b"a\r\nb\r\nc\r\n"),
            (b"a\rb\n", b"a\rb\r\n"),
        )
        for data, alternate in cases:
            with self.subTest(data=data):
                self.assertEqual(observation_hash_match("source.json", data, self.digest(alternate)), "mismatch")


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
        hashes = provenance["observationHashes"]
        self.assertTrue(hashes, "Observation hashes must not be empty")
        self.assertEqual(set(hashes), {path.name for path in OBSERVATIONS.iterdir() if path.is_file()})
        for name, digest in hashes.items():
            data = (OBSERVATIONS / name).read_bytes()
            match = observation_hash_match(name, data, digest)
            self.assertNotEqual(match, "mismatch", f"Observation hash mismatch: {name}")
            if match == "line-endings-only":
                warnings.warn(
                    f"{name}: raw SHA-256 differs (recorded={digest}, "
                    f"current={hashlib.sha256(data).hexdigest()}); "
                    "only a uniform LF/CRLF conversion matches the recorded bytes",
                    stacklevel=2,
                )
        text = json.dumps(self.pack, ensure_ascii=False).lower()
        for forbidden in ("csrftoken", "password", "sessiontoken", "data/truth", "true_fault"):
            self.assertNotIn(forbidden, text)


if __name__ == "__main__":
    unittest.main()
