defmodule Mlld.Phase1SurfaceTest do
  use ExUnit.Case, async: true

  alias Mlld.{Client, Port}

  test "labeled helpers wrap values with normalized labels" do
    assert %Mlld.LabeledValue{value: "hello", labels: ["trusted", "extra"]} =
             Mlld.labeled("hello", ["trusted", "extra", "trusted", ""])

    assert %Mlld.LabeledValue{labels: ["trusted"]} = Mlld.trusted("safe")
    assert %Mlld.LabeledValue{labels: ["untrusted"]} = Mlld.untrusted("tool")
  end

  test "process and execute request builders merge labeled payload fields and mcp servers" do
    assert {"process",
            %{
              "script" => "show @payload.history",
              "filePath" => "/repo/agent.mld",
              "payload" => %{
                "history" => "tool transcript",
                "query" => "hello",
                "plain" => "keep me"
              },
              "payloadLabels" => %{
                "history" => ["untrusted"],
                "query" => ["trusted", "extra"]
              },
              "dynamicModuleSource" => "sdk",
              "mcpServers" => %{"tools" => "uv run python3 mcp_server.py"},
              "allowAbsolutePaths" => true,
              "trace" => "effects",
              "traceMemory" => true,
              "traceFile" => "trace.jsonl",
              "traceStderr" => false,
              "recordEffects" => true
            }, 5_000} =
             Client.build_process_request("show @payload.history",
               file_path: "/repo/agent.mld",
               payload: %{
                 "history" => Mlld.untrusted("tool transcript"),
                 "query" => Mlld.trusted("hello"),
                 "plain" => "keep me"
               },
               payload_labels: %{"query" => ["extra", "trusted"]},
               mcp_servers: %{"tools" => "uv run python3 mcp_server.py"},
               dynamic_module_source: "sdk",
               allow_absolute_paths: true,
               trace: "effects",
               trace_memory: true,
               trace_file: "trace.jsonl",
               trace_stderr: false,
               timeout: 5_000
             )

    assert {"execute",
            %{
              "filepath" => "/repo/agent.mld",
              "recordEffects" => true,
              "payload" => %{"history" => "tool transcript"},
              "payloadLabels" => %{"history" => ["untrusted", "trusted"]},
              "mcpServers" => %{"tools" => "uv run python3 mcp_server.py"},
              "traceMemory" => true
            }, 6_000} =
             Client.build_execute_request(
               "/repo/agent.mld",
               %{"history" => Mlld.untrusted("tool transcript")},
               payload_labels: %{"history" => ["trusted"]},
               mcp_servers: %{"tools" => "uv run python3 mcp_server.py"},
               trace_memory: true,
               timeout: 6_000
             )
  end

  test "runtime startup args add wrapper and node heap flags" do
    assert {:ok, ["--mlld-heap=8g", "--heap-snapshot-near-limit", "2"]} =
             Port.runtime_startup_args("mlld", [], heap: "8g", heap_snapshot_near_limit: 2)

    assert {:ok,
            [
              "--max-old-space-size=8192",
              "--heapsnapshot-near-heap-limit=2",
              "./dist/cli.cjs"
            ]} =
             Port.runtime_startup_args("node", ["./dist/cli.cjs"],
               heap: "8g",
               heap_snapshot_near_limit: 2
             )

    assert {:error, %Mlld.Error{code: "INVALID_REQUEST"}} =
             Port.runtime_startup_args("node", [], heap: "nope")

    assert {:error, %Mlld.Error{code: "INVALID_REQUEST"}} =
             Port.runtime_startup_args("mlld", [], heap_snapshot_near_limit: 0)
  end

  test "request builders reject invalid payload_labels" do
    assert {:error, %Mlld.Error{code: "INVALID_REQUEST"}} =
             Client.build_execute_request("/repo/agent.mld", "hello",
               payload_labels: %{"text" => ["trusted"]}
             )

    assert {:error, %Mlld.Error{code: "INVALID_REQUEST"}} =
             Client.build_execute_request("/repo/agent.mld", %{"text" => "hello"},
               payload_labels: %{"missing" => ["untrusted"]}
             )
  end
end
