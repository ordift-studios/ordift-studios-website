#!/bin/bash
export PATH="/Users/myli/.nvm/versions/node/v24.18.0/bin:$PATH"
cd "$(dirname "$0")"
exec npm run dev
