/**
 * PRESENCE & THE VOID — Client Application
 * Micro-interactions, ripple generator, audio synthesizer & device-level limits:
 * - 1 Presence confirmation per device
 * - 2 Secrets per device
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Device Identification ---
  function getDeviceId() {
    let id = localStorage.getItem('presence_device_id');
    if (!id) {
      id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('presence_device_id', id);
    }
    return id;
  }

  const deviceId = getDeviceId();

  // --- State Variables ---
  let currentCount = 0;
  let hasLeftPresence = false;
  let secretsRemaining = 2;
  let isUpdatingPresence = false;

  // --- DOM Elements ---
  const countDigits = document.getElementById('countDigits');
  const presenceBtn = document.getElementById('presenceBtn');
  const rippleHost = document.getElementById('rippleHost');
  const openSecretBtn = document.getElementById('openSecretBtn');
  const closeSecretBtn = document.getElementById('closeSecretBtn');
  const returnPresenceBtn = document.getElementById('returnPresenceBtn');
  
  const stagePresence = document.getElementById('stagePresence');
  const stageSecret = document.getElementById('stageSecret');
  const stageConfirmation = document.getElementById('stageConfirmation');

  const secretForm = document.getElementById('secretForm');
  const secretInput = document.getElementById('secretInput');
  const voidBtn = document.getElementById('voidBtn');
  const voidBtnText = document.getElementById('voidBtnText');
  const secretQuotaBadge = document.getElementById('secretQuotaBadge');
  const voidStat = document.getElementById('voidStat');
  const timeTag = document.getElementById('timeTag');
  const soundToggle = document.getElementById('soundToggle');

  // --- Audio Engine (Web Audio API) ---
  let audioCtx = null;
  let soundEnabled = true;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Gentle presence bell (high-register warm chime)
  function playPresenceChime() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const overtone = ctx.createOscillator();
      const overtoneGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(528, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 1.2);

      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(1056, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.09, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

      overtoneGain.gain.setValueAtTime(0, now);
      overtoneGain.gain.linearRampToValueAtTime(0.02, now + 0.02);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

      osc.connect(gain);
      overtone.connect(overtoneGain);
      gain.connect(ctx.destination);
      overtoneGain.connect(ctx.destination);

      osc.start(now);
      overtone.start(now);
      osc.stop(now + 1.5);
      overtone.stop(now + 1.0);
    } catch (e) {
      console.warn('Audio note skipped:', e);
    }
  }

  // Deep void tone (ethereal dissolving resonance)
  function playVoidResonance() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(174, now);
      osc.frequency.exponentialRampToValueAtTime(108, now + 2.5);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, now);
      filter.frequency.exponentialRampToValueAtTime(120, now + 2.5);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 3.0);
    } catch (e) {
      console.warn('Void audio skipped:', e);
    }
  }

  // Sound toggle
  if (soundToggle) {
    soundToggle.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      soundToggle.classList.toggle('is-muted', !soundEnabled);
      if (soundEnabled) {
        getAudioContext();
        playPresenceChime();
      }
    });
  }

  // --- Time & Status ---
  function updateTimeStatus() {
    if (!timeTag) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    timeTag.textContent = `${timeStr} Quiet`;
  }
  updateTimeStatus();
  setInterval(updateTimeStatus, 30000);

  // --- UI Update Helpers ---
  function renderCount(num, animate = false) {
    currentCount = num;
    const formatted = Number(num).toLocaleString('en-US');

    if (animate) {
      countDigits.classList.add('ticking');
      setTimeout(() => {
        countDigits.textContent = formatted;
      }, 100);
      setTimeout(() => {
        countDigits.classList.remove('ticking');
      }, 400);
    } else {
      countDigits.textContent = formatted;
    }
  }

  function setPresenceRecordedUI(recorded) {
    hasLeftPresence = recorded;
    if (recorded) {
      presenceBtn.classList.add('is-recorded');
      presenceBtn.disabled = true;
      const textSpan = presenceBtn.querySelector('.btn-text');
      if (textSpan) {
        textSpan.innerHTML = '✓ Presence Recorded';
      }
      presenceBtn.setAttribute('title', 'Your presence has already been recorded on this device.');
    }
  }

  function updateSecretQuotaUI(remaining) {
    secretsRemaining = remaining;
    if (!secretQuotaBadge) return;

    if (remaining <= 0) {
      secretQuotaBadge.textContent = 'Void Limit (2/2)';
      secretQuotaBadge.classList.add('is-depleted');
      secretInput.disabled = true;
      secretInput.value = '';
      secretInput.placeholder = 'Your 2 whispers are resting in the void.';
      voidBtn.disabled = true;
      if (voidBtnText) {
        voidBtnText.textContent = 'Quota Reached';
      }
    } else if (remaining === 1) {
      secretQuotaBadge.textContent = '1 whisper left';
      secretQuotaBadge.classList.remove('is-depleted');
      secretInput.disabled = false;
      secretInput.placeholder = 'Write your final secret...';
      voidBtn.disabled = false;
      if (voidBtnText) {
        voidBtnText.textContent = 'Send to the Void';
      }
    } else {
      secretQuotaBadge.textContent = '2 whispers left';
      secretQuotaBadge.classList.remove('is-depleted');
      secretInput.disabled = false;
      secretInput.placeholder = 'Write your secret...';
      voidBtn.disabled = false;
      if (voidBtnText) {
        voidBtnText.textContent = 'Send to the Void';
      }
    }
  }

  // --- Initial Data Fetch ---
  async function fetchPresence() {
    try {
      const res = await fetch(`/api/presence?deviceId=${encodeURIComponent(deviceId)}`);
      if (res.ok) {
        const data = await res.json();
        if (typeof data.count === 'number') {
          renderCount(data.count, false);
        }
        if (data.hasLeftPresence) {
          setPresenceRecordedUI(true);
        }
        if (typeof data.secretsRemaining === 'number') {
          updateSecretQuotaUI(data.secretsRemaining);
        }
        if (voidStat && typeof data.totalSecrets === 'number') {
          voidStat.textContent = data.totalSecrets === 1
            ? '1 whisper held in silence'
            : `${data.totalSecrets} whispers held in silence`;
        }
      }
    } catch (err) {
      console.warn('Offline or initializing with fallback presence');
      if (countDigits && countDigits.textContent === '—') {
        renderCount(currentCount || 0, false);
      }
    }
  }
  fetchPresence();
  // Poll for live presence & whispers updates
  setInterval(fetchPresence, 10000);

  // --- Tactile Ripple Generator ---
  function createRipple(e) {
    const rect = presenceBtn.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const circle = document.createElement('span');
    circle.classList.add('ripple-circle');

    const size = Math.max(rect.width, rect.height) * 1.6;
    circle.style.width = `${size}px`;
    circle.style.height = `${size}px`;
    circle.style.left = `${x}px`;
    circle.style.top = `${y}px`;

    rippleHost.appendChild(circle);

    setTimeout(() => {
      circle.remove();
    }, 850);
  }

  // --- "I Was Here" Handler (Once per Device) ---
  presenceBtn.addEventListener('click', async (e) => {
    if (hasLeftPresence) return;

    // Trigger immediate tactile and audio feedback
    createRipple(e);
    playPresenceChime();

    if (isUpdatingPresence) return;
    isUpdatingPresence = true;

    const previousCount = currentCount;
    // Optimistic count increment
    renderCount(previousCount + 1, true);

    try {
      const res = await fetch('/api/presence/increment', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Device-Id': deviceId
        },
        body: JSON.stringify({ deviceId })
      });

      const data = await res.json();
      if (res.ok) {
        renderCount(data.count, false);
        setPresenceRecordedUI(true);
      } else if (res.status === 403) {
        // Already recorded
        setPresenceRecordedUI(true);
        if (typeof data.count === 'number') {
          renderCount(data.count, false);
        } else {
          renderCount(previousCount, false);
        }
      } else {
        renderCount(previousCount, false);
      }
    } catch (err) {
      console.warn('Failed to persist presence:', err);
      renderCount(previousCount, false);
    } finally {
      setTimeout(() => {
        isUpdatingPresence = false;
      }, 300);
    }
  });

  // --- Stage Transition Controls ---
  function showStage(stageToShow) {
    [stagePresence, stageSecret, stageConfirmation].forEach((st) => {
      if (st === stageToShow) {
        st.classList.remove('is-hidden');
      } else {
        st.classList.add('is-hidden');
      }
    });
  }

  openSecretBtn.addEventListener('click', () => {
    showStage(stageSecret);
    setTimeout(() => {
      if (!secretInput.disabled) {
        secretInput.focus();
      }
    }, 250);
  });

  closeSecretBtn.addEventListener('click', () => {
    showStage(stagePresence);
    if (!secretInput.disabled) {
      secretInput.value = '';
    }
  });

  returnPresenceBtn.addEventListener('click', () => {
    showStage(stagePresence);
  });

  // --- Anonymous Secret Submission (Max 2 per Device) ---
  secretForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (secretsRemaining <= 0) {
      return;
    }

    const text = secretInput.value.trim();
    if (!text) {
      secretInput.focus();
      secretInput.style.borderColor = 'rgba(180, 50, 40, 0.4)';
      setTimeout(() => {
        secretInput.style.borderColor = '';
      }, 1000);
      return;
    }

    voidBtn.classList.add('is-submitting');
    voidBtn.disabled = true;

    try {
      const res = await fetch('/api/secrets', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Device-Id': deviceId
        },
        body: JSON.stringify({ 
          secret: text,
          deviceId: deviceId 
        })
      });

      const data = await res.json();

      if (res.ok) {
        secretInput.value = '';
        playVoidResonance();

        if (voidStat && data.totalSecrets) {
          voidStat.textContent = `${data.totalSecrets} whispers held in silence`;
        }

        // Update quota
        updateSecretQuotaUI(data.secretsRemaining);

        // Show confirmation stage
        showStage(stageConfirmation);
      } else if (res.status === 403) {
        updateSecretQuotaUI(0);
        alert(data.error || 'You have reached the maximum of 2 secrets.');
      } else {
        alert(data.error || 'Failed to dispatch secret.');
      }
    } catch (err) {
      console.error('Secret submission error:', err);
      alert('Unable to reach the void. Please try again.');
    } finally {
      voidBtn.classList.remove('is-submitting');
      if (secretsRemaining > 0) {
        voidBtn.disabled = false;
      }
    }
  });

  // Escape to close secret view
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !stageSecret.classList.contains('is-hidden')) {
      showStage(stagePresence);
      if (!secretInput.disabled) {
        secretInput.value = '';
      }
    }
  });
});
