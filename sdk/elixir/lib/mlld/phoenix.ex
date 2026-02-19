defmodule Mlld.Phoenix do
  @moduledoc """
  Convenience wrappers for optional Phoenix integration.
  """

  alias MlldPhoenix.ChannelBridge

  @spec stream_execute(term(), String.t(), term(), keyword()) ::
          {:ok, Mlld.Handle.t()} | {:error, Mlld.Error.t() | :phoenix_not_available}
  def stream_execute(socket, filepath, payload, opts \\ []) do
    ChannelBridge.stream_execute(socket, filepath, payload, opts)
  end
end
