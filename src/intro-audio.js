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
//  2 — "Ghost Signal"
//      Dense glitchy data aesthetic. Procedurally randomised:
//      status pings (5 tiers), stutter micro-bursts, chirp sweeps,
//      data spray, glitch strikes, zap squeals, phase flutter.
//      Think: Matrix green rain / Tron grid / satellite telemetry.
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
//  TRACK 2 — "Ghost Signal"
//  Glitchy, randomised sci-fi data aesthetic.
//  Matrix / Tron / NASA telemetry — dense, alive, unpredictable.
//
//  Layers (all procedurally generated, no fixed schedules):
//    • Sub rumble          — filtered noise + 35/70Hz sines
//    • Status ping grid    — irregular sine pulses, 5 freq tiers
//    • Stutter beeps       — random triplet/quintuplet micro-bursts
//    • Chirp sweeps        — exponential freq glides, random pitch/dir
//    • Data spray          — rapid duty-cycle blips, varying rate/freq
//    • Glitch strikes      — noise+ring-mod hits, wide random pan
//    • Dropout silences    — random micro-gaps for digital artefact feel
//    • Hi-freq zap         — very short pitched squeal, sparse
//    • Phase flutter       — two close sines beating fast (chorus effect)
//    • Loop seam crossfade — last 0.1s fades to zero to prevent click
// ─────────────────────────────────────────────────────────────────
function buildTrack2(SR) {
    const LOOP    = 24.0          // longer loop = less audible repetition
    const SAMPLES = Math.ceil(SR * LOOP)
    const bufL    = new Float32Array(SAMPLES)
    const bufR    = new Float32Array(SAMPLES)

    // Four independent PRNGs — keeps different layers decorrelated
    const rngMain  = makePRNG(0x7a6f5b4c)
    const rngGlitch= makePRNG(0xdeadface)
    const rngBeep  = makePRNG(0x12cafe34)
    const rngZap   = makePRNG(0xabcd0987)

    // ── Waveform helpers ─────────────────────────────────────────
    // Short-attack sine blip with configurable decay
    function blip(t, freq, decay) {
        return Math.sin(TAU * freq * t) * Math.exp(-t * decay) * clamp(t / 0.0008, 0, 1)
    }

    // Frequency-swept chirp: sweeps from startF to endF over dur
    function sweep(t, startF, endF, dur) {
        if (t < 0 || t > dur) return 0
        const p = t / dur
        // Exponential interpolation between freqs
        const f = startF * Math.pow(endF / startF, p)
        // Hanning envelope
        const env = 0.5 - 0.5 * Math.cos(Math.PI * p)
        return Math.sin(TAU * f * t) * env
    }

    // Noise burst with optional ring-mod carrier
    function noiseBurst(t, dur, carrierFreq, rng) {
        if (t < 0 || t > dur) return 0
        const env    = Math.exp(-t * (6 / dur)) * clamp(t / 0.0005, 0, 1)
        const noise  = rng()
        const ring   = carrierFreq > 0 ? Math.sin(TAU * carrierFreq * t) : 1.0
        return noise * ring * env
    }

    // Duty-cycle data spray: rapid on/off blips at given rate
    function dataSpray(t, dur, rate, freq, duty) {
        if (t < 0 || t > dur) return 0
        const period = 1 / rate
        const phase  = t % period
        if (phase > period * duty) return 0
        const env = clamp(phase / 0.0005, 0, 1) *
                    clamp((period * duty - phase) / 0.0005, 0, 1)
        return Math.sin(TAU * freq * t) * env * 0.35
    }

    // Phase-flutter chord: two sines beating at beatHz
    function flutter(t, baseFreq, beatHz, amp) {
        return (Math.sin(TAU * baseFreq * t) +
                Math.sin(TAU * (baseFreq + beatHz) * t)) * 0.5 * amp
    }

    // ── Pre-generate all event schedules ─────────────────────────
    // Uses seeded PRNGs so the loop is perfectly deterministic

    // Helper: generate random events with min spacing
    function makeSchedule(rng, loopLen, minGap, maxGap, gen) {
        const events = []
        let t = Math.abs(rng()) * minGap   // random start offset
        while (t < loopLen) {
            events.push(gen(t, rng))
            t += minGap + Math.abs(rng()) * (maxGap - minGap)
        }
        return events
    }

    // ── STATUS PINGS — 5 frequency tiers, irregular timing ───────
    // tier 0: 660Hz (low)  tier 1: 880Hz  tier 2: 1047Hz
    // tier 3: 1319Hz       tier 4: 1760Hz (high)
    const PING_FREQS = [660, 880, 1047, 1319, 1760]
    const PINGS = makeSchedule(rngBeep, LOOP, 0.18, 0.95, (t, r) => {
        const tierIdx  = Math.floor(Math.abs(r()) * 5)
        const freq     = PING_FREQS[tierIdx]
        const dur      = 0.018 + Math.abs(r()) * 0.065     // 18–83ms
        const vol      = 0.08  + Math.abs(r()) * 0.18
        const pan      = r() * 0.6                          // −0.6..0.6
        return { t, freq, dur, vol, pan }
    })

    // ── STUTTER BEEPS — micro-bursts of 2–5 rapid identical pings ─
    const STUTTERS = makeSchedule(rngBeep, LOOP, 0.4, 2.2, (t, r) => {
        const freq   = 440 + Math.abs(r()) * 1760
        const count  = 2 + Math.floor(Math.abs(r()) * 4)   // 2–5 blips
        const step   = 0.022 + Math.abs(r()) * 0.028        // spacing
        const vol    = 0.10 + Math.abs(r()) * 0.15
        const pan    = r() * 0.9
        const blips  = []
        for (let i = 0; i < count; i++)
            blips.push({ dt: i * step, freq, vol: vol * (1 - i*0.12) })
        return { t, blips, pan }
    })

    // ── CHIRP SWEEPS — random direction, pitch range, duration ────
    const CHIRPS = makeSchedule(rngGlitch, LOOP, 0.25, 1.8, (t, r) => {
        const lo  = 200  + Math.abs(r()) * 800
        const hi  = lo   + 300 + Math.abs(r()) * 3000
        const up  = r() > 0                                 // up or down
        const dur = 0.02 + Math.abs(r()) * 0.12
        const vol = 0.08 + Math.abs(r()) * 0.22
        const pan = r() * 0.85
        return { t, startF: up ? lo : hi, endF: up ? hi : lo, dur, vol, pan }
    })

    // ── DATA SPRAY BURSTS — random rate, freq, duration ──────────
    const SPRAYS = makeSchedule(rngMain, LOOP, 0.3, 2.5, (t, r) => {
        const freq  = 880  + Math.abs(r()) * 3520
        const rate  = 40   + Math.abs(r()) * 280            // 40–320 blips/s
        const duty  = 0.15 + Math.abs(r()) * 0.45
        const dur   = 0.05 + Math.abs(r()) * 0.5
        const vol   = 0.06 + Math.abs(r()) * 0.12
        const pan   = r() * 0.9
        return { t, freq, rate, duty, dur, vol, pan }
    })

    // ── GLITCH STRIKES — noise+ring-mod, loud, sharp, wide pan ───
    const STRIKES = makeSchedule(rngGlitch, LOOP, 0.15, 1.4, (t, r) => {
        const carrier = 80  + Math.abs(r()) * 4000
        const dur     = 0.003 + Math.abs(r()) * 0.04
        const vol     = 0.15 + Math.abs(r()) * 0.35
        const pan     = r()                                  // full −1..1
        return { t, carrier, dur, vol, pan }
    })

    // ── ZAP SQUEALS — very short high-freq pitched noise ─────────
    const ZAPS = makeSchedule(rngZap, LOOP, 0.6, 3.5, (t, r) => {
        const freq = 2000 + Math.abs(r()) * 6000
        const dur  = 0.004 + Math.abs(r()) * 0.012
        const vol  = 0.12 + Math.abs(r()) * 0.20
        const pan  = r() * 0.7
        return { t, freq, dur, vol, pan }
    })

    // ── PHASE FLUTTER CHORDS — 3 persistent beating pairs ────────
    // These run throughout, modulated slowly — the "alive computer" feel
    const FLUTTER_VOICES = [
        { base: 220.0,  beat: 1.3,  amp: 0.040, lfoF: 1/9.1,  lfoP: 0.0 },
        { base: 440.5,  beat: 2.1,  amp: 0.028, lfoF: 1/7.3,  lfoP: 1.4 },
        { base: 880.2,  beat: 3.7,  amp: 0.018, lfoF: 1/11.7, lfoP: 2.8 },
    ]

    // ── Low-pass filter for rumble ────────────────────────────────
    const rumbleLP = makeLPF(85, SR)

    // ── Render ───────────────────────────────────────────────────
    for (let i = 0; i < SAMPLES; i++) {
        const t = i / SR
        let L = 0, R = 0

        // Crossfade loop seam: last 80ms fades to zero
        const seamEnv = t > LOOP - 0.08
            ? (LOOP - t) / 0.08
            : (t < 0.08 ? t / 0.08 : 1.0)

        // ── Sub rumble ────────────────────────────────────────────
        const rumble = rumbleLP(rngMain() * 0.12) * 0.65
                     + Math.sin(TAU * 35 * t) * 0.09
                     + Math.sin(TAU * 70 * t) * 0.04
        L += rumble; R += rumble

        // ── Phase flutter (continuous) ────────────────────────────
        for (const v of FLUTTER_VOICES) {
            const lfo = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(TAU * v.lfoF * t + v.lfoP))
            const f   = flutter(t, v.base, v.beat, v.amp * lfo)
            L += f; R += f
        }

        // ── Status pings ──────────────────────────────────────────
        for (const p of PINGS) {
            const nt = t - p.t
            if (nt < 0 || nt > p.dur + 0.01) continue
            const b  = blip(nt, p.freq, 80 / p.dur) * p.vol
            L += b * (0.5 - p.pan * 0.5)
            R += b * (0.5 + p.pan * 0.5)
        }

        // ── Stutter beeps ─────────────────────────────────────────
        for (const s of STUTTERS) {
            for (const bl of s.blips) {
                const nt = t - s.t - bl.dt
                if (nt < 0 || nt > 0.018) continue
                const b  = blip(nt, bl.freq, 220) * bl.vol
                L += b * (0.5 - s.pan * 0.5)
                R += b * (0.5 + s.pan * 0.5)
            }
        }

        // ── Chirp sweeps ──────────────────────────────────────────
        for (const c of CHIRPS) {
            const nt = t - c.t
            if (nt < 0 || nt > c.dur) continue
            const sw = sweep(nt, c.startF, c.endF, c.dur) * c.vol
            L += sw * (0.5 - c.pan * 0.5)
            R += sw * (0.5 + c.pan * 0.5)
        }

        // ── Data spray ────────────────────────────────────────────
        for (const sp of SPRAYS) {
            const nt = t - sp.t
            const d  = dataSpray(nt, sp.dur, sp.rate, sp.freq, sp.duty) * sp.vol
            L += d * (0.5 - sp.pan * 0.5)
            R += d * (0.5 + sp.pan * 0.5)
        }

        // ── Glitch strikes ────────────────────────────────────────
        for (const g of STRIKES) {
            const nt = t - g.t
            if (nt < 0 || nt > g.dur + 0.003) continue
            const nb = noiseBurst(nt, g.dur, g.carrier, rngGlitch) * g.vol
            L += nb * (0.5 - g.pan * 0.5)
            R += nb * (0.5 + g.pan * 0.5)
        }

        // ── Zap squeals ───────────────────────────────────────────
        for (const z of ZAPS) {
            const nt = t - z.t
            if (nt < 0 || nt > z.dur) continue
            const zp = blip(nt, z.freq, 400) * z.vol
            L += zp * (0.5 - z.pan * 0.5)
            R += zp * (0.5 + z.pan * 0.5)
        }

        bufL[i] = softclip(L * seamEnv * 0.72)
        bufR[i] = softclip(R * seamEnv * 0.72)
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

    const BUILDERS = [buildTrack0, buildTrack1, buildTrack2]

    // Buffers built on demand — only active track renders immediately,
    // others are built in the background after a short delay.
    const bufs    = new Array(BUILDERS.length).fill(null)
    const sources = new Array(BUILDERS.length).fill(null)

    const masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(0, ctx.currentTime)
    masterGain.gain.linearRampToValueAtTime(0.82, ctx.currentTime + 2.2)
    masterGain.connect(ctx.destination)

    const gainNodes = BUILDERS.map(() => {
        const g = ctx.createGain()
        g.gain.value = 0
        g.connect(masterGain)
        return g
    })

    function buildBuf(idx) {
        if (bufs[idx]) return bufs[idx]
        console.log(`[intro-audio] rendering track ${idx}…`)
        const t0 = performance.now()
        const { bufL, bufR, SAMPLES } = BUILDERS[idx](SR)
        const buf = ctx.createBuffer(2, SAMPLES, SR)
        buf.copyToChannel(bufL, 0)
        buf.copyToChannel(bufR, 1)
        bufs[idx] = buf
        console.log(`[intro-audio] track ${idx} done in ${(performance.now()-t0).toFixed(0)}ms`)
        return buf
    }

    let active = -1

    function playTrack(idx, fadeDur = 0.9) {
        if (idx === active || idx < 0 || idx >= BUILDERS.length) return
        const prev = active
        active = idx

        if (prev >= 0 && sources[prev]) {
            gainNodes[prev].gain.setValueAtTime(gainNodes[prev].gain.value, ctx.currentTime)
            gainNodes[prev].gain.linearRampToValueAtTime(0, ctx.currentTime + fadeDur)
            const old = sources[prev]
            setTimeout(() => { try { old.stop() } catch {} }, (fadeDur + 0.15) * 1000)
            sources[prev] = null
        }

        // Build this track's buffer synchronously (it's the one we need now)
        const buf = buildBuf(idx)

        gainNodes[idx].gain.setValueAtTime(0, ctx.currentTime)
        gainNodes[idx].gain.linearRampToValueAtTime(1, ctx.currentTime + fadeDur)

        const src    = ctx.createBufferSource()
        src.buffer   = buf
        src.loop     = true
        src.connect(gainNodes[idx])
        src.start()
        sources[idx] = src

        // Build remaining tracks in background after a delay
        BUILDERS.forEach((_, i) => {
            if (i !== idx && !bufs[i]) {
                setTimeout(() => { try { buildBuf(i) } catch {} }, 800 + i * 400)
            }
        })
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