import argparse
import os
import sys
import cv2
from ultralytics import YOLO

def predict(model_path, image_path, conf_thres=0.25):
    try:
        # Load the model
        model = YOLO(model_path)
        
        # Run inference
        results = model(image_path, conf=conf_thres)
        
        # Plot results
        res_plotted = results[0].plot()
        
        # Save the result
        directory, filename = os.path.split(image_path)
        name, ext = os.path.splitext(filename)
        
        # Create "detected" subdirectory
        output_dir = os.path.join(directory, 'detected')
        os.makedirs(output_dir, exist_ok=True)
        
        output_filename = f"{name}_pred{ext}"
        output_path = os.path.join(output_dir, output_filename)
        
        cv2.imwrite(output_path, res_plotted)
        
        # Print output path to stdout
        print(f"OUTPUT_PATH:{output_path}")
        
        # Print detections
        detections = []
        if len(results[0].boxes) > 0:
            for box in results[0].boxes:
                # Get normalized coordinates (xywh)
                # xywhn returns [x_center, y_center, width, height] normalized
                x_c, y_c, w, h = box.xywhn[0].tolist()
                
                cls = int(box.cls[0])
                conf = float(box.conf[0])
                name = results[0].names[cls]
                
                detections.append({
                    "class_id": cls,
                    "class_name": name,
                    "confidence": conf,
                    "x_center": x_c,
                    "y_center": y_c,
                    "width": w,
                    "height": h
                })
                
                print(f"Detected: {name} (conf: {conf:.2f})")
        else:
             print("No detections found.")

        # Print JSON output for application parsing
        import json
        print(f"JSON_OUTPUT:{json.dumps(detections)}")
            
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Path to .pt model file")
    parser.add_argument("--source", required=True, help="Path to source image")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    args = parser.parse_args()
    
    predict(args.model, args.source, args.conf)
