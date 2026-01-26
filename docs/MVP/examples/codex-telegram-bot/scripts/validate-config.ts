#!/usr/bin/env tsx

/**
 * Validate Configuration Script
 *
 * Validates that auth.json and config.toml are properly configured
 * Useful for debugging configuration issues
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface AuthJson {
  OPENAI_API_KEY: null;
  tokens: {
    id_token: string;
    access_token: string;
    refresh_token: string;
    account_id: string;
  };
  last_refresh: string;
}

function validateConfig(): void {
  console.log('🔍 Validating Codex configuration...\n');

  const codexHome = path.join(os.homedir(), '.codex');
  const authPath = path.join(codexHome, 'auth.json');
  const configPath = path.join(codexHome, 'config.toml');

  let hasErrors = false;

  // Check if .codex directory exists
  if (!fs.existsSync(codexHome)) {
    console.error(`❌ Codex home directory not found: ${codexHome}`);
    console.error('   Run "npm run setup-auth" to create it');
    hasErrors = true;
  } else {
    console.log(`✅ Codex home directory exists: ${codexHome}`);
  }

  // Validate auth.json
  console.log('\n📄 Checking auth.json...');
  if (!fs.existsSync(authPath)) {
    console.error(`❌ auth.json not found: ${authPath}`);
    console.error('   Run "npm run setup-auth" to create it');
    hasErrors = true;
  } else {
    try {
      const authContent = fs.readFileSync(authPath, 'utf-8');
      const authData: AuthJson = JSON.parse(authContent);

      // Validate structure
      if (!authData.tokens) {
        console.error('❌ auth.json missing "tokens" field');
        hasErrors = true;
      } else {
        const { id_token, access_token, refresh_token, account_id } = authData.tokens;

        if (!id_token) {
          console.error('❌ auth.json missing tokens.id_token');
          hasErrors = true;
        }
        if (!access_token) {
          console.error('❌ auth.json missing tokens.access_token');
          hasErrors = true;
        }
        if (!refresh_token) {
          console.error('❌ auth.json missing tokens.refresh_token');
          hasErrors = true;
        }
        if (!account_id) {
          console.error('❌ auth.json missing tokens.account_id');
          hasErrors = true;
        }

        if (id_token && access_token && refresh_token && account_id) {
          console.log('✅ auth.json structure is valid');
          console.log(`   - id_token: ${id_token.substring(0, 20)}...`);
          console.log(`   - access_token: ${access_token.substring(0, 20)}...`);
          console.log(`   - refresh_token: ${refresh_token.substring(0, 20)}...`);
          console.log(`   - account_id: ${account_id}`);
          console.log(`   - last_refresh: ${authData.last_refresh}`);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to parse auth.json: ${error}`);
      hasErrors = true;
    }
  }

  // Validate config.toml
  console.log('\n📄 Checking config.toml...');
  if (!fs.existsSync(configPath)) {
    console.error(`❌ config.toml not found: ${configPath}`);
    console.error('   Run "npm run setup-config" to create it');
    hasErrors = true;
  } else {
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      console.log('✅ config.toml exists');

      // Check for MCP server configurations
      const hasSequentialThinking = configContent.includes('[mcp_servers.sequential-thinking]');
      const hasStagehand = configContent.includes('[mcp_servers.stagehand]');

      if (hasSequentialThinking) {
        console.log('   ✅ sequential-thinking MCP server configured');
      } else {
        console.warn('   ⚠️  sequential-thinking MCP server not found');
      }

      if (hasStagehand) {
        console.log('   ✅ stagehand MCP server configured');

        // Check if environment variables are substituted
        if (configContent.includes('${BROWSERBASE_API_KEY}')) {
          console.warn('   ⚠️  BROWSERBASE_API_KEY not substituted (still contains ${...})');
        }
        if (configContent.includes('${BROWSERBASE_PROJECT_ID}')) {
          console.warn('   ⚠️  BROWSERBASE_PROJECT_ID not substituted (still contains ${...})');
        }
        if (configContent.includes('${OPENAI_API_KEY}')) {
          console.warn('   ⚠️  OPENAI_API_KEY not substituted (still contains ${...})');
        }
      } else {
        console.warn('   ⚠️  stagehand MCP server not found');
      }
    } catch (error) {
      console.error(`❌ Failed to read config.toml: ${error}`);
      hasErrors = true;
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(50));
  if (hasErrors) {
    console.error('❌ Configuration validation FAILED');
    console.error('   Please fix the issues above before running the bot');
    process.exit(1);
  } else {
    console.log('✅ Configuration validation PASSED');
    console.log('   Your Codex bot is ready to run!');
  }
}

// Run the validation
validateConfig();
