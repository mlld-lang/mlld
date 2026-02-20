defmodule Mlld.JSON do
  @moduledoc false

  @spec encode(term()) :: {:ok, iodata()} | {:error, term()}
  def encode(value) do
    {:ok, :json.encode(value)}
  rescue
    error -> {:error, error}
  end

  @spec decode(binary()) :: {:ok, term()} | {:error, term()}
  def decode(value) when is_binary(value) do
    {:ok, :json.decode(value)}
  rescue
    error -> {:error, error}
  end
end
