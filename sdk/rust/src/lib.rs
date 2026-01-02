//! mlld - Rust wrapper for the mlld CLI.
//!
//! # Example
//!
//! ```no_run
//! use mlld::Client;
//!
//! let client = Client::new();
//! let output = client.process(r#"/var @name = "World"
//! Hello, @name!"#, None)?;
//! assert_eq!(output.trim(), "Hello, World!");
//! # Ok::<(), mlld::Error>(())
//! ```

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::process::{Command, Stdio};
use std::time::Duration;

/// Error type for mlld operations.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("mlld error: {message}")]
    Mlld { message: String, code: Option<i32> },

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("timeout after {0:?}")]
    Timeout(Duration),
}

/// Result type alias for mlld operations.
pub type Result<T> = std::result::Result<T, Error>;

/// Wrapper around the mlld CLI.
#[derive(Debug, Clone)]
pub struct Client {
    /// The mlld command to invoke.
    pub command: String,

    /// Default timeout for operations.
    pub timeout: Option<Duration>,

    /// Working directory for script execution.
    pub working_dir: Option<String>,
}

impl Default for Client {
    fn default() -> Self {
        Self::new()
    }
}

impl Client {
    /// Create a new Client with default settings.
    pub fn new() -> Self {
        Self {
            command: "mlld".to_string(),
            timeout: Some(Duration::from_secs(30)),
            working_dir: None,
        }
    }

    /// Create a Client with a custom command.
    pub fn with_command(mut self, command: impl Into<String>) -> Self {
        self.command = command.into();
        self
    }

    /// Set the default timeout.
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    /// Set the working directory.
    pub fn with_working_dir(mut self, dir: impl Into<String>) -> Self {
        self.working_dir = Some(dir.into());
        self
    }

    /// Execute an mlld script string and return the output.
    pub fn process(&self, script: &str, opts: Option<ProcessOptions>) -> Result<String> {
        let _opts = opts.unwrap_or_default();

        // Write script to temp file since mlld doesn't support stdin
        let mut temp_file = tempfile::Builder::new()
            .suffix(".mld")
            .tempfile()?;
        temp_file.write_all(script.as_bytes())?;
        let temp_path = temp_file.path().to_string_lossy().to_string();

        let args = vec![temp_path];

        let mut cmd = Command::new(&self.command);
        cmd.args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(ref dir) = self.working_dir {
            cmd.current_dir(dir);
        }

        let output = cmd.output()?;

        if !output.status.success() {
            return Err(Error::Mlld {
                message: String::from_utf8_lossy(&output.stderr).to_string(),
                code: output.status.code(),
            });
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Run an mlld file with a payload and optional state.
    pub fn execute<P: Serialize>(
        &self,
        filepath: &str,
        payload: Option<P>,
        opts: Option<ExecuteOptions>,
    ) -> Result<ExecuteResult> {
        let opts = opts.unwrap_or_default();

        let mut args = vec![
            filepath.to_string(),
            "--structured".to_string(),
        ];

        if let Some(ref p) = payload {
            let payload_json = serde_json::to_string(p)?;
            args.push("--inject".to_string());
            args.push(format!("@payload={}", payload_json));
        }

        if let Some(ref state) = opts.state {
            let state_json = serde_json::to_string(state)?;
            args.push("--inject".to_string());
            args.push(format!("@state={}", state_json));
        }

        if let Some(ref modules) = opts.dynamic_modules {
            for (key, value) in modules {
                let module_json = serde_json::to_string(value)?;
                args.push("--inject".to_string());
                args.push(format!("{}={}", key, module_json));
            }
        }

        let mut cmd = Command::new(&self.command);
        cmd.args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(ref dir) = self.working_dir {
            cmd.current_dir(dir);
        }

        let output = cmd.output()?;

        if !output.status.success() {
            return Err(Error::Mlld {
                message: String::from_utf8_lossy(&output.stderr).to_string(),
                code: output.status.code(),
            });
        }

        let stdout = String::from_utf8_lossy(&output.stdout);

        match serde_json::from_str(&stdout) {
            Ok(result) => Ok(result),
            Err(_) => Ok(ExecuteResult {
                output: stdout.to_string(),
                ..Default::default()
            }),
        }
    }

    /// Perform static analysis on an mlld module without executing it.
    pub fn analyze(&self, filepath: &str) -> Result<AnalyzeResult> {
        let args = vec![
            "analyze".to_string(),
            filepath.to_string(),
            "--format".to_string(),
            "json".to_string(),
        ];

        let mut cmd = Command::new(&self.command);
        cmd.args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(ref dir) = self.working_dir {
            cmd.current_dir(dir);
        }

        let output = cmd.output()?;

        if !output.status.success() {
            return Err(Error::Mlld {
                message: String::from_utf8_lossy(&output.stderr).to_string(),
                code: output.status.code(),
            });
        }

        let result: AnalyzeResult = serde_json::from_slice(&output.stdout)?;
        Ok(result)
    }
}

/// Options for process().
#[derive(Debug, Default, Clone)]
pub struct ProcessOptions {
    /// Provides context for relative imports (not currently used).
    pub file_path: Option<String>,

    /// Override the client default timeout.
    pub timeout: Option<Duration>,
}

/// Options for execute().
#[derive(Debug, Default, Clone)]
pub struct ExecuteOptions {
    /// Data injected as @state.
    pub state: Option<serde_json::Value>,

    /// Additional modules to inject.
    pub dynamic_modules: Option<HashMap<String, serde_json::Value>>,

    /// Override the client default timeout.
    pub timeout: Option<Duration>,
}

/// Structured output from execute().
#[derive(Debug, Default, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResult {
    pub output: String,

    #[serde(default)]
    pub state_writes: Vec<StateWrite>,

    #[serde(default)]
    pub exports: serde_json::Value, // Can be array or object depending on mlld output

    #[serde(default)]
    pub effects: Vec<Effect>,

    pub metrics: Option<Metrics>,
}

/// An output effect from execution.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Effect {
    #[serde(rename = "type")]
    pub effect_type: String,
    pub content: Option<String>,
    pub security: Option<serde_json::Value>,
}

/// A write to the state:// protocol.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct StateWrite {
    pub path: String,
    pub value: serde_json::Value,
    pub timestamp: Option<String>,
}

/// Execution statistics.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metrics {
    pub total_ms: f64,
    pub parse_ms: f64,
    pub evaluate_ms: f64,
}

/// Static analysis of an mlld module.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AnalyzeResult {
    pub filepath: String,
    pub valid: bool,

    #[serde(default)]
    pub errors: Vec<AnalysisError>,

    #[serde(default)]
    pub executables: Vec<Executable>,

    #[serde(default)]
    pub exports: Vec<String>,

    #[serde(default)]
    pub imports: Vec<Import>,

    #[serde(default)]
    pub guards: Vec<Guard>,

    pub needs: Option<Needs>,
}

/// A parse or analysis error.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AnalysisError {
    pub message: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
}

/// An executable defined in a module.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Executable {
    pub name: String,

    #[serde(default)]
    pub params: Vec<String>,

    #[serde(default)]
    pub labels: Vec<String>,
}

/// An import statement in a module.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Import {
    #[serde(rename = "from")]
    pub from: String,

    #[serde(default)]
    pub names: Vec<String>,
}

/// A guard defined in a module.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Guard {
    pub name: String,
    pub timing: String,
    pub label: Option<String>,
}

/// Capability requirements for a module.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Needs {
    #[serde(default)]
    pub cmd: Vec<String>,

    #[serde(default)]
    pub node: Vec<String>,

    #[serde(default)]
    pub py: Vec<String>,
}

// Convenience functions using a default client

/// Execute an mlld script.
pub fn process(script: &str, opts: Option<ProcessOptions>) -> Result<String> {
    Client::new().process(script, opts)
}

/// Run an mlld file.
pub fn execute<P: Serialize>(
    filepath: &str,
    payload: Option<P>,
    opts: Option<ExecuteOptions>,
) -> Result<ExecuteResult> {
    Client::new().execute(filepath, payload, opts)
}

/// Analyze an mlld module.
pub fn analyze(filepath: &str) -> Result<AnalyzeResult> {
    Client::new().analyze(filepath)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_creation() {
        let client = Client::new();
        assert_eq!(client.command, "mlld");
        assert_eq!(client.timeout, Some(Duration::from_secs(30)));
    }

    #[test]
    fn test_client_builder() {
        let client = Client::new()
            .with_command("npx mlld")
            .with_timeout(Duration::from_secs(60))
            .with_working_dir("/tmp");

        assert_eq!(client.command, "npx mlld");
        assert_eq!(client.timeout, Some(Duration::from_secs(60)));
        assert_eq!(client.working_dir, Some("/tmp".to_string()));
    }
}
