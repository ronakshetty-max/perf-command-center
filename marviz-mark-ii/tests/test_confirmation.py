import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.confirmation import (
    STATUS_AWAITING,
    STATUS_CANCELLED,
    STATUS_CONFIRMED,
    STATUS_EXECUTED,
    STATUS_EXPIRED,
    ConfirmationManager,
    is_affirmative,
    is_negative,
)


def make_mgr(timeout=30):
    return ConfirmationManager(timeout_seconds=timeout)


def test_stage_creates_pending_action():
    mgr = make_mgr()
    action = mgr.stage("pause_campaign", "google", "123", {})
    assert mgr.has_pending()
    assert action.status == STATUS_AWAITING


def test_confirm_with_nothing_pending_raises():
    mgr = make_mgr()
    try:
        mgr.confirm("some-fake-id")
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_confirm_wrong_id_raises():
    mgr = make_mgr()
    mgr.stage("pause_campaign", "google", "123", {})
    try:
        mgr.confirm("wrong-id")
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_fuzzy_affirmative_phrases_recognized():
    for phrase in ["yes", "Yes.", "yeah go ahead", "sure, do it", "absolutely!", "ok"]:
        assert is_affirmative(phrase), f"expected affirmative: {phrase!r}"


def test_fuzzy_negative_phrases_recognized():
    for phrase in ["no", "No.", "nope don't", "cancel that", "never mind"]:
        assert is_negative(phrase), f"expected negative: {phrase!r}"


def test_ambiguous_phrase_is_neither():
    assert not is_affirmative("what's the weather like")
    assert not is_negative("what's the weather like")


def test_expired_action_cannot_be_confirmed():
    mgr = make_mgr(timeout=0)
    action = mgr.stage("pause_campaign", "google", "123", {})
    time.sleep(0.01)
    assert not mgr.has_pending()  # sweep_expired runs inside has_pending
    try:
        mgr.confirm(action.id)
        assert False, "expected ValueError for expired action"
    except ValueError:
        pass


def test_second_proposal_supersedes_first_not_silently_executed():
    mgr = make_mgr()
    first = mgr.stage("pause_campaign", "google", "111", {})
    second = mgr.stage("enable_campaign", "google", "222", {})

    # First should have been cancelled, not left dangling.
    assert first.status == STATUS_CANCELLED
    assert second.status == STATUS_AWAITING

    # Confirming the (now stale) first id must fail — only the current pending action matters.
    try:
        mgr.confirm(first.id)
        assert False, "expected ValueError — first action id is stale"
    except ValueError:
        pass

    # Confirming the second (current) action succeeds.
    confirmed = mgr.confirm(second.id)
    assert confirmed.id == second.id
    assert confirmed.status == STATUS_CONFIRMED


def test_cancel_marks_cancelled_and_clears_has_pending():
    mgr = make_mgr()
    action = mgr.stage("pause_campaign", "google", "123", {})
    mgr.cancel(action.id)
    assert not mgr.has_pending()
    assert action.status == STATUS_CANCELLED


def test_cancel_with_no_pending_returns_none():
    mgr = make_mgr()
    assert mgr.cancel("anything") is None


def test_confirm_twice_second_call_fails():
    mgr = make_mgr()
    action = mgr.stage("pause_campaign", "google", "123", {})
    mgr.confirm(action.id)
    try:
        mgr.confirm(action.id)
        assert False, "expected ValueError — already confirmed, not awaiting"
    except ValueError:
        pass


def test_mark_executed_transitions_from_confirmed():
    mgr = make_mgr()
    action = mgr.stage("pause_campaign", "google", "123", {})
    mgr.confirm(action.id)
    mgr.mark_executed(action.id)
    assert action.status == STATUS_EXECUTED
    assert not mgr.has_pending()


def test_sweep_expired_does_not_touch_confirmed_action():
    mgr = make_mgr(timeout=1)
    action = mgr.stage("pause_campaign", "google", "123", {})
    mgr.confirm(action.id)
    time.sleep(1.05)
    mgr.sweep_expired()
    assert action.status == STATUS_CONFIRMED  # not overwritten to expired


def test_tool_dispatch_cannot_self_confirm():
    """Regression test for the critical invariant: ToolDispatcher.run("confirm_and_execute_action", ...)
    must NEVER transition a PendingAction to confirmed itself. Only orchestrator code
    (confirmation_mgr.confirm() called directly by cli.py/main.py) may do that."""
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from unittest.mock import patch

    from agent.tool_dispatch import ToolDispatcher

    class FakeSettings:
        write_actions_enabled = True
        confirmation_timeout_seconds = 30

    dispatcher = ToolDispatcher(FakeSettings())
    result = dispatcher.run(
        "propose_action",
        {
            "action_type": "pause_campaign",
            "platform": "google",
            "campaign_id": "123",
            "campaign_name": "Test",
        },
    )
    pending_id = result["pending_action_id"]

    # Calling the execute tool WITHOUT the orchestrator having confirmed must be refused,
    # and must NOT flip the action to confirmed as a side effect.
    exec_result = dispatcher.run("confirm_and_execute_action", {"pending_action_id": pending_id})
    assert "error" in exec_result
    pending = dispatcher.confirmation_mgr.get_pending()
    assert pending.status == STATUS_AWAITING  # unchanged — tool call had no side effect
