#!/bin/bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo "SCRIPT_DIR: $SCRIPT_DIR"
echo "CWD: $(pwd)"
cd "$SCRIPT_DIR/packages/ui"
echo "NEW CWD: $(pwd)"
exec pnpm dev
