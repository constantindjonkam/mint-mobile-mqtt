// MQTT broker interface and Home Assistant Discovery manager
import mqtt, { MqttClient } from 'mqtt';
import { MintAccountInfo } from './mintApi.js';
import { Config } from './config.js';

export class MintMqttBridge {
  private client: MqttClient;
  private prefix: string;

  constructor(cfg: Config) {
    this.prefix = cfg.mqttPrefix;
    console.log(`[mqtt] Connecting to broker at: ${cfg.mqttUrl}`);
    this.client = mqtt.connect(cfg.mqttUrl, {
      username: cfg.mqttUser,
      password: cfg.mqttPass,
    });

    this.client.on('connect', () => {
      console.log('[mqtt] Connected to MQTT broker.');
    });

    this.client.on('error', (err) => {
      console.error('[mqtt] MQTT connection error:', err);
    });
  }

  private getDevicePayload(phone: string) {
    return {
      identifiers: [`mint_${phone}`],
      name: `Mint Mobile (${phone})`,
      manufacturer: 'Mint Mobile',
      model: 'Mobile Plan',
    };
  }

  private publishJson(topic: string, payload: any, retain = true) {
    this.client.publish(topic, JSON.stringify(payload), { retain });
  }

  private publishRaw(topic: string, payload: string, retain = true) {
    this.client.publish(topic, payload, { retain });
  }

  // Set up HA Discovery for all sensors
  setupDiscovery(phone: string) {
    console.log(`[mqtt] Configuring Home Assistant discovery entities for ${phone}...`);
    const device = this.getDevicePayload(phone);

    const entities = [
      {
        key: 'plan_name',
        name: 'Plan Name',
        icon: 'mdi:card-bulleted-settings',
      },
      {
        key: 'data_used',
        name: 'Data Used',
        unit: 'GB',
        stateClass: 'measurement',
        icon: 'mdi:chart-donut',
      },
      {
        key: 'data_remaining',
        name: 'Data Remaining',
        unit: 'GB',
        stateClass: 'measurement',
        icon: 'mdi:database-import',
      },
      {
        key: 'data_total',
        name: 'Data Total',
        unit: 'GB',
        icon: 'mdi:database',
      },
      {
        key: 'data_percent_used',
        name: 'Data Percent Used',
        unit: '%',
        stateClass: 'measurement',
        icon: 'mdi:percent',
      },
      {
        key: 'cycle_end_date',
        name: 'Cycle End Date',
        deviceClass: 'timestamp',
        icon: 'mdi:calendar-clock',
      },
      {
        key: 'days_remaining',
        name: 'Days Remaining',
        unit: 'days',
        stateClass: 'measurement',
        icon: 'mdi:calendar-range',
      },
    ];

    for (const ent of entities) {
      const configTopic = `${this.prefix}/sensor/mint_${phone}_${ent.key}/config`;
      const stateTopic = `${this.prefix}/sensor/mint_${phone}_${ent.key}/state`;

      const payload: any = {
        name: ent.name,
        unique_id: `mint_${phone}_${ent.key}`,
        state_topic: stateTopic,
        device,
      };

      if (ent.unit) payload.unit_of_meas = ent.unit;
      if (ent.stateClass) payload.stat_cla = ent.stateClass;
      if (ent.deviceClass) payload.dev_cla = ent.deviceClass;
      if (ent.icon) payload.icon = ent.icon;

      this.publishJson(configTopic, payload);
    }
  }

  publishState(data: MintAccountInfo) {
    const phone = data.phone;
    console.log(`[mqtt] Publishing state updates for ${phone}...`);

    const states: Record<string, string | number> = {
      plan_name: data.planName,
      data_used: data.dataUsedGb,
      data_remaining: data.dataRemainingGb,
      data_total: data.dataTotalGb,
      data_percent_used: data.dataPercentUsed,
      cycle_end_date: data.cycleEndDate,
      days_remaining: data.daysRemaining,
    };

    for (const [key, val] of Object.entries(states)) {
      const stateTopic = `${this.prefix}/sensor/mint_${phone}_${key}/state`;
      this.publishRaw(stateTopic, String(val));
    }
  }

  close() {
    this.client.end();
  }
}
