defmodule Mlld.ProtocolFixturesTest do
  use ExUnit.Case, async: true

  alias Mlld.{Error, Protocol, Types}

  test "execute result fixture preserves security" do
    fixture = load_fixture!("execute-result.json")
    result = Types.decode_execute_result(fixture["result"])

    assert length(result.state_writes) == 1
    assert length(result.sessions) == 1
    assert hd(result.sessions).name == "planner"
    assert hd(result.sessions).final_state == %{"count" => 2, "status" => "done"}
    assert hd(result.state_writes).security["labels"] == ["trusted"]
    assert hd(result.effects).security["labels"] == ["trusted"]
  end

  test "analyze result fixture uses trigger" do
    fixture = load_fixture!("analyze-result.json")
    result = Types.decode_analyze_result(fixture["result"], "fallback.mld")

    assert length(result.guards) == 2
    assert hd(result.guards).trigger == "secret"
    assert Enum.at(result.guards, 1).name == ""
    assert Enum.at(result.guards, 1).trigger == "net:w"
  end

  test "state write event fixture preserves security" do
    fixture = load_fixture!("state-write-event.json")
    state_write = Protocol.state_write_from_event(fixture["event"])

    assert state_write.path == "payload"
    assert state_write.security["labels"] == ["trusted"]
  end

  test "session write event fixture preserves fields" do
    fixture = load_fixture!("session-write-event.json")
    session_write = Protocol.session_write_from_event(fixture["event"])

    assert session_write.session_name == "planner"
    assert session_write.slot_path == "count"
    assert session_write.operation == "increment"
    assert session_write.prev == 1
    assert session_write.next == 2
  end

  test "trace event fixture preserves fields" do
    fixture = load_fixture!("trace-event.json")
    trace_event = Protocol.trace_event_from_event(fixture["event"])

    assert trace_event.event == "guard.deny"
    assert trace_event.category == "guard"
    assert trace_event.scope["parentFrameId"] == "frame-parent"
    assert trace_event.data["operation"] == "send"
  end

  test "error fixture decodes transport error" do
    fixture = load_fixture!("error-result.json")
    error = fixture |> Protocol.error() |> Error.from_payload()

    assert error.code == "TIMEOUT"
    assert error.message =~ "timeout"
  end

  test "fs-status fixture preserves array payloads under result" do
    fixture = load_fixture!("fs-status-result.json")

    [status] = Enum.map(Protocol.result(fixture), &Types.decode_filesystem_status/1)

    assert status.relative_path == "docs/a.txt"
    assert status.labels == ["trusted"]
    assert status.taint == ["secret"]
  end

  test "sign-result fixture decodes file verify result" do
    fixture = load_fixture!("sign-result.json")
    result = Types.decode_file_verify_result(fixture["result"])

    assert result.relative_path == "docs/a.txt"
    assert result.expected_hash == "sha256:abc"
    assert result.metadata == %{"purpose" => "sdk"}
  end

  test "sign-content fixture decodes content signature" do
    fixture = load_fixture!("sign-content-result.json")
    result = Types.decode_content_signature(fixture["result"])

    assert result.id == "content-1"
    assert result.signed_by == "user:alice"
    assert result.metadata == %{"channel" => "sdk"}
  end

  defp load_fixture!(name) do
    path = Path.expand("../../fixtures/#{name}", __DIR__)
    {:ok, decoded} = path |> File.read!() |> Mlld.JSON.decode()
    decoded
  end
end
