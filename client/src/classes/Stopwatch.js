/**
 * Stopwatch class - Manages lap timing and checkpoint detection
 * Based on the Outrun project's proven architecture
 */
export class Stopwatch {
  constructor() {
    this.reset();
  }

  /**
   * Reset the stopwatch
   */
  reset() {
    this.startTime = null;
    this.lapStartTime = null;
    this.currentLap = 0;
    this.lapTimes = [];
    this.bestLapTime = null;
    this.totalTime = 0;
    this.isRunning = false;
    this.checkpointsPassed = new Set();
    this.lastCheckpointTime = null;
  }

  /**
   * Start the stopwatch
   */
  start() {
    const now = Date.now();
    this.startTime = now;
    this.lapStartTime = now;
    this.isRunning = true;
    console.log('Stopwatch started');
  }

  /**
   * Stop the stopwatch
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.totalTime = Date.now() - this.startTime;
    console.log(`Stopwatch stopped. Total time: ${this.formatTime(this.totalTime)}`);
  }

  /**
   * Update the stopwatch (call each frame)
   */
  update() {
    if (!this.isRunning) return;
    
    this.totalTime = Date.now() - this.startTime;
  }

  /**
   * Record a checkpoint pass
   * @param {Object} checkpoint - The checkpoint segment
   * @returns {boolean} True if this is a new checkpoint
   */
  passCheckpoint(checkpoint) {
    if (!this.isRunning) return false;
    
    const checkpointId = `${checkpoint.index}_${this.currentLap}`;
    
    if (this.checkpointsPassed.has(checkpointId)) {
      return false; // Already passed this checkpoint in this lap
    }
    
    this.checkpointsPassed.add(checkpointId);
    this.lastCheckpointTime = Date.now();
    
    console.log(`Checkpoint ${checkpoint.index} passed in lap ${this.currentLap + 1}`);
    return true;
  }

  /**
   * Complete a lap
   * @returns {Object} Lap completion data
   */
  completeLap() {
    if (!this.isRunning) return null;
    
    const now = Date.now();
    const lapTime = now - this.lapStartTime;
    
    // Record lap time
    this.lapTimes.push(lapTime);
    
    // Update best lap time
    if (this.bestLapTime === null || lapTime < this.bestLapTime) {
      this.bestLapTime = lapTime;
    }
    
    // Prepare lap data
    const lapData = {
      lapNumber: this.currentLap + 1,
      lapTime: lapTime,
      totalTime: this.totalTime,
      isBestLap: lapTime === this.bestLapTime,
      formattedLapTime: this.formatTime(lapTime),
      formattedTotalTime: this.formatTime(this.totalTime)
    };
    
    // Move to next lap
    this.currentLap++;
    this.lapStartTime = now;
    
    // Clear checkpoints for new lap
    this.checkpointsPassed.clear();
    
    console.log(`Lap ${lapData.lapNumber} completed in ${lapData.formattedLapTime}${lapData.isBestLap ? ' (Best Lap!)' : ''}`);
    
    return lapData;
  }

  /**
   * Get current lap time
   * @returns {number} Current lap time in milliseconds
   */
  getCurrentLapTime() {
    if (!this.isRunning || !this.lapStartTime) return 0;
    return Date.now() - this.lapStartTime;
  }

  /**
   * Get total elapsed time
   * @returns {number} Total time in milliseconds
   */
  getTotalTime() {
    return this.totalTime;
  }

  /**
   * Get current lap number (0-based)
   * @returns {number} Current lap number
   */
  getCurrentLap() {
    return this.currentLap;
  }

  /**
   * Get best lap time
   * @returns {number|null} Best lap time in milliseconds
   */
  getBestLapTime() {
    return this.bestLapTime;
  }

  /**
   * Get all lap times
   * @returns {Array} Array of lap times in milliseconds
   */
  getLapTimes() {
    return [...this.lapTimes];
  }

  /**
   * Get last lap time
   * @returns {number|null} Last lap time in milliseconds
   */
  getLastLapTime() {
    return this.lapTimes.length > 0 ? this.lapTimes[this.lapTimes.length - 1] : null;
  }

  /**
   * Format time in MM:SS.mmm format
   * @param {number} timeMs - Time in milliseconds
   * @returns {string} Formatted time string
   */
  formatTime(timeMs) {
    if (timeMs === null || timeMs === undefined) return '--:--.---';
    
    const totalSeconds = Math.floor(timeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = timeMs % 1000;
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  /**
   * Get formatted current lap time
   * @returns {string} Formatted current lap time
   */
  getFormattedCurrentLapTime() {
    return this.formatTime(this.getCurrentLapTime());
  }

  /**
   * Get formatted total time
   * @returns {string} Formatted total time
   */
  getFormattedTotalTime() {
    return this.formatTime(this.totalTime);
  }

  /**
   * Get formatted best lap time
   * @returns {string} Formatted best lap time
   */
  getFormattedBestLapTime() {
    return this.formatTime(this.bestLapTime);
  }

  /**
   * Check if currently running
   * @returns {boolean} True if stopwatch is running
   */
  isActive() {
    return this.isRunning;
  }

  /**
   * Get race statistics
   * @returns {Object} Race statistics
   */
  getStats() {
    return {
      currentLap: this.currentLap,
      totalLaps: this.lapTimes.length,
      currentLapTime: this.getCurrentLapTime(),
      totalTime: this.totalTime,
      bestLapTime: this.bestLapTime,
      lastLapTime: this.getLastLapTime(),
      averageLapTime: this.lapTimes.length > 0 ? 
        this.lapTimes.reduce((sum, time) => sum + time, 0) / this.lapTimes.length : null,
      isRunning: this.isRunning,
      formatted: {
        currentLapTime: this.getFormattedCurrentLapTime(),
        totalTime: this.getFormattedTotalTime(),
        bestLapTime: this.getFormattedBestLapTime()
      }
    };
  }
}