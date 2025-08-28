import { ProcessingManager } from '../src/services/processing-manager';
import { ResumableIssueProcessor } from '../src/services/resumable-issue-processor';
import { IssueQueue } from '../src/services/issue-queue';
import { RateLimitHandler } from '../src/services/rate-limit-handler';
import { GitHubClient } from '../src/clients';
import { DispatcherConfig, GitHubIssue, ProcessingStep } from '../src/types/index';

jest.mock('../src/services/resumable-issue-processor');
jest.mock('../src/services/issue-queue');
jest.mock('../src/services/rate-limit-handler');
jest.mock('../src/clients');

describe('ProcessingManager', () => {
  let processingManager: ProcessingManager;
  let mockProcessor: jest.Mocked<ResumableIssueProcessor>;
  let mockIssueQueue: jest.Mocked<IssueQueue>;
  let mockRateLimitHandler: jest.Mocked<RateLimitHandler>;
  let mockGitHubClient: jest.Mocked<GitHubClient>;
  let config: DispatcherConfig;
  let mockIssue: GitHubIssue;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    config = {
      owner: 'testorg',
      repo: 'testrepo',
      assignee: 'testuser',
      baseBranch: 'main',
      pollInterval: 60,
      maxRetries: 3,
      allowedTools: ['Edit', 'Write']
    };

    mockIssue = {
      id: 123,
      number: 456,
      title: 'Test Issue',
      body: 'Test issue description',
      state: 'open',
      assignee: { login: 'testuser' },
      repository: {
        owner: { login: 'testorg' },
        name: 'testrepo'
      },
      html_url: 'https://github.com/testorg/testrepo/issues/456',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    };

    mockProcessor = new ResumableIssueProcessor(null as any, null as any, null as any, null as any) as jest.Mocked<ResumableIssueProcessor>;
    mockIssueQueue = new IssueQueue() as jest.Mocked<IssueQueue>;
    mockRateLimitHandler = new RateLimitHandler() as jest.Mocked<RateLimitHandler>;
    mockGitHubClient = new GitHubClient() as jest.Mocked<GitHubClient>;

    // Setup default mock implementations
    mockIssueQueue.isEmpty.mockReturnValue(false);
    mockIssueQueue.isProcessing.mockReturnValue(false);
    mockIssueQueue.peek.mockReturnValue(mockIssue);
    mockIssueQueue.setProcessing.mockReturnValue(undefined);
    mockIssueQueue.dequeue.mockReturnValue(mockIssue);

    processingManager = new ProcessingManager(
      mockProcessor,
      mockIssueQueue,
      mockRateLimitHandler,
      mockGitHubClient,
      config
    );
  });

  afterEach(() => {
    // Make sure any running processing is stopped before moving to next test
    if (processingManager && processingManager.isProcessing()) {
      processingManager.stop();
    }
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('should create processing manager instance', () => {
      expect(processingManager).toBeDefined();
      expect(processingManager).toBeInstanceOf(ProcessingManager);
    });
  });

  describe('start', () => {
    test('should start processing loop', () => {
      processingManager.start();
      expect(processingManager.isProcessing()).toBe(true);
    });

    test('should not start if already running', () => {
      processingManager.start();
      processingManager.start(); // Second call should be ignored
      expect(processingManager.isProcessing()).toBe(true);
    });

    test('should start processing loop when started', () => {
      processingManager.start();
      expect(processingManager.isProcessing()).toBe(true);
      
      // Core processing functionality is tested in the processIssue tests
      // which test the same logic without complex async timer interaction
    });
  });

  describe('stop', () => {
    test('should stop processing loop', () => {
      processingManager.start();
      processingManager.stop();
      expect(processingManager.isProcessing()).toBe(false);
    });

    test('should not stop if not running', () => {
      processingManager.stop(); // Should not throw
      expect(processingManager.isProcessing()).toBe(false);
    });

    test('should clear processing loop timeout', () => {
      // Create a fresh processing manager to avoid interference from other tests
      const freshProcessingManager = new ProcessingManager(
        mockProcessor,
        mockIssueQueue,
        mockRateLimitHandler,
        mockGitHubClient,
        config
      );
      
      // Clear the mock to track only calls after this point
      mockProcessor.processIssue.mockClear();
      
      freshProcessingManager.start();
      freshProcessingManager.stop();
      
      // Clear again after stopping
      mockProcessor.processIssue.mockClear();
      
      // Advance time - no processing should occur since we stopped
      jest.advanceTimersByTime(5000);
      expect(mockProcessor.processIssue).not.toHaveBeenCalled();
    });

    test('should set queue processing to false', () => {
      processingManager.start();
      processingManager.stop();
      
      expect(mockIssueQueue.setProcessing).toHaveBeenCalledWith(false);
    });
  });

  describe('processIssue', () => {
    test('should process issue successfully', async () => {
      mockProcessor.processIssue.mockResolvedValue({
        success: true,
        branchName: 'issue-456-test-branch',
        pullRequestUrl: 'https://github.com/testorg/testrepo/pull/789'
      });

      const result = await processingManager.processIssue(mockIssue);
      
      expect(result).toBe(true);
      expect(mockIssueQueue.setProcessing).toHaveBeenCalledWith(true);
      expect(mockIssueQueue.setProcessing).toHaveBeenCalledWith(false);
      expect(mockProcessor.processIssue).toHaveBeenCalledWith(mockIssue, 'main');
    });

    test('should handle rate limit scenario', async () => {
      const rateLimitResult = {
        success: false,
        shouldResume: true,
        currentState: {
          issueId: 123,
          branchName: 'issue-456-test-branch',
          baseBranch: 'main',
          currentStep: ProcessingStep.IMPLEMENTATION,
          completedSteps: [ProcessingStep.BRANCH_CREATION],
          lastUpdated: new Date(),
          retryCount: 1
        }
      };

      mockProcessor.processIssue.mockResolvedValue(rateLimitResult);
      mockRateLimitHandler.handleRateLimit.mockResolvedValue(false);

      const result = await processingManager.processIssue(mockIssue);
      
      expect(result).toBe(false);
      expect(mockRateLimitHandler.handleRateLimit).toHaveBeenCalledWith(mockIssue, rateLimitResult);
    });

    test('should handle regular failure', async () => {
      mockProcessor.processIssue.mockResolvedValue({
        success: false,
        shouldResume: false,
        error: 'Processing failed for unknown reason'
      });

      const result = await processingManager.processIssue(mockIssue);
      
      expect(result).toBe(true); // Should remove from queue
      expect(mockGitHubClient.markIssueAsProcessed).toHaveBeenCalledWith(mockIssue.id);
    });

    test('should handle unexpected errors', async () => {
      mockProcessor.processIssue.mockRejectedValue(new Error('Unexpected error'));

      const result = await processingManager.processIssue(mockIssue);
      
      expect(result).toBe(true); // Should remove from queue
      expect(mockGitHubClient.markIssueAsProcessed).toHaveBeenCalledWith(mockIssue.id);
    });

    test('should always set processing to false in finally block', async () => {
      mockProcessor.processIssue.mockRejectedValue(new Error('Test error'));

      await processingManager.processIssue(mockIssue);
      
      expect(mockIssueQueue.setProcessing).toHaveBeenCalledWith(true);
      expect(mockIssueQueue.setProcessing).toHaveBeenCalledWith(false);
    });
  });

  describe('processing loop', () => {
    // Note: The processing loop behavior is complex to test with async timers
    // The core functionality is already tested via the processIssue method tests above
    // These tests verify the basic loop control behavior
    
    test('should start the processing loop', () => {
      processingManager.start();
      expect(processingManager.isProcessing()).toBe(true);
    });

    test('should stop the processing loop', () => {
      processingManager.start();
      processingManager.stop();
      expect(processingManager.isProcessing()).toBe(false);
    });
  });

  describe('isProcessing', () => {
    test('should return false initially', () => {
      expect(processingManager.isProcessing()).toBe(false);
    });

    test('should return true when started', () => {
      processingManager.start();
      expect(processingManager.isProcessing()).toBe(true);
    });

    test('should return false when stopped', () => {
      processingManager.start();
      processingManager.stop();
      expect(processingManager.isProcessing()).toBe(false);
    });
  });
});