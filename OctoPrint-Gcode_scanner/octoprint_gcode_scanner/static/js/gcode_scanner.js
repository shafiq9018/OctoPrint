$(function() {
    function GcodeScannerViewModel(parameters) {
        var self = this;
        self.filesViewModel = parameters[0];

        self.scanGcode = function() {
            var selectedFile = $("#gcode_file_select").val();
            if (!selectedFile) {
                alert("Please select a G-code file first!");
                return;
            }

            // Construct the correct file URL from OctoPrint
            var fileUrl = "/downloads/files/local/" + encodeURIComponent(selectedFile);

            // Fetch the G-code file directly from OctoPrint
            $.ajax({
                url: fileUrl,
                type: "GET",
                dataType: "text",
                success: function(data) {
                    // Scan for G28 commands in the file
                    var homeCommands = data.split("\n").filter(line => line.includes("G28"));
                    alert("G28 Found in:\n" + homeCommands.join("\n"));
                },
                error: function(xhr) {
                    alert("Failed to read file: " + xhr.responseText);
                }
            });
        };

        // Bind scan button
        $("#scan_gcode_button").click(self.scanGcode);
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: GcodeScannerViewModel,
        dependencies: ["filesViewModel"],
        elements: ["#gcode_scanner_tab"]
    });
});
