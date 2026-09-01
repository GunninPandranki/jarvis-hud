#!/usr/bin/env node
import { runDiscoveryOnly, runFullPipeline } from './pipeline.js';

async function main() {
  const [, , cmd = 'run', ...rest] = process.argv;

  switch (cmd) {
    case 'discover': {
      const scored = await runDiscoveryOnly();
      console.log(`\nTop 10 scored topics:`);
      for (const t of scored.slice(0, 10)) {
        console.log(`  [${t.viralityScore.toString().padStart(3, ' ')}] (${t.source}) ${t.title}`);
      }
      break;
    }
    case 'run': {
      const noRender = rest.includes('--no-render');
      await runFullPipeline({ render: !noRender });
      break;
    }
    default:
      console.log(`Usage:
  npm run discover           # trend discovery + virality scoring only
  npm run pipeline            # full pipeline (discover -> script -> render)
  tsx src/cli.ts run --no-render   # full pipeline but skip the Remotion render step`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ Pipeline failed:', err);
  process.exit(1);
});
