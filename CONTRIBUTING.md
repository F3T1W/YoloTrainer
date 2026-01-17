# Contributing to YOLO Trainer

Thank you for your interest in contributing to YOLO Trainer! This document provides guidelines and instructions for contributing.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/YoloTrainer.git
   cd YoloTrainer
   ```
3. **Install dependencies**:
   ```bash
   npm install
   pip install -r python/requirements.txt
   ```

## Development Setup

1. **Run in development mode**:
   ```bash
   npm run dev
   ```

2. **Build for testing**:
   ```bash
   npm run dist
   ```

## Code Style

- **JavaScript**: Follow existing code style (ES5/ES6, no semicolons where not needed)
- **Python**: Follow PEP 8 style guide
- **Comments**: Write in English, explain "why" not "what"
- **JSDoc**: Add JSDoc comments for all public functions

## Project Structure

- `src/main/` - Electron main process (IPC handlers, utilities)
- `src/renderer/` - UI renderer process (modules, state, utils)
- `python/` - Python scripts (download, training, prediction)

## Making Changes

1. **Create a branch** for your feature/fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the code style

3. **Test your changes**:
   - Test the feature manually
   - Ensure no console errors
   - Check that existing features still work

4. **Commit your changes**:
   ```bash
   git commit -m "Add: description of your change"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request** on GitHub

## Pull Request Guidelines

- **Clear description**: Explain what changes you made and why
- **Reference issues**: Link to related issues if applicable
- **Screenshots**: Include screenshots for UI changes
- **Testing**: Describe how you tested your changes

## Areas for Contribution

- **Bug fixes**: Fix reported issues
- **Features**: Add new functionality
- **Documentation**: Improve README, add examples
- **Translations**: Add or improve translations
- **UI/UX**: Improve user interface and experience
- **Performance**: Optimize code performance
- **Testing**: Add tests (if test framework is added)

## Questions?

If you have questions, please open an issue on GitHub with the `question` label.

Thank you for contributing! 🚀
