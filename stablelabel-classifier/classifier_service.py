"""
StableLabel Classifier Service — Presidio + spaCy NER.

Runs as a long-lived subprocess. Reads JSON requests from stdin (one per line),
writes JSON responses to stdout (one per line). Designed to be called from the
Electron main process via ClassifierBridge.

Protocol:
  Request:  {"id": "<uuid>", "action": "analyze"|"health"|"list_entities", ...}
  Response: {"id": "<uuid>", "success": true|false, "data": ..., "error": ...}
"""

import json
import sys
import traceback
from typing import Any

from presidio_analyzer import (
    AnalyzerEngine,
    PatternRecognizer,
    Pattern,
    RecognizerResult,
)
from presidio_analyzer.nlp_engine import NlpEngineProvider

# ---------------------------------------------------------------------------
# Engine management
# ---------------------------------------------------------------------------

_engine: AnalyzerEngine | None = None
_custom_recognizers: list[PatternRecognizer] = []


def _build_engine(config: dict | None = None) -> AnalyzerEngine:
    """Create a fresh AnalyzerEngine with spaCy NER and optional custom recognizers."""
    provider = NlpEngineProvider(nlp_configuration={
        "nlp_engine_name": "spacy",
        "models": [{"lang_code": "en", "model_name": "en_core_web_lg"}],
    })
    nlp_engine = provider.create_engine()
    engine = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["en"])

    # Register custom recognizers from config
    if config and "custom_recognizers" in config:
        for rec_def in config["custom_recognizers"]:
            _add_custom_recognizer(engine, rec_def)

    # Register deny-list recognizers from config
    if config and "deny_lists" in config:
        for entity_type, values in config["deny_lists"].items():
            if values:
                deny_rec = PatternRecognizer(
                    supported_entity=entity_type,
                    deny_list=values,
                    name=f"deny_list_{entity_type}",
                )
                engine.registry.add_recognizer(deny_rec)

    return engine


def _add_custom_recognizer(engine: AnalyzerEngine, rec_def: dict) -> None:
    """Add a pattern-based custom recognizer to the engine."""
    patterns = []
    if "patterns" in rec_def:
        for p in rec_def["patterns"]:
            patterns.append(Pattern(
                name=p.get("name", rec_def["name"]),
                regex=p["regex"],
                score=p.get("score", rec_def.get("score", 0.6)),
            ))
    elif "pattern" in rec_def:
        patterns.append(Pattern(
            name=rec_def["name"],
            regex=rec_def["pattern"],
            score=rec_def.get("score", 0.6),
        ))

    context_words = rec_def.get("context_words", [])

    recognizer = PatternRecognizer(
        supported_entity=rec_def["entity_type"],
        patterns=patterns,
        context=context_words if context_words else None,
        name=rec_def["name"],
    )
    engine.registry.add_recognizer(recognizer)


def get_engine(config: dict | None = None) -> AnalyzerEngine:
    """Get or create the analyzer engine."""
    global _engine
    if _engine is None:
        _engine = _build_engine(config)
    return _engine


def reload_engine(config: dict | None = None) -> AnalyzerEngine:
    """Force-rebuild the engine with new config."""
    global _engine
    _engine = _build_engine(config)
    return _engine


# ---------------------------------------------------------------------------
# Action handlers
# ---------------------------------------------------------------------------


def handle_health(_request: dict) -> dict:
    """Health check — verify engine can be loaded."""
    engine = get_engine()
    supported = engine.get_supported_entities()
    return {"status": "ok", "supported_entities": sorted(supported)}


def handle_list_entities(_request: dict) -> dict:
    """List all supported entity types."""
    engine = get_engine()
    entities = engine.get_supported_entities()
    return {"entities": sorted(entities)}


def handle_analyze(request: dict) -> dict:
    """Analyze text for PII entities."""
    text = request.get("text", "")
    if not text:
        return {"results": [], "entity_counts": {}}

    config = request.get("config")
    engine = get_engine(config)

    # Determine which entities to scan for
    entities_config = config.get("entities", {}) if config else {}
    enabled_entities: list[str] | None = None

    if entities_config:
        enabled_entities = [
            etype for etype, econf in entities_config.items()
            if econf.get("enabled", True)
        ]
        if not enabled_entities:
            return {"results": [], "entity_counts": {}}

    # Run analysis
    results: list[RecognizerResult] = engine.analyze(
        text=text,
        entities=enabled_entities,
        language="en",
    )

    # Apply per-entity threshold filtering
    filtered: list[dict[str, Any]] = []
    entity_counts: dict[str, int] = {}

    for r in results:
        threshold = 0.0
        if entities_config and r.entity_type in entities_config:
            threshold = entities_config[r.entity_type].get("threshold", 0.0)

        if r.score >= threshold:
            filtered.append({
                "entity_type": r.entity_type,
                "start": r.start,
                "end": r.end,
                "score": round(r.score, 4),
                "text": text[r.start:r.end],
            })
            entity_counts[r.entity_type] = entity_counts.get(r.entity_type, 0) + 1

    # Sort by position
    filtered.sort(key=lambda x: x["start"])

    return {"results": filtered, "entity_counts": entity_counts}


def handle_reload(request: dict) -> dict:
    """Reload the engine with updated config."""
    config = request.get("config")
    reload_engine(config)
    engine = get_engine()
    return {
        "status": "reloaded",
        "supported_entities": sorted(engine.get_supported_entities()),
    }


def handle_test(request: dict) -> dict:
    """Analyze sample text — convenience for testing from the UI."""
    return handle_analyze(request)


ACTIONS = {
    "health": handle_health,
    "list_entities": handle_list_entities,
    "analyze": handle_analyze,
    "reload": handle_reload,
    "test": handle_test,
}


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


def main() -> None:
    """Read JSON requests from stdin, write JSON responses to stdout."""
    # Ensure stdout is line-buffered for real-time communication
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)

    # Signal readiness
    ready_msg = json.dumps({"id": "__startup__", "success": True, "data": {"status": "ready"}})
    sys.stdout.write(ready_msg + "\n")
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            error_resp = json.dumps({
                "id": None,
                "success": False,
                "error": f"Invalid JSON: {e}",
            })
            sys.stdout.write(error_resp + "\n")
            sys.stdout.flush()
            continue

        req_id = request.get("id")
        action = request.get("action", "")

        try:
            handler = ACTIONS.get(action)
            if not handler:
                response = {
                    "id": req_id,
                    "success": False,
                    "error": f"Unknown action: {action}",
                }
            else:
                data = handler(request)
                response = {"id": req_id, "success": True, "data": data}
        except Exception:
            response = {
                "id": req_id,
                "success": False,
                "error": traceback.format_exc(),
            }

        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
