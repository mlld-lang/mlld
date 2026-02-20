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

  StateWrite = Struct.new(:path, :value, :timestamp, keyword_init: true)
  Metrics = Struct.new(:total_ms, :parse_ms, :evaluate_ms, keyword_init: true)
  Effect = Struct.new(:type, :content, :security, keyword_init: true)
  ExecuteResult = Struct.new(:output, :state_writes, :exports, :effects, :metrics, keyword_init: true)

  Executable = Struct.new(:name, :params, :labels, keyword_init: true)
  Import = Struct.new(:from, :names, keyword_init: true)
  Guard = Struct.new(:name, :timing, :label, keyword_init: true)
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
      @raw_result = nil
      @state_write_events = []
      @error = nil
    end

    def cancel
      @client.send_cancel(@request_id)
    end

    def update_state(path, value, timeout: nil)
      @client.send_state_update(@request_id, path, value, timeout || @timeout)
    end

    protected

    def await_raw
      @mutex.synchronize do
        unless @complete
          begin
            @raw_result, @state_write_events = @client.await_request(
              @request_id,
              @response_queue,
              @timeout
            )
          rescue Error => e
            @error = e
          end
          @complete = true
        end

        raise @error if @error
        raise Error.new('missing live result payload', code: 'TRANSPORT_ERROR') unless @raw_result

        [@raw_result, @state_write_events]
      end
    end
  end

  class ProcessHandle < BaseHandle
    def wait
      result
    end

    def result
      response, = await_raw
      output = response['output']
      output = response.fetch('value', '') if output.nil?
      output.is_a?(String) ? output : output.to_s
    end
  end

  class ExecuteHandle < BaseHandle
    def wait
      result
    end

    def result
      response, state_write_events = await_raw
      @client.decode_execute_result(response, state_write_events)
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
      state: nil,
      dynamic_modules: nil,
      dynamic_module_source: nil,
      mode: nil,
      allow_absolute_paths: nil,
      timeout: nil
    )
      process_async(
        script,
        file_path: file_path,
        payload: payload,
        state: state,
        dynamic_modules: dynamic_modules,
        dynamic_module_source: dynamic_module_source,
        mode: mode,
        allow_absolute_paths: allow_absolute_paths,
        timeout: timeout
      ).result
    end

    def process_async(
      script,
      file_path: nil,
      payload: nil,
      state: nil,
      dynamic_modules: nil,
      dynamic_module_source: nil,
      mode: nil,
      allow_absolute_paths: nil,
      timeout: nil
    )
      params = { 'script' => script }
      params['filePath'] = file_path if file_path
      params['payload'] = payload unless payload.nil?
      params['state'] = state if state
      params['dynamicModules'] = dynamic_modules if dynamic_modules
      params['dynamicModuleSource'] = dynamic_module_source if dynamic_module_source
      params['mode'] = mode if mode
      params['allowAbsolutePaths'] = allow_absolute_paths unless allow_absolute_paths.nil?

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
      state: nil,
      dynamic_modules: nil,
      dynamic_module_source: nil,
      allow_absolute_paths: nil,
      mode: nil,
      timeout: nil
    )
      execute_async(
        filepath,
        payload,
        state: state,
        dynamic_modules: dynamic_modules,
        dynamic_module_source: dynamic_module_source,
        allow_absolute_paths: allow_absolute_paths,
        mode: mode,
        timeout: timeout
      ).result
    end

    def execute_async(
      filepath,
      payload = nil,
      state: nil,
      dynamic_modules: nil,
      dynamic_module_source: nil,
      allow_absolute_paths: nil,
      mode: nil,
      timeout: nil
    )
      params = { 'filepath' => filepath }
      params['payload'] = payload unless payload.nil?
      params['state'] = state if state
      params['dynamicModules'] = dynamic_modules if dynamic_modules
      params['dynamicModuleSource'] = dynamic_module_source if dynamic_module_source
      params['allowAbsolutePaths'] = allow_absolute_paths unless allow_absolute_paths.nil?
      params['mode'] = mode if mode

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

    def send_cancel(request_id)
      send_control_request({ 'method' => 'cancel', 'id' => request_id })
    rescue Error
      nil
    end

    def send_state_update(request_id, path, value, timeout)
      unless path.is_a?(String) && !path.strip.empty?
        raise Error.new('state update path is required', code: 'INVALID_REQUEST')
      end

      resolved_timeout = resolve_timeout(timeout)
      max_wait = resolved_timeout || 2.0
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + max_wait

      loop do
        begin
          request('state:update', {
            'requestId' => request_id,
            'path' => path,
            'value' => value
          }, resolved_timeout)
          return nil
        rescue Error => error
          raise unless error.code == 'REQUEST_NOT_FOUND'
          raise if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline

          sleep(0.025)
        end
      end
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
          next
        end

        raise payload if kind == :transport_error
        next unless kind == :result && payload.is_a?(Hash)

        error_payload = payload['error']
        raise error_from_payload(error_payload) if error_payload.is_a?(Hash)

        payload.delete('id')
        return [payload, state_write_events]
      end
    end

    def decode_execute_result(result, state_write_events)
      state_writes = Array(result['stateWrites']).map do |write|
        next unless write.is_a?(Hash)

        StateWrite.new(
          path: write['path'].to_s,
          value: write['value'],
          timestamp: write['timestamp']
        )
      end.compact

      state_writes = merge_state_writes(state_writes, state_write_events)

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

      ExecuteResult.new(
        output: result['output'].to_s,
        state_writes: state_writes,
        exports: result.fetch('exports', []),
        effects: effects,
        metrics: metrics
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
          event_request_id = request_id_from_payload(event['id'])
          if event_request_id
            queue = @lock.synchronize { @pending[event_request_id] }
            queue << [:event, event] if queue
          end
        end

        result = envelope['result']
        if result.is_a?(Hash)
          result_request_id = request_id_from_payload(result['id'])
          if result_request_id
            queue = @lock.synchronize { @pending.delete(result_request_id) }
            queue << [:result, result] if queue
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

      StateWrite.new(path: path, value: write['value'], timestamp: write['timestamp'])
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
          label: entry['label']
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
  end
end

at_exit { Mlld.close }
