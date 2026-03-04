// ─────────────────────────────────────────────────────────────────
// INTRO AUDIO — Procedural space sci-fi music via WebAudio API
//
// Two original compositions, selectable at runtime:
//
//  TRACK 0 — "Dark Horizon"   (ambient space cinematic)
//    Key: F minor | 14s loop
//    Progression: Fm → D♭Maj → A♭Maj → E♭Maj6
//    Style: slow pad swells, shimmer arpeggios, sub-bass pulse
//
//  TRACK 1 — "Heavy March"      (dark imperial orchestral march)
//    Key: B♭ major | 16s loop
//    Progression: B♭ → F → Gm → E♭ → F → B♭ (I–V–vi–IV–V–I)
//    Style: unison brass melody, pizzicato strings, tympani downbeats,
//           horn power chords — dark imperial march feel
//
// Both share the same instrument() additive synthesis engine
// ported directly from the GLSL reference shader technique.
//
// USAGE:
//   import { startIntroAudio } from './intro-audio.js'
//   const ctrl = startIntroAudio(1)    // 0 = Dark Horizon, 1 = Starfield March
//   ctrl.stop()                        // fade out + close context
//   ctrl.setTrack(0)                   // crossfade to other track live
//
// TOGGLE in intro.js:
//   const INTRO_TRACK = 1   ← change this to 0 or 1
// ─────────────────────────────────────────────────────────────────

// ── Public toggle — change to 0 for Dark Horizon ─────────────────
export const INTRO_TRACK = 0

// ─────────────────────────────────────────────────────────────────
// SHARED SYNTHESIS ENGINE
// ─────────────────────────────────────────────────────────────────

const TAU    = Math.PI * 2
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12)
const clamp  = (x, a, b) => Math.max(a, Math.min(b, x))
const e2     = x => Math.pow(2, x)

// ── instrument(freq, t) — additive FM synthesis ───────────────────
// Direct port of the GLSL shader reference:
//   FM phase modulator → 8 harmonic partials with exponential decay
//   → cubic saturation → transient envelope
function instrument(freq, t) {
    if (t <= 0) return 0
    let ph = Math.sin(TAU * freq * t * 2.0)
    ph *= 0.5 + 0.5 * Math.max(0, 5.0 - 0.01 * freq)
    ph *= Math.exp(-t * freq * 0.2)

    let y = 0
    y += 0.70 * Math.sin(1.00 * TAU * freq * t + ph) * e2(-0.7 * 0.007 * freq * t)
    y += 0.20 * Math.sin(2.01 * TAU * freq * t + ph) * e2(-0.7 * 0.011 * freq * t)
    y += 0.20 * Math.sin(3.01 * TAU * freq * t + ph) * e2(-0.7 * 0.015 * freq * t)
    y += 0.16 * Math.sin(4.01 * TAU * freq * t + ph) * e2(-0.7 * 0.018 * freq * t)
    y += 0.13 * Math.sin(5.01 * TAU * freq * t + ph) * e2(-0.7 * 0.021 * freq * t)
    y += 0.10 * Math.sin(6.01 * TAU * freq * t + ph) * e2(-0.7 * 0.027 * freq * t)
    y += 0.09 * Math.sin(8.01 * TAU * freq * t + ph) * e2(-0.7 * 0.030 * freq * t)
    y += 0.07 * Math.sin(9.01 * TAU * freq * t + ph) * e2(-0.7 * 0.033 * freq * t)
    y += 0.35 * y * y * y
    y += 0.10 * y * y * y
    y *= 1.0 + 1.5 * Math.exp(-8.0 * t)
    y *= clamp(t / 0.004, 0, 1)
    y *= 2.5 - 1.5 * clamp(Math.log2(freq) / 10.0, 0, 1)
    return y
}

// ── Brass/trumpet voice — emphasises ODD harmonics (bright, piercing)
// Short articulate envelope: quick attack, hard cutoff with decay
function brass(freq, t, noteLen) {
    if (t <= 0 || t > noteLen + 0.12) return 0
    let ph = Math.sin(TAU * freq * t * 1.5)
    ph *= 0.3 + 0.3 * Math.max(0, 4.0 - 0.008 * freq)
    ph *= Math.exp(-t * freq * 0.15)

    let y = 0
    // Odd harmonics dominate → brassy timbre
    y += 0.80 * Math.sin(1.00 * TAU * freq * t + ph) * e2(-0.5 * 0.004 * freq * t)
    y += 0.45 * Math.sin(3.01 * TAU * freq * t + ph) * e2(-0.5 * 0.010 * freq * t)
    y += 0.30 * Math.sin(5.01 * TAU * freq * t + ph) * e2(-0.5 * 0.016 * freq * t)
    y += 0.20 * Math.sin(7.01 * TAU * freq * t + ph) * e2(-0.5 * 0.022 * freq * t)
    y += 0.12 * Math.sin(9.01 * TAU * freq * t + ph) * e2(-0.5 * 0.028 * freq * t)
    y += 0.08 * Math.sin(11.0 * TAU * freq * t + ph) * e2(-0.5 * 0.034 * freq * t)
    // Cubic warmth
    y += 0.20 * y * y * y

    // ADSR: fast attack (8ms), sustain, hard decay on note off
    const atk = clamp(t / 0.008, 0, 1)
    let env = atk
    if (t > noteLen) {
        env *= Math.exp(-(t - noteLen) * 18.0)
    }
    y *= env
    y *= 2.2 - 1.4 * clamp(Math.log2(freq) / 10.0, 0, 1)
    return y
}

// ── String voice — even harmonics (warm, bowed timbre)
// Slow attack (bowing), long sustain
function strings(freq, t, noteLen) {
    if (t <= 0 || t > noteLen + 0.4) return 0
    // Subtle vibrato ~5Hz
    const vib = 1.0 + 0.003 * Math.sin(TAU * 5.2 * t) * clamp(t / 0.3, 0, 1)
    const f = freq * vib

    let y = 0
    // Even harmonics dominate → warm string tone
    y += 0.60 * Math.sin(1.00 * TAU * f * t) * e2(-0.3 * 0.003 * f * t)
    y += 0.50 * Math.sin(2.00 * TAU * f * t) * e2(-0.3 * 0.006 * f * t)
    y += 0.25 * Math.sin(4.00 * TAU * f * t) * e2(-0.3 * 0.012 * f * t)
    y += 0.15 * Math.sin(6.00 * TAU * f * t) * e2(-0.3 * 0.018 * f * t)
    y += 0.08 * Math.sin(8.00 * TAU * f * t) * e2(-0.3 * 0.024 * f * t)
    // Gentle bow noise (band-passed via summing detuned sines)
    y += 0.04 * Math.sin(1.007 * TAU * f * t + 1.3)
    y += 0.04 * Math.sin(0.993 * TAU * f * t + 2.1)

    // Slow attack (120ms bow pressure build), decay on note off
    const atk = clamp(t / 0.12, 0, 1) * clamp(t / 0.12, 0, 1)
    let env = atk
    if (t > noteLen) {
        env *= Math.exp(-(t - noteLen) * 5.0)
    }
    y *= env * 0.7
    return y
}

// ── Tympani — low drum hit, inharmonic strike tone + boom ─────────
function tympani(freq, t) {
    if (t <= 0 || t > 1.8) return 0
    // Strike: short inharmonic burst at ~4× freq
    const strike = Math.sin(TAU * freq * 3.7 * t) * Math.exp(-t * 28.0)
    // Boom: fundamental with exponential tail
    const boom   = Math.sin(TAU * freq * t) * Math.exp(-t * 2.8)
    const env    = clamp(t / 0.002, 0, 1)
    return (strike * 0.4 + boom * 0.9) * env
}

// ── Soft clip master limiter ───────────────────────────────────────
const limit = x => x / (1.0 + Math.abs(x) * 0.7)

// ─────────────────────────────────────────────────────────────────
// TRACK 0 — "Dark Horizon"   (ambient cinematic, F minor)
// ─────────────────────────────────────────────────────────────────

function buildTrack0(SR) {
    const LOOP = 14.0
    const BAR  = LOOP / 4

    const NOTE = {
        F2:41, Ab2:44, C3:48, Db3:49, Eb3:51, G3:55, Bb3:58,
        F3:53, Ab3:56, C4:60, Db4:61, Eb4:63,
        F4:65, G4:67, Ab4:68, Bb4:70, C5:72, Eb5:75,
    }

    const CHORDS = [
        [NOTE.F2,  NOTE.F3,  NOTE.Ab3, NOTE.C4,  NOTE.F4 ],   // Fm
        [NOTE.Db3, NOTE.Db4, NOTE.F4,  NOTE.Ab4, NOTE.Db4],   // DbMaj
        [NOTE.Ab2, NOTE.Ab3, NOTE.C4,  NOTE.Eb4, NOTE.Ab4],   // AbMaj
        [NOTE.Eb3, NOTE.Eb4, NOTE.G4,  NOTE.Bb4, NOTE.C5 ],   // EbMaj6
    ]
    const ARP_SEQ = [0, 2, 1, 3, 2, 4, 3, 1]

    let _nlp = 0, _nst = 12345
    function nz() {
        _nst = (_nst * 1664525 + 1013904223) & 0xffffffff
        return (_nst / 0x80000000) - 1.0
    }

    function padEnv(t, atk, noteLen, rel) {
        if (t < 0)            return 0
        if (t < atk)          return t / atk
        if (t < noteLen)      return 1.0
        if (t < noteLen + rel)return 1.0 - (t - noteLen) / rel
        return 0
    }
    function subBass(freq, t) {
        if (t <= 0 || t > 2.5) return 0
        return Math.sin(TAU * freq * t) * Math.exp(-t * 1.2) * clamp(t / 0.01, 0, 1)
    }
    function breathSweep(t) {
        if (t < 0 || t > 0.3) return 0
        const raw = nz()
        _nlp += (raw - _nlp) * 0.08
        return _nlp * Math.exp(-t * 12.0) * clamp(t / 0.005, 0, 1) * 0.18
    }
    function shimmerArp(chord, barT) {
        const stepLen = BAR / ARP_SEQ.length
        const step    = Math.floor(barT / stepLen) % ARP_SEQ.length
        const st      = barT - step * stepLen
        const freq    = midiHz(chord[ARP_SEQ[step]]) * 2
        return Math.sin(TAU * freq * st) * Math.exp(-st * 6.0) * clamp(st / 0.003, 0, 1) * 0.12
    }

    const SAMPLES = Math.ceil(SR * LOOP)
    const bufL = new Float32Array(SAMPLES)
    const bufR = new Float32Array(SAMPLES)

    for (let i = 0; i < SAMPLES; i++) {
        const t     = i / SR
        const bar   = Math.floor(t / BAR)
        const barT  = t - bar * BAR
        const chord = CHORDS[bar % 4]

        let L = 0, R = 0
        const padAtk = 0.45, padRel = 0.55
        for (let j = 1; j < chord.length; j++) {
            const freq = midiHz(chord[j])
            const env  = padEnv(barT, padAtk, BAR - padRel, padRel)
            const v    = instrument(freq, barT) * env * 0.14
            L += v * (j % 2 === 0 ? 0.7 : 1.0)
            R += v * (j % 2 === 0 ? 1.0 : 0.7)
        }
        const sub    = subBass(midiHz(chord[0]), barT) * 0.45
        const arp    = shimmerArp(chord, barT) * 0.55
        const breath = breathSweep(barT)
        L += sub + arp * 0.6 + breath
        R += sub + arp * 1.0 + breath

        bufL[i] = limit(L * 0.7)
        bufR[i] = limit(R * 0.7)
    }
    return { bufL, bufR, SAMPLES }
}

// ─────────────────────────────────────────────────────────────────
// TRACK 1 — "Heavy March"  (dark imperial orchestral, G minor)
//
// Original composition in the style of classic villainous/imperial
// cinematic orchestral marches:
//   • Minor key (G minor) — Gm scale: G A Bb C D Eb F
//   • Dotted-quarter + eighth rhythmic cell (the lurching march feel)
//   • Unison brass melody — one strong line, heavy and declarative
//   • Staccato low strings pizzicato on offbeats — the rhythmic spine
//   • Tympani downbeat hits + snare roll buildup
//   • Brass/horn stab chords (5ths and minor triads) on beat 3
//   • Tritone and minor-2nd tension intervals for menace
//
// Loop: 16 seconds / 8 bars @ 120 BPM  (0.5s per beat, 2s per bar)
//
// Progression:
//   Bars 1-2: Gm  (tonic, dark root)
//   Bars 3-4: Dm/F → Ddim/Ab  (tritone tension)
//   Bars 5-6: Cm → Eb Maj  (minor subdominant swell)
//   Bars 7-8: Dm → Gm  (dominant → tonic cadence)
// ─────────────────────────────────────────────────────────────────

function buildTrack1(SR) {
    const LOOP = 16.0
    const BEAT = 0.5            // 120 BPM
    const BAR  = 4 * BEAT       // 2.0s per bar

    // G minor midi map
    const G2=43, Bb2=46, D3=50, Eb3=51, F3=53, G3=55, Ab3=56, A3=57, Bb3=58,
          C4=60, D4=62, Eb4=63, F4=65, G4=67, Ab4=68, Bb4=70, C5=72, D5=74, Eb5=75

    // ── Brass melody — dotted-quarter cell ────────────────────────
    // Rhythm: ♩.(0.75b) ♪(0.25b) ♩(0.5b) = "DUM-da DUM" march cell
    // Written in absolute seconds from loop start
    const MELODY = [
        // Bars 1-2: G G G Eb | Bb (long) — falling minor 3rd cell
        [G3,  0.000, 0.33], [G3,  0.500, 0.33], [G3,  0.750, 0.18], [Eb3, 1.000, 0.42],
        [Bb2, 2.000, 1.55],
        // Bars 3-4: F F F D | Ab G — tritone colour (Ab vs D = tritone)
        [F3,  4.000, 0.33], [F3,  4.500, 0.33], [F3,  4.750, 0.18], [D3,  5.000, 0.42],
        [Ab3, 6.000, 0.42], [G3,  6.500, 1.45],
        // Bars 5-6: C C C Ab | Eb (long) — up a 4th, builds tension
        [C4,  8.000, 0.33], [C4,  8.500, 0.33], [C4,  8.750, 0.18], [Ab3, 9.000, 0.42],
        [Eb4,10.000, 1.55],
        // Bars 7-8: Bb C D Eb | Bb G — climax ascent + tonic fall
        [Bb3,12.000, 0.33], [C4, 12.500, 0.33], [D4, 12.750, 0.18], [Eb4,13.000, 0.42],
        [Bb3,14.000, 0.42], [G3, 14.500, 1.40],
    ]

    // ── Low strings pizzicato — offbeat staccato spine ────────────
    // Fires on beats 2 and 4 of every bar (0.5 and 1.5 into each bar)
    // Plus a hard hit on beat 1 (unison with brass)
    const PIZZ = []
    const pizzRoots = [G2,G2, F3,G2, C4,G2, Bb2,G2]  // one per bar (beat1 + offbeat pair)
    for (let bar = 0; bar < 8; bar++) {
        const barStart = bar * BAR
        const root = pizzRoots[bar]
        // Beat 1 — strong hit
        PIZZ.push([root,     barStart + 0.00, 0.12])
        // Beat 2 offbeat — staccato
        PIZZ.push([root,     barStart + 0.50, 0.10])
        // Beat 3
        PIZZ.push([root,     barStart + 1.00, 0.12])
        // Beat 4 offbeat
        PIZZ.push([root,     barStart + 1.50, 0.10])
    }

    // ── Horn power chords — beat 3 of each bar (minor 5th stabs) ──
    const STABS = [
        [[G2,D3,Bb3],  1.00, 0.22],
        [[G2,D3,Bb3],  3.00, 0.22],
        [[F3,C4,Ab3],  5.00, 0.22],
        [[F3,C4,Ab3],  7.00, 0.22],
        [[C4,G3,Eb4],  9.00, 0.22],
        [[C4,G3,Eb4], 11.00, 0.22],
        [[Bb2,F3,D4], 13.00, 0.22],
        [[G2,D3,Bb3], 15.00, 0.22],
    ]

    // ── Tympani — beat 1 of every bar + accent on bar 5 ──────────
    const TYMP = []
    const tympPitch = [G2,G2, F3,G2, C4,G2, Bb2,G2]
    for (let bar = 0; bar < 8; bar++) {
        TYMP.push([tympPitch[bar], bar * BAR])
        // Double hit (roll feel) on bar 5 downbeat
        if (bar === 4) TYMP.push([tympPitch[bar], bar * BAR + 0.08])
    }

    // ── Sustained string pad — root drone per section ─────────────
    const PAD = [
        [G2,  0.0, 4.0, 0.10],   // Bars 1-2
        [F3,  4.0, 4.0, 0.10],   // Bars 3-4
        [C4,  8.0, 4.0, 0.10],   // Bars 5-6
        [G2, 12.0, 4.0, 0.10],   // Bars 7-8
        // 5th above
        [D3,  0.0, 4.0, 0.07],
        [C4,  4.0, 4.0, 0.07],
        [G3,  8.0, 4.0, 0.07],
        [D3, 12.0, 4.0, 0.07],
    ]

    // ── Piccolo/flute shimmer — high octave doubles the melody ────
    // Adds the bright cutting edge that carries over brass
    const PICCOLO = MELODY.map(([midi, start, dur]) => [midi + 12, start, dur])

    // ── Render ────────────────────────────────────────────────────
    const SAMPLES = Math.ceil(SR * LOOP)
    const bufL = new Float32Array(SAMPLES)
    const bufR = new Float32Array(SAMPLES)

    for (let i = 0; i < SAMPLES; i++) {
        const t = (i / SR) % LOOP
        let L = 0, R = 0

        // Brass melody (unison, centre)
        for (const [midi, st, dur] of MELODY) {
            const nt = t - st
            if (nt < 0 || nt > dur + 0.14) continue
            const v = brass(midiHz(midi), nt, dur) * 0.32
            L += v; R += v
        }

        // Piccolo doubles melody (bright, slightly right)
        for (const [midi, st, dur] of PICCOLO) {
            const nt = t - st
            if (nt < 0 || nt > dur + 0.10) continue
            const v = brass(midiHz(midi), nt, dur) * 0.10
            L += v * 0.7; R += v * 1.0
        }

        // Pizzicato strings (tight, staccato — left lean)
        for (const [midi, st, dur] of PIZZ) {
            const nt = t - st
            if (nt < 0 || nt > dur + 0.06) continue
            const freq = midiHz(midi)
            // Short plucked decay — not the full strings() call
            const env = Math.exp(-nt * 28.0) * clamp(nt / 0.003, 0, 1)
            const v = (Math.sin(TAU * freq * nt) * 0.7 +
                       Math.sin(TAU * freq * 2.01 * nt) * 0.3) * env * 0.28
            L += v * 1.0; R += v * 0.7
        }

        // Horn stabs (fat, centre)
        for (const [midis, st, dur] of STABS) {
            const nt = t - st
            if (nt < 0 || nt > dur + 0.14) continue
            for (const midi of midis) {
                const v = brass(midiHz(midi), nt, dur) * 0.16
                L += v; R += v
            }
        }

        // Tympani (sub boom, centre)
        for (const [midi, st] of TYMP) {
            const nt = t - st
            if (nt < 0 || nt > 1.8) continue
            const v = tympani(midiHz(midi) * 0.5, nt) * 0.65
            L += v; R += v
        }

        // Sustained pad (sub rumble, centre-wide)
        for (const [midi, st, dur, vol] of PAD) {
            const nt = t - st
            if (nt < 0 || nt > dur + 0.5) continue
            const v = strings(midiHz(midi), nt, dur) * vol
            L += v * 0.9; R += v * 0.9
        }

        bufL[i] = limit(L * 0.58)
        bufR[i] = limit(R * 0.58)
    }

    return { bufL, bufR, SAMPLES }
}

// ─────────────────────────────────────────────────────────────────
// MAIN EXPORT — startIntroAudio(trackIndex)
// ─────────────────────────────────────────────────────────────────

export function startIntroAudio(trackIndex = INTRO_TRACK) {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return null
    const ctx = new AudioContext()
    if (ctx.state === 'suspended') ctx.resume()

    const SR = ctx.sampleRate

    // Build both tracks (fast — pure JS, no I/O)
    console.log('[intro-audio] rendering tracks…')
    const t0 = performance.now()
    const tracks = [buildTrack0(SR), buildTrack1(SR)]
    console.log(`[intro-audio] rendered in ${(performance.now()-t0).toFixed(0)}ms`)

    // Build AudioBuffers
    const bufs = tracks.map(({ bufL, bufR, SAMPLES }) => {
        const buf = ctx.createBuffer(2, SAMPLES, SR)
        buf.copyToChannel(bufL, 0)
        buf.copyToChannel(bufR, 1)
        return buf
    })

    // Master gain (for fade in/out)
    const masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(0, ctx.currentTime)
    masterGain.gain.linearRampToValueAtTime(0.75, ctx.currentTime + 2.0)
    masterGain.connect(ctx.destination)

    // Two gain nodes — crossfade between them
    const gains  = [ctx.createGain(), ctx.createGain()]
    const sources = [null, null]
    gains[0].connect(masterGain)
    gains[1].connect(masterGain)

    let active = -1

    function playTrack(idx, fadeDur = 0.8) {
        if (idx === active) return
        const prev = active
        active = idx

        // Fade out old
        if (prev >= 0 && sources[prev]) {
            gains[prev].gain.setValueAtTime(gains[prev].gain.value, ctx.currentTime)
            gains[prev].gain.linearRampToValueAtTime(0, ctx.currentTime + fadeDur)
            const oldSrc = sources[prev]
            setTimeout(() => { try { oldSrc.stop() } catch {} }, (fadeDur + 0.1) * 1000)
        }

        // Fade in new
        gains[idx].gain.setValueAtTime(0, ctx.currentTime)
        gains[idx].gain.linearRampToValueAtTime(1, ctx.currentTime + fadeDur)

        const src = ctx.createBufferSource()
        src.buffer = bufs[idx]
        src.loop   = true
        src.connect(gains[idx])
        src.start()
        sources[idx] = src
    }

    // Start initial track
    playTrack(trackIndex, 0.1)

    return {
        stop(fadeDuration = 1.2) {
            masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime)
            masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeDuration)
            setTimeout(() => {
                try { sources[0]?.stop(); sources[1]?.stop(); ctx.close() } catch {}
            }, (fadeDuration + 0.1) * 1000)
        },
        setTrack(idx) { playTrack(idx) },
        getTrack()    { return active },
        ctx,
        masterGain,
    }
}