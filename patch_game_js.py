import re
with open("client/src/core/game.js", "r") as f:
    content = f.read()

# game.js extends GameBackup. Does it override pause/resume or spawnScoreText?
# It does NOT override pause, resume, or spawnScoreText.
# But we need to make sure we don't have multiple manualAssets.
# Let's verify what game.js has.
