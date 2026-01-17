import argparse
import os
import requests
import json
from pathlib import Path
import time

def download_reddit_images(subreddit, limit, class_name, output_dir, three_step_mode=False):
    """
    Download images from Reddit subreddit
    Also downloads additional 10% for testing into FOR_TESTS folder
    If three_step_mode is True, uses distribution: 10% test, 150, 350, rest (ideally 500)
    If three_step_mode is False, downloads all images to main folder (10% test, rest main)
    """
    output_path = Path(output_dir) / class_name
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Create FOR_TESTS folder inside class folder
    test_path = output_path / 'FOR_TESTS'
    test_path.mkdir(parents=True, exist_ok=True)
    
    # Calculate test images count (10% of limit)
    test_limit = int(limit * 0.1)
    
    if three_step_mode:
        # Fixed distribution: 10% for tests, then 150, 350, rest (ideally 500) for training
        count_15 = 150
        count_35 = 350
        count_50_ideal = 500
        # Total needed: test + 150 + 350 + 500 = 1000 (or less if limit is smaller)
        total_needed = test_limit + count_15 + count_35 + count_50_ideal
    else:
        # Normal mode: 10% test, 100% main (total 110% of limit)
        count_15 = 0
        count_35 = 0
        count_50_ideal = 0
        # Total needed: test (10%) + main (100%) = 110% of limit
        total_needed = test_limit + limit
    
    # Reddit API endpoint (public, no auth needed for basic access)
    url = f"https://www.reddit.com/r/{subreddit}/hot.json"
    headers = {'User-Agent': 'YOLOTrainer/1.0'}
    
    downloaded = 0
    test_downloaded = 0
    main_15_downloaded = 0
    main_35_downloaded = 0
    main_50_downloaded = 0
    after = None
    
    if three_step_mode:
        print(f"Downloading images from r/{subreddit}...")
        print(f"Distribution: {test_limit} test, {count_15} for 15%, {count_35} for 35%, rest for 50%")
    else:
        print(f"Downloading images from r/{subreddit}...")
        print(f"Distribution: {test_limit} test (10%), {limit} main (100%)")
    
    main_downloaded = 0
    
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
                        should_stop = False
                        
                        if test_downloaded < test_limit:
                            # First: test images (10%)
                            filepath = test_path / filename
                        elif three_step_mode:
                            # Three-step mode: distribute to 15%, 35%, 50%
                            if main_15_downloaded < count_15:
                                filepath = output_path / filename
                            elif main_35_downloaded < count_35:
                                filepath = output_path / filename
                            else:
                                filepath = output_path / filename
                        else:
                            # Normal mode: all remaining images to main folder (100% of limit)
                            # Check if we already have enough main images BEFORE downloading
                            if main_downloaded >= limit:
                                # Skip this image, we already have enough
                                continue
                            filepath = output_path / filename
                        
                        # Save the file
                        with open(filepath, 'wb') as f:
                            f.write(img_response.content)
                        
                        # Increment counters after saving file
                        if test_downloaded < test_limit:
                            test_downloaded += 1
                            downloaded += 1
                            print(f"Downloaded test image {test_downloaded}/{test_limit}: {filename}", flush=True)
                        elif three_step_mode:
                            # Three-step mode: increment appropriate counter
                            if main_15_downloaded < count_15:
                                main_15_downloaded += 1
                                downloaded += 1
                                print(f"Downloaded for 15%: {main_15_downloaded}/{count_15}: {filename}", flush=True)
                            elif main_35_downloaded < count_35:
                                main_35_downloaded += 1
                                downloaded += 1
                                print(f"Downloaded for 35%: {main_35_downloaded}/{count_35}: {filename}", flush=True)
                            else:
                                main_50_downloaded += 1
                                downloaded += 1
                                print(f"Downloaded for 50%: {main_50_downloaded}: {filename}", flush=True)
                                
                                if downloaded >= total_needed:
                                    should_stop = True
                        else:
                            # Normal mode: increment after saving
                            main_downloaded += 1
                            downloaded += 1
                            print(f"Downloaded main image {main_downloaded}/{limit}: {filename}", flush=True)
                            
                            # Check if we have enough main images
                            if main_downloaded >= limit:
                                should_stop = True
                        
                        time.sleep(0.5)  # Rate limiting
                        
                        # Check if we should stop after saving the file
                        if should_stop:
                            break
                    except Exception as e:
                        print(f"Error downloading {url_field}: {e}")
                        continue
            
            # Check if we should continue outer loop
            # If we already broke from inner loop, we should break from outer loop too
            if three_step_mode:
                if downloaded >= total_needed or not after:
                    break
            else:
                # Normal mode: stop when we have enough main images (test images already downloaded)
                # We already checked and broke in inner loop, so just verify here
                if main_downloaded >= limit or not after:
                    break
                
        except Exception as e:
            print(f"Error fetching from Reddit: {e}")
            break
    
    if three_step_mode:
        main_total = main_15_downloaded + main_35_downloaded + main_50_downloaded
        print(f"Download complete! {main_total} images saved to {output_path}")
        print(f"  - Folder 15: {main_15_downloaded}/{count_15}")
        print(f"  - Folder 35: {main_35_downloaded}/{count_35}")
        print(f"  - Folder 50: {main_50_downloaded} (ideal: {count_50_ideal})")
    else:
        main_total = main_downloaded
        print(f"Download complete! {main_total} images saved to {output_path}")
    print(f"Test images: {test_downloaded} images saved to {test_path}")
    return {'downloaded': main_total, 'test_downloaded': test_downloaded}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Download images from Reddit')
    parser.add_argument('--subreddit', required=True)
    parser.add_argument('--limit', type=int, default=100)
    parser.add_argument('--class', dest='class_name', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--three-step', action='store_true', help='Use three-step distribution (150, 350, 500)')
    
    args = parser.parse_args()
    download_reddit_images(args.subreddit, args.limit, args.class_name, args.output, args.three_step)

