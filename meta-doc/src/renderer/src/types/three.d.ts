declare module 'three' {
  export class Scene {
    add(object: Object3D): void
    remove(object: Object3D): void
  }

  export class PerspectiveCamera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number)
    aspect: number
    position: { x: number; y: number; z: number }
    updateProjectionMatrix(): void
  }

  export class WebGLRenderer {
    constructor(params?: any)
    domElement: HTMLCanvasElement
    setPixelRatio(value: number): void
    setClearColor(color: number, alpha?: number): void
    setSize(width: number, height: number): void
    render(scene: Scene, camera: PerspectiveCamera): void
    clear(): void
    dispose(): void
  }

  export class Object3D {
    traverse(callback: (child: Object3D) => void): void
    position: { set(x: number, y: number, z: number): void }
    scale: { set(x: number, y: number, z: number): void }
    rotation: { x: number; y: number }
    add(object: Object3D): void
  }

  export class Mesh extends Object3D {
    geometry: { dispose(): void }
    material: Material | Material[]
  }

  export class BufferGeometry {
    setAttribute(name: string, attribute: BufferAttribute): void
  }

  export class BufferAttribute {
    constructor(array: ArrayLike<number>, itemSize: number)
  }

  export class PointsMaterial {
    constructor(params?: any)
  }

  export class Points extends Object3D {
    constructor(geometry: BufferGeometry, material: PointsMaterial)
  }

  export class Group extends Object3D {}

  export class CanvasTexture {
    constructor(canvas: HTMLCanvasElement)
    dispose(): void
  }

  export class SpriteMaterial {
    constructor(params?: any)
    map?: { dispose(): void }
    dispose(): void
  }

  export class Sprite extends Object3D {
    constructor(material?: SpriteMaterial)
    material: SpriteMaterial
  }

  export type Material = any
}
