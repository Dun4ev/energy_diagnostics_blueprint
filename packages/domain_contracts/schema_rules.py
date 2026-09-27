"""Declarative wire constraints exported alongside Pydantic validators."""

MEASUREMENT_RULES = [
    {
        "if": {"properties": {"quality": {"const": "missing"}}},
        "then": {"properties": {"value": {"type": "null"}}},
    },
    {
        "if": {"properties": {"quality": {"const": "good"}}},
        "then": {"properties": {"value": {"type": "number"}}},
    },
    {
        "if": {"properties": {"metric": {"const": "contact_temperature"}}},
        "then": {"properties": {"unit": {"const": "degC"}}},
    },
    {
        "if": {"properties": {"metric": {"const": "ambient_temperature"}}},
        "then": {"properties": {"unit": {"const": "degC"}}},
    },
    {
        "if": {"properties": {"metric": {"const": "load_fraction"}}},
        "then": {"properties": {"unit": {"const": "fraction"}}},
    },
    {
        "if": {"properties": {"metric": {"const": "closing_time"}}},
        "then": {"properties": {"unit": {"const": "ms"}}},
    },
    {
        "if": {"properties": {"metric": {"const": "relative_pd_indicator"}}},
        "then": {"properties": {"unit": {"const": "dB_ref_demo"}}},
    },
    {
        "if": {"properties": {"metric": {"const": "load_fraction"}}},
        "then": {"properties": {"value": {"maximum": 2, "minimum": 0, "type": ["number", "null"]}}},
    },
]
ANALYSIS_RULES = [
    {
        "if": {"properties": {"mode": {"const": "reference"}}},
        "then": {"properties": {"calculationOrigin": {"const": "presentation_illustration"}}},
    },
    {
        "if": {"properties": {"mode": {"const": "simulation"}}},
        "then": {
            "properties": {
                "calculationOrigin": {"const": "computed"},
                "modelVersion": {"minLength": 1, "type": "string"},
                "policyVersion": {"minLength": 1, "type": "string"},
            }
        },
    },
]
