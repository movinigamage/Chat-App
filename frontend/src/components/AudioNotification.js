let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playMessageSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const time = ctx.currentTime;
    
    // Create oscillator and gain node for volume control
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Modern neat bubble "pop" tone: rapid frequency sweep from high to medium
    osc.type = "sine";
    osc.frequency.setValueAtTime(580, time);
    osc.frequency.exponentialRampToValueAtTime(320, time + 0.12);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.18, time + 0.02); // volume ramp up
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14); // volume ramp down

    osc.start(time);
    osc.stop(time + 0.15);
  } catch (err) {
    console.warn("Failed to play synthesized message sound:", err);
  }
}

export function playSentSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const time = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Fast soft sent sound
    osc.type = "sine";
    osc.frequency.setValueAtTime(450, time);
    osc.frequency.exponentialRampToValueAtTime(680, time + 0.08);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.1, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.start(time);
    osc.stop(time + 0.11);
  } catch (err) {
    console.warn("Failed to play sent sound:", err);
  }
}
