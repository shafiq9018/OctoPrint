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

        // This function is called when the user clicks the "Add" button
        // in the user-defined commands section. It allows the user to add custom G-code commands.
        self.userAdd = function () {
            let cmd = prompt("Enter a G-code command (e.g., M999):").trim().toUpperCase();
            if (!cmd || !/^M\d+$/.test(cmd)) {
                alert("❌ Please enter a valid G-code (e.g., M999)");
                return;
            }
            let desc = prompt("Enter a short description (optional):", "").trim();
            // Avoid duplicates
            if ($(`#user_commands input[value='${cmd}']`).length > 0) {
                alert("⚠️ This command is already listed.");
                return;
            }
            let labelHtml = `
                <label>
                    <input type="checkbox" class="suspicious_cb" value="${cmd}" checked> ${cmd}${desc ? " – " + desc : ""}
                </label>
            `;
            $("#user_commands").append(labelHtml);
            self.updateMaliciousCommands();
            console.log(`Added custom G-code: ${cmd}${desc ? " (" + desc + ")" : ""}`);
        };

        // Clears all user-added commands from the list
        self.deleteCommands = function () {
            $("#user_commands").empty();
        
            // Just delete the user-added ones from maliciousCommands
            self.userAddedCommands.forEach(cmd => {
                self.maliciousCommands.delete(cmd);
            });
        
            self.userAddedCommands.clear(); // Optional: reset the tracker
        
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
        self.populateDropdown();

        // Refresh the dropdown every time it's clicked
        $("#gcode_file_select").on("mousedown", function () {
            self.populateDropdown();
        });

        // This function needs some work. It is using hardcoded paths.
        // Will the hardcoded path work on a Mac or Linux system?
        // We need to find a better way to get the file path.
        // Source: https://community.octoprint.org/t/uploading-file-to-octopi-through-the-api-using-javascript/3938
        self.scanGcode = function () {
            var selectedFile = $("#gcode_file_select").val();

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
                },
                error: function (xhr) {
                    console.log("Failed to fetch G-code file: " + xhr.responseText);
                }
            });
        };

        self.processGcode = function (gcodeContent, selectedFile) {
            console.log("Scanning G-code content...");
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
            // Ensure results are updated in the UI
            var resultList = $("#scan_results_list");
            resultList.empty(); // Clear previous results

            if (detectedIssues.length === 0) {
                console.log("✅ Scan Passed: No unsafe commands detected.");
                resultList.append(
                    '<li style="color: green; font-weight: bold;">✅ Scan Passed: No unsafe commands detected in <b>' + selectedFile + '</b>.</li>'
                );
            } else {
                console.log("⚠️ Scan Failed: Unsafe commands found.");
                detectedIssues.forEach(issue => {
                    resultList.append("<li>" + issue + "</li>");
                });
                resultList.prepend(
                    '<li style="color: red; font-weight: bold;">⚠️ Scan Failed: Unsafe commands found in <b>' + selectedFile + '</b>.</li>'
                );
            }
            $("#scan_results").fadeIn(400); // Ensure the results section is visible
        };

        
        // Add this outside scanGcode, just below self.scanGcode
        self.autoScanNewFile = function (fileName) {
            if (!fileName.toLowerCase().endsWith(".gcode")) return;

            console.log("🔍 Auto-scanning uploaded file:", fileName);
            $("#gcode_file_select").val(fileName); // visually select it
            const fileUrl = "/downloads/files/local/" + encodeURIComponent(fileName);

            $.ajax({
                url: fileUrl,
                type: "GET",
                dataType: "text",
                success: function (data) {
                    self.processGcode(data, fileName);
                },
                error: function (xhr) {
                    console.error("❌ Failed to fetch uploaded G-code:", xhr.responseText);
                }
            });
        };

        // Scan Gcode event button
        $("#scan_gcode_button").off("click").on("click", self.scanGcode);

        // ✅ FIX: Listen for checkbox changes inside the ViewModel
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
                    vm.populateDropdown();
                    vm.autoScanNewFile(fileName);
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