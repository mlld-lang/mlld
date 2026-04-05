from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import mlld
from mlld import Client


class SigSurfaceUnitTest(unittest.TestCase):
    def test_client_sign_verify_and_sign_content_parse_results(self) -> None:
        client = mlld.Client(timeout=1.0)
        calls: list[tuple[str, dict[str, object], float | None]] = []

        def fake_request(method: str, params: dict[str, object], timeout: float | None):
            calls.append((method, params, timeout))
            if method == "sig:sign":
                return (
                    {
                        "path": "/repo/docs/a.txt",
                        "relativePath": "docs/a.txt",
                        "status": "verified",
                        "verified": True,
                        "signer": "user:alice",
                        "metadata": {"purpose": "sdk"},
                    },
                    [],
                    [],
                )
            if method == "sig:verify":
                return (
                    {
                        "path": "/repo/docs/a.txt",
                        "relativePath": "docs/a.txt",
                        "status": "modified",
                        "verified": False,
                        "signer": "user:alice",
                        "hash": "sha256:next",
                        "expectedHash": "sha256:prev",
                        "error": "Content has been modified since signing",
                    },
                    [],
                    [],
                )
            if method == "sig:sign-content":
                return (
                    {
                        "id": "content-1",
                        "hash": "sha256:abc",
                        "algorithm": "sha256",
                        "signedBy": "user:alice",
                        "signedAt": "2026-03-12T00:00:00.000Z",
                        "contentLength": 11,
                        "metadata": {"channel": "sdk"},
                    },
                    [],
                    [],
                )
            raise AssertionError(f"unexpected method: {method}")

        client._request = fake_request  # type: ignore[method-assign]

        signed = client.sign(
            "docs/a.txt",
            identity="user:alice",
            metadata={"purpose": "sdk"},
            base_path="/repo",
            timeout=5.0,
        )
        verified = client.verify("docs/a.txt", base_path="/repo", timeout=6.0)
        content_signature = client.sign_content(
            "hello world",
            "user:alice",
            metadata={"channel": "sdk"},
            signature_id="content-1",
            base_path="/repo",
            timeout=7.0,
        )

        self.assertEqual(
            calls,
            [
                (
                    "sig:sign",
                    {
                        "path": "docs/a.txt",
                        "identity": "user:alice",
                        "metadata": {"purpose": "sdk"},
                        "basePath": "/repo",
                    },
                    5.0,
                ),
                (
                    "sig:verify",
                    {
                        "path": "docs/a.txt",
                        "basePath": "/repo",
                    },
                    6.0,
                ),
                (
                    "sig:sign-content",
                    {
                        "content": "hello world",
                        "identity": "user:alice",
                        "metadata": {"channel": "sdk"},
                        "id": "content-1",
                        "basePath": "/repo",
                    },
                    7.0,
                ),
            ],
        )

        self.assertEqual(
            signed,
            mlld.FileVerifyResult(
                path="/repo/docs/a.txt",
                relative_path="docs/a.txt",
                status="verified",
                verified=True,
                signer="user:alice",
                metadata={"purpose": "sdk"},
            ),
        )
        self.assertEqual(
            verified,
            mlld.FileVerifyResult(
                path="/repo/docs/a.txt",
                relative_path="docs/a.txt",
                status="modified",
                verified=False,
                signer="user:alice",
                hash="sha256:next",
                expected_hash="sha256:prev",
                error="Content has been modified since signing",
            ),
        )
        self.assertEqual(
            content_signature,
            mlld.ContentSignature(
                id="content-1",
                hash="sha256:abc",
                algorithm="sha256",
                signed_by="user:alice",
                signed_at="2026-03-12T00:00:00.000Z",
                content_length=11,
                metadata={"channel": "sdk"},
            ),
        )


class SigSurfaceIntegrationTest(unittest.TestCase):
    def setUp(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        cli_path = repo_root / "cli" / "cli-entry.ts"
        self.assertTrue(cli_path.exists(), f"missing CLI entry at {cli_path}")

        self.client = Client(
            command="node",
            command_args=["--import", "tsx/esm", str(cli_path)],
            timeout=15,
            working_dir=str(repo_root),
        )

    def tearDown(self) -> None:
        self.client.close()

    def test_sign_verify_sign_content_and_fs_status_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory(prefix="mlld-python-sig-") as tmp_dir:
            root = Path(tmp_dir)
            (root / "package.json").write_text("{}")
            docs_dir = root / "docs"
            docs_dir.mkdir(parents=True, exist_ok=True)
            note_path = docs_dir / "note.txt"
            note_path.write_text("hello from python sdk")

            signed = self.client.sign(
                "docs/note.txt",
                identity="user:alice",
                metadata={"purpose": "sdk"},
                base_path=str(root),
                timeout=10,
            )
            verified = self.client.verify("docs/note.txt", base_path=str(root), timeout=10)
            content_signature = self.client.sign_content(
                "signed body",
                "user:alice",
                metadata={"channel": "sdk"},
                signature_id="content-1",
                base_path=str(root),
                timeout=10,
            )
            statuses = self.client.fs_status("docs/*.txt", base_path=str(root), timeout=10)

            self.assertEqual(signed.status, "verified")
            self.assertTrue(signed.verified)
            self.assertEqual(signed.signer, "user:alice")
            self.assertEqual(signed.metadata, {"purpose": "sdk"})

            self.assertEqual(verified.status, "verified")
            self.assertTrue(verified.verified)
            self.assertEqual(verified.signer, "user:alice")
            self.assertEqual(verified.metadata, {"purpose": "sdk"})

            self.assertEqual(content_signature.id, "content-1")
            self.assertEqual(content_signature.signed_by, "user:alice")
            self.assertEqual(content_signature.metadata, {"channel": "sdk"})
            self.assertTrue((root / ".sig" / "content" / "content-1.sig.json").exists())
            self.assertTrue((root / ".sig" / "content" / "content-1.sig.content").exists())

            self.assertEqual(len(statuses), 1)
            self.assertEqual(statuses[0].relative_path, "docs/note.txt")
            self.assertEqual(statuses[0].status, "verified")
            self.assertEqual(statuses[0].signer, "user:alice")

    def test_execute_handle_write_file_creates_signed_output_with_provenance(self) -> None:
        with tempfile.TemporaryDirectory(prefix="mlld-python-write-") as tmp_dir:
            root = Path(tmp_dir)
            (root / "package.json").write_text("{}")
            routes_dir = root / "routes"
            routes_dir.mkdir(parents=True, exist_ok=True)
            script_path = routes_dir / "route.mld"
            script_path.write_text(
                'loop(99999, 50ms) until @state.exit [\n'
                '  continue\n'
                ']\n'
                'show "done"\n'
            )

            handle = self.client.execute_async(
                str(script_path),
                state={"exit": False},
                timeout=10,
            )

            write_result = handle.write_file("out.txt", "hello from sdk", timeout=5)
            verify_result = self.client.verify("routes/out.txt", base_path=str(root), timeout=10)

            self.assertEqual(write_result.path, str(routes_dir / "out.txt"))
            self.assertEqual(write_result.status, "verified")
            self.assertEqual(write_result.signer, "agent:route")
            self.assertEqual(
                write_result.metadata,
                {
                    "taint": ["untrusted"],
                    "provenance": {
                        "sourceType": "mlld_execution",
                        "sourceId": str(handle.request_id),
                        "scriptPath": str(script_path),
                    },
                },
            )
            self.assertEqual((routes_dir / "out.txt").read_text(), "hello from sdk")

            self.assertEqual(verify_result.status, "verified")
            self.assertEqual(verify_result.signer, "agent:route")
            self.assertEqual(verify_result.metadata, write_result.metadata)

            handle.update_state("exit", True)
            final = handle.result()
            self.assertIn("done", final.output)


if __name__ == "__main__":
    unittest.main()
