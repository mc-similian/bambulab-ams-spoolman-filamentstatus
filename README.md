# Bambulab AMS Spoolman Filament Status

This project integrates a Bambulab AMS system with Spoolman to synchronize filament spool usage. It listens for MQTT updates from the printer and manages spools on Spoolman.

This project is based on the idea of a script from [Diogo Resende](https://github.com/dresende) posted in this issue https://github.com/Donkie/Spoolman/issues/217 

## !! Attention !!
This Solution only Works on Bambu Lab AMS Systems for the P and X Series. The AMS Lite is not supported because it only shows 100% or 0% left on the Spool: [#Issue 4](https://github.com/Rdiger-36/bambulab-ams-spoolman-filamentstatus/issues/4#issuecomment-2550571529)


## Features

- Real-time AMS filament status updates
- Synchronizes spool usage with Spoolman
- Lightweight Docker container for easy deployment
- Web UI for manually merge or create Spools with collected data
- Automatic Mode for automatically merge or create Spools with collected data


## Getting Started

### Prerequisites

- A running instance of Spoolman
- Access to your Bambulab AMS printer with its **serial number**, **access code**, and **IP address**

### Supported Architectures

Simply pulling `ghcr.io/rdiger-36/bambulab-ams-spoolman-filamentstatus:latest` should retrieve the correct image for your arch.

The architectures supported by this image are:

| Architecture | Spoorted |
| :----: | :----: |
| x86-64 | ✅ |
| arm64 | ✅ |
| armhf | ✅ |


### Installation

1. Pull the Docker image:
   ```bash
   docker pull ghcr.io/rdiger-36/bambulab-ams-spoolman-filamentstatus:latest
   ```

2. Run the container:
   ```bash
   docker run -d \
     -e PRINTER_ID=<your_printer_serial> \
     -e PRINTER_CODE=<your_access_code> \
     -e PRINTER_IP=<printer_ip_address> \
     -e SPOOLMAN_IP=<spoolman_ip_address> \
     -e SPOOLMAN_PORT=<spoolman_port> \
     -e UPDATE_INTERVAL=120000 \
     -p 4000:4000 \
     --name bambulab-ams-spoolman-filamentstatus \
    ghcr.io/rdiger-36/bambulab-ams-spoolman-filamentstatus:latest
   ```
   
   or as Docker Compose:
   ```bash
   version: '3.8'
    services:
      bambulab-ams-spoolman-filamentstatus:
        image: ghcr.io/rdiger-36/bambulab-ams-spoolman-filamentstatus:latest
        container_name: bambulab-ams-spoolman-filamentstatus
        environment:
          - PRINTER_ID=<your_printer_serial>
          - PRINTER_CODE=<your_access_code>
          - PRINTER_IP=<printer_ip_address>
          - SPOOLMAN_IP=<spoolman_ip_address>
          - SPOOLMAN_PORT=<spoolman_port>
          - UPDATE_INTERVAL=120000
        restart: unless-stopped
   ```
---

## Environment Variables

| Variable         | Description                                    |
|-------------------|-----------------------------------------------|
| `PRINTER_ID`      | Printer serial number                         |
| `PRINTER_CODE`    | Printer access code                           |
| `PRINTER_IP`      | Local IP address of the printer               |
| `SPOOLMAN_IP`     | IP address of the Spoolman instance           |
| `SPOOLMAN_PORT`   | Port of the Spoolman instance                 |
| `UPDATE_INTERVAL` | Time in ms for updating spools in Spoolman (standard 120000 ms -> 2 minutes) min. 5000 (5 sec), max 3000000 (5 min)|
| `MODE`            | Set the mode of the service: "automatic" or "manual" (standard: manual) |
| `SHOW_LOGS_WEB`   | Enable this to show Logs in WEB UI: "true" or "false" (standard: false)|

---

## Usage

### Checking Logs
Once the container is running, it will automatically connect to the Bambulab AMS system and Spoolman. Logs can be viewed using:

```bash
docker logs -f bambulab-ams-spoolman-filamentstatus
```

Example Output:
```bash
Setting up configuration...
Spoolman connection: true
Checking Vendors...
Vendor "Bambu Lab" exists: true
Checking Extra Field "tag"...
Spoolman Extra Field "tag" for Spool is set: true

Backend running on http://localhost:4000
MQTT client connected
Subscribed to device/YOUR_PRINTER_SERIAL/report
Waiting for MQTT messages...

AMS [A] (hum: 5, temp: 0.0ºC)
    - [A0] PETG HF 000000FF (17%) [[ A012456878ABCDEF ]]
        - A new Filament and Spool can be created:
          Material: PETG, Color: HF Black
    - [A1] PETG Translucent 61B0FF80 (100%) [[ B012456878ABCDEF ]]
        - A new Filament and Spool can be created:
          Material: PETG, Color: Translucent Light Blue
    - [A2] PLA Basic F4EE2AFF (74%) [[ C012456878ABCDEF ]]
        - A new Filament and Spool can be created:
          Material: PLA, Color: Yellow
    - [A3] PLA Matte 9B9EA0FF (98%) [[ D012456878ABCDEF ]]
        - A new Filament and Spool can be created:
          Material: PLA, Color: Matte Ash Gray
```

### How does it work

The Bambu Lab Printers sends their data via MQTT. This Service catches the data and process it automatically to communicate with spoolman.
For this, the container also request Spoolman an its build in API.

The collected data can be used for:
- Merging Spools:
    - If a spool is detected in the AMS that has the same material, colour and remaining weight as a spool in Spoolman that does not have a tag, it can be merged with that spool. The spool's serial number is entered as a value called 'tag' in the spool's extra field. So when the AMS spool and the Spoolman spool are connected, the data is updated (remaining weight and time stamp of last use). 
- Creating Spools:
    - If a spool is detected in the AMS that has no spool in Spoolman, it can be created by using an existing registered filament in Spoolman. In this case, the spool will be created and the tag will also be set.
- Creating Filaments and Spools:
    - If a spool is detected in the AMS that, has no spool in Spoolman and has no matching registered filament, then it all can be created by importing a external filament from the SpoolmanDB that matches to the loaded spool in the AMS. After the filament is created an registered, the spool in Spoolman will be created and the tag will also be set.

### Mode:
There are two modes you can run this container: automatic and manual
- automatic:
    - The above functions are all performed automatically, you dont need to interact with the container
      Preview:
      ```bash
          - [A0] PETG HF 000000FF (18%) [[ A012456878ABCDEF ]]
                - A new Filament and Spool can be created:
                  Material: PETG, Color: HF Black
                  creating Filament and Spool...
                  Filament and Spool successfully created for Spool in AMS Slot => A0!
                                            
                                            ⬇
                                            
          - [A0] PETG HF 000000FF (17%) [[ A012456878ABCDEF ]]
                - Updated Spool-ID 1 => HF Black

        --------------------------------------------------------------------------------------------------

          - [A0] PETG HF 000000FF (18%) [[ A012456878ABCDEF ]]
                - Found mergeable Spool => Spoolman Spool ID: 1, Material: PETG HF, Color: HF Black
                  merging Spool...
                  Spool successfully merged with Spool-ID 1 => HF Black
                                                              
                                            ⬇
                                            
          - [A0] PETG HF 000000FF (17%) [[ A012456878ABCDEF ]]
                - Updated Spool-ID 1 => HF Black

        --------------------------------------------------------------------------------------------------
        
          - [A0] PETG HF 000000FF (18%) [[ 1CEC14C7DB18404FB71B61DBC4549322 ]]
                - A new Spool can be created with following Filament:
                  Material: PETG HF, Color: HF Black
                  creating Spool...
                  Spool successfully created for Spool in AMS Slot => A0!
                                                              
                                            ⬇
                                            
          - [A0] PETG HF 000000FF (17%) [[ A012456878ABCDEF ]]
                - Updated Spool-ID 1 => HF Black
      ```

- manual:
    - The above functions can be accessed by a Web UI which is reachable on http://localhost:4000
      
      Preview:
      ![image](https://github.com/user-attachments/assets/19cbf02b-8db5-4ab7-bb9a-f6e17253cdd1)
      ![Bildschirmfoto 2025-01-04 um 01 33 10](https://github.com/user-attachments/assets/85d9ab66-5afa-45a1-822e-e226c089bc78)

### AMS Infos

| Slot in Log  | Slot on AMS         | Slot in Log  | Slot on AMS      |
|--------------|---------------------|--------------|------------------|
| `A0`         | first AMS, Slot 1   |`B0`          |second AMS, Slot 1|
| `A1`         | first AMS, Slot 2   |`B1`          |second AMS, Slot 2|
| `A2`         | first AMS, Slot 3   |`B2`          |second AMS, Slot 3|
| `A3`         | first AMS, Slot 4   |`B3`          |second AMS, Slot 4|

This will be expanded till D (max. 4 AMS on one Printer)



---

## Spoolman Spool Configuration

There is no configuration needed for your Spoolman Service.

The needed Extra Filed "tag" and the manufacrurer "Bambu Lab" will be automatically created at the start of the container:

```bash
Setting up configuration...
Spoolman connection: true
Checking Vendors...
Vendor "Bambu Lab" exists: false
Creating Vendor "Bambu Lab"...
Vendor "Bambu Lab" successfully created!
Checking Extra Field "tag"...
Spoolman Extra Field "tag" for Spool is set: false
Create Extra Filed "tag" for Spools in Spoolman
Extra Field "tag" successfully created!
```

## FAQ
Q: I can not merge my existing Spool to Spoolman. I can only create a new Spool or the container creates it automatically.

A: Please check your filament, not spool, in spoolman. The material must be the same material from the Web UI or Logs. For example PETG HF could be set as PETG.


## Things and Features I'm Working on
 - Multiple printer Support 
