import { ResumableIssueProcessor } from '../../src/services/resumable-issue-processor';
import { ProcessingStateManager } from '../../src/services/processing-state-manager';
import { GitRepository } from '../../src/infrastructure/git-repository';
import { ClaudeCodeExecutor, RateLimitError } from '../../src/clients/claude-executor';
import { PromptBuilder } from '../../src/utils/prompt-builder';
import { ProcessingStep } from '../../src/types/index';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

/**
 * Rate Limit Resume Integration Tests
 * Tests the complete rate limit recovery workflow with real file system operations
 */
describe('Rate Limit Resume Integration Tests', () => {
  let testDir: string;
  let originalCwd: string;
  let processor: ResumableIssueProcessor;
  let stateManager: ProcessingStateManager;
  let gitRepository: GitRepository;
  let claudeExecutor: jest.Mocked<ClaudeCodeExecutor>;
  let promptBuilder: PromptBuilder;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(join(tmpdir(), 'rate-limit-resume-test-'));
    process.chdir(testDir);

    // Setup git repository
    await execCommand('git', ['init']);
    await execCommand('git', ['config', 'user.name', 'Test User']);
    await execCommand('git', ['config', 'user.email', 'test@example.com']);
    await execCommand('git', ['checkout', '-b', 'main']);
    
    await fs.writeFile(join(testDir, 'README.md'), '# Test Project\n');
    await execCommand('git', ['add', '.']);
    await execCommand('git', ['commit', '-m', 'Initial commit']);

    // Setup components
    stateManager = new ProcessingStateManager(join(testDir, '.claude-state'));
    gitRepository = new GitRepository(testDir);
    promptBuilder = new PromptBuilder();
    
    // Mock Claude executor (partial mock with only needed methods)
    claudeExecutor = {
      execute: jest.fn()
    } as any;

    processor = new ResumableIssueProcessor(
      gitRepository,
      claudeExecutor,
      promptBuilder,
      stateManager
    );
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Rate Limit During Different Steps', () => {
    const mockIssue = {
      id: 100,
      number: 100,
      title: 'Test rate limit recovery',
      body: 'Add a new feature that triggers rate limiting',
      state: 'open' as const,
      assignee: { login: 'testuser' },
      repository: {
        owner: { login: 'testorg' },
        name: 'testrepo'
      },
      html_url: 'https://github.com/testorg/testrepo/issues/100',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    };

    test('should resume from BRANCH_CREATION step after rate limit', async () => {
      // Mock rate limit during branch creation
      claudeExecutor.execute.mockRejectedValueOnce(
        new RateLimitError('Rate limited during branch creation')
      );

      // First attempt - should hit rate limit
      const result1 = await processor.processIssue(mockIssue, 'main');
      expect(result1.shouldResume).toBe(true);
      expect(result1.success).toBe(false);

      // Verify state was saved
      const state = await stateManager.loadState(mockIssue.id);
      expect(state).toBeDefined();
      expect(state?.currentStep).toBe('BRANCH_CREATION');
      expect(state?.retryCount).toBe(1);

      // Mock successful execution on retry (execute returns void, so no return value)
      claudeExecutor.execute.mockResolvedValueOnce(undefined);

      // Second attempt - should resume and succeed
      const result2 = await processor.processIssue(mockIssue, 'main');
      expect(result2.success).toBe(true);
      expect(result2.shouldResume).toBe(false);

      // State should be cleaned up
      const finalState = await stateManager.loadState(mockIssue.id);
      expect(finalState).toBeNull();
    });

    test('should resume from IMPLEMENTATION step after rate limit', async () => {
      // Create initial state at IMPLEMENTATION step
      const branchName = 'issue-100-test-rate-limit-recovery';
      const state = stateManager.createInitialState(mockIssue.id, branchName, 'main');
      state.currentStep = ProcessingStep.IMPLEMENTATION;
      stateManager.saveState(state);

      // Create the branch that would exist from previous step
      await execCommand('git', ['checkout', '-b', state.branchName]);

      // Mock rate limit during implementation
      claudeExecutor.execute.mockRejectedValueOnce(
        new RateLimitError('Rate limited during implementation')
      );

      // First attempt - should hit rate limit at implementation
      const result1 = await processor.processIssue(mockIssue, 'main');
      expect(result1.shouldResume).toBe(true);
      expect(result1.currentState?.currentStep).toBe(ProcessingStep.IMPLEMENTATION);

      // Verify branch still exists (not cleaned up due to rate limit)
      const branches = await execCommand('git', ['branch']);
      expect(branches.stdout).toContain(state.branchName);

      // Mock successful execution on retry
      claudeExecutor.execute.mockResolvedValueOnce(undefined);

      // Second attempt - should resume from implementation and succeed
      const result2 = await processor.processIssue(mockIssue, 'main');
      expect(result2.success).toBe(true);
      expect(result2.shouldResume).toBe(false);
    });

    test('should resume from COMMIT_PUSH step after rate limit', async () => {
      // Create state at COMMIT_PUSH step with existing branch and changes
      const branchName = 'issue-100-test-rate-limit-recovery';
      const state = stateManager.createInitialState(mockIssue.id, branchName, 'main');
      state.currentStep = ProcessingStep.COMMIT_PUSH;
      stateManager.saveState(state);

      // Setup branch with changes (simulating previous steps completed)
      await execCommand('git', ['checkout', '-b', state.branchName]);
      await fs.writeFile(join(testDir, 'new-feature.ts'), 'export const newFeature = () => "feature";');
      await execCommand('git', ['add', '.']);

      // Mock rate limit during commit/push
      claudeExecutor.execute.mockRejectedValueOnce(
        new RateLimitError('Rate limited during commit/push')
      );

      // First attempt - should hit rate limit at commit
      const result1 = await processor.processIssue(mockIssue, 'main');
      expect(result1.shouldResume).toBe(true);
      expect(result1.currentState?.currentStep).toBe(ProcessingStep.COMMIT_PUSH);

      // Verify changes are still staged
      const status = await execCommand('git', ['status', '--porcelain']);
      expect(status.stdout).toContain('new-feature.ts');

      // Mock successful execution on retry
      claudeExecutor.execute.mockResolvedValueOnce(undefined);

      // Second attempt - should resume from commit and succeed
      const result2 = await processor.processIssue(mockIssue, 'main');
      expect(result2.success).toBe(true);
      expect(result2.shouldResume).toBe(false);
    });

    test('should resume from PR_CREATION step after rate limit', async () => {
      // Create state at PR_CREATION step
      const branchName = 'issue-100-test-rate-limit-recovery';
      const state = stateManager.createInitialState(mockIssue.id, branchName, 'main');
      state.currentStep = ProcessingStep.PR_CREATION;
      stateManager.saveState(state);

      // Setup branch with committed changes (simulating previous steps completed)
      await execCommand('git', ['checkout', '-b', state.branchName]);
      await fs.writeFile(join(testDir, 'feature.ts'), 'export const feature = () => "complete";');
      await execCommand('git', ['add', '.']);
      await execCommand('git', ['commit', '-m', 'feat: add new feature']);

      // Mock rate limit during PR creation
      claudeExecutor.execute.mockRejectedValueOnce(
        new RateLimitError('Rate limited during PR creation')
      );

      // First attempt - should hit rate limit at PR creation
      const result1 = await processor.processIssue(mockIssue, 'main');
      expect(result1.shouldResume).toBe(true);
      expect(result1.currentState?.currentStep).toBe(ProcessingStep.PR_CREATION);

      // Verify commit exists
      const log = await execCommand('git', ['log', '--oneline', '-1']);
      expect(log.stdout).toContain('feat: add new feature');

      // Mock successful execution on retry
      claudeExecutor.execute.mockResolvedValueOnce(undefined);

      // Second attempt - should resume from PR creation and succeed
      const result2 = await processor.processIssue(mockIssue, 'main');
      expect(result2.success).toBe(true);
      expect(result2.shouldResume).toBe(false);
    });
  });

  describe('Multiple Rate Limit Retries', () => {
    const mockIssue = {
      id: 200,
      number: 200,
      title: 'Multiple retries test',
      body: 'Testing multiple rate limit retries',
      state: 'open' as const,
      assignee: { login: 'testuser' },
      repository: {
        owner: { login: 'testorg' },
        name: 'testrepo'
      },
      html_url: 'https://github.com/testorg/testrepo/issues/200',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    };

    test('should handle multiple rate limits with increasing retry count', async () => {
      // First attempt - rate limit
      claudeExecutor.execute.mockRejectedValueOnce(
        new RateLimitError('First rate limit')
      );

      const result1 = await processor.processIssue(mockIssue, 'main');
      expect(result1.shouldResume).toBe(true);
      
      let state = await stateManager.loadState(mockIssue.id);
      expect(state?.retryCount).toBe(1);

      // Second attempt - another rate limit
      claudeExecutor.execute.mockRejectedValueOnce(
        new RateLimitError('Second rate limit')
      );

      const result2 = await processor.processIssue(mockIssue, 'main');
      expect(result2.shouldResume).toBe(true);
      
      state = await stateManager.loadState(mockIssue.id);
      expect(state?.retryCount).toBe(2);

      // Third attempt - success
      claudeExecutor.execute.mockResolvedValueOnce(undefined);

      const result3 = await processor.processIssue(mockIssue, 'main');
      expect(result3.success).toBe(true);
      expect(result3.shouldResume).toBe(false);

      // State should be cleaned up
      const finalState = await stateManager.loadState(mockIssue.id);
      expect(finalState).toBeNull();
    });
  });

  describe('State Persistence Integrity', () => {
    test('should maintain state integrity across multiple rate limits', async () => {
      const mockIssue = {
        id: 300,
        number: 300,
        title: 'State integrity test',
        body: 'Testing state persistence integrity',
        state: 'open' as const,
        assignee: { login: 'testuser' },
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo'
        },
        html_url: 'https://github.com/testorg/testrepo/issues/300',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };

      const steps: ProcessingStep[] = [ProcessingStep.BRANCH_CREATION, ProcessingStep.IMPLEMENTATION, ProcessingStep.CHANGE_DETECTION, ProcessingStep.COMMIT_PUSH, ProcessingStep.PR_CREATION];
      
      for (let i = 0; i < steps.length; i++) {
        // Mock rate limit at each step
        claudeExecutor.execute.mockRejectedValueOnce(
          new RateLimitError(`Rate limit at ${steps[i]}`)
        );

        const result = await processor.processIssue(mockIssue, 'main');
        expect(result.shouldResume).toBe(true);

        // Verify state was saved correctly
        const state = await stateManager.loadState(mockIssue.id);
        expect(state).toBeDefined();
        expect(state?.currentStep).toBe(steps[i]);
        expect(state?.issueId).toBe(mockIssue.id);
        expect(state?.baseBranch).toBe('main');
        
        // Verify retry count increments
        expect(state?.retryCount).toBe(i + 1);

        // Verify timestamp is recent
        const lastUpdated = new Date(state!.lastUpdated);
        const now = new Date();
        expect(now.getTime() - lastUpdated.getTime()).toBeLessThan(5000); // Within 5 seconds
      }

      // Final successful attempt
      claudeExecutor.execute.mockResolvedValueOnce(undefined);

      const finalResult = await processor.processIssue(mockIssue, 'main');
      expect(finalResult.success).toBe(true);
      expect(finalResult.shouldResume).toBe(false);
    });

    test('should handle state file corruption gracefully', async () => {
      const mockIssue = {
        id: 400,
        number: 400,
        title: 'Corruption test',
        body: 'Testing corrupted state file handling',
        state: 'open' as const,
        assignee: { login: 'testuser' },
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo'
        },
        html_url: 'https://github.com/testorg/testrepo/issues/400',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };

      // Create state file
      const stateDir = join(testDir, '.claude-state');
      await fs.mkdir(stateDir, { recursive: true });
      
      // Write corrupted JSON
      await fs.writeFile(join(stateDir, '400.json'), '{ invalid json }');

      // Should handle corruption and start fresh
      claudeExecutor.execute.mockResolvedValueOnce(undefined);

      const result = await processor.processIssue(mockIssue, 'main');
      expect(result.success).toBe(true);
      expect(result.shouldResume).toBe(false);
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