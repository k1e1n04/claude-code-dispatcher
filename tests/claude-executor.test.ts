import { ClaudeCodeExecutor } from '../src/claude-executor';
import { execSync } from 'child_process';

jest.mock('child_process');
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('ClaudeCodeExecutor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('command building', () => {
    test('should build basic command with no permissions', () => {
      const executor = new ClaudeCodeExecutor();
      
      // Access private method for testing
      const command = (executor as any).buildClaudeCommand();
      expect(command).toBe('claude code --print');
    });

    test('should build command with allowed tools', () => {
      const executor = new ClaudeCodeExecutor({
        allowedTools: ['Edit', 'Write', 'Bash(git add:*)']
      });
      
      const command = (executor as any).buildClaudeCommand();
      expect(command).toBe('claude code --print --allowedTools "Edit" "Write" "Bash(git add:*)"');
    });

    test('should build command with disallowed tools', () => {
      const executor = new ClaudeCodeExecutor({
        disallowedTools: ['WebFetch', 'Bash(rm:*)']
      });
      
      const command = (executor as any).buildClaudeCommand();
      expect(command).toBe('claude code --print --disallowedTools "WebFetch" "Bash(rm:*)"');
    });

    test('should build command with dangerously-skip-permissions', () => {
      const executor = new ClaudeCodeExecutor({
        dangerouslySkipPermissions: true
      });
      
      const command = (executor as any).buildClaudeCommand();
      expect(command).toBe('claude code --print --dangerously-skip-permissions');
    });

    test('should prioritize dangerously-skip-permissions over allowed tools', () => {
      const executor = new ClaudeCodeExecutor({
        allowedTools: ['Edit', 'Write'],
        dangerouslySkipPermissions: true
      });
      
      const command = (executor as any).buildClaudeCommand();
      expect(command).toBe('claude code --print --dangerously-skip-permissions');
    });

    test('should include disallowed tools even with dangerously-skip-permissions', () => {
      const executor = new ClaudeCodeExecutor({
        allowedTools: ['Edit'],
        disallowedTools: ['WebFetch'],
        dangerouslySkipPermissions: true
      });
      
      const command = (executor as any).buildClaudeCommand();
      expect(command).toBe('claude code --print --dangerously-skip-permissions --disallowedTools "WebFetch"');
    });
  });

  describe('execution', () => {
    test('should execute claude command successfully', async () => {
      const executor = new ClaudeCodeExecutor({
        workingDirectory: '/test/workspace',
        allowedTools: ['Edit', 'Write']
      });

      mockExecSync.mockReturnValue('Claude execution completed successfully');

      await executor.execute('Test prompt');

      expect(mockExecSync).toHaveBeenCalledWith(
        'claude code --print --allowedTools "Edit" "Write"',
        {
          cwd: '/test/workspace',
          input: 'Test prompt',
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'inherit'],
          timeout: 300000,
        }
      );
    });

    test('should handle rate limit errors as non-retryable', async () => {
      const executor = new ClaudeCodeExecutor();
      mockExecSync.mockReturnValue('Rate limit reached. Please try again later.');

      await expect(executor.execute('Test prompt'))
        .rejects.toMatchObject({
          message: expect.stringContaining('rate limit/quota reached'),
          nonRetryable: true
        });
    });

    test('should handle general execution errors', async () => {
      const executor = new ClaudeCodeExecutor();
      mockExecSync.mockImplementation(() => {
        throw new Error('Command failed');
      });

      await expect(executor.execute('Test prompt'))
        .rejects.toThrow('ClaudeCode execution failed: Error: Command failed');
    });

    test('should handle rate limit in error stdout', async () => {
      const executor = new ClaudeCodeExecutor();
      const error = new Error('Command failed') as any;
      error.stdout = 'quota exceeded';
      
      mockExecSync.mockImplementation(() => {
        throw error;
      });

      await expect(executor.execute('Test prompt'))
        .rejects.toMatchObject({
          message: expect.stringContaining('ClaudeCode execution failed'),
          nonRetryable: true
        });
    });
  });
});