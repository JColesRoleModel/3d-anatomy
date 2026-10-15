# 3D Anatomy

An interactive 3D model of the human body for personal study. Filter by body system, tap any structure to see its name, and install it on your phone as an app.

**Open it:** https://jcolesrolemodel.github.io/3d-anatomy/

## Add it to your phone
- **iPhone (Safari):** open the link, tap Share, then **Add to Home Screen**.
- **Android (Chrome):** open the link, tap the ⋮ menu, then **Install app** or **Add to Home screen**.

Each system downloads the first time you turn it on and then works offline.

## Systems and layers
Skeletal, muscular, fascia, circulatory, lymphatic, nervous, endocrine, sinuses, organs, skin, and joints and ligaments. A structure can belong to more than one system (the thymus, for example, is lymphatic and endocrine).

Each system has its own opacity slider and sub-filters, for example:
- **Skeletal:** skull, teeth, cervical, thoracic and lumbar spine, sacrum and coccyx, ribs, arms, pelvis, legs
- **Muscular:** depth (superficial, intermediate, deep) and body region
- **Nervous:** brain, spinal cord, cranial nerves (each nerve I–XII separately), spinal nerves, eye and tear ducts, ear
- **Endocrine:** each gland

Tap a part, then tap any group in its info card (like *Cranial nerves* or *Lumbar vertebrae*) to focus on the whole group while everything else fades.

Muscle depth isn't labelled in the source models. `tools/muscle-depth.mjs` measures it by checking, for points all over each muscle, how many other muscles sit between that point and the skin. Textbook groupings from the source (such as "Deep part of posterior compartment of leg") take priority, and `tools/catalog.mjs` has a short list of manual corrections.

## How it's built
- Plain HTML, CSS and JavaScript with [three.js](https://threejs.org) (bundled in `vendor/`). No build step: GitHub Pages serves the files as they are.
- `models/*.glb`: one model per source file, simplified and compressed for phones.
- `data/catalog.json`: every structure with its system tags and anatomical grouping. This is where study notes and extra layers will go.
- `tools/`: the scripts that converted the source models (see below).

### Rebuilding the models
The source models are the Z-Anatomy FBX files from https://github.com/LluisV/Z-Anatomy (`Resources/Models/FBX`).
```
npm i fbx2gltf @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
node_modules/fbx2gltf/bin/<OS>/FBX2glTF --binary --input SkeletalSystem100.fbx --output raw/skeletal
node tools/build.mjs raw/skeletal.glb out/skeletal.glb skeletal 0.3   # also writes out/skeletal.json; copy it to tools/meta/
node tools/muscle-depth.mjs out/regions.glb out/muscular.glb data/catalog.json tools/meta/muscle-depth.json
node tools/catalog.mjs data/catalog.json
```
`tools/meta/` holds the structure lists that `build.mjs` writes next to each model.

## Credits and license
3D models from [Z-Anatomy](https://www.z-anatomy.com), the open source atlas of anatomy (CC BY-SA 4.0), derived from BodyParts3D, © The Database Center for Life Science (CC BY-SA 2.1 Japan). The models in this repository are modified (converted and simplified) and are shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

three.js is MIT licensed. The app code in this repository is MIT licensed.
