import octoprint.plugin
import flask
import logging

# Added for refreshing the filesystem
from octoprint.events import Events

class GcodeScannerPlugin(
    octoprint.plugin.StartupPlugin,         # Added for startup actions
    octoprint.plugin.TemplatePlugin,        # Added for template rendering
    octoprint.plugin.AssetPlugin,           # Added for asset management
    octoprint.plugin.SimpleApiPlugin,       # Added for API handling
    octoprint.plugin.EventHandlerPlugin,    # Added for event handling
    octoprint.plugin.SettingsPlugin,        # Added for settings management
):
    
    def get_template_configs(self):
        return [
            {
                "type": "tab",
                "name": "Gcode Scanner",
                "custom_bindings": True,
                "template": "gcode_scanner_tab.jinja2",
                "template_vars": {}
            }
        ]

    def get_assets(self):
        return {
            "js": ["js/gcode_scanner.js"],
            "css": ["css/gcode_scanner.css"]
        }
    
    def get_api_commands(self):
        """Register API command: scan"""
        return {"scan": ["file"]}  # Requires a file parameter

    def on_api_command(self, command, data):
        """Handle API calls"""
        if command == "scan":
            file_path = self._file_manager.path_on_disk("local", data["file"])

            # Ensure the file exists
            try:
                with open(file_path, "r") as f:
                    gcode_lines = f.readlines()
            except FileNotFoundError:
                return flask.jsonify({"error": "File not found"}), 404

            # Extract all G28 commands
            home_commands = [line.strip() for line in gcode_lines if "G28" in line]

            logging.info(f"Found {len(home_commands)} G28 commands in {data['file']}")
            return flask.jsonify({"home_commands": home_commands})

__plugin_name__ = "Gcode Scanner"
__plugin_pythoncompat__ = ">=3.7,<4"  # Ensures compatibility
__plugin_implementation__ = GcodeScannerPlugin()
# __plugin_js__ = ["static/js/gcode_scanner.js"]

