$(function() {
    function GcodeScannerViewModel(parameters) {
        var self = this;
        self.filesViewModel = parameters[0];

        // Function to populate dropdown with G-code files
        self.populateFileDropdown = function() {
            var dropdown = $("#gcode_file_select");
            dropdown.empty();
            dropdown.append('<option value="">-- Choose a file --</option>');

            // Ensure ViewModel is ready
            if (!self.filesViewModel || !self.filesViewModel.listHelper) {
                console.error("Error: filesViewModel is not available.");
                return;
            }

            // Fetch and list G-code files
            var files = self.filesViewModel.listHelper.allItems();
            if (!files || files.length === 0) {
                console.warn("No G-code files found.");
            } else {
                files.forEach(function(file) {
                    if (file.type === "machinecode") { // Only add G-code files
                        dropdown.append('<option value="' + file.name + '">' + file.name + '</option>');
                    }
                });
            }

            console.log("Dropdown populated with files:", files);
        };

        // Function to scan selected file
        self.scanGcode = function() {
            var selectedFile = $("#gcode_file_select").val();
            if (!selectedFile) {
                alert("Please select a G-code file first!");
                return;
            }

            $.ajax({
                url: API_BASEURL + "plugin/gcode_scanner",
                type: "POST",
                contentType: "application/json",
                data: JSON.stringify({ command: "scan", file: selectedFile }),
                success: function(response) {
                    if (response.error) {
                        alert("Error: " + response.error);
                    } else {
                        alert("G28 Found in:\n" + response.home_commands.join("\n"));
                    }
                },
                error: function(xhr) {
                    alert("Failed to scan file: " + xhr.responseText);
                }
            });
        };

        // Ensure files are loaded before populating dropdown
        setTimeout(self.populateFileDropdown, 3000);

        // Bind scan button
        $("#scan_gcode_button").click(self.scanGcode);
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: GcodeScannerViewModel,
        dependencies: ["filesViewModel"],
        elements: ["#gcode_scanner_tab"]
    });
});
