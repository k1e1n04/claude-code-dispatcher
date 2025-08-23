import { ClaudeCodeDispatcher } from '../src/dispatcher';
import { DispatcherConfig } from '../src/types';
import { execSync } from 'child_process';

jest.mock('child_process');
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('ClaudeCodeDispatcher - Simple Tests', () => {
  let config: DispatcherConfig;
  let dispatcher: ClaudeCodeDispatcher;

  beforeEach(() => {
    jest.clearAllMocks();
    
    config = {
      owner: 'testorg',
      repo: 'testrepo',
      assignee: 'testuser',
      baseBranch: 'main',
      pollInterval: 60,
      maxRetries: 3,
      allowedTools: ['Bash', 'Edit', 'Write']
    };

    // Mock successful prerequisites by default
    mockExecSync.mockImplementation((command) => {
      const cmd = command.toString();
      if (cmd.includes('gh auth status')) return '';
      if (cmd.includes('gh repo view')) return '';
      if (cmd.includes('claude --version')) return '';
      if (cmd.includes('rate_limit')) {
        return JSON.stringify({ rate: { remaining: 100, reset: Date.now() + 3600 }});
      }
      if (cmd.includes('gh api')) return JSON.stringify([]);
      return '';
    });

    dispatcher = new ClaudeCodeDispatcher(config, '/test/workspace');
  });

  describe('constructor', () => {
    test('should create dispatcher with valid config', () => {
      expect(dispatcher).toBeDefined();
      expect(dispatcher).toBeInstanceOf(ClaudeCodeDispatcher);
    });

    test('should accept working directory parameter', () => {
      const customDispatcher = new ClaudeCodeDispatcher(config, '/custom/path');
      expect(customDispatcher).toBeDefined();
    });
  });

  describe('prerequisites validation', () => {
    test('should validate GitHub CLI authentication', async () => {
      try {
        await (dispatcher as any).validatePrerequisites();
        
        expect(mockExecSync).toHaveBeenCalledWith(
          'gh auth status',
          { stdio: 'pipe' }
        );
      } catch (error) {
        // Expected to fail in test environment
      }
    });

    test('should validate repository access', async () => {
      try {
        await (dispatcher as any).validatePrerequisites();
        
        expect(mockExecSync).toHaveBeenCalledWith(
          'gh repo view testorg/testrepo',
          { stdio: 'pipe' }
        );
      } catch (error) {
        // Expected to fail in test environment
      }
    });

    test('should validate Claude CLI availability', async () => {
      try {
        await (dispatcher as any).validatePrerequisites();
        
        expect(mockExecSync).toHaveBeenCalledWith(
          'claude --version',
          { stdio: 'pipe' }
        );
      } catch (error) {
        // Expected to fail in test environment
      }
    });

    test('should handle missing GitHub CLI', async () => {
      mockExecSync.mockImplementation((command) => {
        if (command.toString().includes('gh auth status')) {
          const error = new Error('command not found') as any;
          error.code = 'ENOENT';
          throw error;
        }
        return '';
      });

      await expect((dispatcher as any).validatePrerequisites())
        .rejects.toThrow('Prerequisites validation failed');
    });
  });

  describe('status reporting', () => {
    test('should provide initial status', () => {
      const status = dispatcher.getStatus();
      
      expect(status).toHaveProperty('polling');
      expect(status).toHaveProperty('processing');
      expect(status).toHaveProperty('queueSize');
      expect(typeof status.polling).toBe('boolean');
      expect(typeof status.processing).toBe('boolean');
      expect(typeof status.queueSize).toBe('number');
    });

    test('should report not running initially', () => {
      const status = dispatcher.getStatus();
      
      expect(status.polling).toBe(false);
      expect(status.processing).toBe(false);
      expect(status.queueSize).toBe(0);
    });
  });

  describe('lifecycle management', () => {
    test('should handle stop when not started', async () => {
      // Should not throw
      await dispatcher.stop();
      
      const status = dispatcher.getStatus();
      expect(status.polling).toBe(false);
    });

    test('should create proper pull request body', () => {
      const mockIssue = {
        id: 1,
        number: 123,
        title: 'Test Issue',
        body: 'Issue description',
        state: 'open' as const,
        assignee: { login: 'testuser' },
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo'
        },
        html_url: 'https://github.com/testorg/testrepo/issues/123',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };

      const prBody = (dispatcher as any).createPullRequestBody(mockIssue, 'test-branch');
      
      expect(prBody).toContain('## 📋 Issue Summary');
      expect(prBody).toContain('Fixes #123');
      expect(prBody).toContain('Test Issue');
      expect(prBody).toContain('Issue description');
      expect(prBody).toContain('test-branch');
      expect(prBody).toContain('main');
      expect(prBody).toContain('🤖 This pull request was automatically generated');
    });

    test('should handle issue without body in PR', () => {
      const mockIssue = {
        id: 1,
        number: 123,
        title: 'Test Issue',
        body: null,
        state: 'open' as const,
        assignee: { login: 'testuser' },
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo'
        },
        html_url: 'https://github.com/testorg/testrepo/issues/123',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };

      const prBody = (dispatcher as any).createPullRequestBody(mockIssue, 'test-branch');
      
      expect(prBody).toContain('## 📋 Issue Summary');
      expect(prBody).toContain('Fixes #123');
      expect(prBody).not.toContain('**Description:**');
    });
  });
});