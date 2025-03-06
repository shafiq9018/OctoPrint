$(function() {
    function GcodeScannerViewModel(parameters) {
        var self = this;
        self.filesViewModel = parameters[0];  // Get OctoPrint's file manager
        self.files = null; // Will hold the file list
        var _selectedFilePath; // Will hold the selected file path
        var _selectedFileName; // Will hold the selected file name

        
        self.populateDropdown = function() {
            var dropdown = $("#gcode_file_select");
            dropdown.empty();
            dropdown.append('<option value="">-- Choose a file --</option>');

            // 🔹 FIX: `filesViewModel` should be a function call.
            var filesViewModel = ko.dataFor(document.querySelector("#files_wrapper"));
            if (!filesViewModel) {
                console.log("filesViewModel not found.");
                return;
            }
            
            // 🔹 FIX: `allItems` should be a function call.
            var fileList = filesViewModel.allItems();
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
        
        // Function to get filesViewModel safely
        function getFilesViewModel() {
            var filesViewModel = ko.dataFor(document.querySelector("#files_wrapper"));
            if (!filesViewModel) {
                console.log("❌ filesViewModel not found.");
                return null;
            }
            return filesViewModel;
        }

        // Function to get the list of G-code files
        function getGcodeFiles() {
            var filesViewModel = getFilesViewModel();
            if (!filesViewModel) return [];

            var fileList = filesViewModel.allItems();
            if (!fileList || fileList.length === 0) {
                console.log("⚠ No G-code files found.");
                return [];
            }

            return fileList;
        }

        // Ensure it runs when the page loads
        setTimeout(self.populateDropdown, 2000); // Give time for OctoPrint to load files
        

        // 🔹 FIX: `getRootFilePath` should not be nested inside another function.
        function getRootFilePath() {
            var entry = self.files.listHelper.allItems[0];

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

        // 🔹 FIX: `getGcodePathAndName` should not be inside another function.
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

        // Populate dropdown on page load
        self.populateDropdown();
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: GcodeScannerViewModel,
        dependencies: ["filesViewModel"],
        elements: ["#gcode_scanner_tab"]
    });
});
