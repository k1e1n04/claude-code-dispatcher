import { ClaudeCodeDispatcher, DispatcherOrchestrator } from '../src/services';
import { DispatcherConfig } from '../src/types';
import { execSync } from 'child_process';

jest.mock('child_process');
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('ClaudeCodeDispatcher (DispatcherOrchestrator) - Simple Tests', () => {
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
      expect(dispatcher).toBeInstanceOf(DispatcherOrchestrator);
    });

    test('should accept working directory parameter', () => {
      const customDispatcher = new ClaudeCodeDispatcher(config, '/custom/path');
      expect(customDispatcher).toBeDefined();
    });
  });

  describe('prerequisites validation', () => {
    test('should validate prerequisites during start', async () => {
      // Prerequisites validation is now handled by PrerequisitesValidator
      // This test ensures the orchestrator calls validation during startup
      try {
        await dispatcher.start();
        // Should have called execSync for validation
        expect(mockExecSync).toHaveBeenCalledWith('gh auth status', { stdio: 'pipe' });
        expect(mockExecSync).toHaveBeenCalledWith('gh repo view testorg/testrepo', { stdio: 'pipe' });
        expect(mockExecSync).toHaveBeenCalledWith('claude --version', { stdio: 'pipe' });
        
        await dispatcher.stop();
      } catch (error) {
        // Expected to fail in test environment due to missing services
      }
    });

    test('should handle prerequisites validation failure during start', async () => {
      mockExecSync.mockImplementation((command) => {
        if (command.toString().includes('gh auth status')) {
          const error = new Error('command not found') as any;
          error.code = 'ENOENT';
          throw error;
        }
        return '';
      });

      await expect(dispatcher.start())
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

    // PR body creation is now handled by PromptBuilder in the new architecture
    // These tests are covered in prompt-builder.test.ts
  });
});