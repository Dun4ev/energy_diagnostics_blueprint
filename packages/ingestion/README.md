# Synthetic ingestion adapter

`SyntheticAdapter` reads a directory containing the checked-in observation
files. Pass `data/observations`, not the parent `data` directory. It implements
the canonical `SourceAdapter.observations` port and also exposes `assets()` and
`sources()` for registry setup. It has no network or field-device connector.

## Source mapping

| Raw observation | Canonical source ID | Metric / unit | Channel |
|---|---|---|---|
| `load_fraction` | `{assetId}:load` | `load_fraction` / `fraction` | `load` |
| `ambient_c` | `{assetId}:ambient` | `ambient_temperature` / `degC` | `ambient` |
| `temp_a_c` | `{assetId}:primary_a` | `contact_temperature` / `degC` | `primary_a` |
| `independent_a_c` | `{assetId}:independent_a` | `contact_temperature` / `degC` | `independent_a` |
| `temp_b_c` | `{assetId}:phase_b` | `contact_temperature` / `degC` | `phase_b` |
| breaker `closingTimeMs` | `{assetId}:event` | `closing_time` / `ms` | `event` |
| cable `relativePdIndicatorDb` | `{assetId}:daily` | `relative_pd_indicator` / `dB_ref_demo` | `daily` |

Transformer rows are read from gzip CSV one row at a time and expanded in the
channel order above. Empty scalar values become `value=null, quality=missing`.
Breaker operations and cable samples remain separate event/daily observations;
neither reader interpolates them onto a five-minute grid.

For CSV rows, `measurementId` is `{record_id}:{channel}`, which retains a
stable raw-record reference. Quarantine entries include the input filename,
line/index and record ID when available, the reason, and the raw fields. An
optional `quarantine_sink` receives every rejected entry for caller-owned
storage. The adapter keeps the last 1000 in-memory quarantine entries as a
bounded diagnostic preview.
Measurement DTOs remain unchanged. The normalized transport fixture reader
keeps measurement IDs and original `receivedAt`, remaps legacy channel IDs to
the canonical IDs above, and deduplicates by `(measurementId, sourceId,
eventTime)`, retaining the first packet's received timestamp.

Replay includes a record only when both `eventTime <= as_of` and
`receivedAt <= received_as_of`. It preserves deterministic input-file order
and does not sort or rewrite late arrivals. An optional `since` bound is
inclusive (`eventTime >= since`) and skips older CSV rows before scalar
validation and DTO construction; the compressed stream still has to be read.
Timestamp validation rejects
missing/naive timestamps and `eventTime > receivedAt`; no wall-clock drift
threshold is inferred because the synthetic files provide no trusted clock
reference. Adapter dedup uses a temporary SQLite index so working memory does
not grow with the observation count.

The shared `Asset` DTO requires `demoConsequenceWeight`, while breaker and cable
source rows omit it. For those two non-transformer fixture assets the adapter
uses `0.5`, the neutral value in the reference asset fixture; these assets are
not passed through the transformer thermal scoring path. This is a synthetic
contract placeholder, not an engineering consequence assessment.
