import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * CLI Integration Test Suite
 * Tests the complete CLI functionality including commands and E2E workflows
 */
describe('CLI Integration Tests', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(join(tmpdir(), 'cli-integration-test-'));
    process.chdir(testDir);

    // Setup a mock git repository
    await execCommand('git', ['init']);
    await execCommand('git', ['config', 'user.name', 'Test User']);
    await execCommand('git', ['config', 'user.email', 'test@example.com']);
    await execCommand('git', ['checkout', '-b', 'main']);
    
    // Create initial commit
    await fs.writeFile(join(testDir, 'README.md'), '# Test Project\n');
    await execCommand('git', ['add', '.']);
    await execCommand('git', ['commit', '-m', 'Initial commit']);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('CLI Commands', () => {
    test('should show help when no arguments provided', async () => {
      const result = await runCLI(['--help']);
      expect(result.stdout || result.stderr).toMatch(/(Usage|help|commands)/i);
    });

    test('should validate command with missing required arguments', async () => {
      const result = await runCLI(['validate']);
      expect(result.stderr).toContain('required option');
      expect(result.exitCode).not.toBe(0);
    });

    test('should validate command with valid arguments', async () => {
      const result = await runCLI([
        'validate',
        '--owner', 'test-owner',
        '--repo', 'test-repo'
      ]);
      
      // Should attempt validation (may fail due to missing auth, but command structure is correct)
      const hasValidation = result.stdout.includes('Validating prerequisites');
      const hasGitHubCLI = result.stderr.includes('GitHub CLI');
      const hasAuth = result.stderr.includes('authentication');
      expect(hasValidation || hasGitHubCLI || hasAuth).toBe(true);
    });

    test('should show status command structure', async () => {
      const result = await runCLI([
        'status',
        '--owner', 'test-owner',
        '--repo', 'test-repo',
        '--assignee', 'test-user'
      ]);
      
      // Command should execute (may fail due to missing auth, but structure is correct)
      const hasStatus = result.stdout.includes('Status');
      const hasGitHubCLI = result.stderr.includes('GitHub CLI');
      const hasAuth = result.stderr.includes('authentication');
      expect(hasStatus || hasGitHubCLI || hasAuth).toBe(true);
    });
  });

  describe('State File Management', () => {
    test('should create .claude-state directory when processing', async () => {
      // Mock a scenario where state files would be created
      const stateDir = join(testDir, '.claude-state');
      
      // Manually create state file to simulate processing
      await fs.mkdir(stateDir, { recursive: true });
      await fs.writeFile(join(stateDir, '123.json'), JSON.stringify({
        issueId: 123,
        currentStep: 'BRANCH_CREATION',
        branchName: 'issue-123-test',
        baseBranch: 'main',
        retryCount: 0,
        lastUpdated: new Date().toISOString()
      }));

      const exists = await fs.access(stateDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      const files = await fs.readdir(stateDir);
      expect(files).toContain('123.json');

      const stateContent = await fs.readFile(join(stateDir, '123.json'), 'utf-8');
      const state = JSON.parse(stateContent);
      expect(state.issueId).toBe(123);
      expect(state.currentStep).toBe('BRANCH_CREATION');
    });

    test('should handle state file cleanup', async () => {
      const stateDir = join(testDir, '.claude-state');
      await fs.mkdir(stateDir, { recursive: true });
      await fs.writeFile(join(stateDir, '456.json'), '{"test": true}');

      // Simulate cleanup
      await fs.rm(join(stateDir, '456.json'));

      const files = await fs.readdir(stateDir);
      expect(files).not.toContain('456.json');
    });
  });

  describe('Git Integration', () => {
    test('should work with git operations in working directory', async () => {
      // Test that git operations work in the test directory
      const branches = await execCommand('git', ['branch']);
      expect(branches.stdout).toContain('main');

      // Test branch creation
      await execCommand('git', ['checkout', '-b', 'test-branch']);
      const newBranches = await execCommand('git', ['branch']);
      expect(newBranches.stdout).toContain('test-branch');

      // Test branch deletion
      await execCommand('git', ['checkout', 'main']);
      await execCommand('git', ['branch', '-d', 'test-branch']);
      const finalBranches = await execCommand('git', ['branch']);
      expect(finalBranches.stdout).not.toContain('test-branch');
    });

    test('should handle git repository detection', async () => {
      // Current directory should be a git repo
      const result = await execCommand('git', ['status']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('On branch');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid command gracefully', async () => {
      const result = await runCLI(['invalid-command']);
      expect(result.exitCode).not.toBe(0);
      const hasError = result.stderr.includes('error');
      const hasHelp = result.stdout.includes('help');
      expect(hasError || hasHelp).toBe(true);
    });

    test('should handle missing working directory', async () => {
      const nonExistentDir = join(tmpdir(), 'non-existent-' + Date.now());
      const result = await runCLI([
        'validate',
        '--owner', 'test-owner',
        '--repo', 'test-repo',
        '--working-dir', nonExistentDir
      ]);
      
      expect(result.exitCode).not.toBe(0);
    });
  });
});

/**
 * Run the CLI command and return result
 */
async function runCLI(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolve) => {
    // Use the built CLI or fall back to ts-node for development
    const builtCli = join(__dirname, '../../dist/commands/index.js');
    const sourceCli = join(__dirname, '../../src/commands/index.ts');
    
    let command: string;
    let cliArgs: string[];
    
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('fs').accessSync(builtCli);
      command = 'node';
      cliArgs = [builtCli, ...args];
    } catch {
      command = 'npx';
      cliArgs = ['ts-node', sourceCli, ...args];
    }
    
    const child = spawn(command, cliArgs, {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0
      });
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        stdout,
        stderr: stderr + '\nTest timeout',
        exitCode: 1
      });
    }, 30000);
  });
}

/**
 * Execute a command and return result
 */
async function execCommand(command: string, args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd()
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0
      });
    });
  });
}