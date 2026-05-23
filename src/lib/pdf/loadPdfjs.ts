import type * as PdfjsModule from "pdfjs-dist"

let cached: typeof PdfjsModule | null = null
let inflight: Promise<typeof PdfjsModule> | null = null

export async function loadPdfjs(): Promise<typeof PdfjsModule> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = (async () => {
    const [pdfjs, workerUrl] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ])
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default
    cached = pdfjs
    return pdfjs
  })()
  return inflight
}
