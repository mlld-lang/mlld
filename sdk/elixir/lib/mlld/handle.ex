defmodule Mlld.Handle do
  @moduledoc """
  Handle for in-flight `process_async/3` and `execute_async/4` requests.

  Handles are task-compatible:

      {:ok, handle} = Mlld.Client.execute_async(client, "script.mld", %{})
      result = Mlld.Handle.result(handle)

  For direct Task usage, use `Mlld.Client.process_task/3` or `Mlld.Client.execute_task/4`.
  """

  alias Mlld.{Client, Error}
  alias Mlld.HandleBuffer

  defstruct [:client, :request_id, :task, :kind, :buffer]

  @type kind :: :process | :execute

  @type t :: %__MODULE__{
          client: GenServer.server(),
          request_id: integer(),
          task: Task.t(),
          kind: kind(),
          buffer: pid()
        }

  @spec new(GenServer.server(), integer(), Task.t(), kind()) :: t()
  def new(client, request_id, task, kind) do
    {:ok, buffer} = HandleBuffer.start_link(client, request_id)
    %__MODULE__{client: client, request_id: request_id, task: task, kind: kind, buffer: buffer}
  end

  @spec request_id(t()) :: integer()
  def request_id(%__MODULE__{request_id: request_id}), do: request_id

  @spec cancel(t()) :: :ok
  def cancel(%__MODULE__{client: client, request_id: request_id}) do
    Client.cancel_request(client, request_id)
  end

  @spec update_state(t(), String.t(), term(), keyword()) :: :ok | {:error, Mlld.Error.t()}
  def update_state(%__MODULE__{client: client, request_id: request_id}, path, value, opts \\ []) do
    Client.update_state(client, request_id, path, value, opts)
  end

  @spec write_file(t(), String.t(), String.t(), keyword()) ::
          {:ok, Mlld.FileVerifyResult.t()} | {:error, Mlld.Error.t()}
  def write_file(handle, path, content, opts \\ [])

  def write_file(
        %__MODULE__{kind: :execute, client: client, request_id: request_id},
        path,
        content,
        opts
      ) do
    Client.write_file(client, request_id, path, content, opts)
  end

  def write_file(%__MODULE__{}, _path, _content, _opts) do
    {:error, Error.invalid_request("write_file is only available on execute handles")}
  end

  @spec next_event(t(), timeout()) :: Mlld.HandleEvent.t() | nil
  def next_event(%__MODULE__{buffer: buffer}, timeout \\ 5_000) do
    HandleBuffer.next_event(buffer, poll_timeout_value(timeout))
  end

  @spec wait(t(), timeout()) :: {:ok, term()} | {:error, Mlld.Error.t()}
  def wait(handle, timeout \\ :infinity), do: result(handle, timeout)

  @spec result(t(), timeout()) :: {:ok, term()} | {:error, Mlld.Error.t()}
  def result(
        %__MODULE__{client: client, request_id: request_id, kind: kind, buffer: buffer},
        timeout \\ :infinity
      ) do
    status =
      case Client.await_request(client, request_id, timeout) do
        {:ok, result, _state_writes} when kind == :process ->
          {:ok, Mlld.Types.decode_output(result)}

        {:ok, result, state_writes} when kind == :execute ->
          {:ok, Mlld.Types.decode_execute_result(result, state_writes)}
          |> then(fn {:ok, execute_result} ->
            denials =
              Mlld.Types.merge_guard_denials(
                execute_result.denials,
                HandleBuffer.guard_denials(buffer)
              )

            {:ok, %{execute_result | denials: denials}}
          end)

        {:error, %Mlld.Error{} = error} ->
          {:error, error}
      end

    :ok = HandleBuffer.mark_result_consumed(buffer)
    status
  end

  @spec task(t()) :: Task.t()
  def task(%__MODULE__{task: task}), do: task

  defp poll_timeout_value(:infinity), do: nil
  defp poll_timeout_value(value) when is_integer(value) and value >= 0, do: value
  defp poll_timeout_value(_), do: nil
end
