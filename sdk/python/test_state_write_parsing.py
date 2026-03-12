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


if __name__ == "__main__":
    unittest.main()
