from __future__ import annotations

import unittest

import mlld


class StateWriteParsingTest(unittest.TestCase):
    def test_event_parser_decodes_composite_json_strings(self) -> None:
        write = mlld._state_write_from_event(
            {
                "type": "state:write",
                "write": {
                    "path": "payload",
                    "value": '{"enabled": true, "nested": {"count": 2}}',
                    "timestamp": "2026-01-01T00:00:00.000Z",
                },
            }
        )

        self.assertIsNotNone(write)
        assert write is not None
        self.assertEqual(write.value, {"enabled": True, "nested": {"count": 2}})

    def test_execute_result_parsing_avoids_mixed_type_duplicates(self) -> None:
        streamed = mlld.StateWrite(path="payload", value={"enabled": True})
        result = mlld._execute_result_from_payload(
            {
                "output": "ok",
                "stateWrites": [
                    {
                        "path": "payload",
                        "value": '{"enabled": true}',
                    }
                ],
            },
            [streamed],
            [],
        )

        self.assertEqual(len(result.state_writes), 1)
        self.assertEqual(result.state_writes[0].value, {"enabled": True})

    def test_scalar_strings_remain_strings(self) -> None:
        write = mlld._state_write_from_event(
            {
                "type": "state:write",
                "write": {
                    "path": "mode",
                    "value": "true",
                },
            }
        )

        self.assertIsNotNone(write)
        assert write is not None
        self.assertEqual(write.value, "true")

    def test_guard_denial_parser_decodes_stream_event(self) -> None:
        denial = mlld._guard_denial_from_event(
            {
                "type": "guard_denial",
                "guard_denial": {
                    "guard": "blocker",
                    "operation": "send_email",
                    "reason": "recipient not authorized",
                    "rule": None,
                    "labels": ["untrusted"],
                    "args": {"recipients": ["attacker@evil.com"]},
                },
            }
        )

        self.assertIsNotNone(denial)
        assert denial is not None
        self.assertEqual(denial.guard, "blocker")
        self.assertEqual(denial.operation, "send_email")
        self.assertEqual(denial.args, {"recipients": ["attacker@evil.com"]})

    def test_execute_result_merges_guard_denials_without_duplicates(self) -> None:
        streamed = mlld.GuardDenial(
            guard="blocker",
            operation="send_email",
            reason="recipient not authorized",
            labels=["untrusted"],
            args={"recipients": ["attacker@evil.com"]},
        )
        result = mlld._execute_result_from_payload(
            {
                "output": "blocked",
                "denials": [
                    {
                        "guard": "blocker",
                        "operation": "send_email",
                        "reason": "recipient not authorized",
                        "labels": ["untrusted"],
                        "args": {"recipients": ["attacker@evil.com"]},
                    }
                ],
            },
            [],
            [streamed],
        )

        self.assertEqual(len(result.denials), 1)
        self.assertEqual(result.denials[0].operation, "send_email")


if __name__ == "__main__":
    unittest.main()
