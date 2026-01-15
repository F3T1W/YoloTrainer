#!/bin/bash

# Script to fix "damaged" macOS app issue
# This removes quarantine attribute that macOS adds to downloaded files

if [ -z "$1" ]; then
    echo "Usage: ./fix-mac-app.sh /path/to/YOLO\ Trainer.app"
    echo ""
    echo "Or drag and drop the app into Terminal after typing:"
    echo "  ./fix-mac-app.sh "
    exit 1
fi

APP_PATH="$1"

# Check if path exists
if [ ! -d "$APP_PATH" ]; then
    echo "Error: App not found at: $APP_PATH"
    exit 1
fi

echo "Removing quarantine attribute from: $APP_PATH"
xattr -cr "$APP_PATH"

echo ""
echo "✅ Done! You can now open the app."
echo ""
echo "If you still see the error, try:"
echo "  sudo spctl --master-disable"
echo ""
echo "Or right-click the app and select 'Open' (this only needs to be done once)"
