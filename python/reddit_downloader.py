import argparse
import os
import requests
import json
from pathlib import Path
import time

def download_reddit_images(subreddit, limit, class_name, output_dir):
    """
    Download images from Reddit subreddit
    Also downloads additional 10% for testing into FOR_TESTS folder
    """
    output_path = Path(output_dir) / class_name
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Create FOR_TESTS folder
    test_path = Path(output_dir) / 'FOR_TESTS'
    test_path.mkdir(parents=True, exist_ok=True)
    
    # Fixed distribution: 10% (min 100) for tests, then 150, 350, rest (ideally 500) for training
    # Calculate test images count (10% of limit, but minimum 100)
    test_limit = max(100, int(limit * 0.1))
    
    # Fixed counts for training folders
    count_15 = 150
    count_35 = 350
    count_50_ideal = 500
    
    # Total needed: test + 150 + 350 + 500 = 1000 (or less if limit is smaller)
    total_needed = test_limit + count_15 + count_35 + count_50_ideal
    
    # Reddit API endpoint (public, no auth needed for basic access)
    url = f"https://www.reddit.com/r/{subreddit}/hot.json"
    headers = {'User-Agent': 'YOLOTrainer/1.0'}
    
    downloaded = 0
    test_downloaded = 0
    main_15_downloaded = 0
    main_35_downloaded = 0
    main_50_downloaded = 0
    after = None
    
    print(f"Downloading images from r/{subreddit}...")
    print(f"Distribution: {test_limit} test, {count_15} for 15%, {count_35} for 35%, rest for 50%")
    
    while True:
        params = {'limit': 100}
        if after:
            params['after'] = after
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            posts = data['data']['children']
            after = data['data'].get('after')
            
            for post in posts:
                post_data = post['data']
                url_field = post_data.get('url_overridden_by_dest') or post_data.get('url')
                
                # Check if it's an image
                if url_field and any(url_field.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                    try:
                        img_response = requests.get(url_field, headers=headers, timeout=10)
                        img_response.raise_for_status()
                        
                        ext = Path(url_field).suffix or '.jpg'
                        filename = f"{post_data['id']}{ext}"
                        
                        # Determine destination based on download stage
                        if test_downloaded < test_limit:
                            # First: test images (10% or min 100)
                            filepath = test_path / filename
                            test_downloaded += 1
                            downloaded += 1
                            print(f"Downloaded test image {test_downloaded}/{test_limit}: {filename}", flush=True)
                        elif main_15_downloaded < count_15:
                            # Second: 150 images for folder 15
                            filepath = output_path / filename
                            main_15_downloaded += 1
                            downloaded += 1
                            print(f"Downloaded for 15%: {main_15_downloaded}/{count_15}: {filename}", flush=True)
                        elif main_35_downloaded < count_35:
                            # Third: 350 images for folder 35
                            filepath = output_path / filename
                            main_35_downloaded += 1
                            downloaded += 1
                            print(f"Downloaded for 35%: {main_35_downloaded}/{count_35}: {filename}", flush=True)
                        else:
                            # Fourth: rest (ideally 500) for folder 50
                            filepath = output_path / filename
                            main_50_downloaded += 1
                            downloaded += 1
                            print(f"Downloaded for 50%: {main_50_downloaded}: {filename}", flush=True)
                            
                            # Stop if we have enough (test + 150 + 350 + 500 = 1000+)
                            if downloaded >= total_needed:
                                break
                        
                        with open(filepath, 'wb') as f:
                            f.write(img_response.content)
                        
                        time.sleep(0.5)  # Rate limiting
                    except Exception as e:
                        print(f"Error downloading {url_field}: {e}")
                        continue
            
            # Check if we should continue
            if downloaded >= total_needed or not after:
                break
                
        except Exception as e:
            print(f"Error fetching from Reddit: {e}")
            break
    
    main_total = main_15_downloaded + main_35_downloaded + main_50_downloaded
    print(f"Download complete! {main_total} images saved to {output_path}")
    print(f"  - Folder 15: {main_15_downloaded}/{count_15}")
    print(f"  - Folder 35: {main_35_downloaded}/{count_35}")
    print(f"  - Folder 50: {main_50_downloaded} (ideal: {count_50_ideal})")
    print(f"Test images: {test_downloaded} images saved to {test_path}")
    return {'downloaded': main_total, 'test_downloaded': test_downloaded}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Download images from Reddit')
    parser.add_argument('--subreddit', required=True)
    parser.add_argument('--limit', type=int, default=100)
    parser.add_argument('--class', dest='class_name', required=True)
    parser.add_argument('--output', required=True)
    
    args = parser.parse_args()
    download_reddit_images(args.subreddit, args.limit, args.class_name, args.output)

