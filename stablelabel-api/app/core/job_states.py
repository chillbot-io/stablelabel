"""Job state machine — transition table and terminal states.

No heavy imports here so tests can import without triggering jose.
"""

VALID_TRANSITIONS: dict[str, dict[str, tuple[str, ...] | str]] = {
    "start":    {"from": ("pending",),                                    "to": "enumerating"},
    "pause":    {"from": ("enumerating", "running"),                      "to": "paused"},
    "resume":   {"from": ("paused",),                                     "to": "_from_checkpoint"},
    "cancel":   {"from": ("pending", "enumerating", "running", "paused"), "to": "failed"},
    "rollback": {"from": ("completed", "failed", "paused"),               "to": "rolling_back"},
}

SPECIAL_ACTIONS = {"copy"}

COPY_ALLOWED_FROM = ("completed", "failed", "rolled_back")

TERMINAL_STATUSES = frozenset({"completed", "failed", "rolled_back"})

# Statuses where the SSE progress stream should stop (terminal + paused).
# Paused is not truly terminal (resume/rollback are valid), but the stream
# stops so the client can reconnect after the job is resumed.
SSE_STOP_STATUSES = TERMINAL_STATUSES | {"paused"}

ALL_STATES = frozenset({
    "pending", "enumerating", "running", "paused",
    "completed", "failed", "rolling_back", "rolled_back",
})
