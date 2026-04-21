# image2cpp

Tool to convert images and GIFs to C++ bytearray code 

for use in with microcontrollers and displays in electronics projects

Main : https://image2cpp.pages.dev/

Mirror : https://r44gh4v.github.io/image2cpp/

## SEO and Canonical Setup

- Canonical domain: https://image2cpp.pages.dev/
- Mirror domain is supported for availability, but canonical metadata points to the main domain.

## Platform-Independent Hosting Notes

- Frontend app paths are relative, so it can run from both root deployments and subpath deployments.
- Visit counter endpoint is configured with a relative path (`api/visits`) and degrades gracefully when unavailable.
- PWA manifest uses relative `start_url` and `scope` for cross-host compatibility.
