import re
with open("client/src/core/game.backup.js", "r") as f:
    content = f.read()

# 1. Add this.manualAssets = new Set();
content = content.replace("this.lines = [];", "this.lines = [];\n    this.manualAssets = new Set();")

# 2. Modify spawnScoreText
spawn_score_search = """    // Remove after animation completes
    setTimeout(() => {
      if (scorePopup.parentNode) {
        scorePopup.parentNode.removeChild(scorePopup);
      }
    }, 1200);"""

spawn_score_replace = """    // Track as manual asset for pause/resume
    scorePopup._isManualAsset = true;
    this.manualAssets.add(scorePopup);

    // Remove after animation completes
    scorePopup._cleanupTimer = setTimeout(() => {
      if (scorePopup.parentNode) {
        scorePopup.parentNode.removeChild(scorePopup);
      }
      this.manualAssets.delete(scorePopup);
    }, 1200);"""
content = content.replace(spawn_score_search, spawn_score_replace)

# 3. Modify pause
pause_search = """      // Prevent asset cleanup while paused by clearing timers
      // Only target manual assets we created
      const assetElements = this.roadElement.querySelectorAll('div');
      assetElements.forEach(element => {
        if (element._isManualAsset && element._cleanupTimer) {
          clearTimeout(element._cleanupTimer);
          element._cleanupTimer = null;
        }
      });"""

pause_replace = """      // Prevent asset cleanup while paused by clearing timers
      // Only target manual assets we created
      this.manualAssets.forEach(element => {
        if (element._cleanupTimer) {
          clearTimeout(element._cleanupTimer);
          element._cleanupTimer = null;
        }
      });"""
content = content.replace(pause_search, pause_replace)

# 4. Modify resume
resume_search = """      // Restart asset cleanup timers when resuming
      // Only target manual assets we created
      const assetElements = this.roadElement.querySelectorAll('div');
      assetElements.forEach(element => {
        if (element._isManualAsset && !element._cleanupTimer) {
          element._cleanupTimer = setTimeout(() => {
            if (element.parentNode) {
              element.parentNode.removeChild(element);
            }
          }, 100); // Slightly longer delay after resume
        }
      });"""

resume_replace = """      // Restart asset cleanup timers when resuming
      // Only target manual assets we created
      this.manualAssets.forEach(element => {
        if (!element._cleanupTimer) {
          element._cleanupTimer = setTimeout(() => {
            if (element.parentNode) {
              element.parentNode.removeChild(element);
            }
            this.manualAssets.delete(element);
          }, 100); // Slightly longer delay after resume
        }
      });"""
content = content.replace(resume_search, resume_replace)

with open("client/src/core/game.backup.js", "w") as f:
    f.write(content)
