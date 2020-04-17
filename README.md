# vue-threejs-birds

vue-threejs-birds is vue module for ["flocking birds animation" from threejs](https://threejs.org/examples/webgl_gpgpu_birds.html). Props have been extracted to customize options.

[**Codesandbox Demo**](https://codesandbox.io/s/vue-threejs-birds-wc2vc?file=/src/App.vue)

## Usage

Install

```
npm install --save vue-threejs-birds
```

Then import it into YourComponent.vue and use it like a normal vue component.

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
        quantity: 2,
        canvasBgColor: 0x000000
      }
    }
  }
</script>
```

### Emitting event to handle window resize

Emit a [custom event](https://vuejs.org/v2/guide/components-custom-events.html#Event-Names) so the canvas can rerender on resize. Emitting a 'resized' event like this registers a single 'resize' event listener. Other components can then subscribe to this event instead of attaching multiple event listeners to the window. [More info on event delegation.](https://davidwalsh.name/event-delegate)

> Todo: Extract other event handlers

```vue
<template>
  <vue-threejs-birds />
</template>

<script>
  import VueThreejsBirds from './Birds'
  export default {
    components: {
      VueThreejsBirds
    },
    methods: {
      handleResize() {
        const windowSize = {
          width: window.innerWidth,
          height: window.innerHeight
        }
        this.$root.$emit('resized', windowSize)
      }
    },
    mounted() {
      window.addEventListener('resize', this.handleResize)
    },
    beforeDestroy() {
      window.removeEventListener('resize', this.handleResize)
    }
  }
</script>
```

## Options

Here are all the props that can be customized:

1. **`canvasBgAlpha`**: Background color transparency. Default is 1 or opaque. Range is 0-1 Eg. `{ canvasBgAlpha: 0.5 }`
2. **`canvasBgColor`**: All colors can be Hexadecimal numbers or a string (`"rgb(255, 0, 0)", "#ff0000", "rgb(100%, 0%, 0%)", "hsl(0, 100%, 50%)"`). The background color for the canvas. Eg. `{ canvasBgColor: 0xffffff }`

> Note: Passing alpha with the color like "rgb(255, 0, 0, 0.5)" will ignore the alpha component.

3. **`color1` and `color2`**: You can choose two colors for the birds which will rendered based on the colorEffect. `{ color1: 0xfff, color2: 0x000000 }`
4. **`colorEffect`**: colorEffect should be a number between 0-4 which map to the following. Eg usage `{ colorEffect: 1 }`

```js
colorEffectMap = {
  0: 'lerp',
  1: 'lerpGradient',
  2: 'variance',
  3: 'varianceGradient',
  4: 'mix'
}
```

5. **`effectController`**: Bird movement options.

```
effectController: {
  separation: 20.0,
  alignment: 20.0,
  cohesion: 20.0,
  freedom: 0.75
}
```

6. **`quantity`**: Number between 1-5. Total birds will be 2<sup>quantity</sup> x 2<sup>quantity</sup>.

7. **`wingsSpan`**: Wingspan of the birds. Eg `{ wingsSpan: 20 }`

### Dimensions

Canvas will default to 100% viewport width and 100% viewport height on mount and window resize.

10. **`fixedHeight`**: Height will not change.
11. **`fixedWidth`**: Width will not change.

Here are all the props that can be passed with their respective prop types.

```vue
<script>
  props: {
    canvasBgColor: {
      default: 0xffffff,
      type: [String, Number],
      required: false,
      validator: function(val) {
        return validateColor(new Color(val))
      }
    },
    canvasBgAlpha: {
      default: 1,
      type: Number,
      required: false,
      // range 0-1
      validator: function(val) {
        return inRange(val, 0, 1)
      }
    },
    color1: {
      default: 0x8bf329,
      type: [String, Number],
      required: false,
      validator: function(val) {
        return validateColor(new Color(val))
      }
    },
    color2: {
      default: 0x298bf3,
      type: [String, Number],
      required: false,
      validator: function(val) {
        return validateColor(new Color(val))
      }
    },
    colorEffect: {
      default: 0,
      type: Number,
      required: false,
      //range 0-4 integers only
      validator: function(val) {
        return [0, 1, 2, 3, 4].includes(val)
      }
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
    quantity: {
      default: 3,
      type: Number,
      required: false,
      // range 1-5
      validator: function(val) {
        return val >= 1 && val <= 5
      }
    },
    wingsSpan: {
      type: Number,
      default: 20,
      required: false
    }
  }
</script>
```

[Original source code](https://github.com/mrdoob/three.js/blob/master/examples/webgl_gpgpu_birds.html).
