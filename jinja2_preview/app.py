from flask import Flask, render_template

app = Flask(__name__, template_folder='templates', static_folder='static')

@app.route("/")
def index():
    return render_template("gcode_scanner_tab.jinja2")

if __name__ == "__main__":
    app.run(debug=True, port=5050)
