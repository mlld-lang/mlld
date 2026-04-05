defmodule Mlld.Protocol do
  @moduledoc false

  alias Mlld.{GuardDenial, JSON, StateWrite}

  @spec encode_request(String.t(), integer(), map()) :: {:ok, iodata()} | {:error, term()}
  def encode_request(method, request_id, params)
      when is_binary(method) and is_integer(request_id) do
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

  @spec result(map()) :: term() | nil
  def result(%{"result" => result}), do: result
  def result(_), do: nil

  @spec error(map()) :: map() | nil
  def error(%{"error" => %{} = error}), do: error
  def error(_), do: nil

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
          value: decode_state_write_value(Map.get(write, "value")),
          timestamp: normalize_timestamp(Map.get(write, "timestamp")),
          security: normalize_map(Map.get(write, "security"))
        }

      _ ->
        nil
    end
  end

  def state_write_from_event(_), do: nil

  @spec guard_denial_from_event(map()) :: GuardDenial.t() | nil
  def guard_denial_from_event(%{"type" => "guard_denial", "guard_denial" => %{} = payload}) do
    operation = payload |> Map.get("operation", "") |> to_string()
    reason = payload |> Map.get("reason", "") |> to_string()

    if operation == "" or reason == "" do
      nil
    else
      %GuardDenial{
        guard: normalize_optional_string(Map.get(payload, "guard")),
        operation: operation,
        reason: reason,
        rule: normalize_optional_string(Map.get(payload, "rule")),
        labels: decode_string_list(Map.get(payload, "labels", [])),
        args: normalize_map(Map.get(payload, "args"))
      }
    end
  end

  def guard_denial_from_event(_), do: nil

  defp normalize_timestamp(value) when is_binary(value), do: value
  defp normalize_timestamp(_), do: nil

  defp normalize_map(value) when is_map(value), do: value
  defp normalize_map(_), do: nil

  defp normalize_optional_string(value) when is_binary(value), do: value
  defp normalize_optional_string(nil), do: nil
  defp normalize_optional_string(value), do: to_string(value)

  defp decode_string_list(values) do
    values
    |> List.wrap()
    |> Enum.filter(&is_binary/1)
  end

  defp decode_state_write_value(value) when is_binary(value) do
    trimmed = String.trim(value)

    if composite_json?(trimmed) do
      case JSON.decode(value) do
        {:ok, decoded} -> decoded
        {:error, _reason} -> value
      end
    else
      value
    end
  end

  defp decode_state_write_value(value), do: value

  defp composite_json?(value) when byte_size(value) < 2, do: false

  defp composite_json?(value) do
    (String.starts_with?(value, "{") and String.ends_with?(value, "}")) or
      (String.starts_with?(value, "[") and String.ends_with?(value, "]"))
  end
end
