/** Miados sintetizados do Chiquinho (Web Audio, sem arquivos de som). */
import { getPrefs } from '../state/prefs'

type CatVoiceOptions = {
  dur: number
  pitch: number[][]
  mouth: number[][]
  f1: number[][]
  f2: number[][]
  amp: number[][]
  breath?: number
  jitter?: number
  vib?: number
  scale?: number
  rough?: { rate: number; depth: number }
  at?: number
  vol?: number
}

let catAudioContext: AudioContext | null = null
let catMaster: GainNode | null = null
let catNoiseBuffer: AudioBuffer | null = null
let catGlottalWave: PeriodicWave | null = null

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)

function getCatAudioContext() {
  if (!catAudioContext) catAudioContext = new AudioContext()
  if (catAudioContext.state === 'suspended') void catAudioContext.resume()
  return catAudioContext
}

function getCatMaster(context: AudioContext) {
  if (!catMaster) {
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = -16
    compressor.ratio.value = 4
    compressor.attack.value = 0.005
    compressor.release.value = 0.15
    catMaster = context.createGain()
    catMaster.gain.value = 0.4
    catMaster.connect(compressor).connect(context.destination)
  }
  return catMaster
}

function getCatNoise(context: AudioContext) {
  if (!catNoiseBuffer) {
    catNoiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
    const data = catNoiseBuffer.getChannelData(0)
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1
  }
  return catNoiseBuffer
}

function getCatGlottalWave(context: AudioContext) {
  if (!catGlottalWave) {
    const real = new Float32Array(48)
    const imaginary = new Float32Array(48)
    for (let index = 1; index < imaginary.length; index += 1) imaginary[index] = 1 / Math.pow(index, 1.25)
    catGlottalWave = context.createPeriodicWave(real, imaginary)
  }
  return catGlottalWave
}

function rampCatParameter(parameter: AudioParam, points: number[][], start: number, duration: number, multiplier = 1) {
  parameter.cancelScheduledValues(0)
  parameter.setValueAtTime(points[0][1] * multiplier, start)
  for (let index = 1; index < points.length; index += 1) {
    parameter.linearRampToValueAtTime(points[index][1] * multiplier, start + points[index][0] * duration)
  }
}

function playCatVoice(options: CatVoiceOptions) {
  const context = getCatAudioContext()
  const start = context.currentTime + 0.03 + (options.at || 0)
  const output = getCatMaster(context)
  const oscillator = context.createOscillator()
  oscillator.setPeriodicWave(getCatGlottalWave(context))
  rampCatParameter(oscillator.frequency, options.pitch, start, options.dur)

  const jitter = options.jitter ?? 12
  for (let offset = 0; offset < options.dur; offset += 0.025) {
    oscillator.detune.setTargetAtTime(randomBetween(-jitter, jitter), start + offset, 0.008)
  }

  const vibrato = context.createOscillator()
  vibrato.frequency.value = randomBetween(5, 7)
  const vibratoGain = context.createGain()
  vibratoGain.gain.value = options.vib ?? 14
  vibrato.connect(vibratoGain).connect(oscillator.detune)

  const mix = context.createGain()
  oscillator.connect(mix)
  const noise = context.createBufferSource()
  noise.buffer = getCatNoise(context)
  noise.loop = true
  const highPass = context.createBiquadFilter()
  highPass.type = 'highpass'
  highPass.frequency.value = 900
  const breath = context.createGain()
  breath.gain.value = options.breath ?? 0.12
  noise.connect(highPass).connect(breath).connect(mix)

  const mouth = context.createBiquadFilter()
  mouth.type = 'lowpass'
  mouth.Q.value = 0.7
  rampCatParameter(mouth.frequency, options.mouth, start, options.dur)
  mix.connect(mouth)

  const formants = context.createGain()
  const scale = options.scale || 1
  const thirdFormant = [[0, 3900 * scale], [1, 3700 * scale]]
  ;[[options.f1, 3, 1], [options.f2, 5, 0.75], [thirdFormant, 6, 0.35]].forEach(([points, quality, gain]) => {
    const bandPass = context.createBiquadFilter()
    bandPass.type = 'bandpass'
    bandPass.Q.value = quality as number
    rampCatParameter(bandPass.frequency, points as number[][], start, options.dur)
    const formantGain = context.createGain()
    formantGain.gain.value = gain as number
    mouth.connect(bandPass).connect(formantGain).connect(formants)
  })
  const dry = context.createGain()
  dry.gain.value = 0.2
  mouth.connect(dry).connect(formants)

  let finalNode: AudioNode = formants
  let roughOscillator: OscillatorNode | null = null
  if (options.rough) {
    const roughGain = context.createGain()
    roughGain.gain.value = 1 - options.rough.depth / 2
    roughOscillator = context.createOscillator()
    roughOscillator.frequency.value = options.rough.rate
    const roughModulation = context.createGain()
    roughModulation.gain.value = options.rough.depth / 2
    roughOscillator.connect(roughModulation).connect(roughGain.gain)
    formants.connect(roughGain)
    finalNode = roughGain
  }

  const envelope = context.createGain()
  envelope.gain.value = 0
  rampCatParameter(envelope.gain, options.amp, start, options.dur, options.vol || 1)
  finalNode.connect(envelope).connect(output)

  const nodes: AudioScheduledSourceNode[] = [oscillator, vibrato, noise]
  if (roughOscillator) nodes.push(roughOscillator)
  nodes.forEach((node) => {
    node.start(start)
    node.stop(start + options.dur + 0.1)
  })
}

function playAdultCatMeow() {
  const scale = randomBetween(0.92, 1.08)
  const duration = randomBetween(0.75, 1)
  playCatVoice({
    dur: duration,
    pitch: [[0, 480 * scale], [0.22, 760 * scale], [0.55, 720 * scale], [1, 470 * scale]],
    mouth: [[0, 350], [0.15, 5500], [0.8, 3500], [1, 1200]],
    f1: [[0, 450], [0.3, 1050], [0.65, 900], [1, 500]],
    f2: [[0, 2500], [0.25, 2300], [0.6, 1600], [1, 950]],
    amp: [[0, 0], [0.07, 1], [0.6, 0.85], [0.85, 0.4], [1, 0]],
    breath: 0.1,
    vol: 1.6,
  })
}

function playKittenMeow() {
  const scale = randomBetween(0.95, 1.1)
  const duration = randomBetween(0.35, 0.5)
  playCatVoice({
    dur: duration,
    scale: 1.2,
    pitch: [[0, 950 * scale], [0.3, 1300 * scale], [1, 1000 * scale]],
    mouth: [[0, 600], [0.2, 7000], [1, 4000]],
    f1: [[0, 700], [0.35, 1300], [1, 900]],
    f2: [[0, 2900], [0.4, 2600], [1, 1900]],
    amp: [[0, 0], [0.12, 1], [0.7, 0.7], [1, 0]],
    breath: 0.22,
    jitter: 25,
    vol: 1.4,
  })
}

function playTrill() {
  const scale = randomBetween(0.92, 1.08)
  const duration = randomBetween(0.45, 0.6)
  playCatVoice({
    dur: duration,
    pitch: [[0, 420 * scale], [0.6, 560 * scale], [1, 660 * scale]],
    mouth: [[0, 900], [0.7, 1400], [1, 2200]],
    f1: [[0, 500], [1, 650]],
    f2: [[0, 1500], [1, 1900]],
    amp: [[0, 0], [0.1, 1], [0.8, 0.9], [1, 0]],
    rough: { rate: randomBetween(26, 32), depth: 1.6 },
    breath: 0.05,
    vol: 2.6,
  })
}

function playChatter() {
  let start = 0
  const count = Math.floor(randomBetween(6, 9))
  for (let index = 0; index < count; index += 1) {
    playCatVoice({
      at: start,
      dur: randomBetween(0.05, 0.075),
      pitch: [[0, 1150], [1, 850]],
      mouth: [[0, 2000], [0.3, 7000], [1, 2000]],
      f1: [[0, 800], [1, 700]],
      f2: [[0, 2700], [1, 2300]],
      amp: [[0, 0], [0.15, 1], [1, 0]],
      breath: 0.5,
      jitter: 30,
      vol: randomBetween(1, 1.6),
    })
    start += randomBetween(0.09, 0.13)
  }
}

const catVocalizations = [
  playAdultCatMeow,
  playKittenMeow,
  playChatter,
  playTrill,
  playTrill,
  playTrill,
]

/** Toca um miado aleatório, respeitando a preferência "Som do Chiquinho". */
export function meow(kind?: 'trill' | 'kitten' | 'adult' | 'chatter') {
  if (!getPrefs().sound) return
  try {
    if (kind === 'trill') playTrill()
    else if (kind === 'kitten') playKittenMeow()
    else if (kind === 'adult') playAdultCatMeow()
    else if (kind === 'chatter') playChatter()
    else catVocalizations[Math.floor(Math.random() * catVocalizations.length)]()
  } catch { /* áudio indisponível: o gato fica mudo, o app segue */ }
}
