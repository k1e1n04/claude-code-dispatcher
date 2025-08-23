import { execSync } from 'child_process';
import { logger } from '../utils';

/**
 * Interface for Claude Code execution
 */
export interface IClaudeCodeExecutor {
  execute(prompt: string): Promise<void>;
}

/**
 * Configuration for Claude Code execution
 */
export interface ClaudeExecutorConfig {
  workingDirectory?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  dangerouslySkipPermissions?: boolean;
}

/**
 * Handles Claude Code command execution with proper permissions and error handling
 */
export class ClaudeCodeExecutor implements IClaudeCodeExecutor {
  private workingDirectory: string;
  private allowedTools: string[];
  private disallowedTools: string[];
  private dangerouslySkipPermissions: boolean;

  constructor(config: ClaudeExecutorConfig = {}) {
    this.workingDirectory = config.workingDirectory || process.cwd();
    this.allowedTools = config.allowedTools || [];
    this.disallowedTools = config.disallowedTools || [];
    this.dangerouslySkipPermissions = config.dangerouslySkipPermissions || false;
  }

  /**
   * Executes ClaudeCode with the provided prompt
   * @param prompt - Formatted prompt for Claude Code
   */
  async execute(prompt: string): Promise<void> {
    try {
      logger.info('Executing ClaudeCode via stdin...');

      const command = this.buildClaudeCommand();
      const output = execSync(command, {
        cwd: this.workingDirectory,
        input: prompt,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'inherit'],
        timeout: 300000
      });
      
      logger.info(`ClaudeCode response: ${output.substring(0, 200)}...`);
      
      // Detect rate-limit or quota messages and treat them as non-retryable
      if (/limit reached|rate limit|quota/i.test(output)) {
        type NonRetryableError = Error & { nonRetryable: true };
        const err = new Error(`ClaudeCode rate limit/quota reached: ${output.trim().split('\n')[0]}`) as NonRetryableError;
        err.nonRetryable = true;
        throw err;
      }
      
      logger.info('ClaudeCode execution completed');
    } catch (error) {
      this.handleExecutionError(error);
    }
  }

  /**
   * Builds the Claude Code command with appropriate tool permissions
   * @returns Complete command string with tool settings
   */
  private buildClaudeCommand(): string {
    let command = 'claude code --print';
    
    // Use dangerously-skip-permissions if enabled
    if (this.dangerouslySkipPermissions) {
      command += ' --dangerously-skip-permissions';
    } else if (this.allowedTools.length > 0) {
      // Add allowed tools only if not in dangerous mode
      const allowedToolsArgs = this.allowedTools
        .map(tool => `"${tool}"`)
        .join(' ');
      command += ` --allowedTools ${allowedToolsArgs}`;
    }
    
    // Add disallowed tools if specified (works with both modes)
    if (this.disallowedTools && this.disallowedTools.length > 0) {
      const disallowedToolsArgs = this.disallowedTools
        .map(tool => `"${tool}"`)
        .join(' ');
      command += ` --disallowedTools ${disallowedToolsArgs}`;
    }
    
    return command;
  }

  /**
   * Handles execution errors with proper rate limit detection
   * @param error - The error that occurred during execution
   */
  private handleExecutionError(error: unknown): never {
    // If execSync produced stdout with a rate-limit message, attach nonRetryable flag
    const errObj = error as unknown as { stdout?: string; message?: string };
    const stderrLike = errObj?.stdout || errObj?.message || String(error);
    
    if (/limit reached|rate limit|quota/i.test(String(stderrLike))) {
      type NonRetryableError = Error & { nonRetryable: true };
      const e = new Error(`ClaudeCode execution failed: ${stderrLike}`) as NonRetryableError;
      e.nonRetryable = true;
      logger.error('ClaudeCode execution failed (non-retryable):', e);
      throw e;
    }

    logger.error('ClaudeCode execution failed:', error);
    throw new Error(`ClaudeCode execution failed: ${error}`);
  }
}