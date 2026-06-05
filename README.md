# image2cpp

Browser tool that converts images and animated GIFs into C/C++ byte arrays for
monochrome and color embedded displays (Arduino, OLED/SSD1306, e-paper, TFT).
All processing happens locally in your browser.

## Run locally

ES modules require an HTTP server (not `file://`):

    python -m http.server 8000   # then open http://localhost:8000/image2cpp/
    # or: npx serve .

## Features

- Drag/drop or pick one or many images; animated GIF decoding with a frame timeline.
- Paste a byte array to render it back to an image (horizontal/vertical).
- Contrast, threshold, 4 dithering modes (binary/Bayer/Floyd-Steinberg/Atkinson),
  invert, flip, rotate, scaling (fit/stretch/original), smooth scaling.
- Pixel formats: 1-bit mono (horizontal/vertical), RGB565, RGB888, alpha map; u8g2 bit-swap.
- Output: Arduino PROGMEM (multi), Arduino single bitmap, Adafruit GFXbitmapFont, plain C array.
- Copy to clipboard or download a `.h` file. Light/dark/system theme.
