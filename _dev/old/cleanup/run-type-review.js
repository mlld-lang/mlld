#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const axios = require('axios');
const { promisify } = require('util');
const mkdirp = promisify(require('mkdirp'));

// Check for API key
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable not set');
  process.exit(1);
}

// Configuration
const CONFIG_PATH = path.join(__dirname, 'prompts.yaml');
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Main function to run the type review process
 */
async function runTypeReview() {
  try {
    console.log('Starting Meld type review process...');
    
    // Load config
    const config = await loadConfig();
    console.log(`Loaded configuration for ${config.project.directives.length} directives`);
    
    // Process each directive
    for (const directive of config.project.directives) {
      console.log(`\nProcessing directive: ${directive.name}`);
      await processDirective(directive, config);
    }
    
    console.log('\nType review process completed successfully!');
  } catch (error) {
    console.error('Error in type review process:', error);
    process.exit(1);
  }
}

/**
 * Load and parse the YAML configuration
 */
async function loadConfig() {
  try {
    const configContent = await fs.readFile(CONFIG_PATH, 'utf8');
    return yaml.load(configContent);
  } catch (error) {
    throw new Error(`Failed to load config: ${error.message}`);
  }
}

/**
 * Process a single directive through the review pipeline
 */
async function processDirective(directive, config) {
  const directiveName = directive.name;
  
  // Create output directories
  const baseDir = path.join(__dirname, directiveName);
  await ensureDirectories(baseDir, ['round-1', 'round-2', 'draft-1', 'draft-2']);
  
  // Round 1: Collect service feedback
  console.log(`Starting Round 1 for ${directiveName}...`);
  const round1Feedback = await collectServiceFeedback(
    directive, 
    config, 
    config.service_prompts.round1, 
    'round-1'
  );
  
  // Architect creates draft
  console.log(`Architect creating draft spec for ${directiveName}...`);
  const draftSpec = await getArchitectDraft(
    directive, 
    config, 
    round1Feedback
  );
  
  // Round 2: Collect feedback on draft
  console.log(`Starting Round 2 for ${directiveName}...`);
  const round2Feedback = await collectServiceFeedback(
    directive, 
    config, 
    config.service_prompts.round2, 
    'round-2',
    draftSpec
  );
  
  // Architect refines draft
  console.log(`Architect refining draft spec for ${directiveName}...`);
  const finalSpec = await refineArchitectDraft(
    directive,
    config,
    round2Feedback,
    draftSpec
  );
  
  console.log(`Completed review process for ${directiveName}`);
  return finalSpec;
}

/**
 * Collect feedback from all services
 */
async function collectServiceFeedback(directive, config, promptTemplate, roundDir, draftSpec = null) {
  const feedbackPromises = config.services.map(async (service) => {
    console.log(`  Getting feedback from ${service.name}...`);
    
    // Prepare context
    const commonDocs = await getCommonDocsContent(config);
    const serviceContext = await getServiceContext(service);
    
    // Prepare prompt variables
    const promptVars = {
      directiveName: directive.name,
      serviceName: service.name,
      commonDocs,
      serviceContext,
      draftSpec: draftSpec || ''
    };
    
    // Create prompt with variables replaced
    const prompt = replacePromptVariables(promptTemplate.prompt, promptVars);
    
    // Call Claude API
    const response = await callClaudeAPI(prompt, service.name);
    
    // Save response to file
    const outputFilename = replacePromptVariables(
      promptTemplate.output_filename, 
      { directiveName: directive.name, serviceName: service.name }
    );
    
    await saveOutput(response, outputFilename);
    
    return {
      service: service.name,
      feedback: response
    };
  });
  
  return Promise.all(feedbackPromises);
}

/**
 * Get architect to create draft spec based on service feedback
 */
async function getArchitectDraft(directive, config, servicesFeedback) {
  // Prepare feedback content
  const feedbackContent = servicesFeedback
    .map(feedback => `## ${feedback.service} Feedback\n\n${feedback.feedback}`)
    .join('\n\n');
  
  // Prepare prompt variables
  const promptVars = {
    directiveName: directive.name,
    servicesFeedback: feedbackContent
  };
  
  // Create prompt with variables replaced
  const prompt = replacePromptVariables(
    config.architect_prompts.create_draft.prompt, 
    promptVars
  );
  
  // Call Claude API
  const response = await callClaudeAPI(prompt, 'Architect');
  
  // Save response to file
  const outputFilename = replacePromptVariables(
    config.architect_prompts.create_draft.output_filename, 
    { directiveName: directive.name }
  );
  
  await saveOutput(response, outputFilename);
  
  return response;
}

/**
 * Get architect to refine draft spec based on service feedback
 */
async function refineArchitectDraft(directive, config, servicesFeedback, draftSpec) {
  // Prepare feedback content
  const feedbackContent = servicesFeedback
    .map(feedback => `## ${feedback.service} Feedback\n\n${feedback.feedback}`)
    .join('\n\n');
  
  // Prepare prompt variables
  const promptVars = {
    directiveName: directive.name,
    servicesFeedback: feedbackContent,
    draftSpec
  };
  
  // Create prompt with variables replaced
  const prompt = replacePromptVariables(
    config.architect_prompts.refine_draft.prompt, 
    promptVars
  );
  
  // Call Claude API
  const response = await callClaudeAPI(prompt, 'Architect');
  
  // Save response to file
  const outputFilename = replacePromptVariables(
    config.architect_prompts.refine_draft.output_filename, 
    { directiveName: directive.name }
  );
  
  await saveOutput(response, outputFilename);
  
  return response;
}

/**
 * Call Claude API with the given prompt
 */
async function callClaudeAPI(prompt, role) {
  console.log(`    Sending prompt to Claude (${role})...`);
  
  try {
    const response = await axios.post(
      ANTHROPIC_API_URL,
      {
        model: 'claude-3-sonnet-20240229',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );
    
    return response.data.content[0].text;
  } catch (error) {
    console.error('Error calling Claude API:', error.response?.data || error.message);
    throw new Error(`Failed to get response from Claude: ${error.message}`);
  }
}

/**
 * Get content of common docs
 */
async function getCommonDocsContent(config) {
  const docPromises = config.common.documents.map(async (doc) => {
    try {
      const content = await fs.readFile(doc.path, 'utf8');
      return `## ${doc.alias || path.basename(doc.path)}\n\n${content}`;
    } catch (error) {
      console.warn(`Warning: Could not read document ${doc.path}: ${error.message}`);
      return `## ${doc.alias || path.basename(doc.path)}\n\n(Document not found)`;
    }
  });
  
  return (await Promise.all(docPromises)).join('\n\n');
}

/**
 * Get service-specific context
 */
async function getServiceContext(service) {
  // Get service documents
  const docPromises = (service.documents || []).map(async (doc) => {
    try {
      const content = await fs.readFile(doc.path, 'utf8');
      return `## ${path.basename(doc.path)}\n\n${content}`;
    } catch (error) {
      console.warn(`Warning: Could not read document ${doc.path}: ${error.message}`);
      return `## ${path.basename(doc.path)}\n\n(Document not found)`;
    }
  });
  
  // Get service code
  const codePromises = (service.code || []).map(async (codeFile) => {
    try {
      const content = await fs.readFile(codeFile.path, 'utf8');
      return `## ${path.basename(codeFile.path)}\n\`\`\`typescript\n${content}\n\`\`\``;
    } catch (error) {
      console.warn(`Warning: Could not read code file ${codeFile.path}: ${error.message}`);
      return `## ${path.basename(codeFile.path)}\n\`\`\`typescript\n// File not found\n\`\`\``;
    }
  });
  
  const docs = await Promise.all(docPromises);
  const code = await Promise.all(codePromises);
  
  return [
    `# ${service.name} Context`,
    service.context || '',
    ...docs,
    '# Service Code',
    ...code
  ].join('\n\n');
}

/**
 * Replace variables in prompt template
 */
function replacePromptVariables(template, variables) {
  let result = template;
  
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  
  return result;
}

/**
 * Save output to file
 */
async function saveOutput(content, outputPath) {
  const fullPath = path.join(__dirname, outputPath);
  
  // Ensure directory exists
  await mkdirp(path.dirname(fullPath));
  
  // Write file
  await fs.writeFile(fullPath, content, 'utf8');
  console.log(`    Saved output to ${outputPath}`);
}

/**
 * Ensure required directories exist
 */
async function ensureDirectories(baseDir, subdirs) {
  // Ensure base directory
  await mkdirp(baseDir);
  
  // Ensure subdirectories
  for (const subdir of subdirs) {
    await mkdirp(path.join(baseDir, subdir));
  }
}

// Run the script
runTypeReview().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 