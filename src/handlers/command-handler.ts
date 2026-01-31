/**
 * Command handler for slash commands
 * Handles deterministic operations without AI
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, readdir, access } from 'fs/promises';
import { join, basename } from 'path';
import { Conversation, CommandResult } from '../types';
import * as db from '../db/conversations';
import * as codebaseDb from '../db/codebases';
import * as sessionDb from '../db/sessions';
import { runCodexReview } from './codex-cli';
import * as bootstrap from '../utils/bootstrap';
import { getAssistantClient } from '../clients/factory';

const execAsync = promisify(exec);

/**
 * Recursively find all .md files in a directory and its subdirectories
 */
async function findMarkdownFilesRecursive(
  rootPath: string,
  relativePath = ''
): Promise<{ commandName: string; relativePath: string }[]> {
  const results: { commandName: string; relativePath: string }[] = [];
  const fullPath = join(rootPath, relativePath);

  const entries = await readdir(fullPath, { withFileTypes: true });

  for (const entry of entries) {
    // Skip hidden directories and common exclusions
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }

    if (entry.isDirectory?.()) {
      // Recurse into subdirectory
      const subResults = await findMarkdownFilesRecursive(rootPath, join(relativePath, entry.name));
      results.push(...subResults);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      // Found a markdown file - use filename as command name
      results.push({
        commandName: basename(entry.name, '.md'),
        relativePath: join(relativePath, entry.name),
      });
    }
  }

  return results;
}

export function parseCommand(text: string): { command: string; args: string[] } {
  // Match quoted strings or non-whitespace sequences
  const matches = text.match(/"[^"]+"|'[^']+'|\S+/g) || [];

  if (matches.length === 0 || !matches[0]) {
    return { command: '', args: [] };
  }

  const command = matches[0].substring(1); // Remove leading '/'
  const args = matches.slice(1).map(arg => {
    // Remove surrounding quotes if present
    if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
      return arg.slice(1, -1);
    }
    return arg;
  });

  return { command, args };
}

export async function handleCommand(
  conversation: Conversation,
  message: string
): Promise<CommandResult> {
  const { command, args } = parseCommand(message);

  switch (command) {
    case 'help':
      return {
        success: true,
        message: `Available Commands:

Command Management:
  /command-set <name> <path> [text] - Register command
  /load-commands <folder> - Bulk load (recursive)
  /command-invoke <name> [args] - Execute
  /commands - List registered
  Note: Commands use relative paths (e.g., .claude/commands)

Codex Integration:
  /codex-review [branch|commit|uncommitted] [target] - Run native Codex review
  /codex-exec <prompt> - Run automated task with JSON output mode
  /codex-add-dir <path> - Add additional directory for Codex access
  /codex-clear-dirs - Clear all additional directories

Codebase:
  /clone <repo-url> - Clone repository
  /repos - List workspace repositories
  /getcwd - Show working directory
  /setcwd <path> - Set directory
  Note: Codebases use full paths (e.g., /workspace/repo-name)

Session:
  /status - Show state
  /reset - Clear session
  /bootstrap [force] - Auto-provision project environment
  /help - Show help
  /setmodel <id> - Set assistant model (GPT-5, etc.)
  /setsandbox <mode> - Set sandbox (read-only, workspace-write, danger-full-access)`,
      };

    case 'setmodel': {
      if (args.length === 0) {
        return { success: false, message: 'Usage: /setmodel <model_id>' };
      }
      const modelId = args[0];
      await db.updateConversation(conversation.id, { model_id: modelId });
      return {
        success: true,
        message: `Assistant model for this conversation set to: ${modelId}`,
        modified: true,
      };
    }

    case 'setsandbox': {
      if (args.length === 0) {
        return { success: false, message: 'Usage: /setsandbox <read-only | workspace-write | danger-full-access>' };
      }
      if (!conversation.codebase_id) {
        return { success: false, message: 'No codebase context. Use /clone or /setcwd first.' };
      }
      const mode = args[0] as 'read-only' | 'workspace-write' | 'danger-full-access';
      if (!['read-only', 'workspace-write', 'danger-full-access'].includes(mode)) {
        return { success: false, message: 'Invalid sandbox mode.' };
      }
      await codebaseDb.updateCodebaseSandboxMode(conversation.codebase_id, mode);
      return {
        success: true,
        message: `Sandbox mode for codebase set to: ${mode}`,
        modified: true,
      };
    }

    case 'codex-add-dir': {
      if (args.length === 0) {
        return { success: false, message: 'Usage: /codex-add-dir <path>' };
      }
      const newDir = join('/workspace', args[0]);
      try {
        await access(newDir);
        const currentDirs = conversation.additional_dirs || [];
        if (currentDirs.includes(newDir)) {
           return { success: true, message: `Directory already exists in list: ${newDir}` };
        }
        const updatedDirs = [...currentDirs, newDir];
        await db.updateConversation(conversation.id, { additional_dirs: updatedDirs });
        return {
          success: true,
          message: `Added additional directory: ${newDir}\n\nCodex now has access to:\n- ${conversation.cwd || '(main)'}\n${updatedDirs.map(d => `- ${d}`).join('\n')}`,
          modified: true,
        };
      } catch (_error) {
        return { success: false, message: `Failed to add directory: Does not exist or no access to ${newDir}` };
      }
    }

    case 'codex-clear-dirs': {
      await db.updateConversation(conversation.id, { additional_dirs: [] });
      return {
        success: true,
        message: 'All additional directories cleared.',
        modified: true,
      };
    }

    case 'bootstrap': {
      if (!conversation.codebase_id) {
        return { success: false, message: 'No codebase context. Use /clone or /setcwd first.' };
      }
      const force = args[0] === 'force';
      const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
      if (!codebase) return { success: false, message: 'Codebase not found.' };

      const aiClient = getAssistantClient(conversation.ai_assistant_type);
      const result = await bootstrap.runBootstrap(conversation, codebase, aiClient, force);
      
      return {
        success: result.status === 'success' || result.status === 'skipped',
        message: result.message,
        modified: true
      };
    }

    case 'codex-exec': {
      if (args.length === 0) {
        return { success: false, message: 'Usage: /codex-exec <prompt>' };
      }
      if (!conversation.codebase_id) {
        return { success: false, message: 'No codebase context. Use /clone or /setcwd first.' };
      }
      
      const prompt = args.join(' ');
      const { getAssistantClient } = await import('../clients/factory');
      const aiClient = getAssistantClient('codex');
      const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
      const cwd = conversation.cwd || codebase?.default_cwd || '/workspace';
      
      try {
        let output = '';
        for await (const chunk of aiClient.sendQuery(prompt, cwd, undefined, undefined, { outputFormat: 'json' })) {
          if (chunk.type === 'assistant' && chunk.content) {
            output += chunk.content;
          } else if (chunk.type === 'tool' ) {
            output += `\n[Tool: ${chunk.toolName}]\n`;
          }
        }
        return {
          success: true,
          message: `**Codex Exec (JSON Mode) Output:**\n\n${output || 'No output returned.'}`,
        };
      } catch (error) {
        return { success: false, message: `Codex Exec Failed: ${(error as Error).message}` };
      }
    }

    case 'codex-review': {
      if (!conversation.cwd) {
        return { success: false, message: 'No working directory set. Use /clone or /setcwd first.' };
      }

      const modeStr = args[0]?.toLowerCase();
      const target = args[1];

      let reviewMode: 'branch' | 'uncommitted' | 'commit' | undefined;

      if (modeStr === 'branch') reviewMode = 'branch';
      else if (modeStr === 'uncommitted') reviewMode = 'uncommitted';
      else if (modeStr === 'commit') reviewMode = 'commit';
      else if (modeStr) {
         return { success: false, message: 'Usage: /codex-review [branch <name> | commit <sha> | uncommitted]' };
      }

      try {
        const output = await runCodexReview({
          workingDir: conversation.cwd,
          target,
          reviewMode,
        });

        return {
          success: true,
          message: `**Codex Review Results**\n\n${output}`,
        };
      } catch (error) {
        const err = error as Error;
        return { success: false, message: `Codex Review Failed: ${err.message}` };
      }
    }

    case 'status': {
      let msg = `Platform: ${conversation.platform_type}\nAI Assistant: ${conversation.ai_assistant_type}`;

      if (conversation.codebase_id) {
        const cb = await codebaseDb.getCodebase(conversation.codebase_id);
        if (cb?.name) {
          msg += `\n\nCodebase: ${cb.name}`;
          if (cb.repository_url) {
            msg += `\nRepository: ${cb.repository_url}`;
          }
        }
      } else {
        msg += '\n\nNo codebase configured. Use /clone <repo-url> to get started.';
      }

      msg += `\n\nCurrent Working Directory: ${conversation.cwd || 'Not set'}`;

      if (conversation.additional_dirs && conversation.additional_dirs.length > 0) {
        msg += `\nAdditional Directories:\n${conversation.additional_dirs.map(d => `- ${d}`).join('\n')}`;
      }

      const session = await sessionDb.getActiveSession(conversation.id);
      if (session?.id) {
        msg += `\nActive Session: ${session.id.substring(0, 8)}...`;
      }

      return { success: true, message: msg };
    }

    case 'getcwd':
      return {
        success: true,
        message: `Current working directory: ${conversation.cwd || 'Not set'}`,
      };

    case 'setcwd': {
      if (args.length === 0) {
        return { success: false, message: 'Usage: /setcwd <path>' };
      }
      const newCwd = args.join(' ');
      
      // Look for a matching codebase (direct match or parent directory)
      const codebase = await codebaseDb.findBestCodebaseForPath(newCwd);
      
      const updates: {
        cwd: string;
        codebase_id?: string | null;
        ai_assistant_type?: string;
        bootstrap_status?: 'pending';
      } = { cwd: newCwd };
      if (codebase) {
        updates.codebase_id = codebase.id;
        updates.ai_assistant_type = codebase.ai_assistant_type;
        updates.bootstrap_status = 'pending';
        console.log(`[Command] Switched codebase context to: ${codebase.name}`);
      } else {
        // Clear codebase context if moving outside known repos
        updates.codebase_id = null;
        console.log(`[Command] Cleared codebase context for path: ${newCwd}`);
      }

      await db.updateConversation(conversation.id, updates);

      // Add this directory to git safe.directory if it's a git repository
      // This prevents "dubious ownership" errors when working with existing repos
      try {
        await execAsync(`git config --global --add safe.directory ${newCwd}`);
        console.log(`[Command] Added ${newCwd} to git safe.directory`);
      } catch (_error) {
        // Ignore errors - directory might not be a git repo
        console.log(
          `[Command] Could not add ${newCwd} to safe.directory (might not be a git repo)`
        );
      }

      // Reset session when changing working directory
      const session = await sessionDb.getActiveSession(conversation.id);
      if (session) {
        await sessionDb.deactivateSession(session.id);
        console.log('[Command] Deactivated session after context change');
      }

      let responseMsg = `Working directory set to: ${newCwd}`;
      if (codebase) {
        responseMsg += `\nCodebase switched to: ${codebase.name}`;
      }
      responseMsg += '\n\nSession reset - starting fresh on next message.';

      return {
        success: true,
        message: responseMsg,
        modified: true,
      };
    }

    case 'clone': {
      if (args.length === 0 || !args[0]) {
        return { success: false, message: 'Usage: /clone <repo-url>' };
      }

      const repoUrl: string = args[0];
      const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'unknown';
      // Inside Docker container, always use /workspace (mounted volume)
      const workspacePath = '/workspace';
      const targetPath = `${workspacePath}/${repoName}`;

      try {
        console.log(`[Clone] Cloning ${repoUrl} to ${targetPath}`);

        // Build clone command with authentication if GitHub token is available
        let cloneCommand = `git clone ${repoUrl} ${targetPath}`;
        const ghToken = process.env.GH_TOKEN;

        if (ghToken && repoUrl.includes('github.com')) {
          // Inject token into GitHub URL for private repo access
          // Convert: https://github.com/user/repo.git -> https://token@github.com/user/repo.git
          let authenticatedUrl = repoUrl;
          if (repoUrl.startsWith('https://github.com')) {
            authenticatedUrl = repoUrl.replace(
              'https://github.com',
              `https://${ghToken}@github.com`
            );
          } else if (repoUrl.startsWith('http://github.com')) {
            authenticatedUrl = repoUrl.replace(
              'http://github.com',
              `https://${ghToken}@github.com`
            );
          } else if (!repoUrl.startsWith('http')) {
            // Handle github.com/user/repo format
            authenticatedUrl = `https://${ghToken}@${repoUrl}`;
          }
          cloneCommand = `git clone ${authenticatedUrl} ${targetPath}`;
          console.log('[Clone] Using authenticated GitHub clone');
        }

        await execAsync(cloneCommand);

        // Add the cloned repository to git safe.directory to prevent ownership errors
        // This is needed because we run as non-root user but git might see different ownership
        await execAsync(`git config --global --add safe.directory ${targetPath}`);
        console.log(`[Clone] Added ${targetPath} to git safe.directory`);

        // Auto-detect assistant type based on folder structure
        let suggestedAssistant = 'claude';
        const codexFolder = join(targetPath, '.codex');
        const claudeFolder = join(targetPath, '.claude');

        try {
          await access(codexFolder);
          suggestedAssistant = 'codex';
          console.log('[Clone] Detected .codex folder - using Codex assistant');
        } catch {
          try {
            await access(claudeFolder);
            suggestedAssistant = 'claude';
            console.log('[Clone] Detected .claude folder - using Claude assistant');
          } catch {
            // Default to claude
            console.log('[Clone] No assistant folder detected - defaulting to Claude');
          }
        }

        const codebase = await codebaseDb.createCodebase({
          name: repoName,
          repository_url: repoUrl,
          default_cwd: targetPath,
          ai_assistant_type: suggestedAssistant,
        });

        await db.updateConversation(conversation.id, {
          codebase_id: codebase.id,
          cwd: targetPath,
          bootstrap_status: 'pending'
        });

        // Reset session when cloning a new repository
        const session = await sessionDb.getActiveSession(conversation.id);
        if (session) {
          await sessionDb.deactivateSession(session.id);
          console.log('[Command] Deactivated session after clone');
        }

        // Detect command folders
        let commandFolder: string | null = null;
        for (const folder of ['.claude/commands', '.codex/commands', '.agents/commands']) {
          try {
            await access(join(targetPath, folder));
            commandFolder = folder;
            break;
          } catch {
            /* ignore */
          }
        }

        let responseMessage = `Repository cloned successfully!\n\nCodebase: ${repoName}\nPath: ${targetPath}\n\nSession reset - starting fresh on next message.\n\nYou can now start asking questions about the code.`;

        if (commandFolder) {
          responseMessage += `\n\n📁 Found: ${commandFolder}/\nUse /load-commands ${commandFolder} to register commands.`;
        }

        return {
          success: true,
          message: responseMessage,
          modified: true,
        };
      } catch (error) {
        const err = error as Error;
        console.error('[Clone] Failed:', err);
        return {
          success: false,
          message: `Failed to clone repository: ${err.message}`,
        };
      }
    }

    case 'command-set': {
      if (args.length < 2) {
        return { success: false, message: 'Usage: /command-set <name> <path> [text]' };
      }
      if (!conversation.codebase_id) {
        return { success: false, message: 'No codebase configured. Use /clone first.' };
      }

      const [commandName, commandPath, ...textParts] = args;
      const commandText = textParts.join(' ');
      const fullPath = join(conversation.cwd || '/workspace', commandPath);

      try {
        if (commandText) {
          await writeFile(fullPath, commandText, 'utf-8');
        } else {
          await readFile(fullPath, 'utf-8'); // Validate exists
        }
        await codebaseDb.registerCommand(conversation.codebase_id, commandName, {
          path: commandPath,
          description: `Custom: ${commandName}`,
        });
        return {
          success: true,
          message: `Command '${commandName}' registered!\nPath: ${commandPath}`,
        };
      } catch (error) {
        const err = error as Error;
        console.error('[Command] command-set failed:', err);
        return { success: false, message: `Failed: ${err.message}` };
      }
    }

    case 'load-commands': {
      if (!args.length) {
        return { success: false, message: 'Usage: /load-commands <folder>' };
      }
      if (!conversation.codebase_id) {
        return { success: false, message: 'No codebase configured.' };
      }

      const folderPath = args.join(' ');
      const fullPath = join(conversation.cwd || '/workspace', folderPath);

      try {
        // Recursively find all .md files
        const markdownFiles = await findMarkdownFilesRecursive(fullPath);

        if (!markdownFiles.length) {
          return { success: false, message: `No .md files found in ${folderPath} (searched recursively)` };
        }

        const commands = await codebaseDb.getCodebaseCommands(conversation.codebase_id);

        // Register each command (later files with same name will override earlier ones)
        markdownFiles.forEach(({ commandName, relativePath }) => {
          commands[commandName] = {
            path: join(folderPath, relativePath),
            description: `From ${folderPath}`,
          };
        });

        await codebaseDb.updateCodebaseCommands(conversation.codebase_id, commands);

        return {
          success: true,
          message: `Loaded ${markdownFiles.length} commands recursively: ${markdownFiles.map(f => f.commandName).join(', ')}`,
        };
      } catch (error) {
        const err = error as Error;
        console.error('[Command] load-commands failed:', err);
        return { success: false, message: `Failed: ${err.message}` };
      }
    }

    case 'commands': {
      if (!conversation.codebase_id) {
        return { success: false, message: 'No codebase configured.' };
      }

      const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
      const commands = codebase?.commands || {};

      if (!Object.keys(commands).length) {
        return {
          success: true,
          message: 'No commands registered.\n\nUse /command-set or /load-commands.',
        };
      }

      let msg = 'Registered Commands:\n\n';
      for (const [name, def] of Object.entries(commands)) {
        msg += `${name} - ${def.path}\n`;
      }
      return { success: true, message: msg };
    }

    case 'repos': {
      const workspacePath = '/workspace';

      try {
        const entries = await readdir(workspacePath, { withFileTypes: true });
        const folders = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

        if (!folders.length) {
          return {
            success: true,
            message: 'No repositories found in /workspace',
          };
        }

        const currentCwd = conversation.cwd || '';
        let msg = 'Workspace Repositories:\n\n';

        folders.forEach(folder => {
          const folderPath = join(workspacePath, folder);
          const isActive = currentCwd.startsWith(folderPath);
          msg += `${folderPath}${isActive ? ' [active]' : ''}\n`;
        });

        return { success: true, message: msg };
      } catch (error) {
        const err = error as Error;
        console.error('[Command] repos failed:', err);
        return { success: false, message: `Failed to list repositories: ${err.message}` };
      }
    }

    case 'reset': {
      const session = await sessionDb.getActiveSession(conversation.id);
      if (session) {
        await sessionDb.deactivateSession(session.id);
        return {
          success: true,
          message:
            'Session cleared. Starting fresh on next message.\n\nCodebase configuration preserved.',
        };
      }
      return {
        success: true,
        message: 'No active session to reset.',
      };
    }

    default:
      return {
        success: false,
        message: `Unknown command: /${command}\n\nType /help to see available commands.`,
      };
  }
}
