#!/usr/bin/env python3
"""Validate the delivered blueprint and synthetic dataset, NOT an application.

Python 3.10+. Install requirements-validation.txt for JSON Schema checks.
The diagnostic service, frontend and production model are not tested here.
"""
from __future__ import annotations
import argparse
import csv
import gzip
import hashlib
import importlib.util
import io
import json
import math
import statistics
import sys
import tempfile
import unittest
from collections import Counter
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("demo_generator", ROOT / "scripts/generate_demo.py")
assert spec is not None and spec.loader is not None
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)
try:
    from jsonschema import Draft202012Validator, FormatChecker, ValidationError
except ImportError:
    raise SystemExit("Missing jsonschema: install requirements-validation.txt before running validation.")


def load(rel: str):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def ratio(a: str, b: str) -> float:
    def lum(value: str):
        c = [int(value[i:i+2], 16) / 255 for i in (1, 3, 5)]
        c = [x/12.92 if x <= 0.04045 else ((x+0.055)/1.055)**2.4 for x in c]
        return sum(x*w for x, w in zip(c, (0.2126, 0.7152, 0.0722)))
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi+0.05)/(lo+0.05)


class BlueprintChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = load("data/manifest.json")
        with gzip.open(ROOT / "data/observations/transformer_readings.csv.gz", "rt", encoding="utf-8", newline="") as f:
            cls.rows = list(csv.DictReader(f))
        with gzip.open(ROOT / "data/truth/hidden_hourly_state.csv.gz", "rt", encoding="utf-8", newline="") as f:
            cls.truth = list(csv.DictReader(f))
        cls.by_id = {r["record_id"]: r for r in cls.rows}
        cls.truth_by_id = {r["record_id"]: r for r in cls.truth}
        cls.samples = load("data/observations/normalized_measurement_examples.json")
        cls.reference = load("contracts/examples/reference-analysis.json")

    def test_01_manifest_integrity(self):
        for rel, entry in self.manifest["files"].items():
            content = (ROOT / "data" / rel).read_bytes()
            self.assertEqual(hashlib.sha256(content).hexdigest(), entry["sha256"], rel)
            self.assertEqual(len(content), entry["bytes"], rel)
        self.assertTrue(self.manifest["notFieldValidated"])

    def test_02_seed_reproducibility(self):
        with tempfile.TemporaryDirectory() as tmp:
            second = generator.build(Path(tmp) / "same", self.manifest["seed"], self.manifest["days"])
            self.assertEqual(second, self.manifest)

    def test_03_different_seed_changes_observations(self):
        with tempfile.TemporaryDirectory() as tmp:
            other = generator.build(Path(tmp) / "other", self.manifest["seed"]+1, 14)
            content = json.loads((Path(tmp)/"other/observations/normalized_measurement_examples.json").read_text())
            self.assertNotEqual(content[0]["value"], self.samples[0]["value"])
            self.assertEqual(content[0]["scenarioRunId"], f"demo-seed-{self.manifest['seed']+1}")
            self.assertEqual(other["transformerCount"], 7)

    def test_04_refuses_nonempty_destination(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp); (p/"keep.txt").write_text("keep")
            with self.assertRaises(FileExistsError):
                generator.build(p)
            self.assertEqual((p/"keep.txt").read_text(), "keep")

    def test_05_counts_and_timestamps(self):
        self.assertEqual(len(self.rows), 60487)
        counts = Counter(r["asset_id"] for r in self.rows)
        self.assertEqual(len(counts),7)
        self.assertTrue(all(v == 8641 for v in counts.values()))
        last = {}
        for r in self.rows:
            t=parse_iso(r["event_time"]); recv=parse_iso(r["received_at"])
            self.assertGreaterEqual(recv,t)
            self.assertLessEqual((recv-t).total_seconds(),20)
            if r["asset_id"] in last:
                self.assertEqual((t-last[r["asset_id"]]).total_seconds(),300)
            last[r["asset_id"]]=t
            self.assertEqual(r["origin"],"synthetic")

    def test_06_no_hidden_truth_columns_in_observations(self):
        forbidden = {"expected_c","true_extra_heat_c","sensor_bias_c","profile","injected_transport_or_sensor_fault"}
        self.assertFalse(set(self.rows[0]) & forbidden)
        for asset in load("data/observations/assets.json"):
            self.assertNotIn("profile",asset)
            self.assertNotIn("true_extra_heat_c",asset)

    def test_07_progressive_heat_and_drift_are_different(self):
        end={r["asset_id"]:r for r in self.truth if r["event_time"]==self.manifest["end"]}
        self.assertAlmostEqual(float(end["tp177-t1"]["true_extra_heat_c"]),12,places=3)
        self.assertAlmostEqual(float(end["tp306-t1"]["true_extra_heat_c"]),0,places=3)
        self.assertAlmostEqual(float(end["tp306-t1"]["sensor_bias_c"]),12,places=3)
        measured=self.by_id[end["tp306-t1"]["record_id"]]
        discrepancy=float(measured["temp_a_c"])-float(measured["independent_a_c"])
        self.assertTrue(10 < discrepancy < 14)

    def test_08_load_step_does_not_inject_true_heat(self):
        target=[r for r in self.truth if r["asset_id"]=="tp305-t1"]
        self.assertTrue(all(float(r["true_extra_heat_c"])==0 for r in target))
        residuals=[float(self.by_id[t["record_id"]]["temp_a_c"])-float(t["expected_c"]) for t in target]
        self.assertLess(abs(statistics.mean(residuals)),0.1)
        self.assertLess(statistics.stdev(residuals),0.5)

    def test_09_quality_faults_are_present(self):
        rows=[r for r in self.rows if r["asset_id"]=="tp307-t1"]
        self.assertEqual(rows[-1]["temp_a_quality"],"missing")
        self.assertEqual(rows[-1]["temp_a_c"],"")
        self.assertGreater(sum(r["temp_a_quality"]=="missing" for r in rows),100)
        repeated=sum(a["temp_a_c"]==b["temp_a_c"] and a["temp_a_c"]!="" for a,b in zip(rows,rows[1:]))
        self.assertGreater(repeated,10)
        self.assertGreater(max(float(r["temp_a_c"])-float(r["independent_a_c"]) for r in rows if r["temp_a_c"]),30)

    def test_10_recovery_and_acceleration(self):
        last={r["asset_id"]:r for r in self.truth if r["event_time"]==self.manifest["end"]}
        self.assertLess(float(last["tp308-t1"]["true_extra_heat_c"]),0.1)
        self.assertAlmostEqual(float(last["tp309-t1"]["true_extra_heat_c"]),15,places=3)
        self.assertFalse(load("config/diagnostic-policy.demo.json")["detection"]["autoCloseCase"])

    def test_11_transport_dedup_fixture(self):
        path=ROOT/"data/observations/transport_fault_examples.jsonl"
        items=[json.loads(x) for x in path.read_text().splitlines()]
        self.assertEqual(len(items),33)
        self.assertEqual(len({x["measurementId"] for x in items}),30)
        self.assertTrue(any((parse_iso(x["receivedAt"])-parse_iso(x["eventTime"])).total_seconds()>600 for x in items))

    def test_12_event_sources_are_not_continuous_transformer_data(self):
        breakers=load("data/observations/breaker_events.json")
        cable=load("data/observations/cable_daily_measurements.json")
        self.assertEqual(len(breakers),31);self.assertEqual(len(cable),31)
        self.assertTrue(all(x["operation"]=="close" for x in breakers))
        self.assertTrue(all(x["unit"]=="dB_ref_demo" for x in cable))
        self.assertTrue(170 < breakers[-1]["closingTimeMs"]-breakers[0]["closingTimeMs"] < 190)

    def test_13_reference_is_illustration_not_probability(self):
        r=self.reference; m=r["metrics"]
        self.assertEqual(m["observedTemperatureC"]-m["expectedTemperatureC"],m["residualC"])
        self.assertEqual(r["risk"]["score"],7.2)
        self.assertIsNone(m["failureProbability"])
        self.assertIsNone(m["slopeCPerDay"])
        self.assertEqual(r["calculationOrigin"],"presentation_illustration")
        chart=load("contracts/examples/reference-chart-reconstruction.json")["points"][-1]
        self.assertEqual((chart["observedC"],chart["expectedC"]),(80,68))

    def test_14_schema_examples_validate(self):
        for name in ("measurement","analysis"):
            Draft202012Validator.check_schema(load(f"contracts/{name}.schema.json"))
        mv=Draft202012Validator(load("contracts/measurement.schema.json"),format_checker=FormatChecker())
        for item in self.samples:
            mv.validate(item)
        av=Draft202012Validator(load("contracts/analysis.schema.json"),format_checker=FormatChecker())
        av.validate(self.reference)

    def test_15_schema_rejects_invalid_semantics(self):
        mv=Draft202012Validator(load("contracts/measurement.schema.json"),format_checker=FormatChecker())
        wrong=dict(self.samples[0]);wrong["unit"]="ms"
        with self.assertRaises(ValidationError):mv.validate(wrong)
        wrong=dict(self.samples[0]);wrong["value"]=None
        with self.assertRaises(ValidationError):mv.validate(wrong)
        av=Draft202012Validator(load("contracts/analysis.schema.json"),format_checker=FormatChecker())
        wrong=json.loads(json.dumps(self.reference));wrong["metrics"]["failureProbability"]=0.72
        with self.assertRaises(ValidationError):av.validate(wrong)
        wrong=json.loads(json.dumps(self.reference));wrong["controlCommandsAllowed"]=True
        with self.assertRaises(ValidationError):av.validate(wrong)

    def test_16_token_contrast(self):
        t=load("config/brand.example.json")["tokens"]
        pairs=[("text.primary","surface"),("text.secondary","surface"),("risk.high.text","risk.high.bg"),
               ("risk.medium.text","risk.medium.bg"),("risk.low.text","risk.low.bg"),("quality.unknown.text","quality.unknown.bg")]
        for fg,bg in pairs:
            self.assertGreaterEqual(ratio(t[fg],t[bg]),4.5,(fg,bg))
        self.assertGreaterEqual(ratio("#FFFFFF",t["brand.primary"]),4.5)
        for line in ("chart.observed","chart.expected","chart.forecast","topology.energized","topology.deenergized","topology.unknown"):
            self.assertGreaterEqual(ratio(t[line],t["surface"]),3,(line,ratio(t[line],t["surface"])))

    def test_17_advisory_config(self):
        p=load("config/diagnostic-policy.demo.json");b=load("config/brand.example.json")
        self.assertFalse(p["allowAutoApprove"]);self.assertFalse(p["allowOperationalCommands"])
        self.assertIsNone(p["failureProbability"])
        self.assertTrue(b["safety"]["advisoryOnly"])
        self.assertFalse(b["features"]["externalAi"])
        self.assertFalse(b["features"]["realDeviceConnection"])
        self.assertTrue(all("TRIP" not in a and "SETPOINT" not in a for a in p["allowedActionCodes"]))

    def test_18_no_fake_thermographic_evidence(self):
        evidence=load("data/observations/evidence.json")
        self.assertTrue(all(x["origin"]=="synthetic" and not x["hasImage"] and x["uri"] is None for x in evidence))

    def test_19_prompts_and_required_handoff_files(self):
        self.assertEqual(len(list((ROOT/"prompts").glob("*.md"))),11)
        for prompt in (ROOT/"prompts").glob("*.md"):
            text=prompt.read_text(encoding="utf-8")
            self.assertIn("OWNED",text)
            self.assertIn("READ-ONLY",text)
            self.assertIn("Приёмка",text)
        self.assertTrue((ROOT/"design.md").exists())
        self.assertTrue((ROOT/"references/slide-29.png").exists())


class RecordingResult(unittest.TextTestResult):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs);self.records=[]
    def addSuccess(self,test):
        super().addSuccess(test);self.records.append({"name":test.id().split(".")[-1],"status":"passed"})
    def addFailure(self,test,err):
        super().addFailure(test,err);self.records.append({"name":test.id().split(".")[-1],"status":"failed"})
    def addError(self,test,err):
        super().addError(test,err);self.records.append({"name":test.id().split(".")[-1],"status":"error"})


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report",type=Path)
    args=parser.parse_args()
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(BlueprintChecks)
    result=unittest.TextTestRunner(verbosity=2,resultclass=RecordingResult).run(suite)
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        report={"scope":"Blueprint files, schema examples, design token contrast and synthetic generator only. NOT application/field validation.",
                "checkedAt":datetime.now(timezone.utc).isoformat(),"python":sys.version,"jsonschema":version("jsonschema"),
                "testsRun":result.testsRun,"failures":len(result.failures),"errors":len(result.errors),
                "passed":result.wasSuccessful(),"checks":result.records,
                "notImplementedOrTested":["frontend","API/backend","workflow/RBAC runtime","diagnostic algorithm implementation","real equipment integration","Jev API calls","industrial safety or calibration"]}
        args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    raise SystemExit(0 if result.wasSuccessful() else 1)


if __name__=="__main__":main()
