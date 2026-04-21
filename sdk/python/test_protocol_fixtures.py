from __future__ import annotations

import json
import unittest
from pathlib import Path

import mlld


FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def _load_fixture(name: str) -> dict[str, object]:
    return json.loads((FIXTURE_DIR / name).read_text())


class ProtocolFixturesTest(unittest.TestCase):
    def test_execute_result_fixture_round_trips_all_fields(self) -> None:
        envelope = _load_fixture("execute-result.json")
        self.assertEqual(set(envelope.keys()), {"id", "result"})

        result = mlld._execute_result_from_payload(envelope["result"], [], [])

        self.assertEqual(result.output, "fixture-output")
        self.assertEqual(result.state_writes[0].path, "payload")
        self.assertEqual(result.state_writes[0].value, {"enabled": True, "nested": {"count": 2}})
        self.assertEqual(result.sessions[0].name, "planner")
        self.assertEqual(result.sessions[0].final_state, {"count": 2, "status": "done"})
        self.assertEqual(
            result.state_writes[0].security,
            {"labels": ["trusted"], "taint": ["untrusted"]},
        )
        self.assertEqual(result.effects[0].security, {"labels": ["trusted"]})
        self.assertEqual(result.denials[0].operation, "send")
        self.assertEqual(result.metrics.total_ms, 5.5)

    def test_analyze_result_fixture_round_trips_guard_trigger(self) -> None:
        envelope = _load_fixture("analyze-result.json")
        client = mlld.Client(timeout=1.0)

        def fake_request(method: str, params: dict[str, object], timeout: float | None):
            self.assertEqual(method, "analyze")
            self.assertEqual(params, {"filepath": "/repo/routes/example.mld"})
            self.assertIsNone(timeout)
            return envelope["result"], [], []

        client._request = fake_request  # type: ignore[method-assign]

        result = client.analyze("/repo/routes/example.mld")

        self.assertEqual(result.guards[0].trigger, "secret")
        self.assertEqual(result.guards[1].trigger, "net:w")
        self.assertEqual(result.guards[1].name, "")

    def test_state_write_event_fixture_round_trips_security(self) -> None:
        envelope = _load_fixture("state-write-event.json")

        event = mlld._state_write_from_event(envelope["event"])

        self.assertIsNotNone(event)
        assert event is not None
        self.assertEqual(event.path, "payload")
        self.assertEqual(event.value, {"enabled": True})
        self.assertEqual(event.security, {"labels": ["trusted"], "taint": ["secret"]})

    def test_session_write_event_fixture_round_trips_fields(self) -> None:
        envelope = _load_fixture("session-write-event.json")

        event = mlld._session_write_from_event(envelope["event"])

        self.assertIsNotNone(event)
        assert event is not None
        self.assertEqual(event.session_name, "planner")
        self.assertEqual(event.slot_path, "count")
        self.assertEqual(event.operation, "increment")
        self.assertEqual(event.prev, 1)
        self.assertEqual(event.next, 2)

    def test_guard_denial_event_fixture_round_trips_fields(self) -> None:
        envelope = _load_fixture("guard-denial-event.json")

        event = mlld._guard_denial_from_event(envelope["event"])

        self.assertIsNotNone(event)
        assert event is not None
        self.assertEqual(event.guard, "@blocker")
        self.assertEqual(event.operation, "send")
        self.assertEqual(event.args, {"value": "hello"})

    def test_trace_event_fixture_round_trips_fields(self) -> None:
        envelope = _load_fixture("trace-event.json")

        event = mlld._trace_event_from_event(envelope["event"])

        self.assertIsNotNone(event)
        assert event is not None
        self.assertEqual(event.event, "guard.deny")
        self.assertEqual(event.category, "guard")
        self.assertEqual(event.scope["parentFrameId"], "frame-parent")
        self.assertEqual(event.data["operation"], "send")

    def test_fs_status_fixture_round_trips_array_payload(self) -> None:
        envelope = _load_fixture("fs-status-result.json")
        client = mlld.Client(timeout=1.0)

        def fake_request(method: str, params: dict[str, object], timeout: float | None):
            self.assertEqual(method, "fs:status")
            self.assertEqual(params, {"glob": "docs/*.txt", "basePath": "/repo"})
            self.assertEqual(timeout, 5.0)
            return envelope["result"], [], []

        client._request = fake_request  # type: ignore[method-assign]

        entries = client.fs_status("docs/*.txt", base_path="/repo", timeout=5.0)

        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0].relative_path, "docs/a.txt")
        self.assertEqual(entries[0].labels, ["trusted"])
        self.assertEqual(entries[0].taint, ["secret"])

    def test_sign_result_fixture_round_trips_object_payload(self) -> None:
        envelope = _load_fixture("sign-result.json")
        client = mlld.Client(timeout=1.0)

        def fake_request(method: str, params: dict[str, object], timeout: float | None):
            self.assertEqual(method, "sig:sign")
            return envelope["result"], [], []

        client._request = fake_request  # type: ignore[method-assign]

        result = client.sign("docs/a.txt")

        self.assertEqual(result.relative_path, "docs/a.txt")
        self.assertEqual(result.metadata, {"purpose": "sdk"})

    def test_sign_content_fixture_round_trips_object_payload(self) -> None:
        envelope = _load_fixture("sign-content-result.json")
        client = mlld.Client(timeout=1.0)

        def fake_request(method: str, params: dict[str, object], timeout: float | None):
            self.assertEqual(method, "sig:sign-content")
            return envelope["result"], [], []

        client._request = fake_request  # type: ignore[method-assign]

        result = client.sign_content("hello world", "user:alice")

        self.assertEqual(result.id, "content-1")
        self.assertEqual(result.signed_by, "user:alice")
        self.assertEqual(result.metadata, {"channel": "sdk"})

    def test_error_fixture_round_trips_transport_error_shape(self) -> None:
        envelope = _load_fixture("error-result.json")
        self.assertEqual(set(envelope.keys()), {"id", "error"})

        error = mlld._error_from_payload(envelope["error"])

        self.assertEqual(error.code, "TIMEOUT")
        self.assertEqual(error.message, "request timeout after 5s")


if __name__ == "__main__":
    unittest.main()
