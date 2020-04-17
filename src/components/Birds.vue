<template>
  <div ref="birdContainer" class="container"></div>
</template>

<script>
  import {
    PerspectiveCamera,
    Scene,
    Fog,
    WebGLRenderer,
    Color,
    BufferGeometry,
    BufferAttribute,
    Vector3,
    RepeatWrapping,
    ShaderMaterial,
    DoubleSide,
    Mesh
  } from 'three'
  import { GPUComputationRenderer } from './../assets/vendors/GPUComputationRenderer.js'
  import {
    fragmentShaderPosition,
    fragmentShaderVelocity,
    birdVS,
    birdFS
  } from '../utils/shaders.js'

  import { validateColor, inRange, clamp } from '../utils/helpers.js'

  export default {
    name: 'VueThreejsBirds',
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
    },

    data() {
      return {
        animationReq: null,
        BirdGeometry: Object.create(null),
        birdUniforms: null,
        BOUNDS: 800,
        BOUNDS_HALF: 800 / 2,
        camera: null,
        colorMode: {
          0: 'lerp',
          1: 'lerpGradient',
          2: 'variance',
          3: 'varianceGradient',
          4: 'mix'
        },
        container: null,
        gpuCompute: null,
        last: window.performance.now(),
        mouseY: 0,
        mouseX: 0,
        positionVariable: {},
        positionUniforms: {},
        renderer: null,
        scene: null,
        velocityUniforms: {},
        velocityVariable: {},
        windowSize: { width: window.innerWidth, height: window.innerHeight }
      }
    },
    computed: {
      windowHalf: function() {
        const { width, height } = this.worldSize
        const x = width / 2,
          y = height / 2
        return { x, y }
      },

      WIDTH: function() {
        // whole numbers only
        return Math.pow(2, Math.floor(this.quantity))
      },
      BIRDS: function() {
        return this.WIDTH * this.WIDTH
      },
      worldSize: function() {
        let { width, height } = this.windowSize
        width = this.fixedWidth !== null ? this.fixedWidth : width
        height = this.fixedHeight !== null ? this.fixedHeight : height
        return { width, height }
      }
    },

    mounted() {
      this.BirdGeometry = this.createBirdGeometry()
      this.init()
      this.animate()
      this.$root.$on('resized', this.onWindowResize)
    },

    beforeDestroy() {
      this.destroy()
    },

    methods: {
      init: function() {
        const { width, height } = this.worldSize
        this.container = this.$refs.birdContainer
        this.camera = new PerspectiveCamera(75, width / height, 1, 3000)
        this.camera.position.z = 350
        this.scene = new Scene()
        this.scene.fog = new Fog(0xffffff, 100, 1000)
        this.renderer = new WebGLRenderer({
          alpha: true
        })
        this.renderer.setPixelRatio(window.devicePixelRatio)
        this.renderer.setSize(width, height)
        this.container.appendChild(this.renderer.domElement)
        this.renderer.setClearColor(this.canvasBgColor, this.canvasBgAlpha)
        this.initComputeRenderer()

        document.addEventListener('mousemove', this.onDocumentMouseMove, {
          passive: false
        })
        document.addEventListener('touchstart', this.onDocumentTouchStart, {
          passive: true
        })
        document.addEventListener('touchmove', this.onDocumentTouchMove, {
          passive: true
        })
        document.addEventListener('wheel', this.onDocumentScroll, {
          passive: false
        })

        this.updateControllerValues(this.effectController)
        this.initBirds()
      },

      updateControllerValues({ separation, alignment, cohesion, freedom }) {
        this.velocityUniforms['separationDistance'].value = separation
        this.velocityUniforms['alignmentDistance'].value = alignment
        this.velocityUniforms['cohesionDistance'].value = cohesion
        this.velocityUniforms['freedomFactor'].value = freedom
      },

      getNewColor(order) {
        const colorMode = this.colorMode[this.colorEffect],
          c1 = new Color(this.color1),
          c2 = new Color(this.color2),
          gradient = colorMode.indexOf('Gradient') != -1

        let c, dist

        if (gradient) {
          // each vertex has a different color
          dist = Math.random()
        } else {
          // each vertex has the same color
          dist = order
        }

        if (colorMode.indexOf('variance') == 0) {
          const r2 = clamp(c1.r + Math.random() * c2.r, 0, 1),
            g2 = clamp(c1.g + Math.random() * c2.g, 0, 1),
            b2 = clamp(c1.b + Math.random() * c2.b, 0, 1)

          c = new Color(r2, g2, b2)
        } else if (colorMode.indexOf('mix') == 0) {
          // Naive color arithmetic
          c = new Color(c1.getHex() + dist * c2.getHex())
        } else {
          // Linear interpolation
          c = c1.lerp(c2, dist)
        }
        return c
      },

      createBirdGeometry() {
        const birdG = new BufferGeometry(),
          triangles = this.BIRDS * 3,
          points = triangles * 3,
          vertices = new BufferAttribute(new Float32Array(points * 3), 3),
          birdColors = new BufferAttribute(new Float32Array(points * 3), 3),
          references = new BufferAttribute(new Float32Array(points * 2), 2),
          birdVertex = new BufferAttribute(new Float32Array(points), 1),
          colorCache = {}

        birdG.setAttribute('position', vertices)
        birdG.setAttribute('birdColor', birdColors)
        birdG.setAttribute('reference', references)
        birdG.setAttribute('birdVertex', birdVertex)

        let v = 0

        function verts_push() {
          for (let i = 0; i < arguments.length; i++) {
            vertices.array[v++] = arguments[i]
          }
        }

        for (let f = 0; f < this.BIRDS; f++) {
          // Body
          verts_push(0, -0, -20, 0, 4, -20, 0, 0, 30)

          // Left Wing
          verts_push(0, 0, -15, -this.wingsSpan, 0, 0, 0, 0, 15)

          // Right Wing
          verts_push(0, 0, 15, this.wingsSpan, 0, 0, 0, 0, -15)
        }

        for (let v = 0; v < triangles * 3; v++) {
          const i = ~~(v / 3),
            x = (i % this.WIDTH) / this.WIDTH,
            y = ~~(i / this.WIDTH) / this.WIDTH,
            order = ~~(v / 9) / this.BIRDS,
            key = order.toString(),
            gradient = true
          let c

          if (!gradient && colorCache[key]) {
            c = colorCache[key]
          } else {
            c = this.getNewColor(order)
          }
          if (!gradient && !colorCache[key]) {
            colorCache[key] = c
          }

          birdColors.array[v * 3 + 0] = c.r
          birdColors.array[v * 3 + 1] = c.g
          birdColors.array[v * 3 + 2] = c.b
          references.array[v * 2] = x
          references.array[v * 2 + 1] = y
          birdVertex.array[v] = v % 9
        }

        birdG.scale(0.2, 0.2, 0.2)
        return birdG
      },

      initComputeRenderer() {
        this.gpuCompute = new GPUComputationRenderer(
          this.WIDTH,
          this.WIDTH,
          this.renderer
        )

        const dtPosition = this.gpuCompute.createTexture(),
          dtVelocity = this.gpuCompute.createTexture()

        this.fillPositionTexture(dtPosition)
        this.fillVelocityTexture(dtVelocity)

        this.velocityVariable = this.gpuCompute.addVariable(
          'textureVelocity',
          fragmentShaderVelocity,
          dtVelocity
        )
        this.positionVariable = this.gpuCompute.addVariable(
          'texturePosition',
          fragmentShaderPosition,
          dtPosition
        )

        this.gpuCompute.setVariableDependencies(this.velocityVariable, [
          this.positionVariable,
          this.velocityVariable
        ])
        this.gpuCompute.setVariableDependencies(this.positionVariable, [
          this.positionVariable,
          this.velocityVariable
        ])

        this.positionUniforms = this.positionVariable.material.uniforms
        this.velocityUniforms = this.velocityVariable.material.uniforms

        this.positionUniforms['time'] = { value: 0.0 }
        this.positionUniforms['delta'] = { value: 0.0 }
        this.velocityUniforms['time'] = { value: 1.0 }
        this.velocityUniforms['delta'] = { value: 0.0 }
        this.velocityUniforms['testing'] = { value: 1.0 }
        this.velocityUniforms['separationDistance'] = { value: 1.0 }
        this.velocityUniforms['alignmentDistance'] = { value: 1.0 }
        this.velocityUniforms['cohesionDistance'] = { value: 1.0 }
        this.velocityUniforms['freedomFactor'] = { value: 1.0 }
        this.velocityUniforms['predator'] = { value: new Vector3() }
        this.velocityVariable.material.defines.BOUNDS = this.BOUNDS.toFixed(2)
        this.velocityVariable.wrapS = RepeatWrapping
        this.velocityVariable.wrapT = RepeatWrapping
        this.positionVariable.wrapS = RepeatWrapping
        this.positionVariable.wrapT = RepeatWrapping

        const error = this.gpuCompute.init()
        if (error !== null) {
          /* eslint-disable no-console */
          console.error(error)
        }
      },

      initBirds() {
        const geometry = this.BirdGeometry
        // For Vertex and Fragment
        this.birdUniforms = {
          color: { value: new Color(0xff2200) },
          texturePosition: { value: null },
          textureVelocity: { value: null },
          time: { value: 1.0 },
          delta: { value: 0.0 }
        }

        // ShaderMaterial
        const material = new ShaderMaterial({
          uniforms: this.birdUniforms,
          vertexShader: birdVS,
          fragmentShader: birdFS,
          side: DoubleSide
        })

        const birdMesh = new Mesh(geometry, material)
        birdMesh.rotation.y = Math.PI / 2
        birdMesh.matrixAutoUpdate = false
        birdMesh.updateMatrix()
        this.scene.add(birdMesh)
      },

      fillPositionTexture(texture) {
        const theArray = texture.image.data

        for (let k = 0, kl = theArray.length; k < kl; k += 4) {
          const x = Math.random() * this.BOUNDS - this.BOUNDS_HALF,
            y = Math.random() * this.BOUNDS - this.BOUNDS_HALF,
            z = Math.random() * this.BOUNDS - this.BOUNDS_HALF

          theArray[k + 0] = x
          theArray[k + 1] = y
          theArray[k + 2] = z
          theArray[k + 3] = 1
        }
      },

      fillVelocityTexture(texture) {
        const theArray = texture.image.data

        for (let k = 0, kl = theArray.length; k < kl; k += 4) {
          const x = Math.random() - 0.5,
            y = Math.random() - 0.5,
            z = Math.random() - 0.5

          theArray[k + 0] = x * 10
          theArray[k + 1] = y * 10
          theArray[k + 2] = z * 10
          theArray[k + 3] = 1
        }
      },

      onWindowResize(size) {
        this.windowSize = {
          width: (size && size.width) || window.innerWidth,
          height: (size && size.height) || window.innerHeight
        }
        const rerender = this.fixedHeight === null || this.fixedWidth === null

        if (rerender && this.renderer) {
          this.camera.aspect = this.worldSize.width / this.worldSize.height
          this.camera.updateProjectionMatrix()
          this.renderer.setSize(this.worldSize.width, this.worldSize.height)
        }
      },

      onDocumentMouseMove(event) {
        this.mouseX = event.clientX - this.windowHalf.x - 200
        this.mouseY = event.clientY - this.windowHalf.y - 100
      },

      onDocumentTouchStart(event) {
        if (event.touches.length === 1) {
          //won't work if passive is false
          // event.preventDefault()
          this.mouseX = event.touches[0].pageX - this.windowHalf.x
          this.mouseY = event.touches[0].pageY - this.windowHalf.y
        }
      },

      onDocumentTouchMove(event) {
        if (event.touches.length === 1) {
          // event.preventDefault()
          this.mouseX = event.touches[0].pageX - this.windowHalf.x
          this.mouseY = event.touches[0].pageY - this.windowHalf.y
        }
      },

      checkScrollDirectionIsUp(event) {
        if (event.wheelDelta) {
          return event.wheelDelta > 0
        }
        return event.deltaY < 0
      },

      //trying to make birds move with scroll
      onDocumentScroll(event) {
        let mouseY

        if (this.checkScrollDirectionIsUp(event)) {
          mouseY = this.windowHalf.y / 2
        } else {
          mouseY = -this.windowHalf.y / 2
        }

        // birds always move towards center x
        this.mouseX = 0
        this.mouseY = mouseY
      },

      animate() {
        this.animationReq = requestAnimationFrame(this.animate)
        this.render()
      },

      destroy() {
        document.removeEventListener('mousemove', this.onDocumentMouseMove, {
          passive: false
        })
        document.removeEventListener('touchstart', this.onDocumentTouchStart, {
          passive: false
        })
        document.removeEventListener('touchmove', this.onDocumentTouchMove, {
          passive: false
        })
        document.removeEventListener('wheel', this.onDocumentScroll, {
          passive: false
        })
        cancelAnimationFrame(this.animationReq)
        this.renderer = null
        this.scene = null
      },

      render() {
        const now = window.performance.now()
        let delta = (now - this.last) / 1000
        if (delta > 1) delta = 1 // safety cap on large deltas
        this.last = now

        this.positionUniforms['time'].value = now
        this.positionUniforms['delta'].value = delta
        this.velocityUniforms['time'].value = now
        this.velocityUniforms['delta'].value = delta
        this.birdUniforms['time'].value = now
        this.birdUniforms['delta'].value = delta

        this.velocityUniforms['predator'].value.set(
          (0.5 * this.mouseX) / this.windowHalf.x,
          (-0.5 * this.mouseY) / this.windowHalf.y,
          0
        )

        this.mouseX = 10000
        this.mouseY = 10000

        this.gpuCompute.compute()

        this.birdUniforms[
          'texturePosition'
        ].value = this.gpuCompute.getCurrentRenderTarget(
          this.positionVariable
        ).texture
        this.birdUniforms[
          'textureVelocity'
        ].value = this.gpuCompute.getCurrentRenderTarget(
          this.velocityVariable
        ).texture

        this.renderer.render(this.scene, this.camera)
      }
    }
  }
</script>

<style scoped>
  .container {
    position: absolute;
    width: 100%;
    top: 0;
    bottom: 0;
    overflow: hidden;
  }
</style>
