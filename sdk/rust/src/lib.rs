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

/// Wrapper used to attach security labels to individual payload fields.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LabeledValue {
    #[serde(rename = "__mlld_labeled_value__")]
    marker: bool,
    pub value: Value,
    pub labels: Vec<String>,
}

/// Attach one or more labels to a payload field value.
pub fn labeled<I, S>(value: Value, labels: I) -> LabeledValue
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    LabeledValue {
        marker: true,
        value,
        labels: normalize_label_iter(labels),
    }
}

/// Mark a payload field as trusted.
pub fn trusted(value: Value) -> LabeledValue {
    labeled(value, ["trusted"])
}

/// Mark a payload field as untrusted.
pub fn untrusted(value: Value) -> LabeledValue {
    labeled(value, ["untrusted"])
}

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
    complete: bool,
    complete_event_emitted: bool,
    raw_result: Option<Value>,
    state_write_events: Vec<StateWrite>,
    guard_denial_events: Vec<GuardDenial>,
    terminal_error: Option<TerminalError>,
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
            .update_state_request(self.request_id, path, value, self.timeout, None)
    }

    fn update_state_with_labels(
        &self,
        path: &str,
        value: Value,
        labels: Vec<String>,
    ) -> Result<()> {
        self.client
            .update_state_request(self.request_id, path, value, self.timeout, Some(labels))
    }

    fn write_file(
        &self,
        path: &str,
        content: &str,
        timeout: Option<Duration>,
    ) -> Result<FileVerifyResult> {
        self.client
            .write_file_request(self.request_id, path, content, timeout)
    }

    fn wait_raw(&mut self) -> Result<(Value, Vec<StateWrite>, Vec<GuardDenial>)> {
        if self.complete {
            if let Some(error) = &self.terminal_error {
                return Err(error.to_error());
            }

            let result = self
                .raw_result
                .clone()
                .ok_or_else(|| Error::Transport("missing live result payload".to_string()))?;
            self.complete_event_emitted = true;
            return Ok((
                result,
                self.state_write_events.clone(),
                self.guard_denial_events.clone(),
            ));
        }

        let started_at = Instant::now();

        loop {
            let message = self
                .receive_message(remaining_timeout(started_at, self.timeout), true)?
                .ok_or_else(|| Error::Transport("missing live response message".to_string()))?;
            match self.handle_message(message) {
                Ok(Some(event)) if event.event_type == "complete" => {
                    self.complete_event_emitted = true;
                    let result = self.raw_result.clone().ok_or_else(|| {
                        Error::Transport("missing live result payload".to_string())
                    })?;
                    return Ok((
                        result,
                        self.state_write_events.clone(),
                        self.guard_denial_events.clone(),
                    ));
                }
                Ok(Some(_)) | Ok(None) => continue,
                Err(error) => return Err(error),
            }
        }
    }

    fn next_event(&mut self, timeout: Option<Duration>) -> Result<Option<HandleEvent>> {
        if self.complete {
            if self.terminal_error.is_some() || self.complete_event_emitted {
                return Ok(None);
            }
            self.complete_event_emitted = true;
            return Ok(Some(HandleEvent::complete()));
        }

        let effective_timeout = resolve_event_timeout(self.timeout, timeout);
        let started_at = Instant::now();

        loop {
            let Some(message) =
                self.receive_message(remaining_timeout(started_at, effective_timeout), false)?
            else {
                return Ok(None);
            };

            match self.handle_message(message) {
                Ok(Some(event)) => {
                    if event.event_type == "complete" {
                        self.complete_event_emitted = true;
                    }
                    return Ok(Some(event));
                }
                Ok(None) => continue,
                Err(error) => return Err(error),
            }
        }
    }

    fn receive_message(
        &mut self,
        timeout: Option<Duration>,
        terminal_timeout: bool,
    ) -> Result<Option<TransportMessage>> {
        let receiver = self
            .receiver
            .as_ref()
            .ok_or_else(|| Error::Transport("request handle already completed".to_string()))?;

        if let Some(limit) = timeout {
            match receiver.recv_timeout(limit) {
                Ok(message) => Ok(Some(message)),
                Err(RecvTimeoutError::Timeout) => {
                    if terminal_timeout {
                        self.client.cancel_request(self.request_id);
                        self.client.remove_pending_request(self.request_id);
                        let error = TerminalError::Timeout(limit);
                        self.complete = true;
                        self.complete_event_emitted = true;
                        self.terminal_error = Some(error.clone());
                        Err(error.to_error())
                    } else {
                        Ok(None)
                    }
                }
                Err(RecvTimeoutError::Disconnected) => {
                    let error = TerminalError::Transport("live transport disconnected".to_string());
                    self.complete = true;
                    self.complete_event_emitted = true;
                    self.terminal_error = Some(error.clone());
                    self.client.invalidate_transport();
                    Err(error.to_error())
                }
            }
        } else {
            match receiver.recv() {
                Ok(message) => Ok(Some(message)),
                Err(_) => {
                    let error = TerminalError::Transport("live transport disconnected".to_string());
                    self.complete = true;
                    self.complete_event_emitted = true;
                    self.terminal_error = Some(error.clone());
                    self.client.invalidate_transport();
                    Err(error.to_error())
                }
            }
        }
    }

    fn handle_message(&mut self, message: TransportMessage) -> Result<Option<HandleEvent>> {
        match message {
            TransportMessage::Event(event) => {
                if let Some(write) = parse_state_write_event(&event) {
                    self.state_write_events.push(write.clone());
                    return Ok(Some(HandleEvent::state_write(write)));
                }
                if let Some(session_write) = parse_session_write_event(&event) {
                    return Ok(Some(HandleEvent::session_write(session_write)));
                }
                if let Some(denial) = parse_guard_denial_event(&event) {
                    self.guard_denial_events.push(denial.clone());
                    return Ok(Some(HandleEvent::guard_denial(denial)));
                }
                Ok(None)
            }
            TransportMessage::Result(result) => {
                if let Some(error_payload) = result.get("error") {
                    let error = terminal_error_from_payload(error_payload);
                    self.complete = true;
                    self.complete_event_emitted = true;
                    self.terminal_error = Some(error.clone());
                    return Err(error.to_error());
                }
                if let Some(payload) = result.get("result") {
                    self.raw_result = Some(payload.clone());
                    self.complete = true;
                    return Ok(Some(HandleEvent::complete()));
                }

                let error =
                    TerminalError::Transport("live response envelope missing result".to_string());
                self.complete = true;
                self.complete_event_emitted = true;
                self.terminal_error = Some(error.clone());
                Err(error.to_error())
            }
            TransportMessage::Closed(message) => {
                let error = TerminalError::Transport(message);
                self.complete = true;
                self.complete_event_emitted = true;
                self.terminal_error = Some(error.clone());
                self.client.invalidate_transport();
                Err(error.to_error())
            }
        }
    }
}

#[derive(Debug, Clone)]
enum TerminalError {
    Mlld {
        message: String,
        code: Option<String>,
    },
    Transport(String),
    Timeout(Duration),
}

impl TerminalError {
    fn to_error(&self) -> Error {
        match self {
            TerminalError::Mlld { message, code } => Error::Mlld {
                message: message.clone(),
                code: code.clone(),
            },
            TerminalError::Transport(message) => Error::Transport(message.clone()),
            TerminalError::Timeout(duration) => Error::Timeout(*duration),
        }
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

    /// Send a labeled state:update request for this in-flight execution.
    pub fn update_state_with_labels<V, I, S>(&self, path: &str, value: V, labels: I) -> Result<()>
    where
        V: Serialize,
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.request.update_state_with_labels(
            path,
            serde_json::to_value(value)?,
            normalize_labels(labels),
        )
    }

    /// Wait for completion and return output.
    pub fn wait(&mut self) -> Result<String> {
        self.result()
    }

    /// Wait for completion and return output.
    pub fn result(&mut self) -> Result<String> {
        let (result, _, _) = self.request.wait_raw()?;

        if let Some(output) = result.get("output") {
            return Ok(match output {
                Value::String(text) => text.clone(),
                other => other.to_string(),
            });
        }

        Ok(match result {
            Value::String(text) => text,
            Value::Null => String::new(),
            other => other.to_string(),
        })
    }

    /// Block until the next in-flight event. Returns None on timeout.
    pub fn next_event(&mut self, timeout: Option<Duration>) -> Result<Option<HandleEvent>> {
        self.request.next_event(timeout)
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

    /// Send a labeled state:update request for this in-flight execution.
    pub fn update_state_with_labels<V, I, S>(&self, path: &str, value: V, labels: I) -> Result<()>
    where
        V: Serialize,
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.request.update_state_with_labels(
            path,
            serde_json::to_value(value)?,
            normalize_labels(labels),
        )
    }

    /// Wait for completion and return structured output.
    pub fn wait(&mut self) -> Result<ExecuteResult> {
        self.result()
    }

    /// Wait for completion and return structured output.
    pub fn result(&mut self) -> Result<ExecuteResult> {
        let (result, state_write_events, guard_denial_events) = self.request.wait_raw()?;

        let mut execute_result = match serde_json::from_value::<ExecuteResult>(result.clone()) {
            Ok(parsed) => parsed,
            Err(_) => ExecuteResult {
                output: result.to_string(),
                ..Default::default()
            },
        };

        execute_result.state_writes =
            merge_state_writes(execute_result.state_writes, state_write_events);
        execute_result.denials = merge_guard_denials(execute_result.denials, guard_denial_events);
        Ok(execute_result)
    }

    /// Block until the next in-flight event. Returns None on timeout.
    pub fn next_event(&mut self, timeout: Option<Duration>) -> Result<Option<HandleEvent>> {
        self.request.next_event(timeout)
    }

    /// Write a file within the active execution context and return its signature status.
    pub fn write_file(
        &self,
        path: &str,
        content: &str,
        timeout: Option<Duration>,
    ) -> Result<FileVerifyResult> {
        self.request.write_file(path, content, timeout)
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
        let (method, params, timeout) = build_process_request(script, opts, self.timeout)?;
        let (request_id, receiver) = self.start_request(method, params)?;

        Ok(ProcessHandle {
            request: RequestHandle {
                client: self.clone(),
                request_id,
                receiver: Some(receiver),
                timeout,
                complete: false,
                complete_event_emitted: false,
                raw_result: None,
                state_write_events: Vec::new(),
                guard_denial_events: Vec::new(),
                terminal_error: None,
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
        let raw_payload = match payload {
            Some(payload) => Some(serde_json::to_value(payload)?),
            None => None,
        };
        let (method, params, timeout) =
            build_execute_request(filepath, raw_payload, opts, self.timeout)?;
        let (request_id, receiver) = self.start_request(method, params)?;

        Ok(ExecuteHandle {
            request: RequestHandle {
                client: self.clone(),
                request_id,
                receiver: Some(receiver),
                timeout,
                complete: false,
                complete_event_emitted: false,
                raw_result: None,
                state_write_events: Vec::new(),
                guard_denial_events: Vec::new(),
                terminal_error: None,
            },
        })
    }

    /// Perform static analysis on an mlld module without executing it.
    pub fn analyze(&self, filepath: &str) -> Result<AnalyzeResult> {
        let (result, _) = self.request("analyze", json!({ "filepath": filepath }), None)?;

        let parsed: AnalyzeResult = serde_json::from_value(result)?;
        Ok(parsed)
    }

    /// Return filesystem signature/integrity status for tracked files.
    pub fn fs_status(
        &self,
        glob: Option<&str>,
        opts: Option<FsStatusOptions>,
    ) -> Result<Vec<FilesystemStatus>> {
        let (method, params, timeout) = build_fs_status_request(glob, opts, self.timeout);
        let (result, _) = self.request(method, params, timeout)?;

        serde_json::from_value(result).map_err(Error::Json)
    }

    /// Sign a file and return its verification status.
    pub fn sign(&self, path: &str, opts: Option<SignOptions>) -> Result<FileVerifyResult> {
        let (method, params, timeout) = build_sign_request(path, opts, self.timeout);
        let (result, _) = self.request(method, params, timeout)?;

        decode_file_verify_result(result)
    }

    /// Verify a file and return its signature status.
    pub fn verify(&self, path: &str, opts: Option<VerifyOptions>) -> Result<FileVerifyResult> {
        let (method, params, timeout) = build_verify_request(path, opts, self.timeout);
        let (result, _) = self.request(method, params, timeout)?;

        decode_file_verify_result(result)
    }

    /// Sign runtime content and persist it in the project's content store.
    pub fn sign_content(
        &self,
        content: &str,
        identity: &str,
        opts: Option<SignContentOptions>,
    ) -> Result<ContentSignature> {
        let (method, params, timeout) =
            build_sign_content_request(content, identity, opts, self.timeout);
        let (result, _) = self.request(method, params, timeout)?;

        serde_json::from_value(result).map_err(Error::Json)
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
                    if let Some(payload) = result.get("result") {
                        return Ok((payload.clone(), state_write_events));
                    }
                    return Err(Error::Transport(
                        "live response envelope missing result".to_string(),
                    ));
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
        labels: Option<Vec<String>>,
    ) -> Result<()> {
        if path.trim().is_empty() {
            return Err(Error::Transport(
                "state update path is required".to_string(),
            ));
        }

        let labels = labels.and_then(|entries| {
            let normalized = normalize_labels(entries);
            if normalized.is_empty() {
                None
            } else {
                Some(normalized)
            }
        });

        let max_wait = timeout.unwrap_or(Duration::from_secs(2));
        let deadline = Instant::now() + max_wait;

        loop {
            let mut params = serde_json::Map::new();
            params.insert("requestId".to_string(), json!(request_id));
            params.insert("path".to_string(), json!(path));
            params.insert("value".to_string(), value.clone());
            if let Some(labels) = &labels {
                params.insert("labels".to_string(), json!(labels));
            }
            match self.request("state:update", Value::Object(params), timeout) {
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

    fn write_file_request(
        &self,
        request_id: u64,
        path: &str,
        content: &str,
        timeout: Option<Duration>,
    ) -> Result<FileVerifyResult> {
        if path.trim().is_empty() {
            return Err(Error::Transport("file write path is required".to_string()));
        }

        let max_wait = timeout.unwrap_or(Duration::from_secs(2));
        let deadline = Instant::now() + max_wait;

        loop {
            let params = json!({
                "requestId": request_id,
                "path": path,
                "content": content,
            });

            match self.request("file:write", params, timeout) {
                Ok((result, _)) => return decode_file_verify_result(result),
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

                    if (envelope.get("result").is_some() || envelope.get("error").is_some())
                        && envelope.get("id").and_then(value_to_request_id).is_some()
                    {
                        dispatch_result(&pending, envelope);
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
    let request_id = event
        .get("requestId")
        .or_else(|| event.get("id"))
        .and_then(value_to_request_id);

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

fn normalize_labels<I, S>(labels: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let mut seen = std::collections::HashSet::new();
    let mut normalized = Vec::new();

    for label in labels {
        let trimmed = label.into().trim().to_string();
        if trimmed.is_empty() || !seen.insert(trimmed.clone()) {
            continue;
        }
        normalized.push(trimmed);
    }

    normalized
}

fn normalize_label_iter<I, S>(labels: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut normalized = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for label in labels {
        let trimmed = label.as_ref().trim();
        if trimmed.is_empty() || seen.contains(trimmed) {
            continue;
        }
        seen.insert(trimmed.to_string());
        normalized.push(trimmed.to_string());
    }

    normalized
}

fn resolve_event_timeout(
    default_timeout: Option<Duration>,
    override_timeout: Option<Duration>,
) -> Option<Duration> {
    override_timeout.or(default_timeout)
}

fn remaining_timeout(started_at: Instant, timeout: Option<Duration>) -> Option<Duration> {
    timeout.map(|limit| limit.saturating_sub(started_at.elapsed()))
}

fn normalize_label_map(
    input: Option<HashMap<String, Vec<String>>>,
) -> Option<HashMap<String, Vec<String>>> {
    let mut normalized = HashMap::new();

    for (field, labels) in input.unwrap_or_default() {
        let deduped = normalize_labels(labels);
        if !deduped.is_empty() {
            normalized.insert(field, deduped);
        }
    }

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn normalize_string_map(input: Option<HashMap<String, String>>) -> Option<HashMap<String, String>> {
    let mut normalized = HashMap::new();

    for (field, value) in input.unwrap_or_default() {
        let trimmed_key = field.trim();
        let trimmed_value = value.trim();
        if trimmed_key.is_empty() || trimmed_value.is_empty() {
            continue;
        }
        normalized.insert(trimmed_key.to_string(), trimmed_value.to_string());
    }

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn normalize_payload_and_labels(
    payload: Option<Value>,
    payload_labels: Option<HashMap<String, Vec<String>>>,
) -> Result<(Option<Value>, Option<HashMap<String, Vec<String>>>)> {
    let mut merged_labels = HashMap::new();

    let normalized_payload = match payload {
        Some(Value::Object(map)) => {
            let mut normalized = serde_json::Map::new();
            for (key, value) in map {
                if let Some((raw_value, labels)) = extract_labeled_value(&value) {
                    normalized.insert(key.clone(), raw_value);
                    if !labels.is_empty() {
                        merged_labels.insert(key, labels);
                    }
                } else {
                    normalized.insert(key, value);
                }
            }
            Some(Value::Object(normalized))
        }
        Some(value) => {
            if payload_labels.is_some() {
                return Err(Error::Transport(
                    "payload_labels requires payload to be an object".to_string(),
                ));
            }
            Some(value)
        }
        None => {
            if payload_labels.is_some() {
                return Err(Error::Transport(
                    "payload_labels requires payload to be an object".to_string(),
                ));
            }
            None
        }
    };

    if let Some(explicit_labels) = normalize_label_map(payload_labels) {
        let payload_object = normalized_payload
            .as_ref()
            .and_then(Value::as_object)
            .ok_or_else(|| {
                Error::Transport("payload_labels requires payload to be an object".to_string())
            })?;

        for (field, labels) in explicit_labels {
            if !payload_object.contains_key(&field) {
                return Err(Error::Transport(format!(
                    "payload_labels contains unknown field: {field}"
                )));
            }

            merged_labels
                .entry(field)
                .and_modify(|existing| merge_label_vec(existing, &labels))
                .or_insert(labels);
        }
    }

    Ok((
        normalized_payload,
        if merged_labels.is_empty() {
            None
        } else {
            Some(merged_labels)
        },
    ))
}

fn extract_labeled_value(value: &Value) -> Option<(Value, Vec<String>)> {
    let object = value.as_object()?;
    let marker = object
        .get("__mlld_labeled_value__")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !marker {
        return None;
    }

    let raw_value = object.get("value")?.clone();
    let raw_labels = object.get("labels")?.as_array()?;
    let labels = normalize_labels(raw_labels.iter().filter_map(Value::as_str));
    Some((raw_value, labels))
}

fn merge_label_vec(existing: &mut Vec<String>, incoming: &[String]) {
    let mut seen: std::collections::HashSet<String> = existing.iter().cloned().collect();
    for label in incoming {
        if seen.insert(label.clone()) {
            existing.push(label.clone());
        }
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

fn terminal_error_from_payload(payload: &Value) -> TerminalError {
    let message = payload
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("mlld request failed")
        .to_string();

    let code = payload
        .get("code")
        .and_then(Value::as_str)
        .map(ToString::to_string);

    TerminalError::Mlld { message, code }
}

fn parse_state_write_event(event: &Value) -> Option<StateWrite> {
    if event.get("type").and_then(Value::as_str) != Some("state:write") {
        return None;
    }

    let write = event.get("write")?;
    let path = write.get("path")?.as_str()?.to_string();

    Some(StateWrite {
        path,
        value: decode_state_write_value(write.get("value").cloned().unwrap_or(Value::Null)),
        timestamp: write
            .get("timestamp")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        security: write.get("security").cloned(),
    })
}

fn parse_session_write_event(event: &Value) -> Option<SessionWrite> {
    if event.get("type").and_then(Value::as_str) != Some("session_write") {
        return None;
    }

    let payload = event.get("session_write")?;
    Some(SessionWrite {
        frame_id: payload.get("frame_id")?.as_str()?.to_string(),
        session_name: payload.get("session_name")?.as_str()?.to_string(),
        declaration_id: payload.get("declaration_id")?.as_str()?.to_string(),
        origin_path: payload
            .get("origin_path")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        slot_path: payload.get("slot_path")?.as_str()?.to_string(),
        operation: payload.get("operation")?.as_str()?.to_string(),
        prev: payload.get("prev").cloned(),
        next: payload.get("next").cloned(),
    })
}

fn parse_guard_denial_event(event: &Value) -> Option<GuardDenial> {
    if event.get("type").and_then(Value::as_str) != Some("guard_denial") {
        return None;
    }

    guard_denial_from_payload(event.get("guard_denial")?)
}

fn guard_denial_from_payload(payload: &Value) -> Option<GuardDenial> {
    let operation = payload.get("operation")?.as_str()?.to_string();
    let reason = payload.get("reason")?.as_str()?.to_string();

    Some(GuardDenial {
        guard: payload
            .get("guard")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        operation,
        reason,
        rule: payload
            .get("rule")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        labels: payload
            .get("labels")
            .and_then(Value::as_array)
            .map(|labels| {
                labels
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default(),
        args: payload.get("args").cloned().filter(Value::is_object),
    })
}

fn looks_like_json_composite(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.len() < 2 {
        return false;
    }

    (trimmed.starts_with('{') && trimmed.ends_with('}'))
        || (trimmed.starts_with('[') && trimmed.ends_with(']'))
}

fn decode_state_write_value(value: Value) -> Value {
    let Value::String(text) = &value else {
        return value;
    };

    if !looks_like_json_composite(text) {
        return value;
    }

    serde_json::from_str(text).unwrap_or(value)
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

fn merge_guard_denials(primary: Vec<GuardDenial>, secondary: Vec<GuardDenial>) -> Vec<GuardDenial> {
    if secondary.is_empty() {
        return primary;
    }
    if primary.is_empty() {
        return secondary;
    }

    let mut merged = Vec::with_capacity(primary.len() + secondary.len());
    let mut seen = std::collections::HashSet::new();

    for denial in primary.into_iter().chain(secondary.into_iter()) {
        let key = guard_denial_key(&denial);
        if seen.insert(key) {
            merged.push(denial);
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

fn guard_denial_key(denial: &GuardDenial) -> String {
    let mut labels = denial.labels.clone();
    labels.sort();

    serde_json::json!({
        "guard": denial.guard,
        "operation": denial.operation,
        "reason": denial.reason,
        "rule": denial.rule,
        "labels": labels,
        "args": denial.args
    })
    .to_string()
}

fn decode_file_verify_result(result: Value) -> Result<FileVerifyResult> {
    serde_json::from_value(result).map_err(Error::Json)
}

fn build_fs_status_request(
    glob: Option<&str>,
    opts: Option<FsStatusOptions>,
    default_timeout: Option<Duration>,
) -> (&'static str, Value, Option<Duration>) {
    let opts = opts.unwrap_or_default();
    let mut params = serde_json::Map::new();

    if let Some(glob) = glob.filter(|value| !value.trim().is_empty()) {
        params.insert("glob".to_string(), Value::String(glob.to_string()));
    }
    if let Some(base_path) = opts.base_path {
        params.insert("basePath".to_string(), Value::String(base_path));
    }

    (
        "fs:status",
        Value::Object(params),
        opts.timeout.or(default_timeout),
    )
}

fn build_sign_request(
    path: &str,
    opts: Option<SignOptions>,
    default_timeout: Option<Duration>,
) -> (&'static str, Value, Option<Duration>) {
    let opts = opts.unwrap_or_default();
    let mut params = serde_json::Map::new();
    params.insert("path".to_string(), Value::String(path.to_string()));

    if let Some(identity) = opts.identity {
        params.insert("identity".to_string(), Value::String(identity));
    }
    if let Some(metadata) = opts.metadata {
        params.insert("metadata".to_string(), metadata);
    }
    if let Some(base_path) = opts.base_path {
        params.insert("basePath".to_string(), Value::String(base_path));
    }

    (
        "sig:sign",
        Value::Object(params),
        opts.timeout.or(default_timeout),
    )
}

fn build_verify_request(
    path: &str,
    opts: Option<VerifyOptions>,
    default_timeout: Option<Duration>,
) -> (&'static str, Value, Option<Duration>) {
    let opts = opts.unwrap_or_default();
    let mut params = serde_json::Map::new();
    params.insert("path".to_string(), Value::String(path.to_string()));

    if let Some(base_path) = opts.base_path {
        params.insert("basePath".to_string(), Value::String(base_path));
    }

    (
        "sig:verify",
        Value::Object(params),
        opts.timeout.or(default_timeout),
    )
}

fn build_sign_content_request(
    content: &str,
    identity: &str,
    opts: Option<SignContentOptions>,
    default_timeout: Option<Duration>,
) -> (&'static str, Value, Option<Duration>) {
    let opts = opts.unwrap_or_default();
    let mut params = serde_json::Map::new();
    params.insert("content".to_string(), Value::String(content.to_string()));
    params.insert("identity".to_string(), Value::String(identity.to_string()));

    if let Some(metadata) = opts.metadata {
        params.insert("metadata".to_string(), json!(metadata));
    }
    if let Some(signature_id) = opts.signature_id {
        params.insert("id".to_string(), Value::String(signature_id));
    }
    if let Some(base_path) = opts.base_path {
        params.insert("basePath".to_string(), Value::String(base_path));
    }

    (
        "sig:sign-content",
        Value::Object(params),
        opts.timeout.or(default_timeout),
    )
}

fn build_process_request(
    script: &str,
    opts: Option<ProcessOptions>,
    default_timeout: Option<Duration>,
) -> Result<(&'static str, Value, Option<Duration>)> {
    let opts = opts.unwrap_or_default();
    let (payload, payload_labels) =
        normalize_payload_and_labels(opts.payload, opts.payload_labels)?;
    let mut params = serde_json::Map::new();
    params.insert("script".to_string(), Value::String(script.to_string()));
    params.insert("recordEffects".to_string(), Value::Bool(true));

    if let Some(file_path) = opts.file_path {
        params.insert("filePath".to_string(), Value::String(file_path));
    }
    if let Some(payload) = payload {
        params.insert("payload".to_string(), payload);
    }
    if let Some(payload_labels) = payload_labels {
        params.insert(
            "payloadLabels".to_string(),
            serde_json::to_value(payload_labels)?,
        );
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
    if let Some(mcp_servers) = normalize_string_map(opts.mcp_servers) {
        params.insert("mcpServers".to_string(), serde_json::to_value(mcp_servers)?);
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

    Ok((
        "process",
        Value::Object(params),
        opts.timeout.or(default_timeout),
    ))
}

fn build_execute_request(
    filepath: &str,
    payload: Option<Value>,
    opts: Option<ExecuteOptions>,
    default_timeout: Option<Duration>,
) -> Result<(&'static str, Value, Option<Duration>)> {
    let opts = opts.unwrap_or_default();
    let (payload, payload_labels) = normalize_payload_and_labels(payload, opts.payload_labels)?;
    let mut params = serde_json::Map::new();
    params.insert("filepath".to_string(), Value::String(filepath.to_string()));
    params.insert("recordEffects".to_string(), Value::Bool(true));

    if let Some(payload) = payload {
        params.insert("payload".to_string(), payload);
    }
    if let Some(payload_labels) = payload_labels {
        params.insert(
            "payloadLabels".to_string(),
            serde_json::to_value(payload_labels)?,
        );
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
    if let Some(mcp_servers) = normalize_string_map(opts.mcp_servers) {
        params.insert("mcpServers".to_string(), serde_json::to_value(mcp_servers)?);
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
    if let Some(trace) = opts.trace {
        params.insert("trace".to_string(), Value::String(trace));
    }
    if let Some(trace_file) = opts.trace_file {
        params.insert("traceFile".to_string(), Value::String(trace_file));
    }

    Ok((
        "execute",
        Value::Object(params),
        opts.timeout.or(default_timeout),
    ))
}

/// Options for process().
#[derive(Debug, Default, Clone)]
pub struct ProcessOptions {
    /// Provides context for relative imports.
    pub file_path: Option<String>,

    /// Data injected as @payload.
    pub payload: Option<Value>,

    /// Per-field security labels for @payload object fields.
    pub payload_labels: Option<HashMap<String, Vec<String>>>,

    /// Data injected as @state.
    pub state: Option<Value>,

    /// Additional modules to inject.
    pub dynamic_modules: Option<HashMap<String, Value>>,

    /// Source label added to dynamic modules.
    pub dynamic_module_source: Option<String>,

    /// Logical MCP server names mapped to commands.
    pub mcp_servers: Option<HashMap<String, String>>,

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
    /// Per-field security labels for @payload object fields.
    pub payload_labels: Option<HashMap<String, Vec<String>>>,

    /// Data injected as @state.
    pub state: Option<Value>,

    /// Additional modules to inject.
    pub dynamic_modules: Option<HashMap<String, Value>>,

    /// Source label added to dynamic modules.
    pub dynamic_module_source: Option<String>,

    /// Logical MCP server names mapped to commands.
    pub mcp_servers: Option<HashMap<String, String>>,

    /// Parsing mode (strict|markdown).
    pub mode: Option<String>,

    /// Allow absolute path access.
    pub allow_absolute_paths: Option<bool>,

    /// Runtime effect tracing: off|effects|verbose.
    pub trace: Option<String>,

    /// Write runtime trace events as JSONL.
    pub trace_file: Option<String>,

    /// Override the client default timeout.
    pub timeout: Option<Duration>,
}

/// Options for fs_status().
#[derive(Debug, Default, Clone)]
pub struct FsStatusOptions {
    /// Project-relative resolution base.
    pub base_path: Option<String>,

    /// Override the client default timeout.
    pub timeout: Option<Duration>,
}

/// Options for sign().
#[derive(Debug, Default, Clone)]
pub struct SignOptions {
    /// Optional signer identity override.
    pub identity: Option<String>,

    /// Optional signature metadata.
    pub metadata: Option<Value>,

    /// Project-relative resolution base.
    pub base_path: Option<String>,

    /// Override the client default timeout.
    pub timeout: Option<Duration>,
}

/// Options for verify().
#[derive(Debug, Default, Clone)]
pub struct VerifyOptions {
    /// Project-relative resolution base.
    pub base_path: Option<String>,

    /// Override the client default timeout.
    pub timeout: Option<Duration>,
}

/// Options for sign_content().
#[derive(Debug, Default, Clone)]
pub struct SignContentOptions {
    /// Optional persisted metadata.
    pub metadata: Option<HashMap<String, String>>,

    /// Optional stable content signature identifier.
    pub signature_id: Option<String>,

    /// Project-relative resolution base.
    pub base_path: Option<String>,

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
    pub sessions: Vec<SessionFinalState>,

    #[serde(default)]
    pub exports: Value,

    #[serde(default)]
    pub effects: Vec<Effect>,

    #[serde(default)]
    pub denials: Vec<GuardDenial>,

    #[serde(default)]
    pub trace_events: Vec<TraceEvent>,

    pub metrics: Option<Metrics>,
}

/// Structured runtime trace event.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TraceEvent {
    pub ts: String,
    pub level: String,
    pub category: String,
    pub event: String,
    #[serde(default)]
    pub scope: Value,
    #[serde(default)]
    pub data: Value,
}

/// An output effect from execution.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Effect {
    #[serde(rename = "type")]
    pub effect_type: String,
    pub content: Option<String>,
    pub security: Option<Value>,
}

/// Structured information about a denied guard/policy decision.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct GuardDenial {
    pub guard: Option<String>,
    pub operation: String,
    pub reason: String,
    pub rule: Option<String>,

    #[serde(default)]
    pub labels: Vec<String>,

    pub args: Option<Value>,
}

/// An event from an in-flight execution.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HandleEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub state_write: Option<StateWrite>,
    pub session_write: Option<SessionWrite>,
    pub guard_denial: Option<GuardDenial>,
}

impl HandleEvent {
    fn state_write(state_write: StateWrite) -> Self {
        Self {
            event_type: "state_write".to_string(),
            state_write: Some(state_write),
            session_write: None,
            guard_denial: None,
        }
    }

    fn session_write(session_write: SessionWrite) -> Self {
        Self {
            event_type: "session_write".to_string(),
            state_write: None,
            session_write: Some(session_write),
            guard_denial: None,
        }
    }

    fn guard_denial(guard_denial: GuardDenial) -> Self {
        Self {
            event_type: "guard_denial".to_string(),
            state_write: None,
            session_write: None,
            guard_denial: Some(guard_denial),
        }
    }

    fn complete() -> Self {
        Self {
            event_type: "complete".to_string(),
            state_write: None,
            session_write: None,
            guard_denial: None,
        }
    }
}

/// A write to the state:// protocol.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct StateWrite {
    pub path: String,
    pub value: Value,
    pub timestamp: Option<String>,
    pub security: Option<Value>,
}

/// A streamed session write notification.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SessionWrite {
    pub frame_id: String,
    pub session_name: String,
    pub declaration_id: String,
    pub origin_path: Option<String>,
    pub slot_path: String,
    pub operation: String,
    pub prev: Option<Value>,
    pub next: Option<Value>,
}

/// Final state for an attached session frame.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionFinalState {
    pub frame_id: String,
    pub declaration_id: String,
    pub name: String,
    pub origin_path: Option<String>,
    #[serde(default)]
    pub final_state: Value,
}

/// Execution statistics.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metrics {
    pub total_ms: f64,
    pub parse_ms: f64,
    pub evaluate_ms: f64,
}

/// Signature status for a file.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FilesystemStatus {
    pub path: String,
    pub relative_path: String,
    pub status: String,
    pub verified: bool,
    pub signer: Option<String>,

    #[serde(default)]
    pub labels: Vec<String>,

    #[serde(default)]
    pub taint: Vec<String>,

    pub signed_at: Option<String>,
    pub error: Option<String>,
}

/// Signature verification metadata for a file.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileVerifyResult {
    pub path: String,
    pub relative_path: String,
    pub status: String,
    pub verified: bool,
    pub signer: Option<String>,
    pub signed_at: Option<String>,
    pub hash: Option<String>,
    pub expected_hash: Option<String>,
    pub metadata: Option<Value>,
    pub error: Option<String>,
}

/// Persistent signature metadata for signed content.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentSignature {
    pub id: String,
    pub hash: String,
    pub algorithm: String,
    pub signed_by: String,
    pub signed_at: String,
    pub content_length: usize,
    pub metadata: Option<HashMap<String, String>>,
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
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Guard {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub timing: String,
    #[serde(default, alias = "label")]
    pub trigger: String,
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

/// Return filesystem signature/integrity status for tracked files.
pub fn fs_status(
    glob: Option<&str>,
    opts: Option<FsStatusOptions>,
) -> Result<Vec<FilesystemStatus>> {
    default_client().fs_status(glob, opts)
}

/// Sign a file and return its verification status.
pub fn sign(path: &str, opts: Option<SignOptions>) -> Result<FileVerifyResult> {
    default_client().sign(path, opts)
}

/// Verify a file and return its signature status.
pub fn verify(path: &str, opts: Option<VerifyOptions>) -> Result<FileVerifyResult> {
    default_client().verify(path, opts)
}

/// Sign runtime content and persist it in the project's content store.
pub fn sign_content(
    content: &str,
    identity: &str,
    opts: Option<SignContentOptions>,
) -> Result<ContentSignature> {
    default_client().sign_content(content, identity, opts)
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
    fn test_next_event_state_write_roundtrip() {
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
                "output \"ping\" to \"state://pending\"\nloop(600, 50ms) until @state.result [\n  continue\n]\nshow @state.result",
                Some(ProcessOptions {
                    state: Some(json!({ "pending": null, "result": null })),
                    timeout: Some(Duration::from_secs(10)),
                    ..Default::default()
                }),
            )
            .expect("start process request succeeds");

        let event = handle
            .next_event(Some(Duration::from_secs(5)))
            .expect("next_event succeeds")
            .expect("state_write event");
        assert_eq!(event.event_type, "state_write");
        assert_eq!(
            event.state_write.as_ref().map(|write| write.path.as_str()),
            Some("pending")
        );
        assert_eq!(
            event.state_write.as_ref().map(|write| write.value.clone()),
            Some(json!("ping"))
        );

        handle
            .update_state("result", "pong")
            .expect("state update succeeds");

        let event = handle
            .next_event(Some(Duration::from_secs(5)))
            .expect("complete next_event succeeds")
            .expect("complete event");
        assert_eq!(event.event_type, "complete");
        assert!(handle
            .next_event(Some(Duration::from_millis(100)))
            .expect("post-complete next_event succeeds")
            .is_none());

        let output = handle.result().expect("result succeeds");
        assert!(output.contains("pong"));
        assert!(handle
            .next_event(Some(Duration::from_millis(100)))
            .expect("post-result next_event succeeds")
            .is_none());

        client.close();
    }

    #[test]
    fn test_next_event_returns_guard_denial_before_completion() {
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
                "/guard @blocker before op:exe = when [\n  @mx.op.name == \"send\" => deny \"recipient not authorized\"\n  * => allow\n]\n/exe @send(value) = when [\n  denied => \"blocked\"\n  * => @value\n]\n/show @send(\"hello\")\n",
                Some(ProcessOptions {
                    mode: Some("markdown".to_string()),
                    timeout: Some(Duration::from_secs(5)),
                    ..Default::default()
                }),
            )
            .expect("start guarded process request succeeds");

        let event = handle
            .next_event(Some(Duration::from_secs(5)))
            .expect("next_event succeeds")
            .expect("guard_denial event");
        assert_eq!(event.event_type, "guard_denial");
        let denial = event.guard_denial.expect("guard_denial payload");
        assert_eq!(denial.operation, "send");
        assert_eq!(denial.reason, "recipient not authorized");
        assert_eq!(denial.args, Some(json!({ "value": "hello" })));

        let event = handle
            .next_event(Some(Duration::from_secs(5)))
            .expect("complete next_event succeeds")
            .expect("complete event");
        assert_eq!(event.event_type, "complete");

        let output = handle.result().expect("result succeeds");
        assert!(output.contains("blocked"));

        client.close();
    }

    #[test]
    fn test_sdk_labels_flow_through_payload_and_state_updates() {
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

        let mut payload_labels = HashMap::new();
        payload_labels.insert("history".to_string(), vec!["untrusted".to_string()]);

        let mut handle = client
            .process_async(
                "loop(99999, 50ms) until @state.exit [\n  continue\n]\nshow @payload.history.mx.labels.includes(\"untrusted\")\nshow @state.tool_result.mx.labels.includes(\"untrusted\")\nshow @state.tool_result",
                Some(ProcessOptions {
                    payload: Some(json!({ "history": "tool transcript" })),
                    payload_labels: Some(payload_labels),
                    state: Some(json!({ "exit": false, "tool_result": null })),
                    mode: Some("strict".to_string()),
                    timeout: Some(Duration::from_secs(10)),
                    ..Default::default()
                }),
            )
            .expect("start labeled process request succeeds");

        std::thread::sleep(Duration::from_millis(120));
        handle
            .update_state_with_labels("tool_result", "tool output", ["untrusted"])
            .expect("labeled state update succeeds");
        handle
            .update_state("exit", true)
            .expect("exit state update succeeds");

        let output = handle.result().expect("labeled process succeeds");
        let lines = output
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>();
        assert_eq!(lines, vec!["true", "true", "tool output"]);

        client.close();
    }

    #[test]
    fn test_execute_handle_write_file_creates_signed_output_with_provenance() {
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

        let root = std::env::temp_dir().join(format!(
            "mlld-rust-write-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("current time after epoch")
                .as_nanos()
        ));
        fs::create_dir_all(root.join("routes")).expect("create routes dir");
        fs::write(root.join("package.json"), "{}").expect("write package.json");

        let script_path = root.join("routes").join("route.mld");
        fs::write(
            &script_path,
            "loop(99999, 50ms) until @state.exit [\n  continue\n]\nshow \"done\"",
        )
        .expect("write route script");

        let mut handle = client
            .execute_async(
                script_path.to_string_lossy().as_ref(),
                Option::<Value>::None,
                Some(ExecuteOptions {
                    state: Some(json!({ "exit": false })),
                    timeout: Some(Duration::from_secs(10)),
                    ..Default::default()
                }),
            )
            .expect("start execute request succeeds");

        let write_result = handle
            .write_file("out.txt", "hello from sdk", Some(Duration::from_secs(5)))
            .expect("write_file succeeds");

        let written_path = root.join("routes").join("out.txt");
        assert_eq!(write_result.path, written_path.to_string_lossy());
        assert_eq!(write_result.status, "verified");
        assert!(write_result.verified);
        assert_eq!(write_result.signer.as_deref(), Some("agent:route"));
        assert_eq!(
            fs::read_to_string(&written_path).expect("read written file"),
            "hello from sdk"
        );

        let metadata = write_result.metadata.expect("write metadata");
        assert_eq!(
            metadata
                .get("taint")
                .and_then(Value::as_array)
                .and_then(|labels| labels.first())
                .and_then(Value::as_str),
            Some("untrusted")
        );
        let provenance = metadata
            .get("provenance")
            .and_then(Value::as_object)
            .expect("provenance metadata");
        assert_eq!(
            provenance.get("sourceType").and_then(Value::as_str),
            Some("mlld_execution")
        );
        let request_id = handle.request_id().to_string();
        assert_eq!(
            provenance.get("sourceId").and_then(Value::as_str),
            Some(request_id.as_str())
        );
        assert_eq!(
            provenance.get("scriptPath").and_then(Value::as_str),
            Some(script_path.to_string_lossy().as_ref())
        );

        handle
            .update_state("exit", true)
            .expect("exit state update succeeds");
        let final_result = handle.result().expect("execute result succeeds");
        assert!(final_result.output.contains("done"));

        let error = handle
            .write_file("late.txt", "too late", Some(Duration::from_secs(1)))
            .expect_err("write_file after completion fails");

        match error {
            Error::Mlld {
                code: Some(code), ..
            } => assert_eq!(code, "REQUEST_NOT_FOUND"),
            other => panic!("expected REQUEST_NOT_FOUND error, got {other:?}"),
        }

        client.close();
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn test_sign_verify_sign_content_and_fs_status_roundtrip() {
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

        let root = std::env::temp_dir().join(format!(
            "mlld-rust-sig-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("current time after epoch")
                .as_nanos()
        ));
        fs::create_dir_all(root.join("docs")).expect("create docs dir");
        fs::write(root.join("package.json"), "{}").expect("write package.json");
        fs::write(root.join("docs").join("note.txt"), "hello from rust sdk").expect("write note");

        let signed = client
            .sign(
                "docs/note.txt",
                Some(SignOptions {
                    identity: Some("user:alice".to_string()),
                    metadata: Some(json!({ "purpose": "sdk" })),
                    base_path: Some(root.to_string_lossy().to_string()),
                    timeout: Some(Duration::from_secs(10)),
                }),
            )
            .expect("sign succeeds");

        let verified = client
            .verify(
                "docs/note.txt",
                Some(VerifyOptions {
                    base_path: Some(root.to_string_lossy().to_string()),
                    timeout: Some(Duration::from_secs(10)),
                }),
            )
            .expect("verify succeeds");

        let content_signature = client
            .sign_content(
                "signed body",
                "user:alice",
                Some(SignContentOptions {
                    metadata: Some(HashMap::from([("channel".to_string(), "sdk".to_string())])),
                    signature_id: Some("content-1".to_string()),
                    base_path: Some(root.to_string_lossy().to_string()),
                    timeout: Some(Duration::from_secs(10)),
                }),
            )
            .expect("sign_content succeeds");

        let statuses = client
            .fs_status(
                Some("docs/*.txt"),
                Some(FsStatusOptions {
                    base_path: Some(root.to_string_lossy().to_string()),
                    timeout: Some(Duration::from_secs(10)),
                }),
            )
            .expect("fs_status succeeds");

        assert_eq!(signed.status, "verified");
        assert!(signed.verified);
        assert_eq!(signed.signer.as_deref(), Some("user:alice"));
        assert_eq!(
            signed
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("purpose"))
                .and_then(Value::as_str),
            Some("sdk")
        );

        assert_eq!(verified.status, "verified");
        assert!(verified.verified);
        assert_eq!(verified.signer.as_deref(), Some("user:alice"));
        assert_eq!(
            verified
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("purpose"))
                .and_then(Value::as_str),
            Some("sdk")
        );

        assert_eq!(content_signature.id, "content-1");
        assert_eq!(content_signature.signed_by, "user:alice");
        assert_eq!(
            content_signature
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("channel"))
                .map(String::as_str),
            Some("sdk")
        );
        assert!(root
            .join(".sig")
            .join("content")
            .join("content-1.sig.json")
            .exists());
        assert!(root
            .join(".sig")
            .join("content")
            .join("content-1.sig.content")
            .exists());

        assert_eq!(statuses.len(), 1);
        assert_eq!(statuses[0].relative_path, "docs/note.txt");
        assert_eq!(statuses[0].status, "verified");
        assert_eq!(statuses[0].signer.as_deref(), Some("user:alice"));

        client.close();
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn test_sig_surface_request_builders() {
        let default_timeout = Some(Duration::from_secs(30));

        let (method, params, timeout) = build_fs_status_request(
            Some("docs/*.txt"),
            Some(FsStatusOptions {
                base_path: Some("/repo".to_string()),
                timeout: Some(Duration::from_secs(5)),
            }),
            default_timeout,
        );
        assert_eq!(method, "fs:status");
        assert_eq!(timeout, Some(Duration::from_secs(5)));
        assert_eq!(
            params,
            json!({
                "glob": "docs/*.txt",
                "basePath": "/repo"
            })
        );

        let (method, params, timeout) = build_sign_request(
            "docs/a.txt",
            Some(SignOptions {
                identity: Some("user:alice".to_string()),
                metadata: Some(json!({ "purpose": "sdk" })),
                base_path: Some("/repo".to_string()),
                timeout: Some(Duration::from_secs(6)),
            }),
            default_timeout,
        );
        assert_eq!(method, "sig:sign");
        assert_eq!(timeout, Some(Duration::from_secs(6)));
        assert_eq!(
            params,
            json!({
                "path": "docs/a.txt",
                "identity": "user:alice",
                "metadata": { "purpose": "sdk" },
                "basePath": "/repo"
            })
        );

        let (method, params, timeout) = build_verify_request(
            "docs/a.txt",
            Some(VerifyOptions {
                base_path: Some("/repo".to_string()),
                timeout: None,
            }),
            default_timeout,
        );
        assert_eq!(method, "sig:verify");
        assert_eq!(timeout, default_timeout);
        assert_eq!(
            params,
            json!({
                "path": "docs/a.txt",
                "basePath": "/repo"
            })
        );

        let (method, params, timeout) = build_sign_content_request(
            "hello world",
            "user:alice",
            Some(SignContentOptions {
                metadata: Some(HashMap::from([("channel".to_string(), "sdk".to_string())])),
                signature_id: Some("content-1".to_string()),
                base_path: Some("/repo".to_string()),
                timeout: Some(Duration::from_secs(7)),
            }),
            default_timeout,
        );
        assert_eq!(method, "sig:sign-content");
        assert_eq!(timeout, Some(Duration::from_secs(7)));
        assert_eq!(
            params,
            json!({
                "content": "hello world",
                "identity": "user:alice",
                "metadata": { "channel": "sdk" },
                "id": "content-1",
                "basePath": "/repo"
            })
        );
    }

    #[test]
    fn test_process_and_execute_request_builders_handle_mcp_servers_and_labeled_payloads() {
        let default_timeout = Some(Duration::from_secs(30));
        let mut explicit_labels = HashMap::new();
        explicit_labels.insert(
            "query".to_string(),
            vec!["extra".to_string(), "trusted".to_string()],
        );
        let mut mcp_servers = HashMap::new();
        mcp_servers.insert(
            "tools".to_string(),
            "uv run python3 mcp_server.py".to_string(),
        );

        let (method, params, timeout) = build_process_request(
            "show @payload.history",
            Some(ProcessOptions {
                file_path: Some("/repo/agent.mld".to_string()),
                payload: Some(json!({
                    "history": untrusted(json!("tool transcript")),
                    "query": trusted(json!("hello")),
                    "plain": "keep me"
                })),
                payload_labels: Some(explicit_labels),
                dynamic_module_source: Some("sdk".to_string()),
                mcp_servers: Some(mcp_servers.clone()),
                allow_absolute_paths: Some(true),
                timeout: Some(Duration::from_secs(5)),
                ..Default::default()
            }),
            default_timeout,
        )
        .expect("build_process_request succeeds");
        assert_eq!(method, "process");
        assert_eq!(timeout, Some(Duration::from_secs(5)));
        assert_eq!(
            params,
            json!({
                "script": "show @payload.history",
                "recordEffects": true,
                "filePath": "/repo/agent.mld",
                "payload": {
                    "history": "tool transcript",
                    "query": "hello",
                    "plain": "keep me"
                },
                "payloadLabels": {
                    "history": ["untrusted"],
                    "query": ["trusted", "extra"]
                },
                "dynamicModuleSource": "sdk",
                "mcpServers": { "tools": "uv run python3 mcp_server.py" },
                "allowAbsolutePaths": true
            })
        );

        let (method, params, timeout) = build_execute_request(
            "/repo/agent.mld",
            Some(json!({
                "history": untrusted(json!("tool transcript"))
            })),
            Some(ExecuteOptions {
                payload_labels: Some(HashMap::from([(
                    "history".to_string(),
                    vec!["trusted".to_string()],
                )])),
                mcp_servers: Some(mcp_servers),
                timeout: Some(Duration::from_secs(6)),
                ..Default::default()
            }),
            default_timeout,
        )
        .expect("build_execute_request succeeds");
        assert_eq!(method, "execute");
        assert_eq!(timeout, Some(Duration::from_secs(6)));
        assert_eq!(
            params,
            json!({
                "filepath": "/repo/agent.mld",
                "recordEffects": true,
                "payload": { "history": "tool transcript" },
                "payloadLabels": { "history": ["untrusted", "trusted"] },
                "mcpServers": { "tools": "uv run python3 mcp_server.py" }
            })
        );
    }

    #[test]
    fn test_request_builders_reject_invalid_payload_labels() {
        let err = build_execute_request(
            "/repo/agent.mld",
            Some(json!("hello")),
            Some(ExecuteOptions {
                payload_labels: Some(HashMap::from([(
                    "text".to_string(),
                    vec!["trusted".to_string()],
                )])),
                ..Default::default()
            }),
            Some(Duration::from_secs(30)),
        )
        .expect_err("non-object payload with payload_labels should fail");
        match err {
            Error::Transport(message) => assert!(message.contains("payload_labels")),
            other => panic!("expected transport error, got {other:?}"),
        }

        let err = build_execute_request(
            "/repo/agent.mld",
            Some(json!({ "text": "hello" })),
            Some(ExecuteOptions {
                payload_labels: Some(HashMap::from([(
                    "missing".to_string(),
                    vec!["untrusted".to_string()],
                )])),
                ..Default::default()
            }),
            Some(Duration::from_secs(30)),
        )
        .expect_err("unknown payload_labels field should fail");
        match err {
            Error::Transport(message) => assert!(message.contains("unknown field")),
            other => panic!("expected transport error, got {other:?}"),
        }
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
                    timeout: Some(Duration::from_secs(2)),
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

    #[test]
    fn test_execute_result_fixture_preserves_security() {
        let fixture = read_fixture("execute-result.json");
        let result: ExecuteResult =
            serde_json::from_value(fixture["result"].clone()).expect("decode execute fixture");

        assert_eq!(result.state_writes.len(), 1);
        assert_eq!(result.sessions.len(), 1);
        assert_eq!(result.sessions[0].name, "planner");
        assert_eq!(
            result.sessions[0]
                .final_state
                .get("status")
                .and_then(Value::as_str),
            Some("done")
        );
        assert_eq!(
            result.state_writes[0]
                .security
                .as_ref()
                .and_then(|security| security.get("labels"))
                .and_then(Value::as_array)
                .and_then(|labels| labels.first())
                .and_then(Value::as_str),
            Some("trusted")
        );
        assert_eq!(
            result.effects[0]
                .security
                .as_ref()
                .and_then(|security| security.get("labels"))
                .and_then(Value::as_array)
                .and_then(|labels| labels.first())
                .and_then(Value::as_str),
            Some("trusted")
        );
    }

    #[test]
    fn test_analyze_result_fixture_uses_trigger() {
        let fixture = read_fixture("analyze-result.json");
        let result: AnalyzeResult =
            serde_json::from_value(fixture["result"].clone()).expect("decode analyze fixture");

        assert_eq!(result.guards.len(), 2);
        assert_eq!(result.guards[0].trigger, "secret");
        assert_eq!(result.guards[1].name, "");
        assert_eq!(result.guards[1].trigger, "net:w");
    }

    #[test]
    fn test_state_write_event_fixture_preserves_security() {
        let fixture = read_fixture("state-write-event.json");
        let state_write =
            parse_state_write_event(&fixture["event"]).expect("decode state-write fixture");

        assert_eq!(state_write.path, "payload");
        assert_eq!(
            state_write
                .security
                .as_ref()
                .and_then(|security| security.get("labels"))
                .and_then(Value::as_array)
                .and_then(|labels| labels.first())
                .and_then(Value::as_str),
            Some("trusted")
        );
    }

    #[test]
    fn test_session_write_event_fixture_preserves_fields() {
        let fixture = read_fixture("session-write-event.json");
        let session_write =
            parse_session_write_event(&fixture["event"]).expect("decode session-write fixture");

        assert_eq!(session_write.session_name, "planner");
        assert_eq!(session_write.slot_path, "count");
        assert_eq!(session_write.operation, "increment");
        assert_eq!(session_write.prev.as_ref().and_then(Value::as_i64), Some(1));
        assert_eq!(session_write.next.as_ref().and_then(Value::as_i64), Some(2));
    }

    #[test]
    fn test_error_fixture_decodes_transport_error() {
        let fixture = read_fixture("error-result.json");
        let error = error_from_payload(&fixture["error"]);

        match error {
            Error::Mlld {
                code: Some(code),
                message,
            } => {
                assert_eq!(code, "TIMEOUT");
                assert!(message.contains("timeout"));
            }
            other => panic!("expected mlld error, got {other:?}"),
        }
    }

    #[test]
    fn test_sign_result_fixture_decodes_file_verify_result() {
        let fixture = read_fixture("sign-result.json");
        let result: FileVerifyResult =
            serde_json::from_value(fixture["result"].clone()).expect("decode sign fixture");

        assert_eq!(result.relative_path, "docs/a.txt");
        assert_eq!(result.expected_hash.as_deref(), Some("sha256:abc"));
        assert_eq!(
            result
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("purpose"))
                .and_then(Value::as_str),
            Some("sdk")
        );
    }

    #[test]
    fn test_fs_status_fixture_decodes_filesystem_statuses() {
        let fixture = read_fixture("fs-status-result.json");
        let statuses: Vec<FilesystemStatus> =
            serde_json::from_value(fixture["result"].clone()).expect("decode fs-status fixture");

        assert_eq!(statuses.len(), 1);
        assert_eq!(statuses[0].relative_path, "docs/a.txt");
        assert_eq!(statuses[0].labels, vec!["trusted".to_string()]);
        assert_eq!(statuses[0].taint, vec!["secret".to_string()]);
    }

    #[test]
    fn test_sign_content_fixture_decodes_content_signature() {
        let fixture = read_fixture("sign-content-result.json");
        let signature: ContentSignature =
            serde_json::from_value(fixture["result"].clone()).expect("decode sign-content fixture");

        assert_eq!(signature.id, "content-1");
        assert_eq!(signature.signed_by, "user:alice");
        assert_eq!(
            signature
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("channel"))
                .map(String::as_str),
            Some("sdk")
        );
    }

    fn state_write_as_i64(value: &Value) -> Option<i64> {
        match value {
            Value::Number(number) => number.as_i64(),
            Value::String(text) => text.parse::<i64>().ok(),
            _ => None,
        }
    }

    fn read_fixture(name: &str) -> Value {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("fixtures")
            .join(name);
        let contents = fs::read_to_string(path).expect("read fixture");
        serde_json::from_str(&contents).expect("decode fixture")
    }
}
