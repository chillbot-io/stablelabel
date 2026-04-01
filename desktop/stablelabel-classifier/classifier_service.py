"""
StableLabel Classifier Service — Presidio + spaCy NER.

Runs as a long-lived subprocess. Reads JSON requests from stdin (one per line),
writes JSON responses to stdout (one per line). Designed to be called from the
Electron main process via ClassifierBridge.

Protocol:
  Request:  {"id": "<uuid>", "action": "analyze"|"health"|"list_entities", ...}
  Response: {"id": "<uuid>", "success": true|false, "data": ..., "error": ...}
"""

import hashlib
import json
import os
import re
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
# Constants
# ---------------------------------------------------------------------------

MAX_TEXT_LENGTH = 1_000_000  # 1MB — prevent OOM from spaCy on huge inputs

# ---------------------------------------------------------------------------
# Engine management
# ---------------------------------------------------------------------------

_engine: AnalyzerEngine | None = None
_nlp_engine = None  # Cache the spaCy NLP engine (expensive to create)
_engine_config_hash: str | None = None  # Track config to detect changes


def _config_hash(config: dict | None) -> str:
    """Deterministic hash of config for change detection."""
    if config is None:
        return ""
    return hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()


def _get_spacy_model_name() -> str:
    """Resolve spaCy model — handles PyInstaller bundled path."""
    if getattr(sys, '_MEIPASS', None):
        # PyInstaller bundle: model is extracted alongside the exe
        bundled = os.path.join(sys._MEIPASS, 'en_core_web_lg')
        if os.path.isdir(bundled):
            return bundled
    return 'en_core_web_lg'


def _get_nlp_engine():
    """Get or create the cached spaCy NLP engine."""
    global _nlp_engine
    if _nlp_engine is None:
        model_name = _get_spacy_model_name()
        provider = NlpEngineProvider(nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": model_name}],
        })
        _nlp_engine = provider.create_engine()
    return _nlp_engine


def _build_engine(config: dict | None = None) -> AnalyzerEngine:
    """Create a fresh AnalyzerEngine with spaCy NER and optional custom recognizers."""
    nlp_engine = _get_nlp_engine()
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
            regex = p.get("regex", "")
            if not _validate_regex(regex):
                continue
            patterns.append(Pattern(
                name=p.get("name", rec_def["name"]),
                regex=regex,
                score=p.get("score", rec_def.get("score", 0.6)),
            ))
    elif "pattern" in rec_def:
        regex = rec_def["pattern"]
        if not _validate_regex(regex):
            return
        patterns.append(Pattern(
            name=rec_def["name"],
            regex=regex,
            score=rec_def.get("score", 0.6),
        ))

    if not patterns:
        return  # Skip recognizers with no valid patterns

    # Normalize context words to lowercase for Presidio's LemmaContextAwareEnhancer
    context_words = [w.lower().strip() for w in rec_def.get("context_words", []) if w.strip()]

    recognizer = PatternRecognizer(
        supported_entity=rec_def["entity_type"],
        patterns=patterns,
        context=context_words if context_words else None,
        name=rec_def["name"],
    )
    engine.registry.add_recognizer(recognizer)


def _validate_regex(pattern: str) -> bool:
    """Validate a regex pattern — reject invalid or dangerous patterns."""
    if not pattern:
        return False
    try:
        compiled = re.compile(pattern)
        # Basic heuristic: reject patterns with nested quantifiers (catastrophic backtracking risk)
        # e.g., (a+)+, (a*)*b, (a|b+)+
        if re.search(r'\([^)]*[+*][^)]*\)[+*]', pattern):
            sys.stderr.write(f"Rejected dangerous regex (nested quantifiers): {pattern}\n")
            return False
        return True
    except re.error:
        return False


def get_engine(config: dict | None = None) -> AnalyzerEngine:
    """Get or create the analyzer engine. Rebuilds if config has changed."""
    global _engine, _engine_config_hash
    new_hash = _config_hash(config)
    if _engine is None or (config is not None and new_hash != _engine_config_hash):
        _engine = _build_engine(config)
        _engine_config_hash = new_hash
    return _engine


def reload_engine(config: dict | None = None) -> AnalyzerEngine:
    """Force-rebuild the engine with new config."""
    global _engine, _engine_config_hash
    _engine = _build_engine(config)
    _engine_config_hash = _config_hash(config)
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

    # Enforce size limit to prevent OOM from spaCy processing
    truncated = False
    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH]
        truncated = True

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

    result = {"results": filtered, "entity_counts": entity_counts}
    if truncated:
        result["warning"] = f"Text truncated to {MAX_TEXT_LENGTH} characters"
    return result


def handle_reload(request: dict) -> dict:
    """Reload the engine with updated config."""
    config = request.get("config")
    engine = reload_engine(config)
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


def _write_response(response: dict) -> None:
    """Safely serialize and write a response to stdout."""
    try:
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()
    except (TypeError, ValueError) as e:
        fallback = {"id": response.get("id"), "success": False, "error": f"Serialization error: {e}"}
        sys.stdout.write(json.dumps(fallback) + "\n")
        sys.stdout.flush()


def main() -> None:
    """Read JSON requests from stdin, write JSON responses to stdout."""
    # Ensure stdout is line-buffered for real-time communication
    # Guard for PyInstaller where stdout may not be a TextIOWrapper
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except AttributeError:
        pass
    try:
        sys.stderr.reconfigure(line_buffering=True)
    except AttributeError:
        pass

    # Signal readiness
    ready_msg = json.dumps({"id": "__startup__", "success": True, "data": {"status": "ready"}})
    sys.stdout.write(ready_msg + "\n")
    sys.stdout.flush()

    # Use readline() loop instead of `for line in sys.stdin` — the iterator
    # uses an internal read-ahead buffer that delays line delivery, causing
    # the request-response protocol to stall unpredictably.
    while True:
        line = sys.stdin.readline()
        if not line:
            break  # EOF — parent process closed stdin
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            _write_response({
                "id": None,
                "success": False,
                "error": f"Invalid JSON: {e}",
            })
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
            sys.stderr.write(traceback.format_exc() + "\n")
            response = {
                "id": req_id,
                "success": False,
                "error": str(sys.exc_info()[1]),
            }

        _write_response(response)


if __name__ == "__main__":
    main()
