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

    temp_dir =
      Path.join(System.tmp_dir!(), "mlld-elixir-sdk-#{System.unique_integer([:positive])}")

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

  test "next_event yields state writes and complete", %{client: client} do
    script = """
    output "ping" to "state://pending"
    loop(99999, 50ms) until @state.exit [
      continue
    ]
    show @state.result
    """

    assert {:ok, handle} =
             Client.process_async(
               client,
               script,
               state: %{"pending" => nil, "result" => nil, "exit" => false},
               mode: :strict,
               timeout: 10_000
             )

    event = Handle.next_event(handle, 5_000)
    assert event.type == "state_write"
    assert event.state_write.path == "pending"
    assert event.state_write.value == "ping"

    assert :ok = Handle.update_state(handle, "result", "pong")
    assert :ok = Handle.update_state(handle, "exit", true)

    event = Handle.next_event(handle, 5_000)
    assert event.type == "complete"
    assert is_nil(Handle.next_event(handle, 100))

    assert {:ok, output} = Handle.result(handle)
    assert output =~ "pong"
    assert is_nil(Handle.next_event(handle, 100))
  end

  test "next_event yields guard denials before completion", %{client: client} do
    script = """
    /guard @blocker before op:exe = when [
      @mx.op.name == "send" => deny "recipient not authorized"
      * => allow
    ]
    /exe @send(value) = when [
      denied => "blocked"
      * => @value
    ]
    /show @send("hello")
    """

    assert {:ok, handle} =
             Client.process_async(
               client,
               script,
               mode: :markdown,
               timeout: 5_000
             )

    event = Handle.next_event(handle, 5_000)
    assert event.type == "guard_denial"
    assert event.guard_denial.operation == "send"
    assert event.guard_denial.reason == "recipient not authorized"
    assert event.guard_denial.args == %{"value" => "hello"}

    event = Handle.next_event(handle, 5_000)
    assert event.type == "complete"

    assert {:ok, output} = Handle.result(handle)
    assert output =~ "blocked"
  end

  test "sdk labels flow through payload and state updates", %{client: client} do
    script = """
    loop(99999, 50ms) until @state.exit [
      continue
    ]
    show @payload.history.mx.labels.includes("untrusted")
    show @state.tool_result.mx.labels.includes("untrusted")
    show @state.tool_result
    """

    assert {:ok, handle} =
             Client.process_async(
               client,
               script,
               payload: %{"history" => "tool transcript"},
               payload_labels: %{"history" => ["untrusted"]},
               state: %{"exit" => false, "tool_result" => nil},
               mode: :strict,
               timeout: 10_000
             )

    Process.sleep(120)
    assert :ok = Handle.update_state(handle, "tool_result", "tool output", labels: ["untrusted"])
    assert :ok = Handle.update_state(handle, "exit", true)

    assert {:ok, output} = Handle.result(handle)

    assert output
           |> String.split("\n", trim: true)
           |> Enum.map(&String.trim/1) == ["true", "true", "tool output"]
  end

  test "execute handle write_file creates signed output with provenance", %{client: client} do
    root = Path.join(System.tmp_dir!(), "mlld-elixir-write-#{System.unique_integer([:positive])}")
    routes_dir = Path.join(root, "routes")
    File.mkdir_p!(routes_dir)
    File.write!(Path.join(root, "package.json"), "{}")

    script_path = Path.join(routes_dir, "route.mld")

    File.write!(
      script_path,
      """
      loop(99999, 50ms) until @state.exit [
        continue
      ]
      show "done"
      """
    )

    assert {:ok, handle} =
             Client.execute_async(
               client,
               script_path,
               nil,
               state: %{"exit" => false},
               timeout: 10_000
             )

    assert {:ok, write_result} = Handle.write_file(handle, "out.txt", "hello from sdk", timeout: 5_000)

    assert write_result.path == Path.join(routes_dir, "out.txt")
    assert write_result.status == "verified"
    assert write_result.verified
    assert write_result.signer == "agent:route"
    assert File.read!(Path.join(routes_dir, "out.txt")) == "hello from sdk"
    assert write_result.metadata["taint"] == ["untrusted"]

    assert write_result.metadata["provenance"] == %{
             "sourceType" => "mlld_execution",
             "sourceId" => Integer.to_string(Handle.request_id(handle)),
             "scriptPath" => script_path
           }

    assert :ok = Handle.update_state(handle, "exit", true)
    assert {:ok, final} = Handle.result(handle)
    assert final.output =~ "done"

    assert {:error, %Mlld.Error{code: "REQUEST_NOT_FOUND"}} =
             Handle.write_file(handle, "late.txt", "too late")
  end

  test "sign verify sign_content and fs_status roundtrip", %{client: client} do
    root = Path.join(System.tmp_dir!(), "mlld-elixir-sig-#{System.unique_integer([:positive])}")
    docs_dir = Path.join(root, "docs")
    File.mkdir_p!(docs_dir)
    File.write!(Path.join(root, "package.json"), "{}")
    File.write!(Path.join(docs_dir, "note.txt"), "hello from elixir sdk")

    assert {:ok, signed} =
             Client.sign(
               client,
               "docs/note.txt",
               identity: "user:alice",
               metadata: %{"purpose" => "sdk"},
               base_path: root,
               timeout: 10_000
             )

    assert {:ok, verified} =
             Client.verify(
               client,
               "docs/note.txt",
               base_path: root,
               timeout: 10_000
             )

    assert {:ok, content_signature} =
             Client.sign_content(
               client,
               "signed body",
               "user:alice",
               metadata: %{"channel" => "sdk"},
               signature_id: "content-1",
               base_path: root,
               timeout: 10_000
             )

    assert {:ok, statuses} =
             Client.fs_status(
               client,
               "docs/*.txt",
               base_path: root,
               timeout: 10_000
             )

    assert signed.status == "verified"
    assert signed.verified
    assert signed.signer == "user:alice"
    assert signed.metadata == %{"purpose" => "sdk"}

    assert verified.status == "verified"
    assert verified.verified
    assert verified.signer == "user:alice"
    assert verified.metadata == %{"purpose" => "sdk"}

    assert content_signature.id == "content-1"
    assert content_signature.signed_by == "user:alice"
    assert content_signature.metadata == %{"channel" => "sdk"}
    assert File.exists?(Path.join(root, ".sig/content/content-1.sig.json"))
    assert File.exists?(Path.join(root, ".sig/content/content-1.sig.content"))

    assert length(statuses) == 1
    assert hd(statuses).relative_path == "docs/note.txt"
    assert hd(statuses).status == "verified"
    assert hd(statuses).signer == "user:alice"
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
