"""Russian templates; all numeric claims come from calculated DTO fields."""

from packages.domain_contracts.models import AnalysisMetrics, AnalysisQuality, Trend


def quality_reason(quality: AnalysisQuality) -> str:
    return "; ".join(quality.issues) if quality.issues else "Данные пригодны для пилотного расчета."


def thermal_reason(metrics: AnalysisMetrics, trends: list[Trend]) -> str:
    if metrics.residualC is None:
        return "Остаток температуры не рассчитан."
    statement = f"Отклонение от ожидаемого режима {metrics.residualC:+.2f} °C."
    trend = next((t for t in trends if t.windowHours == 72 and t.slopeCPerDay is not None), None)
    if trend is not None:
        statement += f" Тренд за 72 ч {trend.slopeCPerDay:+.2f} °C/сут."
    return statement
