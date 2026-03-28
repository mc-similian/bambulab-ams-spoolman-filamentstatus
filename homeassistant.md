# Home Assistant Integration

This guide explains how to integrate the AMS Spoolman Filament Status tool with Home Assistant via MQTT.

## Prerequisites

- Home Assistant with the [MQTT integration](https://www.home-assistant.io/integrations/mqtt/) configured
- An MQTT broker (e.g., Mosquitto) accessible by both Home Assistant and this application
- The HA MQTT connection configured in the web UI under **HA MQTT Settings**

## How It Works

When the application detects **multiple matching spools** for an AMS slot (and cannot automatically decide which one to merge), it publishes an MQTT event. Home Assistant can listen for this event and send an **actionable notification** to your phone, allowing you to select the correct spool directly from the notification.

### MQTT Topics

| Topic | Direction | Description |
|---|---|---|
| `{baseTopic}/events/{printer_id}/spool_selection` | App -> HA | Published when multiple spool candidates are found. Retained message, cleared after merge. |
| `{baseTopic}/commands/merge_spool` | HA -> App | Send a merge command with the selected spool ID. |
| `{baseTopic}/events/{printer_id}/merge_result` | App -> HA | Confirmation after a successful merge. |
| `{baseTopic}/test` | App -> HA | Test message when using "Test Connection" in the UI. |

The default `baseTopic` is `bambulab-ams-spoolman` (configurable in the web UI).

### Event Payload (`spool_selection`)

```json
{
  "printer_id": "01P00A000000000",
  "printer_name": "My Printer",
  "ams_slot": "A0",
  "slot_uuid": "0A0B0C0D0E0F0000",
  "material": "PLA Basic",
  "color": "00FF00FF",
  "remain_percent": 75,
  "candidates": [
    {
      "spool_id": 12,
      "material": "PLA",
      "name": "Green PLA",
      "remaining_weight": 750
    },
    {
      "spool_id": 34,
      "material": "PLA",
      "name": "Green PLA Matte",
      "remaining_weight": 800
    }
  ]
}
```

### Command Payload (`merge_spool`)

```json
{
  "printer_id": "01P00A000000000",
  "ams_slot": "A0",
  "spool_id": 12
}
```

---

## Home Assistant Configuration

### 1. MQTT Sensor (optional)

Add an MQTT sensor to track pending spool selections. Add this to your `configuration.yaml` or via the UI:

```yaml
mqtt:
  sensor:
    - name: "AMS Spool Selection Needed"
      state_topic: "bambulab-ams-spoolman/events/+/spool_selection"
      value_template: >-
        {% if value %}
          {{ (value | from_json).ams_slot }} - {{ (value | from_json).material }}
        {% else %}
          None
        {% endif %}
      json_attributes_topic: "bambulab-ams-spoolman/events/+/spool_selection"
      json_attributes_template: "{{ value }}"
```

### 2. Automation: Actionable Notification

This automation sends an actionable notification to your phone when a spool selection is needed. Each candidate spool becomes a selectable action on the notification.

```yaml
automation:
  - alias: "AMS Spool Selection Notification"
    description: "Send actionable notification when AMS has multiple matching spools"
    triggers:
      - trigger: mqtt
        topic: "bambulab-ams-spoolman/events/+/spool_selection"
    conditions:
      - condition: template
        value_template: "{{ trigger.payload | length > 0 }}"
    actions:
      - variables:
          payload: "{{ trigger.payload | from_json }}"
          candidates: "{{ payload.candidates }}"
      - action: notify.mobile_app_YOUR_PHONE
        data:
          title: "AMS Spool Selection Required"
          message: >-
            Printer {{ payload.printer_name }} - Slot {{ payload.ams_slot }}:
            {{ payload.material }} ({{ payload.remain_percent }}% remaining).
            {{ candidates | length }} matching spools found.
          data:
            actions: >-
              {{ candidates | map(attribute='spool_id') | map('string') | map('regex_replace', '^(.*)$', '{"action": "merge_spool_\\1", "title": "' ) | list | join('') }}
            # HA companion app needs a static action list - use the template below instead:
            actions:
              - action: "merge_spool_{{ candidates[0].spool_id }}"
                title: "{{ candidates[0].name }} ({{ candidates[0].remaining_weight }}g)"
              - action: "merge_spool_{{ candidates[1].spool_id if candidates | length > 1 else candidates[0].spool_id }}"
                title: "{{ candidates[1].name if candidates | length > 1 else 'N/A' }} ({{ candidates[1].remaining_weight if candidates | length > 1 else 0 }}g)"
                enabled: "{{ candidates | length > 1 }}"
              - action: "merge_spool_{{ candidates[2].spool_id if candidates | length > 2 else candidates[0].spool_id }}"
                title: "{{ candidates[2].name if candidates | length > 2 else 'N/A' }} ({{ candidates[2].remaining_weight if candidates | length > 2 else 0 }}g)"
                enabled: "{{ candidates | length > 2 }}"
            tag: "ams-spool-selection-{{ payload.printer_id }}-{{ payload.ams_slot }}"
            persistent: true
```

### 3. Automation: Handle Notification Response

This automation listens for the notification action and sends the merge command back via MQTT.

```yaml
automation:
  - alias: "AMS Spool Selection Response"
    description: "Handle actionable notification response and send merge command"
    triggers:
      - trigger: event
        event_type: mobile_app_notification_action
    conditions:
      - condition: template
        value_template: "{{ trigger.event.data.action.startswith('merge_spool_') }}"
    actions:
      - variables:
          spool_id: "{{ trigger.event.data.action.replace('merge_spool_', '') | int }}"
          # The tag contains printer_id and ams_slot
          tag_parts: "{{ trigger.event.data.tag | default('') }}"
      - action: mqtt.publish
        data:
          topic: "bambulab-ams-spoolman/commands/merge_spool"
          payload: >-
            {{ {"printer_id": states.sensor.ams_spool_selection_needed.attributes.printer_id,
                "ams_slot": states.sensor.ams_spool_selection_needed.attributes.ams_slot,
                "spool_id": spool_id} | to_json }}
```

### Alternative: Simplified Automation with Input Helpers

If you prefer more control, you can use an `input_select` helper to track the state and a script to send the command.

#### Script: Merge Spool

```yaml
script:
  merge_ams_spool:
    alias: "Merge AMS Spool"
    description: "Send merge command to AMS Spoolman Filament Status"
    fields:
      printer_id:
        description: "Printer serial number"
        example: "01P00A000000000"
        required: true
      ams_slot:
        description: "AMS slot identifier"
        example: "A0"
        required: true
      spool_id:
        description: "Spoolman spool ID to merge with"
        example: 12
        required: true
    sequence:
      - action: mqtt.publish
        data:
          topic: "bambulab-ams-spoolman/commands/merge_spool"
          payload: >-
            {{ {"printer_id": printer_id, "ams_slot": ams_slot, "spool_id": spool_id} | to_json }}
```

### 4. Automation: Merge Confirmation

Optionally, get notified when a merge was successful:

```yaml
automation:
  - alias: "AMS Spool Merge Confirmation"
    triggers:
      - trigger: mqtt
        topic: "bambulab-ams-spoolman/events/+/merge_result"
    actions:
      - variables:
          result: "{{ trigger.payload | from_json }}"
      - action: notify.mobile_app_YOUR_PHONE
        data:
          title: "AMS Spool Merged"
          message: "Slot {{ result.ams_slot }} merged with Spool ID {{ result.spool_id }}"
          data:
            tag: "ams-spool-selection-{{ result.printer_id }}-{{ result.ams_slot }}"
```

---

## Setup Steps

1. Open the web UI of this application
2. Click **HA MQTT Settings** in the menu bar
3. Enable the integration and enter your MQTT broker details (host, port, credentials)
4. Click **Test Connection** to verify
5. Click **Save**
6. Copy the automations above into your Home Assistant configuration
7. Replace `notify.mobile_app_YOUR_PHONE` with your actual mobile app notification service
8. Adjust the `baseTopic` in the YAML if you changed it from the default
9. Reload automations in Home Assistant

## Troubleshooting

- Check the application logs for `HA MQTT` messages
- Verify your MQTT broker is reachable from the Docker container
- Use an MQTT client (e.g., MQTT Explorer) to monitor the topics
- Make sure the MQTT user has publish and subscribe permissions on the configured base topic
