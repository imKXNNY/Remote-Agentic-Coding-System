#!/usr/bin/env tsx

/**
 * Setup Authentication Script
 *
 * Creates ~/.codex/auth.json from environment variables
 * Used for Docker container startup to configure Codex authentication
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

function setupAuth(): void {
  // Get environment variables
  const idToken = process.env.CODEX_ID_TOKEN;
  const accessToken = process.env.CODEX_ACCESS_TOKEN;
  const refreshToken = process.env.CODEX_REFRESH_TOKEN;
  const accountId = process.env.CODEX_ACCOUNT_ID;

  // Validate required variables
  if (!idToken || !accessToken || !refreshToken || !accountId) {
    console.error('❌ Missing required environment variables');
    console.error('Required:');
    console.error('  - CODEX_ID_TOKEN');
    console.error('  - CODEX_ACCESS_TOKEN');
    console.error('  - CODEX_REFRESH_TOKEN');
    console.error('  - CODEX_ACCOUNT_ID');
    console.error('\nThese can be found in your ~/.codex/auth.json file after running "codex login"');
    process.exit(1);
  }

  // Create auth.json structure
  const authData: AuthJson = {
    OPENAI_API_KEY: null,
    tokens: {
      id_token: idToken,
      access_token: accessToken,
      refresh_token: refreshToken,
      account_id: accountId,
    },
    last_refresh: new Date().toISOString(),
  };

  // Determine Codex home directory
  const codexHome = path.join(os.homedir(), '.codex');
  const authPath = path.join(codexHome, 'auth.json');

  // Create directory if it doesn't exist
  if (!fs.existsSync(codexHome)) {
    fs.mkdirSync(codexHome, { recursive: true });
    console.log(`✅ Created directory: ${codexHome}`);
  }

  // Write auth.json file
  try {
    fs.writeFileSync(authPath, JSON.stringify(authData, null, 2));
    console.log(`✅ Successfully created auth.json at: ${authPath}`);
    console.log('✅ Codex authentication configured');
  } catch (error) {
    console.error(`❌ Failed to write auth.json: ${error}`);
    process.exit(1);
  }
}

// Run the setup
setupAuth();
