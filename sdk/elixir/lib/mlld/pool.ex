defmodule Mlld.Pool do
  @moduledoc """
  Connection pool for `Mlld.Client` processes.

  Base clients are started at pool boot (`size`), and temporary overflow clients
  are created on demand up to `overflow`.
  """

  use GenServer

  alias Mlld.Client

  @type pool_option ::
          {:name, GenServer.name()}
          | {:size, pos_integer()}
          | {:overflow, non_neg_integer()}
          | {:checkout_timeout, non_neg_integer()}
          | {:command, String.t()}
          | {:command_args, [String.t()]}
          | {:timeout, non_neg_integer() | nil}
          | {:working_dir, String.t()}

  @spec start_link([pool_option()]) :: GenServer.on_start()
  def start_link(opts) do
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

  @spec checkout(GenServer.server(), pid(), timeout()) :: {:ok, pid()} | {:error, :empty | term()}
  def checkout(pool, owner \\ self(), timeout \\ 5_000) do
    GenServer.call(pool, {:checkout, owner}, timeout)
  end

  @spec checkin(GenServer.server(), pid()) :: :ok
  def checkin(pool, client) when is_pid(client) do
    GenServer.cast(pool, {:checkin, client})
    :ok
  end

  @spec process(GenServer.server(), String.t(), keyword()) :: {:ok, String.t()} | {:error, Mlld.Error.t()}
  def process(pool, script, opts \\ []) do
    with_client(pool, fn client -> Client.process(client, script, opts) end)
  end

  @spec execute(GenServer.server(), String.t(), term(), keyword()) ::
          {:ok, Mlld.ExecuteResult.t()} | {:error, Mlld.Error.t()}
  def execute(pool, filepath, payload \\ nil, opts \\ []) do
    with_client(pool, fn client -> Client.execute(client, filepath, payload, opts) end)
  end

  @spec analyze(GenServer.server(), String.t()) :: {:ok, Mlld.AnalyzeResult.t()} | {:error, Mlld.Error.t()}
  def analyze(pool, filepath) do
    with_client(pool, fn client -> Client.analyze(client, filepath) end)
  end

  @impl true
  def init(opts) do
    size = max(Keyword.get(opts, :size, 5), 1)
    overflow = max(Keyword.get(opts, :overflow, 0), 0)
    checkout_timeout = Keyword.get(opts, :checkout_timeout, 5_000)

    client_opts =
      opts
      |> Keyword.take([:command, :command_args, :timeout, :working_dir])

    clients =
      Enum.map(1..size, fn _ ->
        {:ok, client} = Client.start_link(client_opts)
        client
      end)

    {:ok,
     %{
       size: size,
       overflow: overflow,
       checkout_timeout: checkout_timeout,
       client_opts: client_opts,
       base_clients: MapSet.new(clients),
       overflow_clients: MapSet.new(),
       available: :queue.from_list(clients),
       leases: %{},
       owner_refs: %{},
       pending_checkouts: :queue.new()
     }}
  end

  @impl true
  def handle_call({:checkout, owner}, from, state) do
    case checkout_client(state, owner) do
      {:ok, client, next_state} ->
        {:reply, {:ok, client}, next_state}

      {:error, :empty, next_state} ->
        pending_checkouts = :queue.in({from, owner, now_ms() + state.checkout_timeout}, next_state.pending_checkouts)
        {:noreply, %{next_state | pending_checkouts: pending_checkouts}}

      {:error, reason, next_state} ->
        {:reply, {:error, reason}, next_state}
    end
  end

  @impl true
  def handle_cast({:checkin, client}, state) do
    {:noreply, checkin_client(state, client)}
  end

  @impl true
  def handle_info({:DOWN, ref, :process, owner, _reason}, state) do
    case Map.get(state.owner_refs, ref) do
      nil ->
        {:noreply, state}

      leased_client ->
        leases = Map.delete(state.leases, leased_client)
        owner_refs = Map.delete(state.owner_refs, ref)
        state = %{state | leases: leases, owner_refs: owner_refs}
        {:noreply, checkin_client(state, leased_client, owner)}
    end
  end

  def handle_info(_message, state), do: {:noreply, state}

  defp with_client(pool, fun) when is_function(fun, 1) do
    with {:ok, client} <- checkout(pool) do
      try do
        fun.(client)
      after
        checkin(pool, client)
      end
    end
  end

  defp checkout_client(state, owner) do
    case :queue.out(state.available) do
      {{:value, client}, available} ->
        ref = Process.monitor(owner)

        next_state =
          state
          |> put_in([:available], available)
          |> put_in([:leases, client], {owner, ref})
          |> put_in([:owner_refs, ref], client)

        {:ok, client, next_state}

      {:empty, _} ->
        if MapSet.size(state.overflow_clients) < state.overflow do
          case Client.start_link(state.client_opts) do
            {:ok, client} ->
              ref = Process.monitor(owner)

              next_state =
                state
                |> put_in([:leases, client], {owner, ref})
                |> put_in([:owner_refs, ref], client)
                |> put_in([:overflow_clients], MapSet.put(state.overflow_clients, client))

              {:ok, client, next_state}

            {:error, reason} ->
              {:error, reason, state}
          end
        else
          {:error, :empty, state}
        end
    end
  end

  defp checkin_client(state, client, _owner \\ nil) do
    case Map.get(state.leases, client) do
      nil ->
        state

      {_owner, ref} ->
        Process.demonitor(ref, [:flush])
        leases = Map.delete(state.leases, client)
        owner_refs = Map.delete(state.owner_refs, ref)

        next_state = %{state | leases: leases, owner_refs: owner_refs}

        cond do
          MapSet.member?(next_state.overflow_clients, client) ->
            Client.stop(client)

            next_state
            |> put_in([:overflow_clients], MapSet.delete(next_state.overflow_clients, client))
            |> service_pending_checkouts()

          true ->
            available = :queue.in(client, next_state.available)
            %{next_state | available: available} |> service_pending_checkouts()
        end
    end
  end

  defp service_pending_checkouts(state) do
    case :queue.out(state.pending_checkouts) do
      {:empty, _} ->
        state

      {{:value, {from, owner, deadline_ms}}, pending_checkouts} ->
        state = %{state | pending_checkouts: pending_checkouts}

        if now_ms() > deadline_ms do
          GenServer.reply(from, {:error, :empty})
          service_pending_checkouts(state)
        else
          case checkout_client(state, owner) do
            {:ok, client, next_state} ->
              GenServer.reply(from, {:ok, client})
              next_state

            {:error, :empty, next_state} ->
              pending_checkouts = :queue.in({from, owner, deadline_ms}, next_state.pending_checkouts)
              %{next_state | pending_checkouts: pending_checkouts}

            {:error, reason, next_state} ->
              GenServer.reply(from, {:error, reason})
              service_pending_checkouts(next_state)
          end
        end
    end
  end

  defp now_ms do
    System.monotonic_time(:millisecond)
  end
end
