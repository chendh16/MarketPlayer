#!/bin/bash
# Add learning-trigger to crontab
cd /Users/zhengzefeng/.openclaw/workspace/MarketPlayer

# Get existing crontab
EXISTING=$(crontab -l 2>/dev/null)

# Check if learning-trigger already exists
if echo "$EXISTING" | grep -q "learning-trigger"; then
  echo "learning-trigger already in crontab"
  exit 0
fi

# Add new cron entry
NEW_CRON="$EXISTING
0 2 * * * cd /Users/zhengzefeng/.openclaw/workspace/MarketPlayer && node agents/harness/trigger-engine/learning-trigger.js >> logs/learning.log 2>&1"

echo "$NEW_CRON" | crontab -
echo "Added learning-trigger to crontab"
crontab -l | grep learning