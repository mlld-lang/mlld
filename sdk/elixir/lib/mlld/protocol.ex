defmodule Mlld.Protocol do
  @moduledoc false

  alias Mlld.JSON
  alias Mlld.StateWrite

  @spec encode_request(String.t(), integer(), map()) :: {:ok, iodata()} | {:error, term()}
  def encode_request(method, request_id, params) when is_binary(method) and is_integer(request_id) do
    JSON.encode(%{"method" => method, "id" => request_id, "params" => params})
  end

  @spec encode_control(String.t(), integer(), map() | nil) :: {:ok, iodata()} | {:error, term()}
  def encode_control(method, request_id, params \\ nil)

  def encode_control(method, request_id, nil) do
    JSON.encode(%{"method" => method, "id" => request_id})
  end

  def encode_control(method, request_id, params) do
    JSON.encode(%{"method" => method, "id" => request_id, "params" => params})
  end

  @spec decode_envelope(binary()) :: {:ok, map()} | {:error, term()}
  def decode_envelope(line) when is_binary(line) do
    JSON.decode(line)
  end

  @spec event(map()) :: map() | nil
  def event(%{"event" => %{} = event}), do: event
  def event(_), do: nil

  @spec result(map()) :: map() | nil
  def result(%{"result" => %{} = result}), do: result
  def result(_), do: nil

  @spec request_id(term()) :: integer() | nil
  def request_id(value) when is_integer(value), do: value

  def request_id(value) when is_float(value) and value >= 0 do
    trunc(value)
  end

  def request_id(value) when is_binary(value) do
    case Integer.parse(value) do
      {parsed, ""} -> parsed
      _ -> nil
    end
  end

  def request_id(_), do: nil

  @spec state_write_from_event(map()) :: StateWrite.t() | nil
  def state_write_from_event(%{"type" => "state:write", "write" => %{} = write}) do
    case Map.get(write, "path") do
      path when is_binary(path) and path != "" ->
        %StateWrite{
          path: path,
          value: Map.get(write, "value"),
          timestamp: normalize_timestamp(Map.get(write, "timestamp"))
        }

      _ ->
        nil
    end
  end

  def state_write_from_event(_), do: nil

  @spec strip_result_id(map()) :: map()
  def strip_result_id(result) do
    Map.delete(result, "id")
  end

  defp normalize_timestamp(value) when is_binary(value), do: value
  defp normalize_timestamp(_), do: nil
end
