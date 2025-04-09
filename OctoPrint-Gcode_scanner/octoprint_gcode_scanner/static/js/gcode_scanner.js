$(function () {
    // This is the main entry point for the plugin's JavaScript code.
    console.log("GCODE SCANNER Plugin JS loaded");

    // This is basically a tool to listen for any messages sent from the server to the client.
    OctoPrint.socket.onMessage("*", function (message) {
        console.log("🛰️ ANY message:", message);
        if (message?.event === "event") {
            console.log("🔬 Event data:", message.data);
        }
    });

    function GcodeScannerViewModel(parameters) {
        var self = this;
        self.filesViewModel = parameters[0];  // Get OctoPrint's file manager
        self.files = null; // Will hold the file list
        var _selectedFilePath; // Will hold the selected file path
        var _selectedFileName; // Will hold the selected file name

        // Configurable list of potentially malicious G-code commands
        self.maliciousCommands = new Set([
            "M30",  // Delete file from SD card
            "M112", // Emergency stop
            "M500", // Save settings to EEPROM
            "M502", // Reset settings to factory defaults
            "M303", // PID autotune (can overheat components)
            "M140", // Set bed temperature
            "M104", // Set extruder temperature
            "M206", // Offset Z-axis (could crash nozzle into bed)
            "G28",  // Home all axes (unexpected movements)
            "G92"   // Set position (can fake extrusion)
        ]);

        // This will hold the user-added commands
        self.userDefinedCommands = new Set();  // Keep track of user-defined commands

        let passedLogEntries = [];
        let failedLogEntries = [];

        // This function is used to save user-defined commands to local storage
        self.saveUserCommandsToCache = function () {
            const allCommands = [];

            $("#user_commands input[type='checkbox']").each(function () {
                let labelText = $(this).parent().text().trim(); // e.g., "M999 Causes resets"
                let command = labelText.split(" ")[0].toUpperCase();
                let desc = labelText.split(" ").slice(1).join(" ");
                allCommands.push({ command, desc });
            });

            localStorage.setItem("cached_user_gcode_cmds", JSON.stringify(allCommands));
            console.log("Saved user commands to cache:", allCommands);
        };

        self.loadCachedUserCommands = function () {
            const cachedCommands = localStorage.getItem("cached_user_gcode_cmds");
            if (cachedCommands) {
                try {
                    const list = JSON.parse(cachedCommands);
                    list.forEach(entry => {
                        if (!entry.command) return;

                        const cmd = entry.command.toUpperCase();
                        const desc = entry.desc || "";
                        self.userDefinedCommands.add(cmd);

                        const labelHtml = `
                            <label>
                                <input type="checkbox" class="suspicious_cb" value="${cmd}" checked> "${cmd}" ${desc}
                            </label>
                        `;
                        $("#user_commands").append(labelHtml);
                    });

                    self.updateMaliciousCommands(); // Sync with scanner
                } catch (err) {
                    console.error("Error restoring cached G-code commands:", err);
                }
            }
        };

        self.addPassedScans = function (now, fileName, extraNote = "") {
            const box = $("#passed_logs");
            const line = `[${now}] ✅ ${fileName}${extraNote ? " " + extraNote : ""}`;
            const html = `<div>${line}</div>`;
            box.append(html);
        };

        self.addFailedScans = function (now, fileName, command, count, extraNote = "") {
            const box = $("#failed_logs");
            const line = `[${now}] ❌ ${fileName} ⚠️ Warning: ${command} found in ${count} lines.${extraNote ? " " + extraNote : ""}`;
            const html = `<div>${line}</div>`;
            box.append(html);
        };

        // This function is called when the plugin is loaded
        // This function is used to modify the list above. If the user unchecks and checks different 
        // checkboxes, the list will be updated. And the scan will be based off the updated list.
        // Shafiq.
        self.updateMaliciousCommands = function () {
            self.maliciousCommands.clear();  // Delete all of the above. Do we need keep the default ones?
            // Get all checked checkboxes with the class "suspicious_cb"
            $(".suspicious_cb:checked").each(function () {
                self.maliciousCommands.add(this.value.toUpperCase());
            });

            // Right side User-defined checkboxes
            $("#user_commands input[type='checkbox']:checked").each(function () {
                let labelText = $(this).parent().text().trim(); // e.g., "M999 Causes unexpected resets"
                let command = labelText.split(" ")[0].toUpperCase(); // Extract "M999"
                self.maliciousCommands.add(command);
            });


            // Print the updated list to the console for debugging.
            console.log("Updated malicious commands:", Array.from(self.maliciousCommands));
        };

        // Clears all suspicious checkboxes (unchecks everything)
        self.clearSelections = function () {
            $(".suspicious_cb").prop("checked", false);
            self.updateMaliciousCommands();
            console.log(" Cleared all suspicious G-code selections.");
        };

        // Resets all suspicious checkboxes (checks everything)
        self.resetDefaults = function () {
            $(".suspicious_cb").prop("checked", true);
            self.updateMaliciousCommands();
            console.log(" Reset suspicious G-code selections to default.");
        };

        // Clear Logs button section

        // Clears the passed scan logs
        self.clearPassedLog = function () {
            $("#passed_logs").empty();
            console.log("Passed logs cleared.");
        };

        // Clears the failed scan logs
        self.clearFailedLog = function () {
            $("#failed_logs").empty();
            console.log("Failed logs cleared.");
        };


        // This function is called when the user clicks the "Add" button
        // in the user-defined commands section. It allows the user to add custom G-code commands.
        self.userAdd = function () {
            let cmd = prompt("Enter a G-code command (e.g., M999):").trim().toUpperCase();
            if (!cmd || !/^[MG]\d+$/i.test(cmd)) {
                alert("⚠️ Please enter a valid G-code (e.g., M104 or G92)");
                return;
            }
            let desc = prompt("Enter a short description (optional):", "").trim();
            if ($(`#user_commands input[value='${cmd}']`).length > 0) {
                alert("⚠️ This command is already listed.");
                return;
            }

            self.userDefinedCommands.add(cmd);

            let labelHtml = `
                <label>
                    <input type="checkbox" class="suspicious_cb" value="${cmd}" checked> "${cmd}"${desc ? " " + desc : ""}
                </label>
            `;
            $("#user_commands").append(labelHtml);
            self.updateMaliciousCommands();

            // Save to localStorage
            const updatedList = [];
            $("#user_commands label").each(function () {
                const text = $(this).text().trim();
                const parts = text.match(/^"([MG]\d+)"\s*(.*)$/);
                if (parts) {
                    updatedList.push({
                        command: parts[1],
                        desc: parts[2] || ""
                    });
                }
            });
            localStorage.setItem("cached_user_gcode_cmds", JSON.stringify(updatedList));
            console.log("Saved to cache:", updatedList);

            console.log(`Added custom G-code: ${cmd}${desc ? " (" + desc + ")" : ""}`);
        };


        // Clears all user-added commands from the list
        self.deleteCommands = function () {
            $("#user_commands").empty();
            self.userDefinedCommands.forEach(cmd => {
                self.maliciousCommands.delete(cmd);
            });
            self.userDefinedCommands.clear(); // Clear the tracker set
            localStorage.removeItem("cached_user_gcode_cmds"); // Clear the cache

            self.updateMaliciousCommands();
            console.log("User-added commands removed cleanly.");
        };

        // This function is called when the user checks or unchecks a checkbox
        // in the default list of suspicious commands
        $(".suspicious_cb").on("change", function () {
            self.updateMaliciousCommands();
        });

        // This function is called when the user checks or unchecks a checkbox
        // in the user-defined commands section
        $("#user_commands").on("change", "input[type='checkbox']", function () {
            self.updateMaliciousCommands();
        });

        self.populateDropdown = function () {
            const dropdown = $("#gcode_file_select");
            dropdown.empty();
            dropdown.append('<option value="">-- Choose a file --</option>');

            const fileList = self.filesViewModel.allItems(); // Get all files from the file manager

            if (!fileList || fileList.length === 0) {
                console.log("No G-code files found.");
                return;
            }

            fileList.forEach(file => {
                console.log("Adding to dropdown:", file.name, "->", file.path);
                dropdown.append(`<option value="${file.path}">${file.name}</option>`);
            });

            console.log("Dropdown updated successfully.");

        };


        // Ensure it runs when the page loads
        setTimeout(self.populateDropdown, 2000); // Give time for OctoPrint to load files

        // Populate dropdown on page load
        self.populateDropdown();  // This should run once on load  

        setTimeout(() => {
            self.populateDropdown();   // fills the dropdown callnig twice to be safe.
            self.scanAllFiles();       // Should wait and scan AFTER filesViewModel is ready.
        }, 2000);

        // Refresh the dropdown every time it's clicked
        $("#gcode_file_select").on("mousedown", function () {
            self.populateDropdown();
        });

        // This function is called when the page loads to scan all files
        // This function is used to scan all files in the file manager if
        // the user has selected the option to do so. We can add another
        // for the user to select the files to scan. -Shafiq.
        self.scanAllFiles = function () {
            const fileList = self.filesViewModel.allItems();

            if (!fileList || fileList.length === 0) {
                console.log("No G-code files found to scan.");
                return;
            }

            fileList.forEach(file => {
                if (file.name) {
                    console.log("📂 Scanning on page load:", file.name);
                    self.scanGcode(file.name);
                }
            });
        };

        self.populateDropdown(); // Populate the dropdown with files

        self.loadCachedUserCommands(); // Load user-defined commands from cache

        // This function needs some work. It is using hardcoded paths.
        // Will the hardcoded path work on a Mac or Linux system?
        // We need to find a better way to get the file path.
        // Source: https://community.octoprint.org/t/uploading-file-to-octopi-through-the-api-using-javascript/3938
        self.scanGcode = function (filename) {
            // var selectedFile = $("#gcode_file_select").val();
            var selectedFile = filename || $("#gcode_file_select").val(); // Hanldle both cases -Shafiq.

            // Fade out old results smoothly before scanning new files and after selecting a file.
            $("#scan_results").fadeOut(300, function () { });

            if (!selectedFile) {
                console.log("No file selected.");

                // Ensure the scan_results div is visible
                $("#scan_results").show();

                // Update or create an error message
                let errorMessage = $("#scan_message");
                // errorMessage.empty(); // Clear previous results not working. Need to fix this.
                if (errorMessage.length === 0) {
                    $("#scan_results").prepend('<div id="scan_message" class="alert alert-danger">⚠️ Please select a G-code file first!</div>');
                } else {
                    errorMessage.text("⚠️ Please select a G-code file first!").fadeIn();
                }
                // Clear old scan results too
                $("#scan_results_list").empty().hide(); // Remove <li> results

                return;
            }

            // Hide the error when a valid file is selected
            $("#scan_message").fadeOut();

            // This is a hardcoded path. Will this work on a Mac or Linux system?
            // var fileUrl = "/downloads/files/local/" + encodeURIComponent(selectedFile);
            // var path = require('path');
            // var fileUrl = path.join( "downloads","files","local", encodeURIComponent(selectedFile));
            var fileUrl = "/downloads/files/local/" + encodeURIComponent(selectedFile);
            console.log("Fetching file from:", fileUrl);

            $.ajax({
                url: fileUrl,
                type: "GET",
                dataType: "text",
                success: function (data) {
                    // Please note all console.log are for debugging purposes.
                    console.log("File content:", data);
                    console.log("G-code file loaded successfully.");
                    console.log("First 10 lines:\n", data.split("\n").slice(0, 10).join("\n"));
                    // Auto-scan the file after upload is complete
                    // This function is called when a new file is uploaded to OctoPrint

                    // I Removed the a function here. I don't think we need it.

                    // Scan for malicious commands dynamically
                    self.processGcode(data, selectedFile); // Process the G-code content
                    filename = null; // Reset filename to null after processing because we are done with it.

                },
                error: function (xhr) {
                    console.log("Failed to fetch G-code file: " + xhr.responseText);
                }
            });
        };

        // This socket listener is used to detect when a file is uploaded to OctoPrint
        // and then trigger the auto-scan function.
        OctoPrint.socket.onMessage("*", function (message) {
            if (message?.event === "event" && message.data?.type === "Upload") {
                const fileName = message.data.payload?.name;
                if (fileName) {
                    console.log("Upload event detected:", fileName);
                    self.populateDropdown(); // Refresh the dropdown to show the new file
                    self.scanGcode(fileName); // Trigger the scan for the uploaded file
                } else {
                    console.warn("⚠️ Upload event detected but fileName is missing.");
                }
            }
        });


        self.processGcode = function (gcodeContent, selectedFile) {
            console.log("Scanning G-code content..." + selectedFile + " for malicious commands.");
            // I need to add message here saying SCAN RESULTS
            // let newScanMessage = $("#scan_message");
            // newScanMessage.text("SCAN RESULTS")
            //     .css("color", "green")
            //     .css("background-color", "lightgreen")
            //     .fadeIn();
            var detectedIssues = [];
            var gcodeLines = gcodeContent.split("\n");

            gcodeLines.forEach((line, index) => {
                var cleanLine = line.trim().split(";")[0].replace(/\\+$/, ""); // Remove trailing slashes

                self.maliciousCommands.forEach(command => {
                    // This complicated RegExp ensures we match the command at the start of the line
                    // and not as part of a longer command (e.g., "M1041" should not match "M104")
                    // -Shafiq
                    if (new RegExp(`^${command}(\\s|$)`).test(cleanLine.toUpperCase())) {

                        // Ignore safe G92 E0 (normal extruder reset)
                        if (
                            command === "G92" &&
                            /^G92\s+E0\s*(;.*)?$/i.test(line.trim().replace(/\\+$/, ""))
                        ) {
                            return; // Ignore safe G92 E0 (even with comments or backslashes)
                        }

                        // Ignore G28 if it only homes one axis (X, Y, or Z alone)
                        // TODO: Add more checks for G28 to ensure it's safe
                        // such as checking if it homes all axes with zero and nothing greater than zero
                        // Shafiq.
                        if (command === "G28") {
                            let params = cleanLine.replace("G28", "").trim().toUpperCase();

                            // Good Ignore ALL `G28` before line 50
                            if (index < 50) {
                                return;
                            }

                            // Good Ignore safe moves (`G28 X0 Y0`)
                            // If the command is `G28` and it has a Z0 then it is a bad command.
                            // This case needs to be tested. I don't think that this line is enough
                            // so we added the line below to check for Z0.
                            if (params.includes("X0") || params.includes("Y0")) {
                                return;
                            }

                            // Bad Only flag `G28 Z0` (possible nozzle crash)
                            // > line 50
                            if (params.includes("Z0")) {
                                if (!detectedIssues.includes(`⚠️ Warning: Potential unsafe Z-homing on Line ${index + 1}`)) {
                                    detectedIssues.push(`⚠️ Warning: Potential unsafe Z-homing on Line ${index + 1}: ${line}`);
                                }
                            }
                        }

                        let parts = cleanLine.split(" "); // Split command into parts
                        let value = parseFloat(parts[1]?.substring(1)); // Extract numerical value (e.g., M104 **S205**)

                        // Apply safety checks for temperature-based commands
                        if (command === "M104" && value > 260) { // Extruder temp too high
                            detectedIssues.push(`⚠️ Warning: High extruder temp on Line ${index + 1}: ${line}`);
                        } else if (command === "M140" && value > 110) { // Bed temp too high
                            detectedIssues.push(`⚠️ Warning: High bed temp on Line ${index + 1}: ${line}`);
                        } else if (command !== "M104" && command !== "M140") {
                            // Flag all other malicious commands (e.g., M30, M500)
                            detectedIssues.push(`⚠️ Warning: ${command} found on Line ${index + 1}: ${line}`);
                        }
                    }
                });
            });

            // Ensure results are updated in the UI
            var resultList = $("#scan_results_list");
            resultList.empty(); // Clear previous results

            const now = new Date().toLocaleString();

            if (detectedIssues.length === 0) {
                console.log("✅ Scan Passed: No unsafe commands detected.");
                const msg = `✅ Scan Passed: No unsafe commands detected in <b>${selectedFile}</b>.`;
                const logLine = `[${now}] ✅ ${selectedFile} and/or → CRC created @ upload.`;

                resultList.append(`<li style="color: green; font-weight: bold;">${msg}</li>`);
                $("#passed_logs").append(`<div>${logLine}</div>`);

                // Optional scroll to bottom
                const scrollEl = document.getElementById("passed_logs");
                if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
            } else {
                console.log("⚠️ Scan Failed: Unsafe commands found.");

                let match = detectedIssues[0]?.match(/⚠️ Warning: (\w+\d*)/);
                let command = match ? match[1] : "Unknown";
                let count = detectedIssues.length;
                const logLine = `[${now}] ❌ ${selectedFile} ⚠️ Warning: ${command} found in ${count} lines. and/or → CRC chk failed @ print.`;

                $("#failed_logs").append(`<div>${logLine}</div>`);

                resultList.prepend(
                    '<li style="color: red; font-weight: bold;">⚠️ Scan Failed: Unsafe commands found in <b>' + selectedFile + '</b>.</li>'
                );

                // Optional scroll to bottom
                const scrollEl = document.getElementById("failed_logs");
                if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
            }

            $("#scan_results").fadeIn(400); // Ensure the results section is visible
        };

        // Scan Gcode event button
        // $("#scan_gcode_button").off("click").on("click", self.scanGcode); <-- This is the old code. I will keep it here for now.
        $("#scan_gcode_button").off("click").on("click", function () {
            // You can put multiple statements here
            // For example:
            console.log("Scan G-code button clicked");
            filename = null; // This will reset the value of filename to null
            self.scanGcode();  // Call the scan function
            // Additional logic goes here, like resetting variables or handling other conditions
        });

        // Clear Passed Logs Button (Green)
        $("#clear_passed_log").off("click").on("click", function () {
            $("#passed_logs").empty();
            console.log("Cleared passed logs");
        });

        // Clear Failed Logs Button (Red)
        $("#clear_failed_log").off("click").on("click", function () {
            $("#failed_logs").empty();
            console.log("Cleared failed logs");
        });


        // FIX: Listen for checkbox changes inside the ViewModel
        $(".suspicious_cb").on("change", function () {
            self.updateMaliciousCommands();
        });
    }

    // Register the plugin with OctoPrint's view model system
    // filesViewModel is OctoPrint’s built-in Knockout.js ViewModel 
    // that manages file uploads, storage, and selection in the 
    // OctoPrint file manager. It allows plugins to interact with 
    // the list of G-code files stored in OctoPrint.
    OCTOPRINT_VIEWMODELS.push({
        construct: GcodeScannerViewModel,
        dependencies: ["filesViewModel", "settingsViewModel"], // OctoPrint's file manager ViewModel. It allows plugins to interact with the list of G-code files stored in OctoPrint.
        elements: ["#gcode_scanner_tab"],  // The tab where the plugin's UI will be displayed
        name: "gcodeScannerViewModel" // The name of the ViewModel. This is used to register the ViewModel with OctoPrint.
    });
});
// ---
// End of GcodeScannerViewModel function ---

console.log("Global viewModel:", typeof viewModel);

// Listen for when OctoPrint's viewModels are bound
// I am in progress of testing this code. I am not sure if this is the right way to do it.
// I had another idea to where just refresh the list every time the user clicks the dropdown.
// I will test it further and see if it works. -Shafiq.
$(document).on("octoprint.viewModelsBound", function () {
    console.log("viewModelsBound — attaching WebSocket listeners");

    // Upload detection: Upload → auto-scan
    OctoPrint.socket.onMessage("*", function (message) {
        if (message?.event === "event" && message?.data?.type === "Upload") {
            const fileName = message.data.payload?.name;

            console.log("📥 Upload event detected via WS:", fileName);

            const vm = viewModel?.gcodeScannerViewModel;
            if (vm && fileName) {
                setTimeout(() => {
                    // Do something with the fileName
                }, 1000);
            }
        }
    });

    // I will add any existing socket.onMessage("files") or others can below this line.
    // This is where I will add the socket.onMessage("files") or others.
});


// ---
// Community solution from jneilliii.
// Notes: .prependTo() in jQuery moves DOM elements to a new location in the DOM tree.
// This is useful for reordering elements without needing to remove and re-add them manually.
// tabs_content is the main container for all tabs in OctoPrint's UI.
// tab_plugin_gcode_scanner is the ID for the Gcode Scanner plugin tab.
// tabs is the main tab list in OctoPrint's UI.
// - Shafiq
// Move this plugin tab to the front of the OctoPrint UI tab list
// Source pattern inspired by:
// OctoPrint-TabOrder plugin by jneilliii
// https://github.com/jneilliii/OctoPrint-TabOrder/blob/master/octoprint_taborder/static/js/taborder.js
// ---
$(function () {
    // Output to console for debugging
    console.log("Moving Gcode Scanner tab to front");
    const tabPane = $("#tab_plugin_gcode_scanner");
    const tabLink = $("li a[href='#tab_plugin_gcode_scanner']").parent();

    if (tabPane.length && tabLink.length) {
        tabPane.prependTo("#tabs_content");
        tabLink.prependTo("#tabs");
    }
});