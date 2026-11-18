// Rounded SVG mode adapted from React Bits GlassSurface by David Haz.
// https://github.com/DavidHDev/react-bits/blob/3e619ca31732d5d6849ecd5130ddd7b266aa7bd7/src/ts-tailwind/Components/GlassSurface/GlassSurface.tsx
// See glass-surface.LICENSE.md for the license.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

type SurfaceSize = { width: number; height: number }

function displacementMap({ width, height }: SurfaceSize) {
  const radius = height / 2
  const edge = Math.min(width, height) * 0.09
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="red" x1="100%" x2="0%">
        <stop stop-color="transparent"/><stop offset="1" stop-color="red"/>
      </linearGradient>
      <linearGradient id="blue" x2="0%" y2="100%">
        <stop stop-color="transparent"/><stop offset="1" stop-color="blue"/>
      </linearGradient>
      <filter id="soft" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" color-interpolation-filters="sRGB">
        <feGaussianBlur stdDeviation="3"/>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="black"/>
    <rect width="${width}" height="${height}" rx="${radius}" fill="url(#red)"/>
    <rect width="${width}" height="${height}" rx="${radius}" fill="url(#blue)" style="mix-blend-mode:difference"/>
    <rect x="${edge}" y="${edge}" width="${width - 2 * edge}" height="${height - 2 * edge}" rx="${radius - edge}" fill="hsl(0 0% 50% / 0.96)" filter="url(#soft)"/>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const channels = [
  { name: 'red', scale: -34, matrix: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0' },
  { name: 'green', scale: -31, matrix: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0' },
  { name: 'blue', scale: -28, matrix: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0' },
] as const

export function GlassSurface({ children }: { children: ReactNode }) {
  const id = useId()
  const filterId = `glass-surface-${id}`
  const surface = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<SurfaceSize | null>(null)

  useEffect(() => {
    const element = surface.current
    // WebKit and Firefox can accept filter URLs without rendering refraction.
    const browser = navigator.userAgent
    if (
      !element ||
      /Firefox/.test(browser) ||
      (/Safari/.test(browser) && !/Chrome/.test(browser)) ||
      !globalThis.CSS?.supports('backdrop-filter', `url(#${filterId})`) ||
      typeof ResizeObserver === 'undefined'
    ) {
      return
    }

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ width, height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [filterId])

  return (
    <div ref={surface} className="relative">
      {size && (
        <svg aria-hidden="true" className="pointer-events-none absolute size-0">
          <defs>
            <filter
              id={filterId}
              x="0%"
              y="0%"
              width="100%"
              height="100%"
              colorInterpolationFilters="sRGB"
            >
              <feImage
                href={displacementMap(size)}
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                result="map"
              />
              {channels.map((channel) => (
                <Channel key={channel.name} {...channel} />
              ))}
              <feBlend in="red" in2="green" mode="screen" result="rg" />
              <feBlend in="rg" in2="blue" mode="screen" result="rgb" />
              <feGaussianBlur in="rgb" stdDeviation="0.45" />
            </filter>
          </defs>
        </svg>
      )}
      <div
        aria-hidden="true"
        data-slot="glass-surface-backdrop"
        className="pointer-events-none absolute inset-0 rounded-full bg-background/65 bg-linear-to-br from-white/30 via-transparent to-white/10 shadow-sm inset-ring inset-ring-foreground/15 backdrop-blur-[12px] backdrop-saturate-150 dark:bg-background/75 dark:from-white/15 dark:to-white/5"
        style={
          size
            ? {
                backdropFilter: `url(#${filterId}) saturate(1.3)`,
                backgroundColor:
                  'color-mix(in oklch, var(--background) 36%, transparent)',
              }
            : undefined
        }
      />
      <div className="relative">{children}</div>
    </div>
  )
}

function Channel({ name, scale, matrix }: (typeof channels)[number]) {
  return (
    <>
      <feDisplacementMap
        in="SourceGraphic"
        in2="map"
        scale={scale}
        xChannelSelector="R"
        yChannelSelector="G"
        result={`displaced-${name}`}
      />
      <feColorMatrix
        in={`displaced-${name}`}
        type="matrix"
        values={`${matrix}  0 0 0 1 0`}
        result={name}
      />
    </>
  )
}
