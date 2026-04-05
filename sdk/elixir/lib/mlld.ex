defmodule Mlld do
  @moduledoc """
  Module-level convenience API backed by a lazily started default client.

  The default client is registered as `Mlld.DefaultClient`.
  """

  alias Mlld.Client

  @default_client_name Mlld.DefaultClient

  @spec default_client() :: pid()
  def default_client do
    case Process.whereis(@default_client_name) do
      nil ->
        case Client.start_link(name: @default_client_name) do
          {:ok, client} ->
            Process.unlink(client)
            client

          {:error, {:already_started, client}} ->
            client

          {:error, reason} ->
            raise "failed to start default mlld client: #{inspect(reason)}"
        end

      client ->
        client
    end
  end

  @spec close() :: :ok
  def close do
    case Process.whereis(@default_client_name) do
      nil -> :ok
      client -> Client.stop(client)
    end
  end

  @spec process(String.t(), keyword()) :: {:ok, String.t()} | {:error, Mlld.Error.t()}
  def process(script, opts \\ []) do
    Client.process(default_client(), script, opts)
  end

  @spec process_async(String.t(), keyword()) :: {:ok, Mlld.Handle.t()} | {:error, Mlld.Error.t()}
  def process_async(script, opts \\ []) do
    Client.process_async(default_client(), script, opts)
  end

  @spec execute(String.t(), term(), keyword()) ::
          {:ok, Mlld.ExecuteResult.t()} | {:error, Mlld.Error.t()}
  def execute(filepath, payload \\ nil, opts \\ []) do
    Client.execute(default_client(), filepath, payload, opts)
  end

  @spec execute_async(String.t(), term(), keyword()) ::
          {:ok, Mlld.Handle.t()} | {:error, Mlld.Error.t()}
  def execute_async(filepath, payload \\ nil, opts \\ []) do
    Client.execute_async(default_client(), filepath, payload, opts)
  end

  @spec analyze(String.t()) :: {:ok, Mlld.AnalyzeResult.t()} | {:error, Mlld.Error.t()}
  def analyze(filepath) do
    Client.analyze(default_client(), filepath)
  end

  @spec fs_status(String.t() | nil, keyword()) ::
          {:ok, [Mlld.FilesystemStatus.t()]} | {:error, Mlld.Error.t()}
  def fs_status(glob \\ nil, opts \\ []) do
    Client.fs_status(default_client(), glob, opts)
  end

  @spec sign(String.t(), keyword()) :: {:ok, Mlld.FileVerifyResult.t()} | {:error, Mlld.Error.t()}
  def sign(path, opts \\ []) do
    Client.sign(default_client(), path, opts)
  end

  @spec verify(String.t(), keyword()) ::
          {:ok, Mlld.FileVerifyResult.t()} | {:error, Mlld.Error.t()}
  def verify(path, opts \\ []) do
    Client.verify(default_client(), path, opts)
  end

  @spec sign_content(String.t(), String.t(), keyword()) ::
          {:ok, Mlld.ContentSignature.t()} | {:error, Mlld.Error.t()}
  def sign_content(content, identity, opts \\ []) do
    Client.sign_content(default_client(), content, identity, opts)
  end

  @spec labeled(term(), [String.t()] | String.t()) :: Mlld.LabeledValue.t()
  def labeled(value, labels) do
    normalized =
      labels
      |> List.wrap()
      |> Enum.filter(&is_binary/1)
      |> Enum.map(&String.trim/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()

    %Mlld.LabeledValue{value: value, labels: normalized}
  end

  @spec trusted(term()) :: Mlld.LabeledValue.t()
  def trusted(value), do: labeled(value, "trusted")

  @spec untrusted(term()) :: Mlld.LabeledValue.t()
  def untrusted(value), do: labeled(value, "untrusted")
end
