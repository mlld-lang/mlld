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

import json
import subprocess
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
class ExecuteResult:
    """Structured output from execute()."""
    output: str
    state_writes: list[StateWrite] = field(default_factory=list)
    exports: dict[str, Any] = field(default_factory=dict)
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
    def __init__(self, message: str, returncode: int | None = None):
        super().__init__(message)
        self.message = message
        self.returncode = returncode


class Client:
    """
    Wrapper around the mlld CLI.

    Args:
        command: The mlld command to invoke. Defaults to "mlld".
        timeout: Default timeout in seconds. None means no timeout.
        working_dir: Working directory for script execution.
    """

    def __init__(
        self,
        command: str = "mlld",
        timeout: float | None = 30.0,
        working_dir: str | None = None,
    ):
        self.command = command
        self.timeout = timeout
        self.working_dir = working_dir

    def process(
        self,
        script: str,
        *,
        file_path: str | None = None,
        format: str = "text",
        timeout: float | None = None,
    ) -> str:
        """
        Execute an mlld script string and return the output.

        Args:
            script: The mlld script to execute.
            file_path: Provides context for relative imports.
            format: Output format ("text" or "json").
            timeout: Override the client default timeout.

        Returns:
            The script output as a string.

        Raises:
            MlldError: If execution fails.
        """
        args = [self.command, "--stdin", "--format", format]

        if file_path:
            args.extend(["--file", file_path])

        result = subprocess.run(
            args,
            input=script,
            capture_output=True,
            text=True,
            timeout=timeout or self.timeout,
            cwd=self.working_dir,
        )

        if result.returncode != 0:
            raise MlldError(result.stderr, result.returncode)

        return result.stdout

    def execute(
        self,
        filepath: str,
        payload: Any = None,
        *,
        state: dict[str, Any] | None = None,
        dynamic_modules: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> ExecuteResult:
        """
        Run an mlld file with a payload and optional state.

        Args:
            filepath: Path to the mlld file.
            payload: Data injected as @payload.
            state: Data injected as @state.
            dynamic_modules: Additional modules to inject.
            timeout: Override the client default timeout.

        Returns:
            ExecuteResult with output, state writes, and metrics.

        Raises:
            MlldError: If execution fails.
        """
        args = [self.command, "run", filepath, "--format", "json"]

        if payload is not None:
            args.extend(["--payload", json.dumps(payload)])

        if state is not None:
            args.extend(["--state", json.dumps(state)])

        if dynamic_modules is not None:
            args.extend(["--dynamic-modules", json.dumps(dynamic_modules)])

        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout or self.timeout,
            cwd=self.working_dir,
        )

        if result.returncode != 0:
            raise MlldError(result.stderr, result.returncode)

        try:
            data = json.loads(result.stdout)
        except json.JSONDecodeError:
            return ExecuteResult(output=result.stdout)

        state_writes = [
            StateWrite(
                path=sw.get("path", ""),
                value=sw.get("value"),
                timestamp=sw.get("timestamp"),
            )
            for sw in data.get("stateWrites", [])
        ]

        metrics = None
        if "metrics" in data:
            m = data["metrics"]
            metrics = Metrics(
                total_ms=m.get("totalMs", 0),
                parse_ms=m.get("parseMs", 0),
                evaluate_ms=m.get("evaluateMs", 0),
            )

        return ExecuteResult(
            output=data.get("output", ""),
            state_writes=state_writes,
            exports=data.get("exports", {}),
            metrics=metrics,
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
        args = [self.command, "analyze", filepath, "--format", "json"]

        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            cwd=self.working_dir,
        )

        if result.returncode != 0:
            raise MlldError(result.stderr, result.returncode)

        data = json.loads(result.stdout)

        errors = [
            AnalysisError(
                message=e.get("message", ""),
                line=e.get("line"),
                column=e.get("column"),
            )
            for e in data.get("errors", [])
        ]

        executables = [
            Executable(
                name=e.get("name", ""),
                params=e.get("params", []),
                labels=e.get("labels", []),
            )
            for e in data.get("executables", [])
        ]

        imports = [
            Import(
                from_=i.get("from", ""),
                names=i.get("names", []),
            )
            for i in data.get("imports", [])
        ]

        guards = [
            Guard(
                name=g.get("name", ""),
                timing=g.get("timing", ""),
                label=g.get("label"),
            )
            for g in data.get("guards", [])
        ]

        needs = None
        if "needs" in data:
            n = data["needs"]
            needs = Needs(
                cmd=n.get("cmd", []),
                node=n.get("node", []),
                py=n.get("py", []),
            )

        return AnalyzeResult(
            filepath=data.get("filepath", filepath),
            valid=data.get("valid", True),
            errors=errors,
            executables=executables,
            exports=data.get("exports", []),
            imports=imports,
            guards=guards,
            needs=needs,
        )


# Convenience functions using default client
_default_client: Client | None = None


def _get_client() -> Client:
    global _default_client
    if _default_client is None:
        _default_client = Client()
    return _default_client


def process(script: str, **kwargs) -> str:
    """Execute an mlld script. See Client.process() for options."""
    return _get_client().process(script, **kwargs)


def execute(filepath: str, payload: Any = None, **kwargs) -> ExecuteResult:
    """Run an mlld file. See Client.execute() for options."""
    return _get_client().execute(filepath, payload, **kwargs)


def analyze(filepath: str) -> AnalyzeResult:
    """Analyze an mlld module. See Client.analyze() for details."""
    return _get_client().analyze(filepath)
