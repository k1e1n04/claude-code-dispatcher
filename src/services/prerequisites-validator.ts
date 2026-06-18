import { execSync } from 'child_process';
import { DispatcherConfig } from '../types/index';
import { logger } from '../utils';

/**
 * Validates that all required prerequisites are available for the dispatcher
 *
 * This class follows the Single Responsibility Principle by focusing solely on
 * prerequisite validation. It checks for GitHub CLI authentication, repository
 * access permissions, and Claude CLI availability.
 *
 * @example
 * ```typescript
 * const validator = new PrerequisitesValidator(config);
 * await validator.validate();
 * ```
 *
 * @since 1.0.0
 */
export class PrerequisitesValidator {
  constructor(private config: DispatcherConfig) {}

  /**
   * Validates that all required prerequisites are available
   *
   * Performs the following checks:
   * - GitHub CLI authentication status
   * - Repository access permissions
   * - Claude CLI availability
   *
   * @throws {Error} When any prerequisite check fails with descriptive error message
   *
   * @example
   * ```typescript
   * try {
   *   await validator.validate();
   *   console.log('All prerequisites validated successfully');
   * } catch (error) {
   *   console.error('Prerequisites validation failed:', error.message);
   * }
   * ```
   */
  async validate(): Promise<void> {
    try {
      logger.info('Validating prerequisites...');

      await this.validateGitHubAuth();
      await this.validateRepositoryAccess();
      await this.validateClaudeCLI();

      logger.info('Prerequisites validation passed');
    } catch (error) {
      logger.error('Prerequisites validation failed:', error);
      throw new Error(
        'Prerequisites validation failed. Please ensure GitHub CLI and Claude CLI are installed and authenticated.'
      );
    }
  }

  /**
   * Validates GitHub CLI authentication status
   *
   * @private
   * @throws {Error} When GitHub CLI is not authenticated
   */
  private async validateGitHubAuth(): Promise<void> {
    try {
      execSync('gh auth status', { stdio: 'pipe' });
      logger.debug('GitHub CLI authentication validated');
    } catch (error) {
      logger.error('GitHub CLI authentication check failed:', error);
      throw new Error('GitHub CLI is not authenticated. Run "gh auth login" to authenticate.');
    }
  }

  /**
   * Validates repository access permissions
   *
   * @private
   * @throws {Error} When repository is not accessible
   */
  private async validateRepositoryAccess(): Promise<void> {
    try {
      execSync(`gh repo view ${this.config.owner}/${this.config.repo}`, {
        stdio: 'pipe',
      });
      logger.debug(`Repository ${this.config.owner}/${this.config.repo} access validated`);
    } catch (error) {
      logger.error('Repository access check failed:', error);
      throw new Error(
        `Repository ${this.config.owner}/${this.config.repo} is not accessible. Check repository permissions.`
      );
    }
  }

  /**
   * Validates Claude CLI availability
   *
   * @private
   * @throws {Error} When Claude CLI is not available
   */
  private async validateClaudeCLI(): Promise<void> {
    try {
      execSync('claude --version', { stdio: 'pipe' });
      logger.debug('Claude CLI availability validated');
    } catch (error) {
      logger.error('Claude CLI availability check failed:', error);
      throw new Error('Claude CLI is not available. Please install Claude CLI.');
    }
  }
}