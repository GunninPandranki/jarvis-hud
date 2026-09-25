// tts.js
// Tiny standalone script to generate speech with Cartesia's HTTP API.
// Usage: node tts.js
// Requires CARTESIA_API_KEY in .env (same folder).

require('dotenv').config();
const fs = require('fs');

const API_KEY = process.env.CARTESIA_API_KEY;

async function main() {
  if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
    console.error('Missing CARTESIA_API_KEY in .env');
    process.exit(1);
  }

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      'Cartesia-Version': '2026-08-14'
    },
    body: JSON.stringify({
      model_id: 'sonic-3.6',
      transcript: 'Hi, thanks for calling Cartesia. How can I help you today?',
      voice: 'f6141af3-5f94-418c-80ed-a45d450e7e2e',
      output_format: {
        container: 'wav',
        encoding: 'pcm_s16le',
        sample_rate: 44100
      },
      generation_config: {
        speed: 1,
        volume: 1
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Cartesia API error (${response.status}): ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync('output.wav', Buffer.from(arrayBuffer));
  console.log('Wrote output.wav');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
