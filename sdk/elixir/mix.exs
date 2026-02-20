defmodule Mlld.MixProject do
  use Mix.Project

  @version "2.0.0"
  @source_url "https://github.com/mlld-lang/mlld/tree/main/sdk/elixir"

  def project do
    [
      app: :mlld,
      version: @version,
      elixir: "~> 1.15",
      start_permanent: Mix.env() == :prod,
      description: "Elixir SDK wrapper for the mlld CLI",
      source_url: @source_url,
      package: package(),
      docs: docs(),
      deps: deps()
    ]
  end

  def application do
    [
      extra_applications: [:logger]
    ]
  end

  defp deps do
    []
  end

  defp package do
    [
      name: "mlld",
      files: ["lib", "mix.exs", "README.md", "LICENSE"],
      licenses: ["MIT"],
      links: %{
        "GitHub" => @source_url,
        "Website" => "https://mlld.dev"
      }
    ]
  end

  defp docs do
    [
      main: "readme",
      extras: ["README.md"]
    ]
  end
end
