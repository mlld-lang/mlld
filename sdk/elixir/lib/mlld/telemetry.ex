defmodule Mlld.Telemetry do
  @moduledoc false

  @prefix [:mlld]

  @spec execute([atom()], map(), map()) :: :ok
  def execute(event_suffix, measurements, metadata \\ %{}) when is_list(event_suffix) do
    if Code.ensure_loaded?(:telemetry) and function_exported?(:telemetry, :execute, 3) do
      apply(:telemetry, :execute, [@prefix ++ event_suffix, measurements, metadata])
    end

    :ok
  rescue
    _ -> :ok
  end

  @spec span(atom(), map(), (() -> {:ok, term()} | {:error, term()})) :: {:ok, term()} | {:error, term()}
  def span(operation, metadata, fun) when is_atom(operation) and is_function(fun, 0) do
    start_native = System.monotonic_time()
    start_system = System.system_time()

    execute([operation, :start], %{system_time: start_system}, metadata)

    case fun.() do
      {:ok, _result} = ok ->
        duration = System.monotonic_time() - start_native
        execute([operation, :stop], %{duration: duration}, Map.put(metadata, :result, :ok))
        ok

      {:error, reason} = error ->
        duration = System.monotonic_time() - start_native

        execute(
          [operation, :exception],
          %{duration: duration},
          Map.merge(metadata, %{kind: :error, reason: inspect(reason), result: :error})
        )

        error
    end
  end
end
