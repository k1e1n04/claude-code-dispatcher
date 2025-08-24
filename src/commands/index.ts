#!/usr/bin/env node

import { Command } from 'commander';
import { ClaudeCodeDispatcher } from '../services';
import { DispatcherConfig } from '../types';
import { logger } from '../utils';

const program = new Command();

// Import version from package.json
import packageJson from '../../package.json';

program
  .name('claude-code-dispatcher')
  .description(
    'CLI tool to integrate ClaudeCode with GitHub for automated issue processing'
  )
  .version(packageJson.version);

program
  .command('start')
  .description('Start the Claude Code dispatcher')
  .requiredOption('-o, --owner <owner>', 'GitHub repository owner')
  .requiredOption('-r, --repo <repo>', 'GitHub repository name')
  .requiredOption(
    '-a, --assignee <assignee>',
    'GitHub username to monitor for assigned issues'
  )
  .option('--allowedTools <tools...>', 'List of allowed tools for Claude Code')
  .option(
    '--dangerously-skip-permissions',
    'Skip permission checks (YOLO mode - use with caution)'
  )
  .option('-b, --base-branch <branch>', 'Base branch for pull requests', 'main')
  .option('-i, --interval <seconds>', 'Polling interval in seconds', '60')
  .option('--max-retries <count>', 'Maximum retry attempts', '3')
  .option(
    '--rate-limit-retry-delay <seconds>',
    'Delay before retry after Claude rate limit (seconds)',
    '300'
  )
  .option(
    '-w, --working-dir <path>',
    'Working directory for git operations',
    process.cwd()
  )
  .option(
    '--disallowedTools <tools...>',
    'List of disallowed tools for Claude Code (optional)'
  )
  .action(async (options) => {
    try {
      // Warn user about dangerous mode
      if (options.dangerouslySkipPermissions) {
        logger.warn(
          '⚠️  YOLO mode enabled: --dangerously-skip-permissions grants full filesystem and shell access'
        );
        logger.warn(
          '⚠️  This should only be used in safe, non-production environments'
        );

        // If both are provided, warn that dangerously-skip-permissions takes precedence
        if (options.allowedTools) {
          logger.warn(
            '⚠️  Both --allowedTools and --dangerously-skip-permissions provided: YOLO mode takes precedence'
          );
        }
      }

      const rateLimitRetryDelay = parseInt(options.rateLimitRetryDelay) * 1000;

      const config: DispatcherConfig = {
        owner: options.owner,
        repo: options.repo,
        assignee: options.assignee,
        baseBranch: options.baseBranch,
        pollInterval: parseInt(options.interval),
        maxRetries: parseInt(options.maxRetries),
        allowedTools: options.allowedTools,
        disallowedTools: options.disallowedTools,
        dangerouslySkipPermissions: options.dangerouslySkipPermissions,
        rateLimitRetryDelay,
      };

      logger.info(
        'Starting Claude Code Dispatcher with configuration:',
        config
      );

      const dispatcher = new ClaudeCodeDispatcher(config, options.workingDir);

      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully...');
        await dispatcher.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully...');
        await dispatcher.stop();
        process.exit(0);
      });

      await dispatcher.start();
    } catch (error) {
      logger.error('Failed to start dispatcher:', error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show dispatcher status')
  .requiredOption('-o, --owner <owner>', 'GitHub repository owner')
  .requiredOption('-r, --repo <repo>', 'GitHub repository name')
  .requiredOption(
    '-a, --assignee <assignee>',
    'GitHub username to monitor for assigned issues'
  )
  .action(async (options) => {
    try {
      const config: DispatcherConfig = {
        owner: options.owner,
        repo: options.repo,
        assignee: options.assignee,
        baseBranch: 'main',
        pollInterval: 60,
        maxRetries: 3,
        allowedTools: [],
      };

      const dispatcher = new ClaudeCodeDispatcher(config);
      const status = dispatcher.getStatus();

      console.log('\n📊 Claude Code Dispatcher Status:');
      console.log(
        `├── 🔄 Polling: ${status.polling ? '✅ Active' : '❌ Inactive'}`
      );
      console.log(`├── 📋 Queue Size: ${status.queueSize}`);
      console.log(
        `├── ⚙️  Processing: ${status.processing ? '✅ Active' : '❌ Inactive'}`
      );

      if (status.nextIssue) {
        console.log(
          `└── 📝 Next Issue: #${status.nextIssue.number} - ${status.nextIssue.title}`
        );
      } else {
        console.log('└── 📝 Next Issue: None');
      }
    } catch (error) {
      logger.error('Failed to get status:', error);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate GitHub authentication and repository access')
  .requiredOption('-o, --owner <owner>', 'GitHub repository owner')
  .requiredOption('-r, --repo <repo>', 'GitHub repository name')
  .action(async (options) => {
    try {
      const { execSync } = await import('child_process');

      console.log('🔍 Validating GitHub CLI authentication...');
      execSync('gh auth status', { stdio: 'pipe' });
      console.log('✅ GitHub CLI authentication: OK');

      console.log('🔍 Validating repository access...');
      execSync(`gh repo view ${options.owner}/${options.repo}`, {
        stdio: 'pipe',
      });
      console.log('✅ Repository access: OK');

      console.log('🔍 Testing API rate limit...');
      const rateLimit = JSON.parse(
        execSync('gh api rate_limit', { encoding: 'utf8' })
      );
      console.log(
        `✅ API rate limit: ${rateLimit.rate.remaining}/${rateLimit.rate.limit} remaining`
      );

      console.log('\n🎉 All validations passed! Ready to start dispatcher.');
    } catch (error) {
      console.error('❌ Validation failed:', error);
      console.log('\nPlease ensure:');
      console.log('1. GitHub CLI is installed: gh --version');
      console.log('2. You are authenticated: gh auth login');
      console.log('3. You have access to the repository');
      process.exit(1);
    }
  });

// Always parse when required (needed for bin script)
program.parse();
