"""
mlld - Python wrapper for the mlld CLI.

Example:
    >>> from mlld import Client
    >>> client = Client()
    >>> output = client.process('/var @name = "World"\\nHello, @name!')
    >>> print(output)
    Hello, World!
"""

from __future__ import annotations

import atexit
import json
import queue
import subprocess
import threading
import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class StateWrite:
    """Represents a write to the state:// protocol."""

    path: str
    value: Any
    timestamp: str | None = None
    security: dict[str, Any] | None = None


@dataclass
class Metrics:
    """Execution statistics."""

    total_ms: float = 0
    parse_ms: float = 0
    evaluate_ms: float = 0


@dataclass
class Effect:
    """An output effect from execution."""

    type: str
    content: str | None = None
    security: dict[str, Any] | None = None


@dataclass
class GuardDenial:
    """Structured information about a denied guard/policy decision."""

    guard: str | None
    operation: str
    reason: str
    rule: str | None = None
    labels: list[str] = field(default_factory=list)
    args: dict[str, Any] | None = None


@dataclass
class ExecuteResult:
    """Structured output from execute()."""

    output: str
    state_writes: list[StateWrite] = field(default_factory=list)
    exports: Any = field(default_factory=list)  # Can be list or dict depending on mlld output
    effects: list[Effect] = field(default_factory=list)
    denials: list[GuardDenial] = field(default_factory=list)
    metrics: Metrics | None = None


@dataclass
class Executable:
    """An executable defined in a module."""

    name: str
    params: list[str] = field(default_factory=list)
    labels: list[str] = field(default_factory=list)


@dataclass
class Import:
    """An import statement in a module."""

    from_: str
    names: list[str] = field(default_factory=list)


@dataclass
class Guard:
    """A guard defined in a module."""

    name: str
    timing: str
    trigger: str = ""


@dataclass
class Needs:
    """Capability requirements for a module."""

    cmd: list[str] = field(default_factory=list)
    node: list[str] = field(default_factory=list)
    py: list[str] = field(default_factory=list)


@dataclass
class AnalysisError:
    """A parse or analysis error."""

    message: str
    line: int | None = None
    column: int | None = None


@dataclass
class AnalyzeResult:
    """Static analysis of an mlld module."""

    filepath: str
    valid: bool
    errors: list[AnalysisError] = field(default_factory=list)
    executables: list[Executable] = field(default_factory=list)
    exports: list[str] = field(default_factory=list)
    imports: list[Import] = field(default_factory=list)
    guards: list[Guard] = field(default_factory=list)
    needs: Needs | None = None


@dataclass
class FilesystemStatus:
    """Filesystem signature/integrity status for a single file."""

    path: str
    relative_path: str
    status: str
    verified: bool
    signer: str | None = None
    labels: list[str] = field(default_factory=list)
    taint: list[str] = field(default_factory=list)
    signed_at: str | None = None
    error: str | None = None


@dataclass
class FileVerifyResult:
    """Verification status for a signed file."""

    path: str
    relative_path: str
    status: str
    verified: bool
    signer: str | None = None
    signed_at: str | None = None
    hash: str | None = None
    expected_hash: str | None = None
    metadata: dict[str, Any] | None = None
    error: str | None = None


@dataclass
class ContentSignature:
    """Signature metadata for stored runtime content."""

    id: str
    hash: str
    algorithm: str
    signed_by: str
    signed_at: str
    content_length: int
    metadata: dict[str, str] | None = None


@dataclass(frozen=True)
class LabeledValue:
    """Wrapper used to attach security labels to individual payload fields."""

    value: Any
    labels: tuple[str, ...]


class MlldError(Exception):
    """Error from mlld execution."""

    def __init__(self, message: str, returncode: int | None = None, code: str | None = None):
        super().__init__(message)
        self.message = message
        self.returncode = returncode
        self.code = code


PendingQueue = queue.Queue[tuple[str, Any]]


@dataclass
class HandleEvent:
    """An event from an in-flight execution."""

    type: str  # "state_write", "guard_denial", or "complete"
    state_write: StateWrite | None = None
    guard_denial: GuardDenial | None = None


class _BaseHandle:
    """In-flight request handle for live transport operations."""

    def __init__(
        self,
        client: Client,
        request_id: int,
        response_queue: PendingQueue,
        timeout: float | None,
    ):
        self.request_id = request_id
        self._client = client
        self._response_queue = response_queue
        self._timeout = timeout
        self._lock = threading.Lock()
        self._is_complete = False
        self._complete_event_emitted = False
        self._raw_result: Any = None
        self._state_write_events: list[StateWrite] = []
        self._guard_denial_events: list[GuardDenial] = []
        self._error: MlldError | None = None

    def cancel(self) -> None:
        """Request graceful cancellation for this in-flight execution."""

        if self._is_complete:
            return
        self._client._send_cancel(self.request_id)

    def update_state(
        self,
        path: str,
        value: Any,
        *,
        labels: list[str] | None = None,
        timeout: float | None = None,
    ) -> None:
        """Send a state:update request for this in-flight execution.

        Args:
            path: Dot-separated state path (e.g., "tool_result").
            value: The value to set.
            labels: Optional security labels to apply (e.g., ["untrusted"]).
                    These propagate through mlld's taint tracking system.
            timeout: Override the handle default timeout.
        """

        self._client._send_state_update(
            self.request_id,
            path,
            value,
            timeout if timeout is not None else self._timeout,
            labels=labels,
        )

    def next_event(self, timeout: float | None = None) -> HandleEvent | None:
        """Block until next event. Returns HandleEvent with type="state_write"
        for state:// writes, type="guard_denial" for structured denials,
        and type="complete" when execution finishes.
        Returns None on timeout."""

        if self._is_complete:
            if self._complete_event_emitted or self._error is not None:
                return None
            self._complete_event_emitted = True
            return HandleEvent(type="complete")

        effective_timeout = timeout if timeout is not None else self._timeout
        deadline = None if effective_timeout is None else time.monotonic() + effective_timeout

        while True:
            remaining = None if deadline is None else max(0.0, deadline - time.monotonic())
            if remaining is not None and remaining <= 0:
                return None

            try:
                kind, payload = self._response_queue.get(timeout=remaining)
            except queue.Empty:
                return None

            if kind == "event":
                write = _state_write_from_event(payload)
                if write is not None:
                    self._state_write_events.append(write)
                    return HandleEvent(type="state_write", state_write=write)
                denial = _guard_denial_from_event(payload)
                if denial is not None:
                    self._guard_denial_events.append(denial)
                    return HandleEvent(type="guard_denial", guard_denial=denial)
                continue

            if kind == "transport_error":
                self._error = payload
                self._is_complete = True
                self._complete_event_emitted = True
                raise payload

            if kind == "result" and isinstance(payload, dict):
                error_payload = payload.get("error")
                if isinstance(error_payload, dict):
                    self._error = _error_from_payload(error_payload)
                    self._is_complete = True
                    self._complete_event_emitted = True
                    raise self._error
                self._raw_result = payload.get("result")
                self._is_complete = True
                self._complete_event_emitted = True
                return HandleEvent(type="complete")

    def _await_raw(self) -> tuple[Any, list[StateWrite], list[GuardDenial]]:
        with self._lock:
            if not self._is_complete:
                try:
                    self._raw_result, self._state_write_events, self._guard_denial_events = self._client._await_request(
                        self.request_id,
                        self._response_queue,
                        self._timeout,
                    )
                except MlldError as error:
                    self._error = error
                self._is_complete = True
                self._complete_event_emitted = True

            if self._error is not None:
                raise self._error

            if self._raw_result is None:
                raise MlldError("missing live result payload", code="TRANSPORT_ERROR")

            return (
                self._raw_result,
                list(self._state_write_events),
                list(self._guard_denial_events),
            )


class ProcessHandle(_BaseHandle):
    """In-flight process request handle."""

    def wait(self) -> str:
        """Wait for completion and return output."""

        return self.result()

    def result(self) -> str:
        """Wait for completion and return output."""

        result, _, _ = self._await_raw()
        output = result
        if isinstance(result, dict):
            output = result.get("output", result)
        return output if isinstance(output, str) else str(output)


class ExecuteHandle(_BaseHandle):
    """In-flight execute request handle."""

    def wait(self) -> ExecuteResult:
        """Wait for completion and return structured output."""

        return self.result()

    def result(self) -> ExecuteResult:
        """Wait for completion and return structured output."""

        result, state_write_events, guard_denial_events = self._await_raw()
        return _execute_result_from_payload(
            _require_mapping_payload(result, "invalid execute payload"),
            state_write_events,
            guard_denial_events,
        )

    def write_file(
        self,
        path: str,
        content: str,
        *,
        timeout: float | None = None,
    ) -> FileVerifyResult:
        """Write a file within the active execution context and return its signature status."""

        return self._client._send_file_write(
            self.request_id,
            path,
            content,
            timeout if timeout is not None else self._timeout,
        )


class Client:
    """
    Wrapper around the mlld CLI.

    Args:
        command: The mlld command to invoke. Defaults to "mlld".
        command_args: Extra command args before `live --stdio`.
            Example: command="node", command_args=["./dist/cli.cjs"]
        timeout: Default timeout in seconds. None means no timeout.
        working_dir: Working directory for script execution.
    """

    def __init__(
        self,
        command: str = "mlld",
        command_args: list[str] | None = None,
        timeout: float | None = 30.0,
        working_dir: str | None = None,
    ):
        self.command = command
        self.command_args = list(command_args or [])
        self.timeout = timeout
        self.working_dir = working_dir

        self._lock = threading.RLock()
        self._write_lock = threading.Lock()
        self._process: subprocess.Popen[str] | None = None
        self._reader_thread: threading.Thread | None = None
        self._stderr_thread: threading.Thread | None = None
        self._pending: dict[int, PendingQueue] = {}
        self._request_id = 0
        self._stderr_lines: list[str] = []

    def close(self) -> None:
        """Stop the persistent live transport process."""

        with self._lock:
            process = self._process
            reader_thread = self._reader_thread
            stderr_thread = self._stderr_thread
            self._process = None
            self._reader_thread = None
            self._stderr_thread = None
            self._pending.clear()

        if process is None:
            return

        try:
            if process.stdin:
                process.stdin.close()
        except Exception:
            pass

        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=1)

        try:
            if process.stdout:
                process.stdout.close()
        except Exception:
            pass

        try:
            if process.stderr:
                process.stderr.close()
        except Exception:
            pass

        if reader_thread is not None:
            reader_thread.join(timeout=1)
        if stderr_thread is not None:
            stderr_thread.join(timeout=1)

    def process(
        self,
        script: str,
        *,
        file_path: str | None = None,
        payload: Any = None,
        payload_labels: dict[str, list[str]] | None = None,
        state: dict[str, Any] | None = None,
        dynamic_modules: dict[str, Any] | None = None,
        dynamic_module_source: str | None = None,
        mode: str | None = None,
        allow_absolute_paths: bool | None = None,
        timeout: float | None = None,
        mcp_servers: dict[str, str] | None = None,
    ) -> str:
        """
        Execute an mlld script string and return the output.

        Args:
            script: The mlld script to execute.
            file_path: Provides context for relative imports.
            payload: Data injected as @payload.
            payload_labels: Optional per-field security labels for @payload object fields.
            state: Data injected as @state.
            dynamic_modules: Additional modules to inject.
            dynamic_module_source: Source label for dynamic modules.
            mode: Parsing mode (strict|markdown).
            allow_absolute_paths: Allow absolute path access when True.
            timeout: Override the client default timeout.
            mcp_servers: Map of logical name to MCP server command.

        Returns:
            The script output as a string.

        Raises:
            MlldError: If execution fails.
        """

        return self.process_async(
            script,
            file_path=file_path,
            payload=payload,
            payload_labels=payload_labels,
            state=state,
            dynamic_modules=dynamic_modules,
            dynamic_module_source=dynamic_module_source,
            mode=mode,
            allow_absolute_paths=allow_absolute_paths,
            timeout=timeout,
            mcp_servers=mcp_servers,
        ).result()

    def process_async(
        self,
        script: str,
        *,
        file_path: str | None = None,
        payload: Any = None,
        payload_labels: dict[str, list[str]] | None = None,
        state: dict[str, Any] | None = None,
        dynamic_modules: dict[str, Any] | None = None,
        dynamic_module_source: str | None = None,
        mode: str | None = None,
        allow_absolute_paths: bool | None = None,
        timeout: float | None = None,
        mcp_servers: dict[str, str] | None = None,
    ) -> ProcessHandle:
        """
        Start an mlld script execution and return an in-flight request handle.
        """

        payload, payload_labels = _normalize_payload_and_labels(payload, payload_labels)
        params: dict[str, Any] = {"script": script}
        if file_path is not None:
            params["filePath"] = file_path
        if payload is not None:
            params["payload"] = payload
        if payload_labels is not None:
            params["payloadLabels"] = payload_labels
        if state is not None:
            params["state"] = state
        if dynamic_modules is not None:
            params["dynamicModules"] = dynamic_modules
        if dynamic_module_source is not None:
            params["dynamicModuleSource"] = dynamic_module_source
        if mode is not None:
            params["mode"] = mode
        if allow_absolute_paths is not None:
            params["allowAbsolutePaths"] = allow_absolute_paths
        if mcp_servers is not None:
            params["mcpServers"] = mcp_servers

        request_id, response_queue = self._send_request("process", params)
        return ProcessHandle(
            self,
            request_id,
            response_queue,
            timeout if timeout is not None else self.timeout,
        )

    def execute(
        self,
        filepath: str,
        payload: Any = None,
        *,
        payload_labels: dict[str, list[str]] | None = None,
        state: dict[str, Any] | None = None,
        dynamic_modules: dict[str, Any] | None = None,
        dynamic_module_source: str | None = None,
        allow_absolute_paths: bool | None = None,
        mode: str | None = None,
        timeout: float | None = None,
        mcp_servers: dict[str, str] | None = None,
    ) -> ExecuteResult:
        """
        Run an mlld file with a payload and optional state.

        Args:
            filepath: Path to the mlld file.
            payload: Data injected as @payload.
            payload_labels: Optional per-field security labels for @payload object fields.
            state: Data injected as @state.
            dynamic_modules: Additional modules to inject.
            dynamic_module_source: Source label for dynamic modules.
            allow_absolute_paths: Allow absolute path access when True.
            mode: Parsing mode (strict|markdown).
            timeout: Override the client default timeout.
            mcp_servers: Map of logical name to MCP server command. Allows
                ``import tools from mcp "name"`` to resolve to the mapped command.

        Returns:
            ExecuteResult with output, state writes, and metrics.

        Raises:
            MlldError: If execution fails.
        """

        return self.execute_async(
            filepath,
            payload,
            payload_labels=payload_labels,
            state=state,
            dynamic_modules=dynamic_modules,
            dynamic_module_source=dynamic_module_source,
            allow_absolute_paths=allow_absolute_paths,
            mode=mode,
            timeout=timeout,
            mcp_servers=mcp_servers,
        ).result()

    def execute_async(
        self,
        filepath: str,
        payload: Any = None,
        *,
        payload_labels: dict[str, list[str]] | None = None,
        state: dict[str, Any] | None = None,
        dynamic_modules: dict[str, Any] | None = None,
        dynamic_module_source: str | None = None,
        allow_absolute_paths: bool | None = None,
        mode: str | None = None,
        timeout: float | None = None,
        mcp_servers: dict[str, str] | None = None,
    ) -> ExecuteHandle:
        """
        Start an mlld file execution and return an in-flight request handle.
        """

        payload, payload_labels = _normalize_payload_and_labels(payload, payload_labels)
        params: dict[str, Any] = {"filepath": filepath}
        if payload is not None:
            params["payload"] = payload
        if payload_labels is not None:
            params["payloadLabels"] = payload_labels
        if state is not None:
            params["state"] = state
        if dynamic_modules is not None:
            params["dynamicModules"] = dynamic_modules
        if dynamic_module_source is not None:
            params["dynamicModuleSource"] = dynamic_module_source
        if allow_absolute_paths is not None:
            params["allowAbsolutePaths"] = allow_absolute_paths
        if mode is not None:
            params["mode"] = mode
        if mcp_servers is not None:
            params["mcpServers"] = mcp_servers

        request_id, response_queue = self._send_request("execute", params)
        return ExecuteHandle(
            self,
            request_id,
            response_queue,
            timeout if timeout is not None else self.timeout,
        )

    def analyze(self, filepath: str) -> AnalyzeResult:
        """
        Perform static analysis on an mlld module without executing it.

        Args:
            filepath: Path to the mlld file.

        Returns:
            AnalyzeResult with module information.

        Raises:
            MlldError: If analysis fails.
        """

        result, _, _ = self._request("analyze", {"filepath": filepath}, None)
        result = _require_mapping_payload(result, "invalid analyze payload")

        errors = [
            AnalysisError(
                message=e.get("message", ""),
                line=e.get("line"),
                column=e.get("column"),
            )
            for e in result.get("errors", [])
            if isinstance(e, dict)
        ]

        executables = [
            Executable(
                name=e.get("name", ""),
                params=e.get("params", []),
                labels=e.get("labels", []),
            )
            for e in result.get("executables", [])
            if isinstance(e, dict)
        ]

        imports = [
            Import(
                from_=i.get("from", ""),
                names=i.get("names", []),
            )
            for i in result.get("imports", [])
            if isinstance(i, dict)
        ]

        guards = [
            Guard(
                name=g.get("name") if isinstance(g.get("name"), str) else "",
                timing=g.get("timing") if isinstance(g.get("timing"), str) else "",
                trigger=(
                    g.get("trigger")
                    if isinstance(g.get("trigger"), str)
                    else g.get("label")
                    if isinstance(g.get("label"), str)
                    else ""
                ),
            )
            for g in result.get("guards", [])
            if isinstance(g, dict)
        ]

        needs = None
        if isinstance(result.get("needs"), dict):
            n = result["needs"]
            needs = Needs(
                cmd=n.get("cmd", []),
                node=n.get("node", []),
                py=n.get("py", []),
            )

        return AnalyzeResult(
            filepath=result.get("filepath", filepath),
            valid=result.get("valid", True),
            errors=errors,
            executables=executables,
            exports=result.get("exports", []),
            imports=imports,
            guards=guards,
            needs=needs,
        )

    def fs_status(
        self,
        glob: str | None = None,
        *,
        base_path: str | None = None,
        timeout: float | None = None,
    ) -> list[FilesystemStatus]:
        """
        Return filesystem signature/integrity status for tracked files.

        Args:
            glob: Optional filter pattern.
            base_path: Optional project-relative resolution base.
            timeout: Override the client default timeout.
        """

        params: dict[str, Any] = {}
        if glob is not None:
            params["glob"] = glob
        if base_path is not None:
            params["basePath"] = base_path

        result, _, _ = self._request("fs:status", params, timeout if timeout is not None else self.timeout)
        raw_items = result
        if not isinstance(raw_items, list):
            raise MlldError("invalid fs:status payload", code="TRANSPORT_ERROR")
        return [
            _filesystem_status_from_payload(item)
            for item in raw_items
            if isinstance(item, dict)
        ]

    def sign(
        self,
        path: str,
        *,
        identity: str | None = None,
        metadata: dict[str, Any] | None = None,
        base_path: str | None = None,
        timeout: float | None = None,
    ) -> FileVerifyResult:
        """
        Sign a file and return its current verification status.

        Args:
            path: File path to sign.
            identity: Optional signer identity. Defaults to the live server's user identity resolution.
            metadata: Optional signature metadata to persist alongside the file signature.
            base_path: Optional project-relative resolution base.
            timeout: Override the client default timeout.
        """

        params: dict[str, Any] = {"path": path}
        if identity is not None:
            params["identity"] = identity
        if metadata is not None:
            params["metadata"] = metadata
        if base_path is not None:
            params["basePath"] = base_path

        result, _, _ = self._request("sig:sign", params, timeout if timeout is not None else self.timeout)
        return _file_verify_result_from_payload(_require_mapping_payload(result, "invalid sig:sign payload"))

    def verify(
        self,
        path: str,
        *,
        base_path: str | None = None,
        timeout: float | None = None,
    ) -> FileVerifyResult:
        """
        Verify a file and return its signature status.

        Args:
            path: File path to verify.
            base_path: Optional project-relative resolution base.
            timeout: Override the client default timeout.
        """

        params: dict[str, Any] = {"path": path}
        if base_path is not None:
            params["basePath"] = base_path

        result, _, _ = self._request("sig:verify", params, timeout if timeout is not None else self.timeout)
        return _file_verify_result_from_payload(_require_mapping_payload(result, "invalid sig:verify payload"))

    def sign_content(
        self,
        content: str,
        identity: str,
        *,
        metadata: dict[str, str] | None = None,
        signature_id: str | None = None,
        base_path: str | None = None,
        timeout: float | None = None,
    ) -> ContentSignature:
        """
        Sign runtime content and persist it in the project's sig content store.

        Args:
            content: Content to sign and persist.
            identity: Signer identity to attach to the content signature.
            metadata: Optional string metadata stored with the content signature.
            signature_id: Optional stable content signature id.
            base_path: Optional project-relative resolution base.
            timeout: Override the client default timeout.
        """

        params: dict[str, Any] = {
            "content": content,
            "identity": identity,
        }
        if metadata is not None:
            params["metadata"] = metadata
        if signature_id is not None:
            params["id"] = signature_id
        if base_path is not None:
            params["basePath"] = base_path

        result, _, _ = self._request(
            "sig:sign-content",
            params,
            timeout if timeout is not None else self.timeout,
        )
        return _content_signature_from_payload(
            _require_mapping_payload(result, "invalid sig:sign-content payload")
        )

    def _request(
        self,
        method: str,
        params: dict[str, Any],
        timeout: float | None,
    ) -> tuple[Any, list[StateWrite], list[GuardDenial]]:
        request_id, response_queue = self._send_request(method, params)
        return self._await_request(request_id, response_queue, timeout)

    def _await_request(
        self,
        request_id: int,
        response_queue: PendingQueue,
        timeout: float | None,
    ) -> tuple[Any, list[StateWrite], list[GuardDenial]]:
        state_write_events: list[StateWrite] = []
        guard_denial_events: list[GuardDenial] = []

        deadline = None if timeout is None else time.monotonic() + timeout

        while True:
            remaining = None if deadline is None else max(0.0, deadline - time.monotonic())
            if remaining is not None and remaining <= 0:
                self._remove_pending(request_id)
                self._send_cancel(request_id)
                raise MlldError(f"request timeout after {timeout}s", code="TIMEOUT")

            try:
                kind, payload = response_queue.get(timeout=remaining)
            except queue.Empty as error:
                self._remove_pending(request_id)
                self._send_cancel(request_id)
                raise MlldError(f"request timeout after {timeout}s", code="TIMEOUT") from error

            if kind == "event":
                write = _state_write_from_event(payload)
                if write is not None:
                    state_write_events.append(write)
                denial = _guard_denial_from_event(payload)
                if denial is not None:
                    guard_denial_events.append(denial)
                continue

            if kind == "transport_error":
                raise payload

            if kind != "result" or not isinstance(payload, dict):
                continue

            error_payload = payload.get("error")
            if isinstance(error_payload, dict):
                raise _error_from_payload(error_payload)

            if "result" not in payload:
                raise MlldError("missing live result payload", code="TRANSPORT_ERROR")

            return payload.get("result"), state_write_events, guard_denial_events

    def _send_request(self, method: str, params: dict[str, Any]) -> tuple[int, PendingQueue]:
        with self._lock:
            self._ensure_transport()
            request_id = self._request_id
            self._request_id += 1

            response_queue: PendingQueue = queue.Queue()
            self._pending[request_id] = response_queue

            process = self._process
            if process is None or process.stdin is None:
                self._pending.pop(request_id, None)
                raise MlldError("live transport stdin is unavailable", code="TRANSPORT_ERROR")

            payload = json.dumps(
                {"method": method, "id": request_id, "params": params},
                separators=(",", ":"),
            )

        try:
            with self._write_lock:
                assert process.stdin is not None
                process.stdin.write(payload + "\n")
                process.stdin.flush()
        except Exception as error:
            self._remove_pending(request_id)
            raise MlldError(f"failed to send request: {error}", code="TRANSPORT_ERROR") from error

        return request_id, response_queue

    def _send_cancel(self, request_id: int) -> None:
        with self._lock:
            process = self._process
            if process is None or process.stdin is None:
                return

        try:
            payload = json.dumps({"method": "cancel", "id": request_id}, separators=(",", ":"))
            with self._write_lock:
                assert process.stdin is not None
                process.stdin.write(payload + "\n")
                process.stdin.flush()
        except Exception:
            pass

    def _send_state_update(
        self,
        request_id: int,
        path: str,
        value: Any,
        timeout: float | None,
        *,
        labels: list[str] | None = None,
    ) -> None:
        if not isinstance(path, str) or not path.strip():
            raise MlldError("state update path is required", code="INVALID_REQUEST")

        max_wait = timeout if timeout is not None else 2.0
        deadline = time.monotonic() + max_wait

        params: dict[str, Any] = {"requestId": request_id, "path": path, "value": value}
        if labels is not None:
            params["labels"] = labels

        while True:
            try:
                self._request("state:update", params, timeout)
                return
            except MlldError as error:
                if error.code != "REQUEST_NOT_FOUND":
                    raise
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.025)

    def _send_file_write(
        self,
        request_id: int,
        path: str,
        content: str,
        timeout: float | None,
    ) -> FileVerifyResult:
        if not isinstance(path, str) or not path.strip():
            raise MlldError("file write path is required", code="INVALID_REQUEST")
        if not isinstance(content, str):
            raise MlldError("file write content must be a string", code="INVALID_REQUEST")

        max_wait = timeout if timeout is not None else 2.0
        deadline = time.monotonic() + max_wait
        params = {"requestId": request_id, "path": path, "content": content}

        while True:
            try:
                result, _, _ = self._request("file:write", params, timeout)
                return _file_verify_result_from_payload(
                    _require_mapping_payload(result, "invalid file:write payload")
                )
            except MlldError as error:
                if error.code != "REQUEST_NOT_FOUND":
                    raise
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.025)

    def _remove_pending(self, request_id: int) -> None:
        with self._lock:
            self._pending.pop(request_id, None)

    def _ensure_transport(self) -> None:
        process = self._process
        if (
            process is not None
            and process.poll() is None
            and self._reader_thread is not None
            and self._reader_thread.is_alive()
        ):
            return

        self.close()

        command = [self.command, *self.command_args, "live", "--stdio"]
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            cwd=self.working_dir,
        )

        if process.stdin is None or process.stdout is None or process.stderr is None:
            process.kill()
            raise MlldError("failed to create live transport stdio pipes", code="TRANSPORT_ERROR")

        self._process = process
        self._stderr_lines = []

        self._reader_thread = threading.Thread(target=self._reader_loop, name="mlld-live-reader", daemon=True)
        self._reader_thread.start()

        self._stderr_thread = threading.Thread(target=self._stderr_loop, name="mlld-live-stderr", daemon=True)
        self._stderr_thread.start()

    def _reader_loop(self) -> None:
        process = self._process
        if process is None or process.stdout is None:
            return

        buf = ""
        try:
            while True:
                try:
                    line = process.stdout.readline()
                except ValueError:
                    break
                if line == "":
                    break

                line = line.strip()
                if not line:
                    continue

                # If we are not buffering, start fresh with this line.
                # If we are already buffering (incomplete JSON from prior
                # lines), check whether this line looks like the start of
                # a new top-level message.  If so, the previous buffer was
                # corrupt -- discard it and start over.
                if buf and line.startswith("{"):
                    buf = ""

                buf += line
                try:
                    envelope = json.loads(buf)
                except json.JSONDecodeError:
                    # The JSON may span multiple lines (e.g. when the
                    # output field contains literal newlines that were
                    # not escaped in the transport).  Keep buffering
                    # until we assemble a complete object.
                    continue

                buf = ""

                event = envelope.get("event")
                if isinstance(event, dict):
                    req_id = _request_id_from_transport(event.get("requestId", event.get("id")))
                    if req_id is not None:
                        with self._lock:
                            pending = self._pending.get(req_id)
                        if pending is not None:
                            pending.put(("event", event))

                req_id = _request_id_from_transport(envelope.get("id"))
                if req_id is not None and ("result" in envelope or "error" in envelope):
                    with self._lock:
                        pending = self._pending.pop(req_id, None)
                    if pending is not None:
                        pending.put(("result", envelope))
        finally:
            stderr_output = "".join(self._stderr_lines).strip()
            message = stderr_output or "live transport closed"
            self._fail_all_pending(MlldError(message, returncode=process.returncode, code="TRANSPORT_ERROR"))

    def _stderr_loop(self) -> None:
        process = self._process
        if process is None or process.stderr is None:
            return

        try:
            for line in process.stderr:
                self._stderr_lines.append(line)
        except ValueError:
            pass

    def _fail_all_pending(self, error: MlldError) -> None:
        with self._lock:
            pending_queues = list(self._pending.values())
            self._pending.clear()
            self._process = None

        for response_queue in pending_queues:
            response_queue.put(("transport_error", error))


def _error_from_payload(error_payload: dict[str, Any]) -> MlldError:
    message = str(error_payload.get("message", "mlld request failed"))
    code = error_payload.get("code")
    return MlldError(message=message, code=code if isinstance(code, str) else None)


def _request_id_from_transport(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return None
    return None


def _require_mapping_payload(payload: Any, message: str) -> dict[str, Any]:
    if isinstance(payload, dict):
        return payload
    raise MlldError(message, code="TRANSPORT_ERROR")


def _looks_like_json_composite(value: str) -> bool:
    trimmed = value.strip()
    if len(trimmed) < 2:
        return False
    return (trimmed.startswith("{") and trimmed.endswith("}")) or (
        trimmed.startswith("[") and trimmed.endswith("]")
    )


def _decode_state_write_value(value: Any) -> Any:
    if not isinstance(value, str) or not _looks_like_json_composite(value):
        return value

    try:
        return json.loads(value)
    except (json.JSONDecodeError, ValueError):
        return value


def _state_write_from_payload(write: Any) -> StateWrite | None:
    if not isinstance(write, dict):
        return None

    path = write.get("path")
    if not isinstance(path, str) or not path:
        return None

    return StateWrite(
        path=path,
        value=_decode_state_write_value(write.get("value")),
        timestamp=write.get("timestamp") if isinstance(write.get("timestamp"), str) else None,
        security=write.get("security") if isinstance(write.get("security"), dict) else None,
    )


def _state_write_from_event(event: dict[str, Any]) -> StateWrite | None:
    if event.get("type") != "state:write":
        return None

    return _state_write_from_payload(event.get("write"))


def _guard_denial_from_payload(payload: Any) -> GuardDenial | None:
    if not isinstance(payload, dict):
        return None

    operation = payload.get("operation")
    reason = payload.get("reason")
    if not isinstance(operation, str) or not operation:
        return None
    if not isinstance(reason, str) or not reason:
        return None

    labels = payload.get("labels")
    args = payload.get("args")

    return GuardDenial(
        guard=payload.get("guard") if isinstance(payload.get("guard"), str) else None,
        operation=operation,
        reason=reason,
        rule=payload.get("rule") if isinstance(payload.get("rule"), str) else None,
        labels=[label for label in labels if isinstance(label, str)] if isinstance(labels, list) else [],
        args=args if isinstance(args, dict) else None,
    )


def _guard_denial_from_event(event: dict[str, Any]) -> GuardDenial | None:
    if event.get("type") != "guard_denial":
        return None

    return _guard_denial_from_payload(event.get("guard_denial"))


def _state_write_key(state_write: StateWrite) -> str:
    value_json = json.dumps(state_write.value, sort_keys=True, separators=(",", ":"), default=str)
    return f"{state_write.path}|{value_json}"


def _merge_state_writes(primary: list[StateWrite], secondary: list[StateWrite]) -> list[StateWrite]:
    if not secondary:
        return primary
    if not primary:
        return secondary

    merged: list[StateWrite] = []
    seen: set[str] = set()

    for state_write in [*primary, *secondary]:
        key = _state_write_key(state_write)
        if key in seen:
            continue
        seen.add(key)
        merged.append(state_write)

    return merged


def _guard_denial_key(denial: GuardDenial) -> str:
    return json.dumps(
        {
            "guard": denial.guard,
            "operation": denial.operation,
            "reason": denial.reason,
            "rule": denial.rule,
            "labels": sorted(denial.labels),
            "args": denial.args,
        },
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )


def _merge_guard_denials(primary: list[GuardDenial], secondary: list[GuardDenial]) -> list[GuardDenial]:
    if not secondary:
        return primary
    if not primary:
        return secondary

    merged: list[GuardDenial] = []
    seen: set[str] = set()

    for denial in [*primary, *secondary]:
        key = _guard_denial_key(denial)
        if key in seen:
            continue
        seen.add(key)
        merged.append(denial)

    return merged


def _execute_result_from_payload(
    result: dict[str, Any],
    state_write_events: list[StateWrite],
    guard_denial_events: list[GuardDenial],
) -> ExecuteResult:
    state_writes: list[StateWrite] = []
    for raw_write in result.get("stateWrites", []):
        state_write = _state_write_from_payload(raw_write)
        if state_write is not None:
            state_writes.append(state_write)

    state_writes = _merge_state_writes(state_writes, state_write_events)
    denials = [
        denial
        for denial in (
            _guard_denial_from_payload(raw_denial)
            for raw_denial in result.get("denials", [])
        )
        if denial is not None
    ]
    denials = _merge_guard_denials(denials, guard_denial_events)

    metrics = None
    if isinstance(result.get("metrics"), dict):
        m = result["metrics"]
        metrics = Metrics(
            total_ms=m.get("totalMs", 0),
            parse_ms=m.get("parseMs", 0),
            evaluate_ms=m.get("evaluateMs", 0),
        )

    effects = [
        Effect(
            type=e.get("type", ""),
            content=e.get("content"),
            security=e.get("security"),
        )
        for e in result.get("effects", [])
        if isinstance(e, dict)
    ]

    return ExecuteResult(
        output=result.get("output", ""),
        state_writes=state_writes,
        exports=result.get("exports", []),
        effects=effects,
        denials=denials,
        metrics=metrics,
    )

def _file_verify_result_from_payload(payload: dict[str, Any]) -> FileVerifyResult:
    return FileVerifyResult(
        path=str(payload.get("path", "")),
        relative_path=str(payload.get("relativePath", payload.get("relative_path", ""))),
        status=str(payload.get("status", "")),
        verified=bool(payload.get("verified", False)),
        signer=payload.get("signer") if isinstance(payload.get("signer"), str) else None,
        signed_at=payload.get("signedAt") if isinstance(payload.get("signedAt"), str) else None,
        hash=payload.get("hash") if isinstance(payload.get("hash"), str) else None,
        expected_hash=payload.get("expectedHash")
        if isinstance(payload.get("expectedHash"), str)
        else None,
        metadata=payload.get("metadata") if isinstance(payload.get("metadata"), dict) else None,
        error=payload.get("error") if isinstance(payload.get("error"), str) else None,
    )


def _content_signature_from_payload(payload: dict[str, Any]) -> ContentSignature:
    metadata = payload.get("metadata")
    normalized_metadata = None
    if isinstance(metadata, dict):
        normalized_metadata = {
            str(key): str(value)
            for key, value in metadata.items()
            if isinstance(key, str) and isinstance(value, str)
        }

    return ContentSignature(
        id=str(payload.get("id", "")),
        hash=str(payload.get("hash", "")),
        algorithm=str(payload.get("algorithm", "")),
        signed_by=str(payload.get("signedBy", payload.get("signed_by", ""))),
        signed_at=str(payload.get("signedAt", payload.get("signed_at", ""))),
        content_length=int(payload.get("contentLength", payload.get("content_length", 0)) or 0),
        metadata=normalized_metadata,
    )


def _filesystem_status_from_payload(payload: dict[str, Any]) -> FilesystemStatus:
    labels = payload.get("labels", [])
    taint = payload.get("taint", [])
    return FilesystemStatus(
        path=str(payload.get("path", "")),
        relative_path=str(payload.get("relativePath", payload.get("relative_path", ""))),
        status=str(payload.get("status", "")),
        verified=bool(payload.get("verified", False)),
        signer=payload.get("signer"),
        labels=[str(label) for label in labels] if isinstance(labels, list) else [],
        taint=[str(label) for label in taint] if isinstance(taint, list) else [],
        signed_at=payload.get("signedAt") if isinstance(payload.get("signedAt"), str) else None,
        error=payload.get("error") if isinstance(payload.get("error"), str) else None,
    )


# Convenience functions using default client
_default_client: Client | None = None


def _get_client() -> Client:
    global _default_client
    if _default_client is None:
        _default_client = Client()
    return _default_client


def _close_default_client() -> None:
    global _default_client
    if _default_client is not None:
        _default_client.close()


atexit.register(_close_default_client)


def process(script: str, **kwargs) -> str:
    """Execute an mlld script. See Client.process() for options."""
    return _get_client().process(script, **kwargs)


def process_async(script: str, **kwargs) -> ProcessHandle:
    """Start an mlld script execution. See Client.process_async() for options."""
    return _get_client().process_async(script, **kwargs)


def execute(filepath: str, payload: Any = None, **kwargs) -> ExecuteResult:
    """Run an mlld file. See Client.execute() for options."""
    return _get_client().execute(filepath, payload, **kwargs)


def execute_async(filepath: str, payload: Any = None, **kwargs) -> ExecuteHandle:
    """Start an mlld file execution. See Client.execute_async() for options."""
    return _get_client().execute_async(filepath, payload, **kwargs)


def analyze(filepath: str) -> AnalyzeResult:
    """Analyze an mlld module. See Client.analyze() for details."""
    return _get_client().analyze(filepath)


def fs_status(glob: str | None = None, **kwargs) -> list[FilesystemStatus]:
    """List filesystem signature/integrity status. See Client.fs_status() for details."""
    return _get_client().fs_status(glob, **kwargs)


def sign(path: str, **kwargs) -> FileVerifyResult:
    """Sign a file. See Client.sign() for details."""
    return _get_client().sign(path, **kwargs)


def verify(path: str, **kwargs) -> FileVerifyResult:
    """Verify a file. See Client.verify() for details."""
    return _get_client().verify(path, **kwargs)


def sign_content(content: str, identity: str, **kwargs) -> ContentSignature:
    """Sign runtime content. See Client.sign_content() for details."""
    return _get_client().sign_content(content, identity, **kwargs)


def labeled(value: Any, *labels: str) -> LabeledValue:
    """Attach one or more labels to a payload field value."""
    return LabeledValue(value=value, labels=tuple(_normalize_label_list(labels)))


def trusted(value: Any) -> LabeledValue:
    """Mark a payload field as trusted."""
    return labeled(value, "trusted")


def untrusted(value: Any) -> LabeledValue:
    """Mark a payload field as untrusted."""
    return labeled(value, "untrusted")


def _normalize_label_list(labels: Any) -> list[str]:
    if labels is None:
        return []

    if isinstance(labels, (list, tuple, set)):
        raw_labels = list(labels)
    else:
        raw_labels = [labels]

    seen: set[str] = set()
    normalized: list[str] = []
    for label in raw_labels:
        if not isinstance(label, str):
            raise TypeError("payload labels must be strings")
        trimmed = label.strip()
        if not trimmed or trimmed in seen:
            continue
        seen.add(trimmed)
        normalized.append(trimmed)
    return normalized


def _normalize_payload_and_labels(
    payload: Any,
    payload_labels: dict[str, list[str]] | None,
) -> tuple[Any, dict[str, list[str]] | None]:
    merged_labels: dict[str, list[str]] = {}

    normalized_payload = payload
    if isinstance(payload, dict):
        normalized_payload = {}
        for key, value in payload.items():
            if isinstance(value, LabeledValue):
                normalized_payload[key] = value.value
                labels = _normalize_label_list(value.labels)
                if labels:
                    merged_labels[key] = labels
            else:
                normalized_payload[key] = value
    elif payload_labels is not None:
        raise ValueError("payload_labels requires payload to be a dict")

    if payload_labels is not None:
        if not isinstance(normalized_payload, dict):
            raise ValueError("payload_labels requires payload to be a dict")
        for key, labels in payload_labels.items():
            if key not in normalized_payload:
                raise ValueError(f"payload_labels contains unknown field: {key}")
            normalized = _normalize_label_list(labels)
            if not normalized:
                continue
            merged_labels[key] = _merge_labels(merged_labels.get(key), normalized)

    return normalized_payload, (merged_labels or None)


def _merge_labels(existing: list[str] | None, incoming: list[str]) -> list[str]:
    merged = list(existing or [])
    seen = set(merged)
    for label in incoming:
        if label in seen:
            continue
        seen.add(label)
        merged.append(label)
    return merged
