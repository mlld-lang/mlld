defmodule Mlld.SigSurfaceTest do
  use ExUnit.Case, async: true

  alias Mlld.Client

  test "request builders preserve method params and timeout" do
    assert {"fs:status", %{"glob" => "docs/*.txt", "basePath" => "/repo"}, 5_000} =
             Client.build_fs_status_request("docs/*.txt", base_path: "/repo", timeout: 5_000)

    assert {"sig:sign",
            %{
              "path" => "docs/a.txt",
              "identity" => "user:alice",
              "metadata" => %{"purpose" => "sdk"},
              "basePath" => "/repo"
            }, 6_000} =
             Client.build_sign_request("docs/a.txt",
               identity: "user:alice",
               metadata: %{"purpose" => "sdk"},
               base_path: "/repo",
               timeout: 6_000
             )

    assert {"sig:verify", %{"path" => "docs/a.txt", "basePath" => "/repo"}, nil} =
             Client.build_verify_request("docs/a.txt", base_path: "/repo")

    assert {"sig:sign-content",
            %{
              "content" => "hello world",
              "identity" => "user:alice",
              "metadata" => %{"channel" => "sdk"},
              "id" => "content-1",
              "basePath" => "/repo"
            }, 7_000} =
             Client.build_sign_content_request("hello world", "user:alice",
               metadata: %{"channel" => "sdk"},
               signature_id: "content-1",
               base_path: "/repo",
               timeout: 7_000
             )
  end
end
