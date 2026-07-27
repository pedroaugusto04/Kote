#!/bin/bash
# Update sitemap.xml lastmod field to current date during deployment

set -euo pipefail

SITEMAP_FILE="frontend/public/sitemap.xml"
TODAY=$(date +%Y-%m-%d)

if [ ! -f "$SITEMAP_FILE" ]; then
  echo "Error: sitemap.xml not found at $SITEMAP_FILE"
  exit 1
fi

# Update all lastmod fields to today's date
sed -i "s/<lastmod>.*<\/lastmod>/<lastmod>$TODAY<\/lastmod>/g" "$SITEMAP_FILE"

echo "Updated sitemap.xml lastmod to $TODAY"
