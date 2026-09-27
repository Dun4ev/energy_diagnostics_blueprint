"""Same enriched OpenAPI for live API and frozen exports."""

from packages.domain_contracts import models as m


def complete_openapi(openapi):
    # Publish DTOs not yet used by stub endpoints, from the same canonical models.
    schema_models = [
        v
        for v in vars(m).values()
        if isinstance(v, type) and issubclass(v, m.DTO) and v not in {m.DTO, m.Envelope, m.Page}
    ]
    for model in schema_models:
        schema = model.model_json_schema(ref_template="#/components/schemas/{model}")
        definitions = schema.pop("$defs", {})
        openapi["components"]["schemas"].update(definitions)
        openapi["components"]["schemas"].setdefault(model.__name__, schema)
    openapi["components"]["securitySchemes"] = {
        "demoSession": {"type": "apiKey", "in": "cookie", "name": "energy_session"}
    }
    for path, methods in openapi["paths"].items():
        for op in methods.values():
            if not isinstance(op, dict):
                continue
            op["x-implementation-status"] = "implemented" if path.endswith("/health") else "stub"
            if path not in {"/api/v1/health", "/api/v1/auth/login"}:
                op["security"] = [{"demoSession": []}]
    return openapi
