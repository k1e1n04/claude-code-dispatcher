import { PrerequisitesValidator } from '../src/services/prerequisites-validator';
import { DispatcherConfig } from '../src/types';
import { execSync } from 'child_process';

jest.mock('child_process');
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('PrerequisitesValidator', () => {
  let config: DispatcherConfig;
  let validator: PrerequisitesValidator;

  beforeEach(() => {
    jest.clearAllMocks();
    
    config = {
      owner: 'testorg',
      repo: 'testrepo',
      assignee: 'testuser',
      baseBranch: 'main',
      pollInterval: 60,
      maxRetries: 3,
      allowedTools: ['Edit', 'Write']
    };

    validator = new PrerequisitesValidator(config);

    // Mock successful commands by default
    mockExecSync.mockImplementation((command) => {
      const cmd = command.toString();
      if (cmd.includes('gh auth status')) return '';
      if (cmd.includes('gh repo view')) return '';
      if (cmd.includes('claude --version')) return '';
      return '';
    });
  });

  describe('constructor', () => {
    test('should create validator with config', () => {
      expect(validator).toBeDefined();
      expect(validator).toBeInstanceOf(PrerequisitesValidator);
    });
  });

  describe('validate', () => {
    test('should validate all prerequisites successfully', async () => {
      await expect(validator.validate()).resolves.toBeUndefined();
      
      expect(mockExecSync).toHaveBeenCalledWith('gh auth status', { stdio: 'pipe' });
      expect(mockExecSync).toHaveBeenCalledWith('gh repo view testorg/testrepo', { stdio: 'pipe' });
      expect(mockExecSync).toHaveBeenCalledWith('claude --version', { stdio: 'pipe' });
    });

    test('should throw error when GitHub CLI auth fails', async () => {
      mockExecSync.mockImplementation((command) => {
        if (command.toString().includes('gh auth status')) {
          const error = new Error('not authenticated') as any;
          error.code = 'ENOENT';
          throw error;
        }
        return '';
      });

      await expect(validator.validate())
        .rejects.toThrow('Prerequisites validation failed. Please ensure GitHub CLI and Claude CLI are installed and authenticated.');
    });

    test('should throw error when repository access fails', async () => {
      mockExecSync.mockImplementation((command) => {
        if (command.toString().includes('gh repo view')) {
          const error = new Error('repository not found') as any;
          error.code = 'ENOENT';
          throw error;
        }
        return '';
      });

      await expect(validator.validate())
        .rejects.toThrow('Prerequisites validation failed. Please ensure GitHub CLI and Claude CLI are installed and authenticated.');
    });

    test('should throw error when Claude CLI is not available', async () => {
      mockExecSync.mockImplementation((command) => {
        if (command.toString().includes('claude --version')) {
          const error = new Error('command not found') as any;
          error.code = 'ENOENT';
          throw error;
        }
        return '';
      });

      await expect(validator.validate())
        .rejects.toThrow('Prerequisites validation failed. Please ensure GitHub CLI and Claude CLI are installed and authenticated.');
    });

    test('should handle multiple prerequisite failures', async () => {
      mockExecSync.mockImplementation(() => {
        const error = new Error('command failed') as any;
        error.code = 'ENOENT';
        throw error;
      });

      await expect(validator.validate())
        .rejects.toThrow('Prerequisites validation failed. Please ensure GitHub CLI and Claude CLI are installed and authenticated.');
    });
  });

  describe('error handling', () => {
    test('should handle GitHub auth validation errors gracefully', async () => {
      mockExecSync.mockImplementation((command) => {
        if (command.toString().includes('gh auth status')) {
          throw new Error('GitHub CLI authentication check failed');
        }
        return '';
      });

      await expect(validator.validate())
        .rejects.toThrow('Prerequisites validation failed. Please ensure GitHub CLI and Claude CLI are installed and authenticated.');
    });

    test('should handle repository access validation errors gracefully', async () => {
      mockExecSync.mockImplementation((command) => {
        if (command.toString().includes('gh repo view')) {
          throw new Error('Repository access check failed');
        }
        return '';
      });

      await expect(validator.validate())
        .rejects.toThrow('Prerequisites validation failed. Please ensure GitHub CLI and Claude CLI are installed and authenticated.');
    });

    test('should handle Claude CLI validation errors gracefully', async () => {
      mockExecSync.mockImplementation((command) => {
        if (command.toString().includes('claude --version')) {
          throw new Error('Claude CLI availability check failed');
        }
        return '';
      });

      await expect(validator.validate())
        .rejects.toThrow('Prerequisites validation failed. Please ensure GitHub CLI and Claude CLI are installed and authenticated.');
    });
  });
});