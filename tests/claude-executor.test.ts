import { ClaudeCodeExecutor, RateLimitError } from '../src/clients';
import { execSync } from 'child_process';

jest.mock('child_process');
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

interface ExecutorTestHooks {
  buildClaudeCommand: () => string;
  rateLimitRetryDelay: number;
}

describe('ClaudeCodeExecutor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('command building', () => {
    test('should build basic command with no permissions', () => {
      const executor = new ClaudeCodeExecutor();
      const hooks = executor as unknown as ExecutorTestHooks;
      const command = hooks.buildClaudeCommand();
      expect(command).toBe('claude code --print');
    });

    test('should build command with allowed tools', () => {
      const executor = new ClaudeCodeExecutor({
        allowedTools: ['Edit', 'Write', 'Bash(git add:*)'],
      });
      const hooks = executor as unknown as ExecutorTestHooks;
      const command = hooks.buildClaudeCommand();
      expect(command).toBe(
        'claude code --print --allowedTools "Edit" "Write" "Bash(git add:*)"'
      );
    });

    test('should build command with disallowed tools', () => {
      const executor = new ClaudeCodeExecutor({
        disallowedTools: ['WebFetch', 'Bash(rm:*)'],
      });
      const hooks = executor as unknown as ExecutorTestHooks;
      const command = hooks.buildClaudeCommand();
      expect(command).toBe(
        'claude code --print --disallowedTools "WebFetch" "Bash(rm:*)"'
      );
    });

    test('should build command with dangerously-skip-permissions', () => {
      const executor = new ClaudeCodeExecutor({
        dangerouslySkipPermissions: true,
      });
      const hooks = executor as unknown as ExecutorTestHooks;
      const command = hooks.buildClaudeCommand();
      expect(command).toBe(
        'claude code --print --dangerously-skip-permissions'
      );
    });

    test('should prioritize dangerously-skip-permissions over allowed tools', () => {
      const executor = new ClaudeCodeExecutor({
        allowedTools: ['Edit', 'Write'],
        dangerouslySkipPermissions: true,
      });
      const hooks = executor as unknown as ExecutorTestHooks;
      const command = hooks.buildClaudeCommand();
      expect(command).toBe(
        'claude code --print --dangerously-skip-permissions'
      );
    });

    test('should include disallowed tools even with dangerously-skip-permissions', () => {
      const executor = new ClaudeCodeExecutor({
        allowedTools: ['Edit'],
        disallowedTools: ['WebFetch'],
        dangerouslySkipPermissions: true,
      });
      const hooks = executor as unknown as ExecutorTestHooks;
      const command = hooks.buildClaudeCommand();
      expect(command).toBe(
        'claude code --print --dangerously-skip-permissions --disallowedTools "WebFetch"'
      );
    });

    test('should accept rateLimitRetryDelay configuration', () => {
      const executor = new ClaudeCodeExecutor({
        rateLimitRetryDelay: 10 * 60 * 1000, // 10 minutes
      });
      const hooks = executor as unknown as ExecutorTestHooks;
      expect(hooks.rateLimitRetryDelay).toBe(10 * 60 * 1000);
    });

    test('should accept timeout configuration', () => {
      const executor = new ClaudeCodeExecutor({
        timeout: 600000,
        bashDefaultTimeoutMs: 400000,
        bashMaxTimeoutMs: 800000,
      });
      
      // Access private properties for testing
      const privateExecutor = executor as unknown as {
        timeout: number;
        bashDefaultTimeoutMs: number;
        bashMaxTimeoutMs: number;
      };
      
      expect(privateExecutor.timeout).toBe(600000);
      expect(privateExecutor.bashDefaultTimeoutMs).toBe(400000);
      expect(privateExecutor.bashMaxTimeoutMs).toBe(800000);
    });
  });

  describe('execution', () => {
    test('should execute claude command successfully', async () => {
      const executor = new ClaudeCodeExecutor({
        workingDirectory: '/test/workspace',
        allowedTools: ['Edit', 'Write'],
      });

      mockExecSync.mockReturnValue(
        'Claude execution completed successfully' as unknown as Buffer
      );

      await expect(executor.execute('Test prompt')).resolves.toBeUndefined();

      expect(mockExecSync).toHaveBeenCalledWith(
        'claude code --print --allowedTools "Edit" "Write"',
        {
          cwd: '/test/workspace',
          input: 'Test prompt',
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'inherit'],
          timeout: 600000,
          env: expect.objectContaining({
            BASH_DEFAULT_TIMEOUT_MS: '600000',
            BASH_MAX_TIMEOUT_MS: '1200000',
            ...process.env,
          }),
        }
      );
    });

    test('should handle rate limit errors as RateLimitError', async () => {
      const executor = new ClaudeCodeExecutor();
      mockExecSync.mockReturnValue(
        '5-hour limit reached ∙ resets 2am' as unknown as Buffer
      );

      await expect(executor.execute('Test prompt')).rejects.toBeInstanceOf(
        RateLimitError
      );

      await expect(executor.execute('Test prompt')).rejects.toMatchObject({
        message: expect.stringContaining('5-hour limit reached'),
        isRateLimit: true,
      });
    });

    test('should handle general execution errors', async () => {
      const executor = new ClaudeCodeExecutor();
      mockExecSync.mockImplementation(() => {
        throw new Error('Command failed');
      });

      await expect(executor.execute('Test prompt')).rejects.toThrow(
        'ClaudeCode execution failed: Error: Command failed'
      );
    });

    test('should handle quota limit in error stdout', async () => {
      const executor = new ClaudeCodeExecutor();
      const error = new Error('Command failed') as unknown as {
        stdout?: string;
      };
      error.stdout = 'quota reached';

      mockExecSync.mockImplementation(() => {
        throw error;
      });

      await expect(executor.execute('Test prompt')).rejects.toBeInstanceOf(
        RateLimitError
      );

      await expect(executor.execute('Test prompt')).rejects.toMatchObject({
        message: expect.stringContaining('Daily quota reached'),
        isRateLimit: true,
      });
    });
  });
});
