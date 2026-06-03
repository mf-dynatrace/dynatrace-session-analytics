#!/bin/bash
# Complete Merge Script - Downloads and applies remaining updates
set -e

echo "🔄 Downloading updated files from GitHub repository..."
echo ""

BASE_URL="https://raw.githubusercontent.com/smaff-dt/dynatrace-session-analytics-v2/main"

# Download App.tsx
echo "📥 Downloading App.tsx..."
curl -s "$BASE_URL/ui/App.tsx" > "/tmp/App.tsx"
if [ $? -eq 0 ]; then
    cp "/tmp/App.tsx" "ui/App.tsx"
    echo "✅ App.tsx updated"
else
    echo "❌ Failed to download App.tsx"
    exit 1
fi

# Download queries.ts
echo "📥 Downloading queries.ts..."
curl -s "$BASE_URL/ui/dql/queries.ts" > "/tmp/queries.ts"
if [ $? -eq 0 ]; then
    cp "/tmp/queries.ts" "ui/dql/queries.ts"
    echo "✅ queries.ts updated"
else
    echo "❌ Failed to download queries.ts"
    exit 1
fi

echo ""
echo "🎉 All files updated successfully!"
echo ""
echo "Next steps:"
echo "1. Review the changes in ui/App.tsx and ui/dql/queries.ts"
echo "2. Run: npm install (if not already done)"
echo "3. Run: npm run build"
echo "4. Run: npm run deploy"
echo ""
echo "New features enabled:"
echo "  • Segment filtering with compare mode (A vs B)"
echo "  • URL filtering (path/domain/full with operators)"
echo "  • Saved segments via App Settings 2.0"
echo "  • Enhanced DQL filter injection"
