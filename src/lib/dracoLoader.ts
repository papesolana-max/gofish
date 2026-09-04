import { DRACOLoader, type GLTFLoader } from "three-stdlib";

/**
 * Draco decoder files are self-hosted in `public/draco/` (copied from the
 * three package) so decoding works offline and after clone / remix without
 * hitting a third-party CDN.
 */
let draco: DRACOLoader | null = null;

export function getDracoLoader(): DRACOLoader {
  if (!draco) {
    draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    draco.setDecoderConfig({ type: "wasm" });
  }
  return draco;
}

export function withDraco(loader: GLTFLoader) {
  loader.setDRACOLoader(getDracoLoader());
}
