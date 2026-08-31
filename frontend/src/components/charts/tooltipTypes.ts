/**
 * Structural tooltip types for the Recharts wrappers in this folder.
 *
 * Recharts 3 changed the tooltip callback contract in three ways that reach our
 * code: `formatter` now receives `ValueType | undefined` and `NameType |
 * undefined` rather than the concrete types; `TooltipProps` no longer carries
 * `payload`/`label` (those moved to `TooltipContentProps`); and the payload
 * array became `readonly`.
 *
 * Declaring our own structural types here — instead of importing Recharts' —
 * keeps every wrapper and call site compiling on both major versions, and means
 * the next rename upstream lands in one file rather than seven.
 */

/**
 * A tooltip `formatter`: given the raw value and series name Recharts hands us,
 * return the `[value, label]` pair to render.
 *
 * Both parameters are `unknown` on purpose. Recharts types them as
 * possibly-undefined unions, and a formatter that accepts `unknown` is
 * assignable to that signature under either major version; coerce inside the
 * body (`Number(value)`, `String(name)`) where you need a concrete type.
 */
export type ChartTooltipFormatter = (value: unknown, name: unknown) => [string, string]

/**
 * The props a custom tooltip `content` renderer actually reads.
 *
 * `payload` is `readonly` to match Recharts 3; `T` is the shape of the datum
 * carried on each entry's own `payload` field.
 */
export interface ChartTooltipContentProps<T> {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: T }>
  label?: unknown
}
