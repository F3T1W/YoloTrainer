# Changelog

All notable changes to YOLO Trainer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-XX

### Added
- Initial release of YOLO Trainer
- Reddit image download functionality
- Interactive annotation interface with bounding box drawing
- Custom class management
- YOLOv8 model training pipeline
- Three-step progressive training system (15% → 35% → 50% → 100%)
- Model testing and prediction interface
- Multi-language support (English, Russian, Japanese, Uzbek)
- Multiple theme options (Dark, Light, Blue, Green, Purple, Cyan, Pink, Indigo, Amber)
- Python environment setup and management
- Admin mode for testing with reduced dataset sizes
- Pause/Resume/Stop functionality for downloads
- Toast notification system with queue management
- Centralized state management
- Structured logging system
- Error handling and user-friendly error messages
- Statistics tracking (datasets, images, models)
- Models history folder management

### Technical
- Modular architecture with separated IPC handlers
- Centralized state management (AppState)
- Utility modules (notifications, storage, stats, error-handler, logger)
- Feature modules (classes, download, training, three-step, annotation-core)
- Structured logging with levels (DEBUG, INFO, WARN, ERROR)
- JSDoc documentation for all public functions
- Clean codebase without AI-generated traces

### Platform Support
- macOS
- Windows
- Linux

### Known Limitations
- Auto-update disabled (requires Apple Developer license for macOS code signing)
- Manual update download from GitHub Releases required
