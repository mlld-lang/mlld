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
class ExecuteResult:
    """Structured output from execute()."""

    output: str
    state_writes: list[StateWrite] = field(default_factory=list)
    exports: Any = field(default_factory=list)  # Can be list or dict depending on mlld output
    effects: list[Effect] = field(default_factory=list)
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
    label: str | None = None


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


class MlldError(Exception):
    """Error from mlld execution."""

    def __init__(self, message: str, returncode: int | None = None, code: str | None = None):
        super().__init__(message)
        self.message = message
        self.returncode = returncode
        self.code = code


PendingQueue = queue.Queue[tuple[str, Any]]


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
        self._raw_result: dict[str, Any] | None = None
        self._state_write_events: list[StateWrite] = []
        self._error: MlldError | None = None

    def cancel(self) -> None:
        """Request graceful cancellation for this in-flight execution."""

        self._client._send_cancel(self.request_id)

    def update_state(
        self,
        path: str,
        value: Any,
        *,
        timeout: float | None = None,
    ) -> None:
        """Send a state:update request for this in-flight execution."""

        self._client._send_state_update(
            self.request_id,
            path,
            value,
            timeout if timeout is not None else self._timeout,
        )

    def _await_raw(self) -> tuple[dict[str, Any], list[StateWrite]]:
        with self._lock:
            if not self._is_complete:
                try:
                    self._raw_result, self._state_write_events = self._client._await_request(
                        self.request_id,
                        self._response_queue,
                        self._timeout,
                    )
                except MlldError as error:
                    self._error = error
                self._is_complete = True

            if self._error is not None:
                raise self._error

            if self._raw_result is None:
                raise MlldError("missing live result payload", code="TRANSPORT_ERROR")

            return self._raw_result, list(self._state_write_events)


class ProcessHandle(_BaseHandle):
    """In-flight process request handle."""

    def wait(self) -> str:
        """Wait for completion and return output."""

        return self.result()

    def result(self) -> str:
        """Wait for completion and return output."""

        result, _ = self._await_raw()
        output = result.get("output")
        if output is None:
            output = result.get("value", "")
        return output if isinstance(output, str) else str(output)


class ExecuteHandle(_BaseHandle):
    """In-flight execute request handle."""

    def wait(self) -> ExecuteResult:
        """Wait for completion and return structured output."""

        return self.result()

    def result(self) -> ExecuteResult:
        """Wait for completion and return structured output."""

        result, state_write_events = self._await_raw()
        return _execute_result_from_payload(result, state_write_events)


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
        state: dict[str, Any] | None = None,
        dynamic_modules: dict[str, Any] | None = None,
        dynamic_module_source: str | None = None,
        mode: str | None = None,
        allow_absolute_paths: bool | None = None,
        timeout: float | None = None,
    ) -> str:
        """
        Execute an mlld script string and return the output.

        Args:
            script: The mlld script to execute.
            file_path: Provides context for relative imports.
            payload: Data injected as @payload.
            state: Data injected as @state.
            dynamic_modules: Additional modules to inject.
            dynamic_module_source: Source label for dynamic modules.
            mode: Parsing mode (strict|markdown).
            allow_absolute_paths: Allow absolute path access when True.
            timeout: Override the client default timeout.

        Returns:
            The script output as a string.

        Raises:
            MlldError: If execution fails.
        """

        return self.process_async(
            script,
            file_path=file_path,
            payload=payload,
            state=state,
            dynamic_modules=dynamic_modules,
            dynamic_module_source=dynamic_module_source,
            mode=mode,
            allow_absolute_paths=allow_absolute_paths,
            timeout=timeout,
        ).result()

    def process_async(
        self,
        script: str,
        *,
        file_path: str | None = None,
        payload: Any = None,
        state: dict[str, Any] | None = None,
        dynamic_modules: dict[str, Any] | None = None,
        dynamic_module_source: str | None = None,
        mode: str | None = None,
        allow_absolute_paths: bool | None = None,
        timeout: float | None = None,
    ) -> ProcessHandle:
        """
        Start an mlld script execution and return an in-flight request handle.
        """

        params: dict[str, Any] = {"script": script}
        if file_path is not None:
            params["filePath"] = file_path
        if payload is not None:
            params["payload"] = payload
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
        state: dict[str, Any] | None = None,
        dynamic_modules: dict[str, Any] | None = None,
        dynamic_module_source: str | None = None,
        allow_absolute_paths: bool | None = None,
        mode: str | None = None,
        timeout: float | None = None,
    ) -> ExecuteResult:
        """
        Run an mlld file with a payload and optional state.

        Args:
            filepath: Path to the mlld file.
            payload: Data injected as @payload.
            state: Data injected as @state.
            dynamic_modules: Additional modules to inject.
            dynamic_module_source: Source label for dynamic modules.
            allow_absolute_paths: Allow absolute path access when True.
            mode: Parsing mode (strict|markdown).
            timeout: Override the client default timeout.

        Returns:
            ExecuteResult with output, state writes, and metrics.

        Raises:
            MlldError: If execution fails.
        """

        return self.execute_async(
            filepath,
            payload,
            state=state,
            dynamic_modules=dynamic_modules,
            dynamic_module_source=dynamic_module_source,
            allow_absolute_paths=allow_absolute_paths,
            mode=mode,
            timeout=timeout,
        ).result()

    def execute_async(
        self,
        filepath: str,
        payload: Any = None,
        *,
        state: dict[str, Any] | None = None,
        dynamic_modules: dict[str, Any] | None = None,
        dynamic_module_source: str | None = None,
        allow_absolute_paths: bool | None = None,
        mode: str | None = None,
        timeout: float | None = None,
    ) -> ExecuteHandle:
        """
        Start an mlld file execution and return an in-flight request handle.
        """

        params: dict[str, Any] = {"filepath": filepath}
        if payload is not None:
            params["payload"] = payload
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

        result, _ = self._request("analyze", {"filepath": filepath}, None)

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
                name=g.get("name", ""),
                timing=g.get("timing", ""),
                label=g.get("label"),
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

    def _request(
        self,
        method: str,
        params: dict[str, Any],
        timeout: float | None,
    ) -> tuple[dict[str, Any], list[StateWrite]]:
        request_id, response_queue = self._send_request(method, params)
        return self._await_request(request_id, response_queue, timeout)

    def _await_request(
        self,
        request_id: int,
        response_queue: PendingQueue,
        timeout: float | None,
    ) -> tuple[dict[str, Any], list[StateWrite]]:
        state_write_events: list[StateWrite] = []

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
                continue

            if kind == "transport_error":
                raise payload

            if kind != "result" or not isinstance(payload, dict):
                continue

            error_payload = payload.get("error")
            if isinstance(error_payload, dict):
                raise _error_from_payload(error_payload)

            payload.pop("id", None)
            return payload, state_write_events

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
    ) -> None:
        if not isinstance(path, str) or not path.strip():
            raise MlldError("state update path is required", code="INVALID_REQUEST")

        max_wait = timeout if timeout is not None else 2.0
        deadline = time.monotonic() + max_wait

        while True:
            try:
                self._request(
                    "state:update",
                    {"requestId": request_id, "path": path, "value": value},
                    timeout,
                )
                return
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

        try:
            while True:
                line = process.stdout.readline()
                if line == "":
                    break

                line = line.strip()
                if not line:
                    continue

                try:
                    envelope = json.loads(line)
                except json.JSONDecodeError as error:
                    self._fail_all_pending(
                        MlldError(f"invalid live response: {error}", code="TRANSPORT_ERROR")
                    )
                    continue

                event = envelope.get("event")
                if isinstance(event, dict):
                    req_id = event.get("id")
                    if isinstance(req_id, int):
                        with self._lock:
                            pending = self._pending.get(req_id)
                        if pending is not None:
                            pending.put(("event", event))

                result = envelope.get("result")
                if isinstance(result, dict):
                    req_id = result.get("id")
                    if isinstance(req_id, int):
                        with self._lock:
                            pending = self._pending.pop(req_id, None)
                        if pending is not None:
                            pending.put(("result", result))
        finally:
            stderr_output = "".join(self._stderr_lines).strip()
            message = stderr_output or "live transport closed"
            self._fail_all_pending(MlldError(message, returncode=process.returncode, code="TRANSPORT_ERROR"))

    def _stderr_loop(self) -> None:
        process = self._process
        if process is None or process.stderr is None:
            return

        for line in process.stderr:
            self._stderr_lines.append(line)

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


def _state_write_from_event(event: dict[str, Any]) -> StateWrite | None:
    if event.get("type") != "state:write":
        return None

    write = event.get("write")
    if not isinstance(write, dict):
        return None

    path = write.get("path")
    if not isinstance(path, str) or not path:
        return None

    return StateWrite(
        path=path,
        value=write.get("value"),
        timestamp=write.get("timestamp") if isinstance(write.get("timestamp"), str) else None,
    )


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


def _execute_result_from_payload(
    result: dict[str, Any],
    state_write_events: list[StateWrite],
) -> ExecuteResult:
    state_writes = [
        StateWrite(
            path=sw.get("path", ""),
            value=sw.get("value"),
            timestamp=sw.get("timestamp"),
        )
        for sw in result.get("stateWrites", [])
        if isinstance(sw, dict)
    ]

    state_writes = _merge_state_writes(state_writes, state_write_events)

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
        metrics=metrics,
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
