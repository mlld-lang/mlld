# frozen_string_literal: true

require 'minitest/autorun'
require_relative '../lib/mlld'

class SigSurfaceTest < Minitest::Test
  def setup
    @client = Mlld::Client.new(timeout: 30)
  end

  def test_process_and_execute_build_expected_requests_with_mcp_and_labeled_payloads
    process_request_id = 0
    execute_request_id = 0
    queue = Queue.new

    @client.define_singleton_method(:send_request) do |method, params|
      process_request_id += 1 if method == 'process'
      execute_request_id += 1 if method == 'execute'
      [process_request_id + execute_request_id, queue]
    end

    @client.process_async(
      'show @payload.history',
      file_path: '/repo/agent.mld',
      payload: {
        'history' => Mlld.untrusted('tool transcript'),
        'query' => Mlld.trusted('hello'),
        'plain' => 'keep me'
      },
      payload_labels: { 'query' => ['extra', 'trusted'] },
      mcp_servers: { 'tools' => 'uv run python3 mcp_server.py' },
      dynamic_module_source: 'sdk',
      allow_absolute_paths: true,
      timeout: 5
    )

    @client.execute_async(
      '/repo/agent.mld',
      { 'history' => Mlld.untrusted('tool transcript') },
      payload_labels: { 'history' => ['trusted'] },
      mcp_servers: { 'tools' => 'uv run python3 mcp_server.py' },
      timeout: 6
    )

    process_params = @client.send(
      :build_process_request,
      'show @payload.history',
      file_path: '/repo/agent.mld',
      payload: {
        'history' => Mlld.untrusted('tool transcript'),
        'query' => Mlld.trusted('hello'),
        'plain' => 'keep me'
      },
      payload_labels: { 'query' => ['extra', 'trusted'] },
      mcp_servers: { 'tools' => 'uv run python3 mcp_server.py' },
      dynamic_module_source: 'sdk',
      allow_absolute_paths: true
    )

    execute_params = @client.send(
      :build_execute_request,
      '/repo/agent.mld',
      { 'history' => Mlld.untrusted('tool transcript') },
      payload_labels: { 'history' => ['trusted'] },
      mcp_servers: { 'tools' => 'uv run python3 mcp_server.py' }
    )

    assert_equal(
      {
        'script' => 'show @payload.history',
        'recordEffects' => true,
        'filePath' => '/repo/agent.mld',
        'payload' => {
          'history' => 'tool transcript',
          'query' => 'hello',
          'plain' => 'keep me'
        },
        'payloadLabels' => {
          'history' => ['untrusted'],
          'query' => ['trusted', 'extra']
        },
        'dynamicModuleSource' => 'sdk',
        'mcpServers' => { 'tools' => 'uv run python3 mcp_server.py' },
        'allowAbsolutePaths' => true
      },
      process_params
    )

    assert_equal(
      {
        'filepath' => '/repo/agent.mld',
        'recordEffects' => true,
        'payload' => { 'history' => 'tool transcript' },
        'payloadLabels' => { 'history' => ['untrusted', 'trusted'] },
        'mcpServers' => { 'tools' => 'uv run python3 mcp_server.py' }
      },
      execute_params
    )
  end

  def test_invalid_payload_labels_raise_invalid_request
    error = assert_raises(Mlld::Error) do
      @client.send(:build_execute_request, '/repo/agent.mld', 'hello', payload_labels: { 'text' => ['trusted'] })
    end
    assert_equal('INVALID_REQUEST', error.code)

    error = assert_raises(Mlld::Error) do
      @client.send(
        :build_execute_request,
        '/repo/agent.mld',
        { 'text' => 'hello' },
        payload_labels: { 'missing' => ['untrusted'] }
      )
    end
    assert_equal('INVALID_REQUEST', error.code)
  end

  def test_sign_verify_sign_content_and_fs_status_build_expected_requests
    calls = []

    @client.define_singleton_method(:request) do |method, params, timeout|
      calls << [method, params, timeout]

      case method
      when 'fs:status'
        [[{
          'path' => '/repo/docs/a.txt',
          'relativePath' => 'docs/a.txt',
          'status' => 'verified',
          'verified' => true,
          'signer' => 'user:alice',
          'labels' => ['trusted']
        }], []]
      when 'sig:sign'
        [{
          'path' => '/repo/docs/a.txt',
          'relativePath' => 'docs/a.txt',
          'status' => 'verified',
          'verified' => true,
          'signer' => 'user:alice',
          'metadata' => { 'purpose' => 'sdk' }
        }, []]
      when 'sig:verify'
        [{
          'path' => '/repo/docs/a.txt',
          'relativePath' => 'docs/a.txt',
          'status' => 'modified',
          'verified' => false,
          'signer' => 'user:alice',
          'hash' => 'sha256:next',
          'expectedHash' => 'sha256:prev',
          'error' => 'Content has been modified since signing'
        }, []]
      when 'sig:sign-content'
        [{
          'id' => 'content-1',
          'hash' => 'sha256:abc',
          'algorithm' => 'sha256',
          'signedBy' => 'user:alice',
          'signedAt' => '2026-03-12T00:00:00.000Z',
          'contentLength' => 11,
          'metadata' => { 'channel' => 'sdk' }
        }, []]
      else
        flunk("unexpected request #{method}")
      end
    end

    statuses = @client.fs_status('docs/*.txt', base_path: '/repo', timeout: 5)
    signed = @client.sign(
      'docs/a.txt',
      identity: 'user:alice',
      metadata: { 'purpose' => 'sdk' },
      base_path: '/repo',
      timeout: 6
    )
    verified = @client.verify('docs/a.txt', base_path: '/repo', timeout: 7)
    content_signature = @client.sign_content(
      'hello world',
      'user:alice',
      metadata: { 'channel' => 'sdk' },
      signature_id: 'content-1',
      base_path: '/repo',
      timeout: 8
    )

    assert_equal(
      [
        ['fs:status', { 'glob' => 'docs/*.txt', 'basePath' => '/repo' }, 5],
        [
          'sig:sign',
          {
            'path' => 'docs/a.txt',
            'identity' => 'user:alice',
            'metadata' => { 'purpose' => 'sdk' },
            'basePath' => '/repo'
          },
          6
        ],
        [
          'sig:verify',
          {
            'path' => 'docs/a.txt',
            'basePath' => '/repo'
          },
          7
        ],
        [
          'sig:sign-content',
          {
            'content' => 'hello world',
            'identity' => 'user:alice',
            'metadata' => { 'channel' => 'sdk' },
            'id' => 'content-1',
            'basePath' => '/repo'
          },
          8
        ]
      ],
      calls
    )

    assert_equal('docs/a.txt', statuses.first.relative_path)
    assert_equal('verified', signed.status)
    assert_equal('modified', verified.status)
    assert_equal('content-1', content_signature.id)
    assert_equal('user:alice', content_signature.signed_by)
  end
end
