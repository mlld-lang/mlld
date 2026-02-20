defmodule Mlld.ClientTest do
  use ExUnit.Case, async: true

  alias Mlld.Client

  setup do
    {:ok, client} = Client.start_link(command: "mlld-command-that-does-not-exist", timeout: 250)
    [client: client]
  end

  test "returns transport error when command is missing", %{client: client} do
    assert {:error, %Mlld.Error{code: "TRANSPORT_ERROR"}} =
             Client.process(client, "/show \"hello\"\n", timeout: 100)
  end

  test "await_request returns request-not-found for unknown id", %{client: client} do
    assert {:error, %Mlld.Error{code: "REQUEST_NOT_FOUND"}} =
             Client.await_request(client, 999_999)
  end
end
