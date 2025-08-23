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
        title: 'Fix: OAuth2.0 & JWT auth (special chars!)',
      };

      const branchName = (processor as any).generateBranchName(specialIssue);

      expect(branchName).not.toMatch(/[^a-z0-9-]/);
      expect(branchName).toContain('issue-123');
    });

    test('should truncate long titles', () => {
      const longIssue = {
        ...mockIssue,
        title:
          'This is a very long title that should be truncated to prevent git branch name issues',
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
      expect(prompt).toContain(
        'https://github.com/testorg/testrepo/issues/123'
      );
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
      expect(mockExecSync).toHaveBeenCalledWith('git status --porcelain', {
        cwd: '/test/workspace',
        encoding: 'utf8',
      });
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

  describe('command building', () => {
    test('should build command with allowed tools only', () => {
      const command = (processor as any).buildClaudeCommand();
      expect(command).toBe('claude code --print --allowedTools "Bash" "Edit" "Write"');
    });

    test('should build command with allowed and disallowed tools', () => {
      const processorWithDisallowed = new ClaudeCodeProcessor(
        '/test/workspace', 
        ['Bash', 'Edit'], 
        ['WebFetch']
      );
      
      const command = (processorWithDisallowed as any).buildClaudeCommand();
      expect(command).toBe('claude code --print --allowedTools "Bash" "Edit" --disallowedTools "WebFetch"');
    });

    test('should build basic command when no tools specified', () => {
      const processorEmpty = new ClaudeCodeProcessor('/test/workspace', []);
      
      const command = (processorEmpty as any).buildClaudeCommand();
      expect(command).toBe('claude code --print');
    });

    test('should build command with dangerously-skip-permissions flag', () => {
      const processorYolo = new ClaudeCodeProcessor(
        '/test/workspace', 
        [], 
        [], 
        true
      );
      
      const command = (processorYolo as any).buildClaudeCommand();
      expect(command).toBe('claude code --print --dangerously-skip-permissions');
    });

    test('should prioritize dangerously-skip-permissions over allowed tools', () => {
      const processorYoloWithTools = new ClaudeCodeProcessor(
        '/test/workspace', 
        ['Bash', 'Edit'], 
        [], 
        true
      );
      
      const command = (processorYoloWithTools as any).buildClaudeCommand();
      expect(command).toBe('claude code --print --dangerously-skip-permissions');
    });

    test('should include disallowed tools with dangerously-skip-permissions', () => {
      const processorYoloWithDisallowed = new ClaudeCodeProcessor(
        '/test/workspace', 
        ['Bash'], 
        ['WebFetch'], 
        true
      );
      
      const command = (processorYoloWithDisallowed as any).buildClaudeCommand();
      expect(command).toBe('claude code --print --dangerously-skip-permissions --disallowedTools "WebFetch"');
    });
  });

});

describe('ClaudeCodeProcessor - YOLO Mode Integration Tests', () => {
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

  test('should work with YOLO mode in complete flow', async () => {
    const yoloProcessor = new ClaudeCodeProcessor('/test/workspace', [], [], true);
    
    // Mock successful operations for YOLO processor
    mockExecSync
      .mockReturnValueOnce('') // git checkout main
      .mockReturnValueOnce('') // git pull
      .mockReturnValueOnce('') // git checkout -b
      .mockReturnValueOnce('') // claude code (implementation)
      .mockReturnValueOnce('M  file.js\n') // git status - has changes
      .mockReturnValueOnce('') // claude code (commit message)
      .mockReturnValueOnce(''); // claude code (pull request)

    const result = await yoloProcessor.processIssue(mockIssue, 'main');

    expect(result.success).toBe(true);
    expect(result.branchName).toBe('issue-123-test-issue');

    // Verify YOLO mode was used in claude command
    const claudeCalls = mockExecSync.mock.calls.filter(call => 
      call[0].toString().includes('claude code')
    );
    
    expect(claudeCalls.length).toBeGreaterThan(0);
    claudeCalls.forEach(call => {
      expect(call[0]).toContain('--dangerously-skip-permissions');
      expect(call[0]).not.toContain('--allowedTools');
    });
  });
});
