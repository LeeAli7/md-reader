// Minimal typings for jszip (transitive dep, no @types installed).
// Only the surface documentLoader.ts uses.
declare module 'jszip' {
  interface JSZipObject {
    name: string;
    dir: boolean;
    async(type: 'string'): Promise<string>;
    async(type: 'base64'): Promise<string>;
    async(type: 'uint8array'): Promise<Uint8Array>;
  }
  class JSZip {
    static loadAsync(data: Uint8Array | ArrayBuffer): Promise<JSZip>;
    files: Record<string, JSZipObject>;
    file(path: string | RegExp): JSZipObject | null;
    file(path: string): JSZipObject | null;
  }
  export default JSZip;
}
