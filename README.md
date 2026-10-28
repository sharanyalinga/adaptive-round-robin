# Adaptive Round Robin Control Room (Flask)

A local web version of the Adaptive Round Robin simulator using Python + Flask, HTML, CSS and JavaScript.

## Run on Windows

1. Install Python 3.10 or newer.
2. Open a terminal in this folder.
3. (Optional but recommended) create a virtual environment:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   ```
4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Start the app:
   ```bash
   python app.py
   ```
6. Open http://127.0.0.1:5000 in your browser.

## Features

- Editable arrival and burst times; add/remove process rows.
- Workload presets, including the project workload and arrival-time examples.
- Traditional RR and Adaptive RR simulation.
- Adaptive engine evaluates mean and median burst-time candidates internally. Auto mode selects by average waiting time, then context switches, then response time (matching the provided Streamlit implementation's selection rule).
- Step controls show queue-before, CPU process, queue-after, arrivals, finished processes, not-yet-arrived processes, remaining burst, and a Gantt timeline.
- Metric comparison, per-process metrics, waiting-time visualization and CSV export.
- Responsive layout with high-contrast text and visible process colors.

## Project structure

- `app.py` — scheduling engine and Flask API.
- `templates/index.html` — page structure.
- `static/style.css` — styling and color system.
- `static/app.js` — interactive controls, step playback and charts.
- `requirements.txt` — Python dependency list.

The app is intended to run locally. It does not need a database or external API. Google Fonts are used for typography when internet is available; the interface still works without them.
