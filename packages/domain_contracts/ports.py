"""Side-effect boundaries for stages02-07. No implementation or truth access."""

from collections.abc import Iterable, Iterator
from datetime import datetime
from typing import Protocol

from .models import (
    AnalysisBundle,
    AnalysisResult,
    Asset,
    DiagnosticPolicy,
    Evidence,
    Measurement,
    NextAction,
)


class Clock(Protocol):
    def now(self) -> datetime: ...
    def received_time(self) -> datetime: ...


class SourceAdapter(Protocol):
    def observations(
        self, *, scenario_run_id: str, as_of: datetime, received_as_of: datetime
    ) -> Iterator[Measurement]: ...


class NumericalAnalyzer(Protocol):
    def analyze(
        self,
        observations: Iterable[Measurement],
        asset: Asset,
        policy: DiagnosticPolicy,
        *,
        as_of: datetime,
        received_as_of: datetime,
    ) -> AnalysisBundle: ...


class EvidenceRepository(Protocol):
    def list_for_case(
        self, case_id: str, scenario_run_id: str, revision: int
    ) -> list[Evidence]: ...
    def append(self, evidence: Evidence, *, expected_revision: int) -> Evidence: ...


class DecisionAdvisor(Protocol):
    enabled: bool

    def suggest(self, analysis: AnalysisResult) -> list[NextAction]: ...


class DisabledDecisionAdvisor:
    enabled = False

    def suggest(self, analysis: AnalysisResult) -> list[NextAction]:
        return []
