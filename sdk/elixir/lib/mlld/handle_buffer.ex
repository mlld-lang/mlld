defmodule Mlld.HandleBuffer do
  @moduledoc false

  use GenServer

  alias Mlld.{Client, HandleEvent, Protocol}

  @type state :: %{
          client: GenServer.server(),
          request_id: integer(),
          queue: :queue.queue(HandleEvent.t()),
          waiters: [{GenServer.from(), reference()}],
          guard_denials: [Mlld.GuardDenial.t()],
          complete: boolean(),
          complete_event_emitted: boolean(),
          result_consumed: boolean()
        }

  @spec start_link(GenServer.server(), integer()) :: GenServer.on_start()
  def start_link(client, request_id) do
    GenServer.start_link(__MODULE__, {client, request_id})
  end

  @spec next_event(pid(), non_neg_integer() | nil) :: HandleEvent.t() | nil
  def next_event(buffer, timeout_ms) do
    GenServer.call(buffer, {:next_event, timeout_ms}, :infinity)
  end

  @spec mark_result_consumed(pid()) :: :ok
  def mark_result_consumed(buffer) do
    GenServer.call(buffer, :mark_result_consumed, :infinity)
  end

  @spec guard_denials(pid()) :: [Mlld.GuardDenial.t()]
  def guard_denials(buffer) do
    GenServer.call(buffer, :guard_denials, :infinity)
  end

  @impl true
  def init({client, request_id}) do
    :ok = Client.subscribe(client, request_id, self())

    {:ok,
     %{
       client: client,
       request_id: request_id,
       queue: :queue.new(),
       waiters: [],
       guard_denials: [],
       complete: false,
       complete_event_emitted: false,
       result_consumed: false
     }}
  end

  @impl true
  def handle_call({:next_event, timeout_ms}, from, state) do
    case pop_event(state) do
      {event, next_state} when not is_nil(event) ->
        {:reply, event, next_state}

      {nil, %{complete: true}} ->
        {:reply, nil, state}

      {nil, _} when timeout_ms == 0 ->
        {:reply, nil, state}

      {nil, _} ->
        timer_ref =
          if is_integer(timeout_ms) and timeout_ms > 0 do
            Process.send_after(self(), {:next_event_timeout, from}, timeout_ms)
          else
            nil
          end

        {:noreply, %{state | waiters: state.waiters ++ [{from, timer_ref}]}}
    end
  end

  def handle_call(:mark_result_consumed, _from, state) do
    {:reply, :ok,
     %{
       state
       | queue: :queue.new(),
         complete_event_emitted: true,
         result_consumed: true
     }}
  end

  def handle_call(:guard_denials, _from, state) do
    {:reply, state.guard_denials, state}
  end

  @impl true
  def handle_info({:mlld_event, request_id, event}, %{request_id: request_id} = state) do
    next_state =
      case {
             Protocol.state_write_from_event(event),
             Protocol.session_write_from_event(event),
             Protocol.guard_denial_from_event(event)
           } do
        {%Mlld.StateWrite{} = state_write, _, _} ->
          enqueue_event(state, %HandleEvent{type: "state_write", state_write: state_write})

        {nil, %Mlld.SessionWrite{} = session_write, _} ->
          enqueue_event(state, %HandleEvent{type: "session_write", session_write: session_write})

        {nil, nil, %Mlld.GuardDenial{} = guard_denial} ->
          state
          |> Map.update!(:guard_denials, &(&1 ++ [guard_denial]))
          |> enqueue_event(%HandleEvent{type: "guard_denial", guard_denial: guard_denial})

        _ ->
          state
      end

    {:noreply, flush_waiters(next_state)}
  end

  def handle_info(
        {:mlld_result, request_id, {:ok, _result, _state_writes}},
        %{request_id: request_id} = state
      ) do
    next_state =
      if state.result_consumed do
        %{state | complete: true, complete_event_emitted: true, queue: :queue.new()}
      else
        state
        |> Map.put(:complete, true)
        |> enqueue_event(%HandleEvent{type: "complete"})
      end

    {:noreply, flush_waiters(next_state)}
  end

  def handle_info({:mlld_result, request_id, {:error, _error}}, %{request_id: request_id} = state) do
    next_state =
      reply_all_waiters_nil(%{
        state
        | complete: true,
          complete_event_emitted: true,
          queue: :queue.new()
      })

    {:noreply, next_state}
  end

  def handle_info({:next_event_timeout, from}, state) do
    {matched, remaining} =
      Enum.split_with(state.waiters, fn {waiter, _timer_ref} -> waiter == from end)

    Enum.each(matched, fn {waiter, _timer_ref} ->
      GenServer.reply(waiter, nil)
    end)

    {:noreply, %{state | waiters: remaining}}
  end

  def handle_info(_message, state), do: {:noreply, state}

  defp enqueue_event(%{result_consumed: true} = state, _event), do: state

  defp enqueue_event(state, event) do
    %{state | queue: :queue.in(event, state.queue)}
  end

  defp pop_event(state) do
    case :queue.out(state.queue) do
      {{:value, event}, next_queue} ->
        next_state = %{state | queue: next_queue}

        if event.type == "complete" do
          {event, %{next_state | complete_event_emitted: true}}
        else
          {event, next_state}
        end

      {:empty, _queue} ->
        {nil, state}
    end
  end

  defp flush_waiters(state) do
    case {pop_event(state), state.waiters} do
      {{nil, _}, _} ->
        state

      {{_event, _next_state}, []} ->
        state

      {{event, next_state}, [{waiter, timer_ref} | rest]} ->
        maybe_cancel_timer(timer_ref)
        GenServer.reply(waiter, event)
        flush_waiters(%{next_state | waiters: rest})
    end
  end

  defp reply_all_waiters_nil(state) do
    Enum.each(state.waiters, fn {waiter, timer_ref} ->
      maybe_cancel_timer(timer_ref)
      GenServer.reply(waiter, nil)
    end)

    %{state | waiters: []}
  end

  defp maybe_cancel_timer(timer_ref) do
    if is_reference(timer_ref) do
      Process.cancel_timer(timer_ref)
    end
  end
end
