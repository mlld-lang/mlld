from __future__ import annotations

import unittest

import mlld


class FsStatusTest(unittest.TestCase):
    def test_client_fs_status_parses_structured_results(self) -> None:
        client = mlld.Client(timeout=1.0)
        captured: dict[str, object] = {}

        def fake_request(method: str, params: dict[str, object], timeout: float | None):
            captured["method"] = method
            captured["params"] = params
            captured["timeout"] = timeout
            return (
                {
                    "value": [
                        {
                            "path": "/repo/docs/a.txt",
                            "relativePath": "docs/a.txt",
                            "status": "verified",
                            "verified": True,
                            "signer": "user:alice",
                            "labels": ["trusted"],
                            "taint": ["secret"],
                        }
                    ]
                },
                [],
            )

        client._request = fake_request  # type: ignore[method-assign]

        entries = client.fs_status("docs/*.txt", base_path="/repo", timeout=5.0)

        self.assertEqual(captured["method"], "fs:status")
        self.assertEqual(
            captured["params"],
            {"glob": "docs/*.txt", "basePath": "/repo"},
        )
        self.assertEqual(captured["timeout"], 5.0)
        self.assertEqual(
            entries,
            [
                mlld.FilesystemStatus(
                    path="/repo/docs/a.txt",
                    relative_path="docs/a.txt",
                    status="verified",
                    verified=True,
                    signer="user:alice",
                    labels=["trusted"],
                    taint=["secret"],
                )
            ],
        )


if __name__ == "__main__":
    unittest.main()
