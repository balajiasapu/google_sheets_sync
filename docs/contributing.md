# Contributing to Google Sheets Sync

Thank you for your interest in contributing! We welcome help in making this synchronization tool even better.

## 🚀 How to Contribute

### 1. Open an Issue
If you find a bug or have a feature request, please [open an issue](https://github.com/balajiasapu/google_sheets_sync/issues). 
Please include:
- A clear description of the problem/feature.
- Steps to reproduce (for bugs).
- Environment details (Node.js version, platform).

### 2. Submit a Pull Request
1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/amazing-feature`.
3. Commit your changes: `git commit -m 'Add amazing feature'`.
4. Push to the branch: `git push origin feature/amazing-feature`.
5. Open a Pull Request.

---

## 💻 Coding Style

- **Standard ES6+**: Use modern JavaScript features.
- **Async/Await**: Preferred over Promises/callbacks.
- **CamelCase**: Use camelCase for variables and functions.
- **Descriptive Names**: Avoid single-letter variables except in loops.
- **Comments**: Document non-obvious logic and public API functions.

---

## 🧪 Testing

We use a simple `test/` directory for validation.

### Adding Tests
1. Add your test case to `test/sync.test.js`.
2. Ensure you handle mock environments appropriately.
3. To run tests (manually for now):
   ```bash
   node test/sync.test.js
   ```
---

## 🛡️ Security Policy

Please **DO NOT** report security vulnerabilities in public issues. Instead, follow the instructions in [security.md](security.md#report-security-issues).

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
