# frozen_string_literal: true

require 'minitest/autorun'
require 'fileutils'
require 'tmpdir'
require_relative '../lib/mlld'

class LiveIntegrationTest < Minitest::Test
  def setup
    cli_path = File.expand_path('../../../dist/cli.cjs', __dir__)
    assert(File.exist?(cli_path), "missing CLI build at #{cli_path}")

    @client = Mlld::Client.new(
      command: 'node',
      command_args: [cli_path],
      timeout: 25
    )
  end

  def teardown
    @client&.close
  end

  def test_execute_roundtrip_with_state_and_dynamic_modules
    process_output = @client.process(
      "/import { @mode } from \"@config\"\n/var @next = @state.count + 1\n/show `mode=@mode count=@next`\n",
      state: { 'count' => 1 },
      dynamic_modules: { '@config' => { 'mode' => 'process' } },
      mode: 'markdown',
      timeout: 20
    )
    assert_includes(process_output, 'mode=process count=2')

    script = <<~MLLD
      /import { @mode } from "@config"
      /import { @text } from "@payload"

      /var @next = @state.count + 1
      /output @next to "state://count"
      /show `text=@text mode=@mode count=@next`
    MLLD

    Dir.mktmpdir('mlld-ruby-sdk-') do |tmp_dir|
      script_path = File.join(tmp_dir, 'integration.mld')
      File.write(script_path, script)

      first = @client.execute(
        script_path,
        { 'text' => 'hello' },
        state: { 'count' => 0 },
        dynamic_modules: { '@config' => { 'mode' => 'live' } },
        mode: 'markdown',
        timeout: 20
      )

      assert_includes(first.output, 'text=hello mode=live count=1')
      first_count = state_write_value(first.state_writes, 'count')
      assert_equal(1, first_count)

      second = @client.execute(
        script_path,
        { 'text' => 'again' },
        state: { 'count' => first_count },
        dynamic_modules: { '@config' => { 'mode' => 'live' } },
        mode: 'markdown',
        timeout: 20
      )

      assert_includes(second.output, 'text=again mode=live count=2')
      second_count = state_write_value(second.state_writes, 'count')
      assert_equal(2, second_count)
    end
  end

  def test_loop_stops_via_state_update
    script = <<~MLLD
      loop(99999, 50ms) until @state.exit [
        continue
      ]
      show "loop-stopped"
    MLLD

    handle = @client.process_async(
      script,
      state: { 'exit' => false },
      mode: 'strict',
      timeout: 20
    )

    sleep(0.12)
    handle.update_state('exit', true)

    output = handle.result
    assert_includes(output, 'loop-stopped')
  end

  def test_next_event_state_write_roundtrip
    script = <<~MLLD
      output "ping" to "state://pending"
      loop(600, 50ms) until @state.result [
        continue
      ]
      show @state.result
    MLLD

    handle = @client.process_async(
      script,
      state: { 'pending' => nil, 'result' => nil },
      timeout: 10
    )

    event = handle.next_event(timeout: 5)
    refute_nil(event)
    assert_equal('state_write', event.type)
    assert_equal('pending', event.state_write.path)
    assert_equal('ping', event.state_write.value)

    handle.update_state('result', 'pong')

    event = handle.next_event(timeout: 5)
    refute_nil(event)
    assert_equal('complete', event.type)
    assert_nil(handle.next_event(timeout: 0.1))

    output = handle.result
    assert_includes(output, 'pong')
    assert_nil(handle.next_event(timeout: 0.1))
  end

  def test_next_event_returns_guard_denial_before_completion
    handle = @client.process_async(
      <<~MLLD,
        /guard @blocker before op:exe = when [
          @mx.op.name == "send" => deny "recipient not authorized"
          * => allow
        ]
        /exe @send(value) = when [
          denied => "blocked"
          * => @value
        ]
        /show @send("hello")
      MLLD
      mode: 'markdown',
      timeout: 5
    )

    event = handle.next_event(timeout: 5)
    refute_nil(event)
    assert_equal('guard_denial', event.type)
    assert_equal('send', event.guard_denial.operation)
    assert_equal('recipient not authorized', event.guard_denial.reason)
    assert_equal({ 'value' => 'hello' }, event.guard_denial.args)

    event = handle.next_event(timeout: 5)
    refute_nil(event)
    assert_equal('complete', event.type)

    output = handle.result
    assert_includes(output, 'blocked')
  end

  def test_sdk_labels_flow_through_payload_and_state_updates
    script = <<~MLLD
      loop(99999, 50ms) until @state.exit [
        continue
      ]
      show @payload.history.mx.labels.includes("untrusted")
      show @state.tool_result.mx.labels.includes("untrusted")
      show @state.tool_result
    MLLD

    handle = @client.process_async(
      script,
      payload: { 'history' => 'tool transcript' },
      payload_labels: { 'history' => ['untrusted'] },
      state: { 'exit' => false, 'tool_result' => nil },
      mode: 'strict',
      timeout: 20
    )

    sleep(0.12)
    handle.update_state('tool_result', 'tool output', labels: ['untrusted'])
    handle.update_state('exit', true)

    lines = handle.result.lines.map(&:strip).reject(&:empty?)
    assert_equal(['true', 'true', 'tool output'], lines)
  end

  def test_execute_handle_write_file_creates_signed_output_with_provenance
    Dir.mktmpdir('mlld-ruby-write-') do |tmp_dir|
      root = tmp_dir
      File.write(File.join(root, 'package.json'), '{}')
      routes_dir = File.join(root, 'routes')
      FileUtils.mkdir_p(routes_dir)

      script_path = File.join(routes_dir, 'route.mld')
      File.write(
        script_path,
        <<~MLLD
          loop(99999, 50ms) until @state.exit [
            continue
          ]
          show "done"
        MLLD
      )

      handle = @client.execute_async(
        script_path,
        nil,
        state: { 'exit' => false },
        timeout: 10
      )

      write_result = handle.write_file('out.txt', 'hello from sdk', timeout: 5)
      assert_equal(File.join(routes_dir, 'out.txt'), write_result.path)
      assert_equal('verified', write_result.status)
      assert_equal(true, write_result.verified)
      assert_equal('agent:route', write_result.signer)
      assert_equal('hello from sdk', File.read(File.join(routes_dir, 'out.txt')))

      refute_nil(write_result.metadata)
      assert_equal(['untrusted'], write_result.metadata['taint'])
      assert_equal(
        {
          'sourceType' => 'mlld_execution',
          'sourceId' => handle.request_id.to_s,
          'scriptPath' => script_path
        },
        write_result.metadata['provenance']
      )

      handle.update_state('exit', true)
      final = handle.result
      assert_includes(final.output, 'done')

      error = assert_raises(Mlld::Error) do
        handle.write_file('late.txt', 'too late')
      end

      assert_equal('REQUEST_COMPLETE', error.code)
    end
  end

  def test_sign_verify_sign_content_and_fs_status_roundtrip
    Dir.mktmpdir('mlld-ruby-sig-') do |tmp_dir|
      root = tmp_dir
      File.write(File.join(root, 'package.json'), '{}')
      docs_dir = File.join(root, 'docs')
      FileUtils.mkdir_p(docs_dir)
      File.write(File.join(docs_dir, 'note.txt'), 'hello from ruby sdk')

      signed = @client.sign(
        'docs/note.txt',
        identity: 'user:alice',
        metadata: { 'purpose' => 'sdk' },
        base_path: root,
        timeout: 10
      )
      verified = @client.verify(
        'docs/note.txt',
        base_path: root,
        timeout: 10
      )
      content_signature = @client.sign_content(
        'signed body',
        'user:alice',
        metadata: { 'channel' => 'sdk' },
        signature_id: 'content-1',
        base_path: root,
        timeout: 10
      )
      statuses = @client.fs_status('docs/*.txt', base_path: root, timeout: 10)

      assert_equal('verified', signed.status)
      assert_equal(true, signed.verified)
      assert_equal('user:alice', signed.signer)
      assert_equal({ 'purpose' => 'sdk' }, signed.metadata)

      assert_equal('verified', verified.status)
      assert_equal(true, verified.verified)
      assert_equal('user:alice', verified.signer)
      assert_equal({ 'purpose' => 'sdk' }, verified.metadata)

      assert_equal('content-1', content_signature.id)
      assert_equal('user:alice', content_signature.signed_by)
      assert_equal({ 'channel' => 'sdk' }, content_signature.metadata)
      assert(File.exist?(File.join(root, '.sig', 'content', 'content-1.sig.json')))
      assert(File.exist?(File.join(root, '.sig', 'content', 'content-1.sig.content')))

      assert_equal(1, statuses.length)
      assert_equal('docs/note.txt', statuses.first.relative_path)
      assert_equal('verified', statuses.first.status)
      assert_equal('user:alice', statuses.first.signer)
    end
  end

  def test_state_update_fails_after_completion
    handle = @client.process_async(
      "show \"done\"\n",
      mode: 'strict',
      timeout: 2
    )

    output = handle.result
    assert_includes(output, 'done')

    error = assert_raises(Mlld::Error) do
      handle.update_state('exit', true)
    end

    assert_equal('REQUEST_COMPLETE', error.code)
  end

  private

  def state_write_value(state_writes, path)
    state_write = state_writes.find { |entry| entry.path == path }
    raise "missing state write for path=#{path}" unless state_write

    state_write.value.to_i
  end
end
