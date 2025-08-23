import { ClaudeCodeProcessor } from '../src/claude-code-processor';
import { GitHubIssue } from '../src/types';
import { execSync } from 'child_process';
import * as fs from 'fs';

jest.mock('child_process');
jest.mock('fs');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ClaudeCodeProcessor - Simple Tests', () => {
  let processor: ClaudeCodeProcessor;
  let mockIssue: GitHubIssue;

  beforeEach(() => {
    processor = new ClaudeCodeProcessor('/test/workspace');
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
        name: 'testrepo'
      },
      html_url: 'https://github.com/testorg/testrepo/issues/123',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    };
  });

  describe('branch name generation', () => {
    test('should generate valid branch name', () => {
      // Access private method through any cast for testing
      const branchName = (processor as any).generateBranchName(mockIssue);
      
      expect(branchName).toBe('issue-123-test-issue');
      expect(branchName).toMatch(/^issue-\d+-[a-z0-9-]+$/);
    });

    test('should sanitize special characters', () => {
      const specialIssue = {
        ...mockIssue,
        title: 'Fix: OAuth2.0 & JWT auth (special chars!)'
      };
      
      const branchName = (processor as any).generateBranchName(specialIssue);
      
      expect(branchName).not.toMatch(/[^a-z0-9-]/);
      expect(branchName).toContain('issue-123');
    });

    test('should truncate long titles', () => {
      const longIssue = {
        ...mockIssue,
        title: 'This is a very long title that should be truncated to prevent git branch name issues'
      };
      
      const branchName = (processor as any).generateBranchName(longIssue);
      
      expect(branchName.length).toBeLessThanOrEqual(60);
    });
  });

  describe('prompt creation', () => {
    test('should create proper prompt with issue details', () => {
      const prompt = (processor as any).createPromptFromIssue(mockIssue);
      
      expect(prompt).toContain('Test issue');
      expect(prompt).toContain('Test description');
      expect(prompt).toContain('https://github.com/testorg/testrepo/issues/123');
      expect(prompt).toContain('Please implement');
    });

    test('should handle issue without body', () => {
      const issueWithoutBody = { ...mockIssue, body: null };
      
      const prompt = (processor as any).createPromptFromIssue(issueWithoutBody);
      
      expect(prompt).toContain('Test issue');
      expect(prompt).not.toContain('null');
    });
  });

  describe('git operations', () => {
    test('should check for changes correctly', async () => {
      mockExecSync.mockReturnValue('M  src/file.js\n');
      
      const hasChanges = await (processor as any).checkForChanges();
      
      expect(hasChanges).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        'git status --porcelain',
        { cwd: '/test/workspace', encoding: 'utf8' }
      );
    });

    test('should detect no changes', async () => {
      mockExecSync.mockReturnValue('');
      
      const hasChanges = await (processor as any).checkForChanges();
      
      expect(hasChanges).toBe(false);
    });

    test('should handle git errors gracefully', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Git not available');
      });
      
      const hasChanges = await (processor as any).checkForChanges();
      
      expect(hasChanges).toBe(false);
    });
  });

  describe('processIssue - successful flow', () => {
    beforeEach(() => {
      // Mock successful operations
      mockExecSync
        .mockReturnValueOnce('') // git checkout main
        .mockReturnValueOnce('') // git pull
        .mockReturnValueOnce('') // git checkout -b
        .mockReturnValueOnce('') // claude code
        .mockReturnValueOnce('M  file.js\n') // git status
        .mockReturnValueOnce('') // git add
        .mockReturnValueOnce('') // git commit
        .mockReturnValueOnce(''); // git push
    });

    test('should process issue successfully', async () => {
      const result = await processor.processIssue(mockIssue, 'main');
      
      expect(result.success).toBe(true);
      expect(result.branchName).toBe('issue-123-test-issue');
      expect(result.error).toBeUndefined();
    });

    test('should use correct working directory', async () => {
      await processor.processIssue(mockIssue, 'main');
      
      const gitCalls = mockExecSync.mock.calls.filter(call => 
        call[0].toString().includes('git')
      );
      
      gitCalls.forEach(call => {
        expect(call[1]).toMatchObject({ cwd: '/test/workspace' });
      });
    });
  });

  describe('processIssue - error handling', () => {
    test('should handle no changes scenario', async () => {
      mockExecSync
        .mockReturnValueOnce('') // git operations succeed
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('') // claude code succeeds
        .mockReturnValueOnce(''); // git status - no changes
      
      const result = await processor.processIssue(mockIssue, 'main');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No changes were made by ClaudeCode');
    });

    test('should handle git failures', async () => {
      mockExecSync.mockImplementation((command) => {
        if (command.toString().includes('git checkout main')) {
          throw new Error('Git checkout failed');
        }
        return '';
      });
      
      const result = await processor.processIssue(mockIssue, 'main');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Branch switching failed');
    });
  });
});