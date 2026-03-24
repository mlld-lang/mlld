from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path

from mlld import Client, MlldError, trusted, untrusted


class LiveIntegrationTest(unittest.TestCase):
    def setUp(self) -> None:
        cli_path = Path(__file__).resolve().parents[2] / "dist" / "cli.cjs"
        self.assertTrue(cli_path.exists(), f"missing CLI build at {cli_path}")

        self.client = Client(
            command="node",
            command_args=[str(cli_path)],
            timeout=15,
        )

    def tearDown(self) -> None:
        self.client.close()

    def test_execute_roundtrip_with_state_and_dynamic_modules(self) -> None:
        process_output = self.client.process(
            '/import { @mode } from "@config"\n'
            '/var @next = @state.count + 1\n'
            '/show `mode=@mode count=@next`\n',
            state={"count": 1},
            dynamic_modules={"@config": {"mode": "process"}},
            mode="markdown",
            timeout=10,
        )
        self.assertIn("mode=process count=2", process_output)

        script = (
            '/import { @mode } from "@config"\n'
            '/import { @text } from "@payload"\n\n'
            '/var @next = @state.count + 1\n'
            '/output @next to "state://count"\n'
            '/show `text=@text mode=@mode count=@next`\n'
        )

        with tempfile.TemporaryDirectory(prefix="mlld-python-sdk-") as tmp_dir:
            script_path = Path(tmp_dir) / "integration.mld"
            script_path.write_text(script)

            first = self.client.execute(
                str(script_path),
                {"text": "hello"},
                state={"count": 0},
                dynamic_modules={"@config": {"mode": "live"}},
                mode="markdown",
                timeout=10,
            )

            self.assertIn("text=hello mode=live count=1", first.output)
            first_count = _state_write_value(first.state_writes, "count")
            self.assertEqual(first_count, 1)

            second = self.client.execute(
                str(script_path),
                {"text": "again"},
                state={"count": first_count},
                dynamic_modules={"@config": {"mode": "live"}},
                mode="markdown",
                timeout=10,
            )

            self.assertIn("text=again mode=live count=2", second.output)
            second_count = _state_write_value(second.state_writes, "count")
            self.assertEqual(second_count, 2)

    def test_loop_stops_via_state_update(self) -> None:
        script = (
            "loop(99999, 50ms) until @state.exit [\n"
            "  continue\n"
            "]\n"
            'show "loop-stopped"\n'
        )

        handle = self.client.process_async(
            script,
            state={"exit": False},
            timeout=10,
        )

        time.sleep(0.12)
        handle.update_state("exit", True)

        output = handle.result()
        self.assertIn("loop-stopped", output)

    def test_next_event_state_write_roundtrip(self) -> None:
        """Test next_event() yields state:write events and supports update_state() injection."""
        script = (
            'output "ping" to "state://pending"\n'
            'loop(600, 50ms) until @state.result [\n'
            '  continue\n'
            ']\n'
            'show @state.result\n'
        )

        handle = self.client.process_async(
            script,
            state={"pending": None, "result": None},
            timeout=10,
        )

        # First event should be the state:write for "pending"
        event = handle.next_event(timeout=5)
        self.assertIsNotNone(event)
        self.assertEqual(event.type, "state_write")
        self.assertEqual(event.state_write.path, "pending")
        self.assertEqual(event.state_write.value, "ping")

        # Inject the result
        handle.update_state("result", "pong")

        # Next event should be completion
        event = handle.next_event(timeout=5)
        self.assertIsNotNone(event)
        self.assertEqual(event.type, "complete")

        # result() should work after complete
        output = handle.result()
        self.assertIn("pong", output)

    def test_next_event_returns_complete_on_simple_script(self) -> None:
        """Test next_event() returns complete for scripts without state writes."""
        handle = self.client.process_async(
            'show "hello"\n',
            mode="strict",
            timeout=5,
        )

        event = handle.next_event(timeout=5)
        self.assertIsNotNone(event)
        self.assertEqual(event.type, "complete")

        output = handle.result()
        self.assertIn("hello", output)

    def test_next_event_returns_guard_denial_before_completion(self) -> None:
        """Test next_event() yields structured guard denials before script completion."""
        handle = self.client.process_async(
            (
                '/guard @blocker before op:exe = when [\n'
                '  @mx.op.name == "send" => deny "recipient not authorized"\n'
                '  * => allow\n'
                ']\n'
                '/exe @send(value) = when [\n'
                '  denied => "blocked"\n'
                '  * => @value\n'
                ']\n'
                '/show @send("hello")\n'
            ),
            mode="markdown",
            timeout=5,
        )

        event = handle.next_event(timeout=5)
        self.assertIsNotNone(event)
        self.assertEqual(event.type, "guard_denial")
        assert event is not None and event.guard_denial is not None
        self.assertEqual(event.guard_denial.guard, "blocker")
        self.assertEqual(event.guard_denial.operation, "send")
        self.assertEqual(event.guard_denial.args, {"value": "hello"})

        event = handle.next_event(timeout=5)
        self.assertIsNotNone(event)
        self.assertEqual(event.type, "complete")

        output = handle.result()
        self.assertIn("blocked", output)

    def test_execute_preserves_structured_state_write_values(self) -> None:
        script = (
            '/var @payload = {"enabled": true, "nested": {"count": 2}}\n'
            '/var @flag = true\n'
            '/output @payload to "state://payload"\n'
            '/output @flag to "state://flag"\n'
            '/show `count=@state.payload.nested.count flag=@state.flag`\n'
        )

        with tempfile.TemporaryDirectory(prefix="mlld-python-sdk-") as tmp_dir:
            script_path = Path(tmp_dir) / "structured-state.mld"
            script_path.write_text(script)

            result = self.client.execute(
                str(script_path),
                state={"payload": None, "flag": False},
                mode="markdown",
                timeout=10,
            )

            self.assertIn("count=2 flag=true", result.output)
            self.assertEqual(_state_write_value(result.state_writes, "payload"), {"enabled": True, "nested": {"count": 2}})
            self.assertIs(_state_write_value(result.state_writes, "flag"), True)

    def test_execute_applies_per_field_payload_labels(self) -> None:
        script = (
            '/import "@payload" as @p\n'
            '/import { @query, @tool_result } from "@payload"\n'
            '/show @query.mx.labels.includes("trusted")\n'
            '/show @tool_result.mx.labels.includes("untrusted")\n'
            '/show @p.query.mx.labels.includes("trusted")\n'
            '/show @p.tool_result.mx.labels.includes("untrusted")\n'
            '/show @payload.query.mx.labels.includes("trusted")\n'
            '/show @payload.tool_result.mx.labels.includes("untrusted")\n'
        )

        with tempfile.TemporaryDirectory(prefix="mlld-python-sdk-") as tmp_dir:
            script_path = Path(tmp_dir) / "payload-labels.mld"
            script_path.write_text(script)

            result = self.client.execute(
                str(script_path),
                {
                    "query": trusted("user task"),
                    "tool_result": untrusted("tool output"),
                },
                mode="markdown",
                timeout=10,
            )

            self.assertEqual(
                [line.strip() for line in result.output.splitlines() if line.strip()],
                ["true", "true", "true", "true", "true", "true"],
            )

    def test_state_update_fails_after_completion(self) -> None:
        handle = self.client.process_async(
            'show "done"\n',
            mode="strict",
            timeout=2,
        )

        output = handle.result()
        self.assertIn("done", output)

        with self.assertRaises(MlldError) as cm:
            handle.update_state("exit", True)

        error = cm.exception
        self.assertEqual(getattr(error, "code", None), "REQUEST_NOT_FOUND")


def _state_write_value(state_writes, path: str):
    for state_write in state_writes:
        if state_write.path == path:
            return state_write.value
    raise AssertionError(f"missing state write for path={path}")


if __name__ == "__main__":
    unittest.main()
