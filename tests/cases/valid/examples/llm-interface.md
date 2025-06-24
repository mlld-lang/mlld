# LLM Interface Design Options

## Option 1: Namespace Object Pattern (Recommended)

/exec @llm_basic(prompt, system) = {llm "@prompt" {{system ? "-s \"" + system + "\"" : ""}}}
/exec @llm_media(prompt, system, media) = {llm "@prompt" {{system ? "-s \"" + system + "\"" : ""}} -a @media}
/exec @llm_tools(prompt, system, tools) = {llm "@prompt" {{system ? "-s \"" + system + "\"" : ""}} --tool @tools}
/exec @llm_full(prompt, parameters) = {llm "@prompt" @parameters}

/data @llm = {
# Default function behavior
query: @llm_basic,
  
# Namespace methods
media: @llm_media,
tools: @llm_tools,
full: @llm_full,
  
# Convenience presets
assistant: @exec(prompt) = run {llm "@prompt" -s "You are a helpful assistant"},
coder: @exec(prompt) = run {llm "@prompt" -s "You are an expert programmer"},
reviewer: @exec(prompt) = run {llm "@prompt" -s "You are a thorough code reviewer"}
}

## Usage examples:

# Basic usage
/run @llm.query("What is the weather?", "You are a weather assistant")

# With media
/run @llm.media("Describe this image", "You are an image analyst", "photo.jpg")

# With tools
/data @tools = ["search", "calculate", "browse"]
/run @llm.tools("Help me plan a trip", "You are a travel agent", @tools)

# Presets
/run @llm.assistant("How do I cook pasta?")
/run @llm.coder("Write a Python function to sort a list")

## Option 2: Builder Pattern

/data @llm = {
# Store configuration
_system: "",
_media: [],
_tools: [],
  
# Chainable setters (would need special handling)
system: @exec(text) = @data llm = {...@llm, _system: @text},
media: @exec(files) = @data llm = {...@llm, _media: @files},
tools: @exec(tools) = @data llm = {...@llm, _tools: @tools},
  
# Execute with current config
run: @exec(prompt) = run {llm "@prompt" -s "@llm._system" {{llm._media ? "-a " + llm._media : ""}} {{llm._tools ? "--tool " + llm._tools : ""}}}
}

## Option 3: Factory Functions

/exec @createLLM(config) = @data {
prompt: @exec(text) = run {llm "@text" -s "@config.system" {{config.media ? "-a " + config.media : ""}}},
withTools: @exec(text, tools) = run {llm "@text" -s "@config.system" --tool @tools}
}

/data @codingLLM = @createLLM({system: "You are an expert programmer"})
/run @codingLLM.prompt("Write a sorting algorithm")

## For a module (@mlld/llm), Option 1 is cleanest:

/exec @_llm(prompt, system) = {llm "@prompt" {{system ? "-s \"" + system + "\"" : ""}}}
/exec @_llm_media(prompt, system, media) = {llm "@prompt" {{system ? "-s \"" + system + "\"" : ""}} -a @media}
/exec @_llm_tools(prompt, system, tools) = {llm "@prompt" {{system ? "-s \"" + system + "\"" : ""}} --tool @tools}

/data @llm = {
# Call directly: @run @llm("prompt")
__call__: @_llm,  # Special property (if supported)
  
# Or use as: @run @llm.query("prompt")
query: @_llm,
media: @_llm_media,
tools: @_llm_tools
}