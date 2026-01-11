import argparse
import os
from pathlib import Path
import yaml
from ultralytics import YOLO
import shutil
import random

def create_yolo_dataset_structure(dataset_path, classes):
    """
    Create YOLO dataset structure and data.yaml
    """
    dataset_path = Path(dataset_path)
    
    # Create directories
    for split in ['train', 'val']:
        (dataset_path / split / 'images').mkdir(parents=True, exist_ok=True)
        (dataset_path / split / 'labels').mkdir(parents=True, exist_ok=True)
    
    # Create data.yaml
    data_yaml = {
        'path': str(dataset_path.absolute()),
        'train': 'train/images',
        'val': 'val/images',
        'nc': len(classes),
        'names': classes
    }
    
    yaml_path = dataset_path / 'data.yaml'
    with open(yaml_path, 'w') as f:
        yaml.dump(data_yaml, f, default_flow_style=False)
    
    return yaml_path

def split_dataset(raw_path, dataset_path, train_ratio=0.8):
    """
    Split raw dataset into train/val sets
    """
    raw_path = Path(raw_path)
    dataset_path = Path(dataset_path)
    
    # Find images
    # We look for images in both root and 'images' subdir to be safe
    images = []
    if (raw_path / 'images').exists():
        images.extend(list((raw_path / 'images').glob('*.*')))
    
    # Also check root for images if empty (fallback)
    if not images:
        images.extend([f for f in raw_path.glob('*.*') if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp', '.bmp']])
    
    # Filter only valid images
    images = [img for img in images if img.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp', '.bmp']]
    
    if not images:
        print(f"Error: No images found in {raw_path}")
        return
        
    random.shuffle(images)
    
    split_idx = int(len(images) * train_ratio)
    train_images = images[:split_idx]
    val_images = images[split_idx:]
    
    print(f"Splitting dataset: {len(train_images)} training, {len(val_images)} validation", flush=True)
    
    # Function to copy pair
    def copy_pair(img_path, split_name):
        # Copy image
        shutil.copy2(img_path, dataset_path / split_name / 'images' / img_path.name)
        
        # Find label
        # Labels are expected in 'labels' sibling folder or same folder
        # Logic: 
        # 1. Check raw_path/labels/name.txt
        # 2. Check img_path.parent/../labels/name.txt
        # 3. Check img_path.parent/name.txt
        
        label_name = img_path.stem + '.txt'
        label_candidates = [
            raw_path / 'labels' / label_name,
            img_path.parent.parent / 'labels' / label_name,
            img_path.parent / label_name
        ]
        
        label_found = False
        for label_path in label_candidates:
            if label_path.exists():
                shutil.copy2(label_path, dataset_path / split_name / 'labels' / label_name)
                label_found = True
                break
        
        if not label_found:
            # Create empty label file if not found (background image)
            (dataset_path / split_name / 'labels' / label_name).touch()

    # Copy images and labels
    for img in train_images:
        copy_pair(img, 'train')
    
    for img in val_images:
        copy_pair(img, 'val')

def train_yolo_model(data_yaml, epochs, batch_size, img_size, output_dir):
    """
    Train YOLOv8 model
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Starting training for {epochs} epochs...", flush=True)
    
    # Load model (pretrained or resume)
    if 'last.pt' in str(data_yaml) or str(data_yaml).endswith('.pt'):
         # Resume training logic if path to .pt is passed instead of yaml
         # But usually 'resume=True' is used with the .pt file
         pass

    # Determine model to load
    # User wants to start a NEW training session but using weights from the previous run (last.pt).
    # This is "Fine-Tuning", not "Resuming".
    
    last_pt_path = Path(output_dir) / 'custom_model/weights/last.pt'
    best_pt_path = Path(output_dir) / 'custom_model/weights/best.pt'
    
    model_path = 'yolov8n.pt' # Default fallback
    
    if last_pt_path.exists():
         print(f"Found last.pt, using it as starting weights for new training...", flush=True)
         model_path = str(last_pt_path)
    elif best_pt_path.exists():
         print(f"Found best.pt, using it as starting weights for new training...", flush=True)
         model_path = str(best_pt_path)
    else:
         print("No previous model found, starting from base yolov8n.pt...", flush=True)
    
    try:
        model = YOLO(model_path)
    except Exception as e:
        print(f"Error loading model {model_path}: {e}", flush=True)
        print("Falling back to yolov8n.pt...", flush=True)
        model = YOLO('yolov8n.pt')
    
    # Train
    # We set resume=False explicitly to start a new session (Epoch 1)
    try:
        results = model.train(
            data=str(data_yaml),
            epochs=epochs,
            batch=batch_size,
            imgsz=img_size,
            project=str(output_dir),
            name='custom_model',
            exist_ok=True,
            verbose=True,
            resume=False
        )
    except Exception as e:
        print(f"\nTraining failed: {e}", flush=True)
        raise e
    
    # Export best model
    best_model = output_dir / 'custom_model' / 'weights' / 'best.pt'
    print(f"Training complete! Best model saved at: {best_model}", flush=True)
    
    return best_model

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Train YOLO model')
    parser.add_argument('--data', required=True, help='Dataset path (raw folder)')
    parser.add_argument('--epochs', type=int, default=50)
    parser.add_argument('--batch', type=int, default=16)
    parser.add_argument('--img', type=int, default=640)
    parser.add_argument('--output', required=True)
    parser.add_argument('--class-names', required=True, help='Comma separated class names')
    
    args = parser.parse_args()
    
    # Parse class names
    class_names = [c.strip() for c in args.class_names.split(',')]
    print(f"Classes: {class_names}", flush=True)
    
    # Create dataset structure
    # We create a temporary formatted dataset next to the raw data
    dataset_path = Path(args.data).parent / 'yolo_formatted_dataset'
    
    # Clean up previous run
    if dataset_path.exists():
        shutil.rmtree(dataset_path)
    dataset_path.mkdir(parents=True)
        
    yaml_path = create_yolo_dataset_structure(dataset_path, class_names)
    
    # Split dataset
    split_dataset(args.data, dataset_path)
    
    # Train
    train_yolo_model(yaml_path, args.epochs, args.batch, args.img, args.output)
