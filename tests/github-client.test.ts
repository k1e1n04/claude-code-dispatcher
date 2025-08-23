import { GitHubClient } from '../src/github-client';
import { execSync } from 'child_process';

jest.mock('child_process');
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('GitHubClient', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = new GitHubClient();
    jest.clearAllMocks();
  });

  describe('getAssignedIssues', () => {
    test('should fetch and parse GitHub issues', async () => {
      const mockResponse = JSON.stringify([
        {
          id: 1,
          number: 123,
          title: 'Test issue',
          body: 'Test description',
          state: 'open',
          assignee: { login: 'testuser' },
          repository: {
            owner: { login: 'testorg' },
            name: 'testrepo'
          },
          html_url: 'https://github.com/testorg/testrepo/issues/123',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z'
        }
      ]);

      mockExecSync.mockReturnValue(mockResponse);

      const issues = await client.getAssignedIssues('testorg', 'testrepo', 'testuser');
      
      expect(issues).toHaveLength(1);
      expect(issues[0].title).toBe('Test issue');
      expect(mockExecSync).toHaveBeenCalledWith(
        'gh api repos/testorg/testrepo/issues --method GET -f assignee=testuser -f state=open',
        { encoding: 'utf8' }
      );
    });

    test('should filter out already processed issues', async () => {
      const mockIssue = {
        id: 1,
        number: 123,
        title: 'Test issue',
        body: 'Test description',
        state: 'open',
        assignee: { login: 'testuser' },
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo'
        },
        html_url: 'https://github.com/testorg/testrepo/issues/123',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };

      mockExecSync.mockReturnValue(JSON.stringify([mockIssue]));

      // First call should return the issue
      const issues1 = await client.getAssignedIssues('testorg', 'testrepo', 'testuser');
      expect(issues1).toHaveLength(1);

      // Second call should return empty array (issue already processed)
      const issues2 = await client.getAssignedIssues('testorg', 'testrepo', 'testuser');
      expect(issues2).toHaveLength(0);
    });
  });

  describe('createPullRequest', () => {
    test('should create pull request and return URL', async () => {
      const expectedUrl = 'https://github.com/testorg/testrepo/pull/123';
      mockExecSync.mockReturnValue(expectedUrl + '\n');

      const url = await client.createPullRequest(
        'testorg',
        'testrepo',
        'feature-branch',
        'main',
        'Test PR',
        'Test description'
      );

      expect(url).toBe(expectedUrl);
      expect(mockExecSync).toHaveBeenCalledWith(
        'gh pr create --repo testorg/testrepo --head feature-branch --base main --title "Test PR" --body "Test description"',
        { encoding: 'utf8' }
      );
    });
  });

  describe('checkRateLimit', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should not wait when rate limit is sufficient', async () => {
      const mockResponse = {
        rate: {
          remaining: 100,
          reset: Math.floor(Date.now() / 1000) + 3600
        }
      };
      mockExecSync.mockReturnValue(JSON.stringify(mockResponse));

      await expect(client.checkRateLimit()).resolves.not.toThrow();
    });

    test('should wait when rate limit is low', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 10;
      const mockResponse = {
        rate: {
          remaining: 5,
          reset: resetTime
        }
      };
      mockExecSync.mockReturnValue(JSON.stringify(mockResponse));

      const rateLimitPromise = client.checkRateLimit();
      
      jest.advanceTimersByTime(10000);
      
      await rateLimitPromise;
      
      expect(mockExecSync).toHaveBeenCalledWith('gh api rate_limit', { encoding: 'utf8' });
    });

    test('should handle rate limit API errors gracefully', async () => {
      mockExecSync.mockImplementation((command) => {
        if (command.toString().includes('rate_limit')) {
          throw new Error('API error');
        }
        return '';
      });

      await expect(client.checkRateLimit()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    test('should handle GitHub CLI not found', async () => {
      const error = new Error('command not found') as any;
      error.code = 'ENOENT';
      mockExecSync.mockImplementation(() => { throw error; });

      await expect(client.getAssignedIssues('testorg', 'testrepo', 'testuser'))
        .rejects.toThrow('Failed to fetch issues');
    });

    test('should handle malformed JSON responses', async () => {
      mockExecSync.mockReturnValue('not valid json');

      await expect(client.getAssignedIssues('testorg', 'testrepo', 'testuser'))
        .rejects.toThrow('Failed to fetch issues');
    });
  });
});