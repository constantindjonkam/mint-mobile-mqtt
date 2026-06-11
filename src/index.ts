// Mint Mobile MQTT Daemon Runner
import { loadConfig } from './config.js';
import { getValidSession } from './auth.js';
import { fetchMintData } from './mintApi.js';
import { MintMqttBridge } from './mqtt.js';

const config = loadConfig();
const mqttBridge = new MintMqttBridge(config);

async function updateState() {
  console.log(`\n[daemon] Starting update cycle at ${new Date().toISOString()}`);
  try {
    // 1. Get valid authenticated session (handles cache or re-login)
    const session = await getValidSession(config.mintPhone, config.mintPass);

    // 2. Fetch data from Mint Mobile API (returns array containing primary and any family/linked lines)
    const dataList = await fetchMintData(session.token, session.userId);
    console.log(`[daemon] Successfully fetched ${dataList.length} line(s) from Mint Mobile API.`);

    for (const data of dataList) {
      console.log(`[daemon] - Processing Line: ${data.lineName} (${data.phone}). Plan: "${data.planName}", Used: ${data.dataUsedGb} GB / ${data.dataTotalGb} GB`);
      
      // 3. Set up Discovery (runs on every tick defensively, ensuring configs exist in HA)
      mqttBridge.setupDiscovery(data.phone);

      // 4. Publish current states
      mqttBridge.publishState(data);
    }
    console.log('[daemon] Update cycle completed successfully.');
  } catch (error: any) {
    console.error('[daemon] Error during update cycle:', error.message || error);
  }
}

// Initial execution
updateState();

// Schedule polling loop
const intervalMs = config.pollIntervalMins * 60 * 1000;
console.log(`[daemon] Scheduling update loop every ${config.pollIntervalMins} minutes (${intervalMs}ms).`);
setInterval(updateState, intervalMs);

// Handle graceful termination
process.on('SIGINT', () => {
  console.log('[daemon] Stopping daemon...');
  mqttBridge.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('[daemon] Stopping daemon...');
  mqttBridge.close();
  process.exit(0);
});
