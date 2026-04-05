# File-watching agent that classifies incoming documents with mlld.

require 'json'
require 'fileutils'
require 'mlld'

SCRIPT = File.expand_path('../llm/process.mld', __dir__)

FileUtils.mkdir_p('inbox')
FileUtils.mkdir_p('done')

client = Mlld::Client.new

puts "Watching inbox/ for new .md files. Drop a file in to classify it."
puts "Press Ctrl+C to stop."
puts

trap('INT') { client.close; exit }

loop do
  Dir.glob('inbox/*.md').each do |path|
    name = File.basename(path)
    puts "Processing #{name}..."

    begin
      content = File.read(path)
      result = client.execute(
        SCRIPT,
        { 'content' => content, 'filename' => name },
        timeout: 60
      )

      classification = result.state_writes.find { |sw| sw.path == 'result' }&.value

      if classification
        stem = File.basename(name, '.md')
        File.write("done/#{stem}.result.json", JSON.pretty_generate(classification))
        puts "  -> #{classification}"
      end

      FileUtils.mv(path, "done/#{name}")
    rescue => e
      puts "  Error: #{e.message}"
    end
  end

  sleep 1
end
