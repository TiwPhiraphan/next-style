import { describe, expect, it } from 'bun:test'
import {
	BREAKPOINTS,
	camelToKebab,
	deduplicateStyles,
	generateClassHash,
	normalizeMediaQuery,
	validateCSSProperty
} from '../src/utils'

describe('utils', () => {
	describe('camelToKebab', () => {
		it('should convert camelCase to kebab-case', () => {
			expect(camelToKebab('fontSize')).toBe('font-size')
			expect(camelToKebab('borderTopWidth')).toBe('border-top-width')
			expect(camelToKebab('backgroundColor')).toBe('background-color')
		})

		it('should preserve CSS variables starting with --', () => {
			expect(camelToKebab('--primaryColor')).toBe('--primaryColor')
			expect(camelToKebab('--my-custom-var')).toBe('--my-custom-var')
		})

		it('should handle ms prefix correctly', () => {
			expect(camelToKebab('msTransition')).toBe('-ms-transition')
		})
	})

	describe('generateClassHash', () => {
		it('should generate consistent hash regardless of object key order', () => {
			const h1 = generateClassHash({ color: 'red', fontSize: '14px' })
			const h2 = generateClassHash({ fontSize: '14px', color: 'red' })
			expect(h1).toBe(h2)
		})

		it('should safely handle null and undefined', () => {
			expect(() => generateClassHash(null)).not.toThrow()
			expect(() => generateClassHash(undefined)).not.toThrow()
			expect(generateClassHash(undefined)).toBe('0')
		})

		it('should produce identical hash for nested objects with different key order', () => {
			const s1 = { color: 'red', '@md': { padding: '10px', margin: '5px' } }
			const s2 = { '@md': { margin: '5px', padding: '10px' }, color: 'red' }
			expect(generateClassHash(s1)).toBe(generateClassHash(s2))
		})
	})

	describe('validateCSSProperty', () => {
		it('should return true for valid strings and numbers', () => {
			expect(validateCSSProperty('color', 'red')).toBe(true)
			expect(validateCSSProperty('fontSize', 16)).toBe(true)
			expect(validateCSSProperty('opacity', 0)).toBe(true)
		})

		it('should return false for null and undefined', () => {
			expect(validateCSSProperty('color', null)).toBe(false)
			expect(validateCSSProperty('color', undefined)).toBe(false)
		})

		it('should return true for non-array objects', () => {
			expect(validateCSSProperty(':hover', { color: 'blue' })).toBe(true)
			expect(validateCSSProperty('nested', [1, 2])).toBe(false)
		})
	})

	describe('normalizeMediaQuery', () => {
		it('should expand breakpoints', () => {
			expect(normalizeMediaQuery('@sm')).toBe(BREAKPOINTS['@sm'])
			expect(normalizeMediaQuery('@md')).toBe(BREAKPOINTS['@md'])
			expect(normalizeMediaQuery('@lg')).toBe(BREAKPOINTS['@lg'])
			expect(normalizeMediaQuery('@xl')).toBe(BREAKPOINTS['@xl'])
			expect(normalizeMediaQuery('@2xl')).toBe(BREAKPOINTS['@2xl'])
		})

		it('should pass through arbitrary media queries', () => {
			expect(normalizeMediaQuery('@media (max-width: 600px)')).toBe('@media (max-width: 600px)')
		})
	})

	describe('deduplicateStyles', () => {
		it('should remove identical styles regardless of key order', () => {
			const map = new Map<string, any>()
			map.set('next-1', { color: 'red', fontSize: '14px' })
			map.set('next-2', { fontSize: '14px', color: 'red' })
			map.set('next-3', { color: 'blue' })

			const deduped = deduplicateStyles(map)
			expect(deduped.size).toBe(2)
			expect(deduped.has('next-1')).toBe(true)
			expect(deduped.has('next-3')).toBe(true)
		})
	})
})
