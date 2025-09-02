import { GitRepository } from '../../src/infrastructure/git-repository';
import { ProcessingStateManager } from '../../src/services/processing-state-manager';
import { ProcessingStep } from '../../src/types/index';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

/**
 * End-to-End Workflow Integration Tests
 * Tests complete workflows from issue processing to PR creation
 */
describe('E2E Workflow Integration Tests', () => {
  let testDir: string;
  let originalCwd: string;
  let gitRepository: GitRepository;
  let stateManager: ProcessingStateManager;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(join(tmpdir(), 'e2e-workflow-test-'));
    process.chdir(testDir);

    // Setup mock git repository
    await execCommand('git', ['init']);
    await execCommand('git', ['config', 'user.name', 'Test User']);
    await execCommand('git', ['config', 'user.email', 'test@example.com']);
    await execCommand('git', ['checkout', '-b', 'main']);
    
    // Create initial project structure
    await fs.mkdir(join(testDir, 'src'), { recursive: true });
    await fs.writeFile(join(testDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      scripts: { test: 'echo "test"' }
    }, null, 2));
    await fs.writeFile(join(testDir, 'src/main.ts'), 'console.log("Hello World");');
    
    await execCommand('git', ['add', '.']);
    await execCommand('git', ['commit', '-m', 'Initial commit']);

    gitRepository = new GitRepository(testDir);
    stateManager = new ProcessingStateManager(join(testDir, '.claude-state'));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Complete Issue Processing Workflow', () => {
    test('should handle full workflow without rate limits', async () => {
      const mockIssue = {
        id: 123,
        number: 123,
        title: 'Add hello world function',
        body: 'Create a function that returns "Hello World"',
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

      // Test branch creation
      const branchName = `issue-${mockIssue.number}-add-hello-world-function`;
      await execCommand('git', ['checkout', '-b', branchName]);
      
      // Verify branch was created
      const branches = await execCommand('git', ['branch']);
      expect(branches.stdout).toContain(branchName);

      // Test file modification (simulating Claude Code changes)
      const filePath = join(testDir, 'src/hello.ts');
      await fs.writeFile(filePath, `
export function helloWorld(): string {
  return "Hello World";
}
`);

      // Test git operations
      await execCommand('git', ['add', '.']);
      await execCommand('git', ['commit', '-m', 'feat: add hello world function\\n\\n🤖 Generated with Claude Code']);

      // Verify commit was created
      const log = await execCommand('git', ['log', '--oneline', '-1']);
      expect(log.stdout).toContain('feat: add hello world function');

      // Test branch cleanup
      await execCommand('git', ['checkout', 'main']);
      await gitRepository.deleteBranch(branchName, 'main');
      
      const finalBranches = await execCommand('git', ['branch']);
      expect(finalBranches.stdout).not.toContain(branchName);
    });

    test('should persist state during processing', async () => {
      const mockIssue = {
        id: 456,
        number: 456,
        title: 'Test state persistence',
        body: 'Testing state management',
        state: 'open' as const,
        assignee: { login: 'testuser' },
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo'
        },
        html_url: 'https://github.com/testorg/testrepo/issues/456',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };

      // Create initial state
      const branchName = `issue-${mockIssue.number}-test-state-persistence`;
      const initialState = stateManager.createInitialState(mockIssue.id, branchName, 'main');
      stateManager.saveState(initialState);

      // Verify state file was created
      const stateDir = join(testDir, '.claude-state');
      const stateFile = join(stateDir, `${mockIssue.id}.json`);
      const exists = await fs.access(stateFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Load and verify state
      const loadedState = await stateManager.loadState(mockIssue.id);
      expect(loadedState).toBeDefined();
      expect(loadedState?.issueId).toBe(456);
      expect(loadedState?.currentStep).toBe(ProcessingStep.BRANCH_CREATION);

      // Update state and verify persistence
      stateManager.updateStep(mockIssue.id, ProcessingStep.IMPLEMENTATION);
      const updatedState = await stateManager.loadState(mockIssue.id);
      expect(updatedState?.currentStep).toBe(ProcessingStep.IMPLEMENTATION);

      // Cleanup state
      stateManager.cleanupState(mockIssue.id);
      const cleanedExists = await fs.access(stateFile).then(() => true).catch(() => false);
      expect(cleanedExists).toBe(false);
    });
  });

  describe('Rate Limit Recovery Workflow', () => {
    test('should save and resume from different processing steps', async () => {
      const mockIssue = {
        id: 789,
        number: 789,
        title: 'Rate limit test',
        body: 'Testing rate limit recovery',
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

      const steps = [
        ProcessingStep.BRANCH_CREATION,
        ProcessingStep.IMPLEMENTATION, 
        ProcessingStep.CHANGE_DETECTION,
        ProcessingStep.COMMIT_PUSH,
        ProcessingStep.PR_CREATION
      ];

      for (const step of steps) {
        // Create state at this step
        const branchName = `issue-${mockIssue.number}-step-${step}`;
        const state = stateManager.createInitialState(mockIssue.id, branchName, 'main');
        state.currentStep = step;
        stateManager.saveState(state);

        // Verify state persistence
        const loadedState = await stateManager.loadState(mockIssue.id);
        expect(loadedState?.currentStep).toBe(step);

        // Simulate retry count increment
        stateManager.incrementRetryCount(mockIssue.id);
        const updatedState = await stateManager.loadState(mockIssue.id);
        expect(updatedState?.retryCount).toBe(1);

        // Cleanup for next iteration
        stateManager.cleanupState(mockIssue.id);
      }
    });

    test('should handle state directory creation and cleanup', async () => {
      const stateDir = join(testDir, '.claude-state');
      
      // Initially no state directory
      let exists = await fs.access(stateDir).then(() => true).catch(() => false);
      expect(exists).toBe(false);

      // Create state should create directory
      const mockIssue = { id: 999, number: 999 } as any;
      const branchName = 'issue-999-test';
      const state = stateManager.createInitialState(mockIssue.id, branchName, 'main');
      stateManager.saveState(state);

      // Directory should now exist
      exists = await fs.access(stateDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Cleanup should remove state file but keep directory
      stateManager.cleanupState(mockIssue.id);
      const files = await fs.readdir(stateDir);
      expect(files).not.toContain('999.json');
    });
  });

  describe('Error Recovery Scenarios', () => {
    test('should handle git operation failures gracefully', async () => {
      const branchName = 'test-error-recovery';
      
      // Create branch
      await execCommand('git', ['checkout', '-b', branchName]);
      
      // Switch to branch
      await execCommand('git', ['checkout', branchName]);
      
      // Make some changes
      await fs.writeFile(join(testDir, 'error-test.txt'), 'error test content');
      await execCommand('git', ['add', '.']);
      
      // Test discard changes
      await gitRepository.discardChanges();
      
      // Verify changes were discarded
      const status = await execCommand('git', ['status', '--porcelain']);
      expect(status.stdout.trim()).toBe('');
      
      // Cleanup branch
      await execCommand('git', ['checkout', 'main']);
      await gitRepository.deleteBranch(branchName, 'main');
    });

    test('should handle concurrent state file access', async () => {
      const mockIssue = { id: 777, number: 777 } as any;
      const branchName = 'issue-777-concurrent';
      const state = stateManager.createInitialState(mockIssue.id, branchName, 'main');
      
      // Simulate concurrent writes
      const writePromises = [
        stateManager.saveState({ ...state, currentStep: ProcessingStep.BRANCH_CREATION }),
        stateManager.saveState({ ...state, currentStep: ProcessingStep.IMPLEMENTATION }),
        stateManager.saveState({ ...state, currentStep: ProcessingStep.COMMIT_PUSH })
      ];
      
      // All should complete without error
      await Promise.all(writePromises);
      
      // Final state should be valid
      const finalState = await stateManager.loadState(mockIssue.id);
      expect(finalState).toBeDefined();
      expect([ProcessingStep.BRANCH_CREATION, ProcessingStep.IMPLEMENTATION, ProcessingStep.COMMIT_PUSH]).toContain(finalState?.currentStep);
      
      stateManager.cleanupState(mockIssue.id);
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