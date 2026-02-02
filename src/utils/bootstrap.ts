import { stat } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { Conversation, Codebase, IAssistantClient } from '../types';
import * as db from '../db/conversations';

export interface ProjectRecipe {
  name?: string;
  setup: string[];
  env?: Record<string, string>;
  tools?: string[];
}

const BOOTSTRAP_RESULT_REGEX = /BOOTSTRAP_RESULT\s*:\s*(success|failed)/i;

/**
 * Extracts an explicit bootstrap result marker from assistant output.
 *
 * @param text - Assistant output to search for a `BOOTSTRAP_RESULT: <value>` marker
 * @returns `success` if the marker indicates success, `failed` if it indicates failure, `null` if no marker is found
 */
function parseBootstrapResult(text: string): 'success' | 'failed' | null {
  const matches = [...text.matchAll(new RegExp(BOOTSTRAP_RESULT_REGEX.source, 'gi'))];
  const last = matches[matches.length - 1];
  if (!last?.[1]) return null;
  return last[1].toLowerCase() === 'success' ? 'success' : 'failed';
}

function logBootstrapOutputDiagnostics(
  explicitResult: 'success' | 'failed' | null,
  lastAssistantChunk: string
): void {
  const trimmed = lastAssistantChunk.trim();
  const length = trimmed.length;
  const hashPrefix = createHash('sha256').update(trimmed).digest('hex').slice(0, 12);
  const debugEnabled = process.env.DEBUG_BOOTSTRAP_OUTPUT === 'true';

  if (explicitResult === 'failed') {
    console.warn(
      `[Bootstrap] Setup reported explicit failure marker. output_length=${String(length)} output_sha256_prefix=${hashPrefix}`
    );
  } else {
    console.warn(
      `[Bootstrap] Setup finished without BOOTSTRAP_RESULT marker. output_length=${String(length)} output_sha256_prefix=${hashPrefix}`
    );
  }

  if (debugEnabled && length > 0) {
    console.warn(`[Bootstrap] DEBUG_BOOTSTRAP_OUTPUT=true last assistant chunk: ${trimmed.slice(0, 2000)}`);
  }
}

/**
 * Utility to check if a file or directory exists
 */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Auto-detects the necessary setup commands for a given directory
 */
export async function detectSetup(cwd: string): Promise<string[]> {
  const commands: string[] = [];

  // 1. Check for Project Recipe (Highest priority)
  // For now, we look for a shell script or a YAML (pseudo-code for now, implementing shell detection)
  if (await exists(join(cwd, '.agent/setup.sh'))) {
    return ['bash .agent/setup.sh'];
  }

  // 2. Node.js
  if (await exists(join(cwd, 'package.json'))) {
    if (await exists(join(cwd, 'package-lock.json'))) {
      commands.push('npm ci');
    } else if (await exists(join(cwd, 'yarn.lock'))) {
      commands.push('yarn install');
    } else {
      commands.push('npm install');
    }
  }

  // 3. Python
  if (await exists(join(cwd, 'requirements.txt'))) {
    commands.push('pip install -r requirements.txt');
  } else if (await exists(join(cwd, 'pyproject.toml'))) {
    commands.push('pip install .');
  }

  // 4. Go
  if (await exists(join(cwd, 'go.mod'))) {
    commands.push('go mod download');
  }

  // 5. Rust
  if (await exists(join(cwd, 'Cargo.toml'))) {
    commands.push('cargo fetch');
  }

  return commands;
}

/**
 * Provision the conversation's working directory by detecting and running required setup commands, updating the conversation's bootstrap status.
 *
 * Detects necessary setup commands in the conversation's working directory, requests the assistant client to execute them inside the codebase sandbox (the assistant must emit an explicit `BOOTSTRAP_RESULT: success` or `BOOTSTRAP_RESULT: failed` marker), and persists bootstrap status and timestamp to the conversation record.
 *
 * @param conversation - Conversation record containing id, cwd, and current bootstrap_status
 * @param codebase - Codebase configuration used to determine sandbox mode and default working directory
 * @param aiClient - Assistant client used to execute setup commands in the codebase sandbox
 * @param force - When true, bypasses early skips and danger-mode approval checks
 * @returns An object with `status` set to one of `success`, `failed`, `skipped`, or `needs-approval`, and a human-readable `message` describing the outcome
 */
export async function runBootstrap(
  conversation: Conversation,
  codebase: Codebase,
  aiClient: IAssistantClient,
  force = false
): Promise<{ status: 'success' | 'failed' | 'skipped' | 'needs-approval'; message: string }> {
  
  // Skip if already succeeded and not forced
  if (conversation.bootstrap_status === 'success' && !force) {
    return { status: 'skipped', message: 'Environment already provisioned.' };
  }

  // SECURITY CHECK: Approval for Danger mode
  if (codebase.sandbox_mode === 'danger-full-access' && !force) {
    return { 
      status: 'needs-approval', 
      message: '⚠️ This codebase is in DANGER mode. Auto-provisioning requires manual approval or the /bootstrap command.' 
    };
  }

  const cwd = conversation.cwd ?? codebase.default_cwd;
  if (!cwd) {
    console.warn('[Bootstrap] No working directory configured for bootstrap.');
    return {
      status: 'failed',
      message: 'Bootstrap aborted: no working directory configured. Use /setcwd to set one.',
    };
  }
  const setupCommands = await detectSetup(cwd);

  if (setupCommands.length === 0) {
    await db.updateConversation(conversation.id, { 
        bootstrap_status: 'success', 
        last_bootstrap_at: new Date() 
    });
    return { status: 'success', message: 'No setup required.' };
  }

  console.log(`[Bootstrap] Running setup for ${conversation.id}: ${setupCommands.join(' && ')}`);
  
  await db.updateConversation(conversation.id, { bootstrap_status: 'running' });

  try {
    // We use a high-level "exec" prompt rather than SDK thread for setup 
    // to avoid polluting the chat history with installation logs
    const prompt = `Run these project setup commands:\n\`\`\`bash\n${setupCommands.join('\n')}\n\`\`\`\n\nWhen done, respond with an explicit marker line:\nBOOTSTRAP_RESULT: success\nor\nBOOTSTRAP_RESULT: failed\n\nOptional: add one short reason on the next line.`;
    
    // We use the AI client to execute these in the same sandbox
    // Note: We don't save these to message history!
    let explicitResult: 'success' | 'failed' | null = null;
    let assistantTranscript = '';
    let lastAssistantChunk = '';
    for await (const chunk of aiClient.sendQuery(prompt, cwd, undefined, undefined, {
        sandbox: codebase.sandbox_mode,
        outputFormat: 'text' 
    })) {
        if (chunk.type !== 'assistant' || !chunk.content) continue;
        lastAssistantChunk = chunk.content;
        assistantTranscript += chunk.content;
        explicitResult = parseBootstrapResult(assistantTranscript) ?? explicitResult;
    }

    if (explicitResult !== 'success') {
      logBootstrapOutputDiagnostics(explicitResult, lastAssistantChunk);
      await db.updateConversation(conversation.id, { bootstrap_status: 'failed' });
      return {
        status: 'failed',
        message: 'Provisioning did not return BOOTSTRAP_RESULT: success. Please check logs and retry /bootstrap force.',
      };
    }

    await db.updateConversation(conversation.id, { 
      bootstrap_status: 'success', 
      last_bootstrap_at: new Date() 
    });

    return { status: 'success', message: `Successfully provisioned environment: ${setupCommands.join(', ')}` };
  } catch (error) {
    console.error('[Bootstrap] Setup failed:', error);
    await db.updateConversation(conversation.id, { bootstrap_status: 'failed' });
    return { status: 'failed', message: `Provisioning failed: ${(error as Error).message}` };
  }
}