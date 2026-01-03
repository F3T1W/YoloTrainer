import argparse
import os
import requests
import json
from pathlib import Path
import time

def download_reddit_images(subreddit, limit, class_name, output_dir):
    """
    Download images from Reddit subreddit
    """
    output_path = Path(output_dir) / class_name
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Reddit API endpoint (public, no auth needed for basic access)
    url = f"https://www.reddit.com/r/{subreddit}/hot.json"
    headers = {'User-Agent': 'YOLOTrainer/1.0'}
    
    downloaded = 0
    after = None
    
    print(f"Downloading images from r/{subreddit}...")
    
    while downloaded < limit:
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
                if downloaded >= limit:
                    break
                
                post_data = post['data']
                url_field = post_data.get('url_overridden_by_dest') or post_data.get('url')
                
                # Check if it's an image
                if url_field and any(url_field.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                    try:
                        img_response = requests.get(url_field, headers=headers, timeout=10)
                        img_response.raise_for_status()
                        
                        ext = Path(url_field).suffix or '.jpg'
                        filename = f"{post_data['id']}{ext}"
                        filepath = output_path / filename
                        
                        with open(filepath, 'wb') as f:
                            f.write(img_response.content)
                        
                        downloaded += 1
                        print(f"Downloaded {downloaded}/{limit}: {filename}", flush=True)
                        
                        time.sleep(0.5)  # Rate limiting
                    except Exception as e:
                        print(f"Error downloading {url_field}: {e}")
                        continue
            
            if not after:
                break
                
        except Exception as e:
            print(f"Error fetching from Reddit: {e}")
            break
    
    print(f"Download complete! {downloaded} images saved to {output_path}")
    return downloaded

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Download images from Reddit')
    parser.add_argument('--subreddit', required=True)
    parser.add_argument('--limit', type=int, default=100)
    parser.add_argument('--class', dest='class_name', required=True)
    parser.add_argument('--output', required=True)
    
    args = parser.parse_args()
    download_reddit_images(args.subreddit, args.limit, args.class_name, args.output)

