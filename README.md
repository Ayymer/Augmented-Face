# Augmented Face

Augmented Face is a browser-based webcam demo that tracks the user's face and draws animated scent-inspired particles around the jawline. It was built as an interactive visual prototype for showcasing different perfume identities.

**Try it:** https://ayymer.github.io/Augmented-Face/ (allow camera when the browser asks).

## Features

- Live webcam input in the browser.
- Face tracking with MediaPipe Face Landmarker.
- Animated particle aura around the jaw and lower face.
- Head-tilt burst interaction.
- Scent selector UI with visual themes for Alima, Aymeric, Jamie, and Paloma.

## Stack

- Plain HTML, CSS, and JavaScript.
- p5.js for canvas drawing and webcam capture.
- MediaPipe Tasks Vision loaded from CDN for face landmark detection.
- GitHub Pages deployment from the `main` branch root.

No build step is required. The project is served as a static site.

## Running Locally

Serve the project root with any local static server:

```bash
python3 -m http.server 5173 --bind 127.0.0.1
```

Then open http://127.0.0.1:5173/ and allow camera access.

You can also run:

```bash
npm start
```

## Assets

Image assets live in `Assets/` and are grouped by scent:

- `Assets/alima/` - Alima flowers, perfume bottle, and still elements.
- `Assets/jamie/` - shells, glass, orange, leaves, and perfume bottle.
- `Assets/paloma/` - sun, leaves, mango, and perfume bottle.

The p5 library files used by the static page live in `libraries/`.

License: ISC.
