# frozen_string_literal: true

require 'minitest/autorun'
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

    assert_equal('REQUEST_NOT_FOUND', error.code)
  end

  private

  def state_write_value(state_writes, path)
    state_write = state_writes.find { |entry| entry.path == path }
    raise "missing state write for path=#{path}" unless state_write

    state_write.value.to_i
  end
end
