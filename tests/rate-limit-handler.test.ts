import { RateLimitHandler } from '../src/services/rate-limit-handler';
import { GitHubIssue, ResumableProcessingResult, ProcessingStep } from '../src/types/index';

describe('RateLimitHandler', () => {
  let rateLimitHandler: RateLimitHandler;
  let mockIssue: GitHubIssue;

  beforeEach(() => {
    rateLimitHandler = new RateLimitHandler();

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
  });

  describe('constructor', () => {
    test('should create handler instance', () => {
      expect(rateLimitHandler).toBeDefined();
      expect(rateLimitHandler).toBeInstanceOf(RateLimitHandler);
    });
  });

  describe('handleRateLimit', () => {
    test('should return false to keep issue in queue', async () => {
      const result: ResumableProcessingResult = {
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

      const shouldRetry = await rateLimitHandler.handleRateLimit(mockIssue, result);
      expect(shouldRetry).toBe(false);
    });

    test('should handle rate limit without current state', async () => {
      const result: ResumableProcessingResult = {
        success: false,
        shouldResume: true,
        error: 'Rate limit exceeded'
      };

      const shouldRetry = await rateLimitHandler.handleRateLimit(mockIssue, result);
      expect(shouldRetry).toBe(false);
    });

    test('should handle rate limit with error message', async () => {
      const result: ResumableProcessingResult = {
        success: false,
        shouldResume: true,
        error: 'Claude API rate limit exceeded',
        currentState: {
          issueId: 123,
          branchName: 'issue-456-test-branch',
          baseBranch: 'main',
          currentStep: ProcessingStep.COMMIT_PUSH,
          completedSteps: [ProcessingStep.BRANCH_CREATION, ProcessingStep.IMPLEMENTATION],
          lastUpdated: new Date(),
          retryCount: 2
        }
      };

      const shouldRetry = await rateLimitHandler.handleRateLimit(mockIssue, result);
      expect(shouldRetry).toBe(false);
    });
  });

  describe('isRateLimited', () => {
    test('should return true when shouldResume is true and success is false', () => {
      const result: ResumableProcessingResult = {
        success: false,
        shouldResume: true
      };

      expect(rateLimitHandler.isRateLimited(result)).toBe(true);
    });

    test('should return false when shouldResume is false', () => {
      const result: ResumableProcessingResult = {
        success: false,
        shouldResume: false
      };

      expect(rateLimitHandler.isRateLimited(result)).toBe(false);
    });

    test('should return false when success is true', () => {
      const result: ResumableProcessingResult = {
        success: true,
        shouldResume: true
      };

      expect(rateLimitHandler.isRateLimited(result)).toBe(false);
    });

    test('should return false when shouldResume is undefined', () => {
      const result: ResumableProcessingResult = {
        success: false
      };

      expect(rateLimitHandler.isRateLimited(result)).toBe(false);
    });
  });

  describe('getRateLimitDescription', () => {
    test('should return appropriate description when rate limited', () => {
      const result: ResumableProcessingResult = {
        success: false,
        shouldResume: true,
        currentState: {
          issueId: 123,
          branchName: 'issue-456-test-branch',
          baseBranch: 'main',
          currentStep: ProcessingStep.IMPLEMENTATION,
          completedSteps: [ProcessingStep.BRANCH_CREATION],
          lastUpdated: new Date(),
          retryCount: 2
        }
      };

      const description = rateLimitHandler.getRateLimitDescription(result);
      expect(description).toBe("Rate limited at step 'implementation' (retry 2)");
    });

    test('should handle missing current state', () => {
      const result: ResumableProcessingResult = {
        success: false,
        shouldResume: true
      };

      const description = rateLimitHandler.getRateLimitDescription(result);
      expect(description).toBe("Rate limited at step 'unknown' (retry 0)");
    });

    test('should return no rate limit description when not rate limited', () => {
      const result: ResumableProcessingResult = {
        success: true,
        shouldResume: false
      };

      const description = rateLimitHandler.getRateLimitDescription(result);
      expect(description).toBe('No rate limit detected');
    });

    test('should handle partial current state information', () => {
      const result: ResumableProcessingResult = {
        success: false,
        shouldResume: true,
        currentState: {
          issueId: 123,
          branchName: 'issue-456-test-branch',
          baseBranch: 'main',
          currentStep: ProcessingStep.PR_CREATION,
          completedSteps: [ProcessingStep.BRANCH_CREATION, ProcessingStep.IMPLEMENTATION],
          lastUpdated: new Date(),
          retryCount: 0
        }
      };

      const description = rateLimitHandler.getRateLimitDescription(result);
      expect(description).toBe("Rate limited at step 'pr_creation' (retry 0)");
    });
  });
});