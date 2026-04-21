# frozen_string_literal: true

require 'json'
require 'open3'
require 'thread'
require 'timeout'

module Mlld
  class Error < StandardError
    attr_reader :code, :returncode

    def initialize(message, code: nil, returncode: nil)
      super(message)
      @code = code
      @returncode = returncode
    end
  end

  StateWrite = Struct.new(:path, :value, :timestamp, :security, keyword_init: true)
  SessionWrite = Struct.new(
    :frame_id,
    :session_name,
    :declaration_id,
    :origin_path,
    :slot_path,
    :operation,
    :prev,
    :next,
    keyword_init: true
  )
  SessionFinalState = Struct.new(
    :frame_id,
    :declaration_id,
    :name,
    :origin_path,
    :final_state,
    keyword_init: true
  )
  Metrics = Struct.new(:total_ms, :parse_ms, :evaluate_ms, keyword_init: true)
  Effect = Struct.new(:type, :content, :security, keyword_init: true)
  GuardDenial = Struct.new(:guard, :operation, :reason, :rule, :labels, :args, keyword_init: true)
  TraceEvent = Struct.new(:ts, :level, :category, :event, :scope, :data, keyword_init: true)
  ExecuteResult = Struct.new(:output, :state_writes, :sessions, :exports, :effects, :denials, :trace_events, :metrics, keyword_init: true)
  HandleEvent = Struct.new(:type, :state_write, :session_write, :guard_denial, :trace_event, keyword_init: true)
  FilesystemStatus = Struct.new(
    :path,
    :relative_path,
    :status,
    :verified,
    :signer,
    :labels,
    :taint,
    :signed_at,
    :error,
    keyword_init: true
  )
  FileVerifyResult = Struct.new(
    :path,
    :relative_path,
    :status,
    :verified,
    :signer,
    :signed_at,
    :hash,
    :expected_hash,
    :metadata,
    :error,
    keyword_init: true
  )
  ContentSignature = Struct.new(
    :id,
    :hash,
    :algorithm,
    :signed_by,
    :signed_at,
    :content_length,
    :metadata,
    keyword_init: true
  )
  LabeledValue = Struct.new(:value, :labels, keyword_init: true)

  Executable = Struct.new(:name, :params, :labels, keyword_init: true)
  Import = Struct.new(:from, :names, keyword_init: true)
  Guard = Struct.new(:name, :timing, :trigger, keyword_init: true)
  Needs = Struct.new(:cmd, :node, :py, keyword_init: true)
  AnalysisError = Struct.new(:message, :line, :column, keyword_init: true)
  AnalyzeResult = Struct.new(
    :filepath,
    :valid,
    :errors,
    :executables,
    :exports,
    :imports,
    :guards,
    :needs,
    keyword_init: true
  )

  class BaseHandle
    attr_reader :request_id

    def initialize(client:, request_id:, response_queue:, timeout:)
      @client = client
      @request_id = request_id
      @response_queue = response_queue
      @timeout = timeout
      @mutex = Mutex.new
      @complete = false
      @complete_event_emitted = false
      @raw_result = nil
      @state_write_events = []
      @guard_denial_events = []
      @error = nil
    end

    def cancel
      return nil if @complete

      @client.send_cancel(@request_id)
    end

    def update_state(path, value, labels: nil, timeout: nil)
      raise Error.new('request already completed', code: 'REQUEST_COMPLETE') if @complete

      @client.send_state_update(@request_id, path, value, timeout || @timeout, labels: labels)
    end

    def next_event(timeout: nil)
      @mutex.synchronize do
        if @complete
          return nil if @complete_event_emitted || @error

          @complete_event_emitted = true
          return HandleEvent.new(type: 'complete')
        end

        effective_timeout = timeout.nil? ? @timeout : timeout
        deadline = effective_timeout ? Process.clock_gettime(Process::CLOCK_MONOTONIC) + effective_timeout : nil

        loop do
          entry = pop_response(deadline)
          return nil if entry.nil?

          kind, payload = entry

          case kind
          when :event
            state_write = @client.send(:state_write_from_event, payload)
            if state_write
              @state_write_events << state_write
              return HandleEvent.new(type: 'state_write', state_write: state_write)
            end

            session_write = @client.send(:session_write_from_event, payload)
            if session_write
              return HandleEvent.new(type: 'session_write', session_write: session_write)
            end

            guard_denial = @client.send(:guard_denial_from_event, payload)
            if guard_denial
              @guard_denial_events << guard_denial
              return HandleEvent.new(type: 'guard_denial', guard_denial: guard_denial)
            end

            trace_event = @client.send(:trace_event_from_event, payload)
            if trace_event
              return HandleEvent.new(type: 'trace_event', trace_event: trace_event)
            end
          when :transport_error
            @error = payload
            @complete = true
            @complete_event_emitted = true
            raise payload
          when :result
            error_payload = payload['error']
            if error_payload.is_a?(Hash)
              @error = @client.send(:error_from_payload, error_payload)
              @complete = true
              @complete_event_emitted = true
              raise @error
            end

            @raw_result = payload['result']
            @complete = true
            @complete_event_emitted = true
            return HandleEvent.new(type: 'complete')
          end
        end
      end
    end

    protected

    def await_raw
      @mutex.synchronize do
        unless @complete
          deadline = @timeout ? Process.clock_gettime(Process::CLOCK_MONOTONIC) + @timeout : nil

          loop do
            entry = pop_response(deadline)

            if entry.nil?
              @client.send_cancel(@request_id)
              @client.send(:remove_pending, @request_id)
              @error = Error.new("request timeout after #{@timeout}s", code: 'TIMEOUT')
              @complete = true
              @complete_event_emitted = true
              break
            end

            kind, payload = entry

            case kind
            when :event
              state_write = @client.send(:state_write_from_event, payload)
              @state_write_events << state_write if state_write
              session_write = @client.send(:session_write_from_event, payload)
              next if session_write

              guard_denial = @client.send(:guard_denial_from_event, payload)
              @guard_denial_events << guard_denial if guard_denial
            when :transport_error
              @error = payload
              @complete = true
              @complete_event_emitted = true
              break
            when :result
              error_payload = payload['error']
              if error_payload.is_a?(Hash)
                @error = @client.send(:error_from_payload, error_payload)
              else
                @raw_result = payload['result']
              end

              @complete = true
              @complete_event_emitted = true
              break
            end
          end
        end

        raise @error if @error
        raise Error.new('missing live result payload', code: 'TRANSPORT_ERROR') unless @raw_result

        [@raw_result, @state_write_events, @guard_denial_events]
      end
    end

    def pop_response(deadline)
      remaining = deadline ? deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC) : nil
      return nil if remaining && remaining <= 0

      if remaining
        Timeout.timeout(remaining) { @response_queue.pop }
      else
        @response_queue.pop
      end
    rescue Timeout::Error
      nil
    end
  end

  class ProcessHandle < BaseHandle
    def wait
      result
    end

    def result
      response, _, = await_raw
      if response.is_a?(Hash)
        output = response['output']
        return output.is_a?(String) ? output : output.to_s if response.key?('output')
      end

      response.nil? ? '' : response.to_s
    end
  end

  class ExecuteHandle < BaseHandle
    def wait
      result
    end

    def result
      response, state_write_events, guard_denial_events = await_raw
      @client.decode_execute_result(response, state_write_events, guard_denial_events)
    end

    def write_file(path, content, timeout: nil)
      raise Error.new('request already completed', code: 'REQUEST_COMPLETE') if @complete

      @client.send_file_write(@request_id, path, content, timeout || @timeout)
    end
  end

  class Client
    attr_accessor :command, :command_args, :timeout, :working_dir

    def initialize(command: 'mlld', command_args: nil, timeout: 30.0, working_dir: nil)
      @command = command
      @command_args = Array(command_args)
      @timeout = timeout
      @working_dir = working_dir

      @lock = Mutex.new
      @write_lock = Mutex.new
      @stdin = nil
      @stdout = nil
      @stderr = nil
      @wait_thr = nil
      @reader_thread = nil
      @stderr_thread = nil
      @stderr_lines = []
      @pending = {}
      @request_id = 0
    end

    def close
      stdin = nil
      stdout = nil
      stderr = nil
      wait_thr = nil
      reader_thread = nil
      stderr_thread = nil
      pending_queues = nil

      @lock.synchronize do
        stdin = @stdin
        stdout = @stdout
        stderr = @stderr
        wait_thr = @wait_thr
        reader_thread = @reader_thread
        stderr_thread = @stderr_thread
        pending_queues = @pending.values

        @stdin = nil
        @stdout = nil
        @stderr = nil
        @wait_thr = nil
        @reader_thread = nil
        @stderr_thread = nil
        @pending = {}
      end

      pending_queues&.each { |queue| queue << [:transport_error, Error.new('live transport closed', code: 'TRANSPORT_ERROR')] }

      begin
        stdin.close if stdin && !stdin.closed?
      rescue StandardError
      end

      if wait_thr&.alive?
        begin
          Process.kill('TERM', wait_thr.pid)
          Timeout.timeout(1) { wait_thr.value }
        rescue StandardError
          begin
            Process.kill('KILL', wait_thr.pid)
          rescue StandardError
          end
          begin
            wait_thr.value
          rescue StandardError
          end
        end
      end

      begin
        stdout.close if stdout && !stdout.closed?
      rescue StandardError
      end

      begin
        stderr.close if stderr && !stderr.closed?
      rescue StandardError
      end

      reader_thread&.join(1)
      stderr_thread&.join(1)
    end

    def process(
      script,
      file_path: nil,
      payload: nil,
      payload_labels: nil,
      mcp_servers: nil,
      state: nil,
      dynamic_modules: nil,
      dynamic_module_source: nil,
      mode: nil,
      allow_absolute_paths: nil,
      trace: nil,
      trace_file: nil,
      trace_stderr: nil,
      timeout: nil
    )
      process_async(
        script,
        file_path: file_path,
        payload: payload,
        payload_labels: payload_labels,
        mcp_servers: mcp_servers,
        state: state,
        dynamic_modules: dynamic_modules,
        dynamic_module_source: dynamic_module_source,
        mode: mode,
        allow_absolute_paths: allow_absolute_paths,
        trace: trace,
        trace_file: trace_file,
        trace_stderr: trace_stderr,
        timeout: timeout
      ).result
    end

    def process_async(
      script,
      file_path: nil,
      payload: nil,
      payload_labels: nil,
      mcp_servers: nil,
      state: nil,
      dynamic_modules: nil,
      dynamic_module_source: nil,
      mode: nil,
      allow_absolute_paths: nil,
      trace: nil,
      trace_file: nil,
      trace_stderr: nil,
      timeout: nil
    )
      params = build_process_request(
        script,
        file_path: file_path,
        payload: payload,
        payload_labels: payload_labels,
        mcp_servers: mcp_servers,
        state: state,
        dynamic_modules: dynamic_modules,
        dynamic_module_source: dynamic_module_source,
        mode: mode,
        allow_absolute_paths: allow_absolute_paths,
        trace: trace,
        trace_file: trace_file,
        trace_stderr: trace_stderr
      )
      request_id, response_queue = send_request('process', params)
      ProcessHandle.new(
        client: self,
        request_id: request_id,
        response_queue: response_queue,
        timeout: resolve_timeout(timeout)
      )
    end

    def execute(
      filepath,
      payload = nil,
      payload_labels: nil,
      mcp_servers: nil,
      state: nil,
      dynamic_modules: nil,
      dynamic_module_source: nil,
      allow_absolute_paths: nil,
      mode: nil,
      trace: nil,
      trace_file: nil,
      trace_stderr: nil,
      timeout: nil
    )
      execute_async(
        filepath,
        payload,
        payload_labels: payload_labels,
        mcp_servers: mcp_servers,
        state: state,
        dynamic_modules: dynamic_modules,
        dynamic_module_source: dynamic_module_source,
        allow_absolute_paths: allow_absolute_paths,
        mode: mode,
        trace: trace,
        trace_file: trace_file,
        trace_stderr: trace_stderr,
        timeout: timeout
      ).result
    end

    def execute_async(
      filepath,
      payload = nil,
      payload_labels: nil,
      mcp_servers: nil,
      state: nil,
      dynamic_modules: nil,
      dynamic_module_source: nil,
      allow_absolute_paths: nil,
      mode: nil,
      trace: nil,
      trace_file: nil,
      trace_stderr: nil,
      timeout: nil
    )
      params = build_execute_request(
        filepath,
        payload,
        payload_labels: payload_labels,
        mcp_servers: mcp_servers,
        state: state,
        dynamic_modules: dynamic_modules,
        dynamic_module_source: dynamic_module_source,
        allow_absolute_paths: allow_absolute_paths,
        mode: mode,
        trace: trace,
        trace_file: trace_file,
        trace_stderr: trace_stderr
      )
      request_id, response_queue = send_request('execute', params)
      ExecuteHandle.new(
        client: self,
        request_id: request_id,
        response_queue: response_queue,
        timeout: resolve_timeout(timeout)
      )
    end

    def analyze(filepath)
      result, = request('analyze', { 'filepath' => filepath }, nil)
      build_analyze_result(result, filepath)
    end

    def build_process_request(
      script,
      file_path: nil,
      payload: nil,
      payload_labels: nil,
      mcp_servers: nil,
      state: nil,
      dynamic_modules: nil,
      dynamic_module_source: nil,
      mode: nil,
      allow_absolute_paths: nil,
      trace: nil,
      trace_file: nil,
      trace_stderr: nil
    )
      normalized_payload, normalized_payload_labels = normalize_payload_and_labels(payload, payload_labels)
      normalized_mcp_servers = normalize_string_map(mcp_servers)

      params = { 'script' => script, 'recordEffects' => true }
      params['filePath'] = file_path if file_path
      params['payload'] = normalized_payload unless normalized_payload.nil?
      params['payloadLabels'] = normalized_payload_labels if normalized_payload_labels
      params['state'] = state if state
      params['dynamicModules'] = dynamic_modules if dynamic_modules
      params['dynamicModuleSource'] = dynamic_module_source if dynamic_module_source
      params['mcpServers'] = normalized_mcp_servers if normalized_mcp_servers
      params['mode'] = mode if mode
      params['allowAbsolutePaths'] = allow_absolute_paths unless allow_absolute_paths.nil?
      params['trace'] = trace if trace
      params['traceFile'] = trace_file if trace_file
      params['traceStderr'] = trace_stderr unless trace_stderr.nil?
      params
    end

    def build_execute_request(
      filepath,
      payload = nil,
      payload_labels: nil,
      mcp_servers: nil,
      state: nil,
      dynamic_modules: nil,
      dynamic_module_source: nil,
      allow_absolute_paths: nil,
      mode: nil,
      trace: nil,
      trace_file: nil,
      trace_stderr: nil
    )
      normalized_payload, normalized_payload_labels = normalize_payload_and_labels(payload, payload_labels)
      normalized_mcp_servers = normalize_string_map(mcp_servers)

      params = { 'filepath' => filepath, 'recordEffects' => true }
      params['payload'] = normalized_payload unless normalized_payload.nil?
      params['payloadLabels'] = normalized_payload_labels if normalized_payload_labels
      params['state'] = state if state
      params['dynamicModules'] = dynamic_modules if dynamic_modules
      params['dynamicModuleSource'] = dynamic_module_source if dynamic_module_source
      params['mcpServers'] = normalized_mcp_servers if normalized_mcp_servers
      params['allowAbsolutePaths'] = allow_absolute_paths unless allow_absolute_paths.nil?
      params['mode'] = mode if mode
      params['trace'] = trace if trace
      params['traceFile'] = trace_file if trace_file
      params['traceStderr'] = trace_stderr unless trace_stderr.nil?
      params
    end

    def fs_status(glob = nil, base_path: nil, timeout: nil)
      params = {}
      params['glob'] = glob if glob.is_a?(String) && !glob.strip.empty?
      params['basePath'] = base_path if base_path

      result, = request('fs:status', params, resolve_timeout(timeout))
      raise Error.new('invalid fs:status payload', code: 'TRANSPORT_ERROR') unless result.is_a?(Array)

      result.map do |entry|
        next unless entry.is_a?(Hash)

        filesystem_status_from_payload(entry)
      end.compact
    end

    def sign(path, identity: nil, metadata: nil, base_path: nil, timeout: nil)
      params = { 'path' => path }
      params['identity'] = identity if identity
      params['metadata'] = metadata if metadata
      params['basePath'] = base_path if base_path

      result, = request('sig:sign', params, resolve_timeout(timeout))
      file_verify_result_from_payload(result)
    end

    def verify(path, base_path: nil, timeout: nil)
      params = { 'path' => path }
      params['basePath'] = base_path if base_path

      result, = request('sig:verify', params, resolve_timeout(timeout))
      file_verify_result_from_payload(result)
    end

    def sign_content(content, identity, metadata: nil, signature_id: nil, base_path: nil, timeout: nil)
      params = {
        'content' => content,
        'identity' => identity
      }
      params['metadata'] = metadata if metadata
      params['id'] = signature_id if signature_id
      params['basePath'] = base_path if base_path

      result, = request('sig:sign-content', params, resolve_timeout(timeout))
      content_signature_from_payload(result)
    end

    def send_cancel(request_id)
      send_control_request({ 'method' => 'cancel', 'id' => request_id })
    rescue Error
      nil
    end

    def send_state_update(request_id, path, value, timeout, labels: nil)
      unless path.is_a?(String) && !path.strip.empty?
        raise Error.new('state update path is required', code: 'INVALID_REQUEST')
      end

      resolved_timeout = resolve_timeout(timeout)
      max_wait = resolved_timeout || 2.0
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + max_wait
      normalized_labels = normalize_label_list(labels)

      loop do
        begin
          params = {
            'requestId' => request_id,
            'path' => path,
            'value' => value
          }
          params['labels'] = normalized_labels if normalized_labels
          request('state:update', params, resolved_timeout)
          return nil
        rescue Error => error
          raise unless error.code == 'REQUEST_NOT_FOUND'
          raise if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline

          sleep(0.025)
        end
      end
    end

    def send_file_write(request_id, path, content, timeout)
      unless path.is_a?(String) && !path.strip.empty?
        raise Error.new('file write path is required', code: 'INVALID_REQUEST')
      end
      unless content.is_a?(String)
        raise Error.new('file write content must be a string', code: 'INVALID_REQUEST')
      end

      resolved_timeout = resolve_timeout(timeout)
      max_wait = resolved_timeout || 2.0
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + max_wait

      loop do
        begin
          params = {
            'requestId' => request_id,
            'path' => path,
            'content' => content
          }
          result, = request('file:write', params, resolved_timeout)
          return file_verify_result_from_payload(result)
        rescue Error => error
          raise unless error.code == 'REQUEST_NOT_FOUND'
          raise if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline

          sleep(0.025)
        end
      end
    end

    def normalize_payload_labels(payload_labels)
      return nil if payload_labels.nil?
      return nil unless payload_labels.is_a?(Hash)

      normalized = {}
      payload_labels.each do |key, labels|
        deduped = normalize_label_list(labels)
        normalized[key.to_s] = deduped if deduped
      end
      normalized.empty? ? nil : normalized
    end

    def normalize_payload_and_labels(payload, payload_labels)
      merged_labels = {}
      normalized_payload = payload

      if payload.is_a?(Hash)
        normalized_payload = {}
        payload.each do |key, value|
          field = key.to_s
          if value.is_a?(LabeledValue)
            normalized_payload[field] = value.value
            labels = normalize_label_list(value.labels)
            merged_labels[field] = labels if labels
          else
            normalized_payload[field] = value
          end
        end
      elsif !payload_labels.nil?
        raise Error.new('payload_labels requires payload to be a hash', code: 'INVALID_REQUEST')
      end

      explicit_labels = normalize_payload_labels(payload_labels)
      if explicit_labels
        raise Error.new('payload_labels requires payload to be a hash', code: 'INVALID_REQUEST') unless normalized_payload.is_a?(Hash)

        explicit_labels.each do |field, labels|
          unless normalized_payload.key?(field)
            raise Error.new("payload_labels contains unknown field: #{field}", code: 'INVALID_REQUEST')
          end

          merged_labels[field] = merge_label_lists(merged_labels[field], labels)
        end
      end

      [normalized_payload, merged_labels.empty? ? nil : merged_labels]
    end

    def merge_label_lists(existing, incoming)
      merged = Array(existing)
      incoming.each do |label|
        merged << label unless merged.include?(label)
      end
      merged
    end

    def normalize_string_map(value)
      return nil unless value.is_a?(Hash)

      normalized = {}
      value.each do |key, item|
        next unless key.is_a?(String) || key.is_a?(Symbol)
        next unless item.is_a?(String)

        normalized_key = key.to_s.strip
        normalized_value = item.strip
        next if normalized_key.empty? || normalized_value.empty?

        normalized[normalized_key] = normalized_value
      end

      normalized.empty? ? nil : normalized
    end

    def normalize_label_list(labels)
      return nil if labels.nil?

      raw = labels.is_a?(Array) ? labels : [labels]
      normalized = raw
        .select { |label| label.is_a?(String) }
        .map(&:strip)
        .reject(&:empty?)
        .uniq

      normalized.empty? ? nil : normalized
    end

    def await_request(request_id, response_queue, timeout)
      state_write_events = []
      deadline = timeout ? Process.clock_gettime(Process::CLOCK_MONOTONIC) + timeout : nil

      loop do
        remaining = deadline ? deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC) : nil
        if remaining && remaining <= 0
          remove_pending(request_id)
          send_cancel(request_id)
          raise Error.new("request timeout after #{timeout}s", code: 'TIMEOUT')
        end

        entry = nil
        if remaining
          begin
            entry = Timeout.timeout(remaining) { response_queue.pop }
          rescue Timeout::Error
            remove_pending(request_id)
            send_cancel(request_id)
            raise Error.new("request timeout after #{timeout}s", code: 'TIMEOUT')
          end
        else
          entry = response_queue.pop
        end

        kind, payload = entry

        if kind == :event
          state_write = state_write_from_event(payload)
          state_write_events << state_write if state_write
          session_write = session_write_from_event(payload)
          next if session_write
          next
        end

        raise payload if kind == :transport_error
        next unless kind == :result && payload.is_a?(Hash)

        error_payload = payload['error']
        raise error_from_payload(error_payload) if error_payload.is_a?(Hash)

        return [payload['result'], state_write_events]
      end
    end

    def decode_execute_result(result, state_write_events, guard_denial_events = [])
      unless result.is_a?(Hash)
        return ExecuteResult.new(
          output: result.nil? ? '' : result.to_s,
          state_writes: state_write_events,
          sessions: [],
          exports: [],
          effects: [],
          denials: guard_denial_events,
          trace_events: [],
          metrics: nil
        )
      end

      state_writes = Array(result['stateWrites']).map do |write|
        next unless write.is_a?(Hash)

        StateWrite.new(
          path: write['path'].to_s,
          value: decode_state_write_value(write['value']),
          timestamp: write['timestamp'],
          security: write['security'].is_a?(Hash) ? write['security'] : nil
        )
      end.compact

      state_writes = merge_state_writes(state_writes, state_write_events)
      sessions = Array(result['sessions']).map do |entry|
        next unless entry.is_a?(Hash)

        frame_id = entry['frameId']
        declaration_id = entry['declarationId']
        name = entry['name']
        next unless frame_id.is_a?(String) && !frame_id.empty?
        next unless declaration_id.is_a?(String) && !declaration_id.empty?
        next unless name.is_a?(String) && !name.empty?

        SessionFinalState.new(
          frame_id: frame_id,
          declaration_id: declaration_id,
          name: name,
          origin_path: entry['originPath'].is_a?(String) ? entry['originPath'] : nil,
          final_state: entry['finalState'].is_a?(Hash) ? entry['finalState'] : {}
        )
      end.compact

      metrics_payload = result['metrics']
      metrics = nil
      if metrics_payload.is_a?(Hash)
        metrics = Metrics.new(
          total_ms: metrics_payload['totalMs'] || 0,
          parse_ms: metrics_payload['parseMs'] || 0,
          evaluate_ms: metrics_payload['evaluateMs'] || 0
        )
      end

      effects = Array(result['effects']).map do |effect|
        next unless effect.is_a?(Hash)

        Effect.new(
          type: effect['type'].to_s,
          content: effect['content'],
          security: effect['security']
        )
      end.compact

      denials = Array(result['denials']).map do |entry|
        guard_denial_from_payload(entry)
      end.compact
      denials = merge_guard_denials(denials, guard_denial_events)
      trace_events = Array(result['traceEvents']).map do |entry|
        next unless entry.is_a?(Hash)

        TraceEvent.new(
          ts: entry['ts'].to_s,
          level: entry['level'].to_s,
          category: entry['category'].to_s,
          event: entry['event'].to_s,
          scope: entry['scope'].is_a?(Hash) ? entry['scope'] : {},
          data: entry['data'].is_a?(Hash) ? entry['data'] : {}
        )
      end.compact

      ExecuteResult.new(
        output: result['output'].to_s,
        state_writes: state_writes,
        sessions: sessions,
        exports: result.fetch('exports', []),
        effects: effects,
        denials: denials,
        trace_events: trace_events,
        metrics: metrics
      )
    end

    def file_verify_result_from_payload(payload)
      raise Error.new('invalid file verification payload', code: 'TRANSPORT_ERROR') unless payload.is_a?(Hash)

      FileVerifyResult.new(
        path: payload.fetch('path', '').to_s,
        relative_path: payload.fetch('relativePath', payload.fetch('relative_path', '')).to_s,
        status: payload.fetch('status', '').to_s,
        verified: payload['verified'] ? true : false,
        signer: payload['signer'].is_a?(String) ? payload['signer'] : nil,
        signed_at: payload['signedAt'].is_a?(String) ? payload['signedAt'] : nil,
        hash: payload['hash'].is_a?(String) ? payload['hash'] : nil,
        expected_hash: payload['expectedHash'].is_a?(String) ? payload['expectedHash'] : nil,
        metadata: payload['metadata'].is_a?(Hash) ? payload['metadata'] : nil,
        error: payload['error'].is_a?(String) ? payload['error'] : nil
      )
    end

    def filesystem_status_from_payload(payload)
      raise Error.new('invalid fs:status payload', code: 'TRANSPORT_ERROR') unless payload.is_a?(Hash)

      FilesystemStatus.new(
        path: payload.fetch('path', '').to_s,
        relative_path: payload.fetch('relativePath', payload.fetch('relative_path', '')).to_s,
        status: payload.fetch('status', '').to_s,
        verified: payload['verified'] ? true : false,
        signer: payload['signer'].is_a?(String) ? payload['signer'] : nil,
        labels: Array(payload['labels']).select { |label| label.is_a?(String) },
        taint: Array(payload['taint']).select { |label| label.is_a?(String) },
        signed_at: payload['signedAt'].is_a?(String) ? payload['signedAt'] : nil,
        error: payload['error'].is_a?(String) ? payload['error'] : nil
      )
    end

    def content_signature_from_payload(payload)
      raise Error.new('invalid sign_content payload', code: 'TRANSPORT_ERROR') unless payload.is_a?(Hash)

      metadata =
        if payload['metadata'].is_a?(Hash)
          payload['metadata']
            .each_with_object({}) do |(key, value), normalized|
              normalized[key.to_s] = value.to_s if key.is_a?(String) && value.is_a?(String)
            end
        end

      ContentSignature.new(
        id: payload.fetch('id', '').to_s,
        hash: payload.fetch('hash', '').to_s,
        algorithm: payload.fetch('algorithm', '').to_s,
        signed_by: payload.fetch('signedBy', payload.fetch('signed_by', '')).to_s,
        signed_at: payload.fetch('signedAt', payload.fetch('signed_at', '')).to_s,
        content_length: payload.fetch('contentLength', payload.fetch('content_length', 0)).to_i,
        metadata: metadata
      )
    end

    private

    def request(method, params, timeout)
      request_id, response_queue = send_request(method, params)
      await_request(request_id, response_queue, timeout)
    end

    def send_request(method, params)
      request_id = nil
      response_queue = nil
      stdin = nil
      payload = nil

      @lock.synchronize do
        ensure_transport_locked
        request_id = @request_id
        @request_id += 1

        response_queue = Queue.new
        @pending[request_id] = response_queue

        stdin = @stdin
        unless stdin
          @pending.delete(request_id)
          raise Error.new('live transport stdin is unavailable', code: 'TRANSPORT_ERROR')
        end

        payload = JSON.generate({ 'method' => method, 'id' => request_id, 'params' => params })
      end

      @write_lock.synchronize do
        stdin.write(payload)
        stdin.write("\n")
        stdin.flush
      end

      [request_id, response_queue]
    rescue StandardError => e
      remove_pending(request_id) if request_id
      raise e if e.is_a?(Error)

      raise Error.new("failed to send request: #{e}", code: 'TRANSPORT_ERROR')
    end

    def send_control_request(payload)
      stdin = @lock.synchronize { @stdin }
      raise Error.new('live transport is unavailable', code: 'TRANSPORT_ERROR') unless stdin

      @write_lock.synchronize do
        stdin.write(JSON.generate(payload))
        stdin.write("\n")
        stdin.flush
      end
    end

    def remove_pending(request_id)
      @lock.synchronize { @pending.delete(request_id) }
    end

    def transport_running_locked?
      @wait_thr&.alive? && @reader_thread&.alive? && @stdin && !@stdin.closed?
    end

    def ensure_transport_locked
      return if transport_running_locked?

      @stderr_lines = []

      command = [@command, *@command_args, 'live', '--stdio']
      options = {}
      options[:chdir] = @working_dir if @working_dir

      @stdin, @stdout, @stderr, @wait_thr = Open3.popen3(*command, **options)
      @reader_thread = Thread.new { reader_loop }
      @stderr_thread = Thread.new { stderr_loop }
    rescue StandardError => e
      raise Error.new("failed to create live transport stdio pipes: #{e}", code: 'TRANSPORT_ERROR')
    end

    def reader_loop
      stdout = @lock.synchronize { @stdout }
      return unless stdout

      while (line = stdout.gets)
        line = line.strip
        next if line.empty?

        envelope = nil
        begin
          envelope = JSON.parse(line)
        rescue JSON::ParserError => e
          fail_all_pending(Error.new("invalid live response: #{e.message}", code: 'TRANSPORT_ERROR'))
          next
        end

        event = envelope['event']
        if event.is_a?(Hash)
          event_request_id = request_id_from_payload(event['requestId'] || event['id'])
          if event_request_id
            queue = @lock.synchronize { @pending[event_request_id] }
            queue << [:event, event] if queue
          end
        end

        if envelope.key?('result') || envelope.key?('error')
          result_request_id = request_id_from_payload(envelope['id'])
          if result_request_id
            queue = @lock.synchronize { @pending.delete(result_request_id) }
            queue << [:result, envelope] if queue
          end
        end
      end
    ensure
      returncode = @wait_thr&.value&.exitstatus
      message = @stderr_lines.join.strip
      message = 'live transport closed' if message.empty?
      fail_all_pending(Error.new(message, code: 'TRANSPORT_ERROR', returncode: returncode))
    end

    def stderr_loop
      stderr = @lock.synchronize { @stderr }
      return unless stderr

      stderr.each_line do |line|
        @stderr_lines << line
      end
    end

    def fail_all_pending(error)
      pending_queues = @lock.synchronize do
        queues = @pending.values
        @pending = {}
        @stdin = nil
        @stdout = nil
        @stderr = nil
        @wait_thr = nil
        queues
      end

      pending_queues.each do |queue|
        queue << [:transport_error, error]
      end
    end

    def resolve_timeout(timeout)
      return timeout unless timeout.nil?

      @timeout
    end

    def error_from_payload(error_payload)
      Error.new(
        error_payload.fetch('message', 'mlld request failed').to_s,
        code: error_payload['code'].is_a?(String) ? error_payload['code'] : nil
      )
    end

    def request_id_from_payload(value)
      return value if value.is_a?(Integer)
      return value.to_i if value.is_a?(String) && value.match?(/\A\d+\z/)

      nil
    end

    def state_write_from_event(event)
      return nil unless event['type'] == 'state:write'

      write = event['write']
      return nil unless write.is_a?(Hash)

      path = write['path']
      return nil unless path.is_a?(String) && !path.empty?

      StateWrite.new(
        path: path,
        value: decode_state_write_value(write['value']),
        timestamp: write['timestamp'],
        security: write['security'].is_a?(Hash) ? write['security'] : nil
      )
    end

    def session_write_from_event(event)
      return nil unless event['type'] == 'session_write'

      payload = event['session_write']
      return nil unless payload.is_a?(Hash)

      frame_id = payload['frame_id']
      session_name = payload['session_name']
      declaration_id = payload['declaration_id']
      slot_path = payload['slot_path']
      operation = payload['operation']
      return nil unless [frame_id, session_name, declaration_id, slot_path, operation].all? { |value| value.is_a?(String) && !value.empty? }

      SessionWrite.new(
        frame_id: frame_id,
        session_name: session_name,
        declaration_id: declaration_id,
        origin_path: payload['origin_path'].is_a?(String) ? payload['origin_path'] : nil,
        slot_path: slot_path,
        operation: operation,
        prev: payload.key?('prev') ? payload['prev'] : nil,
        next: payload.key?('next') ? payload['next'] : nil
      )
    end

    def guard_denial_from_event(event)
      return nil unless event['type'] == 'guard_denial'

      guard_denial_from_payload(event['guard_denial'])
    end

    def trace_event_from_event(event)
      return nil unless event['type'] == 'trace_event'

      payload = event['traceEvent']
      return nil unless payload.is_a?(Hash)

      TraceEvent.new(
        ts: payload['ts'].to_s,
        level: payload['level'].to_s,
        category: payload['category'].to_s,
        event: payload['event'].to_s,
        scope: payload['scope'].is_a?(Hash) ? payload['scope'] : {},
        data: payload['data'].is_a?(Hash) ? payload['data'] : {}
      )
    end

    def guard_denial_from_payload(entry)
      return nil unless entry.is_a?(Hash)
      return nil unless entry['operation'].is_a?(String) && !entry['operation'].empty?
      return nil unless entry['reason'].is_a?(String) && !entry['reason'].empty?

      GuardDenial.new(
        guard: entry['guard'].is_a?(String) ? entry['guard'] : nil,
        operation: entry['operation'],
        reason: entry['reason'],
        rule: entry['rule'].is_a?(String) ? entry['rule'] : nil,
        labels: Array(entry['labels']).select { |label| label.is_a?(String) },
        args: entry['args'].is_a?(Hash) ? entry['args'] : nil
      )
    end

    def decode_state_write_value(value)
      return value unless value.is_a?(String)

      trimmed = value.strip
      return value if trimmed.length < 2
      return value unless (trimmed.start_with?('{') && trimmed.end_with?('}')) ||
                          (trimmed.start_with?('[') && trimmed.end_with?(']'))

      JSON.parse(value)
    rescue JSON::ParserError
      value
    end

    def merge_state_writes(primary, secondary)
      return primary if secondary.empty?
      return secondary if primary.empty?

      merged = []
      seen = {}

      (primary + secondary).each do |state_write|
        key = state_write_key(state_write)
        next if seen[key]

        seen[key] = true
        merged << state_write
      end

      merged
    end

    def state_write_key(state_write)
      encoded_value = JSON.generate(state_write.value)
      "#{state_write.path}|#{encoded_value}"
    rescue StandardError
      "#{state_write.path}|#{state_write.value.inspect}"
    end

    def merge_guard_denials(primary, secondary)
      return primary if secondary.empty?
      return secondary if primary.empty?

      merged = []
      seen = {}

      (primary + secondary).each do |guard_denial|
        key = guard_denial_key(guard_denial)
        next if seen[key]

        seen[key] = true
        merged << guard_denial
      end

      merged
    end

    def guard_denial_key(guard_denial)
      JSON.generate(
        {
          guard: guard_denial.guard,
          operation: guard_denial.operation,
          reason: guard_denial.reason,
          rule: guard_denial.rule,
          labels: Array(guard_denial.labels).sort,
          args: guard_denial.args
        }
      )
    rescue StandardError
      "#{guard_denial.guard}|#{guard_denial.operation}|#{guard_denial.reason}|#{guard_denial.rule}"
    end

    def build_analyze_result(result, fallback_filepath)
      errors = Array(result['errors']).map do |entry|
        next unless entry.is_a?(Hash)

        AnalysisError.new(
          message: entry.fetch('message', '').to_s,
          line: entry['line'],
          column: entry['column']
        )
      end.compact

      executables = Array(result['executables']).map do |entry|
        next unless entry.is_a?(Hash)

        Executable.new(
          name: entry.fetch('name', '').to_s,
          params: Array(entry['params']),
          labels: Array(entry['labels'])
        )
      end.compact

      imports = Array(result['imports']).map do |entry|
        next unless entry.is_a?(Hash)

        Import.new(
          from: entry.fetch('from', '').to_s,
          names: Array(entry['names'])
        )
      end.compact

      guards = Array(result['guards']).map do |entry|
        next unless entry.is_a?(Hash)

        Guard.new(
          name: entry.fetch('name', '').to_s,
          timing: entry.fetch('timing', '').to_s,
          trigger: entry['trigger'] || entry['label']
        )
      end.compact

      needs = nil
      if result['needs'].is_a?(Hash)
        needs = Needs.new(
          cmd: Array(result.dig('needs', 'cmd')),
          node: Array(result.dig('needs', 'node')),
          py: Array(result.dig('needs', 'py'))
        )
      end

      AnalyzeResult.new(
        filepath: result.fetch('filepath', fallback_filepath),
        valid: result.fetch('valid', true),
        errors: errors,
        executables: executables,
        exports: Array(result['exports']),
        imports: imports,
        guards: guards,
        needs: needs
      )
    end
  end

  class << self
    def default_client
      @default_client ||= Client.new
    end

    def close
      return unless @default_client

      @default_client.close
      @default_client = nil
    end

    def process(script, **kwargs)
      default_client.process(script, **kwargs)
    end

    def process_async(script, **kwargs)
      default_client.process_async(script, **kwargs)
    end

    def execute(filepath, payload = nil, **kwargs)
      default_client.execute(filepath, payload, **kwargs)
    end

    def execute_async(filepath, payload = nil, **kwargs)
      default_client.execute_async(filepath, payload, **kwargs)
    end

    def analyze(filepath)
      default_client.analyze(filepath)
    end

    def fs_status(glob = nil, **kwargs)
      default_client.fs_status(glob, **kwargs)
    end

    def sign(path, **kwargs)
      default_client.sign(path, **kwargs)
    end

    def verify(path, **kwargs)
      default_client.verify(path, **kwargs)
    end

    def sign_content(content, identity, **kwargs)
      default_client.sign_content(content, identity, **kwargs)
    end

    def labeled(value, *labels)
      normalized = labels
        .select { |label| label.is_a?(String) }
        .map(&:strip)
        .reject(&:empty?)
        .uniq
      LabeledValue.new(value: value, labels: normalized)
    end

    def trusted(value)
      labeled(value, 'trusted')
    end

    def untrusted(value)
      labeled(value, 'untrusted')
    end
  end
end

at_exit { Mlld.close }
