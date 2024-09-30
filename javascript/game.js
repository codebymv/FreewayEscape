{/* <script id="rendered-js"> */}
// ------------------------------------------------------------
// assets
// ------------------------------------------------------------



const ASSETS = {
  COLOR: {
    TAR: ["#8A00FF", "#0000FF"],  // Deep purple and electric blue
    RUMBLE: ["#FF007F", "#FFD700"],  // Neon pink and vibrant gold
    GRASS: ["#00FFA3", "#00FFFF"],  // Vibrant teal and bright cyan
  },
  

  IMAGE: {
    TREE: {
      src: "images/tree.png",
      width: 132,
      height: 192,
    },

    HERO: {
      src: "images/hero.png",
      width: 110,
      height: 56,
    },

    CAR: {
      src: "images/car04.png",
      width: 50,
      height: 36,
    },

    FINISH: {
      src: "images/finish.png",
      width: 339,
      height: 180,
      offset: -0.5,
    },

    SKY: [
      "images/cloud.jpg",
      "images/cloud_2.jpg",  // New sky asset
      "images/cloud_3.jpg",  // New sky asset

      // Add more sky assets here for future progression
    ],
  },

  AUDIO: {
    menu: 'audio/menu.mp3',
    boost_ready: 'audio/boost_ready.mp3',
    boost_empty: 'audio/boost_empty.mp3',
    engine: "audio/engine.wav",
    honk: "audio/honk.mp3",
    beep: "https://s3-us-west-2.amazonaws.com/s.cdpn.io/155629/beep.wav",
  },
};

// ------------------------------------------------------------
// helper functions
// ------------------------------------------------------------

Number.prototype.pad = function (numZeros, char = 0) {
  let n = Math.abs(this);
  let zeros = Math.max(0, numZeros - Math.floor(n).toString().length);
  let zeroString = Math.pow(10, zeros)
    .toString()
    .substr(1)
    .replace(0, char);
  return zeroString + n;
};

Number.prototype.clamp = function (min, max) {
  return Math.max(min, Math.min(this, max));
};

const timestamp = (_) => new Date().getTime();
const accelerate = (v, accel, dt) => v + accel * dt;
const isCollide = (x1, w1, x2, w2) => (x1 - x2) ** 2 <= (w2 + w1) ** 2;

function getRand(min, max) {
  return (Math.random() * (max - min) + min) | 0;
}

function randomProperty(obj) {
  let keys = Object.keys(obj);
  return obj[keys[(keys.length * Math.random()) << 0]];
}

function drawQuad(element, layer, color, x1, y1, w1, x2, y2, w2) {
  element.style.zIndex = layer;
  element.style.background = color;
  element.style.top = y2 + `px`;
  element.style.left = x1 - w1 / 2 - w1 + `px`;
  element.style.width = w1 * 3 + `px`;
  element.style.height = y1 - y2 + `px`;

  let leftOffset = w1 + x2 - x1 + Math.abs(w2 / 2 - w1 / 2);
  element.style.clipPath = `polygon(${leftOffset}px 0, ${
    leftOffset + w2
  }px 0, 66.66% 100%, 33.33% 100%)`;
}

const KEYS = {};
const keyUpdate = (e) => {
  switch (e.code) {
    case 'ArrowUp':
    case 'KeyW':
      KEYS['ArrowUp'] = e.type === 'keydown';
      break;
    case 'ArrowDown':
    case 'KeyS':
      KEYS['ArrowDown'] = e.type === 'keydown';
      break;
    case 'ArrowLeft':
    case 'KeyA':
      KEYS['ArrowLeft'] = e.type === 'keydown';
      break;
    case 'ArrowRight':
    case 'KeyD':
      KEYS['ArrowRight'] = e.type === 'keydown';
      break;
    default:
      KEYS[e.code] = e.type === 'keydown';
      break;
  }
  e.preventDefault();
};

addEventListener('keydown', keyUpdate);
addEventListener('keyup', keyUpdate);


function sleep(ms) {
  return new Promise(function (resolve, reject) {
    setTimeout((_) => resolve(), ms);
  });
}

function updateSky() {
  if (!isFirstGame && shouldUpdateSkyNextGame) {
    currentSkyIndex = (currentSkyIndex + 1) % ASSETS.IMAGE.SKY.length;
    cloud.style.backgroundImage = `url(${ASSETS.IMAGE.SKY[currentSkyIndex]})`;
    shouldUpdateSkyNextGame = false;
  }
}


// ------------------------------------------------------------
// objects
// ------------------------------------------------------------

class Line {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.z = 0;

    this.X = 0;
    this.Y = 0;
    this.W = 0;

    this.curve = 0;
    this.scale = 0;

    this.elements = [];
    this.special = null;
  }

  project(camX, camY, camZ) {
  this.scale = camD / (this.z - camZ);
  this.X = (1 + this.scale * (this.x - camX)) * halfWidth;
  this.Y = Math.ceil(((1 - this.scale * (this.y - camY)) * height) / 2);
  this.W = this.scale * roadW * halfWidth;
}


  clearSprites() {
    for (let e of this.elements) e.style.background = "transparent";
  }

  drawSprite(depth, layer, sprite, offset) {
    let destX = this.X + this.scale * halfWidth * offset;
    let destY = this.Y + 4;
    let destW = (sprite.width * this.W) / 265;
    let destH = (sprite.height * this.W) / 265;

    destX += destW * offset;
    destY += destH * -1;

    let obj = layer instanceof Element ? layer : this.elements[layer + 6];
    obj.style.background = `url('${sprite.src}') no-repeat`;
    obj.style.backgroundSize = `${destW}px ${destH}px`;
    obj.style.left = destX + `px`;
    obj.style.top = destY + `px`;
    obj.style.width = destW + `px`;
    obj.style.height = destH + `px`;
    obj.style.zIndex = depth;
  }
}

class Car {
  constructor(pos, type, lane) {
    this.pos = pos;
    this.type = type;
    this.lane = lane;

    var element = document.createElement("div");
    road.appendChild(element);
    this.element = element;
  }
}

class Audio {
  constructor() {
    this.audioCtx = new AudioContext();
    
    // Create a general gain node for all audio
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.connect(this.audioCtx.destination);
    
    // Create separate gain nodes for music and sound effects
    this.musicGain = this.audioCtx.createGain();
    this.sfxGain = this.audioCtx.createGain();
    
    // Connect music and sfx gains to the master gain
    this.musicGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    
  // Set initial volumes
  this.masterGain.gain.setValueAtTime(1, this.audioCtx.currentTime);
  this.musicGain.gain.setValueAtTime(0.2, this.audioCtx.currentTime); // Music at 20% (-14dB)
  this.sfxGain.gain.setValueAtTime(1, this.audioCtx.currentTime);
  
    console.log(`Initial music volume: ${this.musicGain.gain.value}`);
    console.log(`Initial SFX volume: ${this.sfxGain.gain.value}`);

    document.addEventListener('click', this.resumeAudioContext.bind(this));

    this.files = {};
    this.menuSource = null;
    this.currentSong = null;
    this.currentSongIndex = 0;
    this.drivingPlaylist = [
      'audio/arches.mp3',
      'audio/burnout.mp3',
      'audio/flutter.mp3',
      'audio/insight.mp3',
      'audio/relieve.mp3',
      'audio/u.mp3',
      'audio/stretch.mp3',
      'audio/downshift.mp3',
      'audio/without.mp3',
      'audio/seperate.mp3',
      'audio/initiate.mp3',
      'audio/overdrive.mp3',
      'audio/real.mp3',
      'audio/angel.mp3',
      'audio/again.mp3',

    ];

    this.loadAudioFiles();
  }

  get masterVolume() {
    return this.masterGain.gain.value;
  }

  set masterVolume(level) {
    this.masterGain.gain.setValueAtTime(level, this.audioCtx.currentTime);
  }

  get musicVolume() {
    return this.musicGain.gain.value;
  }

// Update the musicVolume setter in the Audio class
set musicVolume(level) {
  level = Math.max(0, Math.min(1, level)); // Ensure level is between 0 and 1
  this.musicGain.gain.setValueAtTime(level, this.audioCtx.currentTime);
  console.log(`Music volume set to: ${level}`);
  
  // Update the volume bar to reflect the new volume
  const volumeBar = document.getElementById('volume-bar');
  if (volumeBar) {
    volumeBar.value = level;
  }
}

  get sfxVolume() {
    return this.sfxGain.gain.value;
  }

  set sfxVolume(level) {
    this.sfxGain.gain.setValueAtTime(level, this.audioCtx.currentTime);
  }

  async resumeAudioContext() {
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
      console.log('AudioContext resumed');
    }
  }

  async loadAudioFiles() {
    const loadPromises = this.drivingPlaylist.map((song, index) =>
      new Promise((resolve, reject) => {
        this.load(song, `song${index}`, () => {
          console.log(`Loaded: ${song}`);
          resolve();
        });
      })
    );

    await Promise.all(loadPromises);
    this.startMenuMusic();
  }

  createSource(buffer, isMusic = false) {
    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    
    if (isMusic) {
      source.connect(this.musicGain);
      console.log(`Created music source. Current music volume: ${this.musicVolume}`);
    } else {
      source.connect(this.sfxGain);
      console.log(`Created SFX source. Current SFX volume: ${this.sfxVolume}`);
    }
    
    return source;
  }

  startMenuMusic() {
    if (this.files['menu']) {
      this.menuSource = this.createSource(this.files['menu'], true);
      this.menuSource.loop = true;
      this.menuSource.start(0);
      console.log('Menu music started. Current music volume:', this.musicVolume);
    } else {
      console.error('Menu music file not loaded');
    }
  }

  async play(key, pitch) {
    await this.resumeAudioContext();

    if (this.files[key]) {
      const source = this.createSource(this.files[key], false); // Sound effect
      if (pitch) source.detune.value = pitch;
      source.start(0);
      console.log(`Playing SFX: ${key}`);
    } else {
      console.log(`Audio ${key} not loaded, attempting to load and play`);
      this.load(key, () => this.play(key));
    }
  }

  stopMenu() {
    if (this.menuSource) {
      this.menuSource.stop();
      console.log('Menu music stopped');
    }
  }
  async startDrivingMusic() {
    await this.resumeAudioContext();
  
    if (!this.playlistStarted) {
      this.playlistStarted = true;
  
      // Fade out the menu music, then start driving music with a fade-in
      this.fadeOutMenu(() => {
        this.shufflePlaylist();
        this.currentSongIndex = Math.floor(Math.random() * this.drivingPlaylist.length);
        
        // Play the next song with fade-in effect after menu music has stopped
        this.playNextSongWithFadeIn();
      });
    }
  }
  
  
  
  playNextSongWithFadeIn() {
    // Start playing the next song
    this.playNextSong();
  
    // Start the song with volume at 0
    this.musicGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
  
    // Fade in over 1.5 seconds to the desired volume
    const fadeDuration = 1.5;  // in seconds
    this.musicGain.gain.linearRampToValueAtTime(0.2, this.audioCtx.currentTime + fadeDuration);  // Target music volume
  }
  
  
  

  fadeOutMenu(callback) {
    const fadeDuration = 1.5;  // 1.5 seconds fade duration
    const steps = 50;
    const stepTime = fadeDuration * 1000 / steps;
    const volumeStep = this.musicVolume / steps;
  
    const fadeOut = setInterval(() => {
      if (this.musicVolume > 0) {
        this.musicVolume = Math.max(0, this.musicVolume - volumeStep);
      } else {
        clearInterval(fadeOut);
        this.stopMenu();  // Ensure the menu music stops completely
        callback();  // Proceed to start the driving music
      }
    }, stepTime);
  }
  
  
  

  shufflePlaylist() {
    this.drivingPlaylist = this.drivingPlaylist.sort(() => Math.random() - 0.5);
    console.log('Playlist shuffled');
  }

  async playNextSong() {
    // Preserve game state before changing songs
    const previousPos = pos;
    const previousLapIndex = mapIndex;
  
    if (this.currentSong) {
      try {
        this.currentSong.onended = null;
        this.currentSong.stop();
      } catch (err) {
        console.error('Error stopping current song:', err);
      }
    }
  
    await this.resumeAudioContext();
  
    this.currentSongIndex = (this.currentSongIndex + 1) % this.drivingPlaylist.length;
    const songKey = `song${this.currentSongIndex}`;
  
    if (this.files[songKey]) {
      const buffer = this.files[songKey];
      if (buffer && buffer.length > 0) {
        this.currentSong = this.createSource(buffer, true);
        this.currentSong.loop = false;
        this.currentSong.start(0);
        
        // Restore player position and lap index after starting the song
        pos = previousPos;
        mapIndex = previousLapIndex;
        
        console.log(`Playing ${songKey}, Music Volume: ${this.musicVolume}`);
        this.currentSong.onended = () => this.playNextSong();
        this.currentSong.onerror = (e) => console.error('Audio playback error:', e);
      } else {
        console.error(`Buffer for ${songKey} is invalid or empty`);
        this.playNextSong();
      }
    } else {
      console.error(`Audio buffer for ${songKey} not found`);
      this.playNextSong();
    }
  

  }
  
  playPreviousSong() {
    // Preserve game state before changing songs
    const previousPos = pos;
    const previousLapIndex = mapIndex;
  
    if (this.currentSong) {
      try {
        this.currentSong.stop();
      } catch (err) {
        console.error('Error stopping current song:', err);
      }
    }
  
    // Only modify audio-related state, not game state
    this.currentSongIndex = (this.currentSongIndex - 1 + this.drivingPlaylist.length) % this.drivingPlaylist.length;
    const songKey = `song${this.currentSongIndex}`;
  
    if (this.files[songKey]) {
      this.currentSong = this.createSource(this.files[songKey], true);
      this.currentSong.loop = false;
      this.currentSong.start(0);
      
      // Restore player position and lap index after starting the song
      pos = previousPos;
      mapIndex = previousLapIndex;
      
      console.log(`Playing previous song: ${songKey}`);
    } else {
      console.error(`Audio buffer for ${songKey} not found`);
    }

  }
  

  load(src, key, callback) {
    const request = new XMLHttpRequest();
    request.open("GET", src, true);
    request.responseType = "arraybuffer";

    request.onload = () => {
      this.audioCtx.decodeAudioData(request.response, 
        (buffer) => {
          this.files[key] = buffer;
          console.log(`Loaded: ${key}`);
          if (callback) callback(key);
        },
        (error) => {
          console.error(`Error decoding audio data for ${key}:`, error);
        }
      );
    };

    request.onerror = () => {
      console.error(`Error loading audio file: ${src}`);
    };

    request.send();
  }
}





// ------------------------------------------------------------
// global varriables
// ------------------------------------------------------------

const highscores = [];

const width = window.innerWidth;
const height = window.innerHeight;
const scaleFactor = Math.min(window.innerWidth / 800, window.innerHeight / 500);
const halfWidth = width / 2;
const roadW = 4000;
const segL = 200;
const camD = 0.2;
const H = 1500;
const N = window.innerWidth > 768 ? 70 : 50;
const maxSpeed = 150;  // Faster maximum speed
const accel = 50;      // Quicker acceleration
const boostSpeed = 150; // Higher boost speed
const breaking = -60; // Make breaking a bit less punishing
const decel = -20;    // Reduce deceleration to keep the player moving fast
const maxOffSpeed = 40;
const offDecel = -70;
const enemy_speed = 8;
const hitSpeed = 20;
const boostDuration = 2; // Boost duration in seconds
const boostCooldown = 5; // Cooldown period in seconds
let isBoosting = false;
let boostTimer = 0;
let boostCooldownTimer = 0;
let boostBar = document.getElementById("boostBar");
let boostText = document.getElementById("boostText");
let currentWeather = "clear";  // Default weather
let currentTimeOfDay = "day"; // or "night"
let currentSkyIndex = 0;  // Start with the first sky asset
let isFirstGame = true;
let hasCompletedFirstLap = false;
let shouldUpdateSkyNextGame = false;



const LANE = {
A: -2.3,
B: -0.5,
C: 1.2,
};

const mapLength = 15000;

// loop
let then = timestamp();
const targetFrameRate = 1000 / 25; // in ms

let audio;

// game
let inGame,
start,
playerX,
speed,
scoreVal,
pos,
cloudOffset,
sectionProg,
mapIndex,
countDown;
let lines = [];
let cars = [];

const SHIFT = "ShiftLeft"; // Assuming left shift key for drift
let isDrifting = false;

addEventListener('keydown', (e) => {
  if (e.code === SHIFT) isDrifting = true;
});
addEventListener('keyup', (e) => {
  if (e.code === SHIFT) isDrifting = false;
});


// ------------------------------------------------------------
// map
// ------------------------------------------------------------

function getFun(val) {
  return (i) => val;
}

function genMap() {
  let map = [];
  let currentHeight = 0;
  let heightChange = 0;
  const maxHeightChange = 100; // Maximum height change per segment
  const heightChangeProbability = 0.1; // Probability of starting a height change
  const terrainSmoothness = 0.05; // Lower values create smoother terrain

  for (var i = 0; i < mapLength; i += getRand(150, 250)) {  // Even longer segments for smoother changes
    let section = {
      from: i,
      to: (i = i + getRand(500, 1000)),  // Longer sections for more gradual changes
    };

    // Determine if we should start a new height change
    if (Math.random() < heightChangeProbability) {
      heightChange = (Math.random() - 0.5) * 2 * maxHeightChange;
    }

    // Gradually apply the height change
    currentHeight += heightChange * terrainSmoothness;
    
    // Limit the overall height to prevent extreme elevations
    currentHeight = Math.max(-500, Math.min(500, currentHeight));

    let randCurve = Math.sin(i / 300) * 60;  // Even gentler curves
    let randInterval = getRand(60, 100);  // Longer intervals between curve changes

    // Assign curve and height to the section
    if (Math.random() > 0.97) {  // Very rare sharp turns
      Object.assign(section, {
        curve: (_) => randCurve * 1.5,
        height: (_) => currentHeight,
      });
    } else if (Math.random() > 0.9) {  // Occasional moderate curves
      Object.assign(section, {
        curve: (_) => randCurve * 0.8,
        height: (_) => currentHeight,
      });
    } else if (Math.random() > 0.6) {  // Common gentle curves
      Object.assign(section, {
        curve: (i) => Math.sin(i / randInterval) * randCurve * 0.5,
        height: (i) => Math.sin(i / randInterval) * 100 + currentHeight,  // Subtle undulations
      });
    } else {  // Straight sections
      Object.assign(section, {
        curve: (_) => 0,
        height: (_) => currentHeight,
      });
    }

    // Add occasional long, straight sections for high-speed runs
    if (Math.random() > 0.95) {
      section.to = section.to + getRand(800, 1500);  // Extended straight section
      Object.assign(section, {
        curve: (_) => 0,
        height: (_) => currentHeight,
      });
    }

    map.push(section);
  }

  // Add the finish line
  map.push({
    from: i,
    to: i + N,
    curve: (_) => 0,
    height: (_) => 0,
    special: ASSETS.IMAGE.FINISH,
  });
  map.push({ from: Infinity });

  return map;
}


let map = genMap();

// ------------------------------------------------------------
// additional controls
// ------------------------------------------------------------

addEventListener('keyup', async function (e) {
  if (e.code === 'KeyM') {
    e.preventDefault();
    // Toggle mute/unmute
    audio.volume = audio.volume === 0 ? 1 : 0;
    return;
  }

  if (e.code === 'KeyC') {
    e.preventDefault();

    if (inGame) return;

    // Ensure AudioContext is resumed when starting the game
    await audio.resumeAudioContext();  // Resume the AudioContext

    sleep(0)
      .then((_) => {
        text.classList.remove('blink');
        text.innerText = 3;
        audio.play('beep');
        return sleep(1000);
      })
      .then((_) => {
        text.innerText = 2;
        audio.play('beep');
        return sleep(1000);
      })
      .then((_) => {
        reset();

        home.style.display = 'none';
        road.style.opacity = 1;
        hero.style.display = 'block';
        hud.style.display = 'block';
        document.getElementById('music-controls').style.display = 'block';  // Always ensure controls are visible

        

        audio.play('beep', 500);
        inGame = true;

        // Start the driving music playlist
        audio.startDrivingMusic();  // Call this after game starts
      });

    return;
  }

  if (e.code === 'Escape') {
    e.preventDefault();
    reset();
  }
});


// Define boost UI update function globally
function updateBoostUI() {
  if (isBoosting) {
    boostBar.style.width = `${(boostTimer / boostDuration) * 100}%`;
    document.getElementById("boostTextOverlay").style.display = "none"; // Hide BOOST text while boosting
  } else if (boostCooldownTimer > 0) {
    boostBar.style.width = `${((boostCooldown - boostCooldownTimer) / boostCooldown) * 100}%`;
    document.getElementById("boostTextOverlay").style.display = "none"; // Hide BOOST text during cooldown
  } else {
    boostBar.style.width = "100%"; // Boost is ready
    document.getElementById("boostTextOverlay").style.display = "block"; // Show BOOST text
  }
}








function setDayMode() {
  // Example: Set background to a day theme
  document.body.style.backgroundColor = "#87CEEB"; // Light blue for day
  document.body.style.color = "#000"; // Black text for readability in day mode

  // You can also adjust other elements like canvas or road visuals
  road.style.filter = ""; // Reset any filters used during night mode
}

function setNightMode() {
  // Example: Set background to a night theme
  document.body.style.backgroundColor = "#000033"; // Dark blue for night
  document.body.style.color = "#FFF"; // White text for readability in night mode

  // You can apply other visual effects for night mode here
  road.style.filter = "brightness(0.5)"; // Darken the road
}

function changeTimeOfDay(timeOfDay) {
  if (timeOfDay === 'night') {
    setNightMode();
  } else if (timeOfDay === 'day') {
    setDayMode();
  }
}





// ------------------------------------------------------------
// game loop
// ------------------------------------------------------------

function update(step) {
// Prepare this iteration
pos += speed;
while (pos >= N * segL) pos -= N * segL;
while (pos < 0) pos += N * segL;

var startPos = (pos / segL) | 0;
let endPos = (startPos + N - 1) % N;

scoreVal += speed * step;
countDown -= step;

// Left / right position
playerX -= (lines[startPos].curve / 5000) * step * speed;

if (KEYS.ArrowRight || KEYS.KeyD) {
  hero.style.backgroundPosition = "-220px 0";
  playerX += 0.007 * step * speed;
} else if (KEYS.ArrowLeft || KEYS.KeyA) {
  hero.style.backgroundPosition = "0 0";
  playerX -= 0.007 * step * speed;
} else {
  hero.style.backgroundPosition = "-110px 0";
}

if (KEYS.ArrowUp || KEYS.KeyW) {
  speed = accelerate(speed, accel, step);
} else if (KEYS.ArrowDown || KEYS.KeyS) {
  speed = accelerate(speed, breaking, step);
} else {
  speed = accelerate(speed, decel, step);
}


playerX = playerX.clamp(-3, 3);

  // **Add the scaling logic here**aaddaadaaaaaaaaaaaaaaa
  let playerCarScale = this.scale * (ASSETS.IMAGE.HERO.width / ASSETS.IMAGE.CAR.width); // Adjust based on your asset dimensions
  hero.style.transform = `scale(${playerCarScale})`;

if (KEYS.Space && !isBoosting && boostCooldownTimer <= 0) {
  isBoosting = true;
  boostTimer = boostDuration;
}

if (isBoosting) {
  boostTimer -= step;
  if (boostTimer > 0) {
    speed = accelerate(speed, boostSpeed, step);
    hero.style.filter = "hue-rotate(90deg)";
  } else {
    isBoosting = false;
    boostCooldownTimer = boostCooldown; // Start cooldown when boost ends
    audio.play('boost_empty');  // Play boost empty sound
    hero.style.filter = ""; // Reset car color
  }
} else if (boostCooldownTimer > 0) {
  boostCooldownTimer -= step; // Decrease cooldown timer
  if (boostCooldownTimer <= 0) {
    audio.play('boost_ready');  // Play boost ready sound when cooldown finishes
  }
}

// Update the boost UI after boost and cooldown logic
updateBoostUI();

// Regular speed adjustments when not boosting
if (!isBoosting) {
if (inGame && KEYS.ArrowUp) speed = accelerate(speed, accel, step);
else if (KEYS.ArrowDown) speed = accelerate(speed, breaking, step);
else speed = accelerate(speed, decel, step);

if (Math.abs(playerX) > 0.55 && speed >= maxOffSpeed) {
speed = accelerate(speed, offDecel, step);
}
}


changeTimeOfDay(currentTimeOfDay);
// Update boost UI after boost logic
updateBoostUI();

applyWeatherEffects(currentWeather);






speed = speed.clamp(0, maxSpeed + (isBoosting ? boostSpeed : 0));

  // update map
  let current = map[mapIndex];
  let use = current.from < scoreVal && current.to > scoreVal;
  if (use) sectionProg += speed * step;
  lines[endPos].curve = use ? current.curve(sectionProg) : 0;
  lines[endPos].y = use ? current.height(sectionProg) : 0;
  lines[endPos].special = null;

  if (current.to <= scoreVal) {
    mapIndex++;
    sectionProg = 0;

    lines[endPos].special = map[mapIndex].special;
  }

  // win / lose + UI


  if (!inGame) {
    speed = accelerate(speed, breaking, step);
    speed = speed.clamp(0, maxSpeed);
  } else if (countDown <= 0 || lines[startPos].special) {
    tacho.style.display = "none";
    home.style.display = "block";
    road.style.opacity = 0.4;
    text.innerText = "INSERT COIN";
    highscores.push(lap.innerText);
    highscores.sort();
    updateHighscore();
  
    inGame = false;
  
    // Set flag to update sky on next game start, don't update immediately
    if (!hasCompletedFirstLap) {
      hasCompletedFirstLap = true;
    }
    shouldUpdateSkyNextGame = true;
    // Remove the updateSky() call from here
  } else {
    // This is the active game state
    time.innerText = (countDown | 0).pad(3);
    score.innerText = (scoreVal | 0).pad(8);
    tacho.innerText = speed | 0;
  
    // Update the lap time display
    let cT = new Date(timestamp() - start);
    lap.innerText = `${cT.getMinutes()}'${cT.getSeconds().pad(2)}"${cT
      .getMilliseconds()
      .pad(3)}`;
  }


  // sound
  if (speed > 0) audio.play("engine", speed * 4);

  // draw cloud
  cloud.style.backgroundPosition = `${(cloudOffset -= step * 0.05) | 0}px 0`;
  cloud.style.backgroundSize = "cover";  // Adjust to make the skybox cover the entire background
cloud.style.backgroundSize = "100% 100%";  // Stretch to fit the entire game area


  // other cars
  for (let car of cars) {
    car.pos = (car.pos + enemy_speed * step) % N;

    // respawn
    if ((car.pos | 0) === endPos) {
      if (speed < 30) car.pos = startPos;
      else car.pos = endPos - 2;
      car.lane = randomProperty(LANE);
    }

    // collision
    const offsetRatio = 5;
    if (
      (car.pos | 0) === startPos &&
      isCollide(playerX * offsetRatio + LANE.B, 0.5, car.lane, 0.001)
    ) {
      speed = Math.min(hitSpeed, speed);
      if (inGame) audio.play("honk");
    }
  }

  // draw road
  let maxy = height;
  let camH = H + lines[startPos].y;
  let x = 0;
  let dx = 0;

  for (let n = startPos; n < startPos + N; n++) {
    let l = lines[n % N];
    let level = N * 2 - n;

    // update view
    l.project(
      playerX * roadW - x,
      camH,
      startPos * segL - (n >= N ? N * segL : 0)
    );
    x += dx;
    dx += l.curve;

    // clear assets
    l.clearSprites();

    // first draw section assets
    if (n % 10 === 0) l.drawSprite(level, 0, ASSETS.IMAGE.TREE, -2);
    if ((n + 5) % 10 === 0)
      l.drawSprite(level, 0, ASSETS.IMAGE.TREE, 1.3);

    if (l.special)
      l.drawSprite(level, 0, l.special, l.special.offset || 0);

    for (let car of cars)
      if ((car.pos | 0) === n % N)
        l.drawSprite(level, car.element, car.type, car.lane);

    // update road

    if (l.Y >= maxy) continue;
    maxy = l.Y;

    let even = ((n / 2) | 0) % 2;
    let grass = ASSETS.COLOR.GRASS[even * 1];
    let rumble = ASSETS.COLOR.RUMBLE[even * 1];
    let tar = ASSETS.COLOR.TAR[even * 1];

    let p = lines[(n - 1) % N];

    drawQuad(
      l.elements[0],
      level,
      grass,
      width / 4,
      p.Y,
      halfWidth + 2,
      width / 4,
      l.Y,
      halfWidth
    );
    drawQuad(
      l.elements[1],
      level,
      grass,
      (width / 4) * 3,
      p.Y,
      halfWidth + 2,
      (width / 4) * 3,
      l.Y,
      halfWidth
    );

    drawQuad(
      l.elements[2],
      level,
      rumble,
      p.X,
      p.Y,
      p.W * 1.15,
      l.X,
      l.Y,
      l.W * 1.15
    );
    drawQuad(l.elements[3], level, tar, p.X, p.Y, p.W, l.X, l.Y, l.W);

    if (!even) {
      drawQuad(
        l.elements[4],
        level,
        ASSETS.COLOR.RUMBLE[1],
        p.X,
        p.Y,
        p.W * 0.4,
        l.X,
        l.Y,
        l.W * 0.4
      );
      drawQuad(
        l.elements[5],
        level,
        tar,
        p.X,
        p.Y,
        p.W * 0.35,
        l.X,
        l.Y,
        l.W * 0.35
      );
    }
  }
  // Weather and time of day effects (insert near the cloud update)
  function applyWeatherEffects(weatherType) {
    if (weatherType === 'rain') {
      addRainEffect();
      player.traction = 0.8;
    } else if (weatherType === 'fog') {
      addFogEffect();
      player.visibilityRange = 0.5;
    }
  }



// Manage dynamic events in the update loop
applyWeatherEffects(currentWeather);
changeTimeOfDay(currentTimeOfDay);

}


// ------------------------------------------------------------
// init
// ------------------------------------------------------------

function reset() {
  inGame = false;

  if (isFirstGame) {
    isFirstGame = false;
    hasCompletedFirstLap = false;
    shouldUpdateSkyNextGame = false;
    // Set initial sky background
    cloud.style.backgroundImage = `url(${ASSETS.IMAGE.SKY[currentSkyIndex]})`;
  } else if (shouldUpdateSkyNextGame) {
    updateSky();
  }

    // Ensure buttons are visible after reset
    document.getElementById('music-controls').style.display = 'block';
  
    start = timestamp();
    countDown = map[map.length - 2].to / 130 + 10;

  start = timestamp();
  countDown = map[map.length - 2].to / 130 + 10;

  playerX = 0;
  speed = 0;
  scoreVal = 0;

  pos = 0;
  cloudOffset = 0;
  sectionProg = 0;
  mapIndex = 0;

  for (let line of lines) line.curve = line.y = 0;

  text.innerText = "INSERT COIN";
  text.classList.add("blink");

  road.style.opacity = 0.4;
  hud.style.display = "none";
  home.style.display = "block";
  tacho.style.display = "block";
  document.getElementById('music-controls').style.display = 'none';  // Hide music controls
}


function updateHighscore() {
  let hN = Math.min(12, highscores.length);
  for (let i = 0; i < hN; i++) {
    highscore.children[i].innerHTML = `${(i + 1).pad(2, "&nbsp;")}. ${
      highscores[i]
    }`;
  }
  
}

function init() {
  console.log('Initializing game...');

  // Set game and hero element sizes
  game.style.width = width + "px";
  game.style.height = height + "px";

  hero.style.top = height - 80 + "px";
  hero.style.left = halfWidth - ASSETS.IMAGE.HERO.width / 2 + "px";
  hero.style.background = `url(${ASSETS.IMAGE.HERO.src})`;
  hero.style.width = `${ASSETS.IMAGE.HERO.width}px`;
  hero.style.height = `${ASSETS.IMAGE.HERO.height}px`;

  // Set initial sky background using the first asset
  cloud.style.backgroundImage = `url(${ASSETS.IMAGE.SKY[currentSkyIndex]})`;

  // Initialize the audio system
  audio = new Audio();
  console.log('Audio system initialized');
  console.log('Initial volume:', audio.volume);

  Object.keys(ASSETS.AUDIO).forEach((key) =>
    audio.load(ASSETS.AUDIO[key], key, () => console.log(`Loaded audio asset: ${key}`))
  );

  // Resume AudioContext on the first click (if it hasn't already)
  document.addEventListener('click', audio.resumeAudioContext.bind(audio));

  // Initialize the cars and place them on the road
  cars.push(new Car(0, ASSETS.IMAGE.CAR, LANE.C));
  cars.push(new Car(10, ASSETS.IMAGE.CAR, LANE.B));
  cars.push(new Car(20, ASSETS.IMAGE.CAR, LANE.C));
  cars.push(new Car(35, ASSETS.IMAGE.CAR, LANE.C));
  cars.push(new Car(50, ASSETS.IMAGE.CAR, LANE.A));
  cars.push(new Car(60, ASSETS.IMAGE.CAR, LANE.B));
  cars.push(new Car(70, ASSETS.IMAGE.CAR, LANE.A));

    // Initialize click handler to detect game canvas clicks
    document.addEventListener('click', function (e) {
      if (e.target.id === 'gameCanvas') {
        // Handle canvas interaction
        console.log("Clicked on the game canvas");
      } else {
        // Ignore clicks outside the game area
        e.stopPropagation();
      }
    });

  // Initialize the event listeners for the music controls
  document.getElementById('volume-bar').addEventListener('input', function (e) {
    const newVolume = parseFloat(e.target.value);
    audio.musicVolume = newVolume;
    console.log('Music volume changed to:', audio.musicVolume);
  });

  document.getElementById('prev-song').addEventListener('click', function (e) {
    e.stopPropagation();  // Stop the event from bubbling up
    e.preventDefault();   // Prevent any default button behavior
    console.log('Previous song button clicked');
    
    const previousPos = pos;  // Save the player's position
    const previousLapIndex = mapIndex;  // Save the lap index
  
    audio.playPreviousSong();
  
    // Ensure no unintended changes to the game state
    if (pos !== previousPos || mapIndex !== previousLapIndex) {
      console.warn('Unexpected position or lap index change');
      pos = previousPos;
      mapIndex = previousLapIndex;
    }
  });
  
  
  document.getElementById('next-song').addEventListener('click', function (e) {
    e.stopPropagation();  // Stop the event from bubbling up
    e.preventDefault();   // Prevent any default button behavior
    console.log('Next song button clicked');
    
    const previousPos = pos;  // Save the player's position
    const previousLapIndex = mapIndex;  // Save the lap index
  
    audio.playNextSong();
  
    // Ensure no unintended changes to the game state
    if (pos !== previousPos || mapIndex !== previousLapIndex) {
      console.warn('Unexpected position or lap index change');
      pos = previousPos;
      mapIndex = previousLapIndex;
    }
  });
  


  // Generate the road lines
  for (let i = 0; i < N; i++) {
    let line = new Line();
    line.z = i * segL + 270;

    for (let j = 0; j < 8; j++) {
      let element = document.createElement("div");
      road.appendChild(element);
      line.elements.push(element);
    }

    lines.push(line);
  }

  // Initialize the highscore elements
  for (let i = 0; i < 12; i++) {
    let element = document.createElement("p");
    highscore.appendChild(element);
  }
  updateHighscore();

  reset(); // Set up the initial game state

  addEventListener('keyup', async function (e) {
    if (e.code === 'KeyC') {
      e.preventDefault();
  
      if (inGame || !shouldUpdateSkyNextGame) return; // Prevent resetting if already in game
  
      // Start game setup only if AudioContext has resumed
      await audio.resumeAudioContext();
  
      sleep(0)
        .then((_) => {
          text.classList.remove('blink');
          text.innerText = 3;
          audio.play('beep');
          return sleep(1000);
        })
        .then((_) => {
          text.innerText = 2;
          audio.play('beep');
          return sleep(1000);
        })
        .then((_) => {
          updateSky();
          reset();
  
          home.style.display = 'none';
          road.style.opacity = 1;
          hero.style.display = 'block';
          hud.style.display = 'block';
          document.getElementById('music-controls').style.display = 'block';
  
          audio.play('beep', 500);
          inGame = true;
  
          audio.startDrivingMusic();
        });
    }
  });
  
  
  

  // Start the game loop
  (function loop() {
    requestAnimationFrame(loop);

    let now = timestamp();
    let delta = now - then;

    if (delta > targetFrameRate) {
      then = now - (delta % targetFrameRate);
      update(delta / 1000);
    }
  })();

  console.log('Game initialization complete');
}

// Call the init function to start the game
init();
//# sourceURL=pen.js
// </script>