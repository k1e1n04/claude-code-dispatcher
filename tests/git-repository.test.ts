import { GitRepository } from '../src/infrastructure';
import { GitHubIssue } from '../src/types';
import { execSync } from 'child_process';

jest.mock('child_process');
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('GitRepository', () => {
  let gitRepository: GitRepository;
  let mockIssue: GitHubIssue;

  beforeEach(() => {
    gitRepository = new GitRepository('/test/workspace');
    jest.clearAllMocks();

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
  });

  describe('generateBranchName', () => {
    test('should generate valid branch name', () => {
      const branchName = gitRepository.generateBranchName(mockIssue);
      expect(branchName).toBe('issue-123-test-issue');
      expect(branchName).toMatch(/^issue-\d+-[a-z0-9-]+$/);
    });

    test('should sanitize special characters', () => {
      const specialIssue = {
        ...mockIssue,
        title: 'Fix: OAuth2.0 & JWT auth (special chars!)',
      };

      const branchName = gitRepository.generateBranchName(specialIssue);
      expect(branchName).not.toMatch(/[^a-z0-9-]/);
      expect(branchName).toContain('issue-123');
    });

    test('should truncate long titles', () => {
      const longIssue = {
        ...mockIssue,
        title: 'This is a very long title that should be truncated to prevent git branch name issues',
      };

      const branchName = gitRepository.generateBranchName(longIssue);
      expect(branchName.length).toBeLessThanOrEqual(60);
    });
  });

  describe('switchToBranch', () => {
    test('should execute git commands in correct order', async () => {
      mockExecSync.mockReturnValue('');

      await gitRepository.switchToBranch('test-branch', 'main');

      expect(mockExecSync).toHaveBeenNthCalledWith(1, 'git checkout main', {
        cwd: '/test/workspace',
        stdio: 'pipe',
      });

      expect(mockExecSync).toHaveBeenNthCalledWith(2, 'git pull origin main', {
        cwd: '/test/workspace',
        stdio: 'pipe',
      });

      expect(mockExecSync).toHaveBeenNthCalledWith(3, 'git checkout -b test-branch', {
        cwd: '/test/workspace',
        stdio: 'pipe',
      });
    });

    test('should handle git command failures', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Git command failed');
      });

      await expect(gitRepository.switchToBranch('test-branch', 'main'))
        .rejects.toThrow('Branch switching failed');
    });
  });

  describe('checkForChanges', () => {
    test('should detect changes when git status shows modifications', async () => {
      mockExecSync.mockReturnValue('M  src/file.js\n A src/new-file.js\n');

      const hasChanges = await gitRepository.checkForChanges();

      expect(hasChanges).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith('git status --porcelain', {
        cwd: '/test/workspace',
        encoding: 'utf8',
      });
    });

    test('should detect no changes when git status is clean', async () => {
      mockExecSync.mockReturnValue('');

      const hasChanges = await gitRepository.checkForChanges();

      expect(hasChanges).toBe(false);
    });

    test('should handle git command errors gracefully', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Git not available');
      });

      const hasChanges = await gitRepository.checkForChanges();

      expect(hasChanges).toBe(false);
    });
  });
});