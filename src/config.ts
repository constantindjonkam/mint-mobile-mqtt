// Config parser

export interface Config {
  mintPhone: string;
  mintPass: string;
  mqttUrl: string;
  mqttUser?: string;
  mqttPass?: string;
  mqttPrefix: string;
  mqttDiscovery: boolean;
  mqttDiscoveryPrefix: string;
  pollIntervalMins: number;
}

export function loadConfig(): Config {
  const mintPhone = process.env.MINT_PHONE;
  const mintPass = process.env.MINT_PASSWORD;

  if (!mintPhone || !mintPass || mintPass === 'your_password_here') {
    console.error('Error: MINT_PHONE and MINT_PASSWORD must be set in the .env file.');
    process.exit(1);
  }

  const mqttUrl = process.env.MQTT_URL || 'mqtt://localhost:1883';
  const mqttUser = process.env.MQTT_USER || undefined;
  const mqttPass = process.env.MQTT_PASS || undefined;
  const mqttPrefix = process.env.MQTT_PREFIX || 'mintmobile';
  const mqttDiscovery = process.env.MQTT_DISCOVERY !== 'false'; // default true
  const mqttDiscoveryPrefix = process.env.MQTT_DISCOVERY_PREFIX || 'homeassistant';
  const pollIntervalMins = parseInt(process.env.POLL_INTERVAL_MINS || '720', 10);

  if (isNaN(pollIntervalMins) || pollIntervalMins < 60) {
    console.error(
      'Error: POLL_INTERVAL_MINS must be a number greater than or equal to 60 (to protect Mint Mobile API rate limits).',
    );
    process.exit(1);
  }

  return {
    mintPhone,
    mintPass,
    mqttUrl,
    mqttUser,
    mqttPass,
    mqttPrefix,
    mqttDiscovery,
    mqttDiscoveryPrefix,
    pollIntervalMins,
  };
}
