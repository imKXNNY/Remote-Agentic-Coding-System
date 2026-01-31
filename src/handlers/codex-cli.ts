import { spawn } from 'child_process';

export interface CodexReviewOptions {
  workingDir: string;
  target?: string;
  reviewMode?: 'branch' | 'uncommitted' | 'commit';
}

/**
 * Runs the native `codex review` command
 */
export async function runCodexReview(options: CodexReviewOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['review'];

    // Construct command arguments based on mode
    if (options.reviewMode === 'branch' && options.target) {
      args.push('--base', options.target);
    } else if (options.reviewMode === 'commit' && options.target) {
      args.push('--commit', options.target);
    } else if (options.reviewMode === 'uncommitted') {
      // Default behavior of review often covers uncommitted, but explicit flag might be needed
      // Based on docs, just 'review' might be interactive picker, so we need flags
      // 'codex review --help' mentioned 'non-interactively'
      // We'll rely on flags to make it non-interactive
    }

    // Force non-interactive if needed, or rely on lack of TTY
    // The help text showed "Run a code review non-interactively"
    
    console.log(`[Codex CLI] Running: codex ${args.join(' ')}`);

    const child = spawn('codex', args, {
      cwd: options.workingDir,
      env: { ...process.env, FORCE_COLOR: '1' }, // Keep colors if possible, though strict JSON might be better for machine parsing. For chat, color codes might be messy unless stripped or rendered.
      // We'll trust the WebUI can handle ANSI or we strip it.
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      errorOutput += data.toString();
      // Optional: Stream stderr to console for debugging
      console.error(`[Codex CLI stderr]: ${data}`);
    });

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`Codex review failed with code ${code}: ${errorOutput}`));
      } else {
        resolve(output || 'Review completed but returned no output.');
      }
    });

    child.on('error', (err: Error) => {
      reject(err);
    });
  });
}
