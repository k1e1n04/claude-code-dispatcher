import { logger } from '../utils';

/**
 * Error type for Claude Code rate limits
 */
export class RateLimitError extends Error {
  public readonly isRateLimit = true;
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

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
  rateLimitRetryDelay?: number; // Rate limit retry delay in milliseconds
  timeout?: number; // Execution timeout in milliseconds
  bashDefaultTimeoutMs?: number; // BASH_DEFAULT_TIMEOUT_MS environment variable
  bashMaxTimeoutMs?: number; // BASH_MAX_TIMEOUT_MS environment variable
}

/**
 * Handles Claude Code command execution with proper permissions and error handling
 */
export class ClaudeCodeExecutor implements IClaudeCodeExecutor {
  private workingDirectory: string;
  private allowedTools: string[];
  private disallowedTools: string[];
  private dangerouslySkipPermissions: boolean;
  private timeout: number = 300000;
  private bashDefaultTimeoutMs: number = 300000;
  private bashMaxTimeoutMs: number = 600000;
  public rateLimitRetryDelay: number | undefined;

  constructor(config: ClaudeExecutorConfig = {}) {
    this.workingDirectory = config.workingDirectory || process.cwd();
    this.allowedTools = config.allowedTools || [];
    this.disallowedTools = config.disallowedTools || [];
    this.dangerouslySkipPermissions =
      config.dangerouslySkipPermissions || false;
    this.rateLimitRetryDelay = config.rateLimitRetryDelay;
    
    if (config.bashDefaultTimeoutMs !== undefined) {
      this.bashDefaultTimeoutMs = config.bashDefaultTimeoutMs;
    }
    if (config.bashMaxTimeoutMs !== undefined) {
      this.bashMaxTimeoutMs = config.bashMaxTimeoutMs;
    }
    if (config.timeout !== undefined) {
      this.timeout = config.timeout;
    }
  }

  /**
   * Executes ClaudeCode with the provided prompt
   * @param prompt - Formatted prompt for Claude Code
   */
  async execute(prompt: string): Promise<void> {
    try {
      logger.info('Executing ClaudeCode via stdin...');

      const command = this.buildClaudeCommand();
      const { execSync } = await import('child_process');
      const env = this.buildEnvironment();
      const output = execSync(command, {
        cwd: this.workingDirectory,
        input: prompt,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'inherit'],
        timeout: this.timeout,
        env,
      });

      logger.info(`ClaudeCode response: ${output.substring(0, 200)}...`);

      // Check for rate limits in successful output
      if (this.isRateLimited(new Error(''), output)) {
        throw new RateLimitError(
          `5-hour limit reached: ${output.trim().split('\n')[0]}`
        );
      }

      if (this.isQuotaLimited(new Error(''), output)) {
        throw new RateLimitError(
          `Daily quota reached: ${output.trim().split('\n')[0]}`
        );
      }

      logger.info('ClaudeCode execution completed');
    } catch (error) {
      if (error instanceof RateLimitError) {
        // Preserve RateLimitError semantics for upstream handling
        throw error;
      }
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
    .map((tool) => `"${tool}"`)
        .join(' ');
      command += ` --allowedTools ${allowedToolsArgs}`;
    }

    // Add disallowed tools if specified (works with both modes)
  if (this.disallowedTools && this.disallowedTools.length > 0) {
      const disallowedToolsArgs = this.disallowedTools
    .map((tool) => `"${tool}"`)
        .join(' ');
      command += ` --disallowedTools ${disallowedToolsArgs}`;
    }

    return command;
  }

  /**
   * Builds the environment variables for Claude Code execution
   * @returns Environment variables object
   */
  private buildEnvironment(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    if (this.bashDefaultTimeoutMs) {
      env.BASH_DEFAULT_TIMEOUT_MS = this.bashDefaultTimeoutMs.toString();
    }

    if (this.bashMaxTimeoutMs) {
      env.BASH_MAX_TIMEOUT_MS = this.bashMaxTimeoutMs.toString();
    }

    return env;
  }

  /**
   * Detects if error/output indicates a rate limit (5-hour limit)
   * @param error - The error object
   * @param stdout - The stdout output
   * @returns true if rate limited
   */
  private isRateLimited(error: Error, stdout: string): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    const outputMessage = stdout?.toLowerCase() || '';

    return (
      outputMessage.includes('5-hour limit reached') ||
      outputMessage.includes('limit reached') ||
      errorMessage.includes('rate limit') ||
      outputMessage.includes('rate limit')
    );
  }

  /**
   * Detects if error/output indicates a quota limit (daily quota)
   * @param error - The error object
   * @param stdout - The stdout output
   * @returns true if quota limited
   */
  private isQuotaLimited(error: Error, stdout: string): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    const outputMessage = stdout?.toLowerCase() || '';

    return (
      outputMessage.includes('quota reached') ||
      errorMessage.includes('quota reached') ||
      outputMessage.includes('daily quota') ||
      errorMessage.includes('daily quota')
    );
  }

  /**
   * Handles execution errors with proper rate limit detection
   * @param error - The error that occurred during execution
   */
  private handleExecutionError(error: unknown): never {
    const errObj = error as unknown as { stdout?: string; message?: string };
    const stdout = errObj?.stdout || '';
    const errorMessage = errObj?.message || String(error);
    const err = new Error(errorMessage);

    // Check for rate limits (5-hour limit)
    if (this.isRateLimited(err, stdout)) {
      logger.warn('Claude Code rate limited. Will retry after delay...');
      throw new RateLimitError(
        `5-hour limit reached: ${stdout.trim().split('\n')[0]}`
      );
    }

    // Check for quota limits (daily quota)
    if (this.isQuotaLimited(err, stdout)) {
      logger.warn('Claude Code daily quota reached. Will retry later...');
      throw new RateLimitError(
        `Daily quota reached: ${stdout.trim().split('\n')[0]}`
      );
    }

    // Regular error
    logger.error('ClaudeCode execution failed:', error);
    throw new Error(`ClaudeCode execution failed: ${error}`);
  }
}
