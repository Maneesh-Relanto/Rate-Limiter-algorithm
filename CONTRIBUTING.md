# 🤝 Contributing to Rate Limiter

Thank you for considering contributing to this project! This guide will help you get started.

## 📋 Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [How Can I Contribute?](#how-can-i-contribute)
3. [Development Process](#development-process)
4. [Style Guidelines](#style-guidelines)
5. [Commit Guidelines](#commit-guidelines)
6. [Pull Request Process](#pull-request-process)
7. [Community](#community)

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive experience for everyone. We pledge to:

- Use welcoming and inclusive language
- Respect differing viewpoints and experiences
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards other community members

### Unacceptable Behavior

- Harassment, trolling, or discriminatory comments
- Publishing others' private information
- Personal attacks or insults
- Any conduct that could reasonably be considered inappropriate

### Reporting

If you experience or witness unacceptable behavior, please report it to [maintainer@email.com].

---

## How Can I Contribute?

### 🐛 Reporting Bugs

**Before submitting:**
- Check existing issues to avoid duplicates
- Test with the latest version
- Collect relevant information

**Bug Report Template:**
```markdown
**Description:**
Clear description of the bug

**Steps to Reproduce:**
1. Step one
2. Step two
3. Step three

**Expected Behavior:**
What should happen

**Actual Behavior:**
What actually happens

**Environment:**
- OS: [e.g., Windows 11, macOS 14, Ubuntu 22.04]
- Language Version: [e.g., Node 18.x, Python 3.11]
- Rate Limiter Version: [e.g., 1.2.0]

**Additional Context:**
Screenshots, logs, etc.
```

### 💡 Suggesting Enhancements

**Enhancement Request Template:**
```markdown
**Feature Description:**
Clear description of the proposed feature

**Use Case:**
Why is this feature needed?

**Proposed Solution:**
How should it work?

**Alternatives Considered:**
Other approaches you've thought about

**Additional Context:**
Mockups, examples, etc.
```

### 📝 Improving Documentation

Documentation is crucial! You can help by:
- Fixing typos or unclear explanations
- Adding examples or use cases
- Translating to other languages
- Improving code comments
- Creating tutorials or guides

**Documentation PRs are highly appreciated and easy to get started!**

### 💻 Contributing Code

Areas where we need help:
- Implementing new algorithms
- Adding language implementations
- Performance optimizations
- Writing tests
- Creating examples
- Building playground features

---

## Development Process

### 1. Fork and Clone

```bash
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/YOUR_USERNAME/rate-limiter.git
cd rate-limiter

# Add upstream remote
git remote add upstream https://github.com/original/rate-limiter.git
```

### 2. Create a Branch

```bash
# Update main branch
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

**Branch Naming Convention:**
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Adding tests
- `perf/` - Performance improvements

### 3. Set Up Development Environment

Follow the [Setup Guide](docs/guides/SETUP.md) for detailed instructions.

**Quick setup:**
```bash
# Install dependencies
npm install  # For JavaScript
pip install -r requirements-dev.txt  # For Python

# Run tests to verify setup
npm test
pytest
```

### 4. Make Your Changes

- Write clean, readable code
- Follow style guidelines (see below)
- Add tests for new features
- Update documentation
- Keep commits focused and atomic

### 5. Test Your Changes

**JavaScript:**
```bash
# Run tests
npm test

# Run specific test
npm test -- --grep "Token Bucket"

# Check coverage
npm run test:coverage

# Lint code
npm run lint
```

**Python:**
```bash
# Run tests
pytest

# Run specific test
pytest tests/test_token_bucket.py

# Check coverage
pytest --cov=src

# Lint and format
black src/ tests/
flake8 src/ tests/
mypy src/
```

### 6. Commit Your Changes

```bash
# Stage changes
git add .

# Commit with descriptive message
git commit -m "feat: add sliding window counter algorithm"

# Push to your fork
git push origin feature/your-feature-name
```

See [Commit Guidelines](#commit-guidelines) below for commit message format.

---

## Style Guidelines

### General Principles

- **Readability over cleverness**
- **Simple over complex**
- **Clear naming**
- **Comments for WHY, not WHAT**

### JavaScript/TypeScript

**Code Style:**
```javascript
// ✅ Good
class TokenBucket {
  constructor(capacity, refillRate) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  /**
   * Attempts to acquire a token for the request.
   * @returns {boolean} True if request allowed, false otherwise
   */
  allowRequest() {
    this._refill();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    
    return false;
  }

  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

// ❌ Bad
class TokenBucket {
  constructor(c,r){this.c=c;this.t=c;this.r=r;this.l=Date.now()}
  a(){this.rf();if(this.t>=1){this.t-=1;return true}return false}
  rf(){let n=Date.now();let e=(n-this.l)/1000;this.t=Math.min(this.c,this.t+e*this.r);this.l=n}
}
```

**Naming:**
- Classes: `PascalCase`
- Functions/methods: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Private methods: `_prefixWithUnderscore`

**Tools:**
- ESLint for linting
- Prettier for formatting
- JSDoc for documentation

### Python

**Code Style:**
```python
# ✅ Good
class TokenBucket:
    """
    Token bucket rate limiting algorithm.
    
    Tokens are added at a constant rate and consumed by requests.
    If no tokens available, request is rejected.
    """
    
    def __init__(self, capacity: int, refill_rate: float):
        """
        Initialize token bucket.
        
        Args:
            capacity: Maximum number of tokens
            refill_rate: Tokens added per second
        """
        self.capacity = capacity
        self.tokens = capacity
        self.refill_rate = refill_rate
        self.last_refill = time.time()
    
    def allow_request(self) -> bool:
        """
        Attempt to acquire a token for the request.
        
        Returns:
            True if request allowed, False otherwise
        """
        self._refill()
        
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        
        return False
    
    def _refill(self) -> None:
        """Refill tokens based on elapsed time."""
        now = time.time()
        elapsed = now - self.last_refill
        tokens_to_add = elapsed * self.refill_rate
        
        self.tokens = min(self.capacity, self.tokens + tokens_to_add)
        self.last_refill = now

# ❌ Bad
class TokenBucket:
    def __init__(self,c,r):self.c=c;self.t=c;self.r=r;self.l=time.time()
    def a(self):self.rf();return self.t>=1 and(self.t:=self.t-1,True)[1]or False
    def rf(self):n=time.time();e=n-self.l;self.t=min(self.c,self.t+e*self.r);self.l=n
```

**Naming:**
- Classes: `PascalCase`
- Functions/methods: `snake_case`
- Constants: `UPPER_SNAKE_CASE`
- Private methods: `_prefix_with_underscore`

**Tools:**
- Black for formatting
- Flake8 for linting
- mypy for type checking
- Google/NumPy docstring style

### Documentation

**Inline Comments:**
```javascript
// ✅ Good - Explains WHY
// Use weighted average to avoid boundary problem
const estimatedCount = (prevCount * prevWeight) + currCount;

// ❌ Bad - States the obvious
// Calculate estimated count
const estimatedCount = (prevCount * prevWeight) + currCount;
```

**Function Documentation:**
```python
# ✅ Good
def sliding_window_counter(limit: int, window_size: int) -> bool:
    """
    Sliding window counter rate limiting algorithm.
    
    Uses weighted count from current and previous windows to estimate
    requests in the sliding window. More accurate than fixed window
    while maintaining O(1) space complexity.
    
    Args:
        limit: Maximum requests allowed in window
        window_size: Time window in seconds
        
    Returns:
        True if request should be allowed, False otherwise
        
    Example:
        >>> limiter = sliding_window_counter(100, 60)
        >>> limiter.allow_request()
        True
    """
```

---

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/).

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes

### Examples

```bash
# Feature
git commit -m "feat(algorithms): add sliding window counter implementation"

# Bug fix
git commit -m "fix(token-bucket): correct refill calculation for edge case"

# Documentation
git commit -m "docs(setup): add Windows installation instructions"

# Breaking change
git commit -m "feat(api): change rate limiter constructor signature

BREAKING CHANGE: constructor now requires options object instead of positional arguments"
```

### Commit Best Practices

- Use present tense: "add feature" not "added feature"
- Use imperative mood: "move cursor to" not "moves cursor to"
- First line ≤ 50 characters
- Body wraps at 72 characters
- Reference issues: "fixes #123" or "closes #456"

---

## Pull Request Process

### Before Submitting

- [ ] Code follows style guidelines
- [ ] Tests pass locally
- [ ] New tests added for new features
- [ ] Documentation updated
- [ ] Commit messages follow guidelines
- [ ] Branch is up to date with main

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Refactoring

## Testing
How has this been tested?

## Checklist
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Follows style guidelines
- [ ] No breaking changes (or documented)

## Related Issues
Fixes #123
Related to #456
```

### Review Process

1. **Automated Checks**: CI runs tests, linting
2. **Code Review**: Maintainer reviews code
3. **Discussion**: Address feedback
4. **Approval**: Maintainer approves
5. **Merge**: Squash and merge to main

### After Merge

- Delete your branch
- Update your fork
- Celebrate! 🎉

---

## Community

### Getting Help

- **Documentation**: Check [docs](docs/)
- **Issues**: Search existing issues
- **Discussions**: GitHub Discussions (coming soon)
- **Discord**: Join our community (coming soon)

### Recognition

Contributors are recognized in:
- README.md contributors section
- Release notes
- Annual contributor spotlight

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing! 🙏

