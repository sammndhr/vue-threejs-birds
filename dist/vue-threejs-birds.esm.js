import { Scene, Camera, Mesh, PlaneBufferGeometry, ShaderMaterial, WebGLRenderTarget, RGBAFormat, HalfFloatType, FloatType, DataTexture, NearestFilter, ClampToEdgeWrapping, PerspectiveCamera, Color, Fog, WebGLRenderer, BufferGeometry, BufferAttribute, Vector3, RepeatWrapping, DoubleSide } from 'three';

// Source: https://github.com/mrdoob/three.js/blob/master/examples/jsm/misc/GPUComputationRenderer.js

var GPUComputationRenderer = function(sizeX, sizeY, renderer) {
	this.variables = [];

	this.currentTextureIndex = 0;

	var scene = new Scene();

	var camera = new Camera();
	camera.position.z = 1;

	var passThruUniforms = {
		passThruTexture: { value: null }
	};

	var passThruShader = createShaderMaterial(getPassThroughFragmentShader(), passThruUniforms);

	var mesh = new Mesh(new PlaneBufferGeometry(2, 2), passThruShader);
	scene.add(mesh);

	this.addVariable = function(variableName, computeFragmentShader, initialValueTexture) {
		var material = this.createShaderMaterial(computeFragmentShader);

		var variable = {
			name: variableName,
			initialValueTexture: initialValueTexture,
			material: material,
			dependencies: null,
			renderTargets: [],
			wrapS: null,
			wrapT: null,
			minFilter: NearestFilter,
			magFilter: NearestFilter
		};

		this.variables.push(variable);

		return variable
	};

	this.setVariableDependencies = function(variable, dependencies) {
		variable.dependencies = dependencies;
	};

	this.init = function() {
		if (!renderer.capabilities.isWebGL2 && !renderer.extensions.get('OES_texture_float')) {
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
			this.renderTexture(variable.initialValueTexture, variable.renderTargets[0]);
			this.renderTexture(variable.initialValueTexture, variable.renderTargets[1]);

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
							return 'Variable dependency not found. Variable=' + variable.name + ', dependency=' + depVar.name
						}
					}

					uniforms[depVar.name] = { value: null };

					material.fragmentShader = '\nuniform sampler2D ' + depVar.name + ';\n' + material.fragmentShader;
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

					uniforms[depVar.name].value = depVar.renderTargets[currentTextureIndex].texture;
				}
			}

			// Performs the computation for this variable
			this.doRenderTarget(variable.material, variable.renderTargets[nextTextureIndex]);
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
		materialShader.defines.resolution = 'vec2( ' + sizeX.toFixed(1) + ', ' + sizeY.toFixed(1) + ' )';
	}
	this.addResolutionDefine = addResolutionDefine;

	// The following functions can be used to compute things manually

	function createShaderMaterial(computeFragmentShader, uniforms) {
		uniforms = uniforms || {};

		var material = new ShaderMaterial({
			uniforms: uniforms,
			vertexShader: getPassThroughVertexShader(),
			fragmentShader: computeFragmentShader
		});

		addResolutionDefine(material);

		return material
	}

	this.createShaderMaterial = createShaderMaterial;

	this.createRenderTarget = function(sizeXTexture, sizeYTexture, wrapS, wrapT, minFilter, magFilter) {
		sizeXTexture = sizeXTexture || sizeX;
		sizeYTexture = sizeYTexture || sizeY;

		wrapS = wrapS || ClampToEdgeWrapping;
		wrapT = wrapT || ClampToEdgeWrapping;

		minFilter = minFilter || NearestFilter;
		magFilter = magFilter || NearestFilter;

		var renderTarget = new WebGLRenderTarget(sizeXTexture, sizeYTexture, {
			wrapS: wrapS,
			wrapT: wrapT,
			minFilter: minFilter,
			magFilter: magFilter,
			format: RGBAFormat,
			type: /(iPad|iPhone|iPod)/g.test(navigator.userAgent) ? HalfFloatType : FloatType,
			stencilBuffer: false,
			depthBuffer: false
		});

		return renderTarget
	};

	this.createTexture = function() {
		var data = new Float32Array(sizeX * sizeY * 4);
		return new DataTexture(data, sizeX, sizeY, RGBAFormat, FloatType)
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
		return 'void main()	{\n' + '\n' + '	gl_Position = vec4( position, 1.0 );\n' + '\n' + '}\n'
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
	name: 'ThreeTest',
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
			BIRDS: 1,
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
			scene: null,
			WIDTH: 32,
			worldWidth: window.innerWidth,
			worldHeight: window.innerHeight,
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
		if (this.canvasBgColor || this.canvasBgColor === 0) { this.bgColor = this.canvasBgColor; }
		this.BIRDS = Math.pow(Math.min(this.quantity, 200), 2); //My computer can't handle too many birdiez :(
		this.BirdGeometry = this.createBirdGeometry();
		this.init();
		this.animate();
	},

	beforeDestroy: function beforeDestroy() {
		this.destroy();
	},

	methods: {
		init: function() {
			this.container = this.$refs.birdContainer;
			this.camera = new PerspectiveCamera(75, this.worldWidth / this.worldHeight, 1, 3000);
			this.camera.position.z = 350;
			this.scene = new Scene();
			this.scene.background = new Color(this.bgColor);
			this.scene.fog = new Fog(0xffffff, 100, 1000);
			this.renderer = new WebGLRenderer();

			this.renderer.setPixelRatio(window.devicePixelRatio);
			this.renderer.setSize(this.worldWidth, this.worldHeight);
			this.container.appendChild(this.renderer.domElement);
			this.initComputeRenderer();

			document.addEventListener('mousemove', this.onDocumentMouseMove, false);
			document.addEventListener('touchstart', this.onDocumentTouchStart, false);
			document.addEventListener('touchmove', this.onDocumentTouchMove, false);
			window.addEventListener('resize', this.onWindowResize, false);

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
			var color1 = !this.color1 || this.color1 !== 0 ? 0x8bf329 : this.color1,
				color2 = !this.color2 || this.color1 !== 0 ? 0x298bf3 : this.color2,
				colorMode = this.colorMode[this.colorEffect],
				c1 = new Color(color1),
				c2 = new Color(color2),
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
				c = new Color(r2, g2, b2);
			} else if (colorMode.indexOf('mix') == 0) {
				// Naive color arithmetic
				c = new Color(color1 + dist * color2);
			} else {
				// Linear interpolation
				c = c1.lerp(c2, dist);
			}
			return c
		},

		createBirdGeometry: function createBirdGeometry() {
			var birdG = new BufferGeometry(),
				triangles = this.BIRDS * 3,
				points = triangles * 3,
				vertices = new BufferAttribute(new Float32Array(points * 3), 3),
				birdColors = new BufferAttribute(new Float32Array(points * 3), 3),
				references = new BufferAttribute(new Float32Array(points * 2), 2),
				birdVertex = new BufferAttribute(new Float32Array(points), 1),
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
			this.gpuCompute = new GPUComputationRenderer(this.WIDTH, this.WIDTH, this.renderer);

			var dtPosition = this.gpuCompute.createTexture(),
				dtVelocity = this.gpuCompute.createTexture();

			this.fillPositionTexture(dtPosition);
			this.fillVelocityTexture(dtVelocity);

			this.velocityVariable = this.gpuCompute.addVariable('textureVelocity', fragmentShaderVelocity, dtVelocity);
			this.positionVariable = this.gpuCompute.addVariable('texturePosition', fragmentShaderPosition, dtPosition);

			this.gpuCompute.setVariableDependencies(this.velocityVariable, [this.positionVariable, this.velocityVariable]);
			this.gpuCompute.setVariableDependencies(this.positionVariable, [this.positionVariable, this.velocityVariable]);

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
			this.velocityUniforms['predator'] = { value: new Vector3() };
			this.velocityVariable.material.defines.BOUNDS = this.BOUNDS.toFixed(2);
			this.velocityVariable.wrapS = RepeatWrapping;
			this.velocityVariable.wrapT = RepeatWrapping;
			this.positionVariable.wrapS = RepeatWrapping;
			this.positionVariable.wrapT = RepeatWrapping;

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
				color: { value: new Color(0xff2200) },
				texturePosition: { value: null },
				textureVelocity: { value: null },
				time: { value: 1.0 },
				delta: { value: 0.0 }
			};

			// THREE.ShaderMaterial
			var material = new ShaderMaterial({
				uniforms: this.birdUniforms,
				vertexShader: birdVS,
				fragmentShader: birdFS,
				side: DoubleSide
			});

			var birdMesh = new Mesh(geometry, material);
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
			if (rerender) {
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
				event.preventDefault();
				this.mouseX = event.touches[0].pageX - this.windowHalfX;
				this.mouseY = event.touches[0].pageY - this.windowHalfY;
			}
		},

		onDocumentTouchMove: function onDocumentTouchMove(event) {
			if (event.touches.length === 1) {
				event.preventDefault();
				this.mouseX = event.touches[0].pageX - this.windowHalfX;
				this.mouseY = event.touches[0].pageY - this.windowHalfY;
			}
		},

		animate: function animate() {
			this.animationReq = requestAnimationFrame(this.animate);
			this.render();
		},

		destroy: function destroy() {
			document.removeEventListener('mousemove', this.onDocumentMouseMove);
			document.removeEventListener('touchstart', this.onDocumentTouchStart);
			document.removeEventListener('touchmove', this.onDocumentTouchMove);
			window.removeEventListener('resize', this.onWindowResize);
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

			this.birdUniforms['texturePosition'].value = this.gpuCompute.getCurrentRenderTarget(
				this.positionVariable
			).texture;
			this.birdUniforms['textureVelocity'].value = this.gpuCompute.getCurrentRenderTarget(
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
    inject("data-v-1f4ca286_0", { source: "\n.container[data-v-1f4ca286] {\n\tposition: absolute;\n\twidth: 100%;\n\ttop: 0;\n\tbottom: 0;\n\toverflow: hidden;\n}\n", map: {"version":3,"sources":["/Users/samsaama/Desktop/CompSci/projects/vue-threejs-birds/src/components/Birds.vue"],"names":[],"mappings":";AAgcA;CACA,kBAAA;CACA,WAAA;CACA,MAAA;CACA,SAAA;CACA,gBAAA;AACA","file":"Birds.vue","sourcesContent":["<template>\n\t<div ref=\"birdContainer\" :style=\"dimensionsObj\" class=\"container\"></div>\n</template>\n\n<script>\n\timport * as THREE from 'three'\n\timport { GPUComputationRenderer } from './../assets/vendors/GPUComputationRenderer.js'\n\timport { fragmentShaderPosition, fragmentShaderVelocity, birdVS, birdFS } from '../utils/shaders.js'\n\timport '../utils/helpers.js'\n\n\texport default {\n\t\tname: 'ThreeTest',\n\t\tprops: {\n\t\t\tcanvasBgColor: [String, Number],\n\t\t\tcolor1: [String, Number],\n\t\t\tcolor2: [String, Number],\n\t\t\tcolorEffect: {\n\t\t\t\tdefault: 0,\n\t\t\t\ttype: Number,\n\t\t\t\trequired: false\n\t\t\t},\n\n\t\t\teffectController: {\n\t\t\t\tdefault: () => ({\n\t\t\t\t\tseparation: 20.0,\n\t\t\t\t\talignment: 20.0,\n\t\t\t\t\tcohesion: 20.0,\n\t\t\t\t\tfreedom: 0.75\n\t\t\t\t}),\n\t\t\t\ttype: Object,\n\t\t\t\trequired: false\n\t\t\t},\n\t\t\tfixedHeight: {\n\t\t\t\ttype: Number,\n\t\t\t\tdefault: null,\n\t\t\t\trequired: false\n\t\t\t},\n\t\t\tfixedWidth: {\n\t\t\t\ttype: Number,\n\t\t\t\tdefault: null,\n\t\t\t\trequired: false\n\t\t\t},\n\t\t\tminHeight: {\n\t\t\t\ttype: Number,\n\t\t\t\tdefault: null,\n\t\t\t\trequired: false\n\t\t\t},\n\t\t\tminWidth: {\n\t\t\t\ttype: Number,\n\t\t\t\tdefault: null,\n\t\t\t\trequired: false\n\t\t\t},\n\t\t\tquantity: {\n\t\t\t\tdefault: 32,\n\t\t\t\ttype: Number,\n\t\t\t\trequired: false\n\t\t\t},\n\t\t\twingsSpan: {\n\t\t\t\ttype: Number,\n\t\t\t\tdefault: 20,\n\t\t\t\trequired: false\n\t\t\t}\n\t\t},\n\n\t\tdata() {\n\t\t\treturn {\n\t\t\t\tanimationReq: null,\n\t\t\t\tBIRDS: 1,\n\t\t\t\tbgColor: 0xffffff,\n\t\t\t\tBirdGeometry: Object.create(null),\n\t\t\t\tbirdUniforms: null,\n\t\t\t\tBOUNDS: 800,\n\t\t\t\tBOUNDS_HALF: 800 / 2,\n\t\t\t\tcamera: null,\n\t\t\t\tcolorMode: {\n\t\t\t\t\t0: 'lerp',\n\t\t\t\t\t1: 'lerpGradient',\n\t\t\t\t\t2: 'variance',\n\t\t\t\t\t3: 'varianceGradient',\n\t\t\t\t\t4: 'mix'\n\t\t\t\t},\n\t\t\t\tcontainer: null,\n\t\t\t\tdimensionsObj: {},\n\t\t\t\tgpuCompute: null,\n\t\t\t\tlast: window.performance.now(),\n\t\t\t\tmouseY: 0,\n\t\t\t\tmouseX: 0,\n\t\t\t\tpositionVariable: {},\n\t\t\t\tpositionUniforms: {},\n\t\t\t\trenderer: null,\n\t\t\t\tscene: null,\n\t\t\t\tWIDTH: 32,\n\t\t\t\tworldWidth: window.innerWidth,\n\t\t\t\tworldHeight: window.innerHeight,\n\t\t\t\tvelocityUniforms: {},\n\t\t\t\tvelocityVariable: {}\n\t\t\t}\n\t\t},\n\n\t\tcomputed: {\n\t\t\twindowHalfX: function() {\n\t\t\t\treturn this.worldWidth / 2\n\t\t\t},\n\t\t\twindowHalfY: function() {\n\t\t\t\treturn this.worldHeight / 2\n\t\t\t}\n\t\t},\n\n\t\tmounted() {\n\t\t\tif (this.fixedHeight !== null) {\n\t\t\t\tthis.worldHeight = this.fixedHeight\n\t\t\t}\n\t\t\tif (this.fixedWidth !== null) {\n\t\t\t\tthis.worldWidth = this.fixedWidth\n\t\t\t}\n\t\t\tconst dimensions = {}\n\t\t\tif (this.minHeight) {\n\t\t\t\tdimensions.minHeight = this.minHeight + 'px'\n\t\t\t}\n\t\t\tif (this.minWidth) {\n\t\t\t\tdimensions.minWidth = this.minWidth + 'px'\n\t\t\t}\n\t\t\tthis.dimensionsObj = dimensions\n\t\t\tthis.worldHeight = Math.max(this.minHeight, this.worldHeight)\n\t\t\tthis.worldWidth = Math.max(this.minWidth, this.worldWidth)\n\n\t\t\t// black in binary is 0\n\t\t\tif (this.canvasBgColor || this.canvasBgColor === 0) this.bgColor = this.canvasBgColor\n\t\t\tthis.BIRDS = Math.pow(Math.min(this.quantity, 200), 2) //My computer can't handle too many birdiez :(\n\t\t\tthis.BirdGeometry = this.createBirdGeometry()\n\t\t\tthis.init()\n\t\t\tthis.animate()\n\t\t},\n\n\t\tbeforeDestroy() {\n\t\t\tthis.destroy()\n\t\t},\n\n\t\tmethods: {\n\t\t\tinit: function() {\n\t\t\t\tthis.container = this.$refs.birdContainer\n\t\t\t\tthis.camera = new THREE.PerspectiveCamera(75, this.worldWidth / this.worldHeight, 1, 3000)\n\t\t\t\tthis.camera.position.z = 350\n\t\t\t\tthis.scene = new THREE.Scene()\n\t\t\t\tthis.scene.background = new THREE.Color(this.bgColor)\n\t\t\t\tthis.scene.fog = new THREE.Fog(0xffffff, 100, 1000)\n\t\t\t\tthis.renderer = new THREE.WebGLRenderer()\n\n\t\t\t\tthis.renderer.setPixelRatio(window.devicePixelRatio)\n\t\t\t\tthis.renderer.setSize(this.worldWidth, this.worldHeight)\n\t\t\t\tthis.container.appendChild(this.renderer.domElement)\n\t\t\t\tthis.initComputeRenderer()\n\n\t\t\t\tdocument.addEventListener('mousemove', this.onDocumentMouseMove, false)\n\t\t\t\tdocument.addEventListener('touchstart', this.onDocumentTouchStart, false)\n\t\t\t\tdocument.addEventListener('touchmove', this.onDocumentTouchMove, false)\n\t\t\t\twindow.addEventListener('resize', this.onWindowResize, false)\n\n\t\t\t\tthis.updateControllerValues(this.effectController)\n\t\t\t\tthis.initBirds()\n\t\t\t},\n\n\t\t\tupdateControllerValues({ separation, alignment, cohesion, freedom }) {\n\t\t\t\tthis.velocityUniforms['separationDistance'].value = separation\n\t\t\t\tthis.velocityUniforms['alignmentDistance'].value = alignment\n\t\t\t\tthis.velocityUniforms['cohesionDistance'].value = cohesion\n\t\t\t\tthis.velocityUniforms['freedomFactor'].value = freedom\n\t\t\t},\n\n\t\t\tgetNewColor(order) {\n\t\t\t\tconst color1 = !this.color1 || this.color1 !== 0 ? 0x8bf329 : this.color1,\n\t\t\t\t\tcolor2 = !this.color2 || this.color1 !== 0 ? 0x298bf3 : this.color2,\n\t\t\t\t\tcolorMode = this.colorMode[this.colorEffect],\n\t\t\t\t\tc1 = new THREE.Color(color1),\n\t\t\t\t\tc2 = new THREE.Color(color2),\n\t\t\t\t\tgradient = colorMode.indexOf('Gradient') != -1\n\n\t\t\t\tlet c, dist\n\n\t\t\t\tif (gradient) {\n\t\t\t\t\t// each vertex has a different color\n\t\t\t\t\tdist = Math.random()\n\t\t\t\t} else {\n\t\t\t\t\t// each vertex has the same color\n\t\t\t\t\tdist = order\n\t\t\t\t}\n\n\t\t\t\tif (colorMode.indexOf('variance') == 0) {\n\t\t\t\t\tconst r2 = (c1.r + Math.random() * c2.r).clamp(0, 1),\n\t\t\t\t\t\tg2 = (c1.g + Math.random() * c2.g).clamp(0, 1),\n\t\t\t\t\t\tb2 = (c1.b + Math.random() * c2.b).clamp(0, 1)\n\t\t\t\t\tc = new THREE.Color(r2, g2, b2)\n\t\t\t\t} else if (colorMode.indexOf('mix') == 0) {\n\t\t\t\t\t// Naive color arithmetic\n\t\t\t\t\tc = new THREE.Color(color1 + dist * color2)\n\t\t\t\t} else {\n\t\t\t\t\t// Linear interpolation\n\t\t\t\t\tc = c1.lerp(c2, dist)\n\t\t\t\t}\n\t\t\t\treturn c\n\t\t\t},\n\n\t\t\tcreateBirdGeometry() {\n\t\t\t\tconst birdG = new THREE.BufferGeometry(),\n\t\t\t\t\ttriangles = this.BIRDS * 3,\n\t\t\t\t\tpoints = triangles * 3,\n\t\t\t\t\tvertices = new THREE.BufferAttribute(new Float32Array(points * 3), 3),\n\t\t\t\t\tbirdColors = new THREE.BufferAttribute(new Float32Array(points * 3), 3),\n\t\t\t\t\treferences = new THREE.BufferAttribute(new Float32Array(points * 2), 2),\n\t\t\t\t\tbirdVertex = new THREE.BufferAttribute(new Float32Array(points), 1),\n\t\t\t\t\tcolorCache = {}\n\n\t\t\t\tbirdG.setAttribute('position', vertices)\n\t\t\t\tbirdG.setAttribute('birdColor', birdColors)\n\t\t\t\tbirdG.setAttribute('reference', references)\n\t\t\t\tbirdG.setAttribute('birdVertex', birdVertex)\n\n\t\t\t\tlet v = 0\n\n\t\t\t\tfunction verts_push() {\n\t\t\t\t\tfor (let i = 0; i < arguments.length; i++) {\n\t\t\t\t\t\tvertices.array[v++] = arguments[i]\n\t\t\t\t\t}\n\t\t\t\t}\n\n\t\t\t\tfor (let f = 0; f < this.BIRDS; f++) {\n\t\t\t\t\t// Body\n\t\t\t\t\tverts_push(0, -0, -20, 0, 4, -20, 0, 0, 30)\n\t\t\t\t\t// Left Wing\n\t\t\t\t\tverts_push(0, 0, -15, -this.wingsSpan, 0, 0, 0, 0, 15)\n\t\t\t\t\t// Right Wing\n\t\t\t\t\tverts_push(0, 0, 15, this.wingsSpan, 0, 0, 0, 0, -15)\n\t\t\t\t}\n\n\t\t\t\tfor (let v = 0; v < triangles * 3; v++) {\n\t\t\t\t\tconst i = ~~(v / 3),\n\t\t\t\t\t\tx = (i % this.WIDTH) / this.WIDTH,\n\t\t\t\t\t\ty = ~~(i / this.WIDTH) / this.WIDTH,\n\t\t\t\t\t\torder = ~~(v / 9) / this.BIRDS,\n\t\t\t\t\t\tkey = order.toString(),\n\t\t\t\t\t\tgradient = true\n\t\t\t\t\tlet c\n\n\t\t\t\t\tif (!gradient && colorCache[key]) {\n\t\t\t\t\t\tc = colorCache[key]\n\t\t\t\t\t} else {\n\t\t\t\t\t\tc = this.getNewColor(order)\n\t\t\t\t\t}\n\t\t\t\t\tif (!gradient && !colorCache[key]) {\n\t\t\t\t\t\tcolorCache[key] = c\n\t\t\t\t\t}\n\n\t\t\t\t\tbirdColors.array[v * 3 + 0] = c.r\n\t\t\t\t\tbirdColors.array[v * 3 + 1] = c.g\n\t\t\t\t\tbirdColors.array[v * 3 + 2] = c.b\n\t\t\t\t\treferences.array[v * 2] = x\n\t\t\t\t\treferences.array[v * 2 + 1] = y\n\t\t\t\t\tbirdVertex.array[v] = v % 9\n\t\t\t\t}\n\n\t\t\t\tbirdG.scale(0.2, 0.2, 0.2)\n\t\t\t\treturn birdG\n\t\t\t},\n\n\t\t\tinitComputeRenderer() {\n\t\t\t\tthis.gpuCompute = new GPUComputationRenderer(this.WIDTH, this.WIDTH, this.renderer)\n\n\t\t\t\tconst dtPosition = this.gpuCompute.createTexture(),\n\t\t\t\t\tdtVelocity = this.gpuCompute.createTexture()\n\n\t\t\t\tthis.fillPositionTexture(dtPosition)\n\t\t\t\tthis.fillVelocityTexture(dtVelocity)\n\n\t\t\t\tthis.velocityVariable = this.gpuCompute.addVariable('textureVelocity', fragmentShaderVelocity, dtVelocity)\n\t\t\t\tthis.positionVariable = this.gpuCompute.addVariable('texturePosition', fragmentShaderPosition, dtPosition)\n\n\t\t\t\tthis.gpuCompute.setVariableDependencies(this.velocityVariable, [this.positionVariable, this.velocityVariable])\n\t\t\t\tthis.gpuCompute.setVariableDependencies(this.positionVariable, [this.positionVariable, this.velocityVariable])\n\n\t\t\t\tthis.positionUniforms = this.positionVariable.material.uniforms\n\t\t\t\tthis.velocityUniforms = this.velocityVariable.material.uniforms\n\n\t\t\t\tthis.positionUniforms['time'] = { value: 0.0 }\n\t\t\t\tthis.positionUniforms['delta'] = { value: 0.0 }\n\t\t\t\tthis.velocityUniforms['time'] = { value: 1.0 }\n\t\t\t\tthis.velocityUniforms['delta'] = { value: 0.0 }\n\t\t\t\tthis.velocityUniforms['testing'] = { value: 1.0 }\n\t\t\t\tthis.velocityUniforms['separationDistance'] = { value: 1.0 }\n\t\t\t\tthis.velocityUniforms['alignmentDistance'] = { value: 1.0 }\n\t\t\t\tthis.velocityUniforms['cohesionDistance'] = { value: 1.0 }\n\t\t\t\tthis.velocityUniforms['freedomFactor'] = { value: 1.0 }\n\t\t\t\tthis.velocityUniforms['predator'] = { value: new THREE.Vector3() }\n\t\t\t\tthis.velocityVariable.material.defines.BOUNDS = this.BOUNDS.toFixed(2)\n\t\t\t\tthis.velocityVariable.wrapS = THREE.RepeatWrapping\n\t\t\t\tthis.velocityVariable.wrapT = THREE.RepeatWrapping\n\t\t\t\tthis.positionVariable.wrapS = THREE.RepeatWrapping\n\t\t\t\tthis.positionVariable.wrapT = THREE.RepeatWrapping\n\n\t\t\t\tconst error = this.gpuCompute.init()\n\t\t\t\tif (error !== null) {\n\t\t\t\t\t/* eslint-disable no-console */\n\t\t\t\t\tconsole.error(error)\n\t\t\t\t}\n\t\t\t},\n\n\t\t\tinitBirds() {\n\t\t\t\tconst geometry = this.BirdGeometry\n\t\t\t\t// For Vertex and Fragment\n\t\t\t\tthis.birdUniforms = {\n\t\t\t\t\tcolor: { value: new THREE.Color(0xff2200) },\n\t\t\t\t\ttexturePosition: { value: null },\n\t\t\t\t\ttextureVelocity: { value: null },\n\t\t\t\t\ttime: { value: 1.0 },\n\t\t\t\t\tdelta: { value: 0.0 }\n\t\t\t\t}\n\n\t\t\t\t// THREE.ShaderMaterial\n\t\t\t\tconst material = new THREE.ShaderMaterial({\n\t\t\t\t\tuniforms: this.birdUniforms,\n\t\t\t\t\tvertexShader: birdVS,\n\t\t\t\t\tfragmentShader: birdFS,\n\t\t\t\t\tside: THREE.DoubleSide\n\t\t\t\t})\n\n\t\t\t\tconst birdMesh = new THREE.Mesh(geometry, material)\n\t\t\t\tbirdMesh.rotation.y = Math.PI / 2\n\t\t\t\tbirdMesh.matrixAutoUpdate = false\n\t\t\t\tbirdMesh.updateMatrix()\n\t\t\t\tthis.scene.add(birdMesh)\n\t\t\t},\n\n\t\t\tfillPositionTexture(texture) {\n\t\t\t\tconst theArray = texture.image.data\n\n\t\t\t\tfor (let k = 0, kl = theArray.length; k < kl; k += 4) {\n\t\t\t\t\tconst x = Math.random() * this.BOUNDS - this.BOUNDS_HALF,\n\t\t\t\t\t\ty = Math.random() * this.BOUNDS - this.BOUNDS_HALF,\n\t\t\t\t\t\tz = Math.random() * this.BOUNDS - this.BOUNDS_HALF\n\n\t\t\t\t\ttheArray[k + 0] = x\n\t\t\t\t\ttheArray[k + 1] = y\n\t\t\t\t\ttheArray[k + 2] = z\n\t\t\t\t\ttheArray[k + 3] = 1\n\t\t\t\t}\n\t\t\t},\n\n\t\t\tfillVelocityTexture(texture) {\n\t\t\t\tconst theArray = texture.image.data\n\n\t\t\t\tfor (let k = 0, kl = theArray.length; k < kl; k += 4) {\n\t\t\t\t\tconst x = Math.random() - 0.5,\n\t\t\t\t\t\ty = Math.random() - 0.5,\n\t\t\t\t\t\tz = Math.random() - 0.5\n\n\t\t\t\t\ttheArray[k + 0] = x * 10\n\t\t\t\t\ttheArray[k + 1] = y * 10\n\t\t\t\t\ttheArray[k + 2] = z * 10\n\t\t\t\t\ttheArray[k + 3] = 1\n\t\t\t\t}\n\t\t\t},\n\n\t\t\tonWindowResize() {\n\t\t\t\tconst rerender = this.fixedHeight === null || this.fixedWidth === null\n\t\t\t\tif (this.fixedHeight === null) {\n\t\t\t\t\tthis.worldHeight = Math.max(window.innerHeight, this.minHeight)\n\t\t\t\t}\n\t\t\t\tif (this.fixedWidth === null) {\n\t\t\t\t\tthis.worldWidth = Math.max(window.innerWidth, this.minWidth)\n\t\t\t\t}\n\t\t\t\tif (rerender) {\n\t\t\t\t\tthis.camera.aspect = this.worldWidth / this.worldHeight\n\t\t\t\t\tthis.camera.updateProjectionMatrix()\n\t\t\t\t\tthis.renderer.setSize(this.worldWidth, this.worldHeight)\n\t\t\t\t}\n\t\t\t},\n\n\t\t\tonDocumentMouseMove(event) {\n\t\t\t\tthis.mouseX = event.clientX - this.windowHalfX - 200\n\t\t\t\tthis.mouseY = event.clientY - this.windowHalfY - 100\n\t\t\t},\n\n\t\t\tonDocumentTouchStart(event) {\n\t\t\t\tif (event.touches.length === 1) {\n\t\t\t\t\tevent.preventDefault()\n\t\t\t\t\tthis.mouseX = event.touches[0].pageX - this.windowHalfX\n\t\t\t\t\tthis.mouseY = event.touches[0].pageY - this.windowHalfY\n\t\t\t\t}\n\t\t\t},\n\n\t\t\tonDocumentTouchMove(event) {\n\t\t\t\tif (event.touches.length === 1) {\n\t\t\t\t\tevent.preventDefault()\n\t\t\t\t\tthis.mouseX = event.touches[0].pageX - this.windowHalfX\n\t\t\t\t\tthis.mouseY = event.touches[0].pageY - this.windowHalfY\n\t\t\t\t}\n\t\t\t},\n\n\t\t\tanimate() {\n\t\t\t\tthis.animationReq = requestAnimationFrame(this.animate)\n\t\t\t\tthis.render()\n\t\t\t},\n\n\t\t\tdestroy() {\n\t\t\t\tdocument.removeEventListener('mousemove', this.onDocumentMouseMove)\n\t\t\t\tdocument.removeEventListener('touchstart', this.onDocumentTouchStart)\n\t\t\t\tdocument.removeEventListener('touchmove', this.onDocumentTouchMove)\n\t\t\t\twindow.removeEventListener('resize', this.onWindowResize)\n\t\t\t\tcancelAnimationFrame(this.animationReq)\n\t\t\t\tthis.renderer = null\n\t\t\t\tthis.scene = null\n\t\t\t},\n\n\t\t\trender() {\n\t\t\t\tconst now = window.performance.now()\n\t\t\t\tlet delta = (now - this.last) / 1000\n\t\t\t\tif (delta > 1) delta = 1 // safety cap on large deltas\n\t\t\t\tthis.last = now\n\n\t\t\t\tthis.positionUniforms['time'].value = now\n\t\t\t\tthis.positionUniforms['delta'].value = delta\n\t\t\t\tthis.velocityUniforms['time'].value = now\n\t\t\t\tthis.velocityUniforms['delta'].value = delta\n\t\t\t\tthis.birdUniforms['time'].value = now\n\t\t\t\tthis.birdUniforms['delta'].value = delta\n\n\t\t\t\tthis.velocityUniforms['predator'].value.set(\n\t\t\t\t\t(0.5 * this.mouseX) / this.windowHalfX,\n\t\t\t\t\t(-0.5 * this.mouseY) / this.windowHalfY,\n\t\t\t\t\t0\n\t\t\t\t)\n\t\t\t\tthis.mouseX = 10000\n\t\t\t\tthis.mouseY = 10000\n\t\t\t\tthis.gpuCompute.compute()\n\n\t\t\t\tthis.birdUniforms['texturePosition'].value = this.gpuCompute.getCurrentRenderTarget(\n\t\t\t\t\tthis.positionVariable\n\t\t\t\t).texture\n\t\t\t\tthis.birdUniforms['textureVelocity'].value = this.gpuCompute.getCurrentRenderTarget(\n\t\t\t\t\tthis.velocityVariable\n\t\t\t\t).texture\n\n\t\t\t\tthis.renderer.render(this.scene, this.camera)\n\t\t\t}\n\t\t}\n\t}\n</script>\n\n<style scoped>\n\t.container {\n\t\tposition: absolute;\n\t\twidth: 100%;\n\t\ttop: 0;\n\t\tbottom: 0;\n\t\toverflow: hidden;\n\t}\n</style>\n"]}, media: undefined });

  };
  /* scoped */
  var __vue_scope_id__ = "data-v-1f4ca286";
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

export default __vue_component__;
