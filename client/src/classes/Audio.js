import { createAudioEffectsChain, connectEffectsChain } from './AudioEffects.js';

export class Audio {
  constructor() {
    this.audioCtx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.files = {};
    this.menuSource = null;
    this.currentSong = null;
    this.currentSongIndex = 0;
    this.drivingPlaylist = [
      'audio/again.mp3',
      'audio/angel.mp3',
      'audio/arches.mp3',
      'audio/burnout.mp3',
      'audio/downshift.mp3',
      'audio/flutter.mp3',
      'audio/initiate.mp3',
      'audio/insight.mp3',
      'audio/overdrive.mp3',
      'audio/real.mp3',
      'audio/relieve.mp3',
      'audio/seperate.mp3',
      'audio/stretch.mp3',
      'audio/u.mp3',
      'audio/without.mp3'
    ];
    
    // Shuffled playlist for random playback
    this.shuffledPlaylist = [];
    this.shufflePlaylist();

    // Engine sound management
    this.engineSource = null;
    this.engineGain = null;
    this.isEngineRunning = false;

    // Flag to prevent automatic advancing during manual skips
    this.isManualChange = false;

    // Track song position for iPod-style rewind behavior
    this.songStartTime = 0;
    this.isPaused = false;
    this.pausedVolume = 0.15; // Store original music volume for pause ducking
    this.pausedEngineVolume = 0; // Store original engine volume for pause ducking

    // We'll initialize on first user interaction
    this.initialized = false;
  }

  async initializeAudio() {
    if (this.initialized) return;

    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.audioCtx.createGain();
      this.musicGain = this.audioCtx.createGain();
      this.sfxGain = this.audioCtx.createGain();
      this.engineGain = this.audioCtx.createGain();
      // Create master bus effects (compressor → makeup gain → limiter)
      const effects = createAudioEffectsChain(this.audioCtx);
      this.compressor = effects.compressor;
      this.makeupGain = effects.makeupGain;
      this.limiter = effects.limiter;

      // Connect inputs to master bus
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.engineGain.connect(this.masterGain);

      // Route master bus through effects to destination
      this.masterGain.connect(this.compressor);
      connectEffectsChain(effects, this.audioCtx.destination);

      this.masterGain.gain.setValueAtTime(1, this.audioCtx.currentTime);
      this.musicGain.gain.setValueAtTime(0.093, this.audioCtx.currentTime); // Lower music volume
      this.sfxGain.gain.setValueAtTime(1.67, this.audioCtx.currentTime); // Increase SFX volume
      this.engineGain.gain.setValueAtTime(0.2, this.audioCtx.currentTime); // Start engine silent

      this.initialized = true;
      console.log('Audio context initialized successfully');
      
      // Start playing menu music after initialization
      await this.loadSound('menu', 'audio/menu.mp3');
      await this.playMenuMusic();
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
    }
  }

  async loadSound(name, url) {
    if (!this.initialized) {
      await this.initializeAudio();
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
      this.files[name] = audioBuffer;
      console.log(`Loaded sound: ${name}`);
    } catch (error) {
      console.error(`Error loading sound ${name} from ${url}:`, error);
    }
  }

  shufflePlaylist() {
    // Create a copy of the original playlist
    this.shuffledPlaylist = [...this.drivingPlaylist];
    
    // Fisher-Yates shuffle algorithm
    for (let i = this.shuffledPlaylist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffledPlaylist[i], this.shuffledPlaylist[j]] = [this.shuffledPlaylist[j], this.shuffledPlaylist[i]];
    }
    
    console.log('Playlist shuffled:', this.shuffledPlaylist.map(song => song.split('/').pop().replace('.mp3', '')));
    this.currentSongIndex = 0; // Reset to start of shuffled playlist
  }

  async loadDrivingPlaylist() {
    console.log('Loading driving playlist...');
    for (let i = 0; i < this.drivingPlaylist.length; i++) {
      const songName = this.drivingPlaylist[i].split('/').pop().replace('.mp3', '');
      await this.loadSound(songName, this.drivingPlaylist[i]);
    }
    console.log('Driving playlist loaded');
  }

  async playMenuMusic() {
    if (this.files['menu']) {
      await this.playMusic('menu');
    }
  }

  async playDrivingMusic() {
    const currentSongPath = this.shuffledPlaylist[this.currentSongIndex];
    const currentSong = currentSongPath.split('/').pop().replace('.mp3', '');
    console.log(`Playing driving music (${this.currentSongIndex + 1}/${this.shuffledPlaylist.length}):`, currentSong);
    
    // Check if the song is loaded
    if (!this.files[currentSong]) {
      console.warn(`Driving song ${currentSong} not loaded yet, attempting to load...`);
      await this.loadSound(currentSong, currentSongPath);
    }
    
    await this.playMusic(currentSong, true, 2000, false); // Fade in over 2 seconds, don't loop
  }

  async nextSong() {
    // Set flag to indicate this is a manual change
    this.isManualChange = true;
    
    this.currentSongIndex++;
    
    // If we've reached the end of the shuffled playlist, reshuffle and start over
    if (this.currentSongIndex >= this.shuffledPlaylist.length) {
      console.log('End of playlist reached, reshuffling...');
      this.shufflePlaylist(); // This resets currentSongIndex to 0
    }
    
    const nextSongPath = this.shuffledPlaylist[this.currentSongIndex];
    const nextSong = nextSongPath.split('/').pop().replace('.mp3', '');
    console.log('Manual skip to next song:', nextSong);
    
    // For manual skips, play immediately without fade-in
    if (!this.files[nextSong]) {
      console.warn(`Driving song ${nextSong} not loaded yet, attempting to load...`);
      await this.loadSound(nextSong, nextSongPath);
    }
    
    await this.playMusic(nextSong, false, 0, false); // No fade-in for immediate skip
    
    // Reset flag after a short delay
    setTimeout(() => {
      this.isManualChange = false;
    }, 100);
  }

  async rewindOrPrevious() {
    // iPod-style behavior: if song has been playing for more than 3 seconds, restart it
    // Otherwise, go to previous song
    const currentTime = this.audioCtx.currentTime;
    const songPosition = currentTime - this.songStartTime;
    
    if (songPosition > 3.0) {
      // Restart current song
      console.log('Restarting current song (played for', songPosition.toFixed(1), 'seconds)');
      await this.restartCurrentSong();
    } else {
      // Go to previous song
      console.log('Going to previous song (only played for', songPosition.toFixed(1), 'seconds)');
      await this.previousSong();
    }
  }

  async restartCurrentSong() {
    // Set flag to indicate this is a manual change
    this.isManualChange = true;
    
    const currentSongPath = this.shuffledPlaylist[this.currentSongIndex];
    const currentSong = currentSongPath.split('/').pop().replace('.mp3', '');
    console.log('Restarting current song:', currentSong);
    
    // Restart the current song immediately without fade-in
    await this.playMusic(currentSong, false, 0, false);
    
    // Reset flag after a short delay
    setTimeout(() => {
      this.isManualChange = false;
    }, 100);
  }

  async previousSong() {
    // Set flag to indicate this is a manual change
    this.isManualChange = true;
    
    this.currentSongIndex--;
    
    // If we've gone before the start, go to the end of the current shuffle
    if (this.currentSongIndex < 0) {
      this.currentSongIndex = this.shuffledPlaylist.length - 1;
    }
    
    const prevSongPath = this.shuffledPlaylist[this.currentSongIndex];
    const prevSong = prevSongPath.split('/').pop().replace('.mp3', '');
    console.log('Manual skip to previous song:', prevSong);
    
    // For manual skips, play immediately without fade-in
    if (!this.files[prevSong]) {
      console.warn(`Driving song ${prevSong} not loaded yet, attempting to load...`);
      await this.loadSound(prevSong, prevSongPath);
    }
    
    await this.playMusic(prevSong, false, 0, false); // No fade-in for immediate skip
    
    // Reset flag after a short delay
    setTimeout(() => {
      this.isManualChange = false;
    }, 100);
  }

  async play(name, pitch = 1) {
    if (!this.initialized) {
      // Don't auto-initialize here - just silently return if not ready
      return;
    }

    if (!this.audioCtx || !this.files[name]) {
      // Silently return instead of console warning for better UX
      return;
    }

    // Resume audio context if suspended (browser autoplay policy)
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    try {
      const source = this.audioCtx.createBufferSource();
      source.buffer = this.files[name];
      source.playbackRate.value = pitch;
      source.connect(this.sfxGain);
      source.start();
      console.log(`Playing sound: ${name}`);
    } catch (error) {
      console.error(`Error playing sound ${name}:`, error);
    }
  }

  async playMusic(name, fadeIn = false, fadeInDuration = 1000, shouldLoop = true) {
    if (!this.initialized) {
      // Don't auto-initialize here - just silently return if not ready
      return;
    }

    if (!this.audioCtx || !this.files[name]) {
      console.warn(`Cannot play music ${name}: Audio context or music not initialized`);
      return;
    }

    this.stopMusic();

    try {
      this.currentSong = this.audioCtx.createBufferSource();
      this.currentSong.buffer = this.files[name];
      this.currentSong.loop = shouldLoop;
      this.currentSong.connect(this.musicGain);

      // For driving music (non-looping), set up auto-advance to next song
      if (!shouldLoop) {
        this.currentSong.onended = () => {
          // Only auto-advance if this isn't a manual change
          if (!this.isManualChange) {
            console.log('Song ended naturally, advancing to next track...');
            this.nextSong();
          } else {
            console.log('Song ended due to manual change, skipping auto-advance');
          }
        };
      }

      if (fadeIn && this.musicGain) {
        // Start at 0 volume for fade in
        const targetVolume = 0.135; // Use the standard music volume instead of current gain value
        this.musicGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
        this.currentSong.start();
        
        // Add a small delay to ensure the volume is set, then fade in
        setTimeout(() => {
          if (this.musicGain && this.currentSong) {
            this.musicGain.gain.linearRampToValueAtTime(
              targetVolume, 
              this.audioCtx.currentTime + (fadeInDuration / 1000)
            );
            console.log(`Fading in from 0 to ${targetVolume} over ${fadeInDuration}ms`);
          }
        }, 50);
      } else {
        this.currentSong.start();
      }
      
      // Track song start time for rewind behavior
      this.songStartTime = this.audioCtx.currentTime;
      
      console.log(`Playing music: ${name}${fadeIn ? ' (with fade-in)' : ''}${shouldLoop ? ' (looping)' : ' (single play)'}`);
    } catch (error) {
      console.error(`Error playing music ${name}:`, error);
    }
  }

  stopMusic() {
    if (this.currentSong) {
      try {
        // Clear the onended event handler to prevent it from firing
        this.currentSong.onended = null;
        this.currentSong.stop();
      } catch (error) {
        console.error('Error stopping music:', error);
      }
      this.currentSong = null;
    }
  }

  async fadeOutAndStop(duration = 1000) {
    if (!this.currentSong || !this.musicGain) {
      return;
    }

    return new Promise((resolve) => {
      // Create fade out effect
      const startVolume = this.musicGain.gain.value;
      console.log(`Starting fade out from volume ${startVolume} over ${duration}ms`);
      const fadeSteps = 60; // Smooth fade with 60 steps
      const stepTime = duration / fadeSteps;
      let currentStep = 0;

      const fadeInterval = setInterval(() => {
        currentStep++;
        const progress = currentStep / fadeSteps;
        const newVolume = startVolume * (1 - progress);
        
        if (this.musicGain) {
          this.musicGain.gain.setValueAtTime(newVolume, this.audioCtx.currentTime);
        }

        if (currentStep >= fadeSteps) {
          clearInterval(fadeInterval);
          this.stopMusic();
          // Restore standard music volume for next song
          if (this.musicGain) {
            this.musicGain.gain.setValueAtTime(0.135, this.audioCtx.currentTime);
            console.log('Fade out complete, volume restored to 0.135');
          }
          resolve();
        }
      }, stepTime);
    });
  }

  async startEngine() {
    console.log('startEngine called - initialized:', this.initialized, 'isEngineRunning:', this.isEngineRunning, 'engine file loaded:', !!this.files['engine']);
    
    if (!this.initialized) {
      console.warn('Audio not initialized, initializing now...');
      await this.initializeAudio();
    }
    
    // Resume audio context if suspended (browser autoplay policy)
    if (this.audioCtx.state === 'suspended') {
      console.log('Audio context suspended, resuming...');
      await this.audioCtx.resume();
      console.log('Audio context resumed');
    }
    
    if (this.isEngineRunning) {
      console.warn('Engine already running');
      return;
    }
    
    if (!this.files['engine']) {
      console.warn('Engine file not loaded, attempting to load...');
      await this.loadSound('engine', 'audio/engine.wav');
      // Don't retry, just continue - the file is now loaded
    }

    try {
      this.engineSource = this.audioCtx.createBufferSource();
      this.engineSource.buffer = this.files['engine'];
      this.engineSource.loop = true;
      
      // Create a low-pass filter for more realistic engine sound
      this.engineFilter = this.audioCtx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setValueAtTime(800, this.audioCtx.currentTime); // Start with deeper sound
      this.engineFilter.Q.setValueAtTime(0.7, this.audioCtx.currentTime); // Slight resonance
      
      // Connect: source -> filter -> gain -> master
      this.engineSource.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      
      // Set initial volume to be more subtle
      this.engineGain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
      
      this.engineSource.start();
      this.isEngineRunning = true;
      console.log('Engine started successfully with filtering - duration:', this.files['engine'].duration, 'seconds');
    } catch (error) {
      console.error('Error starting engine:', error);
    }
  }

  stopEngine() {
    if (this.engineSource && this.isEngineRunning) {
      try {
        this.engineSource.stop();
      } catch (error) {
        console.error('Error stopping engine:', error);
      }
      this.engineSource = null;
      this.engineFilter = null; // Clean up filter reference
      this.isEngineRunning = false;
      this.engineGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
      console.log('Engine stopped');
    }
  }

  updateEngine(speed, isBoosting = false) {
    if (!this.initialized || !this.isEngineRunning || !this.engineSource || !this.engineGain) {
      if (speed > 0) { // Only log when there's actual speed
        console.log('updateEngine failed - initialized:', this.initialized, 'isEngineRunning:', this.isEngineRunning, 'engineSource:', !!this.engineSource, 'engineGain:', !!this.engineGain, 'speed:', speed);
      }
      return;
    }

    try {
      // Normalize speed (0-200 typical range) to 0-1
      const normalizedSpeed = Math.min(1, speed / 200);
      
      // More realistic volume curve - idle engines are quiet, loud at mid-range, then level off
      let volume;
      if (speed <= 0) {
        volume = 0.08; // Very quiet idle
      } else if (normalizedSpeed < 0.3) {
        // Low speed - gradual increase
        volume = 0.08 + (normalizedSpeed * 0.4); // 0.08 to 0.2
      } else if (normalizedSpeed < 0.7) {
        // Mid speed - more aggressive increase
        volume = 0.2 + ((normalizedSpeed - 0.3) * 0.5); // 0.2 to 0.4
      } else {
        // High speed - levels off
        volume = 0.4 + ((normalizedSpeed - 0.7) * 0.2); // 0.4 to 0.46
      }
      
      // BOOST MODIFICATIONS - Make it much more aggressive!
      if (isBoosting) {
        // Boost multiplies volume significantly
        volume *= 1.8; // 80% louder during boost
        volume = Math.min(0.9, volume); // Cap at 90% to prevent distortion
        
        // Add aggressive random variation during boost (±15%)
        const boostVariation = 1 + (Math.random() - 0.5) * 0.3;
        volume *= boostVariation;
      } else {
        // Add subtle random variation (±5%) for normal driving
        const variation = 1 + (Math.random() - 0.5) * 0.1;
        volume *= variation;
      }
      
      this.engineGain.gain.setValueAtTime(volume, this.audioCtx.currentTime);

      // More realistic pitch curve - engines don't scale linearly
      let pitch;
      if (normalizedSpeed < 0.2) {
        // Idle to low RPM
        pitch = 0.7 + (normalizedSpeed * 0.5); // 0.7 to 0.8
      } else if (normalizedSpeed < 0.8) {
        // Most of the RPM range
        pitch = 0.8 + ((normalizedSpeed - 0.2) * 1.0); // 0.8 to 1.4
      } else {
        // High RPM - less dramatic increase
        pitch = 1.4 + ((normalizedSpeed - 0.8) * 0.4); // 1.4 to 1.48
      }
      
      // BOOST PITCH MODIFICATIONS - Make it sound more aggressive
      if (isBoosting) {
        // During boost, increase pitch more dramatically
        pitch *= 1.15; // 15% higher pitch
        pitch = Math.min(2.2, pitch); // Cap to prevent extreme distortion
        
        // Add more aggressive pitch variation during boost (±8%)
        const boostPitchVariation = 1 + (Math.random() - 0.5) * 0.16;
        pitch *= boostPitchVariation;
      } else {
        // Add slight random pitch variation (±2%) for normal driving
        const pitchVariation = 1 + (Math.random() - 0.5) * 0.04;
        pitch *= pitchVariation;
      }
      
      this.engineSource.playbackRate.setValueAtTime(pitch, this.audioCtx.currentTime);
      
      // Update filter frequency for more realistic engine character
      if (this.engineFilter) {
        // Higher speeds = higher frequency cutoff (brighter sound)
        let filterFreq = 600 + (normalizedSpeed * 1200); // 600Hz to 1800Hz
        
        // BOOST FILTER MODIFICATIONS - Open up the filter for brighter, more aggressive sound
        if (isBoosting) {
          filterFreq *= 1.4; // 40% higher frequency cutoff during boost
          filterFreq = Math.min(3000, filterFreq); // Cap at 3000Hz
          
          // Increase filter resonance during boost for more aggressive character
          this.engineFilter.Q.setValueAtTime(1.2, this.audioCtx.currentTime); // Higher Q for boost
        } else {
          // Normal driving has standard resonance
          this.engineFilter.Q.setValueAtTime(0.7, this.audioCtx.currentTime); // Standard Q
        }
        
        this.engineFilter.frequency.setValueAtTime(filterFreq, this.audioCtx.currentTime);
      }
      
      // Log occasionally to debug (including boost state)
      if (Math.random() < 0.01) { // Log 1% of the time to avoid spam
        console.log('Engine update - speed:', speed.toFixed(1), 'boost:', isBoosting, 'volume:', volume.toFixed(3), 'pitch:', pitch.toFixed(3), 'filter:', this.engineFilter ? (this.engineFilter.frequency.value).toFixed(0) + 'Hz' : 'none');
      }
    } catch (error) {
      console.error('Error updating engine:', error);
    }
  }

  // Debug method to test engine sound manually
  testEngine() {
    console.log('Testing engine sound...');
    if (!this.isEngineRunning) {
      this.startEngine();
      setTimeout(() => {
        this.updateEngine(50); // Test with medium speed
      }, 1000);
    } else {
      console.log('Engine already running, updating to test speed');
      this.updateEngine(100);
    }
  }

  pauseWithVolumeduck() {
    if (!this.isPaused && this.musicGain) {
      this.isPaused = true;
      this.pausedVolume = this.musicGain.gain.value; // Store current music volume
      
      // Duck music to 50% volume during pause
      this.musicGain.gain.setValueAtTime(this.pausedVolume * 0.5, this.audioCtx.currentTime);
      
      // Also duck engine sound if it's running
      if (this.isEngineRunning && this.engineGain) {
        this.pausedEngineVolume = this.engineGain.gain.value; // Store current engine volume
        this.engineGain.gain.setValueAtTime(this.pausedEngineVolume * 0.3, this.audioCtx.currentTime); // Duck engine to 30%
      }
      
      console.log('Music and engine ducked during pause (music: 50%, engine: 30%)');
    }
  }

  resumeFromVolumeDuck() {
    if (this.isPaused && this.musicGain) {
      this.isPaused = false;
      
      // Restore original music volume
      this.musicGain.gain.setValueAtTime(this.pausedVolume, this.audioCtx.currentTime);
      
      // Restore engine volume if it was ducked
      if (this.isEngineRunning && this.engineGain && this.pausedEngineVolume !== undefined) {
        this.engineGain.gain.setValueAtTime(this.pausedEngineVolume, this.audioCtx.currentTime);
      }
      
      console.log('Music and engine volume restored from pause');
    }
  }

  setVolume(value) {
    if (this.masterGain) {
      this.masterGain.gain.value = value;
    }
  }
}

export default Audio;
