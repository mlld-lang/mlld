defmodule Mlld.Port do
  @moduledoc false

  alias Mlld.Error

  defstruct [
    :port,
    :command,
    :command_args,
    :heap,
    :heap_snapshot_near_limit,
    :working_dir,
    :buffer,
    :stderr_lines
  ]

  @type t :: %__MODULE__{
          port: port(),
          command: String.t(),
          command_args: [String.t()],
          heap: String.t() | integer() | nil,
          heap_snapshot_near_limit: pos_integer() | nil,
          working_dir: String.t() | nil,
          buffer: binary(),
          stderr_lines: [String.t()]
        }

  @spec open(keyword()) :: {:ok, t()} | {:error, Error.t()}
  def open(opts) do
    command = Keyword.get(opts, :command, "mlld")
    command_args = Keyword.get(opts, :command_args, []) |> Enum.map(&to_string/1)
    heap = Keyword.get(opts, :heap)
    heap_snapshot_near_limit = Keyword.get(opts, :heap_snapshot_near_limit)
    working_dir = normalize_working_dir(Keyword.get(opts, :working_dir))

    with {:ok, executable} <- resolve_executable(command),
         {:ok, runtime_args} <-
           runtime_startup_args(executable, command_args,
             heap: heap,
             heap_snapshot_near_limit: heap_snapshot_near_limit
           ),
         {:ok, port} <- open_port(executable, runtime_args, working_dir) do
      {:ok,
       %__MODULE__{
         port: port,
         command: command,
         command_args: runtime_args,
         heap: heap,
         heap_snapshot_near_limit: heap_snapshot_near_limit,
         working_dir: working_dir,
         buffer: "",
         stderr_lines: []
       }}
    end
  end

  @spec alive?(t() | nil) :: boolean()
  def alive?(%__MODULE__{port: port}) when is_port(port), do: Port.info(port) != nil
  def alive?(_), do: false

  @spec write(t(), iodata()) :: :ok | {:error, Error.t()}
  def write(%__MODULE__{port: port}, payload) do
    if Port.command(port, [payload, "\n"]) do
      :ok
    else
      {:error, Error.transport("failed to send request")}
    end
  rescue
    error ->
      {:error, Error.transport("failed to send request: #{Exception.message(error)}")}
  end

  @spec close(t() | nil) :: :ok
  def close(%__MODULE__{port: port}) when is_port(port) do
    Port.close(port)
    :ok
  rescue
    _ -> :ok
  end

  def close(_), do: :ok

  @spec consume_data(t(), binary()) :: {t(), [String.t()]}
  def consume_data(%__MODULE__{buffer: buffer} = transport, chunk) when is_binary(chunk) do
    data = buffer <> chunk
    parts = String.split(data, "\n")

    case parts do
      [] ->
        {%{transport | buffer: data}, []}

      _ ->
        line_count = length(parts)
        trailing = Enum.at(parts, line_count - 1, "")

        lines =
          parts
          |> Enum.take(max(line_count - 1, 0))
          |> Enum.map(&String.trim_trailing(&1, "\r"))

        {%{transport | buffer: trailing}, lines}
    end
  end

  @spec append_stderr(t(), String.t()) :: t()
  def append_stderr(%__MODULE__{stderr_lines: stderr_lines} = transport, line) do
    capped_lines =
      (stderr_lines ++ [line])
      |> Enum.take(-200)

    %{transport | stderr_lines: capped_lines}
  end

  @spec stderr(t()) :: String.t()
  def stderr(%__MODULE__{stderr_lines: lines}) do
    lines
    |> Enum.join("\n")
    |> String.trim()
  end

  defp resolve_executable(command) do
    case System.find_executable(command) do
      nil ->
        {:error,
         Error.transport("command not found: #{command}",
           code: "TRANSPORT_ERROR",
           details: %{command: command}
         )}

      executable ->
        {:ok, executable}
    end
  end

  @doc false
  def runtime_startup_args(command, command_args, opts \\ []) do
    heap = Keyword.get(opts, :heap)
    heap_snapshot_near_limit = Keyword.get(opts, :heap_snapshot_near_limit)
    args = Enum.map(command_args, &to_string/1)

    if is_nil(heap) and is_nil(heap_snapshot_near_limit) do
      {:ok, args}
    else
      with {:ok, heap_args} <- heap_args(command, heap),
           {:ok, snapshot_args} <- heap_snapshot_args(command, heap_snapshot_near_limit) do
        {:ok, heap_args ++ snapshot_args ++ args}
      end
    end
  end

  defp heap_args(_command, nil), do: {:ok, []}

  defp heap_args(command, heap) do
    if node_command?(command) do
      with {:ok, mb} <- parse_heap_to_mb(heap) do
        {:ok, ["--max-old-space-size=#{mb}"]}
      end
    else
      {:ok, ["--mlld-heap=#{heap}"]}
    end
  end

  defp heap_snapshot_args(_command, nil), do: {:ok, []}

  defp heap_snapshot_args(command, count) when is_integer(count) and count > 0 do
    if node_command?(command) do
      {:ok, ["--heapsnapshot-near-heap-limit=#{count}"]}
    else
      {:ok, ["--heap-snapshot-near-limit", to_string(count)]}
    end
  end

  defp heap_snapshot_args(_command, _count) do
    {:error, Error.invalid_request("heap_snapshot_near_limit must be a positive integer")}
  end

  defp node_command?(command) do
    command
    |> to_string()
    |> Path.basename()
    |> String.downcase()
    |> then(&(&1 in ["node", "node.exe", "nodejs", "nodejs.exe"]))
  end

  defp parse_heap_to_mb(heap) do
    raw = heap |> to_string() |> String.trim() |> String.downcase()

    case Regex.run(~r/^(\d+(?:\.\d+)?)\s*(m|mb|g|gb)?$/, raw) do
      [_, amount_text] ->
        heap_amount_to_mb(amount_text, "mb")

      [_, amount_text, unit] ->
        heap_amount_to_mb(amount_text, unit)

      _ ->
        {:error,
         Error.invalid_request("heap must be a positive memory size like 8192, 8192m, or 8g")}
    end
  end

  defp heap_amount_to_mb(amount_text, unit) do
    case Float.parse(amount_text) do
      {amount, ""} when amount > 0 ->
        mb = if unit in ["g", "gb"], do: amount * 1024, else: amount

        if mb < 1 do
          {:error, Error.invalid_request("heap must resolve to at least 1 MB")}
        else
          {:ok, round(mb)}
        end

      _ ->
        {:error, Error.invalid_request("heap must be a positive memory size")}
    end
  end

  defp open_port(executable, command_args, working_dir) do
    args = Enum.map(command_args ++ ["live", "--stdio"], &to_charlist/1)

    options =
      [
        :binary,
        :use_stdio,
        :exit_status,
        :hide,
        :stderr_to_stdout,
        {:args, args}
      ]
      |> maybe_add_cd(working_dir)

    {:ok, Port.open({:spawn_executable, to_charlist(executable)}, options)}
  rescue
    error ->
      {:error, Error.transport("failed to start live transport: #{Exception.message(error)}")}
  end

  defp maybe_add_cd(options, nil), do: options
  defp maybe_add_cd(options, working_dir), do: [{:cd, to_charlist(working_dir)} | options]

  defp normalize_working_dir(nil), do: nil

  defp normalize_working_dir(working_dir) do
    working_dir
    |> to_string()
    |> Path.expand()
  end
end
