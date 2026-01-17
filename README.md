# YOLO Model Trainer

Interactive Electron application for training custom YOLO models with Reddit integration and intuitive annotation interface.

## Features

- **Reddit Data Download** - Automatic image download from any subreddit
- **Interactive Annotation** - Draw bounding boxes directly on images with your mouse
- **Custom Classes** - Create your own classes (AltGirl, Bimbo, Nerdy, ARMPITS, etc.)
- **YOLOv8 Training** - Complete model training pipeline
- **Model Export** - Ready-to-use weights for CodeSlave integration

## Installation

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r python/requirements.txt

# Or if using a virtual environment:
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r python/requirements.txt
```

## Usage

1. **Launch the application:**
   ```bash
   npm start
   ```

2. **Download data:**
   - Enter subreddit name (e.g., `kittens`)
   - Enter class name (e.g., `CURLY_KITTEN`)
   - Specify image limit
   - Click "Download Images"

3. **Annotate data:**
   - Select a class from the list
   - Click and drag on the image to draw a bounding box
   - Click "Save & Next" to save and move to the next image
   - Repeat for all images

4. **Train model:**
   - Configure parameters (epochs, batch size, image size)
   - Click "Train Model"
   - Wait for training to complete

5. **Export:**
   - Trained model will be saved in `models/custom_model/weights/best.pt`
   - Can be exported to CodeSlave for use

## Project Structure

```
yolo_trainer/
├── src/
│   ├── main/                        # Electron main process
│   │   ├── main.js                  # Main process entry point
│   │   ├── handlers/                # IPC handlers (modular)
│   │   │   ├── annotation.js        # Annotation-related IPC
│   │   │   ├── dataset.js           # Dataset operations
│   │   │   ├── download.js          # Reddit download control
│   │   │   ├── files.js             # File system operations
│   │   │   ├── prediction.js        # Model prediction
│   │   │   ├── python.js            # Python environment wrapper
│   │   │   ├── three-step.js        # Three-step system IPC
│   │   │   ├── training.js          # Model training IPC
│   │   │   └── updates.js           # Auto-update handlers
│   │   └── utils/
│   │       └── python-env.js        # Python environment management
│   └── renderer/                    # UI renderer process
│       ├── index.html               # Main UI interface
│       ├── annotation.js            # Main annotation logic (orchestrator)
│       ├── modules/                 # Feature modules
│       │   ├── annotation-core.js   # Canvas & bounding box logic
│       │   ├── classes.js           # Class management
│       │   ├── download.js         # Reddit download UI logic
│       │   ├── navigation.js       # Page navigation
│       │   ├── three-step.js       # Three-step system logic
│       │   └── training.js         # Training UI logic
│       ├── state/
│       │   └── app-state.js        # Centralized state management
│       └── utils/                   # Utility modules
│           ├── notifications.js    # Toast notifications
│           ├── stats.js             # Statistics calculation
│           └── storage.js          # localStorage wrapper
├── python/
│   ├── reddit_downloader.py         # Reddit image download script
│   ├── yolo_trainer.py              # YOLOv8 training script
│   └── requirements.txt             # Python dependencies
├── datasets/                         # User datasets (created at runtime)
├── models_history/                   # Trained models history
└── package.json
```

### Architecture Overview

The application follows a modular architecture:

- **Main Process** (`src/main/`): Handles IPC communication, file operations, and Python script execution
  - **Handlers**: Organized IPC handlers for different features
  - **Utils**: Shared utilities (Python environment management)

- **Renderer Process** (`src/renderer/`): Manages UI and user interactions
  - **Modules**: Feature-specific modules (classes, download, training, etc.)
  - **State**: Centralized application state management
  - **Utils**: Reusable utility functions (notifications, storage, stats)

- **Python Scripts** (`python/`): Backend processing (download, training)

## macOS Installation

If macOS shows an "application is damaged" error on first launch, run in terminal:

```bash
# Method 1: Use the script (recommended)
./fix-mac-app.sh "/path/to/YOLO Trainer.app"

# Method 2: Manual
xattr -cr "/path/to/YOLO Trainer.app"

# Method 3: Alternative method
# Right-click on the application → "Open" (only needed once)
```After this, the application should launch normally.