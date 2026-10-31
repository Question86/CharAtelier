# Character Atelier

A local Windows 3D character editor. This is an evaluation build; visual quality and feature coverage are still in development.

## Run from source

Install Node.js 22.12 or newer and npm. In PowerShell:

```powershell
cd tooling
npm ci
cd ../app
npm start
```

The first install downloads Electron and Three.js. Character assets are included in `artifacts/assets`. Video export requires a local FFmpeg executable with libx264; set `CHARACTER_ATELIER_FFMPEG` to its full path before starting the app. FFmpeg is not included here.

Save files and exports are written locally. PNG, MP4 and GLB output are supported, with limitations: shape sliders are baked into GLB, and facial blendshapes and animation tracks are not exported. The evaluation build does not provide horns, wings or tusks.

Run core tests with `npm test` in `app` after installing dependencies.

## Third-party material

See `THIRD_PARTY.txt` and `artifacts/assets/provenance.json`. The application code is provided under the MIT license in LICENSE; third-party components retain their own terms.
