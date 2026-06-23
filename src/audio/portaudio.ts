import { dlopen, FFIType } from "bun:ffi";

const LIB = process.env.STEAM_PORTAUDIO ?? "/opt/homebrew/lib/libportaudio.dylib";

export const { symbols: PA } = dlopen(LIB, {
  Pa_Initialize: { args: [], returns: FFIType.i32 },
  Pa_Terminate: { args: [], returns: FFIType.i32 },
  Pa_OpenDefaultStream: {
    args: [FFIType.ptr, FFIType.i32, FFIType.i32, FFIType.u64, FFIType.f64, FFIType.u64, FFIType.ptr, FFIType.ptr],
    returns: FFIType.i32,
  },
  Pa_StartStream: { args: [FFIType.ptr], returns: FFIType.i32 },
  Pa_CloseStream: { args: [FFIType.ptr], returns: FFIType.i32 },
  Pa_ReadStream: { args: [FFIType.ptr, FFIType.ptr, FFIType.u64], returns: FFIType.i32 },
  Pa_WriteStream: { args: [FFIType.ptr, FFIType.ptr, FFIType.u64], returns: FFIType.i32 },
  Pa_GetErrorText: { args: [FFIType.i32], returns: FFIType.cstring },
});

export const PA_INT16 = 8;
export const SAMPLE_RATE = 24000;
export const FRAMES_PER_BUFFER = 480;

export function paErr(code: number): string {
  return String(PA.Pa_GetErrorText(code));
}
