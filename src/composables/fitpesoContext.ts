import { inject, type InjectionKey } from 'vue'
import type { useFitpesoApp } from './useFitpesoApp'

export type FitpesoContext = ReturnType<typeof useFitpesoApp>
export const fitpesoKey: InjectionKey<FitpesoContext> = Symbol('fitpeso')
export function useFitpesoContext() {
  const context = inject(fitpesoKey)
  if (!context) throw new Error('FitPeso screen requires the application provider')
  return context
}
