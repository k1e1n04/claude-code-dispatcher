import { IssueProcessor } from '../src/services';
import { IGitRepository } from '../src/infrastructure';
import { IClaudeCodeExecutor, RateLimitError } from '../src/clients';
import { IPromptBuilder } from '../src/utils';
import { GitHubIssue } from '../src/types';
import { RetryHandler } from '../src/utils';

// Mock the RetryHandler
jest.mock('../src/utils', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  RetryHandler: {
    withRetry: jest.fn(),
  },
}));

const mockRetryHandler = RetryHandler as jest.Mocked<typeof RetryHandler>;

describe('IssueProcessor', () => {
  let issueProcessor: IssueProcessor;
  let mockGitRepository: jest.Mocked<IGitRepository>;
  let mockClaudeExecutor: jest.Mocked<IClaudeCodeExecutor>;
  let mockPromptBuilder: jest.Mocked<IPromptBuilder>;
  let mockIssue: GitHubIssue;

  beforeEach(() => {
    // Create mocks
    mockGitRepository = {
      generateBranchName: jest.fn(),
      switchToBranch: jest.fn(),
      checkForChanges: jest.fn(),
      deleteBranch: jest.fn(),
    };

    mockClaudeExecutor = {
      execute: jest.fn(),
    };

    mockPromptBuilder = {
      createImplementationPrompt: jest.fn(),
      createCommitPrompt: jest.fn(),
      createPullRequestPrompt: jest.fn(),
    };

    // Create issue processor with mocked dependencies
    issueProcessor = new IssueProcessor(
      mockGitRepository,
      mockClaudeExecutor,
      mockPromptBuilder
    );

    mockIssue = {
      id: 1,
      number: 123,
      title: 'Test issue',
      body: 'Test description',
      state: 'open',
      assignee: { login: 'testuser' },
      repository: {
        owner: { login: 'testorg' },
        name: 'testrepo',
      },
      html_url: 'https://github.com/testorg/testrepo/issues/123',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
    };

    // Reset all mocks
    jest.clearAllMocks();

    // Mock RetryHandler to execute functions directly
    mockRetryHandler.withRetry.mockImplementation(async (fn) => fn());
  });

  describe('processIssue - successful flow', () => {
    beforeEach(() => {
      // Setup successful mocks
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockGitRepository.checkForChanges.mockResolvedValue(true);
      mockClaudeExecutor.execute.mockResolvedValue();
      mockPromptBuilder.createImplementationPrompt.mockReturnValue('Implementation prompt');
      mockPromptBuilder.createCommitPrompt.mockReturnValue('Commit prompt');
      mockPromptBuilder.createPullRequestPrompt.mockReturnValue('PR prompt');
    });

    test('should process issue successfully', async () => {
      const result = await issueProcessor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(true);
      expect(result.branchName).toBe('issue-123-test-issue');
      expect(result.error).toBeUndefined();
    });

    test('should call dependencies in correct order', async () => {
      await issueProcessor.processIssue(mockIssue, 'main');

      // Verify the order of operations
      expect(mockGitRepository.generateBranchName).toHaveBeenCalledWith(mockIssue);
      expect(mockGitRepository.switchToBranch).toHaveBeenCalledWith('issue-123-test-issue', 'main');
      expect(mockPromptBuilder.createImplementationPrompt).toHaveBeenCalledWith(mockIssue);
      expect(mockClaudeExecutor.execute).toHaveBeenCalledWith('Implementation prompt');
      expect(mockGitRepository.checkForChanges).toHaveBeenCalled();
      expect(mockPromptBuilder.createCommitPrompt).toHaveBeenCalled();
      expect(mockClaudeExecutor.execute).toHaveBeenCalledWith('Commit prompt');
      expect(mockPromptBuilder.createPullRequestPrompt).toHaveBeenCalledWith('main');
      expect(mockClaudeExecutor.execute).toHaveBeenCalledWith('PR prompt');
    });

    test('should use RetryHandler for Claude executions', async () => {
      await issueProcessor.processIssue(mockIssue, 'main');

      expect(mockRetryHandler.withRetry).toHaveBeenCalledTimes(3);
      expect(mockRetryHandler.withRetry).toHaveBeenCalledWith(
        expect.any(Function),
        3,
        2000,
        'ClaudeCode execution for issue #123'
      );
      expect(mockRetryHandler.withRetry).toHaveBeenCalledWith(
        expect.any(Function),
        3,
        2000,
        'ClaudeCode commit and push for issue #123'
      );
      expect(mockRetryHandler.withRetry).toHaveBeenCalledWith(
        expect.any(Function),
        3,
        2000,
        'ClaudeCode pull request creation for issue #123'
      );
    });
  });

  describe('processIssue - error scenarios', () => {
    test('should handle no changes scenario and cleanup branch', async () => {
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockGitRepository.deleteBranch.mockResolvedValue();
      mockGitRepository.checkForChanges.mockResolvedValue(false); // No changes
      mockPromptBuilder.createImplementationPrompt.mockReturnValue('Implementation prompt');
      mockClaudeExecutor.execute.mockResolvedValue();

      const result = await issueProcessor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No changes were made by ClaudeCode');
      expect(mockGitRepository.deleteBranch).toHaveBeenCalledWith('issue-123-test-issue');
    });

    test('should handle git repository errors and not cleanup branch', async () => {
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockRejectedValue(new Error('Git error'));

      const result = await issueProcessor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Git error');
      expect(mockGitRepository.deleteBranch).not.toHaveBeenCalled();
    });

    test('should handle Claude executor errors and cleanup branch', async () => {
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockGitRepository.deleteBranch.mockResolvedValue();
      mockPromptBuilder.createImplementationPrompt.mockReturnValue('Implementation prompt');
      mockClaudeExecutor.execute.mockRejectedValue(new Error('Claude execution failed'));

      const result = await issueProcessor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Claude execution failed');
      expect(mockGitRepository.deleteBranch).toHaveBeenCalledWith('issue-123-test-issue');
    });

    test('should handle branch cleanup failure gracefully', async () => {
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockGitRepository.deleteBranch.mockRejectedValue(new Error('Branch deletion failed'));
      mockPromptBuilder.createImplementationPrompt.mockReturnValue('Implementation prompt');
      mockClaudeExecutor.execute.mockRejectedValue(new Error('Claude execution failed'));

      const result = await issueProcessor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Claude execution failed');
      expect(mockGitRepository.deleteBranch).toHaveBeenCalledWith('issue-123-test-issue');
      // Should still return the original error, not the cleanup error
    });

    test('should handle commit step failure and cleanup branch', async () => {
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockGitRepository.deleteBranch.mockResolvedValue();
      mockGitRepository.checkForChanges.mockResolvedValue(true);
      mockPromptBuilder.createImplementationPrompt.mockReturnValue('Implementation prompt');
      mockPromptBuilder.createCommitPrompt.mockReturnValue('Commit prompt');
      mockClaudeExecutor.execute
        .mockResolvedValueOnce() // Implementation step succeeds
        .mockRejectedValueOnce(new Error('Commit failed')); // Commit step fails

      const result = await issueProcessor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Commit failed');
      expect(mockGitRepository.deleteBranch).toHaveBeenCalledWith('issue-123-test-issue');
    });

    test('should handle PR creation failure and cleanup branch', async () => {
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockGitRepository.deleteBranch.mockResolvedValue();
      mockGitRepository.checkForChanges.mockResolvedValue(true);
      mockPromptBuilder.createImplementationPrompt.mockReturnValue('Implementation prompt');
      mockPromptBuilder.createCommitPrompt.mockReturnValue('Commit prompt');
      mockPromptBuilder.createPullRequestPrompt.mockReturnValue('PR prompt');
      mockClaudeExecutor.execute
        .mockResolvedValueOnce() // Implementation step succeeds
        .mockResolvedValueOnce() // Commit step succeeds
        .mockRejectedValueOnce(new Error('PR creation failed')); // PR step fails

      const result = await issueProcessor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(false);
      expect(result.error).toContain('PR creation failed');
      expect(mockGitRepository.deleteBranch).toHaveBeenCalledWith('issue-123-test-issue');
    });

    test('should not cleanup branch when RateLimitError occurs after branch creation', async () => {
      const rateLimitError = new RateLimitError('Rate limit exceeded');
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockPromptBuilder.createImplementationPrompt.mockReturnValue('Implementation prompt');
      mockClaudeExecutor.execute.mockRejectedValue(rateLimitError);

      await expect(issueProcessor.processIssue(mockIssue, 'main')).rejects.toThrow(RateLimitError);
      expect(mockGitRepository.deleteBranch).not.toHaveBeenCalled();
    });
  });

  describe('branch cleanup behavior', () => {
    test('should cleanup branch when implementation step fails', async () => {
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockGitRepository.deleteBranch.mockResolvedValue();
      mockPromptBuilder.createImplementationPrompt.mockReturnValue('Implementation prompt');
      mockClaudeExecutor.execute.mockRejectedValue(new Error('Implementation failed'));

      const result = await issueProcessor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Implementation failed');
      expect(mockGitRepository.deleteBranch).toHaveBeenCalledWith('issue-123-test-issue');
    });

    test('should not cleanup branch when switchToBranch fails', async () => {
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockRejectedValue(new Error('Branch creation failed'));

      const result = await issueProcessor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Branch creation failed');
      expect(mockGitRepository.deleteBranch).not.toHaveBeenCalled();
    });

    test('should handle cleanup failure gracefully and still return original error', async () => {
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockGitRepository.deleteBranch.mockRejectedValue(new Error('Cleanup failed'));
      mockPromptBuilder.createImplementationPrompt.mockReturnValue('Implementation prompt');
      mockClaudeExecutor.execute.mockRejectedValue(new Error('Original error'));

      const result = await issueProcessor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Original error');
      expect(mockGitRepository.deleteBranch).toHaveBeenCalledWith('issue-123-test-issue');
    });
  });

  describe('dependency injection', () => {
    test('should use injected git repository', async () => {
      mockGitRepository.generateBranchName.mockReturnValue('custom-branch');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockGitRepository.checkForChanges.mockResolvedValue(true);
      mockClaudeExecutor.execute.mockResolvedValue();

      await issueProcessor.processIssue(mockIssue, 'main');

      expect(mockGitRepository.generateBranchName).toHaveBeenCalledWith(mockIssue);
    });

    test('should use injected prompt builder', async () => {
      const customPrompt = 'Custom implementation prompt';
      mockPromptBuilder.createImplementationPrompt.mockReturnValue(customPrompt);
      mockGitRepository.generateBranchName.mockReturnValue('issue-123-test-issue');
      mockGitRepository.switchToBranch.mockResolvedValue();
      mockGitRepository.checkForChanges.mockResolvedValue(true);
      mockClaudeExecutor.execute.mockResolvedValue();

      await issueProcessor.processIssue(mockIssue, 'main');

      expect(mockClaudeExecutor.execute).toHaveBeenCalledWith(customPrompt);
    });
  });
});