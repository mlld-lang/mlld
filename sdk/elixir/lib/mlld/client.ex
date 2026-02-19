defmodule Mlld.Client do
  @moduledoc """
  GenServer-based mlld client using a persistent `mlld live --stdio` transport.

  The client multiplexes many in-flight requests over one Erlang Port and supports:

  - synchronous `process/3`, `execute/4`, `analyze/2`
  - async `process_async/3`, `execute_async/4` handles
  - in-flight `cancel_request/2` and `update_state/5`
  - per-request timeout with cancel-on-timeout
  - transport death detection and lazy restart on next request
  - optional named registration for discovery in supervision trees
  """

  use GenServer

  alias Mlld.{Error, Handle, Port, Protocol, Telemetry, Types}

  @default_timeout 30_000
  @default_completed_limit 1_024
  @opt_key_mapping %{
    "filePath" => :file_path,
    "file_path" => :file_path,
    "payload" => :payload,
    "state" => :state,
    "dynamicModules" => :dynamic_modules,
    "dynamic_modules" => :dynamic_modules,
    "dynamicModuleSource" => :dynamic_module_source,
    "dynamic_module_source" => :dynamic_module_source,
    "mode" => :mode,
    "allowAbsolutePaths" => :allow_absolute_paths,
    "allow_absolute_paths" => :allow_absolute_paths,
    "timeout" => :timeout
  }

  @type request_status ::
          {:ok, map(), [Mlld.StateWrite.t()]}
          | {:error, Mlld.Error.t()}

  @type client_option ::
          {:name, GenServer.name()}
          | {:command, String.t()}
          | {:command_args, [String.t()]}
          | {:timeout, non_neg_integer() | nil}
          | {:working_dir, String.t()}
          | {:completed_limit, pos_integer()}

  @type process_option ::
          {:file_path, String.t()}
          | {:payload, term()}
          | {:state, map()}
          | {:dynamic_modules, map()}
          | {:dynamic_module_source, String.t()}
          | {:mode, :strict | :markdown | String.t()}
          | {:allow_absolute_paths, boolean()}
          | {:timeout, non_neg_integer() | nil}

  @type execute_option ::
          {:state, map()}
          | {:dynamic_modules, map()}
          | {:dynamic_module_source, String.t()}
          | {:mode, :strict | :markdown | String.t()}
          | {:allow_absolute_paths, boolean()}
          | {:timeout, non_neg_integer() | nil}

  @type start_result :: {:ok, pid()} | {:error, term()}

  @spec start_link([client_option()]) :: start_result()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name)
    GenServer.start_link(__MODULE__, opts, if(name, do: [name: name], else: []))
  end

  def child_spec(opts) do
    name = Keyword.get(opts, :name)

    %{
      id: name || __MODULE__,
      start: {__MODULE__, :start_link, [opts]},
      type: :worker,
      restart: :permanent,
      shutdown: 5_000
    }
  end

  @spec stop(GenServer.server(), timeout()) :: :ok
  def stop(client, timeout \\ 5_000) do
    GenServer.stop(client, :normal, timeout)
  end

  @spec process(GenServer.server(), String.t(), [process_option()]) ::
          {:ok, String.t()} | {:error, Error.t()}
  def process(client, script, opts \\ []) when is_binary(script) do
    with {:ok, handle} <- process_async(client, script, opts) do
      Handle.result(handle)
    end
  end

  @spec process_async(GenServer.server(), String.t(), [process_option()]) ::
          {:ok, Handle.t()} | {:error, Error.t()}
  def process_async(client, script, opts \\ []) when is_binary(script) do
    opts = normalize_opts(opts)
    timeout_ms = requested_timeout(opts)

    params =
      %{"script" => script}
      |> put_if_present("filePath", Keyword.get(opts, :file_path))
      |> put_if_present("payload", Keyword.get(opts, :payload))
      |> put_if_present("state", Keyword.get(opts, :state))
      |> put_if_present("dynamicModules", Keyword.get(opts, :dynamic_modules))
      |> put_if_present("dynamicModuleSource", Keyword.get(opts, :dynamic_module_source))
      |> put_if_present("mode", normalize_mode(Keyword.get(opts, :mode)))
      |> put_if_present("allowAbsolutePaths", Keyword.get(opts, :allow_absolute_paths))

    with {:ok, request_id} <- start_request(client, "process", params, timeout_ms) do
      emit_start(:process, request_id, %{file_path: Keyword.get(opts, :file_path), mode: params["mode"]})

      task =
        Task.async(fn ->
          started_at = System.monotonic_time()

          case await_request(client, request_id) do
            {:ok, result, _state_writes} ->
              output = Types.decode_output(result)

              emit_stop(:process, request_id, started_at, %{output_size: byte_size(output)})
              {:ok, output}

            {:error, %Error{} = error} ->
              emit_exception(:process, request_id, started_at, error)
              {:error, error}
          end
        end)

      {:ok, Handle.new(client, request_id, task, :process)}
    end
  end

  @spec execute(GenServer.server(), String.t(), term(), [execute_option()]) ::
          {:ok, Mlld.ExecuteResult.t()} | {:error, Error.t()}
  def execute(client, filepath, payload \\ nil, opts \\ []) when is_binary(filepath) do
    with {:ok, handle} <- execute_async(client, filepath, payload, opts) do
      Handle.result(handle)
    end
  end

  @spec execute_async(GenServer.server(), String.t(), term(), [execute_option()]) ::
          {:ok, Handle.t()} | {:error, Error.t()}
  def execute_async(client, filepath, payload \\ nil, opts \\ []) when is_binary(filepath) do
    opts = normalize_opts(opts)
    timeout_ms = requested_timeout(opts)

    params =
      %{"filepath" => filepath}
      |> put_if_present("payload", payload)
      |> put_if_present("state", Keyword.get(opts, :state))
      |> put_if_present("dynamicModules", Keyword.get(opts, :dynamic_modules))
      |> put_if_present("dynamicModuleSource", Keyword.get(opts, :dynamic_module_source))
      |> put_if_present("allowAbsolutePaths", Keyword.get(opts, :allow_absolute_paths))
      |> put_if_present("mode", normalize_mode(Keyword.get(opts, :mode)))

    with {:ok, request_id} <- start_request(client, "execute", params, timeout_ms) do
      emit_start(:execute, request_id, %{filepath: filepath})

      task =
        Task.async(fn ->
          started_at = System.monotonic_time()

          case await_request(client, request_id) do
            {:ok, result, state_writes} ->
              execute_result = Types.decode_execute_result(result, state_writes)

              emit_stop(:execute, request_id, started_at, %{
                output_size: byte_size(execute_result.output),
                state_write_count: length(execute_result.state_writes)
              })

              {:ok, execute_result}

            {:error, %Error{} = error} ->
              emit_exception(:execute, request_id, started_at, error)
              {:error, error}
          end
        end)

      {:ok, Handle.new(client, request_id, task, :execute)}
    end
  end

  @spec analyze(GenServer.server(), String.t()) :: {:ok, Mlld.AnalyzeResult.t()} | {:error, Error.t()}
  def analyze(client, filepath) when is_binary(filepath) do
    Telemetry.span(:analyze, %{filepath: filepath}, fn ->
      with {:ok, result, _state_writes} <- call_request(client, "analyze", %{"filepath" => filepath}, nil) do
        {:ok, Types.decode_analyze_result(result, filepath)}
      end
    end)
  end

  @spec process_task(GenServer.server(), String.t(), [process_option()]) :: Task.t()
  def process_task(client, script, opts \\ []) do
    Task.async(fn -> process(client, script, opts) end)
  end

  @spec execute_task(GenServer.server(), String.t(), term(), [execute_option()]) :: Task.t()
  def execute_task(client, filepath, payload \\ nil, opts \\ []) do
    Task.async(fn -> execute(client, filepath, payload, opts) end)
  end

  @spec await_request(GenServer.server(), integer()) ::
          {:ok, map(), [Mlld.StateWrite.t()]} | {:error, Error.t()}
  def await_request(client, request_id) when is_integer(request_id) do
    GenServer.call(client, {:await_request, request_id}, :infinity)
  end

  @spec cancel_request(GenServer.server(), integer()) :: :ok
  def cancel_request(client, request_id) when is_integer(request_id) do
    GenServer.cast(client, {:cancel_request, request_id})
    :ok
  end

  @spec update_state(GenServer.server(), integer(), String.t(), term(), keyword()) ::
          :ok | {:error, Error.t()}
  def update_state(client, request_id, path, value, opts \\ [])

  def update_state(client, request_id, path, value, opts)
      when is_integer(request_id) and is_binary(path) do
    if String.trim(path) == "" do
      {:error, Error.invalid_request("state update path is required")}
    else
      opts = normalize_opts(opts)
      resolved_timeout = resolve_timeout_for_update(client, Keyword.get(opts, :timeout))
      max_wait = resolved_timeout || 2_000
      deadline = System.monotonic_time(:millisecond) + max_wait
      do_update_state(client, request_id, path, value, resolved_timeout, deadline)
    end
  end

  def update_state(_client, _request_id, _path, _value, _opts) do
    {:error, Error.invalid_request("state update path is required")}
  end

  @spec subscribe(GenServer.server(), integer(), pid()) :: :ok | {:error, Error.t()}
  def subscribe(client, request_id, subscriber \\ self()) when is_integer(request_id) and is_pid(subscriber) do
    GenServer.call(client, {:subscribe, request_id, subscriber})
  end

  @spec unsubscribe(GenServer.server(), integer(), pid()) :: :ok
  def unsubscribe(client, request_id, subscriber \\ self())
      when is_integer(request_id) and is_pid(subscriber) do
    GenServer.call(client, {:unsubscribe, request_id, subscriber})
  end

  @impl true
  def init(opts) do
    {:ok,
     %{
       command: Keyword.get(opts, :command, "mlld"),
       command_args: Keyword.get(opts, :command_args, []),
       timeout: normalize_timeout(Keyword.get(opts, :timeout, @default_timeout)),
       working_dir: Keyword.get(opts, :working_dir),
       completed_limit: Keyword.get(opts, :completed_limit, @default_completed_limit),
       next_request_id: 0,
       transport: nil,
       pending: %{},
       completed: %{},
       completed_order: :queue.new(),
       subscribers: %{},
       transport_generation: 0
     }}
  end

  @impl true
  def handle_call({:start_request, method, params, timeout_override}, _from, state) do
    with {:ok, state} <- ensure_transport(state),
         {:ok, payload} <- Protocol.encode_request(method, state.next_request_id, params),
         :ok <- Port.write(state.transport, payload) do
      request_id = state.next_request_id
      timeout_ms = timeout_override || state.timeout
      timeout_ref = schedule_timeout(request_id, timeout_ms)

      pending = %{
        method: method,
        timeout_ms: timeout_ms,
        timeout_ref: timeout_ref,
        state_writes: [],
        waiters: []
      }

      new_state = %{
        state
        | next_request_id: request_id + 1,
          pending: Map.put(state.pending, request_id, pending)
      }

      {:reply, {:ok, request_id}, new_state}
    else
      {:error, %Error{} = error} ->
        {:reply, {:error, error}, invalidate_transport(state)}

      {:error, reason} ->
        error = Error.transport("failed to encode request: #{inspect(reason)}")
        {:reply, {:error, error}, state}
    end
  end

  def handle_call({:await_request, request_id}, from, state) do
    case {Map.get(state.completed, request_id), Map.get(state.pending, request_id)} do
      {{:ok, result, state_writes}, _pending} ->
        {:reply, {:ok, result, state_writes}, state}

      {{:error, %Error{} = error}, _pending} ->
        {:reply, {:error, error}, state}

      {nil, nil} ->
        {:reply, {:error, %Error{message: "request not found", code: "REQUEST_NOT_FOUND"}}, state}

      {nil, pending} ->
        updated_pending = %{pending | waiters: [from | pending.waiters]}
        {:noreply, put_in(state.pending[request_id], updated_pending)}
    end
  end

  def handle_call({:subscribe, request_id, subscriber}, _from, state) do
    cond do
      Map.has_key?(state.pending, request_id) ->
        subscribers =
          Map.update(state.subscribers, request_id, MapSet.new([subscriber]), fn existing ->
            MapSet.put(existing, subscriber)
          end)

        {:reply, :ok, %{state | subscribers: subscribers}}

      Map.has_key?(state.completed, request_id) ->
        send(subscriber, {:mlld_result, request_id, Map.fetch!(state.completed, request_id)})
        {:reply, :ok, state}

      true ->
        {:reply, {:error, %Error{message: "request not found", code: "REQUEST_NOT_FOUND"}}, state}
    end
  end

  def handle_call({:unsubscribe, request_id, subscriber}, _from, state) do
    subscribers =
      case Map.get(state.subscribers, request_id) do
        nil ->
          state.subscribers

        set ->
          next_set = MapSet.delete(set, subscriber)

          if MapSet.size(next_set) == 0 do
            Map.delete(state.subscribers, request_id)
          else
            Map.put(state.subscribers, request_id, next_set)
          end
      end

    {:reply, :ok, %{state | subscribers: subscribers}}
  end

  def handle_call(:default_timeout, _from, state) do
    {:reply, state.timeout, state}
  end

  @impl true
  def handle_cast({:cancel_request, request_id}, state) do
    {:noreply, send_control_request(state, "cancel", request_id, nil)}
  end

  @impl true
  def handle_info({:request_timeout, request_id}, state) do
    case Map.get(state.pending, request_id) do
      nil ->
        {:noreply, state}

      pending ->
        state = send_control_request(state, "cancel", request_id, nil)
        timeout_ms = pending.timeout_ms || 0
        error = Error.timeout(timeout_ms)
        {:noreply, complete_request(state, request_id, {:error, error})}
    end
  end

  def handle_info({port, {:data, data}}, %{transport: %Port{port: port} = transport} = state)
      when is_binary(data) do
    {transport, lines} = Port.consume_data(transport, data)
    state = %{state | transport: transport}

    next_state =
      Enum.reduce(lines, state, fn line, acc ->
        line = String.trim(line)

        cond do
          line == "" ->
            acc

          true ->
            case Protocol.decode_envelope(line) do
              {:ok, envelope} -> handle_envelope(envelope, acc)
              {:error, _reason} -> append_transport_stderr(acc, line)
            end
        end
      end)

    {:noreply, next_state}
  end

  def handle_info({port, {:exit_status, return_code}}, %{transport: %Port{port: port}} = state) do
    message =
      case state.transport do
        %Port{} = transport ->
          stderr = Port.stderr(transport)
          if stderr == "", do: "live transport closed", else: stderr

        _ ->
          "live transport closed"
      end

    error = Error.transport(message, return_code: return_code)
    next_state = state |> fail_all_pending(error) |> invalidate_transport()
    {:noreply, next_state}
  end

  def handle_info(_message, state), do: {:noreply, state}

  @impl true
  def terminate(_reason, state) do
    Port.close(state.transport)
    :ok
  end

  defp do_update_state(client, request_id, path, value, timeout_ms, deadline_ms) do
    params = %{"requestId" => request_id, "path" => path, "value" => value}

    case call_request(client, "state:update", params, timeout_ms) do
      {:ok, _result, _state_writes} ->
        :ok

      {:error, %Error{code: "REQUEST_NOT_FOUND"} = error} ->
        if System.monotonic_time(:millisecond) >= deadline_ms do
          {:error, error}
        else
          Process.sleep(25)
          do_update_state(client, request_id, path, value, timeout_ms, deadline_ms)
        end

      {:error, %Error{} = error} ->
        {:error, error}
    end
  end

  defp call_request(client, method, params, timeout_ms) do
    with {:ok, request_id} <- start_request(client, method, params, timeout_ms),
         {:ok, result, state_writes} <- await_request(client, request_id) do
      {:ok, result, state_writes}
    end
  end

  defp start_request(client, method, params, timeout_ms) do
    GenServer.call(client, {:start_request, method, params, timeout_ms}, :infinity)
  end

  defp schedule_timeout(_request_id, nil), do: nil

  defp schedule_timeout(request_id, timeout_ms) when is_integer(timeout_ms) and timeout_ms > 0 do
    Process.send_after(self(), {:request_timeout, request_id}, timeout_ms)
  end

  defp schedule_timeout(_request_id, _timeout_ms), do: nil

  defp ensure_transport(%{transport: %Port{} = transport} = state) do
    if Port.alive?(transport) do
      {:ok, state}
    else
      message = Port.stderr(transport)
      error = Error.transport(if(message == "", do: "live transport closed", else: message))

      state =
        state
        |> fail_all_pending(error)
        |> invalidate_transport()

      open_transport(state)
    end
  end

  defp ensure_transport(state), do: open_transport(state)

  defp open_transport(state) do
    case Port.open(
           command: state.command,
           command_args: state.command_args,
           working_dir: state.working_dir
         ) do
      {:ok, transport} ->
        next_generation = state.transport_generation + 1

        if state.transport_generation > 0 do
          Telemetry.execute([:transport, :restart], %{count: next_generation}, %{
            command: state.command,
            command_args: state.command_args
          })
        end

        {:ok, %{state | transport: transport, transport_generation: next_generation}}

      {:error, %Error{} = error} ->
        {:error, error}
    end
  end

  defp invalidate_transport(state) do
    Port.close(state.transport)
    %{state | transport: nil}
  end

  defp send_control_request(%{transport: nil} = state, _method, _request_id, _params), do: state

  defp send_control_request(state, method, request_id, params) do
    with {:ok, payload} <- Protocol.encode_control(method, request_id, params),
         :ok <- Port.write(state.transport, payload) do
      state
    else
      _ -> invalidate_transport(state)
    end
  end

  defp handle_envelope(envelope, state) do
    state =
      case Protocol.event(envelope) do
        %{} = event ->
          handle_event(event, state)

        nil ->
          state
      end

    case Protocol.result(envelope) do
      %{} = result ->
        handle_result(result, state)

      nil ->
        state
    end
  end

  defp handle_event(event, state) do
    case Protocol.request_id(Map.get(event, "id")) do
      nil ->
        state

      request_id ->
        case Map.get(state.pending, request_id) do
          nil ->
            state

          pending ->
            updated_pending =
              case Protocol.state_write_from_event(event) do
                %Mlld.StateWrite{} = state_write ->
                  %{pending | state_writes: [state_write | pending.state_writes]}

                nil ->
                  pending
              end

            state
            |> put_in([:pending, request_id], updated_pending)
            |> notify_subscribers(request_id, {:mlld_event, request_id, event})
        end
      end
  end

  defp handle_result(result, state) do
    case Protocol.request_id(Map.get(result, "id")) do
      nil ->
        state

      request_id ->
        case Map.get(state.pending, request_id) do
          nil ->
            state

          pending ->
            request_status =
              case Map.get(result, "error") do
                %{} = error_payload ->
                  {:error, Error.from_payload(error_payload)}

                _ ->
                  {:ok, Protocol.strip_result_id(result), Enum.reverse(pending.state_writes)}
              end

            complete_request(state, request_id, request_status)
        end
    end
  end

  defp fail_all_pending(state, %Error{} = error) do
    pending_ids = Map.keys(state.pending)

    Enum.reduce(pending_ids, state, fn request_id, acc ->
      complete_request(acc, request_id, {:error, error})
    end)
  end

  defp complete_request(state, request_id, status) do
    pending = Map.get(state.pending, request_id)

    if pending && pending.timeout_ref do
      Process.cancel_timer(pending.timeout_ref)
    end

    waiters = if pending, do: Enum.reverse(pending.waiters), else: []

    Enum.each(waiters, fn waiter ->
      GenServer.reply(waiter, status)
    end)

    state
    |> put_completed_result(request_id, status)
    |> remove_pending_request(request_id)
    |> notify_completion(request_id, status)
  end

  defp put_completed_result(state, request_id, status) do
    completed = Map.put(state.completed, request_id, status)
    order = :queue.in(request_id, state.completed_order)
    prune_completed(%{state | completed: completed, completed_order: order})
  end

  defp prune_completed(state) do
    if map_size(state.completed) <= state.completed_limit do
      state
    else
      {{:value, oldest_request_id}, next_order} = :queue.out(state.completed_order)
      next_completed = Map.delete(state.completed, oldest_request_id)
      prune_completed(%{state | completed: next_completed, completed_order: next_order})
    end
  end

  defp remove_pending_request(state, request_id) do
    %{state | pending: Map.delete(state.pending, request_id)}
  end

  defp notify_completion(state, request_id, status) do
    state = notify_subscribers(state, request_id, {:mlld_result, request_id, status})
    %{state | subscribers: Map.delete(state.subscribers, request_id)}
  end

  defp notify_subscribers(state, request_id, message) do
    Enum.each(Map.get(state.subscribers, request_id, []), fn subscriber ->
      send(subscriber, message)
    end)

    state
  end

  defp append_transport_stderr(%{transport: %Port{} = transport} = state, line) do
    %{state | transport: Port.append_stderr(transport, line)}
  end

  defp append_transport_stderr(state, _line), do: state

  defp requested_timeout(opts) do
    normalize_timeout(Keyword.get(opts, :timeout))
  end

  defp resolve_timeout_for_update(client, timeout_override) do
    case normalize_timeout(timeout_override) do
      nil -> GenServer.call(client, :default_timeout)
      timeout -> timeout
    end
  end

  defp normalize_timeout(nil), do: nil
  defp normalize_timeout(:infinity), do: nil

  defp normalize_timeout(timeout) when is_integer(timeout) and timeout > 0 do
    timeout
  end

  defp normalize_timeout(_), do: nil

  defp normalize_mode(mode) when mode in [:strict, :markdown], do: Atom.to_string(mode)
  defp normalize_mode(mode) when is_binary(mode), do: mode
  defp normalize_mode(_), do: nil

  defp put_if_present(map, _key, nil), do: map
  defp put_if_present(map, _key, :undefined), do: map
  defp put_if_present(map, key, value), do: Map.put(map, key, value)

  defp normalize_opts(opts) when is_list(opts), do: opts

  defp normalize_opts(opts) when is_map(opts) do
    opts
    |> Enum.reduce([], fn {key, value}, acc ->
      case normalize_opt_key(key) do
        normalized_key when is_atom(normalized_key) -> [{normalized_key, value} | acc]
        _ -> acc
      end
    end)
    |> Enum.reverse()
  end

  defp normalize_opts(_), do: []

  defp normalize_opt_key(key) when is_atom(key), do: key

  defp normalize_opt_key(key) when is_binary(key) do
    Map.get(@opt_key_mapping, key, key)
  end

  defp normalize_opt_key(key), do: key

  defp emit_start(operation, request_id, metadata) do
    Telemetry.execute([operation, :start], %{system_time: System.system_time()}, Map.put(metadata, :request_id, request_id))
  end

  defp emit_stop(operation, request_id, started_at, metadata) do
    Telemetry.execute(
      [operation, :stop],
      %{duration: System.monotonic_time() - started_at},
      Map.merge(metadata, %{request_id: request_id})
    )
  end

  defp emit_exception(operation, request_id, started_at, %Error{} = error) do
    Telemetry.execute(
      [operation, :exception],
      %{duration: System.monotonic_time() - started_at},
      %{request_id: request_id, code: error.code, reason: error.message, kind: :error}
    )
  end
end
