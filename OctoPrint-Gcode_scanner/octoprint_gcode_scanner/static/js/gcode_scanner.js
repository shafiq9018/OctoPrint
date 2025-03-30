$(function() {
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

        // 🔹 ADDED: Load malicious commands from localStorage
        self.loadMaliciousCommands = function() {
            const stored = localStorage.getItem("maliciousCommands");
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    parsed.forEach(cmd => self.maliciousCommands.add(cmd));
                } catch (e) {
                    console.warn("⚠️ Failed to load malicious commands.");
                }
            }
        };

        // 🔹 ADDED: Save malicious commands to localStorage
        self.saveMaliciousCommands = function() {
            localStorage.setItem("maliciousCommands", JSON.stringify(Array.from(self.maliciousCommands)));
        };

        // 🔹 ADDED: Describe each command
        self.describeCommand = function(cmd) {
            const descriptions = {
                "M30": "Delete file from SD card",
                "M112": "Emergency stop",
                "M500": "Save settings to EEPROM",
                "M502": "Reset settings to factory defaults",
                "M303": "PID autotune (can overheat components)",
                "M140": "Set bed temperature",
                "M104": "Set extruder temperature",
                "M206": "Offset Z-axis (could crash nozzle into bed)",
                "G28": "Home all axes (unexpected movements)",
                "G92": "Set position (can fake extrusion)"
            };
            return descriptions[cmd] || "User-added command";
        };

        // 🔹 ADDED: Render checkboxes dynamically
        self.renderCommandCheckboxes = function() {
            const container = $("#malicious_commands_checkboxes");
            container.empty();

            Array.from(self.maliciousCommands).sort().forEach(cmd => {
                const isUserAdded = ![...descriptions.keys()].includes(cmd);

                const row = $(`
                    <div style="margin-bottom: 4px;">
                        <label>
                            <input type="checkbox" class="malicious-cmd-checkbox" data-command="${cmd}" checked />
                            <code>${cmd}</code> — ${self.describeCommand(cmd)}
                            ${isUserAdded ? '<button class="remove-cmd-btn" data-command="' + cmd + '" style="margin-left: 5px;">🗑</button>' : ''}
                        </label>
                    </div>
                `);
                container.append(row);
            });
        };

        // ✅ Initialize checkbox state and load from storage
        self.loadMaliciousCommands();
        self.renderCommandCheckboxes();

        // ✅ Wire button click: toggle list
        $("#toggle_command_list").off("click").on("click", function () {
            const list = $("#malicious_commands_checkboxes");
            const isVisible = list.is(":visible");
            list.toggle();
            $(this).text((isVisible ? "▶️" : "🔽") + " Malicious Command Library");
        });

        // ✅ Wire button click: add new command
        $("#add_command_button").off("click").on("click", function () {
            const newCmd = $("#new_command_input").val().trim().toUpperCase();
            if (/^[GMT]\d{1,4}$/.test(newCmd) && !self.maliciousCommands.has(newCmd)) {
                self.maliciousCommands.add(newCmd);
                $("#new_command_input").val("");
                self.saveMaliciousCommands();
                self.renderCommandCheckboxes();
            } else {
                alert("Invalid or duplicate command.");
            }
        });

        // ✅ Wire button click: remove selected commands
        $("#remove_selected_button").off("click").on("click", function () {
            $(".malicious-cmd-checkbox:checked").each(function () {
                const cmd = $(this).data("command");
                if (!self.describeCommand(cmd)) {
                    self.maliciousCommands.delete(cmd);
                }
            });
            self.saveMaliciousCommands();
            self.renderCommandCheckboxes();
        });

        // ✅ Wire dynamic 🗑 buttons
        $(document).on("click", ".remove-cmd-btn", function (e) {
            e.preventDefault();
            const cmd = $(this).data("command");
            self.maliciousCommands.delete(cmd);
            self.saveMaliciousCommands();
            self.renderCommandCheckboxes();
        });


        // Ensure it runs when the page loads
        setTimeout(self.populateDropdown, 2000); // Give time for OctoPrint to load files

        // Populate dropdown on page load
        self.populateDropdown();



        // Adding code for the button to scan the selected file.
        // 

        // This function needs some work. It is using hardcoded paths.
        // Will the hardcoded path work on a Mac or Linux system?
        // We need to find a better way to get the file path.
        // Source: https://community.octoprint.org/t/uploading-file-to-octopi-through-the-api-using-javascript/3938
        self.scanGcode = function() {
            var selectedFile = $("#gcode_file_select").val();

            // Fade out old results smoothly before scanning new files and after selecting a file.
            $("#scan_results").fadeOut(300, function () {});
                   
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
               success: function(data) {
                // Please note all console.log are for debugging purposes.
                   console.log("File content:", data);
                   console.log("G-code file loaded successfully.");
                   console.log("First 10 lines:\n", data.split("\n").slice(0, 10).join("\n"));

                   // Scan for malicious commands dynamically
                   self.processGcode(data, selectedFile); // Process the G-code content
               },
               error: function(xhr) {
                   console.log("Failed to fetch G-code file: " + xhr.responseText);
               }
           });
       };

       self.processGcode = function(gcodeContent, selectedFile) {
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
            var cleanLine = line.trim().split(";")[0]; // Remove comments
    
            self.maliciousCommands.forEach(command => {
                // This complicated RegExp ensures we match the command at the start of the line
                // and not as part of a longer command (e.g., "M1041" should not match "M104")
                // -Shafiq
                if (new RegExp(`^${command}(\\s|$)`).test(cleanLine.toUpperCase())) {

                    // Ignore safe G92 E0 (normal extruder reset)
                    if (
                        (command === "G92" && cleanLine.trim().toUpperCase() === "G92 E0")
                    ) {
                        return; // Skip these safe cases but continue scanning other commands
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
        
            if (detectedIssues.length === 0) {
                console.log("✅ Scan Passed: No unsafe commands detected.");
                resultList.append('<li style="color: green; font-weight: bold;">✅ Scan Passed: No unsafe commands detected in <b>' + selectedFile + '</b>.</li>');
            } else {
                console.log("⚠️ Scan Failed: Unsafe commands found.");
                detectedIssues.forEach(issue => {
                    resultList.append("<li>" + issue + "</li>");
                });
                resultList.prepend('<li style="color: red; font-weight: bold;">⚠️ Scan Failed: Unsafe commands found in <b>' + selectedFile + '</b>.</li>');
            }
            
            $("#scan_results").fadeIn(400); // Ensure the results section is visible
        };

        // This function loads the malicious commands from local storage
        // and populates the checkboxes in the UI.
        // This function is called when the plugin is initialized.
        self.loadMaliciousCommands();
        self.renderCommandCheckboxes();

        // Scan Gcode event button
        $("#scan_gcode_button").off("click").on("click", self.scanGcode);        

    }

    // In progress to test. Trying to retreive downloads folder by using children instead of hardcoding paths.
    // If the above works for all environments, do we need this function?
    // Source: OctoPrint-GcodeEditor-master\octoprint_GcodeEditor\static\js\GcodeEditor.js
    // TODO: Test this function to see if it works on all OS environments.
    function getGcodeFiles() {
        var filesVM = ko.dataFor(document.querySelector("#files_wrapper"));
        if (!filesVM) {
            console.error("Files ViewModel not available.");
            return [];
        }
    
        var fileList = filesVM.listHelper.items();
        if (!fileList || fileList.length === 0) return [];
    
        return fileList.map(file => ({
            name: file.name,
            path: file.path || "No path available",
            download: file.refs?.download || "No download URL",
        }));
    }

    // FIX: Moved the function outside of the `GcodeScannerViewModel` to avoid redefining it on every instance.
    // Function to get filesViewModel
    function getFilesViewModel() {
        var filesViewModel = ko.dataFor(document.querySelector("#files_wrapper"));
        if (!filesViewModel) {
            console.log("filesViewModel not found.");
            return null;
        }
        return filesViewModel;
    }

    // Moved function outside of the `GcodeScannerViewModel` to avoid redefining it on every instance.
    function getGcodeFiles() {
        var filesViewModel = getFilesViewModel();
        if (!filesViewModel) return [];

        var fileList = filesViewModel.allItems();
        if (!fileList || fileList.length === 0) {
            console.log("No G-code files found.");
            return [];
        }
        return fileList;
    }


    // Moved function outside of the `GcodeScannerViewModel` to avoid redefining it on every instance.
    // Source https://github.com/ieatacid/OctoPrint-GcodeEditor/blob/master/octoprint_GcodeEditor/static/js/GcodeEditor.js
    function getRootFilePath() {
        var entry = self.File.listHelper.allItems[0];
        if (entry && !entry.hasOwnProperty("parent")) {
            var root = { children: {} };
            // 🔹 FIX: Added `{}` to properly format the loop.
            for (var index in self.files.listHelper.allItems) {
                root.children[index] = self.files.listHelper.allItems[index];
            }
            return root;
        }
        while (entry && entry.hasOwnProperty("parent") && typeof entry["parent"] !== "undefined") {
            entry = entry["parent"];
        }
        return entry;
    }

    // I removed this function from the `GcodeScannerViewModel` because it is not used right now.
    // Source https://github.com/ieatacid/OctoPrint-GcodeEditor/blob/master/octoprint_GcodeEditor/static/js/GcodeEditor.js
    function getGcodePathAndName(entry, gcodeUrl) {
        if (entry && entry.hasOwnProperty("children")) {
            for (var child in entry.children) {
                var value = getGcodePathAndName(entry.children[child], gcodeUrl);
                if (typeof value !== "undefined") {
                    return value; // 🔹 FIX: Missing return statement inside `if`.
                }
            }
        } else if (entry && entry.hasOwnProperty("name") && entry.refs && entry.refs.hasOwnProperty("download") && entry["refs"]["download"] === gcodeUrl) {
            return (typeof self.files.currentPath !== "undefined" ? "/" : "") + 
                (entry.hasOwnProperty("path") ? entry["path"] : entry["name"]);
        }
    }

    // Scan Gcode event button
    $("#scan_gcode_button").off("click").on("click", self.scanGcode);
    
    // Register the plugin with OctoPrint's view model system
    // filesViewModel is OctoPrint’s built-in Knockout.js ViewModel 
    // that manages file uploads, storage, and selection in the 
    // OctoPrint file manager. It allows plugins to interact with 
    // the list of G-code files stored in OctoPrint.
    OCTOPRINT_VIEWMODELS.push({
        construct: GcodeScannerViewModel,
        dependencies: ["filesViewModel"], // OctoPrint's file manager ViewModel. It allows plugins to interact with the list of G-code files stored in OctoPrint.
        elements: ["#gcode_scanner_tab"]  // The tab where the plugin's UI will be displayed
    });
});
