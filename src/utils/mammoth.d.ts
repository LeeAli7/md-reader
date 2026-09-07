// Minimal typings for mammoth (no bundled / @types available).
// Only the surface documentLoader.ts uses.
declare module 'mammoth' {
  export interface MammothResult {
    value: string;
    messages: unknown[];
  }
  export interface MammothInput {
    arrayBuffer: ArrayBuffer;
    path?: string;
  }
  const mammoth: {
    convertToHtml(input: MammothInput, options?: unknown): Promise<MammothResult>;
    extractRawText(input: MammothInput, options?: unknown): Promise<MammothResult>;
  };
  export default mammoth;
}
