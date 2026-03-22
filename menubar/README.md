# Lavern Menu Bar

Native macOS status bar app for monitoring Clawern at a glance.

## Features

- Status bar icon with budget indicator
- Popover showing: document counts, budget, last scan, pending findings
- Click to open dashboard in browser
- Auto-polls the Claw API every 30 seconds

## Build

```bash
cd menubar
swift build
```

## Run

```bash
swift run LavernMenuBar
```

Or open `Package.swift` in Xcode.

## Configuration

Set the API URL via environment variable:
```bash
export LAVERN_API_URL=http://localhost:3000
```

Default: `http://localhost:3000`
