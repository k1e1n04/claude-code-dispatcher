import { PromptBuilder } from '../src/utils';
import { GitHubIssue } from '../src/types';

describe('PromptBuilder', () => {
  let promptBuilder: PromptBuilder;
  let mockIssue: GitHubIssue;

  beforeEach(() => {
    promptBuilder = new PromptBuilder();

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

  describe('createImplementationPrompt', () => {
    test('should create proper implementation prompt with issue details', () => {
      const prompt = promptBuilder.createImplementationPrompt(mockIssue);

      expect(prompt).toContain('Test issue');
      expect(prompt).toContain('Test description');
      expect(prompt).toContain('https://github.com/testorg/testrepo/issues/123');
      expect(prompt).toContain('Please implement');
    });

    test('should handle issue without body', () => {
      const issueWithoutBody = { ...mockIssue, body: null };

      const prompt = promptBuilder.createImplementationPrompt(issueWithoutBody);

      expect(prompt).toContain('Test issue');
      expect(prompt).not.toContain('null');
      expect(prompt).not.toContain('Description:');
    });

    test('should include all required sections', () => {
      const prompt = promptBuilder.createImplementationPrompt(mockIssue);

      expect(prompt).toContain('Title:');
      expect(prompt).toContain('Description:');
      expect(prompt).toContain('Issue URL:');
      expect(prompt).toContain('best practices');
    });
  });

  describe('createCommitPrompt', () => {
    test('should create commit and push prompt', () => {
      const prompt = promptBuilder.createCommitPrompt();

      expect(prompt).toContain('commit message');
      expect(prompt).toContain('best practices');
      expect(prompt).toContain('push');
      expect(prompt).toContain('remote repository');
    });
  });

  describe('createPullRequestPrompt', () => {
    test('should create pull request prompt with base branch', () => {
      const prompt = promptBuilder.createPullRequestPrompt('main');

      expect(prompt).toContain('pull request');
      expect(prompt).toContain('main');
      expect(prompt).toContain('PULL_REQUEST_TEMPLATE');
    });

    test('should work with different base branches', () => {
      const prompt = promptBuilder.createPullRequestPrompt('develop');

      expect(prompt).toContain('develop');
      expect(prompt).toContain('targeting the base branch develop');
    });

    test('should include template and title guidance', () => {
      const prompt = promptBuilder.createPullRequestPrompt('main');

      expect(prompt).toContain('PULL_REQUEST_TEMPLATE');
      expect(prompt).toContain('title is clear');
      expect(prompt).toContain('references the issue');
    });
  });
});