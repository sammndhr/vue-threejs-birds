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
  <vue-threejs-birds :quantity="quantity" :canvasBgColor="canvasBgColor" />
</template>

<script>
  import VueThreejsBirds from 'vue-threejs-birds'
  export default {
    components: {
      VueThreejsBirds
    },
    data() {
      return {
        quantity: 32,
        canvasBgColor: 0x000000
      }
    }
  }
</script>
```

## Options

Here is a list of all the props that can be customized

1. `canvasBgColor`: All colors can be Hexadecimal numbers or a string (`"rgb(255, 0, 0)", "#ff0000", "rgb(100%, 0%, 0%)", "hsl(0, 100%, 50%)"`). The background color for the canvas. Eg. `{ canvasBgColor: 0xffffff }`

2. `color1` and `color2`: You can choose two colors for the birds which will rendered based on the colorEffect. `{ color1: 0xfff, color2: 0x000000 }`
3. `colorEffect`: colorEffect should be a number between 0-4 which map to the following. Eg usage `{ colorEffect: 1 }`

```js
colorEffectMap = {
  0: 'lerp',
  1: 'lerpGradient',
  2: 'variance',
  3: 'varianceGradient',
  4: 'mix'
}
```

4. `effectController` - Bird movement options.

```
effectController: {
  separation: 20.0,
  alignment: 20.0,
  cohesion: 20.0,
  freedom: 0.75
}
```

5. `quantity` - The total number of birds will be quantity x 3. It's capped at 200. Eg `{ quantity: 32 }`

6. `wingsSpan`: Wingspan of the birds. Eg `{ wingsSpan: 20 }`

### Dimensions

Canvas will default to 100% viewport width and 100% viewport height on mount and window resize.

6. `minWidth`: Minimun width of the canvas.
7. `minHeight`: Minimun height of the canvas.
8. `fixedHeight`: Height will not change. If `minHeight > fixedHeight`, `fixedHeight` will set to `minHeight`
9. `fixedWidth`: Width will not change. If `minWidth > fixedWidth`, `fixedWidth` will set to `minWidth`

Here are all the props that can be passed with prop types. 

```vue
<script>
  props: {
    canvasBgColor: [String, Number],
    color1: [String, Number],
    color2: [String, Number],
    colorEffect: {
      default: 0,
      type: Number,
      required: false
    },

    effectController: {
      default: () => ({
        separation: 20.0,
        alignment: 20.0,
        cohesion: 20.0,
        freedom: 0.75
      }),
      type: Object,
      required: false
    },
    fixedHeight: {
      type: Number,
      default: null,
      required: false
    },
    fixedWidth: {
      type: Number,
      default: null,
      required: false
    },
    minHeight: {
      type: Number,
      default: null,
      required: false
    },
    minWidth: {
      type: Number,
      default: null,
      required: false
    },
    quantity: {
      default: 32,
      type: Number,
      required: false
    },
    wingsSpan: {
      type: Number,
      default: 20,
      required: false
    }
  },
</script>
```
