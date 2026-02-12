# frozen_string_literal: true

Gem::Specification.new do |spec|
  spec.name = 'mlld'
  spec.version = '2.0.0.rc82'
  spec.summary = 'Ruby wrapper for the mlld CLI'
  spec.description = 'Persistent live --stdio SDK wrapper for mlld from Ruby.'
  spec.authors = ['mlld-lang']
  spec.email = ['opensource@mlld.dev']
  spec.homepage = 'https://github.com/mlld-lang/mlld'
  spec.license = 'MIT'
  spec.required_ruby_version = '>= 3.0'

  spec.metadata['homepage_uri'] = spec.homepage
  spec.metadata['source_code_uri'] = spec.homepage
  spec.metadata['changelog_uri'] = "#{spec.homepage}/blob/main/CHANGELOG.md"

  spec.files = Dir.chdir(__dir__) do
    Dir['README.md', 'lib/**/*.rb']
  end
  spec.require_paths = ['lib']
end
