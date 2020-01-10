import buble from '@rollup/plugin-buble'
import commonjs from '@rollup/plugin-commonjs'
import vue from 'rollup-plugin-vue'

export default {
	external: ['three'],
	input: 'src/index.js',
	output: {
		name: 'VueThreejsBirds',
		exports: 'named',
		globals: {
			three: 'THREE'
		}
	},
	plugins: [
		commonjs(),
		vue({
			css: true,
			compileTemplate: true
		}),
		buble()
	]
}
