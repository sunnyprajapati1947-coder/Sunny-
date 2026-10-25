# Catalog provenance

The bundled `src/data/phones.js` contains **11,662 unique brand/name entries across 56 brands**. It is a reference catalog, not every phone ever manufactured and not a list of supported Free Fire MAX hardware. Manual brand/model entry supports missing names without inventing a dataset record.

## Android source

- Project: [bsthen/device-models](https://github.com/bsthen/device-models)
- Pinned commit: `6712465438e3d9161b3b7a003accb688a1f8993f`
- File: `devices.json`
- Upstream identifies its source as Google's public Play supported-devices list.
- License: Apache-2.0; full license bundled in `public/licenses/device-models-Apache-2.0.txt` and accessible in the app.
- Modifications: selected handset-manufacturer brands, canonicalized casing/aliases, removed repeated brand prefixes, excluded obvious TV/watch/emulator entries, grouped model codes under deduplicated marketing names. The import script contains all rules.
- Caveats: upstream is a community mapping; some tablet entries, ambiguous names, region-specific duplicates across brands or old devices remain. A model code can be a name if a better marketing name was unavailable. No device release, hardware specification, game compatibility or performance is verified by this mapping.

## Apple addition

Manually curated iPhone marketing names, referenced against [Apple's model-identification page](https://support.apple.com/en-us/108044). No Apple RAM/Hz specifications or sensitivity measurements are inferred. Legacy names do not imply current game compatibility.

## Reproduce the Android import

Requires Python 3 and authenticated GitHub CLI, but never runs in the user's browser:

```sh
# From spdyi/
gh api -H 'Accept: application/vnd.github.raw+json' \
  'repos/bsthen/device-models/contents/devices.json?ref=6712465438e3d9161b3b7a003accb688a1f8993f' > /tmp/spdyi-devices.json
python scripts/import-catalog.py /tmp/spdyi-devices.json
```

The raw upstream file is not committed. Browser runtime uses only the normalized bundled catalog and makes no external lookup. Refreshing to another upstream commit requires reviewing data quality, preserving the license, updating the pinned reference and count, and re-running tests. There is no automatic claim that this snapshot is exhaustive or current.
