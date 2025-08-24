# Contributing to Claude Code Dispatcher

Thank you for your interest in contributing to Claude Code Dispatcher! This guide will help you get started with contributing to the project.

## 🚀 Quick Start

1. Fork the repository on GitHub
2. Clone your fork locally: `git clone https://github.com/YOUR_USERNAME/claude-code-dispatcher.git`
3. Install dependencies: `npm install`
4. Create a feature branch: `git checkout -b feature/your-feature-name`
5. Make your changes and commit them
6. Push to your fork and create a pull request

## 📋 Opening Issues

Before creating a new issue, please:

1. **Search existing issues** to avoid duplicates
2. **Use descriptive titles** that clearly explain the problem or feature request
3. **Provide detailed information** including:
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - Environment details (Node.js version, OS, etc.)
   - Relevant code snippets or error messages

### Issue Labels

- 🐛 **bug**: Something isn't working correctly
- ✨ **enhancement**: New feature or improvement
- 📚 **documentation**: Documentation improvements
- 🔧 **refactoring**: Code structure improvements
- ⚡ **performance**: Performance-related improvements

## 🌿 Branch Naming Conventions

Use descriptive branch names that follow this pattern:

- **Features**: `feature/description-of-feature`
- **Bug fixes**: `fix/description-of-bug`
- **Documentation**: `docs/description-of-change`
- **Refactoring**: `refactor/description-of-change`
- **Performance**: `perf/description-of-improvement`

### Examples

- `feature/add-webhook-support`
- `fix/handle-rate-limiting-errors`
- `docs/update-installation-guide`
- `refactor/extract-github-client`

## 🔄 Pull Request Process

### 1. Before Creating a PR

- Ensure your branch is up to date with the main branch
- Run all tests and ensure they pass
- Follow the coding standards outlined below
- Update documentation if needed

### 2. Creating the PR

- Use the provided [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md)
- Write a clear, descriptive title
- Fill out all relevant sections in the template
- Link related issues using `Closes #issue-number` or `Relates to #issue-number`

### 3. PR Review Process

- All PRs require at least one review before merging
- Address reviewer feedback promptly
- Keep discussions respectful and constructive
- Be responsive to change requests

## 💻 Development Setup

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- Git for version control
- [GitHub CLI](https://cli.github.com/) (for testing GitHub integrations)
- [Claude CLI](https://claude.ai/code) (for testing Claude Code integration)

### Local Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev -- start --owner myorg --repo myproject --assignee developer --dangerously-skip-permissions

# Run with explicit tool permissions (production-safe)
npm run dev -- start --owner myorg --repo myproject --assignee developer --allowedTools "Edit" "Write" "Bash(git add:*)" "Bash(git commit:*)" "Bash(git push:*)" "Bash(gh pr create:*)"
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run dev` | Run in development mode with ts-node |
| `npm test` | Run the test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint to check code style |
| `npm run typecheck` | Run TypeScript compiler for type checking |

## 🎨 Coding Standards

### TypeScript/JavaScript Guidelines

- Use **TypeScript** for all new code
- Follow **strict type checking** - no `any` types without justification
- Use **descriptive variable and function names**
- Write **JSDoc comments** for public APIs
- Prefer **const** over **let**, avoid **var**
- Use **async/await** over Promises when possible

### Code Style

- **Indentation**: 2 spaces (no tabs)
- **Line length**: 100 characters maximum
- **Semicolons**: Always use semicolons
- **Quotes**: Use single quotes for strings, double quotes for JSX attributes
- **Trailing commas**: Include trailing commas in objects and arrays

### Example Code Style

```typescript
interface GitHubIssue {
  id: number;
  title: string;
  body: string;
  assignee: string | null;
}

/**
 * Processes a GitHub issue and creates a pull request
 * @param issue - The GitHub issue to process
 * @returns Promise that resolves when processing is complete
 */
async function processIssue(issue: GitHubIssue): Promise<void> {
  const branchName = `issue-${issue.id}-${slugify(issue.title)}`;
  
  try {
    await createBranch(branchName);
    await generateSolution(issue);
    await createPullRequest(issue, branchName);
  } catch (error) {
    logger.error('Failed to process issue', { issueId: issue.id, error });
    throw error;
  }
}
```

## 🧪 Testing Guidelines

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode during development
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Writing Tests

- Write **unit tests** for all new functionality
- Use **descriptive test names** that explain what is being tested
- Follow the **Arrange-Act-Assert** pattern
- Mock external dependencies (GitHub API, Claude CLI, etc.)
- Maintain **high test coverage** (aim for >80%)

### Test Structure

```typescript
describe('IssueProcessor', () => {
  describe('processIssue', () => {
    it('should create a branch and pull request for valid issue', async () => {
      // Arrange
      const issue = createMockIssue();
      const processor = new IssueProcessor(mockConfig);
      
      // Act
      await processor.processIssue(issue);
      
      // Assert
      expect(mockGitRepository.createBranch).toHaveBeenCalledWith(expectedBranchName);
      expect(mockGitHubClient.createPullRequest).toHaveBeenCalledWith(expectedPR);
    });
  });
});
```

## 📝 Commit Message Guidelines

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **chore**: Changes to the build process or auxiliary tools

### Examples

```bash
feat(cli): add support for custom polling intervals

fix(github): handle rate limiting with exponential backoff

docs(readme): update installation instructions

refactor(queue): extract issue queue to separate class

test(processor): add unit tests for error handling
```


## 📊 Quality Gates

All contributions must pass the following quality gates:

### Automated Checks

- ✅ **Type checking** (`npm run typecheck`)
- ✅ **Linting** (`npm run lint`) 
- ✅ **Unit tests** (`npm test`)
- ✅ **Build process** (`npm run build`)

### Manual Review

- ✅ **Code review** by maintainer
- ✅ **Functionality testing**
- ✅ **Documentation updates** (if applicable)
- ✅ **Security considerations** reviewed

## 🏗️ Project Architecture

### Directory Structure

```
src/
├── cli.ts                    # Command-line interface entry point
├── index.ts                  # Main module exports
├── clients/                  # External service integrations
│   ├── claude-executor.ts    # Claude Code command execution
│   ├── github-client.ts      # GitHub API interactions
│   └── index.ts              # Client exports
├── commands/                 # CLI command implementations
├── infrastructure/           # Core infrastructure services  
│   ├── git-repository.ts     # Git operations abstraction
│   └── index.ts              # Infrastructure exports
├── services/                 # Business logic services
│   ├── dispatcher.ts         # Main orchestration service
│   ├── issue-processor.ts    # Individual issue processing
│   ├── issue-queue.ts        # FIFO queue management
│   └── poller.ts             # GitHub issue polling
├── types/                    # Type definitions
└── utils/                    # Shared utilities
    ├── logger.ts             # Logging configuration
    └── prompt-builder.ts     # Claude prompt generation
```

### Key Components

- **ClaudeCodeDispatcher**: Central orchestrator managing the entire workflow
- **IssuePoller**: Continuously monitors GitHub for new assigned issues  
- **IssueQueue**: Thread-safe FIFO queue for sequential issue processing
- **IssueProcessor**: Handles individual issue processing workflow
- **ClaudeCodeExecutor**: Manages Claude Code execution with configurable permissions
- **GitHubClient**: Abstracts GitHub API operations (issues, PRs)
- **GitRepository**: Handles all git operations (branching, commits, pushes)

## 🐛 Debugging & Logging

### Log Files

The dispatcher creates comprehensive logs in:
- `combined.log`: All log messages
- `error.log`: Error messages only
- Console output with colored formatting

### Debug Mode

Enable verbose logging by setting the log level:

```bash
# In development
LOG_LEVEL=debug npm run dev -- start --owner myorg --repo myproject
```

## 📞 Communication & Support

### Getting Help

- **GitHub Issues**: For bug reports and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Pull Request Reviews**: For code-specific questions


## 🎉 Recognition

Contributors are recognized in:
- Release notes for significant contributions
- GitHub contributors list
- Special thanks in documentation updates

## 📄 License

By contributing to Claude Code Dispatcher, you agree that your contributions will be licensed under the MIT License.

## ❓ Questions?

If you have questions not covered in this guide, please:
1. Check existing [GitHub Issues](https://github.com/k1e1n04/claude-code-dispatcher/issues)
2. Create a new issue with the "question" label
3. Provide as much context as possible

Thank you for contributing to Claude Code Dispatcher! 🚀