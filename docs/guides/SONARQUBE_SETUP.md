# 🛡️ SonarQube Setup Guide

## When to Enable SonarQube

**Answer: NOW! ✅** (Right after first working implementation)

### Why Enable Early?

1. **Establish good patterns from the start** - Fix issues before they multiply
2. **Prevent technical debt** - Easier to fix as you code
3. **Learn best practices** - SonarQube teaches you better patterns
4. **Maintain quality** - Catch security issues immediately

### Perfect Timing

```
✅ Phase 1: Documentation        - No code yet, skip SonarQube
✅ Phase 2: First Algorithm      - ENABLE SONARQUBE NOW ← YOU ARE HERE
✅ Phase 3+: All future code     - SonarQube running continuously
```

---

## Installation Steps

### 1. Install SonarLint Extension (VS Code)

```
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "SonarLint"
4. Install official SonarSource extension
5. Restart VS Code
```

**Extension ID**: `SonarSource.sonarlint-vscode`

### 2. Configure SonarLint

Create `.vscode/settings.json` (if not exists):

```json
{
  "sonarlint.rules": {
    "javascript:S1192": {
      "level": "on"
    },
    "javascript:S3776": {
      "level": "on"
    }
  },
  "sonarlint.disableTelemetry": true,
  "sonarlint.pathToNodeExecutable": ""
}
```

### 3. What SonarQube Checks

**Code Quality:**
- Duplicated code blocks
- Complex functions (cognitive complexity)
- Code smells
- Maintainability issues

**Security:**
- SQL injection risks
- XSS vulnerabilities
- Insecure crypto usage
- Hard-coded credentials

**Bugs:**
- Potential null pointer exceptions
- Logic errors
- Resource leaks
- Type mismatches

**Best Practices:**
- Naming conventions
- Error handling
- Documentation
- Test coverage

---

## Recommended Settings for This Project

### `.sonarqube/config.json`

```json
{
  "projectKey": "rate-limiter",
  "projectName": "Rate Limiter Algorithms",
  "sources": "src",
  "tests": "tests",
  "exclusions": [
    "**/node_modules/**",
    "**/coverage/**",
    "**/dist/**",
    "**/confidential/**"
  ],
  "coverage": {
    "reportPaths": ["coverage/lcov.info"]
  },
  "javascript": {
    "lcov.reportPaths": "coverage/lcov.info"
  }
}
```

---

## Integration with Development Workflow

### 1. Real-time Analysis (While Coding)

SonarLint provides **instant feedback** in VS Code:
- Red squiggles for bugs
- Yellow squiggles for code smells
- Blue info for suggestions

### 2. Pre-commit Checks

Add to `package.json`:

```json
{
  "scripts": {
    "precommit": "npm run lint && npm test",
    "quality": "npm run lint && npm run test:coverage"
  }
}
```

### 3. CI/CD Integration (Future)

When you set up GitHub Actions:

```yaml
# .github/workflows/quality.yml
name: Code Quality

on: [push, pull_request]

jobs:
  sonarcloud:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

---

## Quality Gates for This Project

### Current Phase (MVP)

**Minimum Requirements:**
- ✅ No critical bugs
- ✅ No security vulnerabilities
- ✅ Test coverage >90%
- ✅ Code duplication <3%
- ✅ Maintainability rating A or B

### Production Phase (v1.0)

**Strict Requirements:**
- ✅ Zero bugs (all severity)
- ✅ Zero vulnerabilities
- ✅ Test coverage >95%
- ✅ Code duplication <2%
- ✅ Maintainability rating A
- ✅ Security rating A

---

## Common Issues to Watch For

### 1. Cognitive Complexity

**Issue**: Functions too complex
**Rule**: `javascript:S3776`
**Fix**: Break down into smaller functions

```javascript
// ❌ Bad - High complexity
function processRequest(req) {
  if (req.user) {
    if (req.user.premium) {
      if (req.type === 'api') {
        // ... nested logic
      }
    }
  }
}

// ✅ Good - Lower complexity
function processRequest(req) {
  if (!req.user) return handleNoUser();
  if (!req.user.premium) return handleFreeUser();
  if (req.type !== 'api') return handleNonAPI();
  
  return handlePremiumAPI(req);
}
```

### 2. Magic Numbers

**Issue**: Hard-coded numbers without explanation
**Rule**: `javascript:S109`
**Fix**: Use named constants

```javascript
// ❌ Bad
if (tokens > 100) { ... }

// ✅ Good
const MAX_TOKENS = 100;
if (tokens > MAX_TOKENS) { ... }
```

### 3. Duplicated Code

**Issue**: Same code in multiple places
**Rule**: `javascript:S1192`
**Fix**: Extract to function

```javascript
// ❌ Bad
console.log('Request allowed');
// ... elsewhere
console.log('Request allowed');

// ✅ Good
function logRequestAllowed() {
  console.log('Request allowed');
}
```

---

## Action Items (Now)

### Immediate (Today)

1. **Install SonarLint extension**
2. **Open your Token Bucket file** - see if any issues flagged
3. **Fix any issues** - should be minimal/none
4. **Run tests** - ensure nothing broken

### This Week

5. **Review SonarLint suggestions** for all new code
6. **Set up pre-commit hooks** (optional but recommended)
7. **Check quality dashboard** regularly

### Before v1.0 Release

8. **Set up SonarCloud** (free for open-source)
9. **Add quality badge** to README
10. **Integrate with CI/CD**

---

## SonarCloud Setup (For When You Publish)

### 1. Sign up at sonarcloud.io (Free for open-source)

### 2. Connect GitHub Repository

### 3. Add Quality Badge to README

```markdown
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=rate-limiter&metric=alert_status)](https://sonarcloud.io/dashboard?id=rate-limiter)
```

---

## Benefits You'll See

✅ **Better Code**: Cleaner, more maintainable
✅ **Fewer Bugs**: Catch issues before users do
✅ **Security**: Prevent vulnerabilities
✅ **Learning**: Improve your coding skills
✅ **Confidence**: Know your code is quality
✅ **Trust**: Users see quality badges

---

## Summary: When to Use SonarQube

```
Phase 1: Documentation only        → Skip SonarQube
Phase 2: First algorithm (NOW)     → Enable SonarLint ✅
Phase 2+: All new code             → Keep SonarLint on ✅
Before release: v1.0               → Add SonarCloud ✅
Production: Ongoing                → CI/CD integration ✅
```

**Bottom line: Enable SonarLint RIGHT NOW!** 🚀

---

*Last updated: January 10, 2026*
