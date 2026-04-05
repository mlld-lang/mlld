defmodule Mlld.TestRunner do
  @moduledoc false

  def main do
    __DIR__
    |> Path.join("lib/**/*.ex")
    |> Path.wildcard()
    |> Enum.sort()
    |> compile_files!()

    Code.require_file(Path.join(__DIR__, "test/test_helper.exs"))

    __DIR__
    |> Path.join("test/**/*_test.exs")
    |> Path.wildcard()
    |> Enum.sort()
    |> Enum.each(&Code.require_file/1)
  end

  defp compile_files!(files) do
    case Kernel.ParallelCompiler.compile(files, return_diagnostics: true) do
      {:ok, _modules, diagnostics} ->
        print_diagnostics(diagnostics)

      {:error, errors, diagnostics} ->
        print_diagnostics(diagnostics)
        Enum.each(List.wrap(errors), &Code.print_diagnostic/1)
        System.halt(1)
    end
  end

  defp print_diagnostics(%{compile_warnings: compile_warnings, runtime_warnings: runtime_warnings}) do
    Enum.each(compile_warnings ++ runtime_warnings, &Code.print_diagnostic/1)
  end

  defp print_diagnostics(_), do: :ok
end

Mlld.TestRunner.main()
