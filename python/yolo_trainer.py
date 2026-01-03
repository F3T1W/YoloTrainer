import argparse
import os
from pathlib import Path
import yaml
from ultralytics import YOLO

def create_yolo_dataset_structure(dataset_path, classes):
    """
    Create YOLO dataset structure and data.yaml
    """
    dataset_path = Path(dataset_path)
    
    # Create directories
    (dataset_path / 'train' / 'images').mkdir(parents=True, exist_ok=True)
    (dataset_path / 'train' / 'labels').mkdir(parents=True, exist_ok=True)
    (dataset_path / 'val' / 'images').mkdir(parents=True, exist_ok=True)
    (dataset_path / 'val' / 'labels').mkdir(parents=True, exist_ok=True)
    
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
    from shutil import copy2
    import random
    
    raw_path = Path(raw_path)
    dataset_path = Path(dataset_path)
    
    images = list((raw_path / 'images').glob('*.*'))
    random.shuffle(images)
    
    split_idx = int(len(images) * train_ratio)
    train_images = images[:split_idx]
    val_images = images[split_idx:]
    
    # Copy images and labels
    for img in train_images:
        copy2(img, dataset_path / 'train' / 'images' / img.name)
        label = raw_path / 'labels' / (img.stem + '.txt')
        if label.exists():
            copy2(label, dataset_path / 'train' / 'labels' / label.name)
    
    for img in val_images:
        copy2(img, dataset_path / 'val' / 'images' / img.name)
        label = raw_path / 'labels' / (img.stem + '.txt')
        if label.exists():
            copy2(label, dataset_path / 'val' / 'labels' / label.name)
    
    print(f"Split dataset: {len(train_images)} train, {len(val_images)} val")

def train_yolo_model(data_yaml, epochs, batch_size, img_size, output_dir):
    """
    Train YOLOv8 model
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Load pretrained YOLOv8n (nano - smallest, fastest)
    model = YOLO('yolov8n.pt')
    
    # Train
    results = model.train(
        data=str(data_yaml),
        epochs=epochs,
        batch=batch_size,
        imgsz=img_size,
        project=str(output_dir),
        name='custom_model',
        exist_ok=True
    )
    
    # Export best model
    best_model = output_dir / 'custom_model' / 'weights' / 'best.pt'
    print(f"Training complete! Best model: {best_model}")
    
    return best_model

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Train YOLO model')
    parser.add_argument('--data', required=True, help='Dataset path (raw folder)')
    parser.add_argument('--epochs', type=int, default=50)
    parser.add_argument('--batch', type=int, default=16)
    parser.add_argument('--img', type=int, default=640)
    parser.add_argument('--output', required=True)
    
    args = parser.parse_args()
    
    # Detect classes from labels
    labels_path = Path(args.data) / 'labels'
    classes = set()
    if labels_path.exists():
        for label_file in labels_path.glob('*.txt'):
            with open(label_file) as f:
                for line in f:
                    if line.strip():
                        class_id = int(line.split()[0])
                        classes.add(class_id)
    
    classes = sorted(list(classes))
    class_names = [f'Class_{i}' for i in classes]  # Default names, should be loaded from config
    
    # Create dataset structure
    dataset_path = Path(args.data).parent / 'yolo_dataset'
    yaml_path = create_yolo_dataset_structure(dataset_path, class_names)
    
    # Split dataset
    split_dataset(args.data, dataset_path)
    
    # Train
    train_yolo_model(yaml_path, args.epochs, args.batch, args.img, args.output)

