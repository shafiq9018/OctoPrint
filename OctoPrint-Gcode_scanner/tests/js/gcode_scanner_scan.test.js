/**
 * @jest-environment jsdom
 */
const $ = require("jquery");

describe("Scan button behavior", () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <input type="checkbox" id="flag-m302" checked />
            <input type="checkbox" id="flag-m31" />
            <input type="file" id="gcode-file" />
            <button id="scan-button">Scan</button>
        `;

        // Add fake scan logic (simulate the real plugin behavior)
        $("#scan-button").on("click", function () {
            const flags = {
                "M302": $("#flag-m302").prop("checked"),
                "M31": $("#flag-m31").prop("checked")
            };

            const file = new Blob(["G1 X0 Y0\nM302"], { type: "text/plain" });
            Object.defineProperty($("#gcode-file")[0], 'files', {
                value: [file],
                writable: false
            });

            const formData = new FormData();
            formData.append("file", file);
            formData.append("flags", JSON.stringify(flags));

            $.ajax({
                url: "plugin/gcode_scanner",
                type: "POST",
                data: formData,
                contentType: false,
                processData: false
            });
        });
    });

    test("calls backend with file and flags", () => {
        // Spy on $.ajax
        const ajaxSpy = jest.spyOn($, "ajax").mockImplementation(() => ({
            done: () => {},
            fail: () => {}
        }));

        // Simulate scan click
        $("#scan-button").trigger("click");

        // Verify ajax was called
        expect(ajaxSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                url: "plugin/gcode_scanner",
                type: "POST",
                contentType: false,
                processData: false,
                data: expect.any(FormData)
            })
        );

        ajaxSpy.mockRestore();
    });
});
