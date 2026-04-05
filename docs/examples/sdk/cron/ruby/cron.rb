# Scheduled digest: summarize recent git activity with mlld.

require 'json'
require 'fileutils'
require 'mlld'

SCRIPT = File.expand_path('../llm/digest.mld', __dir__)

commits = `git log --oneline --since=yesterday`.strip
if commits.empty?
  puts "No recent commits. Nothing to digest."
  exit 0
end

today = Time.now.strftime('%Y-%m-%d')
puts "Generating digest for #{today} (#{commits.lines.count} commits)..."

client = Mlld::Client.new
begin
  result = client.execute(
    SCRIPT,
    { 'commits' => commits, 'date' => today },
    timeout: 60
  )

  digest = result.state_writes.find { |sw| sw.path == 'digest' }&.value

  if digest
    FileUtils.mkdir_p('digests')
    out_path = "digests/#{today}.md"
    File.write(out_path, digest)
    puts "Wrote #{out_path}\n"
    puts digest
  else
    puts "No digest produced."
  end
ensure
  client.close
end
