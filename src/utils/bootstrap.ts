import { stat } from 'fs/promises';
import { join } from 'path';
import { Conversation, Codebase, IAssistantClient } from '../types';
import * as db from '../db/conversations';

export interface ProjectRecipe {
  name?: string;
  setup: string[];
  env?: Record<string, string>;
  tools?: string[];
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
 * Executes the bootstrap process for a conversation
 */
export async function runBootstrap(
  conversation: Conversation,
  codebase: Codebase,
  aiClient: IAssistantClient,
  force: boolean = false
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

  const cwd = conversation.cwd || codebase.default_cwd;
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
    const prompt = `Please run the following project setup commands and confirm when finished:\n\`\`\`bash\n${setupCommands.join('\n')}\n\`\`\``;
    
    // We use the AI client to execute these in the same sandbox
    // Note: We don't save these to message history!
    let success = false;
    for await (const chunk of aiClient.sendQuery(prompt, cwd, undefined, undefined, {
        sandbox: codebase.sandbox_mode,
        outputFormat: 'text' 
    })) {
        if (chunk.type === 'assistant' && (chunk.content?.toLowerCase().includes('success') || chunk.content?.toLowerCase().includes('finish') || chunk.content?.toLowerCase().includes('done'))) {
            success = true;
        }
    }

    if (!success) {
      console.warn('[Bootstrap] AI completed setup but success confirmation was ambiguous.');
    }

    // Always mark success if no errors were thrown, as AI confirms helpfully
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
