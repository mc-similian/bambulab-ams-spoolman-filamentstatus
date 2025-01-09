import express from "express";
import mqtt from "async-mqtt";
import got from "got";
import { config } from "dotenv";
import cors from "cors";
import path from "path";
import ping from "ping";

// loading .env
config();

const app = express();
const PORT = 4000; // Port for backend --> also used by frontend for Web UI

// Configuration variables for Printer and Spoolman communictaion
const PRINTER_ID = process.env.PRINTER_ID.toUpperCase();
const PRINTER_CODE = process.env.PRINTER_CODE;
const PRINTER_IP = process.env.PRINTER_IP;
const SPOOLMAN_IP = process.env.SPOOLMAN_IP;
const SPOOLMAN_PORT = process.env.SPOOLMAN_PORT;
const UPDATE_INTERVAL = process.env.UPDATE_INTERVAL
  ? Math.min(Math.max(parseInt(process.env.UPDATE_INTERVAL, 10), 5000), 300000)
  : 120000;

/**
 * Set mode for Spool Management:
 *         automatic: automatically merge and create new Spools from the AMS in Spoolman incl. Filament
 *         manual: you can do this by your own with a button klick in the Web UI
 */
const MODE = process.env.MODE || "manual";

// Configuration to show logs in WEB UI
const SHOW_LOGS_WEB = process.env.SHOW_LOGS_WEB || "false";

const RECONNECT_INTERVAL = 60000; // Intervall for try to reconnect once in a minute
const PING_INTERVAL = 5000; // Intervall for ping printer every 5 seconds to be sure if its online

// save original console.log
const originalConsoleLog = console.log;

// save original console.error
const originalConsoleError = console.error;

// Array that contains actual Spool Data from loaded AMS Spools
let spoolData = [];

// Array for save last Spool Data from Spoolman to check for changes
let lastSpoolData = [];

// This vars contains stats for frontend
let mqttStatus = "Disconnected";
let spoolmanStatus = "Disconnected";
let lastMqttAmsUpdate = null;
let lastMqttUpdate = null;
 
let mqttRunning = false; // Status, ob MQTT aktiv läuft

// This vars load Data for processing
let lastAmsData = null;
let vendorID = null;
let lastUpdateTime = new Date();
let extraFieldExists = null;

let blockNewMqttUpdates = false;

// frontend connection
let clients = [];

// Enable Cross-Origin Resource Sharing (CORS) to allow requests from other domains, for reverse proxys
app.use(cors());

// Enable parsing of JSON request bodies
app.use(express.json());

app.use(express.static("public", { maxAge: 0 })); // disable caching

// Configure path for frontend
app.get("/", (req, res) => {
    res.sendFile(path.resolve("public", "index.html"));
});

// override von console.log for api for frontend
console.log = (...args) => {
    const logMessage = `[LOG] ${new Date().toISOString()} - ${args.join(" ")}`;
    originalConsoleLog(logMessage); // logs for origin console

    // send log to api
    clients.forEach(client => {
        client.write(`data: ${JSON.stringify({ type: "log", message: logMessage })}\n\n`);
    });
};

// override von console.log for api for frontend
console.error = (...args) => {
    const errorMessage = `[ERROR] ${new Date().toISOString()} - ${args.join(" ")}`;
    originalConsoleError(errorMessage); // logs for origin console

    // send log to api
    clients.forEach(client => {
        client.write(`data: ${JSON.stringify({ type: "error", message: errorMessage })}\n\n`);
    });
};

// Convert numbers in alphabetical letters
async function num2letter(num) {
    return String.fromCharCode("A".charCodeAt(0) + Number(num));
}

// Fetching actual Spolls from Spoolman
async function getSpoolmanSpools() {
    try {
        const response = await got(`http://${SPOOLMAN_IP}:${SPOOLMAN_PORT}/api/v1/spool`);
        return JSON.parse(response.body);
      } catch (error) {
        console.error("Error fetching spools from Spoolman:", error);
        return [];
      }
}

// Fetching actual internal Filaments from Spoolman
async function getSpoolmanInternalFilaments() {
    try {
           const response = await got(`http://${SPOOLMAN_IP}:${SPOOLMAN_PORT}/api/v1/filament`);
           return JSON.parse(response.body);
      } catch (error) {
        console.error("Error fetching filaments from Spoolman:", error);
        return [];
      }
}

// Fetching actual external Filaments from Spoolman
async function getSpoolmanExternalFilaments() {
      try {
        const response = await got(`http://${SPOOLMAN_IP}:${SPOOLMAN_PORT}/api/v1/external/filament`);
        return JSON.parse(response.body);
      } catch (error) {
        console.error("Error fetching filaments from Spoolman:", error);
        return [];
      }
}

// Fetching actual Vendor from Spoolman, if Bambu Lab not exists as a Vendor, it will be created
async function checkAndSetVendor() {
    console.log('Checking Vendors...');
    
    try {
        const response = await got(`http://${SPOOLMAN_IP}:${SPOOLMAN_PORT}/api/v1/vendor`);
        const vendors = JSON.parse(response.body);

        for (const vendor of vendors) {
            if (vendor.name === "Bambu Lab" || vendor.external_id === "Bambu Lab") {
                vendorID = vendor.id;
                break;
               }
         }

        if (!vendorID) {
            console.log('Vendor "Bambu Lab" exists: false');
            return await createVendor(); // Return the new vendor ID
         } else {
            console.log('Vendor "Bambu Lab" exists: true');
            return true; // Return the existing vendor ID
        }
     } catch (error) {
        console.error("Error fetching and setting vendor for Spoolman:", error);
         throw error;
     }
}

// Create new Vendor Bambu Lab
async function createVendor() {
    
    console.log('Creating Vendor "Bambu Lab"...');
    
    try {
        const manufacturerPayload = {
            name: "Bambu Lab",
            external_id: "Bambu Lab",
            empty_spool_weight: 250
        };

        const manufacturerResponse = await got.post(`http://${SPOOLMAN_IP}:${SPOOLMAN_PORT}/api/v1/vendor`, {
            json: manufacturerPayload,
            responseType: 'json'
        });

        // Check if Vendor creation was successfull
        if (manufacturerResponse.body.id) {
            vendorID = manufacturerResponse.body.id;
            console.log('Vendor "Bambu Lab" successfully created!')
            return true;
        } else {
            return false;
        }
        
    } catch (error) {
        console.error('#####');
        console.error('Vendor creation failed: ', error.message);
        console.error('Error details:', error.manufacturerResponse?.statusCode, error.manufacturerResponse?.body || error.stack);
        console.error('#####');
        throw error;
    }
}

// Fetching actual Extra Field Setting for Spools from Spoolman, if Extra Filed "tag" not exists, it will be created
async function checkAndSetExtraField() {
    console.log('Checking Extra Field "tag"...');
    
    try {
        const response = await got(`http://${SPOOLMAN_IP}:${SPOOLMAN_PORT}/api/v1/field/spool`);
        const fields = JSON.parse(response.body);
        let extraFieldExists = false;

        for (const field of fields) {
            if (field.name === "tag") {
                extraFieldExists = true;
                break;
            }
        }

        if (!extraFieldExists) {
            console.log('Spoolman Extra Field "tag" for Spool is set: false');
            const exists = await createExtraField(); // Await the result of creating the extra field
            return exists;
        } else {
            console.log('Spoolman Extra Field "tag" for Spool is set: true');
            return true; // Return true if the field already exists
        }
    } catch (error) {
        console.error("Error fetching extra tag from Spoolman:", error);
        throw error;
    }
}

// Create a new Extra Field "tag " for Spools in Spoolman
async function createExtraField() {
    
    console.log('Create Extra Filed "tag" for Spools in Spoolman');
    
    try {
        const payload = {
            name: "tag",
            field_type: "text"
        };

        const manufacturerResponse = await got.post(`http://${SPOOLMAN_IP}:${SPOOLMAN_PORT}/api/v1/field/spool/tag`, {
            json: payload,
            responseType: 'json'
        });
        
        // if no error from response, the tag creation was successfull
        extraFieldExists = true;
        console.log('Extra Field "tag" successfully created!');
        return true;
        
    } catch (error) {
        console.error('#####');
        console.error('Extra Field "tag" creation failed: ', error.message);
        console.error('Error details:', error.manufacturerResponse?.statusCode, error.manufacturerResponse?.body || error.stack);
        console.error('#####');
        throw error;
    }
}

// Check if Object only has one item to prevent processing false Data
function hasOnlyId(item) {
    return Object.keys(item).length === 1 && item.hasOwnProperty('id');
}

// Check if Spool with exact Data exists in Spoolman
function findExistingSpool(amsSpool, allSpools) {
    return allSpools.find(spoolmanSpool => {
        const tag = spoolmanSpool.extra?.tag?.replace(/"/g, ''); // Remove quotes from the "tag"
        const colorHex = spoolmanSpool.filament.color_hex;
        const truncatedColor = amsSpool.tray_color.slice(0, 6);
        
        // Return matching spool if material, color, and tag match
        return (
            spoolmanSpool.filament.material === amsSpool.tray_sub_brands &&
            colorHex.toLowerCase() === truncatedColor.toLowerCase() &&
            tag === amsSpool.tray_uuid
        );
    }) || null; // Return null if no matching spool is found
}

// Find matching external Filament from Spoolman to create one if necessary
function findMatchingExternalFilament(amsSpool, externalFilaments) {
    if (!amsSpool) return null;

    // Transformations for material name comparison
    const transformations = [
        (material) => material.toLowerCase(),
        (material) => material.replace(/\s+/g, '_').toLowerCase(),
        (material) => material.split(' ')[0].replace(/[^A-Za-z]/g, '').toLowerCase()
    ];

    // Try each transformation to find a matching filament
    for (const transform of transformations) {
        const transformedMaterial = transform(amsSpool.tray_sub_brands || '');
        const matchingFilament = externalFilaments.find(filament => {
            const colorHex = filament.color_hex || '';
            return filament.id.startsWith(`bambulab_${transformedMaterial}`) &&
                   colorHex.toLowerCase() === amsSpool.tray_color.slice(0,6).toLowerCase();
        });
        if (matchingFilament) return matchingFilament;
    }

    return null; // No match found
}

// Find mergabel Spool in Spoolman with allmost the same stats as the AMS Spool
function findMergeableSpool(amsSpool, allSpools) {
    // Find spools with the same material and color code
    const matchingSpools = allSpools.filter((spoolmanSpool) =>
                                   spoolmanSpool.filament.material.toLowerCase() === amsSpool.tray_sub_brands.toLowerCase() &&
                                   spoolmanSpool.filament.color_hex.toLowerCase() === amsSpool.tray_color.slice(0,6).toLowerCase()
                            );

    // Check if any matching spool can be merged based on weight tolerance
    return matchingSpools.find(spoolmanSpool => {
        const spoolRemainingWeight = (amsSpool.remain / 100) * spoolmanSpool.initial_weight;
        const lowerTolerance = spoolRemainingWeight * 0.85; // -15%
        const upperTolerance = spoolRemainingWeight * 1.15; // +15%

        const weightMatches =
            spoolmanSpool.remaining_weight >= lowerTolerance &&
            spoolmanSpool.remaining_weight <= upperTolerance;

        // Return matching spool if weight matches or if no weight has been used
        return (spoolmanSpool.remaining_weight === 0 || weightMatches || spoolmanSpool.used_weight === 0);
    });
}

// Function to find a matching internal filament based on external filament ID
function findMatchingInternalFilament(externalFilament, internalFilaments) {
    if (!externalFilament) return null;  // Return null if no external filament is provided

    // Find and return the matching internal filament by external ID
    return internalFilaments.find(internalFilament =>
        internalFilament.external_id === externalFilament.id
    ) || null;  // Return null if no match is found
}

// Function to create a new spool in the system
async function createSpool(spoolData) {
    try {
        // Send a POST request to create a new spool with the provided spool data
        const response = await got.post(`http://${SPOOLMAN_IP}:${SPOOLMAN_PORT}/api/v1/spool`, {
            json: {
                filament_id: spoolData.matchingInternalFilament.id,  // Set the internal filament ID
                initial_weight: spoolData.slot.tray_weight,  // Set the tray weight as initial weight
                first_used: Date.now(),  // Set the timestamp for the first use
                extra: {
                    tag: `\"${spoolData.slot.tray_uuid}\"`  // Set the tray UUID as tag
                }
            }
        });

        // Log success message if spool is created successfully
        console.log(`          Spool successfully created for Spool in AMS Slot => ${spoolData.amsId}!`);
    } catch (error) {
        // Log error message if spool creation fails
        console.error('          #####');
        console.error('          Spool creation failed: ', error.message);
        console.error('          Error details:', error.response?.statusCode, error.response?.body || error.stack);
        console.error('          #####');
    }
}

// Function to create both filament and spool in the system
async function createFilamentAndSpool(spoolData) {
    let filamentId;

    try {
        // Prepare the filament data payload
        const filamentPayload = {
            name: spoolData.matchingExternalFilament.name,
            material: spoolData.slot.tray_sub_brands,
            density: spoolData.matchingExternalFilament.density,
            diameter: spoolData.matchingExternalFilament.diameter,
            spool_weight: 250,
            weight: 1000,
            settings_extruder_temp: spoolData.matchingExternalFilament.extruder_temp,
            settings_bed_temp: spoolData.matchingExternalFilament.bed_temp,
            color_hex: spoolData.matchingExternalFilament.color_hex,
            external_id: spoolData.matchingExternalFilament.id,
            spool_type: spoolData.matchingExternalFilament.spool_type,
            color_hexes: spoolData.matchingExternalFilament.color_hexes,
            finish: spoolData.matchingExternalFilament.finish,
            multi_color_direction: spoolData.matchingExternalFilament.multi_color_direction,
            pattern: spoolData.matchingExternalFilament.pattern,
            translucent: spoolData.matchingExternalFilament.translucent,
            glow: spoolData.matchingExternalFilament.glow,
            vendor_id: vendorID,
        };

        // Create filament in the Spoolman system
        const filamentResponse = await got.post(`http://${SPOOLMAN_IP}:${SPOOLMAN_PORT}/api/v1/filament`, {
            json: filamentPayload,
            responseType: 'json'
        });

        filamentId = filamentResponse.body.id;  // Save the filament ID from the response
    } catch (error) {
        // Log error if filament creation fails
        console.error('          #####');
        console.error('          Filament creation failed: ', error.message);
        console.error('          Error details:', error.filamentResponse?.statusCode, error.filamentResponse?.body || error.stack);
        console.error('          #####');
    }

    // If filament creation was successful, create the corresponding spool
    if (filamentId) {
        try {
            // Prepare the spool data payload
            const spoolPayload = {
                filament_id: filamentId,
                initial_weight: spoolData.slot.tray_weight,
                first_used: Date.now(),
                extra: {
                    tag: `\"${spoolData.slot.tray_uuid}\"`
                }
            };

            // Create spool in the Spoolman system
            await got.post(`http://${SPOOLMAN_IP}:${SPOOLMAN_PORT}/api/v1/spool`, {
                json: spoolPayload,
                responseType: 'json'
            });

            // Log success message if both filament and spool were created successfully
            console.log(`          Filament and Spool successfully created for Spool in AMS Slot => ${spoolData.amsId}!`);
        } catch (error) {
            // Log error if spool creation fails
            console.error('          #####');
            console.error('          Spool creation failed: ', error.message);
            console.error('          Error details:', error.spoolResponse?.statusCode, error.spoolResponse?.body || error.stack);
            console.error('          #####');
        }
    }
}

// Function to merge a spool with an existing spool in the system
async function mergeSpool(spoolData) {
    try {
        // Send a PATCH request to update the spool with new tag data
        const response = await got.patch(`http://${SPOOLMAN_IP}:${SPOOLMAN_PORT}/api/v1/spool/${spoolData.mergeableSpool.id}`, {
            json: {
                extra: {
                    tag: `\"${spoolData.slot.tray_uuid}\"`  // Attach tray UUID to the spool's extra field
                }
            }
        });

        // Log success message if the spool merge is successful
        console.log(`          Spool successfully merged with Spool-ID ${spoolData.mergeableSpool.id} => ${spoolData.mergeableSpool.filament.name}`);
    } catch (error) {
        // Log error details if the merge fails
        console.error('          #####');
        console.error('          Spool merge failed: ', error.message);
        console.error('          Error details:', error.response?.statusCode, error.response?.body || error.stack);
        console.error('          #####');
    }
}

async function haveSpoolDataChanged(spools, lastSpoolData) {
    // compare last Spool Data with new fetched data to see if there are any changes
    return spools.length !== lastSpoolData.length ||
           !spools.every((spool, index) => spool.extra.tag === lastSpoolData[index].extra.tag && spool.remaining_weight === lastSpoolData[index].remaining_weight);
}

// Format given Date to readable date
function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}

// Main function for requesting Bambu Lab Printers MQTT Data and prcess it
async function setupMqtt() {
    
    try {
        
        console.log("Setting up MQTT connection...");
        
        // Connect to the MQTT broker using TLS
        const client = await mqtt.connectAsync(`tls://bblp:${PRINTER_CODE}@${PRINTER_IP}:8883`, {
            rejectUnauthorized: false,  // Accept self-signed certificates
            keepalive: 3600,
        });

        mqttStatus = "Connected";  // Set the MQTT status
        mqttRunning = true;
        console.log("MQTT client connected");

        // Subscribe to the MQTT topic for reports
        await client.subscribe(`device/${PRINTER_ID}/report`);
        console.log(`Subscribed to device/${PRINTER_ID}/report`);
        
        client.on("close", () => {
            console.log("MQTT connection closed");
            mqttStatus = "Disconnected";
            mqttRunning = false;
        });

        // Listen for incoming messages
        client.on("message", async (topic, message) => {
            
            if (!blockNewMqttUpdates) {
            
                blockNewMqttUpdates = true;
                
                try {
                    const data = JSON.parse(message);
                    if (data?.print?.ams?.ams) {
                        const currentTime = new Date();
                        let printHeader = false;
                        
                        // Update if the AMS data is stale
                        if (currentTime.getTime() - lastUpdateTime.getTime() > UPDATE_INTERVAL) {
                            const isValidAmsData = data.print.ams.humidity !== "" && data.print.ams.temp !== "";
                        
                            // Fetch data from Spoolman API
                            const spools = await getSpoolmanSpools();
                            const externalFilaments = await getSpoolmanExternalFilaments();
                            const internalFilaments = await getSpoolmanInternalFilaments();
                                    
                            // Chekc if Spool Data changed
                            const spoolsChanged = await haveSpoolDataChanged(spools, lastSpoolData);
                            
                            // If valid AMS data and different from last received, process and Spool Data in Spoolman changed
                            if (isValidAmsData && (spoolsChanged || JSON.stringify(data.print.ams.ams) !== JSON.stringify(lastAmsData))) {
                                printHeader = true;
                                // Reset spool data before updating
                                spoolData = [];
    
                                // Iterate through AMS trays and process each slot
                                for (const ams of data.print.ams.ams) {
                                    if (printHeader) {
                                        console.log('');
                                        console.log(`AMS [${await num2letter(ams.id)}] (hum: ${ams.humidity}, temp: ${ams.temp}ºC)`);
                                        printHeader = false;
                                    }
    
                                    // Process valid tray slots
                                    if (Array.isArray(ams.tray)) {
                                        const validSlots = ams.tray.filter(item => !hasOnlyId(item));
    
                                        if (validSlots.length > 0) {
                                            for (const slot of validSlots) {
                                                // Skip invalid slots
                                                if (slot.remain < 0 || (slot.tray_uuid === "00000000000000000000000000000000" && slot.tray_color == "00000000")) continue;
    
                                                let found = false;
                                                let remainingWeight = "";
                                                let mergeableSpool = null;
                                                let matchingExternalFilament = null;
                                                let matchingInternalFilament = null;
                                                let existingSpool = null;
                                                let option = "No actions available";
                                                let enableButton = "false";
                                                let automatic = false;
    
                                                // Set automatic mode
                                                if (MODE === "automatic") automatic = true;
    
                                                // Adjust PETG Translucent color stats, so its accessable in Spoolman
                                                if (slot.tray_sub_brands === "PETG Translucent" && slot.tray_color === "00000000") {
                                                    slot.tray_color = "FFFFFF00";
                                                }
    
                                                // Find matching filaments for the slot
                                                matchingExternalFilament = await findMatchingExternalFilament(slot, externalFilaments);
                                                matchingInternalFilament = await findMatchingInternalFilament(matchingExternalFilament, internalFilaments);
    
                                                // Check existing spools
                                                for (const spool of spools) {
                                                    if (spool.extra?.tag && JSON.parse(spool.extra.tag) === slot.tray_uuid) {
                                                        found = true;
                                                        remainingWeight = (slot.remain / 100) * slot.tray_weight;
    
                                                        // Update spool if found
                                                        await got.patch(`http://${SPOOLMAN_IP}:${SPOOLMAN_PORT}/api/v1/spool/${spool.id}`, {
                                                            json: {
                                                                remaining_weight: remainingWeight,
                                                                last_used: currentTime
                                                            },
                                                        });
    
                                                        console.log(`    - [${await num2letter(ams.id)}${slot.id}] ${slot.tray_sub_brands} ${slot.tray_color} (${slot.remain}%) [[ ${slot.tray_uuid} ]]`);
                                                        console.log(`        - Updated Spool-ID ${spool.id} => ${spool.filament.name}`);
    
                                                        lastUpdateTime = currentTime;
                                                        existingSpool = spool;
                                                        break;
                                                    }
                                                }
    
                                                // Handle no matching spool found
                                                if (!found) {
                                                    console.log(`    - [${await num2letter(ams.id)}${slot.id}] ${slot.tray_sub_brands} ${slot.tray_color} (${slot.remain}%) [[ ${slot.tray_uuid} ]]`);
    
                                                    // Try to find mergeable spools
                                                    mergeableSpool = await findMergeableSpool(slot, spools);
    
                                                    if (!mergeableSpool) {
                                                        // Create new spool if no matching or mergeable spool found
                                                        existingSpool = await findExistingSpool(slot, spools);
    
                                                        if (!existingSpool) {
                                                            if (matchingInternalFilament) {
                                                                console.log("        - A new Spool can be created with following Filament:");
                                                                console.log(`          Material: ${matchingInternalFilament.material}, Color: ${matchingInternalFilament.name}`);
    
                                                                if (automatic) {
                                                                    console.log(`          creating Spool...`);
                                                                    let info = [];
                                                                    info.push({
                                                                      amsId: (await num2letter(ams.id)) + slot.id,
                                                                      slot,
                                                                      matchingInternalFilament,
                                                                      matchingExternalFilament,
                                                                    });
                                                                    await createSpool(info[0]);
                                                                }
                                                                option = "Create Spool";
                                                            } else if (matchingExternalFilament) {
                                                                // Create new filament and spool if no matching internal filament or existing spool or mergeable spool found
                                                                console.log("        - A new Filament and Spool can be created:");
                                                                console.log(`          Material: ${matchingExternalFilament.material}, Color: ${matchingExternalFilament.name}`);
    
                                                                if (automatic) {
                                                                    console.log(`          creating Filament and Spool...`);
                                                                    let info = [];
                                                                       info.push({
                                                                        amsId: (await num2letter(ams.id)) + slot.id,
                                                                         slot,
                                                                         matchingInternalFilament,
                                                                         matchingExternalFilament,
                                                                       });
                                                                       await createFilamentAndSpool(info[0]);
                                                                }
                                                                option = "Create Filament & Spool";
                                                            }
                                                        }
                                                    } else {
                                                        console.log(`        - Found mergeable Spool => Spoolman Spool ID: ${mergeableSpool.id}, Material: ${mergeableSpool.filament.material}, Color: ${mergeableSpool.filament.name}`);
    
                                                        if (automatic) {
                                                            console.log(`          merging Spool...`);
                                                            let info = [];
                                                               info.push({
                                                                 amsId: (await num2letter(ams.id)) + slot.id,
                                                                 slot,
                                                                 mergeableSpool,
                                                                 matchingInternalFilament,
                                                                 matchingExternalFilament,
                                                               });
                                                            await mergeSpool(info[0]);
                                                        }
                                                        option = "Merge Spool";
                                                    }
    
                                                    // Enable button for manual actions
                                                    if (!automatic) enableButton = "true";
                                                    lastUpdateTime = new Date();
                                                }
    
                                                // Store updated spool data for frontend
                                                spoolData.push({
                                                    amsId: (await num2letter(ams.id)) + slot.id,
                                                    slot,
                                                    mergeableSpool,
                                                    matchingInternalFilament,
                                                    matchingExternalFilament,
                                                    existingSpool,
                                                    option,
                                                    enableButton,
                                                });
                                            }
                                        }
                                    }
                                }
                                
                                lastSpoolData = spools;
                                
                                // Update last MQTT AMS data timestamp
                                lastMqttAmsUpdate = new Date().toISOString();
                                lastAmsData = data.print.ams.ams;
                                console.log("");
                            } else {
                                const UpdateIntSec = UPDATE_INTERVAL / 1000;
                                const nextUpdateTime = new Date(currentTime.getTime() + UPDATE_INTERVAL);
                                const nextUpdate = formatDate(nextUpdateTime);
                                console.log(`No new AMS Data or changes in Spoolman found, wait for next Updates in ${UpdateIntSec} seconds ==> (${nextUpdate})...`);
                                lastUpdateTime = new Date();
                            }
                            
                            clients.forEach(client => {
                              client.write('data: refresh frontend\n\n');
                            });
                            
                            lastMqttUpdate = new Date().toISOString();
                        }
                    }
                } catch (error) {
                    console.error(`Error in message handler: ${error}`);
                }
                blockNewMqttUpdates = false;
            }
        });
        
        console.log("Waiting for MQTT messages...");

    } catch (error) {
        mqttStatus = "Error";
        mqttRunning = false;
        console.error(`Error in setupMqtt: ${error}`);
    }
}

// Starting method for Script with initial process
async function starting() {
    try {
        const spoolmanHealthApi = await got(`http://${SPOOLMAN_IP}:${SPOOLMAN_PORT}/api/v1/health`);
        const spoolmanHealth = JSON.parse(spoolmanHealthApi.body);

        if (spoolmanHealth.status === "healthy") {
            spoolmanStatus = "Connected";
            console.log("Spoolman connection: true");

            // Check vendor and Extra Field
            if (await checkAndSetVendor() && await checkAndSetExtraField()) {
                console.log(`Backend running on http://localhost:${PORT}`);
                setInterval(pingPrinterAndReconnect, PING_INTERVAL);
                setupMqtt();
            } else {
                console.error(`Error: Vendor or Extra Field "tag" could not be set!`);
            }
        } else {
            console.error("Spoolman connection could not be established");
        }
    } catch (error) {
        console.error("Error starting the service:", error);
    }
}

// This keeps the script running even if the printer gets offline.
async function pingPrinterAndReconnect() {
    const isAlive = await ping.promise.probe(PRINTER_IP);
    if (isAlive.alive) {
        if (!mqttRunning) {
            console.log("MQTT not running, attempting to reconnect...");
            setupMqtt();
        }
    } else {
        console.warn(`Printer:${PRINTER_ID} with IP ${PRINTER_IP} is unreachable. Retrying in ${RECONNECT_INTERVAL / 1000}s...`);
        mqttStatus = "Disconnected";
        mqttRunning = false;
    }
}

// REST API endpoint to provide status information to the frontend
app.get("/api/status", (req, res) => {
    res.json({
        spoolmanStatus,
        mqttStatus,
        lastMqttUpdate,
        lastMqttAmsUpdate,
        PRINTER_ID,
        MODE,
        SHOW_LOGS_WEB,
    });
});

// REST API endpoint to fetch spool data
app.get("/api/spools", (req, res) => {
    const updatedSpoolData = spoolData.map((spool) => {
        return spool;
    });

    res.json(updatedSpoolData); // Return the updated spool data
});

// REST API endpoint to merge a spool
app.post("/api/mergeSpool", async (req, res) => {
    await mergeSpool(req.body);
});

// REST API endpoint to create a new spool
app.post("/api/createSpool", async (req, res) => {
    await createSpool(req.body);
});

// REST API endpoint to create a new spool along with filament
app.post("/api/createSpoolWithFilament", async (req, res) => {
    await createFilamentAndSpool(req.body);
});

// Event source for Server-Sent Events (SSE) connection
app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders(); // Ensure headers are sent immediately

    // Add the current client connection to the list
    clients.push(res);

    // Remove the client connection when it disconnects
    req.on("close", () => {
        clients = clients.filter((client) => client !== res);
    });
});

// Start the backend server and initialize configuration
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Setting up configuration...`);
    starting(); // Begin application setup process
});
