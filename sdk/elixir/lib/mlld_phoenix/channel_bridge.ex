defmodule MlldPhoenix.ChannelBridge do
  @moduledoc """
  Optional Phoenix bridge for forwarding mlld execution events to channel pushes.

  This module compiles without Phoenix as a dependency. If Phoenix is not loaded
  at runtime, calls return `{:error, :phoenix_not_available}`.
  """

  alias Mlld.{Client, Error, Handle}

  @spec stream_execute(term(), String.t(), term(), keyword()) ::
          {:ok, Handle.t()} | {:error, Error.t() | :phoenix_not_available}
  def stream_execute(socket, filepath, payload, opts \\ []) when is_binary(filepath) do
    if phoenix_available?() do
      client = Keyword.get(opts, :client, Mlld.default_client())
      event_topic = Keyword.get(opts, :event_topic, "mlld:event")
      result_topic = Keyword.get(opts, :result_topic, "mlld:result")
      idle_timeout = Keyword.get(opts, :idle_timeout, 120_000)

      execute_opts =
        opts
        |> Keyword.drop([:client, :event_topic, :result_topic, :idle_timeout])

      with {:ok, handle} <- Client.execute_async(client, filepath, payload, execute_opts) do
        request_id = Handle.request_id(handle)
        {:ok, relay_pid} = Task.start(fn -> relay_loop(socket, request_id, event_topic, result_topic, idle_timeout) end)

        case Client.subscribe(client, request_id, relay_pid) do
          :ok ->
            {:ok, handle}

          {:error, %Error{} = error} ->
            Process.exit(relay_pid, :shutdown)
            {:error, error}
        end
      end
    else
      {:error, :phoenix_not_available}
    end
  end

  defp relay_loop(socket, request_id, event_topic, result_topic, idle_timeout) do
    receive do
      {:mlld_event, ^request_id, event} ->
        _ = push(socket, event_topic, event)
        relay_loop(socket, request_id, event_topic, result_topic, idle_timeout)

      {:mlld_result, ^request_id, {:ok, result, state_writes}} ->
        payload = %{
          "ok" => true,
          "requestId" => request_id,
          "result" => result,
          "stateWrites" => Enum.map(state_writes, &state_write_payload/1)
        }

        _ = push(socket, result_topic, payload)
        :ok

      {:mlld_result, ^request_id, {:error, %Error{} = error}} ->
        payload = %{
          "ok" => false,
          "requestId" => request_id,
          "error" => %{"message" => error.message, "code" => error.code}
        }

        _ = push(socket, result_topic, payload)
        :ok
    after
      idle_timeout ->
        payload = %{
          "ok" => false,
          "requestId" => request_id,
          "error" => %{"message" => "channel relay timed out", "code" => "TIMEOUT"}
        }

        _ = push(socket, result_topic, payload)
        :ok
    end
  end

  defp state_write_payload(state_write) do
    %{
      "path" => state_write.path,
      "value" => state_write.value,
      "timestamp" => state_write.timestamp
    }
  end

  defp push(socket, topic, payload) do
    apply(Phoenix.Channel, :push, [socket, topic, payload])
  rescue
    _ -> :ok
  end

  defp phoenix_available? do
    Code.ensure_loaded?(Phoenix.Channel) and function_exported?(Phoenix.Channel, :push, 3)
  end
end
