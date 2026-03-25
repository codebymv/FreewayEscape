export const KEYS = {};

export const keyUpdate = (e) => {
  console.log('Key event:', e.code, e.type); // Debug log
  switch (e.code) {
    case 'ArrowUp':
    case 'KeyW':
      KEYS.ArrowUp = e.type === 'keydown';
      break;
    case 'ArrowDown':
    case 'KeyS':
      KEYS.ArrowDown = e.type === 'keydown';
      break;
    case 'ArrowLeft':
    case 'KeyA':
      KEYS.ArrowLeft = e.type === 'keydown';
      break;
    case 'ArrowRight':
    case 'KeyD':
      KEYS.ArrowRight = e.type === 'keydown';
      break;
    case 'Space':
      KEYS.Space = e.type === 'keydown';
      break;
    case 'KeyC':
    case 'Insert':
    case 'Enter':
      KEYS.Insert = e.type === 'keydown';
      break;
    case 'KeyM':
      // Handle mute key
      if (e.type === 'keydown') {
        toggleMute();
      }
      break;
    default:
      KEYS[e.code] = e.type === 'keydown';
      break;
  }
  console.log('KEYS state:', KEYS); // Debug log
  // Don't preventDefault for all keys, only game keys
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
};

export const initControls = () => {
  document.addEventListener('keydown', keyUpdate);
  document.addEventListener('keyup', keyUpdate);
  console.log('Controls initialized'); // Debug log
};

export const toggleMute = () => {
  const volumeBar = document.getElementById('volume-bar');
  if (!volumeBar) return;
  
  // Check if currently muted (volume is 0)
  const currentVolume = parseFloat(volumeBar.value);
  if (currentVolume > 0) {
    // Store the current volume for unmuting
    if (!window.muteStoredVolume) {
      window.muteStoredVolume = currentVolume;
    }
    // Mute by setting volume to 0
    volumeBar.value = 0;
    volumeBar.dispatchEvent(new Event('input'));
    console.log('Muted - stored volume:', window.muteStoredVolume);
  } else {
    // Unmute - restore stored volume or use default
    const restoreVolume = window.muteStoredVolume || 0.7;
    volumeBar.value = restoreVolume;
    volumeBar.dispatchEvent(new Event('input'));
    console.log('Unmuted - restored volume:', restoreVolume);
  }
};
