"""Pure thermal analyzer. No I/O, truth labels, storage or device integration."""

from __future__ import annotations

import hashlib
import json
import math
from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime, timedelta, timezone
from statistics import median

from packages.domain_contracts.models import (
    AnalysisBundle,
    AnalysisDetails,
    AnalysisMetrics,
    AnalysisQuality,
    AnalysisResult,
    Asset,
    DiagnosticPolicy,
    Hypothesis,
    InputWindow,
    Measurement,
    MonitoringWindow,
    NextAction,
    Risk,
    SeriesPoint,
    Trend,
)

from .explanation import quality_reason, thermal_reason

MODEL_VERSION = "deterministic-thermal-0.1.0"
CHANNELS = {
    "load": "load_fraction",
    "ambient": "ambient_temperature",
    "primary_a": "contact_temperature",
    "independent_a": "contact_temperature",
    "phase_b": "contact_temperature",
}
SOURCE_COUNT = 5
SYNC_SECONDS = 600
SENSOR_DISAGREEMENT_C = 8.0
STUCK_SPAN_HOURS = 3
STUCK_PRIMARY_RANGE_C = 0.05
STUCK_INDEPENDENT_RANGE_C = 2.0


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("as_of and received_as_of require timezone")
    return value.astimezone(timezone.utc)


def _hash(data: object) -> str:
    raw = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _source_channel(source_id: str, asset_id: str) -> str | None:
    prefix = asset_id + ":"
    if not source_id.startswith(prefix):
        return None
    channel = source_id[len(prefix) :]
    return channel if channel in CHANNELS else None


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _theil_sen(bins: list[tuple[datetime, float]]) -> float:
    slopes = []
    for i, (ti, yi) in enumerate(bins):
        for tj, yj in bins[i + 1 :]:
            elapsed_days = (tj - ti).total_seconds() / 86400
            if elapsed_days > 0:
                slopes.append((yj - yi) / elapsed_days)
    return float(median(slopes))


def _trend(points: list[SeriesPoint], as_of: datetime, hours: int, policy: DiagnosticPolicy) -> Trend:
    start = as_of - timedelta(hours=hours)
    grouped: dict[datetime, list[float]] = defaultdict(list)
    for point in points:
        if point.residualC is not None and start <= point.eventTime <= as_of:
            bin_start = point.eventTime.replace(minute=0, second=0, microsecond=0)
            grouped[bin_start].append(point.residualC)
    bins = sorted((hour, float(median(values))) for hour, values in grouped.items())
    # A 72-hour window contains at most 73 boundary bins. Use the nominal hours
    # as the denominator, while clamping the boundary case to 1.
    coverage = min(1.0, len(bins) / hours)
    span_hours = (bins[-1][0] - bins[0][0]).total_seconds() / 3600 + 1 if bins else 0
    reason = None
    if len(bins) < policy.quality.minimumHourlyBins:
        reason = "Недостаточно валидных часовых интервалов."
    elif coverage < policy.quality.minimumWindowCoverage:
        reason = "Недостаточное покрытие временного окна."
    elif span_hours < min(hours, policy.quality.minimumTrendHours):
        reason = "Недостаточная длительность наблюдения."
    return Trend(
        windowHours=hours,
        slopeCPerDay=None if reason else _theil_sen(bins),
        hourlyBins=len(bins),
        coverage=coverage,
        reason=reason,
    )


def _action(policy: DiagnosticPolicy, code: str, reason: str) -> NextAction | None:
    if code not in policy.allowedActionCodes:
        return None
    return NextAction(code=code, reason=reason, dueWithinHours=None, requiresHumanApproval=True)


class DeterministicAnalyzer:
    """Implementation of NumericalAnalyzer; caller bounds the observation window."""

    def analyze(
        self,
        observations: Iterable[Measurement],
        asset: Asset,
        policy: DiagnosticPolicy,
        *,
        as_of: datetime,
        received_as_of: datetime,
        scenario_run_id: str | None = None,
    ) -> AnalysisBundle:
        bundle, _ = self._calculate(observations, asset, policy, as_of, received_as_of, scenario_run_id)
        return bundle

    def analyze_series(
        self,
        observations: Iterable[Measurement],
        asset: Asset,
        policy: DiagnosticPolicy,
        *,
        as_of: datetime,
        received_as_of: datetime,
        scenario_run_id: str | None = None,
    ) -> tuple[AnalysisBundle, list[SeriesPoint]]:
        """Return the analysis and its historical points from one calculation pass."""
        return self._calculate(observations, asset, policy, as_of, received_as_of, scenario_run_id)

    def _calculate(
        self,
        observations: Iterable[Measurement],
        asset: Asset,
        policy: DiagnosticPolicy,
        as_of: datetime,
        received_as_of: datetime,
        scenario_run_id: str | None = None,
    ) -> tuple[AnalysisBundle, list[SeriesPoint]]:
        as_of, received_as_of = _utc(as_of), _utc(received_as_of)
        accepted = [
            m for m in observations
            if m.assetId == asset.assetId
            and m.eventTime <= as_of
            and m.receivedAt <= received_as_of
        ]
        accepted.sort(key=lambda m: (m.eventTime, m.sourceId, m.receivedAt, m.measurementId))
        # Duplicate source/time measurements are resolved by the latest available
        # reception. The hash is taken after this replay-time resolution.
        unique = {(m.sourceId, m.eventTime): m for m in accepted}
        selected = sorted(unique.values(), key=lambda m: (m.eventTime, m.sourceId))
        snapshot = [m.model_dump(mode="json") for m in selected]
        input_hash = _hash(snapshot)
        run_ids = {m.scenarioRunId for m in selected}
        if scenario_run_id is not None and run_ids - {scenario_run_id}:
            raise ValueError("observations do not belong to scenario_run_id")
        run_id = scenario_run_id or (next(iter(run_ids)) if len(run_ids) == 1 else "unknown-run")
        analysis_id = "analysis-" + _hash({
            "input": input_hash, "asOf": as_of.isoformat(),
            "receivedAsOf": received_as_of.isoformat(), "run": run_id,
            "asset": asset.model_dump(mode="json"), "model": MODEL_VERSION,
            "policy": policy.model_dump(mode="json"),
        })[:24]
        window_end = max((m.eventTime for m in selected), default=min(as_of, received_as_of))
        window_start = min((m.eventTime for m in selected), default=window_end)
        window = InputWindow(start=window_start, end=window_end, replayReceivedAt=received_as_of)

        supported = asset.assetType == "transformer" and asset.calibration is not None
        reason = None if supported else "Тепловая модель применима только к трансформатору с калибровкой."
        if len(run_ids) > 1:
            supported = False
            reason = "Смешаны измерения из разных запусков сценария."
        channels: dict[str, list[Measurement]] = defaultdict(list)
        for m in selected:
            channel = _source_channel(m.sourceId, asset.assetId)
            if channel and m.metric == CHANNELS[channel]:
                channels[channel].append(m)
        points = self._series(channels, asset, policy) if supported else []
        trends = [_trend(points, as_of, h, policy) for h in policy.trend.windowsHours]
        primary = channels["primary_a"]
        latest_primary = primary[-1] if primary else None
        last_point = next((p for p in reversed(points) if p.residualC is not None), None)
        warm_up = bool(points) and all(p.residualC is None for p in points)
        disagreement = self._disagreement(channels, as_of)
        stuck = self._stuck(channels, as_of)
        current_disagreement = disagreement or stuck
        current_fresh = bool(
            latest_primary
            and latest_primary.quality == "good"
            and latest_primary.value is not None
            and 0 <= (as_of - latest_primary.eventTime).total_seconds()
            <= policy.quality.maxTelemetryAgeSeconds
        )
        current_point = bool(
            last_point and 0 <= (as_of - last_point.eventTime).total_seconds()
            <= policy.quality.maxTelemetryAgeSeconds
        )
        main_trend = next((t for t in trends if t.windowHours == 72), None)
        if main_trend is None:
            main_trend = next((t for t in trends if t.windowHours == 24), None)
        coverage = main_trend.coverage if main_trend else None
        issues = []
        if reason:
            issues.append(reason)
        if warm_up:
            issues.append("Начальное установление тепловой модели: 5 tau.")
        if not current_fresh or not current_point:
            issues.append("Нет свежего полного измерения температуры, нагрузки и среды.")
        if main_trend is None or main_trend.slopeCPerDay is None:
            issues.append(main_trend.reason if main_trend and main_trend.reason else "Нет тренда.")
        if disagreement:
            issues.append("Основной и независимый датчики расходятся более чем на 8 °C.")
        if stuck:
            issues.append("Основной датчик подозрительно неизменен при изменении независимого.")
        fresh_sources = sum(
            bool(channels[channel])
            and channels[channel][-1].quality == "good"
            and channels[channel][-1].value is not None
            and (as_of - channels[channel][-1].eventTime).total_seconds()
            <= policy.quality.maxTelemetryAgeSeconds
            for channel in CHANNELS
        )
        sufficient = (
            supported and not warm_up and current_fresh and current_point
            and main_trend is not None and main_trend.slopeCPerDay is not None
            and not current_disagreement
        )
        quality = AnalysisQuality(
            overall="good" if sufficient and fresh_sources == SOURCE_COUNT else (
                "partial" if sufficient else "insufficient"
            ),
            freshSources=fresh_sources,
            totalSources=SOURCE_COUNT,
            coverage=coverage,
            issues=issues,
        )
        metrics = AnalysisMetrics(
            observedTemperatureC=last_point.observedC if current_point else None,
            expectedTemperatureC=last_point.expectedC if current_point else None,
            residualC=last_point.residualC if current_point else None,
            loadFraction=last_point.loadFraction if current_point else None,
            ambientC=last_point.ambientC if current_point else None,
            slopeCPerDay=main_trend.slopeCPerDay if main_trend else None,
            trendWindowHours=main_trend.windowHours if main_trend else None,
            failureProbability=None,
        )
        persistence = self._persistence(points, policy.detection.residualWatchC, as_of)
        watch = persistence >= policy.detection.persistMinutes
        hysteresis_review = self._episode_active(points, policy)
        status = "insufficient_data" if not sufficient else (
            "requires_review" if watch or hysteresis_review else "normal"
        )
        if sufficient:
            severity = _clamp(max(metrics.residualC or 0, 0) / policy.priority.severityScaleC)
            growth = _clamp(max(metrics.slopeCPerDay or 0, 0) / policy.priority.growthScaleCPerDay)
            weights = policy.priority.weights
            score = round(10 * (
                weights.severity * severity + weights.growth * growth
                + weights.consequence * asset.demoConsequenceWeight
            ), 1)
            priority = "high" if score >= policy.priority.highFrom else (
                "medium" if score >= policy.priority.mediumFrom else "low"
            )
        else:
            score, priority = None, "unknown"
        risk = Risk(
            score=score, scaleMax=10, priority=priority,
            label=(f"Пилотный индекс приоритета {score:.1f}/10; не вероятность отказа."
                   if score is not None else "Текущий приоритет неизвестен; требуется проверка данных."),
            probabilistic=False,
        )
        hypotheses = []
        if current_disagreement:
            ids = [m.measurementId for key in ("primary_a", "independent_a") for m in channels[key][-1:]]
            hypotheses.append(Hypothesis(
                code="SENSOR_DISAGREEMENT", title="Возможная проблема измерения",
                status="unconfirmed", supportEvidenceIds=ids,
                missingEvidence=["Проверка датчиков и места измерения"],
            ))
        elif sufficient and watch:
            independent = channels["independent_a"][-1] if channels["independent_a"] else None
            hypotheses.append(Hypothesis(
                code="ADDITIONAL_HEAT", title="Возможный дополнительный нагрев контакта",
                status="unconfirmed",
                supportEvidenceIds=[latest_primary.measurementId] if latest_primary else [],
                missingEvidence=([] if independent and independent.quality == "good" else
                                 ["Свежее независимое измерение той же точки"])
                + ["Актуальная термография и инженерная проверка"],
            ))
        actions = []
        desired = (
            [("VERIFY_TELEMETRY", quality_reason(quality))] if not sufficient or current_disagreement else
            [("REQUEST_THERMOGRAPHY", thermal_reason(metrics, trends)),
             ("ENGINEERING_REVIEW", "Рассмотреть признаки и контраргументы до решения.")]
            if status == "requires_review" else
            [("CONTINUE_OBSERVATION", thermal_reason(metrics, trends))]
        )
        if current_disagreement:
            desired.append(("COMPARE_PHASES_AND_LOAD", "Сопоставить каналы в одинаковых условиях."))
        for code, action_reason in desired:
            action = _action(policy, code, action_reason)
            if action is not None:
                actions.append(action)
        result = AnalysisResult(
            schemaVersion="0.1.0", analysisRunId=analysis_id, assetId=asset.assetId,
            scenarioRunId=run_id, asOf=as_of, mode="simulation", status=status,
            modelVersion=MODEL_VERSION, policyVersion=policy.version,
            inputSnapshotId="snapshot-" + input_hash[:24], calculationOrigin="computed",
            quality=quality, metrics=metrics, risk=risk, hypotheses=hypotheses,
            nextActions=actions,
            monitoringWindow=MonitoringWindow(minDays=None, maxDays=None, isFailureDateForecast=False),
            advisoryOnly=True, controlCommandsAllowed=False,
        )
        details = AnalysisDetails(
            analysisRunId=analysis_id, inputWindow=window, inputSnapshotHash=input_hash,
            trends=trends, persistenceMinutes=persistence if points else None,
            counterEvidenceIds=(
                [channels["independent_a"][-1].measurementId]
                if current_disagreement and channels["independent_a"] else []
            ),
            methodStatus="unsupported" if not supported else "warm_up" if warm_up else "supported",
            methodReason=reason if reason else (
                "Начальное установление тепловой модели: 5 tau." if warm_up else None
            ),
            forecastEnabled=False,
        )
        return AnalysisBundle(analysis=result, details=details), points

    def _series(
        self, channels: dict[str, list[Measurement]], asset: Asset, policy: DiagnosticPolicy
    ) -> list[SeriesPoint]:
        calibration = asset.calibration
        assert calibration is not None
        # Align controls strictly backward in event time, never to a future value.
        indices = {"load": 0, "ambient": 0, "independent_a": 0, "phase_b": 0}
        latest: dict[str, Measurement] = {}
        state = None
        previous_time = None
        first_time = None
        points = []
        for primary in channels["primary_a"]:
            event_time = primary.eventTime
            for channel in indices:
                stream = channels[channel]
                index = indices[channel]
                while index < len(stream) and stream[index].eventTime <= event_time:
                    latest[channel] = stream[index]
                    index += 1
                indices[channel] = index
            load = latest.get("load")
            ambient = latest.get("ambient")
            inputs = (load, ambient)
            aligned = all(
                item is not None and item.quality == "good" and item.value is not None
                and 0 <= (event_time - item.eventTime).total_seconds() <= SYNC_SECONDS
                for item in inputs
            )
            valid_primary = primary.quality == "good" and primary.value is not None
            if first_time is None and aligned:
                first_time = event_time
                state = calibration.aC + calibration.bC * load.value**2
                previous_time = event_time
            if aligned and state is not None:
                dt_hours = (event_time - previous_time).total_seconds() / 3600
                target = calibration.aC + calibration.bC * load.value**2
                state += -math.expm1(-dt_hours / calibration.tauHours) * (target - state)
                previous_time = event_time
                expected = ambient.value + state
            else:
                expected = None
            in_warm_up = first_time is None or (event_time - first_time).total_seconds() < 5 * calibration.tauHours * 3600
            residual = primary.value - expected if aligned and valid_primary and not in_warm_up else None
            independent = latest.get("independent_a")
            divergent = bool(
                independent and independent.quality == "good" and independent.value is not None
                and valid_primary
                and 0 <= (event_time - independent.eventTime).total_seconds() <= SYNC_SECONDS
                and abs(primary.value - independent.value) > SENSOR_DISAGREEMENT_C
            )
            if divergent:
                residual = None  # keep the raw reading while excluding disputed evidence
            quality = "good" if residual is not None else (
                primary.quality if primary.quality != "good" else "suspect"
            )
            points.append(SeriesPoint(
                eventTime=event_time, observedC=primary.value,
                expectedC=expected, residualC=residual,
                loadFraction=load.value if aligned else None,
                ambientC=ambient.value if aligned else None,
                quality=quality,
                sourceIds=[m.sourceId for m in (primary, load, ambient, independent) if m is not None],
                historicalLowerC=None, historicalUpperC=None,
            ))
        return points

    def _disagreement(self, channels: dict[str, list[Measurement]], as_of: datetime) -> bool:
        primary = channels["primary_a"][-1] if channels["primary_a"] else None
        independent = channels["independent_a"][-1] if channels["independent_a"] else None
        return bool(
            primary and independent and primary.quality == independent.quality == "good"
            and primary.value is not None and independent.value is not None
            and abs((primary.eventTime - independent.eventTime).total_seconds()) <= SYNC_SECONDS
            and (as_of - independent.eventTime).total_seconds() <= SYNC_SECONDS
            and abs(primary.value - independent.value) > SENSOR_DISAGREEMENT_C
        )

    def _stuck(self, channels: dict[str, list[Measurement]], as_of: datetime) -> bool:
        start = as_of - timedelta(hours=STUCK_SPAN_HOURS)
        primary = [m.value for m in channels["primary_a"] if m.eventTime >= start and m.quality == "good" and m.value is not None]
        independent = [m.value for m in channels["independent_a"] if m.eventTime >= start and m.quality == "good" and m.value is not None]
        return bool(
            len(primary) >= 3 and len(independent) >= 3
            and max(primary) - min(primary) <= STUCK_PRIMARY_RANGE_C
            and max(independent) - min(independent) >= STUCK_INDEPENDENT_RANGE_C
        )

    def _persistence(self, points: list[SeriesPoint], threshold: float, as_of: datetime) -> float:
        eligible = [p for p in points if p.eventTime <= as_of]
        if not eligible or eligible[-1].residualC is None or eligible[-1].quality != "good" or eligible[-1].residualC < threshold:
            return 0.0
        end = eligible[-1].eventTime
        start = end
        for point in reversed(eligible[:-1]):
            if point.residualC is None or point.quality != "good" or point.residualC < threshold or (start - point.eventTime).total_seconds() > SYNC_SECONDS:
                break
            start = point.eventTime
        return (end - start).total_seconds() / 60

    def _persistence_below(self, points: list[SeriesPoint], threshold: float, as_of: datetime) -> float:
        eligible = [p for p in points if p.eventTime <= as_of]
        if not eligible or eligible[-1].residualC is None or eligible[-1].quality != "good" or eligible[-1].residualC >= threshold:
            return 0.0
        end = eligible[-1].eventTime
        start = end
        for point in reversed(eligible[:-1]):
            if point.residualC is None or point.quality != "good" or point.residualC >= threshold or (start - point.eventTime).total_seconds() > SYNC_SECONDS:
                break
            start = point.eventTime
        return (end - start).total_seconds() / 60

    def _episode_active(self, points: list[SeriesPoint], policy: DiagnosticPolicy) -> bool:
        active = False
        high_start = low_start = previous = None
        for point in points:
            if previous is None or (point.eventTime - previous).total_seconds() > SYNC_SECONDS:
                high_start = low_start = None
            previous = point.eventTime
            if point.residualC is None or point.quality != "good":
                high_start = low_start = None
                continue
            high_start = (high_start or point.eventTime) if point.residualC >= policy.detection.residualWatchC else None
            low_start = (low_start or point.eventTime) if point.residualC < policy.detection.clearResidualC else None
            if high_start is not None and (point.eventTime-high_start).total_seconds()/60 >= policy.detection.persistMinutes:
                active = True
            if low_start is not None and (point.eventTime-low_start).total_seconds()/60 >= policy.detection.clearPersistMinutes:
                active = False
        return active
