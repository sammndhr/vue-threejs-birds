# vue-threejs-birds

vue-threejs-birds is vue module for ["flocking birds animation" from threejs.](https://threejs.org/examples/webgl_gpgpu_birds.html). Props have been extracted to customize options.

## Usage

Install

```
npm install --save https://github.com/mrinalini-m/vue-threejs-birds
```

Then import it into YourComponent.vue and use it like a normal vue component

```vue
<template>
	<vue-threejs-birds :effectController="effectController" :quantity="quantity" :canvasBgColor="canvasBgColor" />
</template>

<script>
	import VueThreejsBirds from 'vue-threejs-birds'
	export default {
		data() {
			return {
				effectController: {
					separation: 30.0,
					alignment: 40.0,
					cohesion: 20.0,
					freedom: 0.75
				},
				quantity: 32,
				canvasBgColor: 0x000000
			}
		}
	}
</script>
```

## Options

Here is a list of all the props that can be customized

```js
props = {
	/* All colors can be Hexadecimal numbers or a string ("rgb(255, 0, 0)", "#ff0000", "rgb(100%, 0%, 0%)", "hsl(0, 100%, 50%)")
  The background color for the canvas.  */
	canvasBgColor: 0xffffff,

	/* You can choose two colors for the birds which will rendered based on the colorEffect */
	color1: 0xfff,
	color2: 0x000000,

	/* colorEffect should be a number 0-4 which map to:
  0: 'lerp',
  1: 'lerpGradient',
  2: 'variance',
  3: 'varianceGradient',
  4: 'mix' */
	colorEffect: 1,

	/* Bird movement options */
	effectController: {
		separation: 20.0,
		alignment: 20.0,
		cohesion: 20.0,
		freedom: 0.75
	},

	/* the total number of birds will be quantity x 3. It's capped at 200 */
	quantity: 32,
	/* Wingspan of the birds */
	wingsSpan: 20
}
```
