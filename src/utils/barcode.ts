// Code 39 Barcode Generator in TypeScript
// Maps alphanumeric characters to their 9-element binary patterns (5 bars, 4 spaces)
// '1' = wide, '0' = narrow

const CODE39_ALPHABET: Record<string, string> = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
  'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
  'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
  'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
  'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
  'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
  '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
  '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100'
};

export interface BarInfo {
  type: 'bar' | 'space';
  width: number;
}

/**
 * Generates an array of bar/space widths to render a Code 39 barcode.
 * Input text will be sanitized (converted to uppercase, invalid chars filtered).
 */
export function getCode39Pattern(text: string): BarInfo[] {
  // Code 39 requires uppercase and must start/end with '*'
  const sanitized = text.toUpperCase().replace(/[^0-9A-Z\-\.\s\$\/\+\%]/g, '');
  const fullText = `*${sanitized}*`;
  
  const result: BarInfo[] = [];
  
  for (let i = 0; i < fullText.length; i++) {
    const char = fullText[i];
    const pattern = CODE39_ALPHABET[char];
    
    if (!pattern) continue;
    
    // Each pattern has 9 elements: alternating bars and spaces, starting with a bar.
    // e.g. bar, space, bar, space, bar, space, bar, space, bar
    for (let j = 0; j < 9; j++) {
      const isBar = j % 2 === 0;
      const isWide = pattern[j] === '1';
      
      result.push({
        type: isBar ? 'bar' : 'space',
        width: isWide ? 3 : 1
      });
    }
    
    // Add a narrow inter-character gap (space) if not the last character
    if (i < fullText.length - 1) {
      result.push({
        type: 'space',
        width: 1
      });
    }
  }
  
  return result;
}

/**
 * Simple audio feedback beep helper using Web Audio API
 */
export function playBeep(type: 'success' | 'error') {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    
    if (type === 'success') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, ctx.currentTime); // High pitch check
      
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else {
      // Error: double lower pitch beep
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(220, ctx.currentTime); // Low pitch error
      
      gain1.gain.setValueAtTime(0.15, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      
      osc1.start();
      osc1.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {
    console.warn('Audio Context error:', e);
  }
}
