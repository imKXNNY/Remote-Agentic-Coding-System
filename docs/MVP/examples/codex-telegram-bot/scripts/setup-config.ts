#!/usr/bin/env tsx

/**
 * Setup Configuration Script
 *
 * Generates ~/.codex/config.toml from template with environment variable substitution
 * Used for Docker container startup to configure MCP servers
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function setupConfig(): void {
  // Paths
  const templatePath = path.join(process.cwd(), 'codex_config', 'config.toml.template');
  const codexHome = path.join(os.homedir(), '.codex');
  const configPath = path.join(codexHome, 'config.toml');

  // Check if template exists
  if (!fs.existsSync(templatePath)) {
    console.error(`❌ Template file not found: ${templatePath}`);
    process.exit(1);
  }

  // Read template
  let configContent: string;
  try {
    configContent = fs.readFileSync(templatePath, 'utf-8');
    console.log(`✅ Read template from: ${templatePath}`);
  } catch (error) {
    console.error(`❌ Failed to read template: ${error}`);
    process.exit(1);
  }

  // Get environment variables
  const browserbaseApiKey = process.env.BROWSERBASE_API_KEY || '';
  const browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID || '';
  const openaiApiKey = process.env.OPENAI_API_KEY || '';

  // Warn if optional variables are missing
  if (!browserbaseApiKey || !browserbaseProjectId || !openaiApiKey) {
    console.warn('⚠️  Warning: Some optional environment variables are missing:');
    if (!browserbaseApiKey) console.warn('  - BROWSERBASE_API_KEY');
    if (!browserbaseProjectId) console.warn('  - BROWSERBASE_PROJECT_ID');
    if (!openaiApiKey) console.warn('  - OPENAI_API_KEY');
    console.warn('Stagehand MCP server may not function properly without these.');
  }

  // Substitute environment variables
  configContent = configContent
    .replace(/\${BROWSERBASE_API_KEY}/g, browserbaseApiKey)
    .replace(/\${BROWSERBASE_PROJECT_ID}/g, browserbaseProjectId)
    .replace(/\${OPENAI_API_KEY}/g, openaiApiKey);

  // Create directory if it doesn't exist
  if (!fs.existsSync(codexHome)) {
    fs.mkdirSync(codexHome, { recursive: true });
    console.log(`✅ Created directory: ${codexHome}`);
  }

  // Write config.toml file
  try {
    fs.writeFileSync(configPath, configContent);
    console.log(`✅ Successfully created config.toml at: ${configPath}`);
    console.log('✅ MCP server configuration complete');
  } catch (error) {
    console.error(`❌ Failed to write config.toml: ${error}`);
    process.exit(1);
  }
}

// Run the setup
setupConfig();
