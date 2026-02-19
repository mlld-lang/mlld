defmodule MlldTest do
  use ExUnit.Case, async: true

  alias Mlld.Client

  test "close/0 is a no-op when default client is not running" do
    assert :ok = Mlld.close()
  end

  test "update_state validates path before transport request" do
    assert {:error, %Mlld.Error{code: "INVALID_REQUEST"}} =
             Client.update_state(self(), 1, "", true)
  end
end
