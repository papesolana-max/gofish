import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLoader } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";
import { FBXLoader } from "three-stdlib";
import { OBJLoader } from "three-stdlib";
import { STLLoader } from "three-stdlib";
import { PLYLoader } from "three-stdlib";
import { ColladaLoader } from "three-stdlib";
import { useWorldStore, type WorldObject } from "@/hooks/useWorldStore";
import { assetUrl } from "@/lib/assetLibrary";
import { resolveModelUrl } from "@/lib/modelPointers";
import { withDraco } from "@/lib/dracoLoader";
import { refreshCollider, registerCollider, unregisterCollider } from "@/lib/worldPhysics";

// Dedupes fetches: several objects often share one model URL, so without
// this each placement re-downloads the same file.
THREE.Cache.enabled = true;

/** Resolve the runtime URL for an object (uploaded blob or direct path). */
function useObjectUrl(o: WorldObject): string | null {
  const [url, setUrl] = useState<string | null>(o.url ? resolveModelUrl(o.url) : null);
  useEffect(() => {
    let alive = true;
    if (o.url) {
      setUrl(resolveModelUrl(o.url));
    } else if (o.assetId) {
      assetUrl(o.assetId).then((u) => alive && setUrl(u));
    } else {
      setUrl(null);
    }
    return () => {
      alive = false;
    };
  }, [o.url, o.assetId]);
  return url;
}

function loaderFor(ext: string) {
  switch (ext) {
    case "fbx":
      return FBXLoader;
    case "obj":
      return OBJLoader;
    case "stl":
      return STLLoader;
    case "ply":
      return PLYLoader;
    case "dae":
      return ColladaLoader;
    default:
      return GLTFLoader;
  }
}

type Loaded = { scene?: THREE.Object3D } | THREE.Object3D | THREE.BufferGeometry;

function toObject3D(loaded: Loaded, ext: string): THREE.Object3D {
  if (loaded instanceof THREE.BufferGeometry) {
    loaded.computeVertexNormals();
    return new THREE.Mesh(
      loaded,
      new THREE.MeshStandardMaterial({ color: "#b7c2c9", roughness: 0.85 }),
    );
  }
  if (loaded instanceof THREE.Object3D) return loaded;
  const scene = (loaded as { scene?: THREE.Object3D }).scene;
  if (scene) return scene;
  throw new Error(`Format ${ext} tidak didukung`);
}

/**
 * Isolates a broken model (corrupt file, unsupported content, network 404)
 * so it fails silently instead of tearing down the whole scene through the
 * route error boundary.
 */
class ModelErrorBoundary extends Component<{ obj: WorldObject; children: ReactNode }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.warn(`[WorldObjects] Model "${this.props.obj.name ?? this.props.obj.id}" gagal dimuat:`, error);
  }

  override render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

/** One placed model. Loads with Suspense and registers itself for collision. */
function WorldModel({ obj }: { obj: WorldObject }) {
  const url = useObjectUrl(obj);
  if (!url) return null;
  return (
    <ModelErrorBoundary key={`${obj.id}:${url}`} obj={obj}>
      <Suspense fallback={null}>
        <LoadedModel obj={obj} url={url} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

function LoadedModel({ obj, url }: { obj: WorldObject; url: string }) {
  const group = useRef<THREE.Group>(null);
  const Loader = loaderFor(obj.ext);
  const loaded = useLoader(Loader as never, url, (loader: unknown) => {
    if (Loader === GLTFLoader) withDraco(loader as GLTFLoader);
  }) as Loaded;
  const epoch = useWorldStore((s) => s.epoch);
  const select = useWorldStore((s) => s.select);
  const editing = useWorldStore((s) => s.editing);

  const node = useMemo(() => {
    const root = toObject3D(loaded, obj.ext).clone(true);
    root.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return root;
  }, [loaded, obj.ext]);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    registerCollider(obj.id, g, obj.walkable, obj.solid);
    return () => unregisterCollider(obj.id);
  }, [obj.id, obj.walkable, obj.solid, node]);

  // Refresh only this object's cached bounds, and only when its own transform
  // actually changed (comparing values, not array identity) or the whole layout
  // was reloaded/imported. Rebuilding every collider on each store write made
  // dragging in the editor stutter badly.
  const transformKey = [...obj.position, ...obj.rotation, ...obj.scale].join(",");
  useEffect(() => {
    refreshCollider(obj.id);
  }, [obj.id, epoch, transformKey]);

  if (!obj.visible) return null;

  return (
    <group
      ref={group}
      name={`world:${obj.id}`}
      position={obj.position}
      rotation={obj.rotation}
      scale={obj.scale}
      onClick={(e) => {
        if (!editing) return;
        e.stopPropagation();
        select(obj.id);
      }}
    >
      <primitive object={node} />
    </group>
  );
}

/** Gizmo for the selected object; writes the transform back to the store. */
function SelectionGizmo() {
  const editing = useWorldStore((s) => s.editing);
  const selectedId = useWorldStore((s) => s.selectedId);
  const mode = useWorldStore((s) => s.mode);
  const updateObject = useWorldStore((s) => s.updateObject);
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  const ref = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    if (!editing || !selectedId) {
      setTarget(null);
      return;
    }
    // The group is named world:<id>; find it once the model mounted.
    let raf = 0;
    const find = () => {
      const scene = ref.current?.parent;
      const found = scene?.getObjectByName(`world:${selectedId}`) ?? null;
      if (found) setTarget(found);
      else raf = requestAnimationFrame(find);
    };
    find();
    return () => cancelAnimationFrame(raf);
  }, [editing, selectedId]);

  if (!editing || !selectedId) return <object3D ref={ref} />;

  return (
    <>
      <object3D ref={ref} />
      {target && (
        <TransformControls
          object={target}
          mode={mode}
          // Commit to the store when the drag ends instead of on every pointer
          // move: each store write re-renders the whole object list, so live
          // commits made big scenes crawl. The gizmo already moves the mesh.
          onMouseUp={() => {
            updateObject(selectedId, {
              position: target.position.toArray() as [number, number, number],
              rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
              scale: target.scale.toArray() as [number, number, number],
            });
          }}
        />
      )}
    </>
  );
}

export function WorldObjects() {
  const objects = useWorldStore((s) => s.objects);
  return (
    <group name="world-root">
      {objects.map((o) => (
        <WorldModel key={o.id} obj={o} />
      ))}
      <SelectionGizmo />
    </group>
  );
}
