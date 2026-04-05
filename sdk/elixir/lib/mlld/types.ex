defmodule Mlld.StateWrite do
  @moduledoc "Represents a write to `state://` during execution."
  defstruct [:path, :value, :timestamp, :security]

  @type t :: %__MODULE__{
          path: String.t(),
          value: term(),
          timestamp: String.t() | nil,
          security: map() | nil
        }
end

defmodule Mlld.Metrics do
  @moduledoc "Execution timing metrics from mlld."
  defstruct total_ms: 0.0, parse_ms: 0.0, evaluate_ms: 0.0

  @type t :: %__MODULE__{
          total_ms: number(),
          parse_ms: number(),
          evaluate_ms: number()
        }
end

defmodule Mlld.Effect do
  @moduledoc "An execution effect emitted by mlld."
  defstruct [:type, :content, :security]

  @type t :: %__MODULE__{
          type: String.t(),
          content: String.t() | nil,
          security: map() | nil
        }
end

defmodule Mlld.GuardDenial do
  @moduledoc "Structured information about a denied guard/policy decision."
  defstruct guard: nil, operation: "", reason: "", rule: nil, labels: [], args: nil

  @type t :: %__MODULE__{
          guard: String.t() | nil,
          operation: String.t(),
          reason: String.t(),
          rule: String.t() | nil,
          labels: [String.t()],
          args: map() | nil
        }
end

defmodule Mlld.HandleEvent do
  @moduledoc "An event from an in-flight execution."
  defstruct type: "", state_write: nil, guard_denial: nil

  @type t :: %__MODULE__{
          type: String.t(),
          state_write: Mlld.StateWrite.t() | nil,
          guard_denial: Mlld.GuardDenial.t() | nil
        }
end

defmodule Mlld.ExecuteResult do
  @moduledoc "Structured output from `execute/3`."
  defstruct output: "", state_writes: [], exports: [], effects: [], denials: [], metrics: nil

  @type t :: %__MODULE__{
          output: String.t(),
          state_writes: [Mlld.StateWrite.t()],
          exports: term(),
          effects: [Mlld.Effect.t()],
          denials: [Mlld.GuardDenial.t()],
          metrics: Mlld.Metrics.t() | nil
        }
end

defmodule Mlld.LabeledValue do
  @moduledoc "Wrapper used to attach security labels to individual payload fields."
  defstruct value: nil, labels: []

  @type t :: %__MODULE__{
          value: term(),
          labels: [String.t()]
        }
end

defmodule Mlld.FilesystemStatus do
  @moduledoc "Signature status metadata for a file."
  defstruct path: "",
            relative_path: "",
            status: "",
            verified: false,
            signer: nil,
            labels: [],
            taint: [],
            signed_at: nil,
            error: nil

  @type t :: %__MODULE__{
          path: String.t(),
          relative_path: String.t(),
          status: String.t(),
          verified: boolean(),
          signer: String.t() | nil,
          labels: [String.t()],
          taint: [String.t()],
          signed_at: String.t() | nil,
          error: String.t() | nil
        }
end

defmodule Mlld.FileVerifyResult do
  @moduledoc "Signature verification metadata for a file."
  defstruct path: "",
            relative_path: "",
            status: "",
            verified: false,
            signer: nil,
            signed_at: nil,
            hash: nil,
            expected_hash: nil,
            metadata: nil,
            error: nil

  @type t :: %__MODULE__{
          path: String.t(),
          relative_path: String.t(),
          status: String.t(),
          verified: boolean(),
          signer: String.t() | nil,
          signed_at: String.t() | nil,
          hash: String.t() | nil,
          expected_hash: String.t() | nil,
          metadata: map() | nil,
          error: String.t() | nil
        }
end

defmodule Mlld.ContentSignature do
  @moduledoc "Persistent signature metadata for signed content."
  defstruct id: "",
            hash: "",
            algorithm: "",
            signed_by: "",
            signed_at: "",
            content_length: 0,
            metadata: nil

  @type t :: %__MODULE__{
          id: String.t(),
          hash: String.t(),
          algorithm: String.t(),
          signed_by: String.t(),
          signed_at: String.t(),
          content_length: integer(),
          metadata: %{optional(String.t()) => String.t()} | nil
        }
end

defmodule Mlld.Executable do
  @moduledoc "Executable function metadata from `analyze/2`."
  defstruct name: "", params: [], labels: []

  @type t :: %__MODULE__{
          name: String.t(),
          params: [String.t()],
          labels: [String.t()]
        }
end

defmodule Mlld.Import do
  @moduledoc "Import metadata from `analyze/2`."
  defstruct from: "", names: []

  @type t :: %__MODULE__{
          from: String.t(),
          names: [String.t()]
        }
end

defmodule Mlld.Guard do
  @moduledoc "Guard metadata from `analyze/2`."
  defstruct name: "", timing: "", trigger: ""

  @type t :: %__MODULE__{
          name: String.t(),
          timing: String.t(),
          trigger: String.t()
        }
end

defmodule Mlld.Needs do
  @moduledoc "Capability requirements from `analyze/2`."
  defstruct cmd: [], node: [], py: []

  @type t :: %__MODULE__{
          cmd: [String.t()],
          node: [String.t()],
          py: [String.t()]
        }
end

defmodule Mlld.AnalysisError do
  @moduledoc "Parse or analysis error item from `analyze/2`."
  defstruct message: "", line: nil, column: nil

  @type t :: %__MODULE__{
          message: String.t(),
          line: integer() | nil,
          column: integer() | nil
        }
end

defmodule Mlld.AnalyzeResult do
  @moduledoc "Static analysis result from `analyze/2`."
  defstruct filepath: "",
            valid: true,
            errors: [],
            executables: [],
            exports: [],
            imports: [],
            guards: [],
            needs: nil

  @type t :: %__MODULE__{
          filepath: String.t(),
          valid: boolean(),
          errors: [Mlld.AnalysisError.t()],
          executables: [Mlld.Executable.t()],
          exports: [String.t()],
          imports: [Mlld.Import.t()],
          guards: [Mlld.Guard.t()],
          needs: Mlld.Needs.t() | nil
        }
end

defmodule Mlld.Types do
  @moduledoc false

  alias Mlld.{
    AnalysisError,
    AnalyzeResult,
    ContentSignature,
    Effect,
    Executable,
    ExecuteResult,
    FileVerifyResult,
    FilesystemStatus,
    Guard,
    GuardDenial,
    Import,
    Metrics,
    Needs,
    StateWrite
  }

  alias Mlld.JSON

  @spec decode_execute_result(map(), [StateWrite.t()]) :: ExecuteResult.t()
  def decode_execute_result(result, streamed_state_writes \\ []) when is_map(result) do
    state_writes =
      result
      |> Map.get("stateWrites", [])
      |> Enum.flat_map(&decode_state_write/1)
      |> merge_state_writes(streamed_state_writes)

    metrics = decode_metrics(Map.get(result, "metrics"))

    effects =
      result
      |> Map.get("effects", [])
      |> Enum.flat_map(&decode_effect/1)

    denials =
      result
      |> Map.get("denials", [])
      |> Enum.flat_map(&decode_guard_denial/1)

    %ExecuteResult{
      output: decode_output(result),
      state_writes: state_writes,
      exports: Map.get(result, "exports", []),
      effects: effects,
      denials: denials,
      metrics: metrics
    }
  end

  @spec decode_analyze_result(map(), String.t()) :: AnalyzeResult.t()
  def decode_analyze_result(result, fallback_filepath) when is_map(result) do
    %AnalyzeResult{
      filepath: to_string(Map.get(result, "filepath", fallback_filepath)),
      valid: Map.get(result, "valid", true),
      errors: decode_analysis_errors(Map.get(result, "errors", [])),
      executables: decode_executables(Map.get(result, "executables", [])),
      exports: decode_string_list(Map.get(result, "exports", [])),
      imports: decode_imports(Map.get(result, "imports", [])),
      guards: decode_guards(Map.get(result, "guards", [])),
      needs: decode_needs(Map.get(result, "needs"))
    }
  end

  @spec decode_file_verify_result(map()) :: FileVerifyResult.t()
  def decode_file_verify_result(payload) when is_map(payload) do
    %FileVerifyResult{
      path: payload |> Map.get("path", "") |> to_string(),
      relative_path:
        payload
        |> Map.get("relativePath", Map.get(payload, "relative_path", ""))
        |> to_string(),
      status: payload |> Map.get("status", "") |> to_string(),
      verified: Map.get(payload, "verified", false) == true,
      signer: normalize_optional_string(Map.get(payload, "signer")),
      signed_at: normalize_optional_string(Map.get(payload, "signedAt")),
      hash: normalize_optional_string(Map.get(payload, "hash")),
      expected_hash: normalize_optional_string(Map.get(payload, "expectedHash")),
      metadata: normalize_map(Map.get(payload, "metadata")),
      error: normalize_optional_string(Map.get(payload, "error"))
    }
  end

  @spec decode_filesystem_status(map()) :: FilesystemStatus.t()
  def decode_filesystem_status(payload) when is_map(payload) do
    %FilesystemStatus{
      path: payload |> Map.get("path", "") |> to_string(),
      relative_path:
        payload
        |> Map.get("relativePath", Map.get(payload, "relative_path", ""))
        |> to_string(),
      status: payload |> Map.get("status", "") |> to_string(),
      verified: Map.get(payload, "verified", false) == true,
      signer: normalize_optional_string(Map.get(payload, "signer")),
      labels: decode_string_list(Map.get(payload, "labels", [])),
      taint: decode_string_list(Map.get(payload, "taint", [])),
      signed_at: normalize_optional_string(Map.get(payload, "signedAt")),
      error: normalize_optional_string(Map.get(payload, "error"))
    }
  end

  @spec decode_content_signature(map()) :: ContentSignature.t()
  def decode_content_signature(payload) when is_map(payload) do
    %ContentSignature{
      id: payload |> Map.get("id", "") |> to_string(),
      hash: payload |> Map.get("hash", "") |> to_string(),
      algorithm: payload |> Map.get("algorithm", "") |> to_string(),
      signed_by:
        payload
        |> Map.get("signedBy", Map.get(payload, "signed_by", ""))
        |> to_string(),
      signed_at:
        payload
        |> Map.get("signedAt", Map.get(payload, "signed_at", ""))
        |> to_string(),
      content_length:
        payload
        |> Map.get("contentLength", Map.get(payload, "content_length", 0))
        |> normalize_integer(),
      metadata: normalize_string_map(Map.get(payload, "metadata"))
    }
  end

  @spec decode_output(term()) :: String.t()
  def decode_output(result) when is_map(result) do
    cond do
      is_binary(result["output"]) -> result["output"]
      Map.has_key?(result, "output") -> inspect(result["output"])
      true -> inspect(result)
    end
  end

  def decode_output(result) when is_binary(result), do: result
  def decode_output(nil), do: ""
  def decode_output(result), do: inspect(result)

  @spec merge_state_writes([StateWrite.t()], [StateWrite.t()]) :: [StateWrite.t()]
  def merge_state_writes(primary, secondary) do
    (primary ++ secondary)
    |> Enum.reduce({MapSet.new(), []}, fn state_write, {seen, acc} ->
      key = state_write_key(state_write)

      if MapSet.member?(seen, key) do
        {seen, acc}
      else
        {MapSet.put(seen, key), [state_write | acc]}
      end
    end)
    |> elem(1)
    |> Enum.reverse()
  end

  @spec merge_guard_denials([GuardDenial.t()], [GuardDenial.t()]) :: [GuardDenial.t()]
  def merge_guard_denials(primary, secondary) do
    (primary ++ secondary)
    |> Enum.reduce({MapSet.new(), []}, fn denial, {seen, acc} ->
      key = guard_denial_key(denial)

      if MapSet.member?(seen, key) do
        {seen, acc}
      else
        {MapSet.put(seen, key), [denial | acc]}
      end
    end)
    |> elem(1)
    |> Enum.reverse()
  end

  @spec state_write_key(StateWrite.t()) :: String.t()
  def state_write_key(%StateWrite{} = write) do
    encoded_value =
      case JSON.encode(write.value) do
        {:ok, json} -> IO.iodata_to_binary(json)
        {:error, _} -> inspect(write.value)
      end

    "#{write.path}|#{encoded_value}"
  end

  @spec guard_denial_key(GuardDenial.t()) :: String.t()
  def guard_denial_key(%GuardDenial{} = denial) do
    encoded_args =
      case JSON.encode(denial.args) do
        {:ok, json} -> IO.iodata_to_binary(json)
        {:error, _} -> inspect(denial.args)
      end

    labels = denial.labels |> Enum.sort() |> Enum.join(",")

    "#{denial.guard}|#{denial.operation}|#{denial.reason}|#{denial.rule}|#{labels}|#{encoded_args}"
  end

  defp decode_state_write(entry) when is_map(entry) do
    path = entry |> Map.get("path", "") |> to_string()

    if path == "" do
      []
    else
      [
        %StateWrite{
          path: path,
          value: decode_state_write_value(Map.get(entry, "value")),
          timestamp: normalize_optional_string(Map.get(entry, "timestamp")),
          security: normalize_map(Map.get(entry, "security"))
        }
      ]
    end
  end

  defp decode_state_write(_), do: []

  defp decode_metrics(%{} = entry) do
    %Metrics{
      total_ms: normalize_number(Map.get(entry, "totalMs", 0.0)),
      parse_ms: normalize_number(Map.get(entry, "parseMs", 0.0)),
      evaluate_ms: normalize_number(Map.get(entry, "evaluateMs", 0.0))
    }
  end

  defp decode_metrics(_), do: nil

  defp decode_effect(entry) when is_map(entry) do
    [
      %Effect{
        type: entry |> Map.get("type", "") |> to_string(),
        content: normalize_optional_string(Map.get(entry, "content")),
        security: normalize_map(Map.get(entry, "security"))
      }
    ]
  end

  defp decode_effect(_), do: []

  defp decode_guard_denial(entry) when is_map(entry) do
    operation = entry |> Map.get("operation", "") |> to_string()
    reason = entry |> Map.get("reason", "") |> to_string()

    if operation == "" or reason == "" do
      []
    else
      [
        %GuardDenial{
          guard: normalize_optional_string(Map.get(entry, "guard")),
          operation: operation,
          reason: reason,
          rule: normalize_optional_string(Map.get(entry, "rule")),
          labels: decode_string_list(Map.get(entry, "labels", [])),
          args: normalize_map(Map.get(entry, "args"))
        }
      ]
    end
  end

  defp decode_guard_denial(_), do: []

  defp decode_analysis_errors(entries) do
    entries
    |> List.wrap()
    |> Enum.flat_map(fn
      %{} = entry ->
        [
          %AnalysisError{
            message: entry |> Map.get("message", "") |> to_string(),
            line: normalize_optional_integer(Map.get(entry, "line")),
            column: normalize_optional_integer(Map.get(entry, "column"))
          }
        ]

      _ ->
        []
    end)
  end

  defp decode_executables(entries) do
    entries
    |> List.wrap()
    |> Enum.flat_map(fn
      %{} = entry ->
        [
          %Executable{
            name: entry |> Map.get("name", "") |> to_string(),
            params: decode_string_list(Map.get(entry, "params", [])),
            labels: decode_string_list(Map.get(entry, "labels", []))
          }
        ]

      _ ->
        []
    end)
  end

  defp decode_imports(entries) do
    entries
    |> List.wrap()
    |> Enum.flat_map(fn
      %{} = entry ->
        [
          %Import{
            from: entry |> Map.get("from", "") |> to_string(),
            names: decode_string_list(Map.get(entry, "names", []))
          }
        ]

      _ ->
        []
    end)
  end

  defp decode_guards(entries) do
    entries
    |> List.wrap()
    |> Enum.flat_map(fn
      %{} = entry ->
        [
          %Guard{
            name: entry |> Map.get("name", "") |> to_string(),
            timing: entry |> Map.get("timing", "") |> to_string(),
            trigger:
              entry
              |> Map.get("trigger", Map.get(entry, "label", ""))
              |> to_string()
          }
        ]

      _ ->
        []
    end)
  end

  defp decode_needs(%{} = entry) do
    %Needs{
      cmd: decode_string_list(Map.get(entry, "cmd", [])),
      node: decode_string_list(Map.get(entry, "node", [])),
      py: decode_string_list(Map.get(entry, "py", []))
    }
  end

  defp decode_needs(_), do: nil

  defp decode_string_list(values) do
    values
    |> List.wrap()
    |> Enum.map(&to_string/1)
  end

  defp normalize_string_map(value) when is_map(value) do
    normalized =
      value
      |> Enum.reduce(%{}, fn
        {key, item}, acc when is_binary(key) and is_binary(item) -> Map.put(acc, key, item)
        _, acc -> acc
      end)

    if map_size(normalized) == 0, do: nil, else: normalized
  end

  defp normalize_string_map(_), do: nil

  defp normalize_optional_string(value) when is_binary(value), do: value
  defp normalize_optional_string(value) when is_nil(value), do: nil
  defp normalize_optional_string(value), do: to_string(value)

  defp normalize_map(value) when is_map(value), do: value
  defp normalize_map(_), do: nil

  defp normalize_optional_integer(value) when is_integer(value), do: value

  defp normalize_optional_integer(value) when is_float(value) do
    trunc(value)
  end

  defp normalize_optional_integer(value) when is_binary(value) do
    case Integer.parse(value) do
      {parsed, ""} -> parsed
      _ -> nil
    end
  end

  defp normalize_optional_integer(_), do: nil

  defp normalize_integer(value) when is_integer(value), do: value
  defp normalize_integer(value) when is_float(value), do: trunc(value)

  defp normalize_integer(value) when is_binary(value) do
    case Integer.parse(value) do
      {parsed, ""} -> parsed
      _ -> 0
    end
  end

  defp normalize_integer(_), do: 0

  defp normalize_number(value) when is_number(value), do: value

  defp normalize_number(value) when is_binary(value) do
    case Float.parse(value) do
      {parsed, ""} -> parsed
      _ -> 0.0
    end
  end

  defp normalize_number(_), do: 0.0

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
