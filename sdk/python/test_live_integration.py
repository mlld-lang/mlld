from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path

from mlld import Client, MlldError


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

    def test_state_update_fails_after_completion(self) -> None:
        handle = self.client.process_async(
            'show "done"\n',
            mode="strict",
            timeout=1,
        )

        output = handle.result()
        self.assertIn("done", output)

        with self.assertRaises(MlldError) as cm:
            handle.update_state("exit", True)

        error = cm.exception
        self.assertEqual(getattr(error, "code", None), "REQUEST_NOT_FOUND")


def _state_write_value(state_writes, path: str) -> int:
    for state_write in state_writes:
        if state_write.path == path:
            return int(state_write.value)
    raise AssertionError(f"missing state write for path={path}")


if __name__ == "__main__":
    unittest.main()
