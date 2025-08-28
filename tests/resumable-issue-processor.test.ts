import { ResumableIssueProcessor } from '../src/services/resumable-issue-processor';
import { ProcessingStateManager } from '../src/services/processing-state-manager';
import { IGitRepository } from '../src/infrastructure';
import { IClaudeCodeExecutor, RateLimitError } from '../src/clients';
import { IPromptBuilder } from '../src/utils';
import { GitHubIssue, ProcessingStep } from '../src/types/index';
import * as fs from 'fs';
import * as path from 'path';

// Mock RetryHandler to avoid actual retries in tests
jest.mock('../src/utils', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  RetryHandler: {
    withRetry: jest.fn().mockImplementation(async (operation) => {
      return await operation();
    })
  }
}));

describe('ResumableIssueProcessor', () => {
  let processor: ResumableIssueProcessor;
  let mockGitRepository: jest.Mocked<IGitRepository>;
  let mockClaudeExecutor: jest.Mocked<IClaudeCodeExecutor>;
  let mockPromptBuilder: jest.Mocked<IPromptBuilder>;
  let stateManager: ProcessingStateManager;
  let testStateDir: string;
  let mockIssue: GitHubIssue;

  beforeEach(() => {
    // Setup test state directory
    testStateDir = path.join(__dirname, '.test-resumable-state');
    stateManager = new ProcessingStateManager(testStateDir);

    // Create mocks
    mockGitRepository = {
      generateBranchName: jest.fn(),
      switchToBranch: jest.fn(),
      checkForChanges: jest.fn(),
      deleteBranch: jest.fn(),
      discardChanges: jest.fn(),
    };

    mockClaudeExecutor = {
      execute: jest.fn(),
    };

    mockPromptBuilder = {
      createImplementationPrompt: jest.fn(),
      createCommitPrompt: jest.fn(),
      createPullRequestPrompt: jest.fn(),
    };

    processor = new ResumableIssueProcessor(
      mockGitRepository,
      mockClaudeExecutor,
      mockPromptBuilder,
      stateManager
    );

    mockIssue = {
      id: 123,
      number: 123,
      title: 'Test Issue',
      body: 'Test issue body',
      state: 'open',
      assignee: { login: 'testuser' },
      repository: {
        owner: { login: 'testowner' },
        name: 'testrepo'
      },
      html_url: 'https://github.com/testowner/testrepo/issues/123',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Cleanup test state directory
    if (fs.existsSync(testStateDir)) {
      fs.rmSync(testStateDir, { recursive: true });
    }
  });

  describe('successful processing', () => {
    test('should complete full processing workflow', async () => {
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockGitRepository.checkForChanges.mockResolvedValue(true);
      mockPromptBuilder.createImplementationPrompt.mockReturnValue('Implementation prompt');
      mockPromptBuilder.createCommitPrompt.mockReturnValue('Commit prompt');
      mockPromptBuilder.createPullRequestPrompt.mockReturnValue('PR prompt');
      mockClaudeExecutor.execute.mockResolvedValue();

      const result = await processor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(true);
      expect(result.shouldResume).toBe(false);
      expect(result.branchName).toBe('issue-123-test-issue');
      expect(mockGitRepository.switchToBranch).toHaveBeenCalledWith('issue-123-test-issue', 'main');
      expect(mockClaudeExecutor.execute).toHaveBeenCalledTimes(3);
      
      // State should be cleaned up
      expect(stateManager.loadState(123)).toBeNull();
    });
  });

  describe('rate limit handling', () => {
    test('should save state and return resume info on rate limit during implementation', async () => {
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockPromptBuilder.createImplementationPrompt.mockReturnValue('Implementation prompt');
      mockClaudeExecutor.execute.mockRejectedValue(new RateLimitError('Rate limit exceeded'));

      const result = await processor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(false);
      expect(result.shouldResume).toBe(true);
      expect(result.currentState?.currentStep).toBe(ProcessingStep.IMPLEMENTATION);
      expect(result.currentState?.completedSteps).toContain(ProcessingStep.BRANCH_CREATION);
      
      // State should be persisted
      const savedState = stateManager.loadState(123);
      expect(savedState).not.toBeNull();
      expect(savedState!.retryCount).toBe(1);
    });

    test('should save state on rate limit during commit step', async () => {
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockGitRepository.checkForChanges.mockResolvedValue(true);
      mockPromptBuilder.createImplementationPrompt.mockReturnValue('Implementation prompt');
      mockPromptBuilder.createCommitPrompt.mockReturnValue('Commit prompt');
      mockClaudeExecutor.execute
        .mockResolvedValueOnce() // Implementation succeeds
        .mockRejectedValueOnce(new RateLimitError('Rate limit exceeded')); // Commit fails

      const result = await processor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(false);
      expect(result.shouldResume).toBe(true);
      expect(result.currentState?.currentStep).toBe(ProcessingStep.COMMIT_PUSH);
      expect(result.currentState?.completedSteps).toContain(ProcessingStep.IMPLEMENTATION);
      expect(result.currentState?.completedSteps).toContain(ProcessingStep.CHANGE_DETECTION);
    });
  });

  describe('resume functionality', () => {
    test('should resume from saved state after rate limit', async () => {
      // First, create a saved state at COMMIT_PUSH step
      const state = stateManager.createInitialState(123, 'issue-123-test-issue', 'main');
      state.currentStep = ProcessingStep.COMMIT_PUSH;
      state.completedSteps = [ProcessingStep.BRANCH_CREATION, ProcessingStep.IMPLEMENTATION, ProcessingStep.CHANGE_DETECTION];
      stateManager.saveState(state);

      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockPromptBuilder.createCommitPrompt.mockReturnValue('Commit prompt');
      mockPromptBuilder.createPullRequestPrompt.mockReturnValue('PR prompt');
      mockClaudeExecutor.execute.mockResolvedValue();

      const result = await processor.resumeIssue(123, mockIssue);

      expect(result.success).toBe(true);
      expect(result.shouldResume).toBe(false);
      
      // Should skip completed steps
      expect(mockGitRepository.switchToBranch).not.toHaveBeenCalled();
      expect(mockClaudeExecutor.execute).toHaveBeenCalledTimes(2); // Only commit and PR
      
      // State should be cleaned up after completion
      expect(stateManager.loadState(123)).toBeNull();
    });

    test('should return error for non-existent resume state', async () => {
      const result = await processor.resumeIssue(999, mockIssue);

      expect(result.success).toBe(false);
      expect(result.shouldResume).toBe(false);
      expect(result.error).toContain('No processing state found');
    });
  });

  describe('error handling', () => {
    test('should cleanup branch and state on non-rate-limit errors', async () => {
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockPromptBuilder.createImplementationPrompt.mockReturnValue('Implementation prompt');
      mockClaudeExecutor.execute.mockRejectedValue(new Error('Regular error'));

      const result = await processor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(false);
      expect(result.shouldResume).toBe(false);
      expect(mockGitRepository.discardChanges).toHaveBeenCalled();
      expect(mockGitRepository.deleteBranch).toHaveBeenCalledWith('issue-123-test-issue', 'main');
      
      // State should be cleaned up
      expect(stateManager.loadState(123)).toBeNull();
    });

    test('should handle no changes scenario', async () => {
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockGitRepository.checkForChanges.mockResolvedValue(false);
      mockPromptBuilder.createImplementationPrompt.mockReturnValue('Implementation prompt');
      mockClaudeExecutor.execute.mockResolvedValue();

      const result = await processor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(false);
      expect(result.shouldResume).toBe(false);
      expect(result.error).toContain('No changes were made');
      expect(mockGitRepository.discardChanges).toHaveBeenCalled();
      expect(mockGitRepository.deleteBranch).toHaveBeenCalledWith('issue-123-test-issue', 'main');
    });
  });
});
