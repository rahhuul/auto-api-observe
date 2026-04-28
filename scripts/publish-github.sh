#!/usr/bin/env bash
# Publishes @rahhuul/auto-api-observe to GitHub Packages
# Usage: bash scripts/publish-github.sh <GITHUB_TOKEN>
set -e

TOKEN=${1:?Usage: publish-github.sh <GITHUB_TOKEN>}

# Swap to github package.json
cp package.json package.npm.json
cp package.github.json package.json

# Auth + publish
npm config set //npm.pkg.github.com/:_authToken "$TOKEN"
npm publish --registry https://npm.pkg.github.com

# Restore original package.json
cp package.npm.json package.json
rm package.npm.json

echo "✓ Published @rahhuul/auto-api-observe to GitHub Packages"
