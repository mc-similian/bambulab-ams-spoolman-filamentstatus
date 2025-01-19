# Bambulab AMS Spoolman Filament Status

This project integrates a Bambulab AMS system with Spoolman to synchronize filament spool usage. It listens for MQTT updates from the printer and manages spools on Spoolman.

Please note that these data represent rough estimates communicated by the AMS!

This project is based on the idea of a script from [Diogo Resende](https://github.com/dresende) posted in this issue https://github.com/Donkie/Spoolman/issues/217 


## !! Attention !!
This Solution only Works on Bambu Lab AMS Systems for the P and X Series. The AMS Lite is not supported because it only shows 100% or 0% left on the Spool: [#Issue 4](https://github.com/Rdiger-36/bambulab-ams-spoolman-filamentstatus/issues/4#issuecomment-2550571529)


## Features

- Real-time AMS filament status updates for all possible AMS on one printer (max. 4)
- Multiple Printer Support (in development status: golden master (will be released soon), can be tested via [dev channel](https://github.com/Rdiger-36/bambulab-ams-spoolman-filamentstatus/tree/main?tab=readme-ov-file#dev-channel))
- Synchronizes spool usage with Spoolman
- Lightweight Docker container for easy deployment
- Web UI for manually merge or create Spools with collected data
- Automatic Mode for automatically merge or create Spools with collected data

## Getting Started

### Prerequisites

- A running instance of Spoolman
- Access to your Bambulab AMS printer with its **serial number**, **access code**, and **IP address**
- Turn on the "Update remaining capacity" option in Bambu Studio:
  ![Bildschirmfoto 2025-01-16 um 18 00 45](https://github.com/user-attachments/assets/fe6cf018-b211-4fd6-8931-1c895842d71b) ![Bildschirmfoto 2025-01-16 um 18 01 44](https://github.com/user-attachments/assets/23c60d83-e5ed-41af-9fbc-24cc9dd8ede7)



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

2. Create your /path/to/your/config/printers/printers.json:
      ```bash
      [
          {
              "name": "Printer 1",
              "id": "01PXXXXXXXXXXXX",
              "code": "AccessCode",
              "ip": "192.168.1.X"
          },
          {
              "name": "Printer 2",
              "id": "01PXXXXXXXXXXXX",
              "code": "AccessCode",
              "ip": "192.168.1.X"
          },
          {
              "name": "Printer 3",
              "id": "01PXXXXXXXXXXXX",
              "code": "AccessCode",
              "ip": "192.168.1.X"
          }
      ]
     ``` 

2. Run the container:
   ```bash
   docker run -d \
     -e SPOOLMAN_IP=<spoolman_ip_address> \
     -e SPOOLMAN_PORT=<spoolman_port> \
     -e UPDATE_INTERVAL=120000 \
     -e MODE=automatic \
     -p 4000:4000 \
     -v /path/to/your/config/printers:/app/printers \
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
        ports:
          - 4000:4000
        environment:
          - SPOOLMAN_IP=<spoolman_ip_address>
          - SPOOLMAN_PORT=<spoolman_port>
          - UPDATE_INTERVAL=120000
          - MODE=automatic
        volumes:
          - /path/to/your/config/printers:/app/printers
        restart: unless-stopped
   ```

## Environment Variables

| Variable         | Description                                    |
|-------------------|-----------------------------------------------|
| `SPOOLMAN_IP`     | IP address of the Spoolman instance           |
| `SPOOLMAN_PORT`   | Port of the Spoolman instance                 |
| `UPDATE_INTERVAL` | Time in ms for updating spools in Spoolman (standard 120000 ms -> 2 minutes) min. 5000 (5 sec), max 3000000 (5 min)|
| `MODE`            | Set the mode of the service: "automatic" or "manual" (standard: manual) |
| `DEBUG`   | Enable this to show more Logs for Debugging (not for WEB UI Logs): "true" or "false" (standard: false)|

Old ENVs (PRINTER_IP, PRINTER_ID, PRINTER_CODE) also works, but will be overwritten if you use multiple printers in printers.json 

## Usage

### Checking Logs
Once the container is running, it will automatically connect to the Bambulab AMS system and Spoolman. Logs can be viewed using:

```bash
docker logs -f bambulab-ams-spoolman-filamentstatus
```

Example Output:
```bash
[LOG] Server - Setting up configuration...
[LOG] Server - Spoolman connection: true
[LOG] Server - Checking Vendors...
[LOG] Server - Vendor "Bambu Lab" exists: true
[LOG] Server - Checking Extra Field "tag"...
[LOG] Server - Spoolman Extra Field "tag" for Spool is set: true
[LOG] Server - Backend running on http://localhost:4000
[LOG] Bambu Lab P1S - MQTT not running for Printer: 01P00A460901001, attempting to reconnect...
[LOG] Bambu Lab P1S - Setting up MQTT connection for Printer: 01P00A460901001...
[LOG] Bambu Lab Test Printer A - MQTT not running for Printer: 0AX12345678, attempting to reconnect...
[LOG] Bambu Lab Test Printer A - Setting up MQTT connection for Printer: 0AX12345678...
[LOG] Bambu Lab Test Printer A - MQTT client connected for Printer: 0AX12345678
[LOG] Bambu Lab Test Printer A - Waiting for MQTT messages for Printer: 0AX12345678...
[LOG] Bambu Lab P1S - MQTT client connected for Printer: 01P00A460901001
[LOG] Bambu Lab P1S - Waiting for MQTT messages for Printer: 01P00A460901001...
[LOG] Bambu Lab Test Printer A - AMS [A] (hum: 5, temp: 0.0ºC)
[LOG] Bambu Lab Test Printer A -     - [A0] ASA-CF 000000FF (85%) [[ XXXXXX000001 ]]
[LOG] Bambu Lab Test Printer A -         - Updated Spool-ID 5 => Black
[LOG] Bambu Lab Test Printer A -     - [A1] PETG Translucent D6ABFFFF (49%) [[ XXXXXX000002 ]]
[LOG] Bambu Lab Test Printer A -         - Updated Spool-ID 6 => Translucent Purple
[LOG] Bambu Lab Test Printer A -     - [A2] PLA Marble AD4E38FF (63%) [[ XXXXXX000003 ]]
[LOG] Bambu Lab Test Printer A -         - Updated Spool-ID 7 => Red Granite
[LOG] Bambu Lab Test Printer A -     - [A3] PLA Galaxy 594177FF (38%) [[ XXXXXX000004 ]]
[LOG] Bambu Lab Test Printer A -         - Updated Spool-ID 8 => Purple Galaxy
[LOG] Bambu Lab Test Printer A -     - [B0] PLA Basic F4EE2AFF (10%) [[ XXXXXX000005 ]]
[LOG] Bambu Lab Test Printer A -         - Updated Spool-ID 9 => Yellow
[LOG] Bambu Lab Test Printer A -     - [B1] TPU for AMS 90FF1AFF (27%) [[ XXXXXX000006 ]]
[LOG] Bambu Lab Test Printer A -         - Updated Spool-ID 10 => For AMS Neon Green
[LOG] Bambu Lab Test Printer A -     - [B2] PLA Basic 00AE42FF (98%) [[ XXXXXX000007 ]]
[LOG] Bambu Lab Test Printer A -         - Updated Spool-ID 11 => Bambu Green
[LOG] Bambu Lab Test Printer A -     - [B3] PLA Matte BB3D43FF (50%) [[ XXXXXX000008 ]]
[LOG] Bambu Lab Test Printer A -         - Updated Spool-ID 12 => Matte Dark Red
[LOG] Bambu Lab Test Printer A - 
[LOG] Bambu Lab P1S - AMS [A] (hum: 5, temp: 0.0ºC)
[LOG] Bambu Lab P1S -     - [A0] PLA Basic 000000FF (15%) [[ XXXXXX00000A ]]
[LOG] Bambu Lab P1S -         - Updated Spool-ID 1 => Black
[LOG] Bambu Lab P1S -     - [A1] PLA Matte 000000FF (32%) [[ XXXXXX00000B ]]
[LOG] Bambu Lab P1S -         - Updated Spool-ID 2 => Matte Charcoal
[LOG] Bambu Lab P1S -     - [A2] PLA Basic FFFFFFFF (100%) [[ XXXXXX00000C ]]
[LOG] Bambu Lab P1S -         - Updated Spool-ID 3 => Jade White
[LOG] Bambu Lab P1S -     - [A3] PLA Basic 000000FF (100%) [[ XXXXXX00000D ]]
[LOG] Bambu Lab P1S -         - Updated Spool-ID 4 => Black
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
      Preview on console:
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

      The above functions can also be accessed by a Web UI which is reachable on http://localhost:4000
      ![Bildschirmfoto 2025-01-19 um 22 23 50](https://github.com/user-attachments/assets/a648f96d-42d2-4c7b-ac36-55ea86ca9b65)

      You will find more infos about it on te Web UI section

- manual:
      In manual mode you can click action buttons to manual merge and create spools and filaments:
      ![Bildschirmfoto 2025-01-04 um 01 33 10](https://github.com/user-attachments/assets/85d9ab66-5afa-45a1-822e-e226c089bc78)

### AMS Infos

| Slot in Log  | Slot on AMS         | Slot in Log  | Slot on AMS      |
|--------------|---------------------|--------------|------------------|
| `A0`         | first AMS, Slot 1   |`B0`          |second AMS, Slot 1|
| `A1`         | first AMS, Slot 2   |`B1`          |second AMS, Slot 2|
| `A2`         | first AMS, Slot 3   |`B2`          |second AMS, Slot 3|
| `A3`         | first AMS, Slot 4   |`B3`          |second AMS, Slot 4|

This will be expanded till D (max. 4 AMS on one Printer)


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

## Web UI
Main Menu:
![Bildschirmfoto 2025-01-19 um 22 23 50](https://github.com/user-attachments/assets/a648f96d-42d2-4c7b-ac36-55ea86ca9b65)

Menubar for seletion Printers, Logs or change Dark-/Lightmode:
![image](https://github.com/user-attachments/assets/c93c95bf-551b-459e-ae8b-b027b37b067d)

Logs can be accessed over the Backend Logs Menubutton (it only display the logs of the selected Printer from the Main Menu):
![Bildschirmfoto 2025-01-19 um 22 38 12](https://github.com/user-attachments/assets/848e35de-ad8a-4826-8264-6a21f5070765)


## Support Me
[![Buy Me a Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/Rdiger36)

## FAQ
Q: I can not merge my existing Spool to Spoolman. I can only create a new Spool or the container creates it automatically.

A: Please check your filament, not spool, in spoolman. The material must be the same material from the Web UI or Logs. For example PETG HF could be set as PETG.

Q: I can not handle my Bambu Lab dual or gradient color Spools with this service.

A: For this filaments i don't have data to check how I can process it. Please send me some logs, so I can implement it!

## Things and Features I'm Working on
 - make the code more stable
