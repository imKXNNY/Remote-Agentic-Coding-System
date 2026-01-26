import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

export interface EnvironmentConfig {
  telegramBotToken: string;
  codexIdToken: string;
  codexAccessToken: string;
  codexRefreshToken: string;
  codexAccountId: string;
  browserbaseApiKey?: string;
  browserbaseProjectId?: string;
  openaiApiKey?: string;
}

/**
 * Validate and return environment configuration
 * Throws an error if required environment variables are missing
 */
export function validateEnvironment(): EnvironmentConfig {
  // Required variables - bot won't work without these
  const requiredVars = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    codexIdToken: process.env.CODEX_ID_TOKEN,
    codexAccessToken: process.env.CODEX_ACCESS_TOKEN,
    codexRefreshToken: process.env.CODEX_REFRESH_TOKEN,
    codexAccountId: process.env.CODEX_ACCOUNT_ID,
  };

  // Optional variables - for Stagehand MCP (browser automation & screenshots)
  const optionalVars = {
    browserbaseApiKey: process.env.BROWSERBASE_API_KEY,
    browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID,
    openaiApiKey: process.env.OPENAI_API_KEY,
  };

  // Check required variables
  const missing: string[] = [];
  for (const [key, value] of Object.entries(requiredVars)) {
    if (!value) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `Please check your .env file. See .env.example for reference.`
    );
  }

  // Warn about missing optional variables
  const missingOptional: string[] = [];
  for (const [key, value] of Object.entries(optionalVars)) {
    if (!value) {
      missingOptional.push(key);
    }
  }

  if (missingOptional.length > 0) {
    console.warn('⚠️  Optional environment variables not set:', missingOptional.join(', '));
    console.warn('⚠️  Stagehand MCP (browser automation & screenshots) will not be available');
  }

  return {
    ...requiredVars,
    ...optionalVars,
  } as EnvironmentConfig;
}

/**
 * Get environment configuration with validation
 */
export function getEnvironment(): EnvironmentConfig {
  return validateEnvironment();
}
