import crypto from "crypto";
import fs from "fs";

const API_BASE = process.env.API_BASE || "http://localhost:8080";
const BUCKET = process.env.EVIDENCE_BUCKET || "hitcastor-evidence";
const S3 = process.env.S3_ENDPOINT || "http://localhost:4566";
const MARKET_ID = Number(process.env.MARKET_ID || "0");
const SONG_ID = Number(process.env.SONG_ID || "1234567890");
const T0_RANK = Number(process.env.T0_RANK || "12");

// simple helper
const sha256Hex = (b: Buffer) => "0x" + crypto.createHash("sha256").update(b).digest("hex");

async function putToLocalTemp(key: string, body: Buffer) {
  // Create temp files that can be served by our HTTP server
  fs.mkdirSync("/tmp/mock", { recursive: true });
  const fileName = key.replace(/\//g,"_");
  const filePath = `/tmp/mock/${fileName}`;
  fs.writeFileSync(filePath, body);
  
  // Return URL accessible via our HTTP server on port 8082
  return `http://localhost:8082/mock/${fileName}`;
}

async function createSpotifySnapshot(date: string, rank: number) {
  return {
    schema: "hitcastor.spotify.top100.v1",
    dateUTC: `${date}T10:00:00Z`,
    region: "global", 
    provider: "spotify",
    listLength: 3,
    items: [
      {
        rank: 1,
        title: "Top Hit Song",
        artist: "Chart Topper",
        streams: 50000000,
        trackId: "tophit123",
        spotifyUrl: "https://open.spotify.com/track/tophit123"
      },
      {
        rank: rank,
        title: "Test Song - BSC Testnet",
        artist: "Test Artist", 
        streams: rank > 10 ? 1000000 : 2000000,
        trackId: String(SONG_ID),
        spotifyUrl: `https://open.spotify.com/track/${SONG_ID}`
      },
      {
        rank: 50,
        title: "Mid Chart Song",
        artist: "Regular Artist",
        streams: 5000000,
        trackId: "midchart456",
        spotifyUrl: "https://open.spotify.com/track/midchart456"
      }
    ]
  };
}

async function run() {
  console.log("🎯 Creating mock daily snapshots for auto-resolution...");
  
  const today = new Date().toISOString().slice(0,10);
  
  // Create t0 (initial) and t1 (improved rank) snapshots
  const t0Snapshot = await createSpotifySnapshot(today, T0_RANK);
  const t1Snapshot = await createSpotifySnapshot(today, Math.max(1, T0_RANK - 4)); // Improved by 4 positions
  
  const t0 = Buffer.from(JSON.stringify(t0Snapshot, null, 2));
  const t1 = Buffer.from(JSON.stringify(t1Snapshot, null, 2));

  const t0Sha = sha256Hex(t0);
  const t1Sha = sha256Hex(t1);
  
  const t0Key = `${today}/t0.json`;
  const t1Key = `${today}/t1.json`;
  
  const t0Url = await putToLocalTemp(t0Key, t0);
  const t1Url = await putToLocalTemp(t1Key, t1);

  console.log(`📊 Snapshots created:`);
  console.log(`   T0 (rank ${T0_RANK}): ${t0Url}`);
  console.log(`   T1 (rank ${T0_RANK - 4}): ${t1Url}`);
  console.log(`   Outcome: YES (rank improved from ${T0_RANK} to ${T0_RANK - 4})`);

  try {
    // Step 1: Prepare resolution
    console.log("🔄 Step 1: Prepare resolution...");
    const prepareResponse = await fetch(`${API_BASE}/markets/${MARKET_ID}/prepare-resolve`, {
      method: "POST", 
      headers: { 
        "Content-Type": "application/json",
        "X-Admin-Key": "dev-admin-key"
      },
      body: JSON.stringify({ t0Url, t0Sha, t1Url, t1Sha })
    });
    
    if (!prepareResponse.ok) {
      const error = await prepareResponse.text();
      throw new Error(`Prepare failed: ${prepareResponse.status} ${error}`);
    }
    
    console.log("✅ Preparation successful");

    // Step 2: Commit resolution
    await new Promise(r => setTimeout(r, 2000));
    console.log("🔄 Step 2: Commit resolution...");
    
    const commitResponse = await fetch(`${API_BASE}/markets/${MARKET_ID}/commit`, { 
      method: "POST",
      headers: { "X-Admin-Key": "dev-admin-key" }
    });
    
    if (!commitResponse.ok) {
      const error = await commitResponse.text();
      throw new Error(`Commit failed: ${commitResponse.status} ${error}`);
    }
    
    console.log("✅ Commit successful");

    // Step 3: Finalize resolution (after dispute window)
    await new Promise(r => setTimeout(r, 8000));
    console.log("🔄 Step 3: Finalize resolution...");
    
    const finalizeResponse = await fetch(`${API_BASE}/markets/${MARKET_ID}/finalize`, { 
      method: "POST",
      headers: { "X-Admin-Key": "dev-admin-key" }
    });
    
    if (!finalizeResponse.ok) {
      const error = await finalizeResponse.text();
      throw new Error(`Finalize failed: ${finalizeResponse.status} ${error}`);
    }
    
    console.log("✅ Finalize successful");
    console.log("🎉 Market resolved! YES tokens should win (rank improved)");

  } catch (error) {
    console.error("❌ Resolution flow failed:", error);
    console.log("📝 Evidence URLs are still available for manual testing:");
    console.log(`   T0: ${t0Url}`);
    console.log(`   T1: ${t1Url}`);
    process.exit(1);
  }

  console.log("✅ Mock daily snapshot and auto-resolution completed successfully!");
}

// Add global fetch for Node.js environments that don't have it
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

run().catch(e => { 
  console.error("💥 Fatal error:", e); 
  process.exit(1); 
});