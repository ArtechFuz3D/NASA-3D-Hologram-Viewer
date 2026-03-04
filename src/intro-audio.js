// ─────────────────────────────────────────────────────────────────
// INTRO AUDIO  v3 — NASA 3D Model Viewer
// Pure procedural synthesis, no samples, no files.
//
// THREE TRACKS — set INTRO_TRACK below:
//
//  0 — "Deep Space Void"
//      Ambient drone + glitch. Sub-bass beating pairs, metallic
//      shimmer clusters, sparse glitch clicks, slow LFO swells.
//      Think: Interstellar docking scene / 2001 monolith reveal.
//
//  1 — "Titan Protocol"
//      Dark Zimmer-style cinematic pulse. Sine kick every 2s,
//      slow bass swell, dissonant string cluster, metal impact hits,
//      tension that builds across the loop.
//      Think: Inception "BRAAAM" / gravity-shift tension.
//
//  2 — "Launch Sequence"
//      Sci-fi computer / Matrix data aesthetic. Regular status
//      beeps, low rumble, random glitch bursts, pentatonic
//      chirp melody on a mechanical grid.
//      Think: Matrix code / NASA mission control / tron grid.
//
// CHANGE TRACK: set INTRO_TRACK = 0 | 1 | 2
// LIVE CROSSFADE: ctrl.setTrack(n)
// ─────────────────────────────────────────────────────────────────

export const INTRO_TRACK = 2   // ← 0 = Deep Space Void, 1 = Titan Protocol, 2 = Launch Sequence

// ─────────────────────────────────────────────────────────────────
//  PRIMITIVE SYNTHESIS TOOLS
//  No FM instrument() — each sound is purpose-built
// ─────────────────────────────────────────────────────────────────

const TAU   = Math.PI * 2
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
const lerp  = (a, b, t) => a + (b - a) * t

// ── Pseudo-random (LCG) — deterministic, no Math.random() ────────
function makePRNG(seed = 0xdeadbeef) {
    let s = seed >>> 0
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0
        return (s / 0x100000000) * 2 - 1   // −1..1
    }
}

// ── Sine ─────────────────────────────────────────────────────────
const sin = (f, t, phase = 0) => Math.sin(TAU * f * t + phase)

// ── Sawtooth — summed harmonics (10 partials, bandwidth-limited) ──
function saw(f, t, partials = 10) {
    let y = 0, sign = 1
    for (let n = 1; n <= partials; n++) {
        y += sign * Math.sin(TAU * f * n * t) / n
        sign = -sign
    }
    return y * (2 / Math.PI)
}

// ── Square — odd harmonics only ───────────────────────────────────
function sqr(f, t, partials = 9) {
    let y = 0
    for (let n = 1; n <= partials * 2; n += 2)
        y += Math.sin(TAU * f * n * t) / n
    return y * (4 / Math.PI)
}

// ── One-pole low-pass filter state (per voice) ────────────────────
// Returns a closure: fn(sample) → filtered sample
function makeLPF(cutoff, SR) {
    const rc = 1 / (TAU * cutoff)
    const dt = 1 / SR
    const a  = dt / (rc + dt)
    let prev = 0
    return x => (prev = prev + a * (x - prev))
}

// ── Soft clip ─────────────────────────────────────────────────────
const softclip = x => Math.tanh(x)

// ── ADSR envelope ────────────────────────────────────────────────
function adsr(t, A, D, S, R, noteLen) {
    if (t < 0)                      return 0
    if (t < A)                      return t / A
    if (t < A + D)                  return lerp(1, S, (t - A) / D)
    if (t < noteLen)                return S
    if (t < noteLen + R)            return S * (1 - (t - noteLen) / R)
    return 0
}

// ─────────────────────────────────────────────────────────────────
//  TRACK 0 — "Deep Space Void"
//  Pure ambient texture. No rhythm. No melody.
//  Layers: sub drone beat | shimmer cluster | glitch | LFO swell
// ─────────────────────────────────────────────────────────────────
function buildTrack0(SR) {
    const LOOP    = 32.0          // long loop for seamless ambience
    const SAMPLES = Math.ceil(SR * LOOP)
    const bufL    = new Float32Array(SAMPLES)
    const bufR    = new Float32Array(SAMPLES)
    const rng     = makePRNG(0xabcd1234)

    // Pre-generate glitch click schedule — sparse random hits
    const GLITCH_TIMES = []
    const rngG = makePRNG(0x1357cafe)
    let gCursor = 0
    while (gCursor < LOOP) {
        gCursor += 0.3 + Math.abs(rngG()) * 2.1    // 0.3–2.4s gaps
        if (gCursor < LOOP) GLITCH_TIMES.push(gCursor)
    }

    // Per-sample filters
    const droneLP  = makeLPF(180, SR)
    const shimLP   = makeLPF(4000, SR)

    for (let i = 0; i < SAMPLES; i++) {
        const t = i / SR
        let L = 0, R = 0

        // ── Sub-drone: two detuned pairs creating 2-3Hz beating ──
        // Pair A: 36Hz and 38.5Hz → 2.5Hz throb
        // Pair B: 54Hz and 56.8Hz → 2.8Hz throb (5th above)
        const droneA = sin(36.0,  t) * 0.55
                     + sin(38.5,  t) * 0.40
        const droneB = sin(54.0,  t) * 0.30
                     + sin(56.8,  t) * 0.22
        // Slow LFO swell: 8s cycle, always positive
        const lfo    = 0.5 + 0.5 * sin(1/8, t)
        const lfo2   = 0.5 + 0.5 * sin(1/13, t + 2.1)  // offset phase
        const dFiltered = droneLP(droneA + droneB) * 0.7
        L += dFiltered * (0.6 + 0.4 * lfo)
        R += dFiltered * (0.6 + 0.4 * lfo2)

        // ── Metallic shimmer: detuned high sines, very quiet ─────
        // Cluster around 800Hz, 5 detuned partials each side
        let shim = 0
        const shimFreqs = [793, 797, 801, 806, 812, 1201, 1207, 1597, 1601]
        const shimAmps  = [0.04,0.05,0.04,0.03,0.02, 0.02, 0.02, 0.015,0.015]
        for (let s = 0; s < shimFreqs.length; s++)
            shim += sin(shimFreqs[s], t, s * 0.7) * shimAmps[s]
        // Modulate shimmer with a 3s LFO for movement
        const shimLFO = 0.3 + 0.7 * (0.5 + 0.5 * sin(1/3.7, t))
        const shimF   = shimLP(shim) * shimLFO
        L += shimF * 0.5
        R += shimF * 0.7   // slightly off-centre

        // ── Deep pad: minor cluster Bb1 + B1 (minor 2nd = tension)
        const padEnv = 0.5 + 0.5 * sin(1/16, t)   // very slow swell
        const pad  = sin(58.27, t) * 0.18           // Bb1
                   + sin(61.74, t) * 0.10           // B1 (semitone above = dissonant)
                   + sin(87.31, t) * 0.08           // F2 (5th)
        L += pad * padEnv * lfo
        R += pad * padEnv * lfo2

        // ── Glitch clicks: short noise bursts ─────────────────────
        for (const gt of GLITCH_TIMES) {
            const dt = t - gt
            if (dt < 0 || dt > 0.035) continue
            const env = Math.exp(-dt * 120) * clamp(dt / 0.0005, 0, 1)
            const glitchNoise = rng() * env * 0.18
            // Ring-modulate noise with a random high freq for metallic click
            const rf = 800 + Math.abs(rng()) * 3200
            const glitch = glitchNoise * sin(rf, dt)
            L += glitch * (rng() > 0 ? 0.8 : 0.2)
            R += glitch * (rng() > 0 ? 0.2 : 0.8)
        }

        bufL[i] = softclip(L * 0.75)
        bufR[i] = softclip(R * 0.75)
    }
    return { bufL, bufR, SAMPLES }
}

// ─────────────────────────────────────────────────────────────────
//  TRACK 1 — "Titan Protocol"
//  Dark cinematic pulse. Zimmer/Nolan style tension.
//  Kick sine drum every 2s | bass swell | string cluster | metal hit
// ─────────────────────────────────────────────────────────────────
function buildTrack1(SR) {
    const LOOP    = 16.0
    const SAMPLES = Math.ceil(SR * LOOP)
    const bufL    = new Float32Array(SAMPLES)
    const bufR    = new Float32Array(SAMPLES)
    const rng     = makePRNG(0xf00dbabe)

    // Kick drum: exponential pitch drop 80Hz→30Hz, sine, hard env
    function kick(t) {
        if (t < 0 || t > 0.6) return 0
        const freq  = 80 * Math.pow(30/80, t / 0.08)   // pitch drops fast
        const env   = Math.exp(-t * 7.0) * clamp(t / 0.001, 0, 1)
        const click = Math.exp(-t * 180) * 0.4          // transient click
        return (Math.sin(TAU * freq * t) * env + click) * 0.8
    }

    // Metal impact: bandpassed noise burst — ring-modded
    function metalHit(t) {
        if (t < 0 || t > 0.25) return 0
        const env   = Math.exp(-t * 22) * clamp(t / 0.0008, 0, 1)
        // Approximate bandpass: sum of narrow sine clusters around 240Hz
        const ring  = sin(238, t) * 0.5 + sin(245, t) * 0.5
        const n     = rng()
        return n * ring * env * 0.5
    }

    // Bass swell: sawtooth-ish at 55Hz (A1), slow attack
    function bassSwell(t, dur) {
        if (t < 0 || t > dur + 0.8) return 0
        const atk = clamp(t / 1.2, 0, 1) * clamp(t / 1.2, 0, 1)   // slow attack
        const rel = t > dur ? Math.exp(-(t - dur) * 2.5) : 1.0
        // 5-partial saw at A1 (55Hz)
        let y = 0
        const f = 55.0
        for (let n = 1; n <= 5; n++) y += Math.sin(TAU * f * n * t) / n
        // Add beating with detuned copy for thickness
        for (let n = 1; n <= 4; n++) y += Math.sin(TAU * f * 1.003 * n * t) / n * 0.3
        return y * (2/Math.PI) * atk * rel * 0.22
    }

    // Tension string cluster: minor 2nd pairs sustain throughout
    // Using very smooth sine pads (even partials = warm)
    function stringCluster(t) {
        const lfo  = 0.7 + 0.3 * sin(1/7.3, t)
        let y = 0
        // Cluster 1: D3/Eb3 (minor 2nd, max dissonance)
        y += sin(146.83, t) * 0.12   // D3
        y += sin(155.56, t) * 0.10   // Eb3
        // Cluster 2: A2/Bb2
        y += sin(110.00, t) * 0.10   // A2
        y += sin(116.54, t) * 0.08   // Bb2
        // Slow vibrato on top voice
        const vib = 1 + 0.004 * sin(5.1, t) * clamp(t/2, 0, 1)
        y += sin(155.56 * vib, t) * 0.06
        return y * lfo
    }

    // Schedule: kick every 2s, metal hit every 4s offset by 1s
    const KICK_TIMES   = [0, 2, 4, 6, 8, 10, 12, 14]
    const METAL_TIMES  = [1, 5, 9, 13]
    const SWELL_TIMES  = [{s:0, dur:7.5}, {s:8, dur:7.5}]

    // Slow master build: amplitude rises over first 8s, stays full
    const buildEnv = t => clamp(t / 6.0, 0, 1) * 0.85 + 0.15

    const bassLP = makeLPF(300, SR)

    for (let i = 0; i < SAMPLES; i++) {
        const t = i / SR
        let L = 0, R = 0
        const bld = buildEnv(t)

        // String cluster (always on, slowly modulated)
        const sc = stringCluster(t)
        L += sc * 0.9; R += sc * 1.0

        // Bass swell events
        for (const { s, dur } of SWELL_TIMES) {
            const nt = t - s
            const b  = bassLP(bassSwell(nt, dur))
            L += b; R += b
        }

        // Kick drum hits
        for (const kt of KICK_TIMES) {
            const nt = t - kt
            const k  = kick(nt)
            L += k; R += k
        }

        // Metal impact hits
        for (const mt of METAL_TIMES) {
            const nt = t - mt
            const m  = metalHit(nt)
            L += m * 0.6; R += m * 1.0    // pan right
        }

        // Sub rumble: constant deep sine 28Hz
        const sub = sin(28, t) * 0.12 * (0.6 + 0.4 * sin(1/5.5, t))
        L += sub; R += sub

        bufL[i] = softclip(L * bld * 0.70)
        bufR[i] = softclip(R * bld * 0.70)
    }
    return { bufL, bufR, SAMPLES }
}

// ─────────────────────────────────────────────────────────────────
//  TRACK 2 — "Launch Sequence"
//  Sci-fi computer aesthetic. Matrix / NASA mission control.
//  Status beeps | data chirps | low rumble | random glitch bursts
// ─────────────────────────────────────────────────────────────────
function buildTrack2(SR) {
    const LOOP    = 16.0
    const SAMPLES = Math.ceil(SR * LOOP)
    const bufL    = new Float32Array(SAMPLES)
    const bufR    = new Float32Array(SAMPLES)
    const rng     = makePRNG(0x7a6f5b4c)

    // Beep: pure sine pulse, very short, clean
    function beep(t, freq, dur) {
        if (t < 0 || t > dur + 0.008) return 0
        const env = clamp(t / 0.002, 0, 1) *   // 2ms attack
                    (t < dur ? 1.0 : Math.exp(-(t-dur)*300))
        return sin(freq, t) * env
    }

    // Computer chirp: rapid ascending sine blip (2 partials)
    function chirp(t, baseFreq, rate) {
        if (t < 0 || t > 0.06) return 0
        const f   = baseFreq * Math.pow(2, t * rate)   // freq sweeps up
        const env = clamp(t/0.003, 0, 1) * Math.exp(-t * 40)
        return sin(f, t) * env * 0.5
    }

    // Data burst: rapid fire sine blips (simulates data transmission)
    function dataBurst(t, totalDur, blipRate, freq) {
        if (t < 0 || t > totalDur) return 0
        const blipPeriod = 1 / blipRate
        const blipT      = t % blipPeriod
        const isOn       = blipT < blipPeriod * 0.4    // 40% duty cycle
        if (!isOn) return 0
        const env = clamp(blipT / 0.001, 0, 1) * clamp((blipPeriod*0.4 - blipT)/0.001, 0, 1)
        return sin(freq, t) * env * 0.3
    }

    // Status beep schedule: [time, freq, dur]
    const BEEPS = [
        // Primary beep sequence — every 1s alternating freq
        [0.0,  880, 0.040], [1.0,  880, 0.040], [2.0,  880, 0.040],
        [3.0, 1047, 0.060], // C6 — confirmation tone
        [4.0,  880, 0.040], [5.0,  880, 0.040], [6.0,  880, 0.040],
        [7.0, 1319, 0.080], // E6 — alert tone
        [8.0,  880, 0.040], [9.0,  880, 0.040], [10.0, 880, 0.040],
        [11.0,1047, 0.060],
        [12.0, 880, 0.040], [13.0, 880, 0.040], [14.0, 880, 0.040],
        [15.0, 660, 0.100], // lower end-of-sequence tone
        // Secondary offset beeps (softer, 0.5s offset) — faster pulse
        [0.5, 1760, 0.018], [1.5, 1760, 0.018], [2.5, 1760, 0.018],
        [3.5, 1760, 0.018], [4.5, 1760, 0.018], [5.5, 1760, 0.018],
        [6.5, 1760, 0.018], [7.5, 1760, 0.018], [8.5, 1760, 0.018],
        [9.5, 1760, 0.018],[10.5, 1760, 0.018],[11.5, 1760, 0.018],
        [12.5,1760, 0.018],[13.5, 1760, 0.018],[14.5, 1760, 0.018],
    ]

    // Chirp melody: ascending pentatonic (Bb pentatonic major)
    // Bb C D F G  →  midi 58 60 62 65 67 (one octave up)
    const PEN_FREQS = [932, 1047, 1175, 1397, 1568]  // Bb5 C6 D6 F6 G6
    const CHIRPS = []
    const CHIRP_TIMES = [0.2, 1.2, 2.2, 3.2, 4.2, 5.2, 6.2, 7.2,
                         8.2, 9.2,10.2,11.2,12.2,13.2,14.2,15.2]
    CHIRP_TIMES.forEach((ct, idx) => {
        const freq = PEN_FREQS[idx % PEN_FREQS.length]
        // Ascending pattern: every 4 chirps go up, then reset
        const octShift = Math.floor(idx / 5) % 2   // shift up after 5
        CHIRPS.push([ct, freq * (octShift ? 1.5 : 1.0), 3.5])
    })

    // Data burst schedule
    const DATA_BURSTS = [
        [0.10, 0.38, 120, 2093],   // fast data C7
        [2.10, 0.28,  80, 1760],
        [4.10, 0.44, 100, 2349],   // D7
        [8.10, 0.38, 120, 2093],
        [10.10,0.28,  80, 1760],
        [12.10,0.44, 100, 2349],
    ]

    // Glitch bursts: random noise + pitched squeal
    const GLITCH_TIMES = []
    const rngG = makePRNG(0xbeef1234)
    let gc = 0.7
    while (gc < LOOP) {
        gc += 0.8 + Math.abs(rngG()) * 1.6
        if (gc < LOOP) GLITCH_TIMES.push({ t: gc, freq: 200 + Math.abs(rngG()) * 3600, dur: 0.008 + Math.abs(rngG()) * 0.025 })
    }

    // Low rumble filter
    const rumbleLP = makeLPF(90, SR)

    for (let i = 0; i < SAMPLES; i++) {
        const t = i / SR
        let L = 0, R = 0

        // ── Low rumble: filtered noise + 35Hz sub ────────────────
        const rumble = rumbleLP(rng() * 0.15) * 0.7
                     + sin(35, t) * 0.10
                     + sin(70, t) * 0.05
        L += rumble; R += rumble

        // ── Status beeps (centre, clean) ─────────────────────────
        for (const [bt, bf, bd] of BEEPS) {
            const nt  = t - bt
            const vol = bf > 1000 ? 0.08 : (bf > 900 ? 0.20 : 0.16)
            const b   = beep(nt, bf, bd) * vol
            L += b; R += b
        }

        // ── Chirp melody (slightly right of centre) ───────────────
        for (const [ct, cf, cr] of CHIRPS) {
            const nt = t - ct
            const c  = chirp(nt, cf, cr) * 0.22
            L += c * 0.7; R += c * 1.0
        }

        // ── Data bursts (panned left — like a data terminal) ──────
        for (const [dt, dd, dr, df] of DATA_BURSTS) {
            const nt = t - dt
            const d  = dataBurst(nt, dd, dr, df) * 0.15
            L += d * 1.0; R += d * 0.4
        }

        // ── Glitch bursts (random pan) ────────────────────────────
        for (const { t: gt, freq: gf, dur: gd } of GLITCH_TIMES) {
            const nt  = t - gt
            if (nt < 0 || nt > gd + 0.005) continue
            const env = Math.exp(-nt * 180) * clamp(nt / 0.0005, 0, 1)
            const g   = (rng() * 0.5 + sin(gf, nt) * 0.5) * env * 0.18
            // Deterministic pan per glitch hit
            const pan = 0.3 + 0.7 * (((gf * 137) % 100) / 100)
            L += g * (1 - pan); R += g * pan
        }

        bufL[i] = softclip(L * 0.78)
        bufR[i] = softclip(R * 0.78)
    }
    return { bufL, bufR, SAMPLES }
}

// ─────────────────────────────────────────────────────────────────
//  MAIN EXPORT
// ─────────────────────────────────────────────────────────────────

export function startIntroAudio(trackIndex = INTRO_TRACK) {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return null
    const ctx = new AudioContext()
    if (ctx.state === 'suspended') ctx.resume()

    const SR = ctx.sampleRate

    // Render all three tracks
    console.log('[intro-audio] rendering…')
    const t0     = performance.now()
    const tracks = [buildTrack0(SR), buildTrack1(SR), buildTrack2(SR)]
    console.log(`[intro-audio] done in ${(performance.now()-t0).toFixed(0)}ms`)

    const bufs = tracks.map(({ bufL, bufR, SAMPLES }) => {
        const buf = ctx.createBuffer(2, SAMPLES, SR)
        buf.copyToChannel(bufL, 0)
        buf.copyToChannel(bufR, 1)
        return buf
    })

    const masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(0, ctx.currentTime)
    masterGain.gain.linearRampToValueAtTime(0.82, ctx.currentTime + 2.2)
    masterGain.connect(ctx.destination)

    const gainNodes = bufs.map(() => {
        const g = ctx.createGain()
        g.gain.value = 0
        g.connect(masterGain)
        return g
    })

    const sources = new Array(bufs.length).fill(null)
    let active = -1

    function playTrack(idx, fadeDur = 0.9) {
        if (idx === active || idx < 0 || idx >= bufs.length) return
        const prev = active
        active = idx

        if (prev >= 0 && sources[prev]) {
            gainNodes[prev].gain.setValueAtTime(gainNodes[prev].gain.value, ctx.currentTime)
            gainNodes[prev].gain.linearRampToValueAtTime(0, ctx.currentTime + fadeDur)
            const old = sources[prev]
            setTimeout(() => { try { old.stop() } catch {} }, (fadeDur + 0.15) * 1000)
            sources[prev] = null
        }

        gainNodes[idx].gain.setValueAtTime(0, ctx.currentTime)
        gainNodes[idx].gain.linearRampToValueAtTime(1, ctx.currentTime + fadeDur)

        const src    = ctx.createBufferSource()
        src.buffer   = bufs[idx]
        src.loop     = true
        src.connect(gainNodes[idx])
        src.start()
        sources[idx] = src
    }

    playTrack(trackIndex, 0.15)

    return {
        stop(fade = 1.3) {
            masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime)
            masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + fade)
            setTimeout(() => {
                try { sources.forEach(s => s?.stop()); ctx.close() } catch {}
            }, (fade + 0.15) * 1000)
        },
        setTrack(idx) { playTrack(idx) },
        getTrack()    { return active },
        ctx, masterGain,
    }
}