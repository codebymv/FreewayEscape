// Master Audio Effects Chain (ported from VoidRunner style)
// Creates Compressor → Makeup Gain → Limiter chain for the master bus

export const COMPRESSION_SETTINGS = {
  THRESHOLD: -12,
  KNEE: 10,
  RATIO: 1.8,
  ATTACK: 0.03,
  RELEASE: 0.15,
};

export const LIMITER_SETTINGS = {
  THRESHOLD: -0.1,
  KNEE: 0,
  RATIO: 20,
  ATTACK: 0,
  RELEASE: 0.1,
};

export const MAKEUP_GAIN_SETTINGS = {
  GAIN: 1.2,
};

export function createAudioEffectsChain(audioContext) {
  const compressor = audioContext.createDynamicsCompressor();
  const limiter = audioContext.createDynamicsCompressor();
  const makeupGain = audioContext.createGain();

  // Configure compressor
  compressor.threshold.setValueAtTime(COMPRESSION_SETTINGS.THRESHOLD, audioContext.currentTime);
  compressor.knee.setValueAtTime(COMPRESSION_SETTINGS.KNEE, audioContext.currentTime);
  compressor.ratio.setValueAtTime(COMPRESSION_SETTINGS.RATIO, audioContext.currentTime);
  compressor.attack.setValueAtTime(COMPRESSION_SETTINGS.ATTACK, audioContext.currentTime);
  compressor.release.setValueAtTime(COMPRESSION_SETTINGS.RELEASE, audioContext.currentTime);

  // Makeup gain
  makeupGain.gain.setValueAtTime(MAKEUP_GAIN_SETTINGS.GAIN, audioContext.currentTime);

  // Limiter
  limiter.threshold.setValueAtTime(LIMITER_SETTINGS.THRESHOLD, audioContext.currentTime);
  limiter.knee.setValueAtTime(LIMITER_SETTINGS.KNEE, audioContext.currentTime);
  limiter.ratio.setValueAtTime(LIMITER_SETTINGS.RATIO, audioContext.currentTime);
  limiter.attack.setValueAtTime(LIMITER_SETTINGS.ATTACK, audioContext.currentTime);
  limiter.release.setValueAtTime(LIMITER_SETTINGS.RELEASE, audioContext.currentTime);

  return { compressor, limiter, makeupGain };
}

export function connectEffectsChain(effects, destination) {
  effects.compressor.connect(effects.makeupGain);
  effects.makeupGain.connect(effects.limiter);
  effects.limiter.connect(destination);
}