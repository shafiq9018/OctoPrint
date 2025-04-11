/**
 * @jest-environment jsdom
 */
const $ = require("jquery");

describe("GcodeScannerViewModel - Checkbox Logic", () => {
    let viewModel;

    beforeEach(() => {
        document.body.innerHTML = `
            <input type="checkbox" class="malicious-checkbox" value="M112" checked />
            <input type="checkbox" class="malicious-checkbox" value="M500" />
            <input type="checkbox" class="malicious-checkbox" value="M303" checked />
        `;

        function GcodeScannerViewModelMock() {
            var self = this;
            self.maliciousCommands = new Set();

            self.updateMaliciousCommands = function () {
                self.maliciousCommands.clear();
                $(".malicious-checkbox:checked").each(function () {
                    self.maliciousCommands.add($(this).val());
                });
            };
        }

        viewModel = new GcodeScannerViewModelMock();
    });

    test("collects checked checkboxes into maliciousCommands", () => {
        viewModel.updateMaliciousCommands();
        expect(viewModel.maliciousCommands.has("M112")).toBe(true);
        expect(viewModel.maliciousCommands.has("M303")).toBe(true);
        expect(viewModel.maliciousCommands.has("M500")).toBe(false);
        expect(viewModel.maliciousCommands.size).toBe(2);
    });
});
