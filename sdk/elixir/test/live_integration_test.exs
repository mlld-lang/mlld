defmodule Mlld.LiveIntegrationTest do
  use ExUnit.Case, async: false

  alias Mlld.{Client, Handle}

  setup do
    cli_path = Path.expand("../../../dist/cli.cjs", __DIR__)
    assert File.exists?(cli_path), "missing CLI build at #{cli_path}"

    {:ok, client} =
      Client.start_link(
        command: "node",
        command_args: [cli_path],
        timeout: 15_000
      )

    on_exit(fn ->
      if Process.alive?(client) do
        Client.stop(client)
      else
        :ok
      end
    end)

    [client: client]
  end

  test "execute roundtrip with state and dynamic modules", %{client: client} do
    assert {:ok, process_output} =
             Client.process(
               client,
               "/import { @mode } from \"@config\"\n/var @next = @state.count + 1\n/show `mode=@mode count=@next`\n",
               state: %{"count" => 1},
               dynamic_modules: %{"@config" => %{"mode" => "process"}},
               mode: :markdown,
               timeout: 10_000
             )

    assert process_output =~ "mode=process count=2"

    script = """
    /import { @mode } from "@config"
    /import { @text } from "@payload"

    /var @next = @state.count + 1
    /output @next to "state://count"
    /show `text=@text mode=@mode count=@next`
    """

    temp_dir = Path.join(System.tmp_dir!(), "mlld-elixir-sdk-#{System.unique_integer([:positive])}")
    File.mkdir_p!(temp_dir)
    script_path = Path.join(temp_dir, "integration.mld")
    File.write!(script_path, script)

    assert {:ok, first} =
             Client.execute(
               client,
               script_path,
               %{"text" => "hello"},
               state: %{"count" => 0},
               dynamic_modules: %{"@config" => %{"mode" => "live"}},
               mode: :markdown,
               timeout: 10_000
             )

    assert first.output =~ "text=hello mode=live count=1"
    assert 1 = state_write_value(first.state_writes, "count")

    assert {:ok, second} =
             Client.execute(
               client,
               script_path,
               %{"text" => "again"},
               state: %{"count" => 1},
               dynamic_modules: %{"@config" => %{"mode" => "live"}},
               mode: :markdown,
               timeout: 10_000
             )

    assert second.output =~ "text=again mode=live count=2"
    assert 2 = state_write_value(second.state_writes, "count")
  end

  test "loop stops via update_state", %{client: client} do
    script = """
    loop(99999, 50ms) until @state.exit [
      continue
    ]
    show "loop-stopped"
    """

    assert {:ok, handle} =
             Client.process_async(
               client,
               script,
               state: %{"exit" => false},
               mode: :strict,
               timeout: 10_000
             )

    Process.sleep(120)
    assert :ok = Handle.update_state(handle, "exit", true)

    assert {:ok, output} = Handle.result(handle)
    assert output =~ "loop-stopped"
  end

  test "update_state fails after completion", %{client: client} do
    assert {:ok, handle} =
             Client.process_async(
               client,
               "show \"done\"\n",
               mode: :strict,
               timeout: 2_000
             )

    assert {:ok, output} = Handle.result(handle)
    assert output =~ "done"

    assert {:error, %Mlld.Error{code: "REQUEST_NOT_FOUND"}} =
             Handle.update_state(handle, "exit", true)
  end

  defp state_write_value(state_writes, path) do
    state_write = Enum.find(state_writes, &(&1.path == path))
    assert state_write, "missing state write for path=#{path}"

    case state_write.value do
      value when is_integer(value) -> value
      value when is_float(value) -> trunc(value)
      value when is_binary(value) -> String.to_integer(value)
      value -> raise "unexpected state write value: #{inspect(value)}"
    end
  end
end
