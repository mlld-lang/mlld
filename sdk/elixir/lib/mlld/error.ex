defmodule Mlld.Error do
  @moduledoc """
  Exception raised for mlld SDK and transport errors.
  """

  defexception [:message, :code, :return_code, details: nil]

  @type t :: %__MODULE__{
          message: String.t(),
          code: String.t() | nil,
          return_code: integer() | nil,
          details: term()
        }

  @spec from_payload(map(), String.t()) :: t()
  def from_payload(payload, fallback_message \\ "mlld request failed") when is_map(payload) do
    message =
      payload
      |> Map.get("message", fallback_message)
      |> to_string()

    code =
      case Map.get(payload, "code") do
        value when is_binary(value) and value != "" -> value
        _ -> nil
      end

    %__MODULE__{message: message, code: code}
  end

  @spec transport(String.t(), keyword()) :: t()
  def transport(message, opts \\ []) do
    %__MODULE__{
      message: message,
      code: Keyword.get(opts, :code, "TRANSPORT_ERROR"),
      return_code: Keyword.get(opts, :return_code),
      details: Keyword.get(opts, :details)
    }
  end

  @spec timeout(non_neg_integer()) :: t()
  def timeout(timeout_ms) do
    %__MODULE__{
      message: "request timeout after #{timeout_ms}ms",
      code: "TIMEOUT",
      details: %{timeout_ms: timeout_ms}
    }
  end

  @spec invalid_request(String.t()) :: t()
  def invalid_request(message) do
    %__MODULE__{message: message, code: "INVALID_REQUEST"}
  end
end
