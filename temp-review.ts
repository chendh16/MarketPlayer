import { fetch_position_review } from './src/mcp/tools/position-review';

async function main() {
  const r = await fetch_position_review({ broker: 'futu', forceRefresh: false });
  console.log(JSON.stringify(r, null, 2));
}

main().catch(console.error);