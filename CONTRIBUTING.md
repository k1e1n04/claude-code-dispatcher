# Contributing Guide

Welcome to the Claude Code Dispatcher project! This guide will help you contribute effectively to the repository.

## 📋 Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- Git
- [GitHub CLI](https://cli.github.com/) (optional but recommended)

### Local Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/<your-username>/claude-code-dispatcher.git
   cd claude-code-dispatcher
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Verify Setup**
   ```bash
   npm run build
   npm run typecheck
   npm run lint
   npm test
   ```

## 🌳 Branch Naming Conventions

Use descriptive branch names that follow this pattern:

- `feature/description` - For new features
- `fix/description` - For bug fixes
- `docs/description` - For documentation updates
- `refactor/description` - For code refactoring
- `test/description` - For adding or updating tests
- `issue-<number>-description` - For GitHub issues

**Examples:**
- `feature/add-retry-mechanism`
- `fix/polling-interval-bug`
- `issue-12-create-contributing-guide`
- `docs/update-api-reference`

## 🔄 Contribution Workflow

### 1. Create a Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

### 2. Make Your Changes

Follow the coding standards outlined below and ensure your changes:
- Are well-tested
- Follow existing patterns
- Include appropriate documentation
- Pass all quality gates

### 3. Test Your Changes

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build the project
npm run build
```

### 4. Commit Your Changes

Follow our commit message conventions (see below).

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Create a pull request using our [PR template](.github/PULL_REQUEST_TEMPLATE.md).

## 📝 Coding Standards

### TypeScript Guidelines

- Use TypeScript for all source files
- Enable strict mode (`strict: true` in tsconfig.json)
- Provide type annotations for function parameters and return types
- Avoid `any` type; use `unknown` or specific types instead
- Use interfaces over type aliases for object shapes

### Code Style

- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Semicolons**: Always use semicolons
- **Line length**: 100 characters maximum
- **Naming**: Use camelCase for variables and functions, PascalCase for classes

### ESLint Configuration

The project uses ESLint with TypeScript support. Key rules:

- `@typescript-eslint/no-unused-vars`: Error
- `@typescript-eslint/no-explicit-any`: Warning
- `semi`: Always require semicolons
- `quotes`: Single quotes preferred

## 🧪 Testing Guidelines

### Test Structure

- Place unit tests in the `tests/` directory
- Use descriptive test names that explain the scenario
- Follow the AAA pattern (Arrange, Act, Assert)
- Mock external dependencies appropriately

### Coverage Requirements

Maintain minimum coverage thresholds:
- **Branches**: 30%
- **Functions**: 60%
- **Lines**: 60%
- **Statements**: 60%

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## 📋 Issue Guidelines

### Opening Issues

- Use descriptive titles that summarize the problem or request
- Provide clear reproduction steps for bugs
- Include relevant system information (Node.js version, OS)
- Use issue labels appropriately

### Issue Labels

- `bug` - Something isn't working correctly
- `feature` - New feature request
- `documentation` - Documentation improvements
- `help wanted` - Community contributions welcome
- `good first issue` - Good for newcomers

## 🔄 Pull Request Process

### Before Submitting

- [ ] All tests pass locally
- [ ] Code follows project conventions
- [ ] Changes are documented appropriately
- [ ] No new ESLint warnings introduced
- [ ] Coverage thresholds are maintained

### PR Template

Use our [PR template](.github/PULL_REQUEST_TEMPLATE.md) which includes:

- **Description**: Clear summary of changes
- **Type of Change**: Bug fix, feature, documentation, etc.
- **Testing**: Checklist of testing completed
- **Related Issues**: Link to relevant issues

### Review Process

1. **Automated Checks**: All GitHub Actions must pass
   - Type checking (`npm run typecheck`)
   - Linting (`npm run lint`)
   - Unit tests (`npm test`)
   - Build verification (`npm run build`)

2. **Code Review**: At least one maintainer review required
3. **Final Testing**: Manual testing for significant changes

## 💬 Commit Message Guidelines

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `test` - Adding or updating tests
- `chore` - Build process or auxiliary tool changes

### Examples

```bash
feat(dispatcher): add retry mechanism for failed issues

Implemented exponential backoff retry logic when processing
issues fails due to temporary errors or rate limits.

Closes #123
```

```bash
fix(poller): prevent duplicate issue processing

Fixed race condition where the same issue could be processed
multiple times during high-frequency polling intervals.

Fixes #456
```

## 🚀 Release Process

### Version Bumping

- Follow [Semantic Versioning](https://semver.org/)
- `MAJOR.MINOR.PATCH` format
- Breaking changes increment MAJOR
- New features increment MINOR
- Bug fixes increment PATCH

### Quality Gates

All releases must pass:
- Type checking without errors
- ESLint without violations
- 100% test suite passage
- Minimum coverage thresholds
- Successful build generation

## 📚 Documentation

### Code Documentation

- Use JSDoc comments for public APIs
- Document complex algorithms and business logic
- Keep README.md updated with new features
- Update examples when adding new functionality

### Architecture Documentation

When making significant changes, update relevant documentation:
- API interfaces in the code
- Usage examples in README.md
- Architecture diagrams if applicable

## 🛡️ Security

### Reporting Security Issues

- **Do not** open public issues for security vulnerabilities
- Contact maintainers privately through GitHub Security Advisories
- Provide detailed reproduction steps and impact assessment

### Security Best Practices

- Never commit secrets, API keys, or credentials
- Validate all external inputs
- Use secure defaults for configuration
- Keep dependencies updated

## 🤝 Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help newcomers get started
- Focus on what's best for the project

### Getting Help

- Check existing issues before opening new ones
- Use GitHub Discussions for questions
- Provide context when asking for help
- Be patient when waiting for responses

## 🔧 Development Tools

### Recommended IDE Setup

- **VS Code** with extensions:
  - TypeScript and JavaScript Language Features
  - ESLint
  - Prettier
  - Jest Runner

### Useful Commands

```bash
# Development with file watching
npm run dev

# Type checking only
npm run typecheck

# Lint and fix auto-fixable issues
npm run lint

# Clean build
rm -rf dist && npm run build
```

---

Thank you for contributing to Claude Code Dispatcher! Your efforts help make this tool better for everyone. 🎉

If you have questions about this guide, please open an issue or discussion on GitHub.