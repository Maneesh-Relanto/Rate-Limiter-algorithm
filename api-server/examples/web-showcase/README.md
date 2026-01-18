# REST API Multi-Language Showcase

**Interactive web application demonstrating REST API integration across 8+ programming languages.**

## 🎯 Purpose

This showcase demonstrates how the Rate Limiter REST API can be integrated with ANY programming language:

- 🟨 **JavaScript** - Native fetch API
- 🐍 **Python** - requests library
- 📡 **cURL** - Command-line testing
- ☕ **Java** - HttpClient
- 🐹 **Go** - net/http
- 🐘 **PHP** - cURL
- 💎 **Ruby** - net/http
- #️⃣ **C#** - HttpClient

## 🚀 Quick Start

### Prerequisites

The REST API server must be running:

```bash
# From the api-server directory
cd ../../
node server.js
# Server runs on http://localhost:8080
```

### Running the Showcase

**Option 1: Open directly in browser**
```bash
# Simply open index.html in any modern browser
open index.html  # macOS
start index.html # Windows
xdg-open index.html # Linux
```

**Option 2: Use a local server (recommended)**
```bash
# Python 3
python -m http.server 8000

# Node.js (http-server)
npx http-server -p 8000

# PHP
php -S localhost:8000

# Then visit: http://localhost:8000
```

## ✨ Features

### Interactive Testing
- **Live API Status** - Real-time connection indicator
- **8 Language Examples** - Copy-paste ready code
- **6 Test Scenarios** - Check, penalty, reward, block, status, metrics
- **Configurable Parameters** - Adjust capacity, refill rate, keys
- **Live Response Display** - See results in real-time

### Code Examples
Each language section includes:
- ✅ Complete working code
- ✅ Installation instructions
- ✅ Usage examples
- ✅ Copy-to-clipboard functionality
- ✅ Best practices

## 📋 Available Tests

### 1. Check Rate Limit
Verify if request is allowed based on token availability
```
POST /api/check
{ "key": "user-123", "capacity": 10, "refillRate": 2 }
```

### 2. Apply Penalty
Remove tokens as punishment for abusive behavior
```
POST /api/penalty
{ "key": "user-123", "points": 5 }
```

### 3. Apply Reward
Add bonus tokens for good behavior
```
POST /api/reward
{ "key": "user-123", "points": 3 }
```

### 4. Block User
Temporarily ban a key for specified duration
```
POST /api/block
{ "key": "user-123", "duration": 60 }
```

### 5. Check Status
Get current limiter state and token count
```
GET /api/status/:key
```

### 6. Get Metrics
View API server metrics and statistics
```
GET /api/metrics
```

## 🎨 UI Features

- **Modern Design** - Clean, professional interface
- **Responsive Layout** - Works on desktop, tablet, mobile
- **Language Selector** - Easy switching between languages
- **Syntax Highlighting** - Code blocks with proper formatting
- **Copy Buttons** - One-click code copying
- **Live Updates** - Real-time API responses

## 🔧 Configuration

Adjust settings using the configuration bar:

- **API Base URL** - Default: `http://localhost:8080`
- **Limiter Key** - Default: `test-user`
- **Capacity** - Default: `10` tokens
- **Refill Rate** - Default: `2` tokens/second

## 📦 Language-Specific Setup

### Python
```bash
pip install requests
python your_script.py
```

### Java
```xml
<!-- Maven -->
<dependency>
    <groupId>com.google.code.gson</groupId>
    <artifactId>gson</artifactId>
    <version>2.10.1</version>
</dependency>
```

### Go
```bash
# No external dependencies needed
go run main.go
```

### PHP
```bash
# cURL usually included with PHP
php your_script.php
```

### Ruby
```bash
gem install httparty  # Optional
ruby your_script.rb
```

### C#
```bash
# .NET 6+ (HttpClient included)
dotnet run
```

## 🌐 Browser Support

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Opera 76+

## 🎯 Use Cases

### Testing
- Quickly test API endpoints
- Verify rate limiting behavior
- Test different scenarios

### Learning
- See how different languages call REST APIs
- Compare syntax across languages
- Learn best practices

### Integration
- Copy working code for your project
- Understand request/response formats
- See complete examples

### Demonstration
- Show clients how to integrate
- Present at technical meetings
- Create tutorials

## 🔍 Troubleshooting

### API Offline Error
**Problem:** "API Offline - Start server first"

**Solution:**
```bash
cd api-server
node server.js
# Server should start on port 8080
```

### CORS Errors
**Problem:** Cross-origin request blocked

**Solution:** The API server has CORS enabled. If issues persist:
1. Ensure API server is running
2. Check browser console for details
3. Try using a local server (not file://)

### Connection Refused
**Problem:** Cannot connect to localhost:8080

**Solution:**
1. Verify API server is running: `curl http://localhost:8080/api/health`
2. Check if port 8080 is available: `netstat -an | grep 8080`
3. Update API URL in configuration if using different port

## 📚 Documentation

For complete API documentation, see:
- [API Server README](../../README.md) - Full API documentation
- [REST API Examples](../) - Language-specific examples
- [Multi-Language Testing](../test-multi-language.ps1) - Automated tests

## 🤝 Contributing

To add a new language example:

1. Add language button in HTML (with emoji icon)
2. Create new `.example-section` div
3. Add code examples with syntax highlighting
4. Include installation/setup instructions
5. Test the integration

## 📄 License

Same license as the parent project.

## 🎉 Features Showcase

This application demonstrates:
- ✅ Universal REST API access
- ✅ Multi-language support (8+ languages)
- ✅ Interactive testing interface
- ✅ Real-time API status monitoring
- ✅ Copy-paste ready code examples
- ✅ Production-ready patterns
- ✅ Modern, responsive design
- ✅ Zero dependencies (static HTML)

Perfect for developers who need to:
- Integrate rate limiting into existing applications
- Learn how to call REST APIs in different languages
- Test API behavior interactively
- Demonstrate multi-language support to stakeholders
