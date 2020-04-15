(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('three')) :
  typeof define === 'function' && define.amd ? define(['exports', 'three'], factory) :
  (global = global || self, factory(global.VueThreejsBirds = {}, global.THREE));
}(this, (function (exports, three) { 'use strict';

  // Source: https://github.com/mrdoob/three.js/blob/master/examples/jsm/misc/GPUComputationRenderer.js

  var GPUComputationRenderer = function(sizeX, sizeY, renderer) {
    this.variables = [];

    this.currentTextureIndex = 0;

    var scene = new three.Scene();

    var camera = new three.Camera();
    camera.position.z = 1;

    var passThruUniforms = {
      passThruTexture: { value: null }
    };

    var passThruShader = createShaderMaterial(
      getPassThroughFragmentShader(),
      passThruUniforms
    );

    var mesh = new three.Mesh(new three.PlaneBufferGeometry(2, 2), passThruShader);
    scene.add(mesh);

    this.addVariable = function(
      variableName,
      computeFragmentShader,
      initialValueTexture
    ) {
      var material = this.createShaderMaterial(computeFragmentShader);

      var variable = {
        name: variableName,
        initialValueTexture: initialValueTexture,
        material: material,
        dependencies: null,
        renderTargets: [],
        wrapS: null,
        wrapT: null,
        minFilter: three.NearestFilter,
        magFilter: three.NearestFilter
      };

      this.variables.push(variable);

      return variable
    };

    this.setVariableDependencies = function(variable, dependencies) {
      variable.dependencies = dependencies;
    };

    this.init = function() {
      if (
        !renderer.capabilities.isWebGL2 &&
        !renderer.extensions.get('OES_texture_float')
      ) {
        return 'No OES_texture_float support for float textures.'
      }

      if (renderer.capabilities.maxVertexTextures === 0) {
        return 'No support for vertex shader textures.'
      }

      for (var i = 0; i < this.variables.length; i++) {
        var variable = this.variables[i];

        // Creates rendertargets and initialize them with input texture
        variable.renderTargets[0] = this.createRenderTarget(
          sizeX,
          sizeY,
          variable.wrapS,
          variable.wrapT,
          variable.minFilter,
          variable.magFilter
        );
        variable.renderTargets[1] = this.createRenderTarget(
          sizeX,
          sizeY,
          variable.wrapS,
          variable.wrapT,
          variable.minFilter,
          variable.magFilter
        );
        this.renderTexture(
          variable.initialValueTexture,
          variable.renderTargets[0]
        );
        this.renderTexture(
          variable.initialValueTexture,
          variable.renderTargets[1]
        );

        // Adds dependencies uniforms to the ShaderMaterial
        var material = variable.material;
        var uniforms = material.uniforms;
        if (variable.dependencies !== null) {
          for (var d = 0; d < variable.dependencies.length; d++) {
            var depVar = variable.dependencies[d];

            if (depVar.name !== variable.name) {
              // Checks if variable exists
              var found = false;
              for (var j = 0; j < this.variables.length; j++) {
                if (depVar.name === this.variables[j].name) {
                  found = true;
                  break
                }
              }
              if (!found) {
                return (
                  'Variable dependency not found. Variable=' +
                  variable.name +
                  ', dependency=' +
                  depVar.name
                )
              }
            }

            uniforms[depVar.name] = { value: null };

            material.fragmentShader =
              '\nuniform sampler2D ' +
              depVar.name +
              ';\n' +
              material.fragmentShader;
          }
        }
      }

      this.currentTextureIndex = 0;

      return null
    };

    this.compute = function() {
      var currentTextureIndex = this.currentTextureIndex;
      var nextTextureIndex = this.currentTextureIndex === 0 ? 1 : 0;

      for (var i = 0, il = this.variables.length; i < il; i++) {
        var variable = this.variables[i];

        // Sets texture dependencies uniforms
        if (variable.dependencies !== null) {
          var uniforms = variable.material.uniforms;
          for (var d = 0, dl = variable.dependencies.length; d < dl; d++) {
            var depVar = variable.dependencies[d];

            uniforms[depVar.name].value =
              depVar.renderTargets[currentTextureIndex].texture;
          }
        }

        // Performs the computation for this variable
        this.doRenderTarget(
          variable.material,
          variable.renderTargets[nextTextureIndex]
        );
      }

      this.currentTextureIndex = nextTextureIndex;
    };

    this.getCurrentRenderTarget = function(variable) {
      return variable.renderTargets[this.currentTextureIndex]
    };

    this.getAlternateRenderTarget = function(variable) {
      return variable.renderTargets[this.currentTextureIndex === 0 ? 1 : 0]
    };

    function addResolutionDefine(materialShader) {
      materialShader.defines.resolution =
        'vec2( ' + sizeX.toFixed(1) + ', ' + sizeY.toFixed(1) + ' )';
    }
    this.addResolutionDefine = addResolutionDefine;

    // The following functions can be used to compute things manually

    function createShaderMaterial(computeFragmentShader, uniforms) {
      uniforms = uniforms || {};

      var material = new three.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: getPassThroughVertexShader(),
        fragmentShader: computeFragmentShader
      });

      addResolutionDefine(material);

      return material
    }

    this.createShaderMaterial = createShaderMaterial;

    this.createRenderTarget = function(
      sizeXTexture,
      sizeYTexture,
      wrapS,
      wrapT,
      minFilter,
      magFilter
    ) {
      sizeXTexture = sizeXTexture || sizeX;
      sizeYTexture = sizeYTexture || sizeY;

      wrapS = wrapS || three.ClampToEdgeWrapping;
      wrapT = wrapT || three.ClampToEdgeWrapping;

      minFilter = minFilter || three.NearestFilter;
      magFilter = magFilter || three.NearestFilter;

      var renderTarget = new three.WebGLRenderTarget(sizeXTexture, sizeYTexture, {
        wrapS: wrapS,
        wrapT: wrapT,
        minFilter: minFilter,
        magFilter: magFilter,
        format: three.RGBAFormat,
        type: /(iPad|iPhone|iPod)/g.test(navigator.userAgent)
          ? three.HalfFloatType
          : three.FloatType,
        stencilBuffer: false,
        depthBuffer: false
      });

      return renderTarget
    };

    this.createTexture = function() {
      var data = new Float32Array(sizeX * sizeY * 4);
      return new three.DataTexture(data, sizeX, sizeY, three.RGBAFormat, three.FloatType)
    };

    this.renderTexture = function(input, output) {
      // Takes a texture, and render out in rendertarget
      // input = Texture
      // output = RenderTarget

      passThruUniforms.passThruTexture.value = input;

      this.doRenderTarget(passThruShader, output);

      passThruUniforms.passThruTexture.value = null;
    };

    this.doRenderTarget = function(material, output) {
      var currentRenderTarget = renderer.getRenderTarget();

      mesh.material = material;
      renderer.setRenderTarget(output);
      renderer.render(scene, camera);
      mesh.material = passThruShader;

      renderer.setRenderTarget(currentRenderTarget);
    };

    // Shaders

    function getPassThroughVertexShader() {
      return (
        'void main()	{\n' +
        '\n' +
        '	gl_Position = vec4( position, 1.0 );\n' +
        '\n' +
        '}\n'
      )
    }

    function getPassThroughFragmentShader() {
      return (
        'uniform sampler2D passThruTexture;\n' +
        '\n' +
        'void main() {\n' +
        '\n' +
        '	vec2 uv = gl_FragCoord.xy / resolution.xy;\n' +
        '\n' +
        '	gl_FragColor = texture2D( passThruTexture, uv );\n' +
        '\n' +
        '}\n'
      )
    }
  };

  var fragmentShaderPosition = "  uniform float time;\n  uniform float delta;\n\n  void main()\t{\n\n    vec2 uv = gl_FragCoord.xy / resolution.xy;\n    vec4 tmpPos = texture2D( texturePosition, uv );\n    vec3 position = tmpPos.xyz;\n    vec3 velocity = texture2D( textureVelocity, uv ).xyz;\n\n    float phase = tmpPos.w;\n\n    phase = mod( ( phase + delta +\n      length( velocity.xz ) * delta * 3. +\n      max( velocity.y, 0.0 ) * delta * 6. ), 62.83 );\n\n    gl_FragColor = vec4( position + velocity * delta * 15. , phase );\n\n  }\n";

  var fragmentShaderVelocity = "  uniform float time;\n  uniform float testing;\n  uniform float delta; // about 0.016\n  uniform float separationDistance; // 20\n  uniform float alignmentDistance; // 40\n  uniform float cohesionDistance; //\n  uniform float freedomFactor;\n  uniform vec3 predator;\n\n  const float width = resolution.x;\n  const float height = resolution.y;\n\n  const float PI = 3.141592653589793;\n  const float PI_2 = PI * 2.0;\n  // const float VISION = PI * 0.55;\n\n  float zoneRadius = 40.0;\n  float zoneRadiusSquared = 1600.0;\n\n  float separationThresh = 0.45;\n  float alignmentThresh = 0.65;\n\n  const float UPPER_BOUNDS = BOUNDS;\n  const float LOWER_BOUNDS = -UPPER_BOUNDS;\n\n  const float SPEED_LIMIT = 9.0;\n\n  float rand( vec2 co ){\n    return fract( sin( dot( co.xy, vec2(12.9898,78.233) ) ) * 43758.5453 );\n  }\n\n  void main() {\n\n    zoneRadius = separationDistance + alignmentDistance + cohesionDistance;\n    separationThresh = separationDistance / zoneRadius;\n    alignmentThresh = ( separationDistance + alignmentDistance ) / zoneRadius;\n    zoneRadiusSquared = zoneRadius * zoneRadius;\n\n\n    vec2 uv = gl_FragCoord.xy / resolution.xy;\n    vec3 birdPosition, birdVelocity;\n\n    vec3 selfPosition = texture2D( texturePosition, uv ).xyz;\n    vec3 selfVelocity = texture2D( textureVelocity, uv ).xyz;\n\n    float dist;\n    vec3 dir; // direction\n    float distSquared;\n\n    float separationSquared = separationDistance * separationDistance;\n    float cohesionSquared = cohesionDistance * cohesionDistance;\n\n    float f;\n    float percent;\n\n    vec3 velocity = selfVelocity;\n\n    float limit = SPEED_LIMIT;\n\n    dir = predator * UPPER_BOUNDS - selfPosition;\n    dir.z = 0.;\n    // dir.z *= 0.6;\n    dist = length( dir );\n    distSquared = dist * dist;\n\n    float preyRadius = 150.0;\n    float preyRadiusSq = preyRadius * preyRadius;\n\n\n    // move birds away from predator\n    if ( dist < preyRadius ) {\n\n      f = ( distSquared / preyRadiusSq - 1.0 ) * delta * 100.;\n      velocity += normalize( dir ) * f;\n      limit += 5.0;\n    }\n\n\n    // if (testing == 0.0) {}\n    // if ( rand( uv + time ) < freedomFactor ) {}\n\n\n    // Attract flocks to the center\n    vec3 central = vec3( 0., 0., 0. );\n    dir = selfPosition - central;\n    dist = length( dir );\n\n    dir.y *= 2.5;\n    velocity -= normalize( dir ) * delta * 5.;\n\n    for ( float y = 0.0; y < height; y++ ) {\n      for ( float x = 0.0; x < width; x++ ) {\n\n        vec2 ref = vec2( x + 0.5, y + 0.5 ) / resolution.xy;\n        birdPosition = texture2D( texturePosition, ref ).xyz;\n\n        dir = birdPosition - selfPosition;\n        dist = length( dir );\n\n        if ( dist < 0.0001 ) continue;\n\n        distSquared = dist * dist;\n\n        if ( distSquared > zoneRadiusSquared ) continue;\n\n        percent = distSquared / zoneRadiusSquared;\n\n        if ( percent < separationThresh ) { // low\n\n          // Separation - Move apart for comfort\n          f = ( separationThresh / percent - 1.0 ) * delta;\n          velocity -= normalize( dir ) * f;\n\n        } else if ( percent < alignmentThresh ) { // high\n\n          // Alignment - fly the same direction\n          float threshDelta = alignmentThresh - separationThresh;\n          float adjustedPercent = ( percent - separationThresh ) / threshDelta;\n\n          birdVelocity = texture2D( textureVelocity, ref ).xyz;\n\n          f = ( 0.5 - cos( adjustedPercent * PI_2 ) * 0.5 + 0.5 ) * delta;\n          velocity += normalize( birdVelocity ) * f;\n\n        } else {\n\n          // Attraction / Cohesion - move closer\n          float threshDelta = 1.0 - alignmentThresh;\n          float adjustedPercent = ( percent - alignmentThresh ) / threshDelta;\n\n          f = ( 0.5 - ( cos( adjustedPercent * PI_2 ) * -0.5 + 0.5 ) ) * delta;\n\n          velocity += normalize( dir ) * f;\n\n        }\n\n      }\n\n    }\n\n    // this make tends to fly around than down or up\n    // if (velocity.y > 0.) velocity.y *= (1. - 0.2 * delta);\n\n    // Speed Limits\n    if ( length( velocity ) > limit ) {\n      velocity = normalize( velocity ) * limit;\n    }\n\n    gl_FragColor = vec4( velocity, 1.0 );\n\n  }\n";

  var birdVS = "  attribute vec2 reference;\n  attribute float birdVertex;\n\n  attribute vec3 birdColor;\n\n  uniform sampler2D texturePosition;\n  uniform sampler2D textureVelocity;\n\n  varying vec4 vColor;\n  varying float z;\n\n  uniform float time;\n\n  void main() {\n\n    vec4 tmpPos = texture2D( texturePosition, reference );\n    vec3 pos = tmpPos.xyz;\n    vec3 velocity = normalize(texture2D( textureVelocity, reference ).xyz);\n\n    vec3 newPosition = position;\n\n    if ( birdVertex == 4.0 || birdVertex == 7.0 ) {\n      // flap wings\n      newPosition.y = sin( tmpPos.w ) * 5.;\n    }\n\n    newPosition = mat3( modelMatrix ) * newPosition;\n\n\n    velocity.z *= -1.;\n    float xz = length( velocity.xz );\n    float xyz = 1.;\n    float x = sqrt( 1. - velocity.y * velocity.y );\n\n    float cosry = velocity.x / xz;\n    float sinry = velocity.z / xz;\n\n    float cosrz = x / xyz;\n    float sinrz = velocity.y / xyz;\n\n    mat3 maty =  mat3(\n      cosry, 0, -sinry,\n      0    , 1, 0     ,\n      sinry, 0, cosry\n\n    );\n\n    mat3 matz =  mat3(\n      cosrz , sinrz, 0,\n      -sinrz, cosrz, 0,\n      0     , 0    , 1\n    );\n\n    newPosition =  maty * matz * newPosition;\n    newPosition += pos;\n\n    z = newPosition.z;\n\n    vColor = vec4( birdColor, 1.0 );\n    gl_Position = projectionMatrix *  viewMatrix  * vec4( newPosition, 1.0 );\n  }\n";

  var birdFS = "  varying vec4 vColor;\n  varying float z;\n\n  uniform vec3 color;\n\n  void main() {\n  float rr = 0.2 + ( 1000. - z ) / 1000. * vColor.x;\n  float gg = 0.2 + ( 1000. - z ) / 1000. * vColor.y;\n  float bb = 0.2 + ( 1000. - z ) / 1000. * vColor.z;\n  gl_FragColor = vec4( rr, gg, bb, 1. );\n  }\n";

  Number.prototype.clamp = function(min, max) {
    return Math.min(Math.max(this, min), max)
  };

  //

  var script = {
    name: 'VueThreejsBirds',

    props: {
      canvasBgColor: [String, Number],
      canvasBgAlpha: { default: 1, type: Number, required: false },
      color1: [String, Number],
      color2: [String, Number],
      colorEffect: {
        default: 0,
        type: Number,
        required: false
      },
      effectController: {
        default: function () { return ({
          separation: 20.0,
          alignment: 20.0,
          cohesion: 20.0,
          freedom: 0.75
        }); },
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

    data: function data() {
      return {
        animationReq: null,
        BIRDS: 32 * 32,
        bgAlpha: 1,
        bgColor: 0xffffff,
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
        dimensionsObj: {},
        gpuCompute: null,
        last: window.performance.now(),
        mouseY: 0,
        mouseX: 0,
        positionVariable: {},
        positionUniforms: {},
        renderer: null,
        scrollDirChanged: false,
        currScrollDir: { up: false, down: false },
        scene: null,
        WIDTH: 32,
        worldWidth: 1440,
        worldHeight: 900,
        velocityUniforms: {},
        velocityVariable: {}
      }
    },

    computed: {
      windowHalfX: function() {
        return this.worldWidth / 2
      },
      windowHalfY: function() {
        return this.worldHeight / 2
      }
    },

    mounted: function mounted() {
      this.worldWidth = window.innerWidth;
      this.worldHeight = window.innerHeight;

      if (this.canvasBgAlpha || this.canvasBgAlpha === 0)
        { this.bgAlpha = Math.max(Math.min(this.canvasBgAlpha, 1), 0); }
      if (this.fixedHeight !== null) {
        this.worldHeight = this.fixedHeight;
      }
      if (this.fixedWidth !== null) {
        this.worldWidth = this.fixedWidth;
      }

      var dimensions = {};

      if (this.minHeight) {
        dimensions.minHeight = this.minHeight + 'px';
      }
      if (this.minWidth) {
        dimensions.minWidth = this.minWidth + 'px';
      }
      this.dimensionsObj = dimensions;
      this.worldHeight = Math.max(this.minHeight, this.worldHeight);
      this.worldWidth = Math.max(this.minWidth, this.worldWidth);

      // black in binary is 0
      if (this.canvasBgColor || this.canvasBgColor === 0)
        { this.bgColor = this.canvasBgColor; }
      this.WIDTH = Math.pow(
        2,
        Math.max(Math.min(Math.abs(this.quantity), 5), 1)
      ); //My computer can't handle too many birdiez :(
      this.BIRDS = this.WIDTH * this.WIDTH;
      this.BirdGeometry = this.createBirdGeometry();
      this.init();
      this.animate();
      this.$root.$on('resized', this.onWindowResize);
    },

    beforeDestroy: function beforeDestroy() {
      this.destroy();
    },

    methods: {
      init: function() {
        this.container = this.$refs.birdContainer;
        this.camera = new three.PerspectiveCamera(
          75,
          this.worldWidth / this.worldHeight,
          1,
          3000
        );
        this.camera.position.z = 350;
        this.scene = new three.Scene();
        this.scene.fog = new three.Fog(0xffffff, 100, 1000);
        this.renderer = new three.WebGLRenderer({
          alpha: true
        });

        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(this.worldWidth, this.worldHeight);
        this.container.appendChild(this.renderer.domElement);
        this.renderer.setClearColor(this.bgColor, this.bgAlpha);
        this.initComputeRenderer();

        document.addEventListener('mousemove', this.onDocumentMouseMove, {
          passive: false
        });
        document.addEventListener('touchstart', this.onDocumentTouchStart, {
          passive: true
        });
        document.addEventListener('touchmove', this.onDocumentTouchMove, {
          passive: true
        });
        document.addEventListener('wheel', this.onDocumentScroll, {
          passive: false
        });

        this.updateControllerValues(this.effectController);
        this.initBirds();
      },

      updateControllerValues: function updateControllerValues(ref) {
        var separation = ref.separation;
        var alignment = ref.alignment;
        var cohesion = ref.cohesion;
        var freedom = ref.freedom;

        this.velocityUniforms['separationDistance'].value = separation;
        this.velocityUniforms['alignmentDistance'].value = alignment;
        this.velocityUniforms['cohesionDistance'].value = cohesion;
        this.velocityUniforms['freedomFactor'].value = freedom;
      },

      getNewColor: function getNewColor(order) {
        var color1 = this.color1 === undefined ? 0x8bf329 : this.color1,
          color2 = this.color2 === undefined ? 0x298bf3 : this.color2,
          colorMode = this.colorMode[this.colorEffect],
          c1 = new three.Color(color1),
          c2 = new three.Color(color2),
          gradient = colorMode.indexOf('Gradient') != -1;

        var c, dist;

        if (gradient) {
          // each vertex has a different color
          dist = Math.random();
        } else {
          // each vertex has the same color
          dist = order;
        }

        if (colorMode.indexOf('variance') == 0) {
          var r2 = (c1.r + Math.random() * c2.r).clamp(0, 1),
            g2 = (c1.g + Math.random() * c2.g).clamp(0, 1),
            b2 = (c1.b + Math.random() * c2.b).clamp(0, 1);
          c = new three.Color(r2, g2, b2);
        } else if (colorMode.indexOf('mix') == 0) {
          // Naive color arithmetic
          c = new three.Color(color1 + dist * color2);
        } else {
          // Linear interpolation
          c = c1.lerp(c2, dist);
        }
        return c
      },

      createBirdGeometry: function createBirdGeometry() {
        var birdG = new three.BufferGeometry(),
          triangles = this.BIRDS * 3,
          points = triangles * 3,
          vertices = new three.BufferAttribute(new Float32Array(points * 3), 3),
          birdColors = new three.BufferAttribute(new Float32Array(points * 3), 3),
          references = new three.BufferAttribute(new Float32Array(points * 2), 2),
          birdVertex = new three.BufferAttribute(new Float32Array(points), 1),
          colorCache = {};

        birdG.setAttribute('position', vertices);
        birdG.setAttribute('birdColor', birdColors);
        birdG.setAttribute('reference', references);
        birdG.setAttribute('birdVertex', birdVertex);

        var v = 0;

        function verts_push() {
          var arguments$1 = arguments;

          for (var i = 0; i < arguments.length; i++) {
            vertices.array[v++] = arguments$1[i];
          }
        }

        for (var f = 0; f < this.BIRDS; f++) {
          // Body
          verts_push(0, -0, -20, 0, 4, -20, 0, 0, 30);

          // Left Wing
          verts_push(0, 0, -15, -this.wingsSpan, 0, 0, 0, 0, 15);

          // Right Wing
          verts_push(0, 0, 15, this.wingsSpan, 0, 0, 0, 0, -15);
        }

        for (var v$1 = 0; v$1 < triangles * 3; v$1++) {
          var i = ~~(v$1 / 3),
            x = (i % this.WIDTH) / this.WIDTH,
            y = ~~(i / this.WIDTH) / this.WIDTH,
            order = ~~(v$1 / 9) / this.BIRDS,
            key = order.toString(),
            gradient = true;
          var c = (void 0);

          if (!gradient && colorCache[key]) {
            c = colorCache[key];
          } else {
            c = this.getNewColor(order);
          }
          if (!gradient && !colorCache[key]) {
            colorCache[key] = c;
          }

          birdColors.array[v$1 * 3 + 0] = c.r;
          birdColors.array[v$1 * 3 + 1] = c.g;
          birdColors.array[v$1 * 3 + 2] = c.b;
          references.array[v$1 * 2] = x;
          references.array[v$1 * 2 + 1] = y;
          birdVertex.array[v$1] = v$1 % 9;
        }

        birdG.scale(0.2, 0.2, 0.2);
        return birdG
      },

      initComputeRenderer: function initComputeRenderer() {
        this.gpuCompute = new GPUComputationRenderer(
          this.WIDTH,
          this.WIDTH,
          this.renderer
        );

        var dtPosition = this.gpuCompute.createTexture(),
          dtVelocity = this.gpuCompute.createTexture();

        this.fillPositionTexture(dtPosition);
        this.fillVelocityTexture(dtVelocity);

        this.velocityVariable = this.gpuCompute.addVariable(
          'textureVelocity',
          fragmentShaderVelocity,
          dtVelocity
        );
        this.positionVariable = this.gpuCompute.addVariable(
          'texturePosition',
          fragmentShaderPosition,
          dtPosition
        );

        this.gpuCompute.setVariableDependencies(this.velocityVariable, [
          this.positionVariable,
          this.velocityVariable
        ]);
        this.gpuCompute.setVariableDependencies(this.positionVariable, [
          this.positionVariable,
          this.velocityVariable
        ]);

        this.positionUniforms = this.positionVariable.material.uniforms;
        this.velocityUniforms = this.velocityVariable.material.uniforms;

        this.positionUniforms['time'] = { value: 0.0 };
        this.positionUniforms['delta'] = { value: 0.0 };
        this.velocityUniforms['time'] = { value: 1.0 };
        this.velocityUniforms['delta'] = { value: 0.0 };
        this.velocityUniforms['testing'] = { value: 1.0 };
        this.velocityUniforms['separationDistance'] = { value: 1.0 };
        this.velocityUniforms['alignmentDistance'] = { value: 1.0 };
        this.velocityUniforms['cohesionDistance'] = { value: 1.0 };
        this.velocityUniforms['freedomFactor'] = { value: 1.0 };
        this.velocityUniforms['predator'] = { value: new three.Vector3() };
        this.velocityVariable.material.defines.BOUNDS = this.BOUNDS.toFixed(2);
        this.velocityVariable.wrapS = three.RepeatWrapping;
        this.velocityVariable.wrapT = three.RepeatWrapping;
        this.positionVariable.wrapS = three.RepeatWrapping;
        this.positionVariable.wrapT = three.RepeatWrapping;

        var error = this.gpuCompute.init();
        if (error !== null) {
          /* eslint-disable no-console */
          console.error(error);
        }
      },

      initBirds: function initBirds() {
        var geometry = this.BirdGeometry;
        // For Vertex and Fragment
        this.birdUniforms = {
          color: { value: new three.Color(0xff2200) },
          texturePosition: { value: null },
          textureVelocity: { value: null },
          time: { value: 1.0 },
          delta: { value: 0.0 }
        };

        // ShaderMaterial
        var material = new three.ShaderMaterial({
          uniforms: this.birdUniforms,
          vertexShader: birdVS,
          fragmentShader: birdFS,
          side: three.DoubleSide
        });

        var birdMesh = new three.Mesh(geometry, material);
        birdMesh.rotation.y = Math.PI / 2;
        birdMesh.matrixAutoUpdate = false;
        birdMesh.updateMatrix();
        this.scene.add(birdMesh);
      },

      fillPositionTexture: function fillPositionTexture(texture) {
        var theArray = texture.image.data;

        for (var k = 0, kl = theArray.length; k < kl; k += 4) {
          var x = Math.random() * this.BOUNDS - this.BOUNDS_HALF,
            y = Math.random() * this.BOUNDS - this.BOUNDS_HALF,
            z = Math.random() * this.BOUNDS - this.BOUNDS_HALF;

          theArray[k + 0] = x;
          theArray[k + 1] = y;
          theArray[k + 2] = z;
          theArray[k + 3] = 1;
        }
      },

      fillVelocityTexture: function fillVelocityTexture(texture) {
        var theArray = texture.image.data;

        for (var k = 0, kl = theArray.length; k < kl; k += 4) {
          var x = Math.random() - 0.5,
            y = Math.random() - 0.5,
            z = Math.random() - 0.5;

          theArray[k + 0] = x * 10;
          theArray[k + 1] = y * 10;
          theArray[k + 2] = z * 10;
          theArray[k + 3] = 1;
        }
      },

      onWindowResize: function onWindowResize() {
        var rerender = this.fixedHeight === null || this.fixedWidth === null;
        if (this.fixedHeight === null) {
          this.worldHeight = Math.max(window.innerHeight, this.minHeight);
        }
        if (this.fixedWidth === null) {
          this.worldWidth = Math.max(window.innerWidth, this.minWidth);
        }
        if (rerender && this.renderer) {
          this.camera.aspect = this.worldWidth / this.worldHeight;
          this.camera.updateProjectionMatrix();
          this.renderer.setSize(this.worldWidth, this.worldHeight);
        }
      },

      onDocumentMouseMove: function onDocumentMouseMove(event) {
        this.mouseX = event.clientX - this.windowHalfX - 200;
        this.mouseY = event.clientY - this.windowHalfY - 100;
      },

      onDocumentTouchStart: function onDocumentTouchStart(event) {
        if (event.touches.length === 1) {
          //won't work if passive is false
          // event.preventDefault()
          this.mouseX = event.touches[0].pageX - this.windowHalfX;
          this.mouseY = event.touches[0].pageY - this.windowHalfY;
        }
      },
      onDocumentTouchMove: function onDocumentTouchMove(event) {
        if (event.touches.length === 1) {
          // event.preventDefault()
          this.mouseX = event.touches[0].pageX - this.windowHalfX;
          this.mouseY = event.touches[0].pageY - this.windowHalfY;
        }
      },
      checkScrollDirectionIsUp: function checkScrollDirectionIsUp(event) {
        if (event.wheelDelta) {
          return event.wheelDelta > 0
        }
        return event.deltaY < 0
      },

      //trying to make birds move with scroll
      onDocumentScroll: function onDocumentScroll(event) {
        if (!this.currScrollDir.down && !this.currScrollDir.up) {
          this.scrollDirChanged = true;
        }
        if (this.checkScrollDirectionIsUp(event)) {
          if (this.currScrollDir.up && !this.currScrollDir.down) {
            this.scrollDirChanged = false;
          }
          if (!this.currScrollDir.up && this.currScrollDir.down) {
            this.scrollDirChanged = true;
          }
          this.currScrollDir.down = false;
          this.currScrollDir.up = true;
          this.mouseX = 0;
          this.mouseY = this.windowHalfY / 3;
        } else {
          if (this.currScrollDir.down && !this.currScrollDir.up) {
            this.scrollDirChanged = false;
          }
          if (!this.currScrollDir.down && this.currScrollDir.up) {
            this.scrollDirChanged = true;
          }
          this.currScrollDir.down = true;
          this.currScrollDir.up = false;
          this.mouseX = 0;
          this.mouseY = -this.windowHalfY / 3;
        }
      },

      animate: function animate() {
        this.animationReq = requestAnimationFrame(this.animate);
        this.render();
      },

      destroy: function destroy() {
        document.removeEventListener('mousemove', this.onDocumentMouseMove, {
          passive: false
        });
        document.removeEventListener('touchstart', this.onDocumentTouchStart, {
          passive: false
        });
        document.removeEventListener('touchmove', this.onDocumentTouchMove, {
          passive: false
        });
        document.removeEventListener('wheel', this.onDocumentScroll, {
          passive: false
        });
        cancelAnimationFrame(this.animationReq);
        this.renderer = null;
        this.scene = null;
      },

      render: function render() {
        var now = window.performance.now();
        var delta = (now - this.last) / 1000;
        if (delta > 1) { delta = 1; } // safety cap on large deltas
        this.last = now;

        this.positionUniforms['time'].value = now;
        this.positionUniforms['delta'].value = delta;
        this.velocityUniforms['time'].value = now;
        this.velocityUniforms['delta'].value = delta;
        this.birdUniforms['time'].value = now;
        this.birdUniforms['delta'].value = delta;

        this.velocityUniforms['predator'].value.set(
          (0.5 * this.mouseX) / this.windowHalfX,
          (-0.5 * this.mouseY) / this.windowHalfY,
          0
        );

        this.mouseX = 10000;
        this.mouseY = 10000;

        this.gpuCompute.compute();

        this.birdUniforms[
          'texturePosition'
        ].value = this.gpuCompute.getCurrentRenderTarget(
          this.positionVariable
        ).texture;
        this.birdUniforms[
          'textureVelocity'
        ].value = this.gpuCompute.getCurrentRenderTarget(
          this.velocityVariable
        ).texture;

        this.renderer.render(this.scene, this.camera);
      }
    }
  };

  function normalizeComponent(template, style, script, scopeId, isFunctionalTemplate, moduleIdentifier /* server only */, shadowMode, createInjector, createInjectorSSR, createInjectorShadow) {
      if (typeof shadowMode !== 'boolean') {
          createInjectorSSR = createInjector;
          createInjector = shadowMode;
          shadowMode = false;
      }
      // Vue.extend constructor export interop.
      var options = typeof script === 'function' ? script.options : script;
      // render functions
      if (template && template.render) {
          options.render = template.render;
          options.staticRenderFns = template.staticRenderFns;
          options._compiled = true;
          // functional template
          if (isFunctionalTemplate) {
              options.functional = true;
          }
      }
      // scopedId
      if (scopeId) {
          options._scopeId = scopeId;
      }
      var hook;
      if (moduleIdentifier) {
          // server build
          hook = function (context) {
              // 2.3 injection
              context =
                  context || // cached call
                      (this.$vnode && this.$vnode.ssrContext) || // stateful
                      (this.parent && this.parent.$vnode && this.parent.$vnode.ssrContext); // functional
              // 2.2 with runInNewContext: true
              if (!context && typeof __VUE_SSR_CONTEXT__ !== 'undefined') {
                  context = __VUE_SSR_CONTEXT__;
              }
              // inject component styles
              if (style) {
                  style.call(this, createInjectorSSR(context));
              }
              // register component module identifier for async chunk inference
              if (context && context._registeredComponents) {
                  context._registeredComponents.add(moduleIdentifier);
              }
          };
          // used by ssr in case component is cached and beforeCreate
          // never gets called
          options._ssrRegister = hook;
      }
      else if (style) {
          hook = shadowMode
              ? function (context) {
                  style.call(this, createInjectorShadow(context, this.$root.$options.shadowRoot));
              }
              : function (context) {
                  style.call(this, createInjector(context));
              };
      }
      if (hook) {
          if (options.functional) {
              // register for functional component in vue file
              var originalRender = options.render;
              options.render = function renderWithStyleInjection(h, context) {
                  hook.call(context);
                  return originalRender(h, context);
              };
          }
          else {
              // inject component registration as beforeCreate hook
              var existing = options.beforeCreate;
              options.beforeCreate = existing ? [].concat(existing, hook) : [hook];
          }
      }
      return script;
  }

  var isOldIE = typeof navigator !== 'undefined' &&
      /msie [6-9]\\b/.test(navigator.userAgent.toLowerCase());
  function createInjector(context) {
      return function (id, style) { return addStyle(id, style); };
  }
  var HEAD;
  var styles = {};
  function addStyle(id, css) {
      var group = isOldIE ? css.media || 'default' : id;
      var style = styles[group] || (styles[group] = { ids: new Set(), styles: [] });
      if (!style.ids.has(id)) {
          style.ids.add(id);
          var code = css.source;
          if (css.map) {
              // https://developer.chrome.com/devtools/docs/javascript-debugging
              // this makes source maps inside style tags work properly in Chrome
              code += '\n/*# sourceURL=' + css.map.sources[0] + ' */';
              // http://stackoverflow.com/a/26603875
              code +=
                  '\n/*# sourceMappingURL=data:application/json;base64,' +
                      btoa(unescape(encodeURIComponent(JSON.stringify(css.map)))) +
                      ' */';
          }
          if (!style.element) {
              style.element = document.createElement('style');
              style.element.type = 'text/css';
              if (css.media)
                  { style.element.setAttribute('media', css.media); }
              if (HEAD === undefined) {
                  HEAD = document.head || document.getElementsByTagName('head')[0];
              }
              HEAD.appendChild(style.element);
          }
          if ('styleSheet' in style.element) {
              style.styles.push(code);
              style.element.styleSheet.cssText = style.styles
                  .filter(Boolean)
                  .join('\n');
          }
          else {
              var index = style.ids.size - 1;
              var textNode = document.createTextNode(code);
              var nodes = style.element.childNodes;
              if (nodes[index])
                  { style.element.removeChild(nodes[index]); }
              if (nodes.length)
                  { style.element.insertBefore(textNode, nodes[index]); }
              else
                  { style.element.appendChild(textNode); }
          }
      }
  }

  /* script */
  var __vue_script__ = script;

  /* template */
  var __vue_render__ = function() {
    var _vm = this;
    var _h = _vm.$createElement;
    var _c = _vm._self._c || _h;
    return _c("div", {
      ref: "birdContainer",
      staticClass: "container",
      style: _vm.dimensionsObj
    })
  };
  var __vue_staticRenderFns__ = [];
  __vue_render__._withStripped = true;

    /* style */
    var __vue_inject_styles__ = function (inject) {
      if (!inject) { return }
      inject("data-v-836e67ec_0", { source: "\n.container[data-v-836e67ec] {\n  position: absolute;\n  width: 100%;\n  top: 0;\n  bottom: 0;\n  overflow: hidden;\n}\n", map: {"version":3,"sources":["/Users/samsaama/Desktop/CompSci/projects/vue-threejs-birds/src/components/Birds.vue"],"names":[],"mappings":";AAwjBA;EACA,kBAAA;EACA,WAAA;EACA,MAAA;EACA,SAAA;EACA,gBAAA;AACA","file":"Birds.vue","sourcesContent":["<template>\n  <div ref=\"birdContainer\" :style=\"dimensionsObj\" class=\"container\"></div>\n</template>\n\n<script>\n  import {\n    PerspectiveCamera,\n    Scene,\n    Fog,\n    WebGLRenderer,\n    Color,\n    BufferGeometry,\n    BufferAttribute,\n    Vector3,\n    RepeatWrapping,\n    ShaderMaterial,\n    DoubleSide,\n    Mesh\n  } from 'three'\n  import { GPUComputationRenderer } from './../assets/vendors/GPUComputationRenderer.js'\n  import {\n    fragmentShaderPosition,\n    fragmentShaderVelocity,\n    birdVS,\n    birdFS\n  } from '../utils/shaders.js'\n  import '../utils/helpers.js'\n\n  export default {\n    name: 'VueThreejsBirds',\n\n    props: {\n      canvasBgColor: [String, Number],\n      canvasBgAlpha: { default: 1, type: Number, required: false },\n      color1: [String, Number],\n      color2: [String, Number],\n      colorEffect: {\n        default: 0,\n        type: Number,\n        required: false\n      },\n      effectController: {\n        default: () => ({\n          separation: 20.0,\n          alignment: 20.0,\n          cohesion: 20.0,\n          freedom: 0.75\n        }),\n        type: Object,\n        required: false\n      },\n      fixedHeight: {\n        type: Number,\n        default: null,\n        required: false\n      },\n      fixedWidth: {\n        type: Number,\n        default: null,\n        required: false\n      },\n      minHeight: {\n        type: Number,\n        default: null,\n        required: false\n      },\n      minWidth: {\n        type: Number,\n        default: null,\n        required: false\n      },\n      quantity: {\n        default: 32,\n        type: Number,\n        required: false\n      },\n      wingsSpan: {\n        type: Number,\n        default: 20,\n        required: false\n      }\n    },\n\n    data() {\n      return {\n        animationReq: null,\n        BIRDS: 32 * 32,\n        bgAlpha: 1,\n        bgColor: 0xffffff,\n        BirdGeometry: Object.create(null),\n        birdUniforms: null,\n        BOUNDS: 800,\n        BOUNDS_HALF: 800 / 2,\n        camera: null,\n        colorMode: {\n          0: 'lerp',\n          1: 'lerpGradient',\n          2: 'variance',\n          3: 'varianceGradient',\n          4: 'mix'\n        },\n        container: null,\n        dimensionsObj: {},\n        gpuCompute: null,\n        last: window.performance.now(),\n        mouseY: 0,\n        mouseX: 0,\n        positionVariable: {},\n        positionUniforms: {},\n        renderer: null,\n        scrollDirChanged: false,\n        currScrollDir: { up: false, down: false },\n        scene: null,\n        WIDTH: 32,\n        worldWidth: 1440,\n        worldHeight: 900,\n        velocityUniforms: {},\n        velocityVariable: {}\n      }\n    },\n\n    computed: {\n      windowHalfX: function() {\n        return this.worldWidth / 2\n      },\n      windowHalfY: function() {\n        return this.worldHeight / 2\n      }\n    },\n\n    mounted() {\n      this.worldWidth = window.innerWidth\n      this.worldHeight = window.innerHeight\n\n      if (this.canvasBgAlpha || this.canvasBgAlpha === 0)\n        this.bgAlpha = Math.max(Math.min(this.canvasBgAlpha, 1), 0)\n      if (this.fixedHeight !== null) {\n        this.worldHeight = this.fixedHeight\n      }\n      if (this.fixedWidth !== null) {\n        this.worldWidth = this.fixedWidth\n      }\n\n      const dimensions = {}\n\n      if (this.minHeight) {\n        dimensions.minHeight = this.minHeight + 'px'\n      }\n      if (this.minWidth) {\n        dimensions.minWidth = this.minWidth + 'px'\n      }\n      this.dimensionsObj = dimensions\n      this.worldHeight = Math.max(this.minHeight, this.worldHeight)\n      this.worldWidth = Math.max(this.minWidth, this.worldWidth)\n\n      // black in binary is 0\n      if (this.canvasBgColor || this.canvasBgColor === 0)\n        this.bgColor = this.canvasBgColor\n      this.WIDTH = Math.pow(\n        2,\n        Math.max(Math.min(Math.abs(this.quantity), 5), 1)\n      ) //My computer can't handle too many birdiez :(\n      this.BIRDS = this.WIDTH * this.WIDTH\n      this.BirdGeometry = this.createBirdGeometry()\n      this.init()\n      this.animate()\n      this.$root.$on('resized', this.onWindowResize)\n    },\n\n    beforeDestroy() {\n      this.destroy()\n    },\n\n    methods: {\n      init: function() {\n        this.container = this.$refs.birdContainer\n        this.camera = new PerspectiveCamera(\n          75,\n          this.worldWidth / this.worldHeight,\n          1,\n          3000\n        )\n        this.camera.position.z = 350\n        this.scene = new Scene()\n        this.scene.fog = new Fog(0xffffff, 100, 1000)\n        this.renderer = new WebGLRenderer({\n          alpha: true\n        })\n\n        this.renderer.setPixelRatio(window.devicePixelRatio)\n        this.renderer.setSize(this.worldWidth, this.worldHeight)\n        this.container.appendChild(this.renderer.domElement)\n        this.renderer.setClearColor(this.bgColor, this.bgAlpha)\n        this.initComputeRenderer()\n\n        document.addEventListener('mousemove', this.onDocumentMouseMove, {\n          passive: false\n        })\n        document.addEventListener('touchstart', this.onDocumentTouchStart, {\n          passive: true\n        })\n        document.addEventListener('touchmove', this.onDocumentTouchMove, {\n          passive: true\n        })\n        document.addEventListener('wheel', this.onDocumentScroll, {\n          passive: false\n        })\n\n        this.updateControllerValues(this.effectController)\n        this.initBirds()\n      },\n\n      updateControllerValues({ separation, alignment, cohesion, freedom }) {\n        this.velocityUniforms['separationDistance'].value = separation\n        this.velocityUniforms['alignmentDistance'].value = alignment\n        this.velocityUniforms['cohesionDistance'].value = cohesion\n        this.velocityUniforms['freedomFactor'].value = freedom\n      },\n\n      getNewColor(order) {\n        const color1 = this.color1 === undefined ? 0x8bf329 : this.color1,\n          color2 = this.color2 === undefined ? 0x298bf3 : this.color2,\n          colorMode = this.colorMode[this.colorEffect],\n          c1 = new Color(color1),\n          c2 = new Color(color2),\n          gradient = colorMode.indexOf('Gradient') != -1\n\n        let c, dist\n\n        if (gradient) {\n          // each vertex has a different color\n          dist = Math.random()\n        } else {\n          // each vertex has the same color\n          dist = order\n        }\n\n        if (colorMode.indexOf('variance') == 0) {\n          const r2 = (c1.r + Math.random() * c2.r).clamp(0, 1),\n            g2 = (c1.g + Math.random() * c2.g).clamp(0, 1),\n            b2 = (c1.b + Math.random() * c2.b).clamp(0, 1)\n          c = new Color(r2, g2, b2)\n        } else if (colorMode.indexOf('mix') == 0) {\n          // Naive color arithmetic\n          c = new Color(color1 + dist * color2)\n        } else {\n          // Linear interpolation\n          c = c1.lerp(c2, dist)\n        }\n        return c\n      },\n\n      createBirdGeometry() {\n        const birdG = new BufferGeometry(),\n          triangles = this.BIRDS * 3,\n          points = triangles * 3,\n          vertices = new BufferAttribute(new Float32Array(points * 3), 3),\n          birdColors = new BufferAttribute(new Float32Array(points * 3), 3),\n          references = new BufferAttribute(new Float32Array(points * 2), 2),\n          birdVertex = new BufferAttribute(new Float32Array(points), 1),\n          colorCache = {}\n\n        birdG.setAttribute('position', vertices)\n        birdG.setAttribute('birdColor', birdColors)\n        birdG.setAttribute('reference', references)\n        birdG.setAttribute('birdVertex', birdVertex)\n\n        let v = 0\n\n        function verts_push() {\n          for (let i = 0; i < arguments.length; i++) {\n            vertices.array[v++] = arguments[i]\n          }\n        }\n\n        for (let f = 0; f < this.BIRDS; f++) {\n          // Body\n          verts_push(0, -0, -20, 0, 4, -20, 0, 0, 30)\n\n          // Left Wing\n          verts_push(0, 0, -15, -this.wingsSpan, 0, 0, 0, 0, 15)\n\n          // Right Wing\n          verts_push(0, 0, 15, this.wingsSpan, 0, 0, 0, 0, -15)\n        }\n\n        for (let v = 0; v < triangles * 3; v++) {\n          const i = ~~(v / 3),\n            x = (i % this.WIDTH) / this.WIDTH,\n            y = ~~(i / this.WIDTH) / this.WIDTH,\n            order = ~~(v / 9) / this.BIRDS,\n            key = order.toString(),\n            gradient = true\n          let c\n\n          if (!gradient && colorCache[key]) {\n            c = colorCache[key]\n          } else {\n            c = this.getNewColor(order)\n          }\n          if (!gradient && !colorCache[key]) {\n            colorCache[key] = c\n          }\n\n          birdColors.array[v * 3 + 0] = c.r\n          birdColors.array[v * 3 + 1] = c.g\n          birdColors.array[v * 3 + 2] = c.b\n          references.array[v * 2] = x\n          references.array[v * 2 + 1] = y\n          birdVertex.array[v] = v % 9\n        }\n\n        birdG.scale(0.2, 0.2, 0.2)\n        return birdG\n      },\n\n      initComputeRenderer() {\n        this.gpuCompute = new GPUComputationRenderer(\n          this.WIDTH,\n          this.WIDTH,\n          this.renderer\n        )\n\n        const dtPosition = this.gpuCompute.createTexture(),\n          dtVelocity = this.gpuCompute.createTexture()\n\n        this.fillPositionTexture(dtPosition)\n        this.fillVelocityTexture(dtVelocity)\n\n        this.velocityVariable = this.gpuCompute.addVariable(\n          'textureVelocity',\n          fragmentShaderVelocity,\n          dtVelocity\n        )\n        this.positionVariable = this.gpuCompute.addVariable(\n          'texturePosition',\n          fragmentShaderPosition,\n          dtPosition\n        )\n\n        this.gpuCompute.setVariableDependencies(this.velocityVariable, [\n          this.positionVariable,\n          this.velocityVariable\n        ])\n        this.gpuCompute.setVariableDependencies(this.positionVariable, [\n          this.positionVariable,\n          this.velocityVariable\n        ])\n\n        this.positionUniforms = this.positionVariable.material.uniforms\n        this.velocityUniforms = this.velocityVariable.material.uniforms\n\n        this.positionUniforms['time'] = { value: 0.0 }\n        this.positionUniforms['delta'] = { value: 0.0 }\n        this.velocityUniforms['time'] = { value: 1.0 }\n        this.velocityUniforms['delta'] = { value: 0.0 }\n        this.velocityUniforms['testing'] = { value: 1.0 }\n        this.velocityUniforms['separationDistance'] = { value: 1.0 }\n        this.velocityUniforms['alignmentDistance'] = { value: 1.0 }\n        this.velocityUniforms['cohesionDistance'] = { value: 1.0 }\n        this.velocityUniforms['freedomFactor'] = { value: 1.0 }\n        this.velocityUniforms['predator'] = { value: new Vector3() }\n        this.velocityVariable.material.defines.BOUNDS = this.BOUNDS.toFixed(2)\n        this.velocityVariable.wrapS = RepeatWrapping\n        this.velocityVariable.wrapT = RepeatWrapping\n        this.positionVariable.wrapS = RepeatWrapping\n        this.positionVariable.wrapT = RepeatWrapping\n\n        const error = this.gpuCompute.init()\n        if (error !== null) {\n          /* eslint-disable no-console */\n          console.error(error)\n        }\n      },\n\n      initBirds() {\n        const geometry = this.BirdGeometry\n        // For Vertex and Fragment\n        this.birdUniforms = {\n          color: { value: new Color(0xff2200) },\n          texturePosition: { value: null },\n          textureVelocity: { value: null },\n          time: { value: 1.0 },\n          delta: { value: 0.0 }\n        }\n\n        // ShaderMaterial\n        const material = new ShaderMaterial({\n          uniforms: this.birdUniforms,\n          vertexShader: birdVS,\n          fragmentShader: birdFS,\n          side: DoubleSide\n        })\n\n        const birdMesh = new Mesh(geometry, material)\n        birdMesh.rotation.y = Math.PI / 2\n        birdMesh.matrixAutoUpdate = false\n        birdMesh.updateMatrix()\n        this.scene.add(birdMesh)\n      },\n\n      fillPositionTexture(texture) {\n        const theArray = texture.image.data\n\n        for (let k = 0, kl = theArray.length; k < kl; k += 4) {\n          const x = Math.random() * this.BOUNDS - this.BOUNDS_HALF,\n            y = Math.random() * this.BOUNDS - this.BOUNDS_HALF,\n            z = Math.random() * this.BOUNDS - this.BOUNDS_HALF\n\n          theArray[k + 0] = x\n          theArray[k + 1] = y\n          theArray[k + 2] = z\n          theArray[k + 3] = 1\n        }\n      },\n\n      fillVelocityTexture(texture) {\n        const theArray = texture.image.data\n\n        for (let k = 0, kl = theArray.length; k < kl; k += 4) {\n          const x = Math.random() - 0.5,\n            y = Math.random() - 0.5,\n            z = Math.random() - 0.5\n\n          theArray[k + 0] = x * 10\n          theArray[k + 1] = y * 10\n          theArray[k + 2] = z * 10\n          theArray[k + 3] = 1\n        }\n      },\n\n      onWindowResize() {\n        const rerender = this.fixedHeight === null || this.fixedWidth === null\n        if (this.fixedHeight === null) {\n          this.worldHeight = Math.max(window.innerHeight, this.minHeight)\n        }\n        if (this.fixedWidth === null) {\n          this.worldWidth = Math.max(window.innerWidth, this.minWidth)\n        }\n        if (rerender && this.renderer) {\n          this.camera.aspect = this.worldWidth / this.worldHeight\n          this.camera.updateProjectionMatrix()\n          this.renderer.setSize(this.worldWidth, this.worldHeight)\n        }\n      },\n\n      onDocumentMouseMove(event) {\n        this.mouseX = event.clientX - this.windowHalfX - 200\n        this.mouseY = event.clientY - this.windowHalfY - 100\n      },\n\n      onDocumentTouchStart(event) {\n        if (event.touches.length === 1) {\n          //won't work if passive is false\n          // event.preventDefault()\n          this.mouseX = event.touches[0].pageX - this.windowHalfX\n          this.mouseY = event.touches[0].pageY - this.windowHalfY\n        }\n      },\n      onDocumentTouchMove(event) {\n        if (event.touches.length === 1) {\n          // event.preventDefault()\n          this.mouseX = event.touches[0].pageX - this.windowHalfX\n          this.mouseY = event.touches[0].pageY - this.windowHalfY\n        }\n      },\n      checkScrollDirectionIsUp(event) {\n        if (event.wheelDelta) {\n          return event.wheelDelta > 0\n        }\n        return event.deltaY < 0\n      },\n\n      //trying to make birds move with scroll\n      onDocumentScroll(event) {\n        if (!this.currScrollDir.down && !this.currScrollDir.up) {\n          this.scrollDirChanged = true\n        }\n        if (this.checkScrollDirectionIsUp(event)) {\n          if (this.currScrollDir.up && !this.currScrollDir.down) {\n            this.scrollDirChanged = false\n          }\n          if (!this.currScrollDir.up && this.currScrollDir.down) {\n            this.scrollDirChanged = true\n          }\n          this.currScrollDir.down = false\n          this.currScrollDir.up = true\n          this.mouseX = 0\n          this.mouseY = this.windowHalfY / 3\n        } else {\n          if (this.currScrollDir.down && !this.currScrollDir.up) {\n            this.scrollDirChanged = false\n          }\n          if (!this.currScrollDir.down && this.currScrollDir.up) {\n            this.scrollDirChanged = true\n          }\n          this.currScrollDir.down = true\n          this.currScrollDir.up = false\n          this.mouseX = 0\n          this.mouseY = -this.windowHalfY / 3\n        }\n      },\n\n      animate() {\n        this.animationReq = requestAnimationFrame(this.animate)\n        this.render()\n      },\n\n      destroy() {\n        document.removeEventListener('mousemove', this.onDocumentMouseMove, {\n          passive: false\n        })\n        document.removeEventListener('touchstart', this.onDocumentTouchStart, {\n          passive: false\n        })\n        document.removeEventListener('touchmove', this.onDocumentTouchMove, {\n          passive: false\n        })\n        document.removeEventListener('wheel', this.onDocumentScroll, {\n          passive: false\n        })\n        cancelAnimationFrame(this.animationReq)\n        this.renderer = null\n        this.scene = null\n      },\n\n      render() {\n        const now = window.performance.now()\n        let delta = (now - this.last) / 1000\n        if (delta > 1) delta = 1 // safety cap on large deltas\n        this.last = now\n\n        this.positionUniforms['time'].value = now\n        this.positionUniforms['delta'].value = delta\n        this.velocityUniforms['time'].value = now\n        this.velocityUniforms['delta'].value = delta\n        this.birdUniforms['time'].value = now\n        this.birdUniforms['delta'].value = delta\n\n        this.velocityUniforms['predator'].value.set(\n          (0.5 * this.mouseX) / this.windowHalfX,\n          (-0.5 * this.mouseY) / this.windowHalfY,\n          0\n        )\n\n        this.mouseX = 10000\n        this.mouseY = 10000\n\n        this.gpuCompute.compute()\n\n        this.birdUniforms[\n          'texturePosition'\n        ].value = this.gpuCompute.getCurrentRenderTarget(\n          this.positionVariable\n        ).texture\n        this.birdUniforms[\n          'textureVelocity'\n        ].value = this.gpuCompute.getCurrentRenderTarget(\n          this.velocityVariable\n        ).texture\n\n        this.renderer.render(this.scene, this.camera)\n      }\n    }\n  }\n</script>\n\n<style scoped>\n  .container {\n    position: absolute;\n    width: 100%;\n    top: 0;\n    bottom: 0;\n    overflow: hidden;\n  }\n</style>\n"]}, media: undefined });

    };
    /* scoped */
    var __vue_scope_id__ = "data-v-836e67ec";
    /* module identifier */
    var __vue_module_identifier__ = undefined;
    /* functional template */
    var __vue_is_functional_template__ = false;
    /* style inject SSR */
    
    /* style inject shadow dom */
    

    
    var __vue_component__ = normalizeComponent(
      { render: __vue_render__, staticRenderFns: __vue_staticRenderFns__ },
      __vue_inject_styles__,
      __vue_script__,
      __vue_scope_id__,
      __vue_is_functional_template__,
      __vue_module_identifier__,
      false,
      createInjector,
      undefined,
      undefined
    );

  exports.default = __vue_component__;

  Object.defineProperty(exports, '__esModule', { value: true });

})));
