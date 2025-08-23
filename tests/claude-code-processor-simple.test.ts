import { ClaudeCodeProcessor } from '../src/claude-code-processor';
import { GitHubIssue } from '../src/types';
import { execSync } from 'child_process';

jest.mock('child_process');
jest.mock('fs');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('ClaudeCodeProcessor - Simple Tests', () => {
  let processor: ClaudeCodeProcessor;
  let mockIssue: GitHubIssue;

  beforeEach(() => {
    processor = new ClaudeCodeProcessor('/test/workspace', ['Bash', 'Edit', 'Write']);
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

  // Note: Individual component tests are now covered in their respective test files
  // (git-repository.test.ts, claude-executor.test.ts, prompt-builder.test.ts)

  describe('processIssue - successful flow', () => {
    beforeEach(() => {
      // Mock successful operations
      mockExecSync
        .mockReturnValueOnce('') // git checkout main
        .mockReturnValueOnce('') // git pull
        .mockReturnValueOnce('') // git checkout -b
        .mockReturnValueOnce('') // claude code (implementation)
        .mockReturnValueOnce('M  file.js\n') // git status
        .mockReturnValueOnce('') // claude code (commit message)
        .mockReturnValueOnce(''); // claude code (pull request)
    });

    test('should process issue successfully', async () => {
      const result = await processor.processIssue(mockIssue, 'main');

      expect(result.success).toBe(true);
      expect(result.branchName).toBe('issue-123-test-issue');
      expect(result.error).toBeUndefined();
    });

    test('should use correct working directory', async () => {
      await processor.processIssue(mockIssue, 'main');

      const gitCalls = mockExecSync.mock.calls.filter((call) =>
        call[0].toString().includes('git')
      );

      gitCalls.forEach((call) => {
        expect(call[1]).toMatchObject({ cwd: '/test/workspace' });
      });
    });

    test('should execute ClaudeCode in non-interactive mode with allowed tools', async () => {
      await processor.processIssue(mockIssue, 'main');

      const claudeCall = mockExecSync.mock.calls.find((call) =>
        call[0].toString().includes('claude code')
      );

      expect(claudeCall?.[0]).toBe('claude code --print --allowedTools "Bash" "Edit" "Write"');
      expect(claudeCall?.[1]).toMatchObject({
        stdio: ['pipe', 'pipe', 'inherit'],
        input: expect.stringContaining('Test issue'),
        encoding: 'utf8',
        timeout: 300000,
      });
    });

    test('should execute ClaudeCode with dangerously-skip-permissions flag', async () => {
      const yoloProcessor = new ClaudeCodeProcessor('/test/workspace', [], [], true);
      
      // Mock successful operations for YOLO processor
      mockExecSync
        .mockReturnValueOnce('') // git checkout main
        .mockReturnValueOnce('') // git pull
        .mockReturnValueOnce('') // git checkout -b
        .mockReturnValueOnce('') // claude code (implementation)
        .mockReturnValueOnce('M  file.js\n') // git status
        .mockReturnValueOnce('') // claude code (commit message)
        .mockReturnValueOnce(''); // claude code (pull request)

      await yoloProcessor.processIssue(mockIssue, 'main');

      const claudeCall = mockExecSync.mock.calls.find((call) =>
        call[0].toString().includes('claude code')
      );

      expect(claudeCall?.[0]).toBe('claude code --print --dangerously-skip-permissions');
      expect(claudeCall?.[1]).toMatchObject({
        stdio: ['pipe', 'pipe', 'inherit'],
        input: expect.stringContaining('Test issue'),
        encoding: 'utf8',
        timeout: 300000,
      });
    });
  });

  // Command building tests moved to claude-executor.test.ts

});

describe('ClaudeCodeProcessor - Integration Tests', () => {
  let mockIssue: GitHubIssue;
  
  beforeEach(() => {
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

  test('should maintain backward compatibility with original API', async () => {
    const processor = new ClaudeCodeProcessor('/test/workspace', ['Edit', 'Write']);
    
    // Mock successful operations
    mockExecSync
      .mockReturnValueOnce('') // git checkout main
      .mockReturnValueOnce('') // git pull
      .mockReturnValueOnce('') // git checkout -b
      .mockReturnValueOnce('') // claude code (implementation)
      .mockReturnValueOnce('M  file.js\n') // git status - has changes
      .mockReturnValueOnce('') // claude code (commit message)
      .mockReturnValueOnce(''); // claude code (pull request)

    const result = await processor.processIssue(mockIssue, 'main');

    expect(result.success).toBe(true);
    expect(result.branchName).toBe('issue-123-test-issue');
    
    // Verify the new architecture still works through the legacy interface
    expect(mockExecSync).toHaveBeenCalledWith('git checkout main', expect.any(Object));
    expect(mockExecSync).toHaveBeenCalledWith('git checkout -b issue-123-test-issue', expect.any(Object));
  });
});
