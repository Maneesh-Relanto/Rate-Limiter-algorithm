# 🚀 Setup Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Installation Options](#installation-options)
3. [Quick Start](#quick-start)
4. [Development Setup](#development-setup)
5. [IDE Configuration](#ide-configuration)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Git**: Version 2.0 or higher
  ```bash
  git --version
  ```

- **Node.js**: Version 16.x or higher (for JavaScript examples)
  ```bash
  node --version
  npm --version
  ```

- **Python**: Version 3.8 or higher (for Python examples)
  ```bash
  python --version
  # or
  python3 --version
  ```

- **Java**: JDK 11 or higher (for Java examples)
  ```bash
  java -version
  ```

### Optional Software

- **Docker**: For containerized playground
- **Redis**: For distributed rate limiting examples
- **Visual Studio Code**: Recommended IDE

---

## Installation Options

### Option 1: Clone Repository (Recommended)

```bash
# Clone the repository
git clone https://github.com/yourusername/rate-limiter.git
cd rate-limiter

# Verify structure
ls -la
# You should see: docs/ src/ playground/ examples/ tests/ README.md
```

### Option 2: Download ZIP

1. Go to: https://github.com/yourusername/rate-limiter
2. Click "Code" → "Download ZIP"
3. Extract to your desired location
4. Navigate to the extracted folder

### Option 3: Use as NPM Package (Coming Soon)

```bash
npm install @yourusername/rate-limiter
```

### Option 4: Use as Python Package (Coming Soon)

```bash
pip install rate-limiter
```

---

## Quick Start

### 1. Explore Documentation

```bash
# Navigate to docs
cd docs

# Read the WHY documentation
cat WHY_RATE_LIMITING.md

# Compare algorithms
cat ALGORITHM_COMPARISON.md
```

### 2. Run Basic Example

**JavaScript/Node.js:**
```bash
# Navigate to examples
cd examples/javascript

# Install dependencies
npm install

# Run token bucket example
node token-bucket-example.js
```

**Python:**
```bash
# Navigate to Python examples
cd examples/python

# Create virtual environment (optional but recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run token bucket example
python token_bucket_example.py
```

### 3. Try Interactive Playground

**Web Playground:**
```bash
cd playground/web
npm install
npm start
# Open browser to http://localhost:3000
```

**CLI Playground:**
```bash
cd playground/cli
npm install
npm run playground
# Follow interactive prompts
```

---

## Development Setup

### For Contributors

#### 1. Fork and Clone

```bash
# Fork the repo on GitHub first, then:
git clone https://github.com/YOUR_USERNAME/rate-limiter.git
cd rate-limiter

# Add upstream remote
git remote add upstream https://github.com/original/rate-limiter.git
```

#### 2. Install All Dependencies

**JavaScript/TypeScript:**
```bash
# Install root dependencies
npm install

# Install all example dependencies
cd examples/express && npm install && cd ../..
cd examples/fastify && npm install && cd ../..

# Install playground dependencies
cd playground/web && npm install && cd ../..
cd playground/cli && npm install && cd ../..
```

**Python:**
```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install in development mode
pip install -e .

# Install development dependencies
pip install -r requirements-dev.txt

# Install example dependencies
cd examples/flask && pip install -r requirements.txt && cd ../..
cd examples/fastapi && pip install -r requirements.txt && cd ../..
```

**Java:**
```bash
# Navigate to Java examples
cd examples/spring-boot

# Using Maven
mvn clean install

# Using Gradle
gradle build
```

#### 3. Run Tests

**JavaScript:**
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npm test -- --grep "Token Bucket"
```

**Python:**
```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# Run specific test
pytest tests/test_token_bucket.py
```

#### 4. Run Linting & Formatting

**JavaScript:**
```bash
# Lint code
npm run lint

# Fix lint issues
npm run lint:fix

# Format code
npm run format
```

**Python:**
```bash
# Format with black
black src/ tests/

# Lint with flake8
flake8 src/ tests/

# Type check with mypy
mypy src/
```

---

## IDE Configuration

### Visual Studio Code

#### Recommended Extensions

Create `.vscode/extensions.json`:
```json
{
  "recommendations": [
    "ms-python.python",
    "ms-python.vscode-pylance",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "redhat.java",
    "vscjava.vscode-spring-boot-dashboard"
  ]
}
```

#### Workspace Settings

Create `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "python.linting.enabled": true,
  "python.linting.pylintEnabled": true,
  "python.formatting.provider": "black",
  "files.exclude": {
    "**/__pycache__": true,
    "**/node_modules": true,
    "**/.pytest_cache": true
  }
}
```

#### Debug Configuration

Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Run Node Example",
      "program": "${workspaceFolder}/examples/javascript/token-bucket-example.js"
    },
    {
      "type": "python",
      "request": "launch",
      "name": "Run Python Example",
      "program": "${workspaceFolder}/examples/python/token_bucket_example.py",
      "console": "integratedTerminal"
    }
  ]
}
```

### JetBrains IDEs (IntelliJ, PyCharm)

1. Open project folder
2. IDE will auto-detect project type
3. Install recommended plugins when prompted
4. Configure interpreters:
   - **Python**: Settings → Project → Python Interpreter
   - **Node.js**: Settings → Languages → Node.js
   - **Java**: Project Structure → Project SDK

---

## Platform-Specific Setup

### Windows

#### Using PowerShell

```powershell
# Clone repository
git clone https://github.com/yourusername/rate-limiter.git
cd rate-limiter

# Python virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install Python packages
pip install -r requirements-dev.txt

# Install Node packages
npm install
```

#### Using WSL2 (Recommended)

```bash
# Install WSL2 if not already installed
wsl --install

# Follow Linux setup instructions in WSL2 terminal
```

#### Common Windows Issues

**Issue**: `scripts execution is disabled`
```powershell
# Solution: Enable scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Issue**: Line ending problems
```bash
# Solution: Configure git
git config --global core.autocrlf true
```

### macOS

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install git node python@3.11

# Clone and setup
git clone https://github.com/yourusername/rate-limiter.git
cd rate-limiter

# Python setup
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt

# Node setup
npm install
```

### Linux (Ubuntu/Debian)

```bash
# Update package list
sudo apt update

# Install dependencies
sudo apt install -y git nodejs npm python3 python3-pip python3-venv

# Clone and setup
git clone https://github.com/yourusername/rate-limiter.git
cd rate-limiter

# Python setup
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt

# Node setup
npm install
```

---

## Docker Setup

### Using Docker Compose

```bash
# Build and run all services
docker-compose up

# Run specific service
docker-compose up playground-web

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Manual Docker Setup

**Build Image:**
```bash
docker build -t rate-limiter .
```

**Run Container:**
```bash
docker run -p 3000:3000 rate-limiter
```

**Run with Redis:**
```bash
# Start Redis
docker run -d --name redis -p 6379:6379 redis

# Run rate limiter with Redis link
docker run -p 3000:3000 --link redis:redis rate-limiter
```

---

## Verification

### Check Installation

Run this script to verify everything is set up correctly:

**verify-setup.sh** (Linux/macOS):
```bash
#!/bin/bash

echo "Verifying Rate Limiter Setup..."

# Check Git
if command -v git &> /dev/null; then
    echo "✅ Git: $(git --version)"
else
    echo "❌ Git not found"
fi

# Check Node.js
if command -v node &> /dev/null; then
    echo "✅ Node.js: $(node --version)"
else
    echo "❌ Node.js not found"
fi

# Check Python
if command -v python3 &> /dev/null; then
    echo "✅ Python: $(python3 --version)"
else
    echo "❌ Python not found"
fi

# Check project structure
if [ -d "docs" ] && [ -d "src" ] && [ -d "examples" ]; then
    echo "✅ Project structure verified"
else
    echo "❌ Project structure incomplete"
fi

echo "Verification complete!"
```

**verify-setup.ps1** (Windows PowerShell):
```powershell
Write-Host "Verifying Rate Limiter Setup..."

# Check Git
if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Host "✅ Git: $(git --version)"
} else {
    Write-Host "❌ Git not found"
}

# Check Node.js
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "✅ Node.js: $(node --version)"
} else {
    Write-Host "❌ Node.js not found"
}

# Check Python
if (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Host "✅ Python: $(python --version)"
} else {
    Write-Host "❌ Python not found"
}

# Check structure
if ((Test-Path "docs") -and (Test-Path "src") -and (Test-Path "examples")) {
    Write-Host "✅ Project structure verified"
} else {
    Write-Host "❌ Project structure incomplete"
}

Write-Host "Verification complete!"
```

---

## Troubleshooting

### Common Issues

#### Issue: `npm install` fails

**Symptom:**
```
npm ERR! code EACCES
npm ERR! Permission denied
```

**Solution:**
```bash
# Don't use sudo! Instead, fix npm permissions:
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.profile
source ~/.profile
```

#### Issue: Python `pip install` fails

**Symptom:**
```
error: externally-managed-environment
```

**Solution:**
```bash
# Use virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt
```

#### Issue: Port already in use

**Symptom:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:**
```bash
# Find process using port 3000
# Linux/macOS:
lsof -i :3000
kill -9 <PID>

# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or use different port:
PORT=3001 npm start
```

#### Issue: Module not found

**Symptom:**
```
Error: Cannot find module 'express'
```

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# For Python:
pip install --force-reinstall -r requirements.txt
```

### Getting Help

If you encounter issues:

1. **Check Documentation**: Read [FAQ](FAQ.md)
2. **Search Issues**: https://github.com/yourusername/rate-limiter/issues
3. **Ask Question**: Open a new issue with the "question" label
4. **Discord**: Join our community (link in README)

---

## Next Steps

Now that you're set up:

1. 📖 **Read**: [Algorithm Comparison](../ALGORITHM_COMPARISON.md)
2. 💻 **Code**: Try [examples](../../examples/)
3. 🎮 **Play**: Explore [playground](../../playground/)
4. 🤝 **Contribute**: See [Contributing Guide](../../CONTRIBUTING.md)

---

*Last updated: January 10, 2026*
