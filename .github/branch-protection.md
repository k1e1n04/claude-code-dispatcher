# Branch Protection Rules

This document outlines the recommended branch protection settings for this repository.

## Main Branch (`main`)

### Required Status Checks
- [x] Require status checks to pass before merging
- [x] Require branches to be up to date before merging

**Required checks:**
- `test (16.x)`
- `test (18.x)` 
- `test (20.x)`
- `build`
- `quality-checks`
- `dependency-review`

### Pull Request Requirements
- [x] Require a pull request before merging
- [x] Require approvals: **1**
- [x] Dismiss stale PR approvals when new commits are pushed
- [x] Require review from code owners (if CODEOWNERS file exists)
- [x] Restrict pushes that create files that change the repository

### Additional Restrictions
- [x] Restrict pushes to matching branches
- [x] Allow force pushes: **❌ Disabled**
- [x] Allow deletions: **❌ Disabled**

### Administrators
- [x] Include administrators in these restrictions

## Develop Branch (`develop`)

### Required Status Checks
- [x] Require status checks to pass before merging
- [x] Require branches to be up to date before merging

**Required checks:**
- `test (20.x)` (minimum)
- `quality-checks`

### Pull Request Requirements
- [x] Require a pull request before merging
- [x] Require approvals: **1**
- [ ] Dismiss stale PR approvals when new commits are pushed (more lenient for development)
- [ ] Require review from code owners

### Additional Restrictions
- [x] Restrict pushes to matching branches
- [x] Allow force pushes: **❌ Disabled**
- [x] Allow deletions: **❌ Disabled**

### Administrators
- [ ] Include administrators in these restrictions (more flexibility for development)

## Setup Instructions

### GitHub UI Configuration (Recommended)

1. Go to **Settings** → **Branches** in GitHub repository
2. Click **Add rule** for each branch (`main` and `develop`)
3. Configure the settings as described above
4. Save the rules

**Note:** Branch protection rules must be configured through GitHub's web interface, not through GitHub Actions workflows. The `block-merge-on-failure` pattern in workflows is an anti-pattern since GitHub's built-in branch protection provides better integration and reliability.

## Quality Gates Summary

All PRs must pass:
- ✅ **Unit Tests** - All tests must pass
- ✅ **Type Checking** - No TypeScript errors
- ✅ **Linting** - Code style compliance
- ✅ **Test Coverage** - Minimum 60% coverage
- ✅ **Security Audit** - No high/critical vulnerabilities
- ✅ **Build Success** - Project builds without errors
- ✅ **Dependency Review** - New dependencies approved

## Auto-merge Support

PRs can be auto-merged when:
- All required checks pass
- Required approvals obtained
- PR has `automerge` label or `[automerge]` in title
- Target branch is `develop` (main branch requires manual merge)