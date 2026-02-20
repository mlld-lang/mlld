defmodule Mlld.Handle do
  @moduledoc """
  Handle for in-flight `process_async/3` and `execute_async/4` requests.

  Handles are task-compatible:

      {:ok, handle} = Mlld.Client.execute_async(client, "script.mld", %{})
      result = Mlld.Handle.result(handle)

  For direct Task usage, use `Mlld.Client.process_task/3` or `Mlld.Client.execute_task/4`.
  """

  alias Mlld.Client

  defstruct [:client, :request_id, :task, :kind]

  @type kind :: :process | :execute

  @type t :: %__MODULE__{
          client: GenServer.server(),
          request_id: integer(),
          task: Task.t(),
          kind: kind()
        }

  @spec new(GenServer.server(), integer(), Task.t(), kind()) :: t()
  def new(client, request_id, task, kind) do
    %__MODULE__{client: client, request_id: request_id, task: task, kind: kind}
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

  @spec wait(t(), timeout()) :: {:ok, term()} | {:error, Mlld.Error.t()}
  def wait(handle, timeout \\ :infinity), do: result(handle, timeout)

  @spec result(t(), timeout()) :: {:ok, term()} | {:error, Mlld.Error.t()}
  def result(%__MODULE__{task: task}, timeout \\ :infinity) do
    Task.await(task, timeout)
  catch
    :exit, {:timeout, _} ->
      {:error, Mlld.Error.timeout(timeout_value(timeout))}

    :exit, reason ->
      {:error, Mlld.Error.transport("async handle exited: #{inspect(reason)}")}
  end

  @spec task(t()) :: Task.t()
  def task(%__MODULE__{task: task}), do: task

  defp timeout_value(:infinity), do: 0
  defp timeout_value(value) when is_integer(value), do: value
  defp timeout_value(_), do: 0
end
