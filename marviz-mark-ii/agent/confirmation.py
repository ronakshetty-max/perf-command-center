from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field

VALID_ACTION_TYPES = {"pause_campaign", "enable_campaign", "update_budget"}
VALID_PLATFORMS = {"google", "meta"}

STATUS_AWAITING = "awaiting_confirmation"
STATUS_CONFIRMED = "confirmed"
STATUS_CANCELLED = "cancelled"
STATUS_EXPIRED = "expired"
STATUS_EXECUTED = "executed"


@dataclass
class PendingAction:
    id: str
    action_type: str
    platform: str
    campaign_id: str
    params: dict
    created_at: float
    status: str = STATUS_AWAITING


AFFIRMATIVE_WORDS = {
    "yes", "yeah", "yep", "yup", "sure", "confirm", "confirmed",
    "go ahead", "do it", "ok", "okay", "absolutely", "definitely",
    "proceed", "correct", "affirmative",
}
NEGATIVE_WORDS = {
    "no", "nope", "nah", "cancel", "stop", "don't", "do not",
    "negative", "abort", "never mind", "nevermind",
}


def is_affirmative(text: str) -> bool:
    normalized = text.strip().lower().rstrip(".!")
    if normalized in AFFIRMATIVE_WORDS:
        return True
    words = set(normalized.replace(",", " ").split())
    return bool(words & AFFIRMATIVE_WORDS) and not (words & NEGATIVE_WORDS)


def is_negative(text: str) -> bool:
    normalized = text.strip().lower().rstrip(".!")
    if normalized in NEGATIVE_WORDS:
        return True
    words = set(normalized.replace(",", " ").split())
    return bool(words & NEGATIVE_WORDS)


class ConfirmationManager:
    """Owns the single in-flight PendingAction, if any.

    Invariant: only orchestrator code (cli.py / main.py's input loop) may call
    confirm() or cancel(). Tool handlers may only call stage() (via propose_action)
    and read has_pending()/get_pending(). Nothing in agent/tool_dispatch.py may
    transition a PendingAction to "confirmed" on its own.
    """

    def __init__(self, timeout_seconds: int = 30):
        self.timeout_seconds = timeout_seconds
        self._pending: PendingAction | None = None

    def stage(self, action_type: str, platform: str, campaign_id: str, params: dict) -> PendingAction:
        if action_type not in VALID_ACTION_TYPES:
            raise ValueError(f"Invalid action_type: {action_type!r}")
        if platform not in VALID_PLATFORMS:
            raise ValueError(f"Invalid platform: {platform!r}")

        # A new proposal supersedes any prior one — it is never silently executed later.
        if self._pending is not None and self._pending.status == STATUS_AWAITING:
            self._pending.status = STATUS_CANCELLED

        action = PendingAction(
            id=str(uuid.uuid4()),
            action_type=action_type,
            platform=platform,
            campaign_id=campaign_id,
            params=params,
            created_at=time.time(),
        )
        self._pending = action
        return action

    def sweep_expired(self) -> None:
        if self._pending is None:
            return
        if self._pending.status != STATUS_AWAITING:
            return
        if time.time() - self._pending.created_at > self.timeout_seconds:
            self._pending.status = STATUS_EXPIRED

    def has_pending(self) -> bool:
        self.sweep_expired()
        return self._pending is not None and self._pending.status == STATUS_AWAITING

    def get_pending(self) -> PendingAction | None:
        self.sweep_expired()
        return self._pending

    def confirm(self, pending_action_id: str) -> PendingAction:
        self.sweep_expired()
        action = self._pending
        if action is None or action.id != pending_action_id:
            raise ValueError("No matching pending action to confirm.")
        if action.status == STATUS_EXPIRED:
            raise ValueError("Pending action has expired; ask again.")
        if action.status != STATUS_AWAITING:
            raise ValueError(f"Pending action is not awaiting confirmation (status={action.status}).")
        action.status = STATUS_CONFIRMED
        return action

    def cancel(self, pending_action_id: str | None = None) -> PendingAction | None:
        action = self._pending
        if action is None:
            return None
        if pending_action_id is not None and action.id != pending_action_id:
            return None
        if action.status == STATUS_AWAITING:
            action.status = STATUS_CANCELLED
        return action

    def mark_executed(self, pending_action_id: str) -> None:
        action = self._pending
        if action is not None and action.id == pending_action_id:
            action.status = STATUS_EXECUTED
