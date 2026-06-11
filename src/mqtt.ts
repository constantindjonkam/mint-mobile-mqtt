// MQTT broker interface and Home Assistant Discovery manager
import mqtt, { MqttClient } from 'mqtt';
import { MintAccountInfo } from './mintApi.js';
import { Config } from './config.js';

export class MintMqttBridge {
  private client: MqttClient;
  private prefix: string;
  private discoveryEnabled: boolean;
  private discoveryPrefix: string;

  constructor(cfg: Config) {
    this.prefix = cfg.mqttPrefix;
    this.discoveryEnabled = cfg.mqttDiscovery;
    this.discoveryPrefix = cfg.mqttDiscoveryPrefix;

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
    const last4 = phone.slice(-4);
    return {
      identifiers: [`mint_${last4}`],
      name: `Mint Mobile ...${last4}`,
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

  private getStateTopic(phone: string, key: string): string {
    return this.prefix === 'homeassistant'
      ? `homeassistant/sensor/mint_${phone}_${key}/state`
      : `${this.prefix}/${phone}/sensor/${key}/state`;
  }

  // Set up HA Discovery for all sensors
  setupDiscovery(phone: string) {
    if (!this.discoveryEnabled) {
      return; // Skip HA Discovery configs completely if disabled
    }

    console.log(`[mqtt] Configuring Home Assistant discovery entities for ${phone}...`);
    const device = this.getDevicePayload(phone);
    const last4 = phone.slice(-4);

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
      {
        key: 'plan_months',
        name: 'Plan Months Purchased',
        unit: 'months',
        icon: 'mdi:calendar-multiselect',
      },
      {
        key: 'plan_days_remaining',
        name: 'Days Remaining for Plan',
        unit: 'days',
        stateClass: 'measurement',
        icon: 'mdi:calendar-check',
      },
      {
        key: 'phone_number',
        name: 'Phone Number',
        icon: 'mdi:phone',
      },
      {
        key: 'line_name',
        name: 'Line Name',
        icon: 'mdi:account',
      },
      {
        key: 'last_updated',
        name: 'Last Updated',
        deviceClass: 'timestamp',
        icon: 'mdi:clock-outline',
      },
    ];

    for (const ent of entities) {
      const configTopic = `${this.discoveryPrefix}/sensor/mint_${phone}_${ent.key}/config`;
      const stateTopic = this.getStateTopic(phone, ent.key);

      const payload: any = {
        name: ent.name,
        unique_id: `mint_${last4}_${ent.key}`,
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
      plan_months: data.planMonths,
      plan_days_remaining: data.daysRemainingPlan,
      phone_number: data.phone,
      line_name: data.lineName,
      last_updated: data.lastUpdated,
    };

    for (const [key, val] of Object.entries(states)) {
      const stateTopic = this.getStateTopic(phone, key);
      this.publishRaw(stateTopic, String(val));
    }
  }

  close() {
    this.client.end();
  }
}

