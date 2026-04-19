# image2cpp

Tool to convert images and GIFs to C++ bytearray code for use in electronics projects

## Theme System

- App UI theme is controlled by the navbar `Theme` button and supports `System`, `Light`, and `Dark` modes.
- Selected app theme mode is persisted in localStorage under `image2cpp.uiThemeMode`.
- Preview display simulation theme (`OLED: White/Blue/Yellow`, `LCD: Green`) remains separate and only affects preview canvas rendering.
- Global UI theme behavior is managed by `js/core/ui-theme-service.js` and applied via the `data-app-theme` attribute.
