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
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

/// Error type for mlld operations.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("mlld error: {message}")]
    Mlld {
        message: String,
        code: Option<String>,
    },

    #[error("transport error: {0}")]
    Transport(String),

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
#[derive(Clone)]
pub struct Client {
    /// The mlld command to invoke.
    pub command: String,

    /// Extra command args before `live --stdio`.
    /// Example: command="node", command_args=["./dist/cli.cjs"].
    pub command_args: Vec<String>,

    /// Default timeout for operations.
    pub timeout: Option<Duration>,

    /// Working directory for script execution.
    pub working_dir: Option<String>,

    transport: Arc<Mutex<Option<LiveTransport>>>,
    next_request_id: Arc<AtomicU64>,
}

struct RequestHandle {
    client: Client,
    request_id: u64,
    receiver: Option<Receiver<TransportMessage>>,
    timeout: Option<Duration>,
    cached_result: Option<(Value, Vec<StateWrite>)>,
}

impl RequestHandle {
    fn request_id(&self) -> u64 {
        self.request_id
    }

    fn cancel(&self) {
        self.client.cancel_request(self.request_id);
    }

    fn update_state(&self, path: &str, value: Value) -> Result<()> {
        self.client
            .update_state_request(self.request_id, path, value, self.timeout)
    }

    fn wait_raw(&mut self) -> Result<(Value, Vec<StateWrite>)> {
        if let Some((result, state_writes)) = &self.cached_result {
            return Ok((result.clone(), state_writes.clone()));
        }

        let receiver = self
            .receiver
            .take()
            .ok_or_else(|| Error::Transport("request handle already awaited".to_string()))?;

        let (result, state_writes) =
            self.client
                .await_request(self.request_id, receiver, self.timeout)?;

        self.cached_result = Some((result.clone(), state_writes.clone()));
        Ok((result, state_writes))
    }
}

/// In-flight process request handle.
pub struct ProcessHandle {
    request: RequestHandle,
}

impl ProcessHandle {
    /// Live request identifier.
    pub fn request_id(&self) -> u64 {
        self.request.request_id()
    }

    /// Request graceful cancellation for this in-flight execution.
    pub fn cancel(&self) {
        self.request.cancel();
    }

    /// Send a state:update request for this in-flight execution.
    pub fn update_state<V: Serialize>(&self, path: &str, value: V) -> Result<()> {
        self.request
            .update_state(path, serde_json::to_value(value)?)
    }

    /// Wait for completion and return output.
    pub fn wait(&mut self) -> Result<String> {
        self.result()
    }

    /// Wait for completion and return output.
    pub fn result(&mut self) -> Result<String> {
        let (result, _) = self.request.wait_raw()?;

        if let Some(output) = result.get("output").or_else(|| result.get("value")) {
            return Ok(match output {
                Value::String(text) => text.clone(),
                other => other.to_string(),
            });
        }

        Ok(String::new())
    }
}

/// In-flight execute request handle.
pub struct ExecuteHandle {
    request: RequestHandle,
}

impl ExecuteHandle {
    /// Live request identifier.
    pub fn request_id(&self) -> u64 {
        self.request.request_id()
    }

    /// Request graceful cancellation for this in-flight execution.
    pub fn cancel(&self) {
        self.request.cancel();
    }

    /// Send a state:update request for this in-flight execution.
    pub fn update_state<V: Serialize>(&self, path: &str, value: V) -> Result<()> {
        self.request
            .update_state(path, serde_json::to_value(value)?)
    }

    /// Wait for completion and return structured output.
    pub fn wait(&mut self) -> Result<ExecuteResult> {
        self.result()
    }

    /// Wait for completion and return structured output.
    pub fn result(&mut self) -> Result<ExecuteResult> {
        let (mut result, state_write_events) = self.request.wait_raw()?;

        if let Value::Object(map) = &mut result {
            map.remove("id");
        }

        let mut execute_result = match serde_json::from_value::<ExecuteResult>(result.clone()) {
            Ok(parsed) => parsed,
            Err(_) => ExecuteResult {
                output: result.to_string(),
                ..Default::default()
            },
        };

        execute_result.state_writes =
            merge_state_writes(execute_result.state_writes, state_write_events);
        Ok(execute_result)
    }
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
            command_args: Vec::new(),
            timeout: Some(Duration::from_secs(30)),
            working_dir: None,
            transport: Arc::new(Mutex::new(None)),
            next_request_id: Arc::new(AtomicU64::new(1)),
        }
    }

    /// Create a Client with a custom command.
    pub fn with_command(mut self, command: impl Into<String>) -> Self {
        self.command = command.into();
        self
    }

    /// Add command args used before live transport args.
    pub fn with_command_args<I, S>(mut self, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.command_args = args.into_iter().map(Into::into).collect();
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

    /// Close the persistent live transport process.
    pub fn close(&self) {
        if let Ok(mut guard) = self.transport.lock() {
            *guard = None;
        }
    }

    /// Execute an mlld script string and return the output.
    pub fn process(&self, script: &str, opts: Option<ProcessOptions>) -> Result<String> {
        let mut handle = self.process_async(script, opts)?;
        handle.result()
    }

    /// Start an mlld script execution and return an in-flight request handle.
    pub fn process_async(
        &self,
        script: &str,
        opts: Option<ProcessOptions>,
    ) -> Result<ProcessHandle> {
        let opts = opts.unwrap_or_default();

        let mut params = serde_json::Map::new();
        params.insert("script".to_string(), Value::String(script.to_string()));

        if let Some(file_path) = opts.file_path {
            params.insert("filePath".to_string(), Value::String(file_path));
        }
        if let Some(payload) = opts.payload {
            params.insert("payload".to_string(), payload);
        }
        if let Some(state) = opts.state {
            params.insert("state".to_string(), state);
        }
        if let Some(dynamic_modules) = opts.dynamic_modules {
            params.insert(
                "dynamicModules".to_string(),
                serde_json::to_value(dynamic_modules)?,
            );
        }
        if let Some(source) = opts.dynamic_module_source {
            params.insert("dynamicModuleSource".to_string(), Value::String(source));
        }
        if let Some(mode) = opts.mode {
            params.insert("mode".to_string(), Value::String(mode));
        }
        if let Some(allow_absolute_paths) = opts.allow_absolute_paths {
            params.insert(
                "allowAbsolutePaths".to_string(),
                Value::Bool(allow_absolute_paths),
            );
        }

        let timeout = opts.timeout.or(self.timeout);
        let (request_id, receiver) = self.start_request("process", Value::Object(params))?;

        Ok(ProcessHandle {
            request: RequestHandle {
                client: self.clone(),
                request_id,
                receiver: Some(receiver),
                timeout,
                cached_result: None,
            },
        })
    }

    /// Run an mlld file with a payload and optional state.
    pub fn execute<P: Serialize>(
        &self,
        filepath: &str,
        payload: Option<P>,
        opts: Option<ExecuteOptions>,
    ) -> Result<ExecuteResult> {
        let mut handle = self.execute_async(filepath, payload, opts)?;
        handle.result()
    }

    /// Start an mlld file execution and return an in-flight request handle.
    pub fn execute_async<P: Serialize>(
        &self,
        filepath: &str,
        payload: Option<P>,
        opts: Option<ExecuteOptions>,
    ) -> Result<ExecuteHandle> {
        let opts = opts.unwrap_or_default();

        let mut params = serde_json::Map::new();
        params.insert("filepath".to_string(), Value::String(filepath.to_string()));

        if let Some(p) = payload {
            params.insert("payload".to_string(), serde_json::to_value(p)?);
        }
        if let Some(state) = opts.state {
            params.insert("state".to_string(), state);
        }
        if let Some(dynamic_modules) = opts.dynamic_modules {
            params.insert(
                "dynamicModules".to_string(),
                serde_json::to_value(dynamic_modules)?,
            );
        }
        if let Some(source) = opts.dynamic_module_source {
            params.insert("dynamicModuleSource".to_string(), Value::String(source));
        }
        if let Some(allow_absolute_paths) = opts.allow_absolute_paths {
            params.insert(
                "allowAbsolutePaths".to_string(),
                Value::Bool(allow_absolute_paths),
            );
        }
        if let Some(mode) = opts.mode {
            params.insert("mode".to_string(), Value::String(mode));
        }

        let timeout = opts.timeout.or(self.timeout);
        let (request_id, receiver) = self.start_request("execute", Value::Object(params))?;

        Ok(ExecuteHandle {
            request: RequestHandle {
                client: self.clone(),
                request_id,
                receiver: Some(receiver),
                timeout,
                cached_result: None,
            },
        })
    }

    /// Perform static analysis on an mlld module without executing it.
    pub fn analyze(&self, filepath: &str) -> Result<AnalyzeResult> {
        let (mut result, _) = self.request("analyze", json!({ "filepath": filepath }), None)?;

        if let Value::Object(map) = &mut result {
            map.remove("id");
        }

        let parsed: AnalyzeResult = serde_json::from_value(result)?;
        Ok(parsed)
    }

    fn request(
        &self,
        method: &str,
        params: Value,
        timeout: Option<Duration>,
    ) -> Result<(Value, Vec<StateWrite>)> {
        let (request_id, receiver) = self.start_request(method, params)?;
        self.await_request(request_id, receiver, timeout)
    }

    fn start_request(
        &self,
        method: &str,
        params: Value,
    ) -> Result<(u64, Receiver<TransportMessage>)> {
        let request_id = self.next_request_id.fetch_add(1, Ordering::Relaxed);

        let receiver = {
            let mut guard = self
                .transport
                .lock()
                .map_err(|_| Error::Transport("transport lock poisoned".to_string()))?;

            let transport = self.ensure_transport_locked(&mut guard)?;
            let receiver = transport.register_request(request_id);
            let request = json!({
                "method": method,
                "id": request_id,
                "params": params
            });
            transport.send_json(&request)?;
            receiver
        };

        Ok((request_id, receiver))
    }

    fn await_request(
        &self,
        request_id: u64,
        receiver: Receiver<TransportMessage>,
        timeout: Option<Duration>,
    ) -> Result<(Value, Vec<StateWrite>)> {
        let start = Instant::now();
        let mut state_write_events = Vec::new();

        loop {
            let message = if let Some(limit) = timeout {
                let elapsed = start.elapsed();
                if elapsed >= limit {
                    self.cancel_request(request_id);
                    self.remove_pending_request(request_id);
                    return Err(Error::Timeout(limit));
                }

                match receiver.recv_timeout(limit - elapsed) {
                    Ok(message) => message,
                    Err(RecvTimeoutError::Timeout) => {
                        self.cancel_request(request_id);
                        self.remove_pending_request(request_id);
                        return Err(Error::Timeout(limit));
                    }
                    Err(RecvTimeoutError::Disconnected) => {
                        self.invalidate_transport();
                        return Err(Error::Transport("live transport disconnected".to_string()));
                    }
                }
            } else {
                match receiver.recv() {
                    Ok(message) => message,
                    Err(_) => {
                        self.invalidate_transport();
                        return Err(Error::Transport("live transport disconnected".to_string()));
                    }
                }
            };

            match message {
                TransportMessage::Event(event) => {
                    if let Some(write) = parse_state_write_event(&event) {
                        state_write_events.push(write);
                    }
                }
                TransportMessage::Result(result) => {
                    if let Some(error_payload) = result.get("error") {
                        return Err(error_from_payload(error_payload));
                    }
                    return Ok((result, state_write_events));
                }
                TransportMessage::Closed(message) => {
                    self.invalidate_transport();
                    return Err(Error::Transport(message));
                }
            }
        }
    }

    fn cancel_request(&self, request_id: u64) {
        if let Ok(mut guard) = self.transport.lock() {
            if let Some(transport) = guard.as_mut() {
                let _ = transport.send_json(&json!({
                    "method": "cancel",
                    "id": request_id
                }));
            }
        }
    }

    fn update_state_request(
        &self,
        request_id: u64,
        path: &str,
        value: Value,
        timeout: Option<Duration>,
    ) -> Result<()> {
        if path.trim().is_empty() {
            return Err(Error::Transport(
                "state update path is required".to_string(),
            ));
        }

        let max_wait = timeout.unwrap_or(Duration::from_secs(2));
        let deadline = Instant::now() + max_wait;

        loop {
            match self.request(
                "state:update",
                json!({
                    "requestId": request_id,
                    "path": path,
                    "value": value
                }),
                timeout,
            ) {
                Ok(_) => return Ok(()),
                Err(Error::Mlld {
                    code: Some(code), ..
                }) if code == "REQUEST_NOT_FOUND" => {
                    if Instant::now() >= deadline {
                        return Err(Error::Mlld {
                            message: format!("No active request for id {request_id}"),
                            code: Some(code),
                        });
                    }
                    thread::sleep(Duration::from_millis(25));
                }
                Err(err) => return Err(err),
            }
        }
    }

    fn remove_pending_request(&self, request_id: u64) {
        if let Ok(mut guard) = self.transport.lock() {
            if let Some(transport) = guard.as_mut() {
                transport.remove_request(request_id);
            }
        }
    }

    fn invalidate_transport(&self) {
        if let Ok(mut guard) = self.transport.lock() {
            *guard = None;
        }
    }

    fn ensure_transport_locked<'a>(
        &'a self,
        slot: &'a mut Option<LiveTransport>,
    ) -> Result<&'a mut LiveTransport> {
        let needs_restart = match slot.as_mut() {
            Some(transport) => !transport.is_running()?,
            None => true,
        };

        if needs_restart {
            *slot = Some(LiveTransport::spawn(
                &self.command,
                &self.command_args,
                self.working_dir.as_deref(),
            )?);
        }

        slot.as_mut()
            .ok_or_else(|| Error::Transport("failed to initialize transport".to_string()))
    }
}

#[derive(Debug)]
enum TransportMessage {
    Event(Value),
    Result(Value),
    Closed(String),
}

#[derive(Debug)]
struct LiveTransport {
    child: Child,
    stdin: ChildStdin,
    pending: Arc<Mutex<HashMap<u64, Sender<TransportMessage>>>>,
    stdout_thread: Option<thread::JoinHandle<()>>,
    stderr_thread: Option<thread::JoinHandle<()>>,
}

impl LiveTransport {
    fn spawn(command: &str, command_args: &[String], working_dir: Option<&str>) -> Result<Self> {
        let mut args = command_args.to_vec();
        args.push("live".to_string());
        args.push("--stdio".to_string());

        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }

        let mut child = cmd.spawn()?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| Error::Transport("live transport stdin is unavailable".to_string()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| Error::Transport("live transport stdout is unavailable".to_string()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| Error::Transport("live transport stderr is unavailable".to_string()))?;

        let pending: Arc<Mutex<HashMap<u64, Sender<TransportMessage>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let stderr_buffer = Arc::new(Mutex::new(String::new()));

        let stderr_thread = Some(start_stderr_thread(stderr, Arc::clone(&stderr_buffer)));
        let stdout_thread = Some(start_stdout_thread(
            stdout,
            Arc::clone(&pending),
            Arc::clone(&stderr_buffer),
        ));

        Ok(Self {
            child,
            stdin,
            pending,
            stdout_thread,
            stderr_thread,
        })
    }

    fn register_request(&mut self, request_id: u64) -> Receiver<TransportMessage> {
        let (sender, receiver) = mpsc::channel();
        if let Ok(mut pending) = self.pending.lock() {
            pending.insert(request_id, sender);
        }
        receiver
    }

    fn remove_request(&mut self, request_id: u64) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(&request_id);
        }
    }

    fn send_json(&mut self, payload: &Value) -> Result<()> {
        let line = serde_json::to_string(payload)?;
        self.stdin.write_all(line.as_bytes())?;
        self.stdin.write_all(b"\n")?;
        self.stdin.flush()?;
        Ok(())
    }

    fn is_running(&mut self) -> Result<bool> {
        Ok(self.child.try_wait()?.is_none())
    }
}

impl Drop for LiveTransport {
    fn drop(&mut self) {
        let _ = self.stdin.flush();
        let _ = self.child.kill();
        let _ = self.child.wait();

        if let Some(thread_handle) = self.stdout_thread.take() {
            let _ = thread_handle.join();
        }
        if let Some(thread_handle) = self.stderr_thread.take() {
            let _ = thread_handle.join();
        }
    }
}

fn start_stdout_thread(
    stdout: ChildStdout,
    pending: Arc<Mutex<HashMap<u64, Sender<TransportMessage>>>>,
    stderr_buffer: Arc<Mutex<String>>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let reader = BufReader::new(stdout);

        for line in reader.lines() {
            match line {
                Ok(line) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    let envelope = match serde_json::from_str::<Value>(trimmed) {
                        Ok(parsed) => parsed,
                        Err(error) => {
                            notify_all_pending(&pending, format!("invalid live response: {error}"));
                            continue;
                        }
                    };

                    if let Some(event) = envelope.get("event") {
                        dispatch_event(&pending, event.clone());
                    }

                    if let Some(result) = envelope.get("result") {
                        dispatch_result(&pending, result.clone());
                    }
                }
                Err(error) => {
                    notify_all_pending(&pending, format!("live transport read error: {error}"));
                    return;
                }
            }
        }

        let message = {
            if let Ok(stderr) = stderr_buffer.lock() {
                let trimmed = stderr.trim();
                if trimmed.is_empty() {
                    "live transport closed".to_string()
                } else {
                    trimmed.to_string()
                }
            } else {
                "live transport closed".to_string()
            }
        };

        notify_all_pending(&pending, message);
    })
}

fn start_stderr_thread(
    stderr: ChildStderr,
    stderr_buffer: Arc<Mutex<String>>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let reader = BufReader::new(stderr);

        for line in reader.lines() {
            if let Ok(line) = line {
                if let Ok(mut buffer) = stderr_buffer.lock() {
                    if !buffer.is_empty() {
                        buffer.push('\n');
                    }
                    buffer.push_str(&line);
                }
            }
        }
    })
}

fn dispatch_event(pending: &Arc<Mutex<HashMap<u64, Sender<TransportMessage>>>>, event: Value) {
    let request_id = event.get("id").and_then(value_to_request_id);

    let Some(request_id) = request_id else {
        return;
    };

    let sender = pending
        .lock()
        .ok()
        .and_then(|map| map.get(&request_id).cloned());

    if let Some(sender) = sender {
        let _ = sender.send(TransportMessage::Event(event));
    }
}

fn dispatch_result(pending: &Arc<Mutex<HashMap<u64, Sender<TransportMessage>>>>, result: Value) {
    let request_id = result.get("id").and_then(value_to_request_id);

    let Some(request_id) = request_id else {
        return;
    };

    let sender = pending
        .lock()
        .ok()
        .and_then(|mut map| map.remove(&request_id));

    if let Some(sender) = sender {
        let _ = sender.send(TransportMessage::Result(result));
    }
}

fn notify_all_pending(
    pending: &Arc<Mutex<HashMap<u64, Sender<TransportMessage>>>>,
    message: String,
) {
    let senders = pending
        .lock()
        .map(|mut map| map.drain().map(|(_, sender)| sender).collect::<Vec<_>>())
        .unwrap_or_default();

    for sender in senders {
        let _ = sender.send(TransportMessage::Closed(message.clone()));
    }
}

fn value_to_request_id(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number.as_u64().or_else(|| {
            number
                .as_i64()
                .and_then(|n| if n >= 0 { Some(n as u64) } else { None })
        }),
        Value::String(text) => text.parse::<u64>().ok(),
        _ => None,
    }
}

fn error_from_payload(payload: &Value) -> Error {
    let message = payload
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("mlld request failed")
        .to_string();

    let code = payload
        .get("code")
        .and_then(Value::as_str)
        .map(ToString::to_string);

    Error::Mlld { message, code }
}

fn parse_state_write_event(event: &Value) -> Option<StateWrite> {
    if event.get("type").and_then(Value::as_str) != Some("state:write") {
        return None;
    }

    let write = event.get("write")?;
    let path = write.get("path")?.as_str()?.to_string();

    Some(StateWrite {
        path,
        value: write.get("value").cloned().unwrap_or(Value::Null),
        timestamp: write
            .get("timestamp")
            .and_then(Value::as_str)
            .map(ToString::to_string),
    })
}

fn merge_state_writes(primary: Vec<StateWrite>, secondary: Vec<StateWrite>) -> Vec<StateWrite> {
    if secondary.is_empty() {
        return primary;
    }
    if primary.is_empty() {
        return secondary;
    }

    let mut merged = Vec::with_capacity(primary.len() + secondary.len());
    let mut seen = std::collections::HashSet::new();

    for state_write in primary.into_iter().chain(secondary.into_iter()) {
        let key = state_write_key(&state_write);
        if seen.insert(key) {
            merged.push(state_write);
        }
    }

    merged
}

fn state_write_key(state_write: &StateWrite) -> String {
    format!(
        "{}|{}",
        state_write.path,
        serde_json::to_string(&state_write.value).unwrap_or_else(|_| "null".to_string())
    )
}

/// Options for process().
#[derive(Debug, Default, Clone)]
pub struct ProcessOptions {
    /// Provides context for relative imports.
    pub file_path: Option<String>,

    /// Data injected as @payload.
    pub payload: Option<Value>,

    /// Data injected as @state.
    pub state: Option<Value>,

    /// Additional modules to inject.
    pub dynamic_modules: Option<HashMap<String, Value>>,

    /// Source label added to dynamic modules.
    pub dynamic_module_source: Option<String>,

    /// Parsing mode (strict|markdown).
    pub mode: Option<String>,

    /// Allow absolute path access.
    pub allow_absolute_paths: Option<bool>,

    /// Override the client default timeout.
    pub timeout: Option<Duration>,
}

/// Options for execute().
#[derive(Debug, Default, Clone)]
pub struct ExecuteOptions {
    /// Data injected as @state.
    pub state: Option<Value>,

    /// Additional modules to inject.
    pub dynamic_modules: Option<HashMap<String, Value>>,

    /// Source label added to dynamic modules.
    pub dynamic_module_source: Option<String>,

    /// Parsing mode (strict|markdown).
    pub mode: Option<String>,

    /// Allow absolute path access.
    pub allow_absolute_paths: Option<bool>,

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
    pub exports: Value,

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
    pub security: Option<Value>,
}

/// A write to the state:// protocol.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct StateWrite {
    pub path: String,
    pub value: Value,
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

fn default_client() -> &'static Client {
    static DEFAULT_CLIENT: OnceLock<Client> = OnceLock::new();
    DEFAULT_CLIENT.get_or_init(Client::new)
}

// Convenience functions using a default client

/// Execute an mlld script.
pub fn process(script: &str, opts: Option<ProcessOptions>) -> Result<String> {
    default_client().process(script, opts)
}

/// Run an mlld file.
pub fn execute<P: Serialize>(
    filepath: &str,
    payload: Option<P>,
    opts: Option<ExecuteOptions>,
) -> Result<ExecuteResult> {
    default_client().execute(filepath, payload, opts)
}

/// Analyze an mlld module.
pub fn analyze(filepath: &str) -> Result<AnalyzeResult> {
    default_client().analyze(filepath)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    #[test]
    fn test_client_creation() {
        let client = Client::new();
        assert_eq!(client.command, "mlld");
        assert_eq!(client.timeout, Some(Duration::from_secs(30)));
    }

    #[test]
    fn test_client_builder() {
        let client = Client::new()
            .with_command("node")
            .with_command_args(["./dist/cli.cjs"])
            .with_timeout(Duration::from_secs(60))
            .with_working_dir("/tmp");

        assert_eq!(client.command, "node");
        assert_eq!(client.command_args, vec!["./dist/cli.cjs".to_string()]);
        assert_eq!(client.timeout, Some(Duration::from_secs(60)));
        assert_eq!(client.working_dir, Some("/tmp".to_string()));
    }

    #[test]
    fn test_live_execute_roundtrip_with_state_and_dynamic_modules() {
        let cli_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("dist")
            .join("cli.cjs");
        assert!(cli_path.exists(), "expected dist/cli.cjs to exist");

        let script = r#"/import { @mode } from "@config"
/import { @text } from "@payload"

/var @next = @state.count + 1
/output @next to "state://count"
/show `text=@text mode=@mode count=@next`
"#;

        let temp_dir = std::env::temp_dir().join(format!(
            "mlld-rust-sdk-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_millis()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");

        let script_path = temp_dir.join("integration.mld");
        fs::write(&script_path, script).expect("write script file");

        let client = Client::new()
            .with_command("node")
            .with_command_args([cli_path.to_string_lossy().to_string()])
            .with_timeout(Duration::from_secs(15));

        let process_output = client
            .process(
                r#"/import { @mode } from "@config"
/var @next = @state.count + 1
/show `mode=@mode count=@next`
"#,
                Some(ProcessOptions {
                    state: Some(json!({ "count": 1 })),
                    dynamic_modules: Some({
                        let mut map = HashMap::new();
                        map.insert("@config".to_string(), json!({ "mode": "process" }));
                        map
                    }),
                    mode: Some("markdown".to_string()),
                    timeout: Some(Duration::from_secs(10)),
                    ..Default::default()
                }),
            )
            .expect("process request succeeds");
        assert!(process_output.contains("mode=process count=2"));

        let first = client
            .execute(
                script_path.to_string_lossy().as_ref(),
                Some(json!({ "text": "hello" })),
                Some(ExecuteOptions {
                    state: Some(json!({ "count": 0 })),
                    dynamic_modules: Some({
                        let mut map = HashMap::new();
                        map.insert("@config".to_string(), json!({ "mode": "live" }));
                        map
                    }),
                    mode: Some("markdown".to_string()),
                    timeout: Some(Duration::from_secs(10)),
                    ..Default::default()
                }),
            )
            .expect("first execute succeeds");

        assert!(first.output.contains("text=hello mode=live count=1"));
        let first_write = first
            .state_writes
            .iter()
            .find(|write| write.path == "count")
            .expect("first run writes count");
        assert_eq!(state_write_as_i64(&first_write.value), Some(1));

        let second = client
            .execute(
                script_path.to_string_lossy().as_ref(),
                Some(json!({ "text": "again" })),
                Some(ExecuteOptions {
                    state: Some(json!({ "count": first_write.value.clone() })),
                    dynamic_modules: Some({
                        let mut map = HashMap::new();
                        map.insert("@config".to_string(), json!({ "mode": "live" }));
                        map
                    }),
                    mode: Some("markdown".to_string()),
                    timeout: Some(Duration::from_secs(10)),
                    ..Default::default()
                }),
            )
            .expect("second execute succeeds");

        assert!(second.output.contains("text=again mode=live count=2"));
        let second_write = second
            .state_writes
            .iter()
            .find(|write| write.path == "count")
            .expect("second run writes count");
        assert_eq!(state_write_as_i64(&second_write.value), Some(2));

        client.close();
        let _ = fs::remove_file(script_path);
        let _ = fs::remove_dir(temp_dir);
    }

    #[test]
    fn test_loop_stops_via_state_update() {
        let cli_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("dist")
            .join("cli.cjs");
        assert!(cli_path.exists(), "expected dist/cli.cjs to exist");

        let client = Client::new()
            .with_command("node")
            .with_command_args([cli_path.to_string_lossy().to_string()])
            .with_timeout(Duration::from_secs(15));

        let mut handle = client
            .process_async(
                "loop(99999, 50ms) until @state.exit [\n  continue\n]\nshow \"loop-stopped\"",
                Some(ProcessOptions {
                    state: Some(json!({ "exit": false })),
                    mode: Some("strict".to_string()),
                    timeout: Some(Duration::from_secs(10)),
                    ..Default::default()
                }),
            )
            .expect("start process request succeeds");

        std::thread::sleep(Duration::from_millis(120));
        handle
            .update_state("exit", true)
            .expect("state update succeeds");

        let output = handle.result().expect("loop process succeeds");
        assert!(output.contains("loop-stopped"));

        client.close();
    }

    #[test]
    fn test_state_update_fails_after_completion() {
        let cli_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("dist")
            .join("cli.cjs");
        assert!(cli_path.exists(), "expected dist/cli.cjs to exist");

        let client = Client::new()
            .with_command("node")
            .with_command_args([cli_path.to_string_lossy().to_string()])
            .with_timeout(Duration::from_secs(15));

        let mut handle = client
            .process_async(
                "show \"done\"",
                Some(ProcessOptions {
                    mode: Some("strict".to_string()),
                    timeout: Some(Duration::from_secs(1)),
                    ..Default::default()
                }),
            )
            .expect("start process request succeeds");

        let output = handle.result().expect("process request succeeds");
        assert!(output.contains("done"));

        let error = handle
            .update_state("exit", true)
            .expect_err("state update after completion fails");

        match error {
            Error::Mlld {
                code: Some(code), ..
            } => assert_eq!(code, "REQUEST_NOT_FOUND"),
            other => panic!("expected REQUEST_NOT_FOUND error, got {other:?}"),
        }

        client.close();
    }
    fn state_write_as_i64(value: &Value) -> Option<i64> {
        match value {
            Value::Number(number) => number.as_i64(),
            Value::String(text) => text.parse::<i64>().ok(),
            _ => None,
        }
    }
}
