# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require_relative '../lib/mlld'

class ProtocolFixturesTest < Minitest::Test
  def setup
    @client = Mlld::Client.new
  end

  def test_execute_result_fixture_preserves_security
    fixture = load_fixture('execute-result.json')
    result = @client.send(:decode_execute_result, fixture.fetch('result'), [])

    assert_equal(1, result.state_writes.length)
    assert_equal(1, result.sessions.length)
    assert_equal('planner', result.sessions.first.name)
    assert_equal({ 'count' => 2, 'status' => 'done' }, result.sessions.first.final_state)
    assert_equal(['trusted'], result.state_writes.first.security['labels'])
    assert_equal(['trusted'], result.effects.first.security['labels'])
  end

  def test_analyze_result_fixture_uses_trigger
    fixture = load_fixture('analyze-result.json')
    result = @client.send(:build_analyze_result, fixture.fetch('result'), 'fallback.mld')

    assert_equal(2, result.guards.length)
    assert_equal('secret', result.guards.first.trigger)
    assert_equal('', result.guards.last.name)
    assert_equal('net:w', result.guards.last.trigger)
  end

  def test_state_write_event_fixture_preserves_security
    fixture = load_fixture('state-write-event.json')
    state_write = @client.send(:state_write_from_event, fixture.fetch('event'))

    refute_nil(state_write)
    assert_equal('payload', state_write.path)
    assert_equal(['trusted'], state_write.security['labels'])
  end

  def test_session_write_event_fixture_preserves_fields
    fixture = load_fixture('session-write-event.json')
    session_write = @client.send(:session_write_from_event, fixture.fetch('event'))

    refute_nil(session_write)
    assert_equal('planner', session_write.session_name)
    assert_equal('count', session_write.slot_path)
    assert_equal('increment', session_write.operation)
    assert_equal(1, session_write.prev)
    assert_equal(2, session_write.next)
  end

  def test_trace_event_fixture_preserves_fields
    fixture = load_fixture('trace-event.json')
    trace_event = @client.send(:trace_event_from_event, fixture.fetch('event'))

    refute_nil(trace_event)
    assert_equal('guard.deny', trace_event.event)
    assert_equal('guard', trace_event.category)
    assert_equal('frame-parent', trace_event.scope['parentFrameId'])
    assert_equal('send', trace_event.data['operation'])
  end

  def test_error_fixture_decodes_transport_error
    fixture = load_fixture('error-result.json')
    error = @client.send(:error_from_payload, fixture.fetch('error'))

    assert_instance_of(Mlld::Error, error)
    assert_equal('TIMEOUT', error.code)
    assert_match(/timeout/i, error.message)
  end

  def test_sign_result_fixture_decodes_file_verify_result
    fixture = load_fixture('sign-result.json')
    result = @client.send(:file_verify_result_from_payload, fixture.fetch('result'))

    assert_equal('docs/a.txt', result.relative_path)
    assert_equal('sha256:abc', result.expected_hash)
    assert_equal({ 'purpose' => 'sdk' }, result.metadata)
  end

  def test_fs_status_fixture_decodes_filesystem_status
    fixture = load_fixture('fs-status-result.json')
    result = @client.send(:filesystem_status_from_payload, fixture.fetch('result').first)

    assert_equal('docs/a.txt', result.relative_path)
    assert_equal(['trusted'], result.labels)
    assert_equal(['secret'], result.taint)
  end

  def test_sign_content_fixture_decodes_content_signature
    fixture = load_fixture('sign-content-result.json')
    result = @client.send(:content_signature_from_payload, fixture.fetch('result'))

    assert_equal('content-1', result.id)
    assert_equal('user:alice', result.signed_by)
    assert_equal({ 'channel' => 'sdk' }, result.metadata)
  end

  def test_process_and_execute_requests_serialize_trace_memory
    process_params = @client.build_process_request(
      'show "hi"',
      trace: 'effects',
      trace_memory: true,
      trace_file: 'trace.jsonl',
      trace_stderr: false
    )

    assert_equal 'effects', process_params['trace']
    assert_equal true, process_params['traceMemory']
    assert_equal 'trace.jsonl', process_params['traceFile']
    assert_equal false, process_params['traceStderr']

    execute_params = @client.build_execute_request(
      '/repo/main.mld',
      { 'name' => 'Ada' },
      trace_memory: true
    )

    assert_equal true, execute_params['traceMemory']
  end

  def test_transport_command_adds_runtime_heap_args
    wrapper = Mlld::Client.new(heap: '8g', heap_snapshot_near_limit: 2)
    assert_equal(
      ['mlld', '--mlld-heap=8g', '--heap-snapshot-near-limit', '2', 'live', '--stdio'],
      wrapper.send(:transport_command)
    )

    node = Mlld::Client.new(command: 'node', command_args: ['./dist/cli.cjs'], heap: '8g', heap_snapshot_near_limit: 2)
    assert_equal(
      ['node', '--max-old-space-size=8192', '--heapsnapshot-near-heap-limit=2', './dist/cli.cjs', 'live', '--stdio'],
      node.send(:transport_command)
    )

    assert_raises(Mlld::Error) { Mlld::Client.new(command: 'node', heap: 'nope').send(:transport_command) }
    assert_raises(Mlld::Error) { Mlld::Client.new(heap_snapshot_near_limit: 0).send(:transport_command) }
  end

  private

  def load_fixture(name)
    path = File.expand_path(File.join('..', '..', 'fixtures', name), __dir__)
    JSON.parse(File.read(path))
  end
end
