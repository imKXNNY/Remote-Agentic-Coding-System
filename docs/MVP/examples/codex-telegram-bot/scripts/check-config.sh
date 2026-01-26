#!/bin/bash
# Check if fixes are applied

echo "=== Checking Fixes ==="
echo ""

echo "1. Git repository in /workspace:"
if [ -d "/workspace/.git" ]; then
    echo "   ✅ /workspace/.git exists"
else
    echo "   ❌ /workspace/.git NOT FOUND"
fi
echo ""

echo "2. Config file exists:"
if [ -f "/root/.codex/config.toml" ]; then
    echo "   ✅ /root/.codex/config.toml exists"
    echo ""
    echo "3. Config contains skip_git_repo_check:"
    if grep -q "skip_git_repo_check" /root/.codex/config.toml; then
        echo "   ✅ skip_git_repo_check found"
        echo ""
        echo "   Full value:"
        grep "skip_git_repo_check" /root/.codex/config.toml | sed 's/^/   /'
    else
        echo "   ❌ skip_git_repo_check NOT FOUND in config"
    fi
    echo ""
    echo "4. Full config.toml content:"
    cat /root/.codex/config.toml | sed 's/^/   /'
else
    echo "   ❌ /root/.codex/config.toml NOT FOUND"
fi
echo ""

echo "=== End Check ==="
