#!/usr/bin/env python3
"""
MAW Protocol Script - Deterministic Knowledge Base Management

A lean, deterministic workflow for crawling websites into searchable knowledge bases.
Designed for AI agent usage with automatic update checking.

Usage:
    python scripts/maw-protocol.py --add <name> <url> [--depth N]
    python scripts/maw-protocol.py --crawl <name> [--force]
    python scripts/maw-protocol.py --crawl-all [--force]
    python scripts/maw-protocol.py --status
    python scripts/maw-protocol.py --list
"""

import argparse
import hashlib
import json
import logging
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    import requests
    # Disable SSL warnings for environments with cert issues
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
except ImportError:
    print("ERROR: 'requests' library not installed.")
    print("Run: pip install requests")
    sys.exit(1)

# ============================================================================
# Configuration
# ============================================================================

PROJECT_ROOT = Path(__file__).parent.parent
CONFIG_PATH = PROJECT_ROOT / "maw-knowledge.json"
KNOWLEDGE_BASES_DIR = PROJECT_ROOT / "knowledge-bases"

# Update check settings
UPDATE_CHECK_TIMEOUT = 10  # seconds
UPDATE_CHECK_RETRIES = 3
UPDATE_CHECK_DELAY = 2  # seconds between retries

# MAW crawl settings
DEFAULT_DEPTH = 1
DEFAULT_MAX_PAGES = 150
DEFAULT_CONCURRENCY = 10

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


# ============================================================================
# Config Management
# ============================================================================

def load_config() -> dict:
    """Load configuration from maw-knowledge.json."""
    if not CONFIG_PATH.exists():
        logger.error(f"Config file not found: {CONFIG_PATH}")
        logger.info("Run '--add <name> <url>' to create initial config")
        sys.exit(1)
    
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in config file: {e}")
        sys.exit(1)


def save_config(config: dict) -> None:
    """Save configuration to maw-knowledge.json."""
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    logger.debug(f"Config saved to {CONFIG_PATH}")


def add_source(name: str, url: str, depth: int = DEFAULT_DEPTH) -> dict:
    """
    Add a new knowledge base source to config.
    
    Args:
        name: Internal identifier for the knowledge base
        url: URL to crawl
        depth: Crawl depth (default: 1)
    
    Returns:
        The source dict that was added
    """
    config = load_config()
    
    if name in config["knowledge_bases"]:
        logger.warning(f"Knowledge base '{name}' already exists. Overwriting.")
    
    source = {
        "url": url,
        "depth": depth,
        "max_pages": DEFAULT_MAX_PAGES,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "last_crawled": None,
        "metadata": {
            "etag": None,
            "last_modified": None,
            "content_hash": None
        },
        "status": "pending"
    }
    
    config["knowledge_bases"][name] = source
    save_config(config)
    logger.info(f"Added knowledge base '{name}' -> {url}")
    return source


def get_source(name: str) -> Optional[dict]:
    """
    Get a knowledge base source by name.
    
    Args:
        name: Internal identifier
    
    Returns:
        Source dict or None if not found
    """
    config = load_config()
    return config["knowledge_bases"].get(name)


def list_sources() -> dict:
    """List all knowledge base sources."""
    config = load_config()
    return config["knowledge_bases"]


# ============================================================================
# Update Checker
# ============================================================================

def fetch_with_retry(url: str, attempts: int = UPDATE_CHECK_RETRIES) -> requests.Response:
    """
    Fetch URL headers with retry logic.
    
    Args:
        url: URL to fetch
        attempts: Number of retry attempts
    
    Returns:
        requests.Response object
    
    Raises:
        requests.RequestException: If all attempts fail
    """
    last_exception = None
    
    for i in range(attempts):
        try:
            response = requests.head(
                url,
                timeout=UPDATE_CHECK_TIMEOUT,
                allow_redirects=True,
                verify=False  # Disable SSL verification for Windows compatibility
            )
            return response
        except requests.RequestException as e:
            last_exception = e
            logger.warning(f"Attempt {i+1}/{attempts} failed for {url}: {e}")
            if i < attempts - 1:
                time.sleep(UPDATE_CHECK_DELAY)
    
    raise last_exception


def compute_content_hash(url: str) -> str:
    """
    Compute SHA256 hash of page content as fallback update check.
    
    Args:
        url: URL to hash
    
    Returns:
        Hex digest of SHA256 hash
    """
    try:
        response = requests.get(url, timeout=UPDATE_CHECK_TIMEOUT, verify=False)
        response.raise_for_status()
        content_hash = hashlib.sha256(response.content).hexdigest()
        return content_hash
    except requests.RequestException as e:
        logger.warning(f"Failed to fetch content for hash: {e}")
        return ""


def check_update(url: str, stored_meta: dict) -> tuple[bool, dict]:
    """
    Check if a URL has been updated since last crawl.
    
    Uses ETag -> Last-Modified -> Content Hash fallback strategy.
    
    Args:
        url: URL to check
        stored_meta: Previously stored metadata dict
    
    Returns:
        Tuple of (has_update, new_meta_dict)
    """
    logger.debug(f"Checking for updates: {url}")
    
    try:
        response = fetch_with_retry(url)
        new_meta = {
            "etag": response.headers.get('ETag'),
            "last_modified": response.headers.get('Last-Modified'),
            "content_hash": None
        }
        
        # Check ETag (most reliable)
        stored_etag = stored_meta.get("etag")
        if stored_etag and new_meta["etag"]:
            has_update = stored_etag != new_meta["etag"]
            logger.debug(f"ETag check: {'changed' if has_update else 'unchanged'}")
            return has_update, new_meta
        
        # Check Last-Modified
        stored_lm = stored_meta.get("last_modified")
        if stored_lm and new_meta["last_modified"]:
            has_update = stored_lm != new_meta["last_modified"]
            logger.debug(f"Last-Modified check: {'changed' if has_update else 'unchanged'}")
            return has_update, new_meta
        
        # Fallback to content hash
        logger.debug("No ETag or Last-Modified, using content hash")
        new_meta["content_hash"] = compute_content_hash(url)
        stored_hash = stored_meta.get("content_hash")
        
        if stored_hash:
            has_update = stored_hash != new_meta["content_hash"]
            logger.debug(f"Content hash check: {'changed' if has_update else 'unchanged'}")
            return has_update, new_meta
        
        # First crawl - always update
        logger.debug("First crawl (no stored metadata)")
        return True, new_meta
        
    except requests.RequestException as e:
        logger.error(f"Update check failed: {e}")
        # On error, assume no update to avoid unnecessary crawls
        return False, stored_meta


# ============================================================================
# MAW Crawler
# ============================================================================


def run_maw_crawl(name: str, source: dict, force: bool = False) -> bool:
    """
    Run MAW crawl for a knowledge base.
    
    Args:
        name: Knowledge base name
        source: Source dict from config
        force: Force re-crawl even if no updates
    
    Returns:
        True if crawl successful, False otherwise
    """
    url = source["url"]
    # MAW creates a .mv2 file, not a directory
    output_path = KNOWLEDGE_BASES_DIR / f"{name}.mv2"
    depth = source.get("depth", DEFAULT_DEPTH)
    max_pages = source.get("max_pages", DEFAULT_MAX_PAGES)
    
    # Check for updates
    if not force:
        has_update, new_meta = check_update(url, source.get("metadata", {}))
        if not has_update:
            logger.info(f"✓ No updates detected for '{name}'. Skipping crawl.")
            logger.info("  Use --force to re-crawl anyway.")
            return False
        else:
            logger.info(f"Update detected for '{name}'. Crawling...")
            # Update metadata
            config = load_config()
            config["knowledge_bases"][name]["metadata"] = new_meta
            save_config(config)
    
    # Ensure parent directory exists
    KNOWLEDGE_BASES_DIR.mkdir(parents=True, exist_ok=True)
    
    # Build MAW command
    # Using official @memvid/maw package
    # Note: MAW creates a .mv2 file (Mnemoria storage format)
    cmd = (
        f'npx @memvid/maw "{url}" '
        f'--output "{output_path}" '
        f'--depth {depth} '
        f'--max-pages {max_pages} '
        f'--concurrency {DEFAULT_CONCURRENCY}'
    )
    
    logger.info(f"Crawling: {url}")
    logger.debug(f"Command: {cmd}")
    logger.debug(f"Output: {output_path}")
    
    try:
        # Run MAW crawl
        # Use encoding='utf-8' for Windows compatibility with Unicode output
        result = subprocess.run(
            cmd,
            shell=True,  # Required for npx on Windows
            capture_output=True,
            text=True,
            timeout=600,  # 10 minute timeout
            encoding='utf-8',  # Force UTF-8 for Windows
            errors='replace'  # Replace undecodable chars
        )
        
        # Log output
        if result.stdout:
            logger.info(result.stdout)
        if result.stderr:
            logger.debug(result.stderr)
        
        if result.returncode != 0:
            logger.error(f"MAW crawl failed with code {result.returncode}")
            if "Access is denied" in result.stdout or "Access is denied" in result.stderr:
                logger.error("Permission error. Try running as Administrator or check folder permissions.")
            return False
        
        # Verify output file was created
        if not output_path.exists():
            logger.error(f"Output file not created: {output_path}")
            return False
        
        # Update config with crawl success
        config = load_config()
        config["knowledge_bases"][name]["last_crawled"] = datetime.now().isoformat()
        config["knowledge_bases"][name]["updated_at"] = datetime.now().isoformat()
        config["knowledge_bases"][name]["status"] = "ready"
        config["knowledge_bases"][name]["output_path"] = str(output_path)
        save_config(config)
        
        logger.info(f"✓ Crawl complete for '{name}'")
        logger.info(f"  Output: {output_path}")
        logger.info(f"  Size: {output_path.stat().st_size / 1024:.1f} KB")
        return True
        
    except subprocess.TimeoutExpired:
        logger.error(f"Crawl timed out after 10 minutes")
        return False
    except Exception as e:
        logger.error(f"Crawl failed: {e}")
        return False


# ============================================================================
# CLI Commands
# ============================================================================

def cmd_add(args):
    """Handle --add command."""
    name, url = args.add
    add_source(name, url, args.depth)
    logger.info(f"Ready to crawl. Run: --crawl {name}")


def cmd_crawl(args):
    """Handle --crawl command."""
    source = get_source(args.crawl)
    if not source:
        logger.error(f"Knowledge base '{args.crawl}' not found.")
        logger.info("Run --list to see available knowledge bases.")
        sys.exit(1)
    
    success = run_maw_crawl(args.crawl, source, force=args.force)
    sys.exit(0 if success else 1)


def cmd_crawl_all(args):
    """Handle --crawl-all command."""
    sources = list_sources()
    
    if not sources:
        logger.info("No knowledge bases configured.")
        logger.info("Run --add <name> <url> to add one.")
        return
    
    success_count = 0
    for name, source in sources.items():
        logger.info(f"\n{'='*60}")
        logger.info(f"Processing: {name}")
        logger.info(f"{'='*60}")
        
        if run_maw_crawl(name, source, force=args.force):
            success_count += 1
        time.sleep(1)  # Small delay between crawls
    
    logger.info(f"\n{'='*60}")
    logger.info(f"Crawl complete: {success_count}/{len(sources)} successful")
    logger.info(f"{'='*60}")


def cmd_status(args):
    """Handle --status command."""
    sources = list_sources()
    
    if not sources:
        logger.info("No knowledge bases configured.")
        return
    
    print("\n" + "="*70)
    print(f"{'Name':<20} {'Status':<10} {'Last Crawled':<25} {'URL':<30}")
    print("="*70)
    
    for name, source in sources.items():
        status = source.get("status", "unknown")
        last_crawled = source.get("last_crawled", "Never")[:19] if source.get("last_crawled") else "Never"
        url = source.get("url", "")[:30]
        print(f"{name:<20} {status:<10} {last_crawled:<25} {url:<30}")
    
    print("="*70 + "\n")


def cmd_list(args):
    """Handle --list command."""
    sources = list_sources()
    
    if not sources:
        logger.info("No knowledge bases configured.")
        return
    
    print("\nConfigured Knowledge Bases:\n")
    for name, source in sources.items():
        print(f"  {name}")
        print(f"    URL: {source['url']}")
        print(f"    Depth: {source.get('depth', DEFAULT_DEPTH)}")
        print(f"    Status: {source.get('status', 'unknown')}")
        if source.get('last_crawled'):
            print(f"    Last Crawled: {source['last_crawled'][:19]}")
        print()


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="MAW Protocol - Deterministic Knowledge Base Management",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --add react https://react.dev
  %(prog)s --crawl react
  %(prog)s --crawl react --force
  %(prog)s --crawl-all
  %(prog)s --status
  %(prog)s --list
        """
    )
    
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose/debug logging'
    )
    
    # Commands
    parser.add_argument(
        '--add',
        nargs=2,
        metavar=('NAME', 'URL'),
        help='Add a new knowledge base source'
    )
    parser.add_argument(
        '--depth',
        type=int,
        default=DEFAULT_DEPTH,
        help=f'Crawl depth (default: {DEFAULT_DEPTH})'
    )
    parser.add_argument(
        '--crawl',
        metavar='NAME',
        help='Crawl a specific knowledge base'
    )
    parser.add_argument(
        '--crawl-all',
        action='store_true',
        help='Crawl all configured knowledge bases'
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='Force re-crawl even if no updates detected'
    )
    parser.add_argument(
        '--status',
        action='store_true',
        help='Show status of all knowledge bases'
    )
    parser.add_argument(
        '--list',
        action='store_true',
        help='List all configured knowledge bases'
    )
    
    args = parser.parse_args()
    
    # Set verbose logging
    if args.verbose:
        logger.setLevel(logging.DEBUG)
    
    # Route to command handler
    if args.add:
        cmd_add(args)
    elif args.crawl:
        cmd_crawl(args)
    elif args.crawl_all:
        cmd_crawl_all(args)
    elif args.status:
        cmd_status(args)
    elif args.list:
        cmd_list(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
