/**
 * Simple Integration Tests
 * Basic integration tests that focus on the core functionality without complex mocking
 */

// Mock winston before any imports to prevent file creation
jest.mock('winston', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  return {
    createLogger: jest.fn(() => mockLogger),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      errors: jest.fn(),
      json: jest.fn(),
      colorize: jest.fn(),
      simple: jest.fn()
    },
    transports: {
      Console: jest.fn()
    }
  };
});

jest.mock('winston-daily-rotate-file', () => {
  return jest.fn().mockImplementation(() => ({
    // Mock transport
  }));
});

import { ProcessingStateManager } from '../../src/services/processing-state-manager';
import { GitRepository } from '../../src/infrastructure/git-repository';
import { ProcessingStep } from '../../src/types/index';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

describe('Simple Integration Tests', () => {
  let testDir: string;
  let originalCwd: string;
  let originalNodeEnv: string | undefined;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    
    testDir = await fs.mkdtemp(join(tmpdir(), 'simple-integration-test-'));
    process.chdir(testDir);

    // Setup git repository
    await execCommand('git', ['init']);
    await execCommand('git', ['config', 'user.name', 'Test User']);
    await execCommand('git', ['config', 'user.email', 'test@example.com']);
    await execCommand('git', ['checkout', '-b', 'main']);
    await fs.writeFile(join(testDir, 'README.md'), '# Test Project');
    await execCommand('git', ['add', '.']);
    await execCommand('git', ['commit', '-m', 'Initial commit']);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('State Management', () => {
    test('should create and manage state files', async () => {
      const stateManager = new ProcessingStateManager();
      const mockIssue = { id: 123, number: 123 };
      
      // Create initial state
      const branchName = 'issue-123-test';
      const state = stateManager.createInitialState(mockIssue.id, branchName, 'main');
      stateManager.saveState(state);

      // Verify state file exists
      const stateDir = join(process.cwd(), '.claude-state');
      const exists = await fs.access(stateDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Load state
      const loadedState = await stateManager.loadState(mockIssue.id);
      expect(loadedState).not.toBeNull();
      expect(loadedState?.issueId).toBe(123);
      expect(loadedState?.branchName).toBe(branchName);
      expect(loadedState?.currentStep).toBe(ProcessingStep.BRANCH_CREATION);

      // Update step
      stateManager.updateStep(mockIssue.id, ProcessingStep.IMPLEMENTATION);
      const updatedState = await stateManager.loadState(mockIssue.id);
      expect(updatedState?.currentStep).toBe(ProcessingStep.IMPLEMENTATION);

      // Cleanup
      stateManager.cleanupState(mockIssue.id);
      const stateFile = join(stateDir, '123.json');
      const stateFileExists = await fs.access(stateFile).then(() => true).catch(() => false);
      expect(stateFileExists).toBe(false);
    });

    test('should handle retry count increment', async () => {
      const stateManager = new ProcessingStateManager();
      const mockIssue = { id: 456, number: 456 };
      
      const branchName = 'issue-456-retry-test';
      const state = stateManager.createInitialState(mockIssue.id, branchName, 'main');
      stateManager.saveState(state);

      // Increment retry count
      stateManager.incrementRetryCount(mockIssue.id);
      const updatedState = await stateManager.loadState(mockIssue.id);
      expect(updatedState?.retryCount).toBe(1);

      // Increment again
      stateManager.incrementRetryCount(mockIssue.id);
      const finalState = await stateManager.loadState(mockIssue.id);
      expect(finalState?.retryCount).toBe(2);

      // Cleanup
      stateManager.cleanupState(mockIssue.id);
    });
  });

  describe('Git Repository Operations', () => {
    test('should perform basic git operations', async () => {
      const gitRepository = new GitRepository(testDir);
      
      // Test branch name generation
      const mockIssue = {
        id: 789,
        number: 789,
        title: 'Add new feature for testing',
        body: 'This is a test issue',
        state: 'open' as const,
        assignee: { login: 'testuser' },
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo'
        },
        html_url: 'https://github.com/testorg/testrepo/issues/789',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };

      const branchName = gitRepository.generateBranchName(mockIssue);
      expect(branchName).toMatch(/^issue-789-add-new-feature-for-testing$/);

      // Test branch creation manually (switchToBranch tries to pull from origin)
      await execCommand('git', ['checkout', '-b', branchName]);
      
      // Verify branch was created and switched
      const currentBranch = await execCommand('git', ['branch', '--show-current']);
      expect(currentBranch.stdout.trim()).toBe(branchName);

      // Test changes detection
      await fs.writeFile(join(testDir, 'test-file.txt'), 'test content');
      const hasChanges = await gitRepository.checkForChanges();
      expect(hasChanges).toBe(true);

      // Test discard changes
      gitRepository.discardChanges();
      const statusAfterDiscard = await execCommand('git', ['status', '--porcelain']);
      expect(statusAfterDiscard.stdout.trim()).toBe('');

      // Switch back and delete branch
      await execCommand('git', ['checkout', 'main']);
      gitRepository.deleteBranch(branchName, 'main');
      
      // Verify branch was deleted
      const branches = await execCommand('git', ['branch']);
      expect(branches.stdout).not.toContain(branchName);
    });
  });

  describe('File System Integration', () => {
    test('should handle directory creation and cleanup', async () => {
      const stateDir = join(testDir, '.claude-state');
      
      // Initially no directory
      let exists = await fs.access(stateDir).then(() => true).catch(() => false);
      expect(exists).toBe(false);

      // Create state manager (should create directory)
      const stateManager = new ProcessingStateManager();
      const state = stateManager.createInitialState(999, 'test-branch', 'main');
      stateManager.saveState(state);

      // Directory should exist
      exists = await fs.access(stateDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Should contain state file
      const files = await fs.readdir(stateDir);
      expect(files).toContain('999.json');

      // Cleanup
      stateManager.cleanupState(999);
      const finalFiles = await fs.readdir(stateDir);
      expect(finalFiles).not.toContain('999.json');
    });

    test('should handle missing state files gracefully', async () => {
      const stateManager = new ProcessingStateManager();
      
      // Try to load non-existent state
      const state = await stateManager.loadState(999);
      expect(state).toBeNull();

      // Try to update non-existent state (should not throw)
      expect(() => {
        stateManager.updateStep(999, ProcessingStep.IMPLEMENTATION);
      }).not.toThrow();

      // Try to cleanup non-existent state (should not throw)
      expect(() => {
        stateManager.cleanupState(999);
      }).not.toThrow();
    });
  });

  describe('Processing Step Enum', () => {
    test('should have all expected processing steps', () => {
      const steps = Object.values(ProcessingStep);
      expect(steps).toContain(ProcessingStep.BRANCH_CREATION);
      expect(steps).toContain(ProcessingStep.IMPLEMENTATION);
      expect(steps).toContain(ProcessingStep.CHANGE_DETECTION);
      expect(steps).toContain(ProcessingStep.COMMIT_PUSH);
      expect(steps).toContain(ProcessingStep.PR_CREATION);
      expect(steps).toContain(ProcessingStep.COMPLETED);
    });

    test('should support step transitions', () => {
      const stateManager = new ProcessingStateManager();
      const state = stateManager.createInitialState(123, 'test', 'main');
      
      // Initial step should be BRANCH_CREATION
      expect(state.currentStep).toBe(ProcessingStep.BRANCH_CREATION);
      
      stateManager.saveState(state);

      // Test step progression
      const steps = [
        ProcessingStep.IMPLEMENTATION,
        ProcessingStep.CHANGE_DETECTION,
        ProcessingStep.COMMIT_PUSH,
        ProcessingStep.PR_CREATION,
        ProcessingStep.COMPLETED
      ];

      for (const step of steps) {
        stateManager.updateStep(123, step);
        const updatedState = stateManager.loadState(123);
        expect(updatedState?.currentStep).toBe(step);
      }

      stateManager.cleanupState(123);
    });
  });
});

/**
 * Execute a command and return result
 */
async function execCommand(command: string, args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd()
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0
      });
    });
  });
}