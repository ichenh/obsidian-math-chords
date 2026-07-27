const PROTOCOL_VERSION = 1;
const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_RESULT_BYTES = 2 * 1024 * 1024;

interface ChordTikzExports {
  memory: WebAssembly.Memory;
  chord_tikz_alloc(length: number): number;
  chord_tikz_dealloc(pointer: number, length: number): void;
  chord_tikz_render(pointer: number, length: number): number;
  chord_tikz_result_ptr(): number;
  chord_tikz_result_len(): number;
}

interface InitializeMessage {
  type: "initialize";
  protocolVersion: number;
  engineVersion: string;
  wasmGzipBase64: string;
}

interface CompileMessage {
  type: "compile";
  requestId: number;
  source: string;
}

type IncomingMessage = InitializeMessage | CompileMessage;
let engine: ChordTikzExports | null = null;

self.addEventListener("message", (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;
  if (message.type === "initialize") {
    void initialize(message);
  } else {
    compile(message);
  }
});

async function initialize(message: InitializeMessage): Promise<void> {
  try {
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error("The plugin and Chord TikZ core protocols do not match.");
    }
    const wasmGzip = decodeBase64(message.wasmGzipBase64);
    const wasm = await inflateGzip(wasmGzip.buffer);
    if (
      typeof message.engineVersion !== "string" ||
      !/^[a-z0-9][a-z0-9._+-]*$/i.test(message.engineVersion)
    ) {
      throw new Error("The Chord TikZ WASM core version is invalid.");
    }

    const instantiated = await WebAssembly.instantiate(wasm, {});
    const wasmExports = instantiated.instance.exports;
    validateExports(wasmExports);
    engine = wasmExports;
    self.postMessage({
      type: "ready",
      protocolVersion: PROTOCOL_VERSION,
      engineVersion: message.engineVersion,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function compile(message: CompileMessage): void {
  try {
    if (!engine) throw new Error("The Chord TikZ WASM core is not initialized.");
    const source = new TextEncoder().encode(message.source);
    if (source.byteLength === 0 || source.byteLength > MAX_SOURCE_BYTES) {
      throw new Error("TikZ source must contain between 1 byte and 64 KiB.");
    }
    const pointer = engine.chord_tikz_alloc(source.byteLength);
    if (pointer === 0) throw new Error("The Chord TikZ WASM core ran out of memory.");
    let status: number;
    try {
      new Uint8Array(engine.memory.buffer, pointer, source.byteLength).set(source);
      status = engine.chord_tikz_render(pointer, source.byteLength);
    } finally {
      engine.chord_tikz_dealloc(pointer, source.byteLength);
    }
    const resultPointer = engine.chord_tikz_result_ptr();
    const resultLength = engine.chord_tikz_result_len();
    if (resultLength === 0 || resultLength > MAX_RESULT_BYTES) {
      throw new Error("The Chord TikZ WASM result is outside its safety limits.");
    }
    const result = new Uint8Array(
      engine.memory.buffer,
      resultPointer,
      resultLength,
    ).slice();
    if (status !== 0) {
      throw new Error(new TextDecoder().decode(result));
    }
    self.postMessage(
      { type: "result", requestId: message.requestId, svg: result.buffer },
      { transfer: [result.buffer] },
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: message.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function validateExports(
  exports: WebAssembly.Exports,
): asserts exports is WebAssembly.Exports & ChordTikzExports {
  if (
    !(exports.memory instanceof WebAssembly.Memory) ||
    typeof exports.chord_tikz_alloc !== "function" ||
    typeof exports.chord_tikz_dealloc !== "function" ||
    typeof exports.chord_tikz_render !== "function" ||
    typeof exports.chord_tikz_result_ptr !== "function" ||
    typeof exports.chord_tikz_result_len !== "function"
  ) {
    throw new Error("The Chord TikZ WASM core exports are invalid.");
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function inflateGzip(compressed: ArrayBuffer): Promise<Uint8Array> {
  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
